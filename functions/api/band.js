// functions/api/band.js
// 밴드(band.us) 게시글 URL에서 이미지(최대3)·본문을 추출하고 OpenAI gpt-4o-mini로 상품 정보를 구조화해 반환
// + DALL-E로 AI 썸네일 생성 → Cloudflare R2에 업로드
// 환경변수: OPENAI_API_KEY, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_PUBLIC_URL

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const targetUrl = requestUrl.searchParams.get('url');

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  if (!targetUrl) return json({ error: 'url 파라미터가 필요합니다.' }, 400);

  let parsed;
  try { parsed = new URL(targetUrl); } catch (_) {
    return json({ error: '유효하지 않은 URL입니다.' }, 400);
  }

  if (!['band.us', 'www.band.us'].includes(parsed.hostname)) {
    return json({ error: '밴드(band.us) URL만 지원합니다.' }, 403);
  }

  // ── 1. 밴드 페이지 HTML 가져오기 ────────────────────────────────────────
  let html;
  try {
    const res = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Referer': 'https://www.band.us/',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) return json({ error: `밴드 페이지 접근 실패 (${res.status})` }, res.status);
    html = await res.text();
  } catch (err) {
    return json({ error: `네트워크 오류: ${err.message}` }, 500);
  }

  // ── 2. 이미지 최대 3개 추출 ─────────────────────────────────────────────
  const images = extractImages(html);
  if (images.length === 0) {
    return json({ error: '이미지를 찾을 수 없습니다. 비공개 게시글이거나 지원하지 않는 페이지입니다.' }, 404);
  }

  const ogTitle       = extractMeta(html, 'og:title')       || '';
  const ogDescription = extractMeta(html, 'og:description') || '';

  // ── 3. 본문 텍스트 추출 ─────────────────────────────────────────────────
  const bodyText = extractBodyText(html);

  console.log('[band.js] ogTitle len:', ogTitle.length, '|', ogTitle.slice(0, 80));
  console.log('[band.js] ogDesc  len:', ogDescription.length, '|', ogDescription.slice(0, 120));
  console.log('[band.js] bodyText len:', bodyText.length, '| preview:', bodyText.slice(0, 200));

  const fullBody = (bodyText && bodyText.length > ogTitle.length) ? bodyText : (ogTitle || bodyText || '');
  const aiInput = [
    fullBody      ? `게시글 본문:\n${fullBody}`       : '',
    ogDescription ? `게시글 요약: ${ogDescription}` : '',
  ].filter(Boolean).join('\n\n').trim();

  console.log('[band.js] aiInput len:', aiInput.length, '| full preview:\n', aiInput.slice(0, 400));

  const baseResult = {
    success: true,
    images,
    image_url: images[0],
    title: ogTitle,
    body_text: bodyText,
    ai: null,
  };

  if (aiInput.length < 10) {
    return json({ ...baseResult, ai_skipped: '분석할 텍스트 없음 (og:title·description·본문 모두 비어있음)' });
  }

  // ── 4. 룰 기반 추출 ─────────────────────────────────────────────────────
  const ruleResult = extractByRule(aiInput, ogTitle);
  console.log('[band.js] rule result:', JSON.stringify(ruleResult));

  const openaiKey = context.env?.OPENAI_API_KEY;

  // ── 5. OpenAI 텍스트 분석 ────────────────────────────────────────────────
  let aiResult = ruleResult.name ? ruleResult : null;
  let aiSource = 'rule';

  if (!openaiKey) {
    return json({
      ...baseResult,
      ai: aiResult,
      ai_skipped: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.',
    });
  }

  if (!ruleResult.name || !ruleResult.price) {
    console.log('[band.js] rule partial → calling OpenAI text');
    const postText = aiInput.slice(0, 2000);

    try {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          max_tokens: 400,
          messages: [
            {
              role: 'system',
              content: `너는 밴드 도매글에서 상품 정보를 추출하는 AI야. 반드시 아래 형식의 JSON으로만 응답해.
{
  "name": "상품명과 규격 (예: 무지개 망고 4kg, 국내산 한우 등심 1kg)",
  "price": "숫자만, 단위 없이 (예: 35000). 가격이 명시되지 않았더라도 본문에서 숫자와 '원'이 붙은 단어를 찾아 가장 유력한 판매가를 추측해라. 만원 단위(예: 3만원→30000, 3만5천→35000)도 변환해라. 끝까지 찾지 못하면 빈 문자열로 반환.",
  "description": "✅ [상품명] [규격] ➡️ [가격]원 ([배송비])\n\n핵심 특징 3줄 이내 요약 (이모지 사용)"
}`,
            },
            {
              role: 'user',
              content: `다음 밴드 게시글을 분석해줘:\n\n${postText}`,
            },
          ],
        }),
      });

      const aiJson = await aiRes.json();

      if (aiRes.ok) {
        const raw = aiJson.choices?.[0]?.message?.content;
        if (raw) {
          aiResult = JSON.parse(raw);
          aiSource = 'openai';
        }
      } else {
        console.error('[band.js] OpenAI text error:', aiRes.status, aiJson.error?.message);
      }
    } catch (aiErr) {
      console.error('[band.js] AI 텍스트 분석 실패:', aiErr.message);
    }
  } else {
    console.log('[band.js] rule-based success → AI text skipped');
  }

  // ── 6. 전화번호 + 판매자 링크 추출 → description에 추가 ──────────────────
  const phone = extractPhoneNumber(bodyText || ogDescription || '');
  const sellerLinks = extractSellerLinks(html);

  if (aiResult) {
    // ogTitle은 "산지직송.생산자직거래... : BAND Page" 같은 밴드 페이지 제목이라 상품명으로 쓰면 안 됨
    // AI/룰이 추출한 name만 사용
    aiResult.name = (aiResult.name || '').slice(0, 50);

    // 원문 전체 텍스트를 description으로 사용
    aiResult.description = fullBody || aiResult.description || '';

    // 전화번호 + 판매자 링크 추가
    if (phone) aiResult.description += `\n\n📞 ${phone}`;
    if (sellerLinks.length > 0) {
      aiResult.description += '\n\n🔗 판매자 링크:\n' + sellerLinks
        .map(u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
        .join('\n');
    }
  }

  // ── 7. DALL-E AI 썸네일 생성 + R2 업로드 ────────────────────────────────
  const productName = aiResult?.name || ogTitle || '';
  let aiThumbnailUrl = null;

  if (productName) {
    try {
      aiThumbnailUrl = await generateAndUploadThumbnail(productName, openaiKey, context.env);
      console.log('[band.js] AI 썸네일 생성 완료:', aiThumbnailUrl);
    } catch (thumbErr) {
      console.error('[band.js] 썸네일 생성 실패 (무시):', thumbErr.message);
    }
  }

  return json({
    ...baseResult,
    // AI 썸네일이 성공하면 image_url을 덮어씀 → 카드에 AI 이미지 표시
    image_url: aiThumbnailUrl || images[0],
    ai_thumbnail_url: aiThumbnailUrl,
    ai: aiResult,
    ai_source: aiSource,
  });
}

