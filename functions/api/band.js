// functions/api/band.js
// 밴드(band.us) 게시글 URL에서 이미지(최대3)·본문을 추출하고 OpenAI gpt-4o-mini로 상품 정보를 구조화해 반환
// 환경변수: OPENAI_API_KEY (Cloudflare Pages → Settings → Environment variables)

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

  // ── 2. 이미지 최대 3개 추출 (OG + __NEXT_DATA__ photo 배열) ─────────────
  const images = extractImages(html); // 원본 URL 배열 (프록시 미적용)
  if (images.length === 0) {
    return json({ error: '이미지를 찾을 수 없습니다. 비공개 게시글이거나 지원하지 않는 페이지입니다.' }, 404);
  }

  const ogTitle       = extractMeta(html, 'og:title')       || '';
  const ogDescription = extractMeta(html, 'og:description') || '';

  // ── 3. 본문 텍스트 추출 ─────────────────────────────────────────────────
  const bodyText = extractBodyText(html);

  // 디버그 로그 (Cloudflare Pages 로그에서 확인 가능)
  console.log('[band.js] ogTitle len:', ogTitle.length, '|', ogTitle.slice(0, 80));
  console.log('[band.js] ogDesc  len:', ogDescription.length, '|', ogDescription.slice(0, 120));
  console.log('[band.js] bodyText len:', bodyText.length, '| preview:', bodyText.slice(0, 200));

  // og:title / og:description / bodyText 중 하나라도 있으면 AI에 전달
  const aiInput = [
    ogTitle       ? `게시글 제목: ${ogTitle}`       : '',
    ogDescription ? `게시글 요약: ${ogDescription}` : '',
    bodyText      ? `게시글 본문:\n${bodyText}`      : '',
  ].filter(Boolean).join('\n\n').trim();

  console.log('[band.js] aiInput len:', aiInput.length, '| full preview:\n', aiInput.slice(0, 400));

  // 기본 응답 (AI 없이도 이미지는 반환)
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

  // ── 4. 1순위: 룰 기반 정규표현식 추출 (API 비용 0원) ─────────────────────
  const ruleResult = extractByRule(aiInput, ogTitle);
  console.log('[band.js] rule result:', JSON.stringify(ruleResult));

  // name + price 모두 추출됐으면 AI 호출 없이 바로 반환
  if (ruleResult.name && ruleResult.price) {
    console.log('[band.js] rule-based success → AI skipped');
    return json({ ...baseResult, ai: ruleResult, ai_source: 'rule' });
  }

  // ── 5. 2순위: OpenAI gpt-4o-mini (룰 실패 시에만 호출) ───────────────────
  const openaiKey = context.env?.OPENAI_API_KEY;
  if (!openaiKey) {
    // AI 키 없으면 룰 결과라도 반환
    return json({
      ...baseResult,
      ai: ruleResult.name ? ruleResult : null,
      ai_skipped: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.',
    });
  }

  console.log('[band.js] rule partial → calling OpenAI');
  const postText = aiInput.slice(0, 2000); // 토큰 절약: 2500→2000

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
        max_tokens: 400, // 토큰 절약: 필드 3개만 추출
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

    if (!aiRes.ok) {
      const errMsg = aiJson.error?.message || `HTTP ${aiRes.status}`;
      console.error('[band.js] OpenAI API error:', aiRes.status, errMsg);
      return json({
        ...baseResult,
        ai_error: true,
        ai: ruleResult.name ? ruleResult : null,
        ai_skipped: `OpenAI 오류: ${errMsg}`,
      });
    }

    const raw = aiJson.choices?.[0]?.message?.content;
    if (!raw) {
      return json({ ...baseResult, ai_error: true, ai_skipped: 'AI 응답이 비어있습니다.' });
    }

    const parsedData = JSON.parse(raw);
    return json({ ...baseResult, ai: parsedData, ai_source: 'openai' });
  } catch (aiErr) {
    console.error('[band.js] AI 분석 실패:', aiErr.message);
    return json({
      success: true,
      ai_error: true,
      image_url: images[0] || null,
      images,
      title: ogTitle,
      body_text: bodyText,
      ai: ruleResult.name ? ruleResult : null,
    });
  }
}

