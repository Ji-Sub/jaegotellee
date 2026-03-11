import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Cloudflare Pages Function: /api/scrape
//
// Supports both HTTP trigger (manual) and scheduled trigger (cron).
// Cron must be configured externally via Supabase pg_cron or similar
// since CF Pages Functions don't support cron exports natively.
// ─────────────────────────────────────────────────────────────

// Human-like request headers to evade bot detection
const HUMAN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
};

// Random delay between 1~3 seconds
const randomDelay = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));

// Fetch with timeout to avoid hanging
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

// ─── HTML Parsing Helpers ─────────────────────────────────────

// Extract all article URLs from the hotdeal.zip index page
function parseIndexItems(html) {
    const items = [];

    // Matches article list items: <a href="/deal/12345" ...>
    // hotdeal.zip uses links like /deal/12345 or /bbs/...
    const linkRegex = /<a\s+[^>]*href="(\/(?:deal|bbs|hotdeal|item)[^\s"]*)"[^>]*>/gi;
    const titleRegex = /<(?:h2|h3|h4|strong|span)[^>]*class="[^"]*(?:title|subject|tit)[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|h3|h4|strong|span)>/gi;
    const thumbRegex = /<img[^>]+src="([^"]+)"[^>]*class="[^"]*(?:thumb|thumbnail|image|img)[^"]*"[^>]*/gi;

    // Alternative: parse the generic structure — article cards
    // Try extracting from typical list elements
    const articleRegex = /<(?:article|li|div)[^>]*class="[^"]*(?:item|card|deal|post|row)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|li|div)>/gi;

    let articleMatch;
    while ((articleMatch = articleRegex.exec(html)) !== null) {
        const block = articleMatch[1];

        // Get href
        const hrefMatch = block.match(/href="(\/[^"]+)"/);
        if (!hrefMatch) continue;

        const path = hrefMatch[1];
        if (path.includes('javascript') || path.includes('#')) continue;

        // Get title
        const titleMatch = block.match(/<(?:h[1-6]|strong|span|p)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|span|p)>/i);
        const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Get thumbnail
        const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
        const imgSrc = imgMatch ? normalizeUrl(imgMatch[1]) : null;

        if (rawTitle && path) {
            items.push({
                url: `https://hotdeal.zip${path}`,
                title: rawTitle,
                thumbnail: imgSrc,
            });
        }
    }

    return items;
}

// Deep parse a detail article page for content and external link
function parseDetailPage(html, itemUrl) {
    // ── External (purchase) link ──────────────────────────────
    // hotdeal.zip typically has a buy button with class like "btn-buy", "go-link", "ext-link"
    // or a meta redirect / specific anchor
    let externalLink = null;

    const buyLinkPatterns = [
        /href="(https?:\/\/(?!hotdeal\.zip)[^"]+)"[^>]*(?:class|id)="[^"]*(?:buy|purchase|go|link|ext|shop|order|pay)[^"]*"/i,
        /(?:class|id)="[^"]*(?:buy|purchase|go|link|ext|shop|order|pay)[^"]*"[^>]*href="(https?:\/\/(?!hotdeal\.zip)[^"]+)"/i,
        /<a[^>]+href="(https?:\/\/(?:www\.coupang|smartstore\.naver|gmarket|auction|11st|wemakeprice|tmon|interpark|link\.coupang|coupa\.ng)[^"]+)"/i,
    ];

    for (const pattern of buyLinkPatterns) {
        const m = html.match(pattern);
        if (m && m[1]) {
            externalLink = m[1];
            break;
        }
    }

    // Fallback: find any non-hotdeal external link
    if (!externalLink) {
        const allLinks = [...html.matchAll(/href="(https?:\/\/(?!hotdeal\.zip)[^"]+)"/gi)];
        const filtered = allLinks
            .map(m => m[1])
            .filter(l => !l.includes('google') && !l.includes('facebook') && !l.includes('kakao') && !l.includes('naver.com/'));
        if (filtered.length > 0) externalLink = filtered[0];
    }

    // ── Content HTML ──────────────────────────────────────────
    // Try to find main content area
    let contentHtml = '';
    const contentPatterns = [
        /<div[^>]+class="[^"]*(?:content|article-body|post-content|view-content|bd-content|deal-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]+id="[^"]*(?:content|article|post|view|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<article[^>]*>([\s\S]*?)<\/article>/i,
    ];
    for (const pattern of contentPatterns) {
        const m = html.match(pattern);
        if (m && m[1] && m[1].length > 50) {
            contentHtml = m[1];
            break;
        }
    }

    // ── Thumbnail ─────────────────────────────────────────────
    // Try OG image first as it's the most reliable
    let thumbnail = null;
    const ogImgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
        || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (ogImgMatch) thumbnail = ogImgMatch[1];

    if (!thumbnail && contentHtml) {
        const imgMatch = contentHtml.match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) thumbnail = normalizeUrl(imgMatch[1]);
    }

    // ── Plain text description (first 200 chars) ──────────────
    const plainText = contentHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);

    return { externalLink: externalLink || itemUrl, contentHtml, thumbnail, description: plainText };
}

function normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://hotdeal.zip' + url;
    return url;
}