// ── AI 썸네일 생성 + R2 업로드 ───────────────────────────────────────────────
async function generateAndUploadThumbnail(productName, openaiKey, env) {
  // 1단계: 상품명 → DALL-E 프롬프트 생성
  const prompt = buildDallePrompt(productName);
  console.log('[thumbnail] DALL-E 프롬프트:', prompt);

  // 2단계: DALL-E로 이미지 생성
  const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'url',
    }),
  });

  if (!dalleRes.ok) {
    const err = await dalleRes.json().catch(() => ({}));
    throw new Error(`DALL-E 오류: ${err.error?.message || dalleRes.status}`);
  }

  const dalleJson = await dalleRes.json();
  const imageUrl = dalleJson.data?.[0]?.url;
  if (!imageUrl) throw new Error('DALL-E 이미지 URL 없음');

  // 3단계: DALL-E 이미지 다운로드
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`이미지 다운로드 실패: ${imgRes.status}`);
  const imgBuffer = await imgRes.arrayBuffer();

  // 4단계: R2에 업로드 (AWS S3 호환 API)
  const r2Url = await uploadToR2(imgBuffer, env);
  return r2Url;
}

// ── 상품명 → DALL-E 프롬프트 자동 생성 ──────────────────────────────────────
function buildDallePrompt(productName) {
  const name = productName.toLowerCase();

  // 카테고리별 프롬프트 매핑
  const prompts = {
    fruit: {
      keywords: ['사과', '배', '감귤', '귤', '한라봉', '망고', '딸기', '포도', '복숭아', '자두', '블루베리', '체리', '키위', '수박', '참외', '감', '밤', '골드', '시나노', '부사'],
      prompt: (n) => `Professional food photography of fresh ${n}, close-up shot showing vibrant colors and natural texture, water droplets on the surface, bright natural lighting, white clean background, high-end grocery advertisement style, appetizing, 4K`,
    },
    meat: {
      keywords: ['소고기', '돼지', '닭', '한우', '갈비', '삼겹', '목살', '등심', '안심', '차돌', '불고기', '갈비살', '육류'],
      prompt: (n) => `Professional food photography of premium Korean ${n}, beautifully marbled meat, close-up shot showing rich texture, dramatic studio lighting, dark slate background, high-end butcher shop advertisement style, appetizing, 4K`,
    },
    seafood: {
      keywords: ['생선', '새우', '전복', '굴', '조개', '오징어', '문어', '꽃게', '대게', '고등어', '갈치', '광어', '연어', '참치', '자반', '간고등어'],
      prompt: (n) => `Professional food photography of fresh Korean ${n}, glistening seafood, close-up shot on crushed ice, bright studio lighting, clean white background, premium seafood market advertisement style, appetizing, 4K`,
    },
    vegetable: {
      keywords: ['감자', '고구마', '양파', '마늘', '대파', '배추', '무', '당근', '토마토', '오이', '상추', '버섯', '고추', '브로콜리'],
      prompt: (n) => `Professional food photography of fresh organic Korean ${n}, vibrant colors, close-up shot with natural textures, bright natural lighting, rustic wooden background, farm-fresh market advertisement style, appetizing, 4K`,
    },
    juice: {
      keywords: ['즙', '주스', '사과즙', '진액', '엑기스', '음료'],
      prompt: (n) => `Professional product photography of premium Korean ${n} in elegant glass bottle, surrounded by fresh ingredients, bright studio lighting, white background, health food advertisement style, luxurious, 4K`,
    },
    rice: {
      keywords: ['쌀', '잡곡', '현미', '찹쌀'],
      prompt: (n) => `Professional food photography of premium Korean ${n}, grains scattered artistically, close-up macro shot showing texture, warm natural lighting, wooden bowl on rustic background, traditional Korean style, 4K`,
    },
    health: {
      keywords: ['홍삼', '비타민', '유산균', '건강', '영양제', '콜라겐'],
      prompt: (n) => `Professional product photography of premium Korean health supplement ${n}, elegant packaging, bright studio lighting, clean white background, health and wellness advertisement style, premium quality, 4K`,
    },
  };

  // 카테고리 매칭
  for (const [, cat] of Object.entries(prompts)) {
    if (cat.keywords.some(kw => name.includes(kw))) {
      return cat.prompt(productName);
    }
  }

  // 기본 프롬프트 (카테고리 미매칭)
  return `Professional food photography of premium Korean ${productName}, close-up shot with beautiful presentation, bright studio lighting, clean white background, high-end food advertisement style, appetizing, 4K`;
}

