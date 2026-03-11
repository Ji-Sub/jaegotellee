import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// hotdeal.zip scraper — uses official internal JSON API for feed
// + detail page fetch for actual purchase link (a.buy-button)
// ─────────────────────────────────────────────────────────────

const HUMAN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://hotdeal.zip/',
    'Cache-Control': 'no-cache',
};

const API_HEADERS = {
    ...HUMAN_HEADERS,
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
};

const randomDelay = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Extract buy link from detail page HTML using known selectors
function extractBuyLink(html, fallbackUrl) {
    // Priority 1: a.buy-button (confirmed by browser inspection)
    const buyMatch = html.match(/class="[^"]*buy-button[^"]*"[^>]*href="([^"]+)"/i)
        || html.match(/href="([^"]+)"[^>]*class="[^"]*buy-button[^"]*"/i);
    if (buyMatch?.[1]) return buyMatch[1];

    // Priority 2: a.original-post-link-small (original community link)
    const origMatch = html.match(/class="[^"]*original-post-link-small[^"]*"[^>]*href="([^"]+)"/i)
        || html.match(/href="([^"]+)"[^>]*class="[^"]*original-post-link-small[^"]*"/i);
    if (origMatch?.[1]) return origMatch[1];

    // Priority 3: Any external link (non-hotdeal.zip)
    const extLinks = [...html.matchAll(/href="(https?:\/\/(?!hotdeal\.zip)[^"]+)"/gi)];
    const filtered = extLinks
        .map(m => m[1])
        .filter(l => !l.includes('google.') && !l.includes('facebook.') && !l.includes('kakao.'));
    if (filtered.length > 0) return filtered[0];

    return fallbackUrl;
}

// Extract plain text description from detail page
function extractDescription(html) {
    // Try to find the main content section
    const contentMatch = html.match(/class="[^"]*(?:deal-content|post-content|content|view)[^"]*"[^>]*>([\s\S]{20,500}?)(?:<\/div>|$)/i);
    if (contentMatch) {
        return contentMatch[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
    }
    // Fallback: og:description
    const ogDesc = html.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]+)"/i)
        || html.match(/content="([^"]+)"[^>]+(?:name="description"|property="og:description")/i);
    return ogDesc?.[1]?.trim().substring(0, 200) || '';
}

// ─── Main scraping logic ──────────────────────────────────────

async function runScraper(env) {
    const supabaseUrl = (env.SUPABASE_URL || '').trim();
    const supabaseKey = (env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(`환경변수 누락. SUPABASE_URL="${supabaseUrl}", KEY 길이=${supabaseKey.length}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get '핫딜모음' category ID — exact match
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
    console.log(`[Scraper] category id: ${hotdealCategoryId}`);

    // ── Step 1: Fetch feed via internal JSON API ───────────────
    const feedApiUrl = 'https://hotdeal.zip/api/deals.php?page=1&category=all';
    console.log(`[Scraper] Step1: fetching feed API: ${feedApiUrl}`);

    const feedRes = await fetchWithTimeout(feedApiUrl, { headers: API_HEADERS });
    console.log(`[Scraper] Feed API status: ${feedRes.status}`);

    if (!feedRes.ok) {
        throw new Error(`Feed API returned HTTP ${feedRes.status}`);
    }

    const feedJson = await feedRes.json();
    console.log(`[Scraper] Feed API success: ${feedJson.success}, items: ${feedJson.data?.length ?? 0}`);

    if (!feedJson.success || !feedJson.data || feedJson.data.length === 0) {
        throw new Error('Feed API returned no data. Response: ' + JSON.stringify(feedJson).substring(0, 200));
    }

    const items = feedJson.data;

    // ── Deduplication: load recent external links from DB ──────
    const { data: existingPosts } = await supabase
        .from('posts')
        .select('external_link')
        .eq('category', hotdealCategoryId)
        .order('created_at', { ascending: false })
        .limit(300);

    const existingLinks = new Set((existingPosts || []).map(p => p.external_link).filter(Boolean));
    console.log(`[Scraper] Existing links in DB: ${existingLinks.size}`);

    let addedCount = 0;
    let skippedCount = 0;

    // ── Step 2: Deep crawl each article for buy link ──────────
    // Limit to 15 per run to avoid Cloudflare 50s CPU timeout
    for (const item of items.slice(0, 15)) {
        const detailUrl = `https://hotdeal.zip/${item.seo_url}`;

        // The feed already gives us the source community post URL (post_url)
        // We treat post_url as the primary external link
        // But we also try fetching detail page for dedicated buy button
        const feedExternalLink = item.post_url || detailUrl;

        // Quick dedup check
        if (existingLinks.has(feedExternalLink) || existingLinks.has(detailUrl)) {
            console.log(`[Scraper] Skip (dup): ${item.title}`);
            skippedCount++;
            continue;
        }

        // DB dedup check to handle race conditions
        const { data: dup } = await supabase
            .from('posts')
            .select('id')
            .or(`external_link.eq.${feedExternalLink},external_link.eq.${detailUrl}`)
            .maybeSingle();

        if (dup) {
            skippedCount++;
            existingLinks.add(feedExternalLink);
            continue;
        }

        // Human delay between requests
        await randomDelay();

        let externalLink = feedExternalLink;
        let description = '';

        // Fetch detail page to get dedicated buy-button link
        try {
            console.log(`[Scraper] Fetching detail: ${detailUrl}`);
            const detailRes = await fetchWithTimeout(detailUrl, { headers: HUMAN_HEADERS });
            console.log(`[Scraper] Detail status: ${detailRes.status}`);

            if (detailRes.ok) {
                const html = await detailRes.text();
                const buyLink = extractBuyLink(html, feedExternalLink);
                if (buyLink !== feedExternalLink) {
                    console.log(`[Scraper] Found buy link: ${buyLink}`);
                    externalLink = buyLink;
                }
                description = extractDescription(html);
            }
        } catch (e) {
            console.warn(`[Scraper] Detail fetch error: ${e.message} — using feed link`);
        }

        // Thumbnail: feed already provides thumbnail_url
        const imageUrl = item.thumbnail_url || null;
        const title = item.title || '제목 없음';
        const price = item.price || '';

        // Final dedup on actual external link
        if (existingLinks.has(externalLink)) {
            skippedCount++;
            continue;
        }

        // Insert
        const { error: insertError } = await supabase.from('posts').insert([{
            title,
            description,
            content_html: '',
            image_url: imageUrl,
            external_link: externalLink,
            source_url: detailUrl,
            category: hotdealCategoryId,
            price,
            approved: true,
            is_hot: false,
            views: 0,
            like_count: 0,
        }]);

        if (insertError) {
            console.error(`[Scraper] Insert error for "${title}": ${insertError.message}`);
        } else {
            addedCount++;
            existingLinks.add(externalLink);
            console.log(`[Scraper] Added [${addedCount}]: ${title}`);
        }
    }

    console.log(`[Scraper] Done. Added: ${addedCount}, Skipped: ${skippedCount}`);
    return { added: addedCount, skipped: skippedCount };
}

// ─── HTTP Handler ─────────────────────────────────────────────

export async function onRequest(context) {
    const { request, env } = context;

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

    if (!secret || secret !== (env.CRON_SECRET || '').trim()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const result = await runScraper(env);
        return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    } catch (err) {
        console.error('[Scraper] Fatal error:', err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