// ─── Main scraping logic ──────────────────────────────────────

async function runScraper(env) {
    // Trim env vars to prevent whitespace-corrupted URLs (Cloudflare 1016 error)
    const supabaseUrl = (env.SUPABASE_URL || '').trim();
    const supabaseKey = (env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(`환경변수 누락. SUPABASE_URL="${supabaseUrl}", KEY 길이=${supabaseKey.length}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get '핫딜모음' category ID — exact match, no wildcard
    const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', '핫딜모음')
        .maybeSingle();

    if (!catData) {
        const err = catError ? catError.message : '해당 카테고리가 DB에 없습니다';
        throw new Error(`카테고리 '핫딜모음' 못찾음. DB오류: ${err} | 인식된 URL: ${supabaseUrl}`);
    }
    const hotdealCategoryId = catData.id;

    // Step 1: Fetch hotdeal.zip main index (try multiple pages)
    const feedUrl = 'https://hotdeal.zip/';
    console.log(`[Scraper] Fetching feed: ${feedUrl}`);

    const feedRes = await fetchWithTimeout(feedUrl, { headers: HUMAN_HEADERS });
    if (!feedRes.ok) throw new Error(`Feed fetch failed: ${feedRes.status}`);

    const feedHtml = await feedRes.text();
    let items = parseIndexItems(feedHtml);

    if (items.length === 0) {
        // Fallback: scrape raw <a> tags pointing to article paths
        const rawLinks = [...feedHtml.matchAll(/href="(\/(?:deal|bbs|hotdeal|item|view|post)[^"?#]+)"/gi)];
        const uniquePaths = [...new Set(rawLinks.map(m => m[1]))].slice(0, 20);
        items = uniquePaths.map(p => ({ url: `https://hotdeal.zip${p}`, title: '', thumbnail: null }));
    }

    console.log(`[Scraper] Found ${items.length} items on index`);

    // Build deduplication set from recent DB entries
    const { data: existingPosts } = await supabase
        .from('posts')
        .select('external_link')
        .eq('category', hotdealCategoryId)
        .order('created_at', { ascending: false })
        .limit(200);

    const existingLinks = new Set((existingPosts || []).map(p => p.external_link).filter(Boolean));

    let addedCount = 0;
    let skippedCount = 0;

    // Step 2: Deep crawl each article
    for (const item of items.slice(0, 15)) { // limit per run to avoid CF timeout
        // Human delay between requests
        await randomDelay();

        console.log(`[Scraper] Deep crawling: ${item.url}`);

        let detailHtml = '';
        try {
            const detailRes = await fetchWithTimeout(item.url, { headers: { ...HUMAN_HEADERS, 'Referer': 'https://hotdeal.zip/' } });
            if (!detailRes.ok) {
                console.warn(`[Scraper] Detail fetch failed ${detailRes.status} for ${item.url}`);
                continue;
            }
            detailHtml = await detailRes.text();
        } catch (e) {
            console.warn(`[Scraper] Detail fetch error: ${e.message}`);
            continue;
        }

        const { externalLink, contentHtml, thumbnail, description } = parseDetailPage(detailHtml, item.url);

        // Extract title from detail page if missing
        let title = item.title;
        if (!title) {
            const ogTitle = detailHtml.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
                || detailHtml.match(/<title>([^<]+)<\/title>/i);
            title = ogTitle ? ogTitle[1].replace(/\s*[-|]\s*핫딜집.*$/i, '').trim() : '제목 없음';
        }

        const imageUrl = thumbnail || item.thumbnail;

        // Quick dedup check against in-memory set
        if (existingLinks.has(externalLink)) {
            console.log(`[Scraper] Skipped (duplicate): ${externalLink}`);
            skippedCount++;
            continue;
        }

        // Double-check DB to handle race conditions
        const { data: dup } = await supabase
            .from('posts')
            .select('id')
            .or(`external_link.eq.${externalLink},external_link.eq.${item.url}`)
            .maybeSingle();

        if (dup) {
            skippedCount++;
            existingLinks.add(externalLink);
            continue;
        }

        // Insert
        const { error: insertError } = await supabase.from('posts').insert([{
            title,
            description,
            content_html: contentHtml || '',
            image_url: imageUrl,
            external_link: externalLink,
            source_url: item.url,
            category: hotdealCategoryId,
            approved: true,
            is_hot: false,
            views: 0,
            like_count: 0,
        }]);

        if (insertError) {
            console.error(`[Scraper] Insert error for "${title}":`, insertError.message);
        } else {
            addedCount++;
            existingLinks.add(externalLink);
            console.log(`[Scraper] Added: ${title}`);
        }
    }

    console.log(`[Scraper] Done. Added: ${addedCount}, Skipped: ${skippedCount}`);
    return { added: addedCount, skipped: skippedCount };
}

// ─── HTTP Handler (manual trigger) ───────────────────────────

export async function onRequest(context) {
    const { request, env } = context;

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');

    if (!secret || secret !== env.CRON_SECRET) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'Missing Supabase env vars' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const result = await runScraper(env);
        return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    } catch (err) {
        console.error('[Scraper] Fatal error:', err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