// ── R2 업로드 (AWS S3 호환 Signature V4) ─────────────────────────────────────
async function uploadToR2(imgBuffer, env) {
  const accessKeyId     = env?.R2_ACCESS_KEY_ID;
  const secretAccessKey = env?.R2_SECRET_ACCESS_KEY;
  const endpoint        = env?.R2_ENDPOINT;       // https://ACCOUNT_ID.r2.cloudflarestorage.com
  const publicUrl       = env?.R2_PUBLIC_URL;     // https://pub-xxxx.r2.dev
  const bucket          = 'hiddendeal-images';

  if (!accessKeyId || !secretAccessKey || !endpoint || !publicUrl) {
    throw new Error('R2 환경변수 미설정 (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_PUBLIC_URL)');
  }

  // 고유 파일명 생성
  const filename = `thumbnails/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const uploadUrl = `${endpoint}/${bucket}/${filename}`;

  // AWS Signature V4 서명
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // 20240325T123456Z
  const dateOnly = dateStr.slice(0, 8); // 20240325

  const region = 'auto';
  const service = 's3';

  // 1. 서명할 헤더 준비
  const host = new URL(endpoint).host;
  const contentType = 'image/png';
  const payloadHash = await sha256Hex(imgBuffer);

  const headers = {
    'host': host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': dateStr,
  };

  // 2. Canonical Request
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}`).join('\n') + '\n';
  const canonicalRequest = [
    'PUT',
    `/${bucket}/${filename}`,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // 3. String to Sign
  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateStr,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join('\n');

  // 4. Signing Key
  const signingKey = await getSigningKey(secretAccessKey, dateOnly, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  // 5. Authorization 헤더
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 6. R2에 PUT
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      ...headers,
      'Authorization': authorization,
      'Content-Length': String(imgBuffer.byteLength),
    },
    body: imgBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`R2 업로드 실패 (${uploadRes.status}): ${errText}`);
  }

  return `${publicUrl}/${filename}`;
}

