import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// hotdeal.zip scraper — API-only, no detail page fetches
// Uses confirmed column names from posts table inspection
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

// Resolve proxy URLs from hotdealzip to direct community links
function cleanPostUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    try {
        const u = new URL(rawUrl);
        if (u.hostname !== 'hotdealzip.mycafe24.com') return rawUrl;

        // ── Strategy: extract the 'url' parameter value ──────────────────
        // Two cases exist in the wild:
        //   A) Encoded:   ?url=view.php%3Fid%3Dppomppu%26no%3D688824
        //      → URLSearchParams.get('url') decodes perfectly → "view.php?id=ppomppu&no=688824"
        //   B) Unencoded: ?url=view.php?id=ppomppu&no=688824
        //      → URLSearchParams.get('url') only returns "view.php?id=ppomppu" (splits on &)
        //      → Must extract via raw string slice after '?url=' or '&url='

        // Try encoded path first (URLSearchParams handles percent-decoding)
        let inner = u.searchParams.get('url'); // works correctly when encoded

        // If the result looks incomplete (no '&' survivors from encoded '&' = '%26'),
        // fall back to raw string extraction for the unencoded case.
        // Sign of unencoded case: the raw search still contains '&' after '?url='
        const rawSearch = u.search; // e.g. "?url=view.php?id=ppomppu&no=688824"
        const urlIdx = rawSearch.indexOf('url=');
        if (urlIdx !== -1) {
            const rawInner = rawSearch.slice(urlIdx + 4); // everything after 'url='
            // If rawInner contains an unencoded '?' (meaning the inner URL's query wasn't encoded),
            // the URLSearchParams result will be wrong — use the raw slice instead.
            if (rawInner.includes('?') || rawInner.includes('%3F') || rawInner.includes('%3f')) {
                // rawInner may itself be percent-encoded — decode it
                try { inner = decodeURIComponent(rawInner); } catch (_) { inner = rawInner; }
            }
        }

        if (!inner) return rawUrl;

        // ── Route by pathname ─────────────────────────────────────────────
        if (u.pathname.includes('ppomppu_view.php')) {
            // inner is something like "view.php?id=ppomppu&no=688824&page=1"
            const finalUrl = 'https://www.ppomppu.co.kr/zboard/' + inner;
            console.log('✅ 세탁 완료된 뽐뿌 링크:', finalUrl);
            return finalUrl;
        }
        if (u.pathname.includes('ruliweb_view.php')) {
            return inner; // inner is already a full https://bbs.ruliweb.com/... URL
        }
        // Generic fallback
        if (inner.startsWith('http')) return inner;

    } catch (_) { /* malformed URL — return as-is */ }
    return rawUrl;
}