// ── 룰 기반 정규표현식 추출 ────────────────────────────────────────────────
// 비용 없이 name·price·description을 뽑아낸다.
// name + price 모두 성공하면 AI 호출을 건너뜀.
function extractByRule(text, ogTitle) {
  // ── 이름 추출: [] 또는 【】 안의 텍스트 우선, 없으면 og:title 전체 사용
  let name = '';
  const bracketMatch = text.match(/[\[【]([^\]】]{2,30})[\]】]/);
  if (bracketMatch) {
    name = bracketMatch[1].trim();
  } else {
    // og:title 또는 본문 첫 의미있는 줄 사용 (길이 제한 완화: 60자)
    const titleLine = ogTitle.split(/[\n\r]/)[0].trim();
    if (titleLine.length >= 2) {
      name = titleLine.slice(0, 60);
    } else {
      // og:title도 없으면 본문 첫 줄
      const firstLine = text.split('\n').find(l => l.trim().length > 4 && !/^게시글/.test(l.trim()));
      if (firstLine) name = firstLine.trim().slice(0, 60);
    }
  }

  // ── 가격 추출: 패턴 우선순위 확대
  let price = '';
  const pricePatterns = [
    /(?:판매가|공구가|특가|행사가|할인가|소비자가|경매가)\s*[:：]?\s*([\d,]+)\s*원?/,
    /(?:가격|금액|단가)\s*[:：]\s*([\d,]+)\s*원?/,
    /([\d,]+)\s*원\s*(?:\/|per|kg|개|박스|세트|묶음|마리|두|근)/,
    /\b([\d,]{4,})\s*원/,
    // 만원 단위: "3만원", "3만5천원"
    /(\d+)만\s*(\d+)?천?\s*원/,
  ];
  for (const re of pricePatterns) {
    const m = text.match(re);
    if (m) {
      if (re.source.includes('만')) {
        // 만원 단위 변환: "3만5천원" → 35000
        const man = parseInt(m[1] || '0', 10);
        const cheon = parseInt(m[2] || '0', 10);
        price = String(man * 10000 + cheon * 1000);
      } else {
        price = m[1].replace(/,/g, '');
      }
      break;
    }
  }

  // ── 간단한 description 조합 (룰 성공 시 AI 없이 표시할 용도)
  let description = '';
  if (name && price) {
    // 배송비 추출
    let shipping = '문의';
    const shipMatch = text.match(/(?:배송비?|택배비)\s*[:：]?\s*([^\n,。]{1,20})/);
    if (shipMatch) shipping = shipMatch[1].trim();

    // 본문 첫 의미있는 줄 최대 3개
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

// 밴드 페이지에서 이미지 URL 최대 3개 추출 (원본 URL만 반환, 프록시 변환 없음)
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

  // 1순위: og:image 메타 태그
  const ogImg = extractMeta(html, 'og:image');
  if (ogImg) addImage(ogImg);

  // 2순위: __NEXT_DATA__ JSON에서 photo_url, url, src 키를 DFS로 탐색
  const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]+?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      collectPhotoUrls(nd, addImage, 0);
    } catch (_) { /* fall through */ }
  }

  // 3순위: <img> 태그 중 band.us/photo 또는 cdnImage 포함된 src
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

// __NEXT_DATA__ 트리에서 이미지 URL 수집 (BFS, 이미지 관련 키 우선)
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
    // 이미지 URL 관련 키 우선순위: photo_url > url > src
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
  // 우선순위 1: __NEXT_DATA__ JSON에서 한국어 본문 필드 탐색
  const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]+?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      const candidate = findKoreanBody(nd, 0);
      if (candidate && candidate.length > 20) return candidate;
    } catch (_) { /* fall through */ }
  }

  // 우선순위 2: og:description (보통 본문 앞 200자)
  const ogDesc = extractMeta(html, 'og:description');
  if (ogDesc && ogDesc.length > 10) return ogDesc;

  // 우선순위 3: <p> 태그 텍스트 합산
  const paragraphs = [];
  const pMatches = html.matchAll(/<p[^>]*>([\s\S]+?)<\/p>/gi);
  for (const m of pMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 15 && /[\uAC00-\uD7A3]/.test(text)) paragraphs.push(text);
  }
  if (paragraphs.length > 0) return paragraphs.join('\n');

  return '';
}

// __NEXT_DATA__ JSON 트리에서 한국어 본문이 담긴 필드를 DFS 탐색
function findKoreanBody(obj, depth) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;
  const BODY_KEYS = new Set(['body', 'content', 'text', 'caption', 'description', 'message', 'postBody', 'post_body']);
  const candidates = [];

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string' && val.length > 20 && /[\uAC00-\uD7A3]/.test(val)) {
      if (BODY_KEYS.has(key.toLowerCase())) {
        candidates.push({ val, depth });
      }
    } else if (val && typeof val === 'object') {
      const found = findKoreanBody(val, depth + 1);
      if (found) return found;
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.val.length - a.val.length);
    return candidates[0].val;
  }
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
