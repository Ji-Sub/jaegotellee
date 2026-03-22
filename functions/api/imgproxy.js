// functions/api/imgproxy.js
// 외부 이미지(밴드·네이버 CDN 등)를 서버 사이드에서 가져와 바이너리로 반환
// 네이버 핫링크 차단 및 CORS 우회용

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const targetUrl = requestUrl.searchParams.get('url');

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (!targetUrl) {
    return new Response('url 파라미터가 필요합니다.', { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    return new Response('유효하지 않은 URL입니다.', { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new Response('허용되지 않는 프로토콜입니다.', { status: 400 });
  }

  // 네이버·밴드 계열 CDN일 때 Referer를 band.us로 위장, 그 외는 도메인 자신
  const isBandOrNaver =
    parsed.hostname.includes('naver') ||
    parsed.hostname.includes('band.us') ||
    parsed.hostname.includes('pstatic') ||
    parsed.hostname.includes('dthumb') ||
    parsed.hostname.includes('storep') ||
    parsed.hostname.includes('cdn.band');

  const referer = isBandOrNaver
    ? 'https://www.band.us/'
    : `${parsed.protocol}//${parsed.hostname}/`;

  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': referer,
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
    });

    if (!response.ok) {
      return new Response(`이미지 가져오기 실패 (${response.status})`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // 실제 이미지 타입인지 확인 (HTML 응답 차단)
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return new Response('이미지가 아닌 응답입니다.', { status: 400 });
    }

    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': 'inline',
        // CORS / 보안 헤더
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Timing-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        // 캐시
        'Cache-Control': 'public, max-age=86400',
        'Vary': 'Origin',
      },
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
