// functions/api/band.js
// 밴드(band.us) 게시글 URL에서 이미지(최대3)·본문을 추출하고 Gemini로 상품 정보를 구조화해 반환
// 환경변수: GOOGLE_GENERATIVE_AI_API_KEY (Cloudflare Pages → Settings → Environment variables)

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

  const ogTitle = extractMeta(html, 'og:title') || '';

  // ── 3. 본문 텍스트 추출 ─────────────────────────────────────────────────
  const bodyText = extractBodyText(html);

  // 기본 응답 (AI 없이도 이미지는 반환)
  const baseResult = {
    success: true,
    images,               // 원본 이미지 URL 배열 (클라이언트에서 프록시 붙임)
    image_url: images[0], // 하위 호환성용 첫 이미지
    title: ogTitle,
    body_text: bodyText,
    ai: null,
  };

  if (!bodyText || bodyText.length < 10) {
    return json({ ...baseResult, ai_skipped: 'body_too_short' });
  }

  // ── 4. Gemini API로 상품 정보 구조화 ────────────────────────────────────
  const geminiKey = context.env?.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!geminiKey) {
    return json({ ...baseResult, ai_skipped: 'GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  // 뚝형 스타일 프롬프트 ─────────────────────────────────────────────────
  const SYSTEM_PROMPT = `당신은 한국 농수산물 직거래 밴드 게시글 분석 전문가입니다.
아래 게시글 텍스트에서 상품 정보를 추출해 반드시 아래 JSON 형식으로만 응답하세요.

{
  "name": "최적화 제목 한 줄 (상품명 + 규격/중량 + 배송비 조건을 조합, 예: [무료배송] 제주 황금향 5kg, [항공직송] 무지개 망고 4kg (착불))",
  "price": "최저 가격 숫자만 (배송비 제외, 콤마 포함, 원 단위 표시, 예: 35,000원 또는 3,500원/kg)",
  "shipping": "배송비 정보 (예: 무료, 3,000원, 착불, 5만원 이상 무료)",
  "description": "반드시 첫 줄에 name과 동일한 제목을 쓰고, 빈 줄 한 줄 후 아래 형식으로 상세 내용 작성 (400자 이내)"
}

description 형식 예시 (이 형식을 반드시 따르세요):
[무료배송] 제주 황금향 5kg

🍊 상품: 제주 황금향
📦 규격: 5kg / 10kg 선택 가능
💰 가격: 35,000원 (5kg 기준)
🚚 배송: 무료 (전국)
📝 특징:
- 당도 13브릭스 이상 보장
- 당일 수확 당일 발송
- 산지 직송 (제주 서귀포)
📞 주문/문의: 댓글 또는 쪽지로 연락주세요

name 작성 규칙:
- 특이사항(항공직송/유기농/무농약/국내산 등)이 있으면 앞에 [태그] 형태로 붙이기
- 중량/규격은 반드시 포함
- 무료배송이면 (무료배송) 또는 [무료배송] 형태로 표시
- 착불이면 끝에 (착불) 표시
- 30자를 넘지 않도록 간결하게

JSON만 응답하고 다른 텍스트는 절대 포함하지 마세요.`;

  try {
    // gemini-2.0-flash: 2025/2026 기준 최신 모델, 무료 할당량 제공
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;

    // systemInstruction 대신 system 역할을 user 메시지 앞에 합침 (전 버전 호환)
    const userContent = `${SYSTEM_PROMPT}\n\n---\n\n아래 게시글을 분석해주세요:\n\n${bodyText.slice(0, 2000)}`;

    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey, // URL 쿼리 파라미터와 이중 인증 (호환성)
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: userContent }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 700,
        },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[Gemini API error]', aiRes.status, errText);
      return json({
        ...baseResult,
        ai_skipped: `Gemini 오류 (${aiRes.status}): ${errText.slice(0, 300)}`,
      });
    }

    const aiData = await aiRes.json();
    const raw = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return json({ ...baseResult, ai_skipped: 'AI 응답이 비어있습니다.' });

    let aiParsed;
    try { aiParsed = JSON.parse(raw); } catch (_) {
      return json({ ...baseResult, ai_skipped: 'AI 응답 파싱 실패', ai_raw: raw });
    }

    return json({ ...baseResult, ai: aiParsed });
  } catch (err) {
    console.error('[Gemini fetch error]', err);
    return json({ ...baseResult, ai_skipped: `AI 호출 오류: ${err.message}` });
  }
}

// ── 헬퍼 함수들 ─────────────────────────────────────────────────────────────

function extractMeta(html, property) {
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

// 밴드 페이지에서 이미지 URL 최대 3개 추출
function extractImages(html) {
  const seen = new Set();
  const results = [];

  function addImage(url) {
    if (!url || seen.has(url) || results.length >= 3) return;
    if (!/^https?:\/\/.+/i.test(url)) return;
    // 아이콘·프로필 사진은 제외 (너무 작거나 profile/avatar 경로)
    if (/profile|avatar|icon|logo|badge/i.test(url)) return;
    seen.add(url);
    results.push(url);
  }

  // 우선순위 1: __NEXT_DATA__ JSON에서 photo 배열 탐색
  const ndMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]+?)<\/script>/i);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      collectPhotoUrls(nd, addImage, 0);
    } catch (_) { /* fall through */ }
  }

  // 우선순위 2: og:image 메타 태그
  const ogImg = extractMeta(html, 'og:image');
  if (ogImg) addImage(ogImg);

  return results;
}

// __NEXT_DATA__ 트리에서 이미지 URL 수집 (BFS, 이미지 관련 키 우선)
function collectPhotoUrls(obj, addImage, depth) {
  if (depth > 12 || !obj) return;
  if (typeof obj === 'string') {
    if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?[^"']*)?$/i.test(obj)) addImage(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectPhotoUrls(item, addImage, depth + 1);
    return;
  }
  if (typeof obj === 'object') {
    // 이미지 URL 관련 키 먼저 처리
    const IMG_KEYS = ['url', 'photo_url', 'thumbnail_url', 'image_url', 'src', 'original_url', 'large_url'];
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
