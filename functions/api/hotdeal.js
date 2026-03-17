// functions/api/hotdeal.js
// hotdeal.zip 및 외부 커뮤니티(뽐뿌 등)에서 HTML을 가져오는 CORS 우회 프록시.
// EUC-KR 인코딩으로 서비스되는 사이트(뽐뿌 등)를 TextDecoder로 명시 디코딩합니다.
export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const page = requestUrl.searchParams.get('page') || '1';
  const targetUrl = requestUrl.searchParams.get('url') || `https://hotdeal.zip/api/deals.php?page=${page}&category=all`;

  // OPTIONS preflight 처리
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Referer': 'https://hotdeal.zip/',
        'Cache-Control': 'no-cache',
      }
    });

    // 응답 본문을 바이너리(ArrayBuffer)로 수신 — EUC-KR 대응을 위해 무조건 binary로 읽음
    const buffer = await response.arrayBuffer();

    // ── 인코딩 판별 ──────────────────────────────────────────────────────────
    // 1. Content-Type 헤더에 euc-kr/ks_c_5601 등이 명시된 경우
    // 2. 요청 URL이 ppomppu.co.kr인 경우 (뽐뿌는 항상 EUC-KR)
    const contentType = response.headers.get('content-type') || '';
    const isEucKr =
      /euc-kr|ks_c_5601|euc_kr/i.test(contentType) ||
      targetUrl.includes('ppomppu.co.kr');

    let htmlText;
    if (isEucKr) {
      // EUC-KR로 명시적 디코딩 (TextDecoder는 Cloudflare Workers에서 지원됨)
      htmlText = new TextDecoder('euc-kr').decode(buffer);
    } else {
      // 기본 UTF-8 디코딩
      htmlText = new TextDecoder('utf-8').decode(buffer);
    }

    return new Response(htmlText, {
      status: response.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