// ── AWS Signature V4 헬퍼 ─────────────────────────────────────────────────────
async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key, message) {
  const msgBuf = new TextEncoder().encode(message);
  const sig = await crypto.subtle.sign('HMAC', key, msgBuf);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(key, message) {
  const keyBuf = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuf = new TextEncoder().encode(message);
  const imported = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', imported, msgBuf);
  return new Uint8Array(sig);
}

async function getSigningKey(secretKey, dateOnly, region, service) {
  const kDate    = await hmacKey(`AWS4${secretKey}`, dateOnly);
  const kRegion  = await hmacKey(kDate, region);
  const kService = await hmacKey(kRegion, service);
  const kSigning = await hmacKey(kService, 'aws4_request');
  return await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

// ── 전화번호 추출 ──────────────────────────────────────────────────────────
function extractPhoneNumber(text) {
  const m = text.match(/0[1][0-9][\s\-]?\d{3,4}[\s\-]?\d{4}|0[2-9]\d?[\s\-]\d{3,4}[\s\-]\d{4}/);
  return m ? m[0].replace(/\s+/g, '-').replace(/-{2,}/g, '-') : '';
}

// ── 판매자 외부 링크 추출 ───────────────────────────────────────────────────
function extractSellerLinks(html) {
  const links = [];
  const seen = new Set();
  const re = /href=["'](https?:\/\/[^\s"'<>]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    if (/band\.us|naver\.com\/(bandapp|help|notice|policy)|mobilecore|applinkstore|appsflyer|onelink/i.test(url)) continue;
    if (/smartstore\.naver|coupang|11st|gmarket|auction|instagram|open\.kakao|kakao\.com/i.test(url)) {
      seen.add(url);
      links.push(url);
    }
  }
  return links.slice(0, 3);
}

// ── 룰 기반 정규표현식 추출 ────────────────────────────────────────────────
function extractByRule(text, ogTitle) {
  let name = '';
  const bracketMatch = text.match(/[\[【]([^\]】]{2,30})[\]】]/);
  if (bracketMatch) {
    name = bracketMatch[1].trim();
  } else {
    const titleLine = ogTitle.split(/[\n\r]/)[0].trim();
    if (titleLine.length >= 2) {
      name = titleLine.slice(0, 60);
    } else {
      const firstLine = text.split('\n').find(l => l.trim().length > 4 && !/^게시글/.test(l.trim()));
      if (firstLine) name = firstLine.trim().slice(0, 60);
    }
  }

  let price = '';
  const pricePatterns = [
    /(?:판매가|공구가|특가|행사가|할인가|소비자가|경매가)\s*[:：]?\s*([\d,]+)\s*원?/,
    /(?:가격|금액|단가)\s*[:：]\s*([\d,]+)\s*원?/,
    /([\d,]+)\s*원\s*(?:\/|per|kg|개|박스|세트|묶음|마리|두|근)/,
    /\b([\d,]{4,})\s*원/,
    /(\d+)만\s*(\d+)?천?\s*원/,
  ];
  for (const re of pricePatterns) {
    const m = text.match(re);
    if (m) {
      if (re.source.includes('만')) {
        const man = parseInt(m[1] || '0', 10);
        const cheon = parseInt(m[2] || '0', 10);
        price = String(man * 10000 + cheon * 1000);
      } else {
        price = m[1].replace(/,/g, '');
      }
      break;
    }
  }

  let description = '';
  if (name && price) {
    let shipping = '문의';
    const shipMatch = text.match(/(?:배송비?|택배비)\s*[:：]?\s*([^\n,。]{1,20})/);
    if (shipMatch) shipping = shipMatch[1].trim();

    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5 && !/^게시글/.test(l))
      .slice(0, 3);

    description = `✅ ${name} ➡️ ${Number(price).toLocaleString()}원 (배송비: ${shipping})\n\n${lines.join('\n')}`;
  }

  return { name, price, description };
}

