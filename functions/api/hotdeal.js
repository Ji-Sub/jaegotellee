export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const targetUrl = requestUrl.searchParams.get('url') || 'https://hotdeal.zip/api/deals.php?page=1&category=all';
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const body = await response.arrayBuffer();
    const clone = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    });
    
    // Clean up duplicate headers or restrictive CORS
    clone.headers.delete('Access-Control-Allow-Origin');
    clone.headers.delete('X-Frame-Options');
    clone.headers.set('Access-Control-Allow-Origin', '*');
    
    return clone;
  } catch (err) {
    return new Response(err.message, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
