import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// hotdeal.zip scraper
// Uses the official internal JSON API for all data.
// (title, thumbnail_url, post_url, price — all from feed JSON)
// Does NOT fetch individual detail pages to avoid CF Workers IP block.
// ─────────────────────────────────────────────────────────────

const API_URL = 'https://hotdeal.zip/api/deals.php?page=1&category=all';

const API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://hotdeal.zip/',
    'X-Requested-With': 'XMLHttpRequest',
    'Cache-Control': 'no-cache',
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ─── Main scraping logic ──────────────────────────────────────

async function runScraper(env) {
    const supabaseUrl = (env.SUPABASE_URL || '').trim();
    const supabaseKey = (env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(`환경변수 누락. SUPABASE_URL="${supabaseUrl}", KEY 길이=${supabaseKey.length}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get '핫딜모음' category ID
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

    // ── Step 1: Fetch feed via JSON API (single request, no detail page) ──
    console.log(`[Scraper] Fetching: ${API_URL}`);

    const feedRes = await fetchWithTimeout(API_URL, { headers: API_HEADERS });
    const feedStatus = feedRes.status;
    const feedRawText = await feedRes.text();
    const feedPreview = feedRawText.substring(0, 300).replace(/\n/g, ' ');

    console.log(`[Scraper] status=${feedStatus}, preview=${feedPreview}`);

    if (!feedRes.ok) {
        throw new Error(`Feed API HTTP ${feedStatus} | 응답: ${feedPreview}`);
    }

    let feedJson;
    try {
        feedJson = JSON.parse(feedRawText);
    } catch (e) {
        throw new Error(`JSON 파싱 실패. 상태코드: ${feedStatus} | 응답내용: ${feedPreview}`);
    }

    if (!feedJson.success || !feedJson.data || feedJson.data.length === 0) {
        throw new Error(`API 데이터 없음. 상태코드: ${feedStatus} | 응답내용: ${feedPreview}`);
    }

    const items = feedJson.data;
    console.log(`[Scraper] Got ${items.length} items from API`);

    // ── Deduplication: load recent source_url entries from DB ──
    const { data: existingPosts } = await supabase
        .from('posts')
        .select('external_link, source_url')
        .eq('category', hotdealCategoryId)
        .order('created_at', { ascending: false })
        .limit(300);

    const existingExtLinks = new Set((existingPosts || []).map(p => p.external_link).filter(Boolean));
    const existingSourceUrls = new Set((existingPosts || []).map(p => p.source_url).filter(Boolean));
    console.log(`[Scraper] Existing DB entries to dedup against: ${existingExtLinks.size}`);

    let addedCount = 0;
    let skippedCount = 0;

    // ── Insert each item (no detail page fetch needed) ───────────
    for (const item of items) {
        const detailUrl = `https://hotdeal.zip/${item.seo_url}`;
        const externalLink = item.post_url || detailUrl;

        // Quick in-memory dedup
        if (existingExtLinks.has(externalLink) || existingSourceUrls.has(detailUrl)) {
            skippedCount++;
            continue;
        }

        // DB double-check (race condition guard)
        const { data: dup } = await supabase
            .from('posts')
            .select('id')
            .eq('external_link', externalLink)
            .maybeSingle();

        if (dup) {
            skippedCount++;
            existingExtLinks.add(externalLink);
            continue;
        }

        const { error: insertError } = await supabase.from('posts').insert([{
            title: item.title || '제목 없음',
            description: `${item.category || ''} | ${item.site || ''} | ${item.community_name || ''}`.trim(),
            content_html: '',
            image_url: item.thumbnail_url || null,
            external_link: externalLink,
            source_url: detailUrl,
            category: hotdealCategoryId,
            price: item.price || '',
            approved: true,
            is_hot: false,
            views: 0,
            like_count: 0,
        }]);

        if (insertError) {
            console.error(`[Scraper] Insert error for "${item.title}": ${insertError.message}`);
        } else {
            addedCount++;
            existingExtLinks.add(externalLink);
            console.log(`[Scraper] Added [${addedCount}]: ${item.title}`);
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
        console.error('[Scraper] Fatal:', err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