// ── 헬퍼 함수들 ─────────────────────────────────────────────────────────────

function extractMeta(html, property) {
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

function extractImages(html) {
  const seen = new Set();
  const results = [];

  function addImage(url) {
    if (!url || seen.has(url) || results.length >= 3) return;
    if (!/^https?:\/\/.+/i.test(url)) return;
    if (/profile|avatar|icon|logo|badge/i.test(url)) return;
    seen.add(url);
    results.push(url);
  }

  const ogImg = extractMeta(html, 'og:image');
  if (ogImg) addImage(ogImg);

  const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]+?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      collectPhotoUrls(nd, addImage, 0);
    } catch (_) { }
  }

  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRegex.exec(html)) !== null && results.length < 3) {
    const src = m[1];
    if (/band\.us\/photo|cdnImage|phinf\.naver|cdn\.band/i.test(src)) {
      addImage(src.startsWith('//') ? 'https:' + src : src);
    }
  }

  return results;
}

function collectPhotoUrls(obj, addImage, depth) {
  if (depth > 12 || !obj) return;
  if (typeof obj === 'string') {
    const isImage = /^https?:\/\/.+/i.test(obj) && (
      /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(obj) ||
      /photo|cdnImage|phinf|dthumb|cdn\.band/i.test(obj)
    );
    if (isImage) addImage(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectPhotoUrls(item, addImage, depth + 1);
    return;
  }
  if (typeof obj === 'object') {
    const IMG_KEYS = ['photo_url', 'url', 'src', 'thumbnail_url', 'image_url', 'original_url', 'large_url'];
    for (const key of IMG_KEYS) {
      if (typeof obj[key] === 'string') collectPhotoUrls(obj[key], addImage, depth + 1);
    }
    for (const [key, val] of Object.entries(obj)) {
      if (!IMG_KEYS.includes(key)) collectPhotoUrls(val, addImage, depth + 1);
    }
  }
}

function extractBodyText(html) {
  const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]+?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      const candidate = findKoreanBody(nd, 0);
      if (candidate && candidate.length > 20) return candidate;
    } catch (_) { }
  }

  const ogDesc = extractMeta(html, 'og:description');
  if (ogDesc && ogDesc.length > 10) return ogDesc;

  const paragraphs = [];
  const pMatches = html.matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi);
  for (const m of pMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 15 && /[\uAC00-\uD7A3]/.test(text)) paragraphs.push(text);
  }
  if (paragraphs.length > 0) return paragraphs.join('\n');

  return '';
}

function findKoreanBody(obj, depth) {
  if (depth > 15 || !obj || typeof obj !== 'object') return null;
  const BODY_KEYS = new Set(['body', 'content', 'text', 'caption', 'message', 'postBody', 'post_body']);
  let best = null;

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string' && val.length > 50 && /[\uAC00-\uD7A3]/.test(val)) {
      if (BODY_KEYS.has(key.toLowerCase()) && val.length > (best?.length || 0)) {
        best = val;
      }
    } else if (val && typeof val === 'object') {
      const found = findKoreanBody(val, depth + 1);
      if (found && found.length > (best?.length || 0)) best = found;
    }
  }
  return best;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
