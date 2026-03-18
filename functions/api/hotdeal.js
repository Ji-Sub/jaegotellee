// functions/api/hotdeal.js
// hotdeal.zip 및 외부 커뮤니티(뽐뿌 등)에서 HTML을 가져오는 CORS 우회 프록시입니다.
// 1) EUC-KR 인코딩으로 서비스되는 사이트(뽐뿌 등)를 TextDecoder로 명시 디코딩하고,
// 2) 최신 크롬 브라우저의 User-Agent를 사용해 "사람이 접속한 것처럼" 위장합니다.
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
    // ── User-Agent 위장 ──────────────────────────────────────────────────────
    // 일부 커뮤니티/쇼핑몰은 봇(User-Agent가 fetch/worker 등)으로 보이는 요청을
    // 바로 차단하거나, 본문/이미지를 숨긴 축약 페이지를 내려보냅니다.
    // 최신 크롬 데스크톱 UA 문자열을 그대로 사용해 최대한 사람 브라우저처럼 보이게 합니다.
    // (실제 값은 2026년 3월 기준 stable Chrome 버전을 참고해 업데이트했습니다.)
    const response = await fetch(targetUrl, {
      headers: {
        // 최신 크롬(Windows 데스크톱) User-Agent — UA 축소 정책 이후 형식
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
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
