// functions/api/band.js
// 밴드(band.us) 게시글 URL에서 이미지·본문을 추출하고 AI로 상품 정보를 구조화해 반환
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

  // ── 2. OG 메타 태그 추출 ────────────────────────────────────────────────
  const ogImage = extractMeta(html, 'og:image');
  const ogTitle = extractMeta(html, 'og:title') || '';

  if (!ogImage) {
    return json({ error: '이미지를 찾을 수 없습니다. 비공개 게시글이거나 지원하지 않는 페이지입니다.' }, 404);
  }

  // ── 3. 본문 텍스트 추출 ─────────────────────────────────────────────────
  const bodyText = extractBodyText(html);

  // AI 분석 없이도 기본 데이터는 반환
  const baseResult = { success: true, image_url: ogImage, title: ogTitle, body_text: bodyText, ai: null };

  if (!bodyText || bodyText.length < 10) {
    return json({ ...baseResult, ai_skipped: 'body_too_short' });
  }

  // ── 4. Gemini API로 상품 정보 구조화 ────────────────────────────────────
  const geminiKey = context.env?.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!geminiKey) {
    return json({ ...baseResult, ai_skipped: 'GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  const SYSTEM_PROMPT = `당신은 농수산물 직거래 밴드 게시글 분석 전문가입니다.
아래 게시글 텍스트에서 상품 정보를 추출해 반드시 아래 JSON 형식으로만 응답하세요.

{
  "name": "상품명 (간결하게 30자 이내, 예: 제주 무농약 감귤 5kg)",
  "price": "가장 낮은 가격 (배송비 제외, 원문 그대로, 예: 35,000원/kg 또는 5만원)",
  "shipping": "배송비 정보 (예: 무료, 3,000원, 착불, 5만원 이상 무료 등)",
  "description": "상세 설명 (이모지와 줄바꿈 포함, 400자 이내, 아래 형식 참고)"
}

description 형식 예시:
🥬 상품명: 제주 무농약 감귤
📦 규격: 5kg / 10kg 박스
💰 가격: 35,000원 (5kg 기준)
🚚 배송비: 3,000원 (5만원 이상 무료)
📝 특징:
- 무농약 인증 (인증번호: 제주-2024-001)
- 당일 수확 당일 발송
📞 주문/문의: 댓글 또는 쪽지

JSON만 응답하고 다른 텍스트는 절대 포함하지 마세요.`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          { role: 'user', parts: [{ text: bodyText.slice(0, 2000) }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 600,
        },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      return json({ ...baseResult, ai_skipped: `Gemini 오류 (${aiRes.status}): ${errText.slice(0, 200)}` });
    }

    const aiData = await aiRes.json();
    const raw = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return json({ ...baseResult, ai_skipped: 'AI 응답이 비어있습니다.' });

    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) {
      return json({ ...baseResult, ai_skipped: 'AI 응답 파싱 실패', ai_raw: raw });
    }

    return json({ ...baseResult, ai: parsed });
  } catch (err) {
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

// __NEXT_DATA__ JSON 트리에서 한국어 본문이 담긴 필드를 BFS 탐색
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
      if (found) return found; // 깊이 우선
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