async function runScraper(env) {
    const supabaseUrl = (env.SUPABASE_URL || '').trim();
    // Use Service Role Key to bypass RLS — scraper is a server-side bot, not a logged-in user
    const supabaseKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(`환경변수 누락. URL="${supabaseUrl}", KEY 길이=${supabaseKey.length}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Get category ID ───────────────────────────────────────
    const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', '핫딜모음')
        .maybeSingle();

    if (!catData) {
        const err = catError ? catError.message : '해당 카테고리가 DB에 없습니다';
        throw new Error(`카테고리 '핫딜모음' 못찾음: ${err} (URL: ${supabaseUrl})`);
    }
    const hotdealCategoryId = catData.id;
    console.log(`[Scraper] category id=${hotdealCategoryId}`);

    // ── Get admin user ID for user_id field (NOT NULL constraint) ──
    // Try users table with role='admin' first, fallback to first user
    let adminUserId = null;
    const { data: adminUser } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();

    if (adminUser?.id) {
        adminUserId = adminUser.id;
    } else {
        // Fallback: any first user
        const { data: firstUser } = await supabase
            .from('users')
            .select('id')
            .limit(1)
            .maybeSingle();
        adminUserId = firstUser?.id || null;
    }

    if (!adminUserId) {
        throw new Error('관리자 user_id를 찾을 수 없습니다. users 테이블을 확인해주세요.');
    }
    console.log(`[Scraper] admin user_id=${adminUserId}`);

    // ── Step 1: Fetch feed JSON ───────────────────────────────
    console.log(`[Scraper] Fetching: ${API_URL}`);
    const feedRes = await fetchWithTimeout(API_URL, { headers: API_HEADERS });
    const feedStatus = feedRes.status;
    const feedRawText = await feedRes.text();
    const feedPreview = feedRawText.substring(0, 400).replace(/\n/g, ' ');
    console.log(`[Scraper] Feed status=${feedStatus}, preview=${feedPreview}`);

    // ① API 차단 시 명확한 에러
    if (!feedRes.ok) {
        throw new Error(`API 차단됨: ${feedStatus} ${feedRes.statusText} | 응답: ${feedPreview}`);
    }

    let feedJson;
    try {
        feedJson = JSON.parse(feedRawText);
    } catch (e) {
        throw new Error(`JSON 파싱 실패. 상태코드=${feedStatus} | 응답: ${feedPreview}`);
    }

    if (!feedJson.success || !feedJson.data || feedJson.data.length === 0) {
        throw new Error(`API 응답 데이터 없음. 상태코드=${feedStatus} | 응답: ${feedPreview}`);
    }

    const items = feedJson.data;
    console.log(`[Scraper] Got ${items.length} items`);

    // ── Dedup: load recent purchase_links from DB ─────────────
    const { data: existingPosts } = await supabase
        .from('posts')
        .select('purchase_link')
        .eq('category', hotdealCategoryId)
        .order('created_at', { ascending: false })
        .limit(300);

    const existingLinks = new Set(
        (existingPosts || []).map(p => p.purchase_link).filter(Boolean)
    );
    console.log(`[Scraper] Dedup set size: ${existingLinks.size}`);

    let addedCount = 0;
    let skippedCount = 0;
    const insertErrors = [];

    // ── Insert items ──────────────────────────────────────────
    for (const item of items) {
        const detailUrl = `https://hotdeal.zip/${item.seo_url}`;
        // ③ post_url → purchase_link (원본 커뮤니티 링크)
        const purchaseLink = cleanPostUrl(item.post_url) || detailUrl;

        // Quick in-memory dedup
        if (existingLinks.has(purchaseLink)) {
            skippedCount++;
            continue;
        }

        // DB double-check
        const { data: dup } = await supabase
            .from('posts')
            .select('id')
            .eq('purchase_link', purchaseLink)
            .maybeSingle();

        if (dup) {
            skippedCount++;
            existingLinks.add(purchaseLink);
            continue;
        }

        // ③ Build simple HTML content from available data
        const contentHtml = `
      <div class="scraped-deal">
        ${item.thumbnail_url ? `<img src="${item.thumbnail_url}" alt="${item.title}" style="max-width:100%;border-radius:8px;margin-bottom:12px;">` : ''}
        <p><strong>💰 가격:</strong> ${item.price || '가격 미정'}</p>
        <p><strong>🏪 쇼핑몰:</strong> ${item.site || '-'}</p>
        <p><strong>📂 카테고리:</strong> ${item.category || '-'}</p>
        <p><strong>📌 출처:</strong> ${item.community_name || '-'}</p>
      </div>
    `.trim();

        // ② Confirmed column names from posts table (from main.js inspection)
        const payload = {
            title: item.title || '제목 없음',
            description: `[${item.category || ''}] ${item.site || ''} - ${item.community_name || ''}`.trim(),
            price: (() => { const n = parseInt((item.price || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; })(),
            image_url: item.thumbnail_url || null,
            purchase_link: purchaseLink,
            category: hotdealCategoryId,
            is_hot: false,
            approved: true,
            views: 0,
            comment_count: 0,
            user_id: adminUserId,
        };

        // ② Surface insert errors explicitly
        const { error: insertError } = await supabase.from('posts').insert([payload]);

        if (insertError) {
            const errMsg = `"${item.title}" 저장 실패: ${insertError.message} (hint: ${insertError.hint || 'none'}, detail: ${insertError.details || 'none'})`;
            console.error(`[Scraper] INSERT ERROR: ${errMsg}`);
            insertErrors.push(errMsg);
        } else {
            addedCount++;
            existingLinks.add(purchaseLink);
            console.log(`[Scraper] Added [${addedCount}]: ${item.title}`);
        }
    }

    const summary = {
        added: addedCount,
        skipped: skippedCount,
        insertErrors: insertErrors.length > 0 ? insertErrors : undefined,
    };
    console.log(`[Scraper] Done:`, summary);
    return summary;
}

// ─── HTTP Handler ─────────────────────────────────────────────

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
        });
    }

    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');
    if (!secret || secret !== (env.CRON_SECRET || '').trim()) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401, headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const result = await runScraper(env);
        // If 0 were added AND there are insert errors, surface as 500 so alert fires
        if (result.added === 0 && result.insertErrors && result.insertErrors.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                error: `Insert 에러 발생 (${result.insertErrors.length}건). 첫번째 에러: ${result.insertErrors[0]}`,
                ...result,
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
        return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    } catch (err) {
        console.error('[Scraper] Fatal:', err.message);
        return new Response(JSON.stringify({
            success: false,
            error: err.message,
            stack: err.stack?.substring(0, 300),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
