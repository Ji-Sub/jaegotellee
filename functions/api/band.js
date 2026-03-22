// functions/api/band.js
// 밴드(band.us) 게시글 URL에서 OG 이미지·제목·설명을 추출해 JSON으로 반환

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

  if (!targetUrl) {
    return json({ error: 'url 파라미터가 필요합니다.' }, 400);
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    return json({ error: '유효하지 않은 URL입니다.' }, 400);
  }

  if (!['band.us', 'www.band.us'].includes(parsed.hostname)) {
    return json({ error: '밴드(band.us) URL만 지원합니다.' }, 403);
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.band.us/',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      return json({ error: `밴드 페이지 접근 실패 (${response.status})` }, response.status);
    }

    const html = await response.text();

    // OG 메타 태그에서 이미지/제목/설명 추출 (속성 순서 무관하게 두 가지 패턴 모두 시도)
    const ogImage = extractMeta(html, 'og:image');
    const ogTitle = extractMeta(html, 'og:title');
    const ogDesc  = extractMeta(html, 'og:description');

    if (!ogImage) {
      return json({ error: '이미지를 찾을 수 없습니다. 비공개 게시글이거나 지원하지 않는 페이지입니다.' }, 404);
    }

    return json({ success: true, image_url: ogImage, title: ogTitle || '', description: ogDesc || '' }, 200);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

function extractMeta(html, property) {
  // <meta property="og:image" content="...">
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  // <meta content="..." property="og:image">
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
