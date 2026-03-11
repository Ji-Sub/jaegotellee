// ─────────────────────────────────────────────────────────────────────────────
// _worker.js — Cloudflare Worker entrypoint
//
// Handles two event types:
//   1. fetch  : manual HTTP call to /api/scrape?secret=... (수동 트리거)
//   2. scheduled: Cron Trigger every 10 minutes (자동 트리거)
//
// Both call the same runScraper(env) logic defined in this file.
// This file is self-contained so wrangler can bundle it independently.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

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

// ── URL 세탁: hotdealzip.mycafe24.com 프록시 → 원본 커뮤니티 링크 ──────────────
function cleanPostUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    try {
        const u = new URL(rawUrl);
        if (u.hostname !== 'hotdealzip.mycafe24.com') return rawUrl;

        // URLSearchParams가 percent-encoding을 자동 디코딩해서 반환
        const inner = u.searchParams.get('url');
        if (!inner) return rawUrl;

        if (u.pathname.includes('ppomppu_view.php')) {
            // inner = "view.php?id=ppomppu&no=688916&page=1&divpage=109"
            const finalUrl = 'https://www.ppomppu.co.kr/zboard/' + inner;
            console.log('✅ 세탁 완료된 뽐뿌 링크:', finalUrl);
            return finalUrl;
        }
        if (u.pathname.includes('ruliweb_view.php')) {
            return inner;
        }
        if (inner.startsWith('http')) return inner;

    } catch (_) { /* malformed URL — return as-is */ }
    return rawUrl;
}

// ── 스크래퍼 메인 로직 ────────────────────────────────────────────────────────
async function runScraper(env) {
    const supabaseUrl = (env.SUPABASE_URL || '').trim();
    const supabaseKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '').trim();

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(`환경변수 누락. SUPABASE_URL="${supabaseUrl}", KEY 길이=${supabaseKey.length}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 카테고리 ID 조회 ──────────────────────────────────────────────────────
    const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', '핫딜모음')
        .maybeSingle();

    if (!catData) {
        const err = catError ? catError.message : '해당 카테고리가 DB에 없습니다';
        throw new Error(`카테고리 '핫딜모음' 못찾음: ${err}`);
    }
    const hotdealCategoryId = catData.id;
    console.log(`[Scraper] category id=${hotdealCategoryId}`);

    // ── 관리자 user_id 조회 (NOT NULL 제약 충족) ──────────────────────────────
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

    // ── 피드 JSON 조회 ────────────────────────────────────────────────────────
    console.log(`[Scraper] Fetching: ${API_URL}`);
    const feedRes = await fetchWithTimeout(API_URL, { headers: API_HEADERS });
    const feedStatus = feedRes.status;
    const feedRawText = await feedRes.text();
    const feedPreview = feedRawText.substring(0, 400).replace(/\n/g, ' ');
    console.log(`[Scraper] Feed status=${feedStatus}, preview=${feedPreview}`);

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

    // ── 중복 체크: 최근 300건 purchase_link Set 로드 ───────────────────────────
    // DELETE/TRUNCATE 없음 — 신규 항목만 INSERT하여 누적 저장
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

    // ── 항목별 처리 ────────────────────────────────────────────────────────────
    for (const item of items) {
        const detailUrl = `https://hotdeal.zip/${item.seo_url}`;
        const purchaseLink = cleanPostUrl(item.post_url) || detailUrl;

        // 1차: 인메모리 중복 체크
        if (existingLinks.has(purchaseLink)) {
            skippedCount++;
            continue;
        }

        // 2차: DB 중복 체크
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

        const contentHtml = `
      <div class="scraped-deal">
        ${item.thumbnail_url ? `<img src="${item.thumbnail_url}" alt="${item.title}" style="max-width:100%;border-radius:8px;margin-bottom:12px;">` : ''}
        <p><strong>💰 가격:</strong> ${item.price || '가격 미정'}</p>
        <p><strong>🏪 쇼핑몰:</strong> ${item.site || '-'}</p>
        <p><strong>📂 카테고리:</strong> ${item.category || '-'}</p>
        <p><strong>📌 출처:</strong> ${item.community_name || '-'}</p>
      </div>
    `.trim();

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

    const summary = { added: addedCount, skipped: skippedCount, insertErrors: insertErrors.length > 0 ? insertErrors : undefined };
    console.log(`[Scraper] Done:`, summary);
    return summary;
}

// ─── Worker Export ─────────────────────────────────────────────────────────────
export default {
    // ── Manual HTTP trigger: GET /api/scrape?secret=... ──────────────────────
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
            });
        }

        const url = new URL(request.url);

        // Health check
        if (url.pathname === '/') {
            return new Response(JSON.stringify({ ok: true, message: 'jaegotellee worker is running' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Scrape endpoint
        if (url.pathname === '/api/scrape') {
            const secret = url.searchParams.get('secret');
            if (!secret || secret !== (env.CRON_SECRET || '').trim()) {
                return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                    status: 401, headers: { 'Content-Type': 'application/json' },
                });
            }

            try {
                const result = await runScraper(env);
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

        return new Response('Not Found', { status: 404 });
    },

    // ── Cron Trigger: 매 10분마다 자동 실행 (wrangler.toml: */10 * * * *) ───
    async scheduled(event, env, ctx) {
        console.log(`[Cron] scheduled trigger fired: ${event.cron} at ${new Date().toISOString()}`);
        ctx.waitUntil(
            runScraper(env).then(result => {
                console.log(`[Cron] Scrape 완료:`, result);
            }).catch(err => {
                console.error(`[Cron] Scrape 실패:`, err.message);
            })
        );
    },
};
