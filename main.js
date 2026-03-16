/**
 * 재고털이 — Stock Clearance Platform
 * MVP SPA · Supabase + Vanilla JS
 *
 * 🔧 Setup: replace SUPABASE_URL and SUPABASE_ANON_KEY with your project values.
 *    Until then, DEMO MODE is active (sample posts shown, no auth).
 */

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://ohjmvkmuhuoiuguetmyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oam12a211aHVvaXVndWV0bXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODczMzksImV4cCI6MjA4ODI2MzMzOX0.R0bdr5_ucXlJWRAqilRit3sQdg2wQhqnb-nNtelz-iY';

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────
let CATEGORIES = [];
let DEFAULT_CATEGORY_ID = null;

async function loadCategories() {
  if (S.isDemo) {
    CATEGORIES = [
      { id: 'hotdeal', label: '핫딜 모음', icon: '🔥' },
      { id: 'popular', label: '인기딜', icon: '⭐' },
      { id: 'inquiry', label: '문의', icon: '💬' }
    ];
    return;
  }

  const { data, error } = await sb.from('categories').select('*').order('sort_order', { ascending: true });
  if (error || !data) {
    console.error('Failed to load categories', error);
    return;
  }

  const map = {};
  data.forEach(c => { map[c.id] = { id: c.id, label: c.name, icon: c.icon || '📁', subs: [] }; });

  const tree = [];

  data.forEach(c => {
    if (c.parent_id) {
      if (map[c.parent_id]) map[c.parent_id].subs.push(map[c.id]);
      else tree.push(map[c.id]);
    } else {
      tree.push(map[c.id]);
    }
  });

  CATEGORIES = tree;

  // Save default category reference dynamically (fallback '핫딜 모음' or first loaded)
  const hotdealMap = data.find(c => c.name === '핫딜 모음' || c.name === '핫딜');
  DEFAULT_CATEGORY_ID = hotdealMap ? String(hotdealMap.id) : (tree[0] ? String(tree[0].id) : null);
}

// ─────────────────────────────────────────────
// DEMO DATA  (shown before Supabase is connected)
// ─────────────────────────────────────────────
const DEMO_POSTS = [
  { id: 1, title: '한우 등심 1++ 재고 대방출', description: '냉동 한우 등심 1++ 등급 정육 재고 대량 방출합니다. 마트 납품 후 남은 물량이라 신선도 보장. 소분 가능합니다.', price: '35,000원/kg', image_url: null, category: 'meat', views: 1284, comment_count: 23, approved: true, is_hot: true },
  { id: 2, title: '제주 감귤 10kg 박스 — 시즌 마감 특가', description: '이번 시즌 마지막 감귤입니다. 산지 직송, 당도 높은 제주산 감귤 10kg 박스.', price: '18,000원', image_url: null, category: 'fruit', views: 567, comment_count: 8, approved: true, is_hot: false },
  { id: 3, title: '로지텍 MX Master 3 마우스 재고 처분', description: '리뉴얼로 인한 구모델 재고 처분. 정품 박스 미개봉. 공홈 대비 50% 할인!', price: '55,000원', image_url: null, category: 'mouse', views: 3210, comment_count: 45, approved: true, is_hot: true },
  { id: 4, title: '단백질 보충제 창고 정리 30% 할인', description: '유통기한 1년 이상 남은 단백질 보충제 대량 방출. 초코·바닐라 각 1kg.', price: '25,000원', image_url: null, category: 'supplement', views: 890, comment_count: 12, approved: true, is_hot: false },
  { id: 5, title: '수제 햄 & 소시지 박스세트 특가', description: '소량 생산 공방의 수제 햄/소시지 재고. 방부제 없는 건강한 제품, 냉동 보관.', price: '32,000원', image_url: null, category: 'processed', views: 420, comment_count: 6, approved: true, is_hot: false },
  { id: 6, title: '키크론 K2 키보드 물량 처분 (적축)', description: '리뉴얼 전 구모델 키크론 K2 적축 물량 대방출. 개봉 전 새제품. 맥/윈도우 호환.', price: '79,000원', image_url: null, category: 'keyboard', views: 1875, comment_count: 34, approved: true, is_hot: true },
];

const DEMO_COMMENTS = [
  { id: 1, content: '가격 대비 정말 좋네요! 바로 구매했습니다.', created_at: new Date(Date.now() - 3600000).toISOString(), users: { email: 'buyer01@email.com' } },
  { id: 2, content: '배송은 얼마나 걸리나요?', created_at: new Date(Date.now() - 1800000).toISOString(), users: { email: 'user99@email.com' } },
];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const S = {
  user: null,
  role: null,   // 'user' | 'seller' | 'admin'
  view: 'feed', // 'feed' | 'detail' | 'admin' | 'apply' | 'create'
  postId: null,
  category: 'hotdeal',
  page: 1,
  totalPages: 1,
  totalCount: 0,
  adminTab: 'sellers',  // 'sellers' | 'posts' | 'all'
  expanded: new Set(['clearance', 'food', 'health', 'living', 'electronics']),
  isDemo: false,
};

// ─────────────────────────────────────────────
// SUPABASE INIT
// ─────────────────────────────────────────────
let sb = null;
try {
  if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    S.isDemo = true;
  }
} catch (_) { S.isDemo = true; }

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function formatPrice(val) {
  if (!val) return '';
  let str = String(val).trim();
  str = str.replace(/,/g, ''); // remove commas if any exist

  const match = str.match(/(\d+)/);
  if (match) {
    const num = Number(match[1]);
    str = str.replace(match[1], num.toLocaleString('ko-KR'));
  }

  if (!str.includes('원')) {
    str += '원';
  }
  return str;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function findCategory(id, items = CATEGORIES) {
  for (const c of items) {
    if (String(c.id) === String(id)) return c;
    if (c.subs && c.subs.length > 0) {
      const found = findCategory(id, c.subs);
      if (found) return found;
    }
  }
  return null;
}

function getCatLabel(id) {
  const c = findCategory(id);
  return c ? c.label : id;
}

function getCatEmoji(id) {
  const c = findCategory(id);
  return c?.icon || '📦';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
async function loadRole() {
  if (!sb || !S.user) return;
  const { data } = await sb.from('users').select('role').eq('id', S.user.id).single();
  S.role = data?.role || 'user';
}

async function doLogin(email, password) {
  if (S.isDemo) { showToast('⚠️ 데모 모드 — Supabase를 먼저 연결해 주세요'); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  closeModal();
  showToast('로그인되었습니다 👋');
  renderNav();
}

async function doSignup(email, password) {
  if (S.isDemo) { showToast('⚠️ 데모 모드 — Supabase를 먼저 연결해 주세요'); return; }
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    await sb.from('users').upsert({ id: data.user.id, email, role: 'user' });
  }
  closeModal();
  showToast('가입 완료! 이메일을 확인해 주세요.');
}

async function doLogout() {
  if (sb) await sb.auth.signOut();
  S.user = null; S.role = null;
  showToast('로그아웃되었습니다');
  renderNav();
  navigateTo('feed');
}

// ─────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────
async function fetchPosts(category) {
  const pageSize = 20;
  const start = (S.page - 1) * pageSize;
  const end = start + pageSize - 1;

  if (S.isDemo) {
    let p = [...DEMO_POSTS];
    if (category === 'hotdeal') p = p.filter(x => x.is_hot);
    else p = p.filter(x => x.category === category);
    S.totalPages = Math.ceil(p.length / pageSize) || 1;
    return p.slice(start, start + pageSize);
  }
  let q = sb.from('posts').select('*, users(email)', { count: 'exact' }).eq('approved', true).order('created_at', { ascending: false });
  if (category === 'hotdeal') q = q.eq('is_hot', true);
  else if (category === 'popular') {
    q = sb.from('posts').select('*, users(email)', { count: 'exact' }).eq('approved', true).gte('like_count', 10).order('like_count', { ascending: false });
  }
  else q = q.eq('category', category);

  q = q.range(start, end);
  const { data, count } = await q;
  if (count !== null) {
    S.totalCount = count;
    S.totalPages = Math.ceil(count / pageSize) || 1;
  }
  return data || [];
}

async function fetchPost(id) {
  if (S.isDemo) return DEMO_POSTS.find(p => p.id == id) || null;
  await sb.rpc('increment_views', { post_id: id });
  const { data } = await sb.from('posts').select('*').eq('id', id).single();
  return data;
}

async function fetchComments(postId) {
  if (S.isDemo) return DEMO_COMMENTS;
  const { data } = await sb.from('comments')
    .select('*, users(email)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function addComment(postId, content) {
  if (!S.user) { showLoginModal(); return; }
  const { error: insertErr } = await sb.from('comments').insert({ post_id: postId, user_id: S.user.id, content });
  if (insertErr) throw insertErr;

  const { error: rpcErr } = await sb.rpc('increment_comments', { post_id: postId });
  if (rpcErr) {
    console.error('✅ increment_comments RPC Error:', rpcErr);
    showToast('RPC 오류: ' + rpcErr.message);
  } else {
    console.log('✅ increment_comments RPC Success');
  }
}

async function fetchPendingSellers() {
  if (S.isDemo) return [{ id: 'demo', user_id: 'u1', status: 'pending', created_at: new Date().toISOString(), users: { email: 'demo_seller@test.com' } }];
  const { data } = await sb.from('seller_applications').select('*, users(email)').eq('status', 'pending').order('created_at', { ascending: false });
  return data || [];
}

async function fetchPendingPosts() {
  if (S.isDemo) return [];
  const { data, error } = await sb.from('posts').select('*').eq('approved', false).order('created_at', { ascending: false });
  if (error) { showToast('대기글 조회 오류: ' + error.message); return []; }
  return data || [];
}

async function fetchAllPostsAdmin() {
  if (S.isDemo) return DEMO_POSTS;
  const { data, error } = await sb.from('posts').select('*').order('created_at', { ascending: false });
  if (error) { showToast('전체 게시글 불러오기 오류: ' + error.message); return []; }
  return data || [];
}

async function allPostsHasUpvote(postId) {
  if (!S.user) return false;
  const { data } = await sb.from('user_upvotes').select('id').eq('post_id', postId).eq('user_id', S.user.id).single();
  return !!data;
}

window.toggleUpvote = async function (id, elId) {
  if (!S.user) {
    alert('로그인이 필요합니다.');
    showLoginModal();
    return;
  }
  if (S.isDemo) { showToast('데모 모드에선 추천이 제한됩니다.'); return; }

  try {
    // 1. 유저 정보 (S.user.id) 파라미터로 추가 전달
    const { error } = await sb.rpc('toggle_upvote', {
      p_post_id: id,
      p_user_id: S.user.id
    });
    if (error) throw error;

    // 2. 토글 UI 동기화
    const btns = document.querySelectorAll(`[data-upvote-target="${id}"]`);
    btns.forEach(btn => {
      // 현재 버튼이 눌린 상태(active)인지 확인
      const isCurrentlyActive = btn.classList.contains('active');

      btn.classList.toggle('active');
      const countSpan = btn.querySelector('.upvote-count');

      if (countSpan) {
        let currentCount = parseInt(countSpan.textContent || '0', 10);
        // 이미 눌린 상태였다면 취소(-1), 아니었다면 추가(+1)
        if (isCurrentlyActive) {
          countSpan.textContent = Math.max(0, currentCount - 1);
        } else {
          countSpan.textContent = currentCount + 1;
        }
      }
    });
  } catch (e) {
    showToast('추천 처리 중 오류가 발생했습니다.');
    console.error(e);
  }
};

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
function handleRoute() {
  const h = window.location.hash || '#/';
  if (h === '#/') {
    S.view = 'feed';
    if (!S.category || S.category === 'all' || S.category === 'hotdeal') S.category = DEFAULT_CATEGORY_ID;
  }
  else if (h.startsWith('#/post/')) { S.view = 'detail'; S.postId = h.replace('#/post/', ''); }
  else if (h.startsWith('#/hotdeal/')) { S.view = 'hotdeal_detail'; S.postId = h.replace('#/hotdeal/', ''); }
  else if (h === '#/admin') { S.view = 'admin'; }
  else if (h === '#/apply') { S.view = 'apply'; }
  else if (h === '#/create') { S.view = 'create'; }
  else if (h === '#/create_inquiry') { S.view = 'create_inquiry'; }
  render();
}

// ─────────────────────────────────────────────
// RENDER ORCHESTRATOR
// ─────────────────────────────────────────────
function render() {
  renderNav();
  renderSidebar();
  const views = { feed: renderFeed, detail: renderDetail, hotdeal_detail: renderHotdealDetail, admin: renderAdmin, apply: renderApply, create: renderCreate, create_inquiry: renderCreateInquiry };
  const viewFn = views[S.view] || renderFeed;

  // viewFn is typically an async function. We catch rejections so the UI doesn't hang.
  const promise = viewFn();
  if (promise && promise.catch) {
    promise.catch(e => {
      console.error('Render error:', e);
      document.getElementById('content').innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>화면을 그리는 중 오류가 발생했습니다</h3><p>${e.message}</p></div>`;
    });
  }
}

// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────
function renderNav() {
  document.getElementById('navbar').innerHTML = `
    <button class="mobile-menu-btn" onclick="toggleDrawer()" aria-label="메뉴 열기">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
    <a class="nav-logo" onclick="navigateTo('feed');return false;" href="#/">히든딜</a>
    <div class="nav-right">
      ${S.user ? `
        <span class="nav-user-chip">${esc(S.user.email.split('@')[0])}</span>
        ${(S.role === 'seller' || S.role === 'admin') ? `<button class="btn btn-outline btn-sm" onclick="navigateTo('create')">+ 글쓰기</button>` : `<button class="btn btn-ghost btn-sm" onclick="navigateTo('apply')">판매자 신청</button>`}
        ${S.role === 'admin' ? `<button class="btn btn-outline btn-sm" onclick="navigateTo('admin')">⚙️ 관리</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="doLogout()">로그아웃</button>
      ` : `
        <button class="btn btn-ghost btn-sm" id="nav-login-btn" onclick="showLoginModal()">로그인</button>
        <button class="btn btn-primary btn-sm" onclick="showSignupModal()">판매자 가입</button>
      `}
    </div>`;
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
function buildSidebarHtml(cats, depth = 0) {
  let html = '';
  cats.forEach(c => {
    const hasKids = c.subs && c.subs.length > 0;
    const expanded = S.expanded.has(String(c.id));
    const active = !hasKids && String(S.category) === String(c.id);

    // 18px base horizontal padding from .sidebar-item, add 16px per depth layer
    const pl = depth === 0 ? '' : `style="padding-left: ${18 + (depth * 16)}px;"`;
    const iconHtml = c.icon ? `<span class="sidebar-icon">${c.icon}</span>` : '';
    const arrowHtml = hasKids ? `<span class="sidebar-arrow">${expanded ? '▾' : '▸'}</span>` : '';
    const subClass = depth > 0 ? ' sidebar-sub' : '';
    const activeClass = active ? ' active' : '';

    html += `<div class="sidebar-item${activeClass}${subClass}" ${pl}
        onclick="${hasKids ? `toggleExpand('${c.id}')` : `selectCat('${c.id}')`}">
      ${iconHtml}${esc(c.label)}
      ${arrowHtml}
    </div>`;

    if (hasKids && expanded) {
      html += buildSidebarHtml(c.subs, depth + 1);
    }
  });
  return html;
}

function renderSidebar() {
  const html = buildSidebarHtml(CATEGORIES);
  document.getElementById('sidebar').innerHTML = html;
  const drawerEl = document.getElementById('drawer');
  if (drawerEl) drawerEl.innerHTML = html;
}

function toggleExpand(id) {
  const strId = String(id);
  S.expanded.has(strId) ? S.expanded.delete(strId) : S.expanded.add(strId);
  renderSidebar();
}

function toggleDrawer() {
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer.classList.contains('open')) {
    closeDrawer();
  } else {
    drawer.classList.add('open');
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeDrawer() {
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.add('hidden');
  document.body.style.overflow = '';
}

let isNavigating = false;
async function navigateTo(view, param = null) {
  if (isNavigating) return;
  isNavigating = true;

  S.view = view;
  S.postId = param;
  const hash = view === 'feed' ? '#/' :
    view === 'detail' ? `#/post/${param}` :
      view === 'hotdeal_detail' ? `#/hotdeal/${param}` : `#/${view}`;

  try {
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      render(); // manually trigger if hash is the same (e.g. clicking feed while on feed)
    }
  } catch (e) {
    console.error(e);
    document.getElementById('content').innerHTML = `<div class="empty-state"><h3>오류가 발생했습니다</h3><p>${e.message}</p></div>`;
  } finally {
    isNavigating = false;
  }
}

function selectCat(id) {
  S.category = id;
  S.page = 1;
  S.view = 'feed';
  window.location.hash = '#/';
  closeDrawer();
  render();
}

// Feed pagination UI replaced by a "Load more" button. S.page resets in renderFeed.

window.loadMore = async function() {
  const btn = document.getElementById('btn-load-more');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '불러오는 중...';
  }

  S.page += 1;
  const isServerCat = S.category === 'inquiry';
  
  if (S.category === 'hotdeal') {
    const deals = await fetchHotDeals();
    const container = document.querySelector('.hotdeal-list-container');
    if (container && deals && deals.length > 0) {
      const listHtml = deals.map(d => {
        const detailParam = d.seo_url || d.post_url;
        return `
          <a href="javascript:void(0)" data-navigate="hotdeal_detail" data-param="${encodeURIComponent(detailParam)}" class="hotdeal-list-item">
            <img src="${esc(d.thumbnail_url)}" alt="${esc(d.title)}" class="hotdeal-thumb" loading="lazy">
            <div class="hotdeal-info">
              <div class="hotdeal-badge" style="background: ${esc(d.gradient)}">${esc(d.community_name)}</div>
              <h3 class="hotdeal-title">${esc(d.title)}</h3>
              <div class="hotdeal-meta">
                <span class="hotdeal-price">${esc(formatPrice(d.price))}</span>
                <span class="hotdeal-site">${esc(d.site)}</span>
                <span class="hotdeal-time">${esc(d.time)}</span>
              </div>
            </div>
          </a>
        `;
      }).join('');
      container.insertAdjacentHTML('beforeend', listHtml);
    }
  } else {
    const posts = await fetchPosts(S.category);
    if (isServerCat) {
      const tbody = document.querySelector('.inquiry-table tbody');
      if (tbody && posts && posts.length > 0) {
        const pageSize = 20;
        const startNum = S.totalCount - (S.page - 1) * pageSize;
        let html = '';
        posts.forEach((p, idx) => {
          const num = startNum - idx;
          const author = p.users?.email ? p.users.email.split('@')[0] : '익명';
          const date = new Date(p.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/ /g, '').slice(0, -1);
          html += `
            <tr class="inquiry-row" data-navigate="detail" data-param="${p.id}">
              <td class="col-num">${num}</td>
              <td class="col-title"><div class="inquiry-title-text">${esc(p.title)}</div></td>
              <td class="col-author">${esc(author)}</td>
              <td class="col-date">${date}</td>
              <td class="col-views">${p.views || 0}</td>
            </tr>
          `;
        });
        tbody.insertAdjacentHTML('beforeend', html);
      }
    } else {
      const container = document.querySelector('.cards-grid');
      if (container && posts && posts.length > 0) {
        const cardsHtml = posts.map(p => cardHtml(p)).join('');
        container.insertAdjacentHTML('beforeend', cardsHtml);
      }
    }
  }

  const loadMoreContainer = document.getElementById('load-more-container');
  if (S.page >= S.totalPages) {
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
  } else {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '더보기 <span style="font-size:12px;opacity:0.8;">(다음 20개)</span>';
    }
  }
};

function renderLoadMoreButton() {
  if (S.totalPages <= 1 || S.page >= S.totalPages) return '';
  return `
    <div id="load-more-container" class="load-more-container">
      <button id="btn-load-more" class="btn btn-outline load-more-btn" data-action="loadMore">
        더보기 <span class="load-more-sub">(다음 20개)</span>
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────────
// HOT DEAL FETCHING (hotdeal.zip integration)
// ─────────────────────────────────────────────
async function fetchHotDeals() {
  try {
    const res = await fetch(`/api/hotdeal?page=${S.page}`);
    const parsed = await res.json();
    if (parsed && parsed.success) {
      if (parsed.pagination) {
        S.totalCount = parsed.pagination.total_count;
        S.totalPages = Math.ceil(parsed.pagination.total_count / parsed.pagination.per_page) || 1;
      }
      return parsed.data;
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch hotdeals', e);
    return [];
  }
}

async function fetchHotdealDetail(url) {
  try {
    const res = await fetch(`/api/hotdeal?url=${encodeURIComponent(url)}`);
    return await res.text();
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function renderHotdealDetail() {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="loading" > <div class="spinner"></div> 불러오는 중...</div > `;

  try {
    const rawParam = decodeURIComponent(S.postId);
    // If it's a slug (doesn't start with http), build the canonical hotdeal.zip URL
    const targetUrl = rawParam.startsWith('http') ? rawParam : `https://hotdeal.zip/${rawParam}`;

    const htmlText = await fetchHotdealDetail(targetUrl);
    if (!htmlText) throw new Error('데이터를 불러오지 못했습니다.');

    // Pre-process HTML to prevent <td> from being violently stripped by DOMParser when not in <table>
    // This affects both proxy HTML and specific canonical pages like Ppomppu
    let safeHtmlText = htmlText;
    if (htmlText.includes('<product_name>') || htmlText.includes('class="board-contents"') || htmlText.includes("class='board-contents'")) {
      safeHtmlText = htmlText.replace(/<td([^>]*)>/gi, '<div$1>').replace(/<\/td>/gi, '</div>');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(safeHtmlText, 'text/html');

    // 1. Try Canonical Hotdeal.zip structure first
    let title = doc.querySelector('.deal-title')?.textContent?.trim();
    let price = doc.querySelector('.price-value')?.textContent?.trim();
    let shipping = '';
    let mall = doc.querySelector('.shop-name')?.innerText?.trim();

    // Check if it's a 404/deleted canonical page
    if (title === '🚨 신고하기' || doc.querySelector('title')?.textContent.includes('페이지를 찾을 수 없습니다')) {
      throw new Error('이 핫딜은 삭제되었거나 더 이상 접근할 수 없습니다.');
    }

    let externalLinks = [];
    const buyBtn = doc.querySelector('.buy-button');
    if (buyBtn && buyBtn.getAttribute('href')) {
      externalLinks.push(buyBtn.getAttribute('href'));
    }

    // Universal content selector for various communities (FMKorea: article, Quasarzone/Ppomppu: .deal-description)
    let contentEl = doc.querySelector('article') || doc.querySelector('.deal-description');

    // 2. Fallback to XML-like structure (proxy)
    if (!title) title = doc.querySelector('product_name')?.textContent || '제목 없음';
    if (!price) price = doc.querySelector('price')?.textContent || '';
    if (!shipping) shipping = doc.querySelector('shipping_cost')?.textContent || '';
    if (!mall) mall = doc.querySelector('shopping_mall')?.textContent || '';
    if (externalLinks.length === 0) {
      const linkMatches = [...htmlText.matchAll(/<link>(.*?)<\/link>/g)];
      externalLinks = linkMatches.map(m => m[1].trim());
    }

    // Fallback proxy content wrapper
    if (!contentEl) contentEl = doc.querySelector('content');

    // Origin resolution for images
    const originMatch = htmlText.match(/현재 URL:<\/strong>\s*(https?:\/\/[^\s<]+)/);
    const originUrl = originMatch ? originMatch[1].replace(/&amp;/g, '&') : targetUrl;

    if (contentEl) {
      contentEl.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src) {
          try {
            img.src = new URL(src, originUrl).href;
          } catch (e) {
            if (src.startsWith('//')) img.src = 'https:' + src;
            else if (src.startsWith('/')) img.src = 'https://hotdeal.zip' + src;
          }
        }
      });
      contentEl.querySelectorAll('script, style, iframe').forEach(s => s.remove());
    }

    const contentHtml = contentEl?.innerHTML || '내용이 없습니다.';

    el.innerHTML = `
      <div class="post-detail">
        <a class="btn btn-ghost btn-sm detail-back" data-action="historyBack" href="javascript:void(0)">← 목록으로</a>
        <div class="detail-cat">${esc(mall || '')}</div>
        <h1 class="detail-title">${esc(title)}</h1>
        <div class="detail-price">${esc(formatPrice(price))} ${shipping ? `<span style="font-size:14px;color:var(--text-muted);font-weight:normal;">/ 배송비: ${esc(shipping)}</span>` : ''}</div>
        <div class="comments-section" style="padding-top:20px;">
          <div class="detail-desc" style="white-space:normal; overflow:hidden;">
            ${contentHtml}
          </div>
        </div>
        <div style="margin-top:30px; margin-bottom: 20px;">
          ${externalLinks.length > 0 ? `<a href="${esc(externalLinks[0])}" target="_blank" rel="noopener noreferrer" class="purchase-btn">🔗 원본 링크 보러가기</a>` : ''}
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🚫</div><h3>핫딜을 불러올 수 없습니다</h3><p>${e.message}</p></div>`;
  }
}

// ─────────────────────────────────────────────
// FEED
// ─────────────────────────────────────────────
async function renderFeed() {
  console.log(`[renderFeed] Start - category: ${S.category}`);
  S.page = 1;
  const el = document.getElementById('content');
  el.innerHTML = ''; // 기존 컨테이너 완벽하게 비우기
  el.innerHTML = `<div class="loading"><div class="spinner"></div> 불러오는 중...</div>`;

  try {
    if (S.category === 'hotdeal') {
      console.log(`[renderFeed] Fetching hotdeals...`);
      const deals = await fetchHotDeals();
      console.log(`[renderFeed] Fetched ${deals?.length || 0} hotdeals`);
      
      if (!deals || deals.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-emoji">📭</div><h3>핫딜이 없습니다</h3><p>현재 불러올 수 있는 핫딜이 없습니다.</p></div>`;
        return;
      }

      const listHtml = deals.map(d => {
        // Use seo_url slug if available, otherwise fallback to post_url
        const detailParam = d.seo_url || d.post_url;
        return `
          <a href="javascript:void(0)" data-navigate="hotdeal_detail" data-param="${encodeURIComponent(detailParam)}" class="hotdeal-list-item">
            <img src="${esc(d.thumbnail_url)}" alt="${esc(d.title)}" class="hotdeal-thumb" loading="lazy">
            <div class="hotdeal-info">
              <div class="hotdeal-badge" style="background: ${esc(d.gradient)}">${esc(d.community_name)}</div>
              <h3 class="hotdeal-title">${esc(d.title)}</h3>
              <div class="hotdeal-meta">
                <span class="hotdeal-price">${esc(formatPrice(d.price))}</span>
                <span class="hotdeal-site">${esc(d.site)}</span>
                <span class="hotdeal-time">${esc(d.time)}</span>
              </div>
            </div>
          </a>
        `;
      }).join('');

      el.innerHTML = `
        <div class="feed-header">
          <h2 class="feed-title">🔥 핫딜 모음</h2>
        </div>
        <div class="hotdeal-list-container">
          ${listHtml}
        </div>
        ${renderLoadMoreButton()}
      `;
      return;
    }

    console.log(`[renderFeed] Fetching posts for category: ${S.category}`);
    const posts = await fetchPosts(S.category);
    console.log(`[renderFeed] Fetched ${posts?.length || 0} posts`);
    
    const catLabel = getCatLabel(S.category);
    const isServerCat = S.category === 'inquiry';
    const canPost = isServerCat ? !!S.user : (S.role === 'seller' || S.role === 'admin');
    const createPath = isServerCat ? 'create_inquiry' : 'create';

    const cardsHtml = posts.length === 0
      ? `<div class="empty-state"><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3><p>${isServerCat ? '질문이나 건의사항을 남겨주세요.' : '곧 새로운 딜이 업로드됩니다.'}</p></div>`
      : (isServerCat ? renderInquiryListHtml(posts) : `<div class="cards-grid">${posts.map(p => cardHtml(p)).join('')}</div>`);

    el.innerHTML = `
      <div class="feed-header">
        <h2 class="feed-title">${esc(catLabel)}</h2>
        ${canPost ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('${createPath}')">+ 글쓰기</button>` : ''}
      </div>
      ${S.isDemo ? `<div class="demo-banner">🔧 <strong>데모 모드</strong> — main.js 상단의 Supabase 키를 입력하면 실제 데이터가 연동됩니다.</div>` : ''}
      ${cardsHtml}
      ${renderLoadMoreButton()}`;
      
    console.log(`[renderFeed] Rendering complete`);
  } catch (error) {
    console.error(`[renderFeed] Error:`, error);
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>데이터를 불러오는 중 오류가 발생했습니다</h3><p>${error.message}</p></div>`;
  } finally {
    // 로딩 스피너 강제 제거 (innerHTML로 덮어씌워졌어도 방어적 차원에서)
    const spinner = el.querySelector('.loading');
    if (spinner) {
      console.log(`[renderFeed] Removing loading spinner in finally block`);
      spinner.remove();
    }
  }
}

function renderInquiryListHtml(posts) {
  const pageSize = 20;
  const startNum = S.totalCount - (S.page - 1) * pageSize;

  let html = `
    <div class="inquiry-table-container">
      <table class="inquiry-table">
        <thead>
          <tr>
            <th class="col-num">번호</th>
            <th class="col-title">제목</th>
            <th class="col-author">작성자</th>
            <th class="col-date">작성일</th>
            <th class="col-views">조회수</th>
          </tr>
        </thead>
        <tbody>
  `;

  posts.forEach((p, idx) => {
    const num = startNum - idx;
    const author = p.users?.email ? p.users.email.split('@')[0] : '익명';
    // Remove spaces from standard date output "2023. 10. 15" -> "2023.10.15"
    const date = new Date(p.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/ /g, '').slice(0, -1);

    html += `
      <tr class="inquiry-row" data-navigate="detail" data-param="${p.id}">
        <td class="col-num">${num}</td>
        <td class="col-title"><div class="inquiry-title-text">${esc(p.title)}</div></td>
        <td class="col-author">${esc(author)}</td>
        <td class="col-date">${date}</td>
        <td class="col-views">${p.views || 0}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;
  return html;
}

function cardHtml(p) {
  const img = p.image_url
    ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" class="card-img" loading="lazy">`
    : `<div class="card-placeholder">${getCatEmoji(p.category)}</div>`;
  return `
    <div class="post-card" data-navigate="detail" data-param="${p.id}">
      <div class="card-img-wrap">
        ${img}
        ${(p.like_count >= 10) ? `<span class="hot-badge">🔥 인기 히든딜</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-cat">${esc(getCatLabel(p.category))}</div>
        <div class="card-title">${esc(p.title)}</div>
        <div class="card-desc">${esc(p.description)}</div>
        <div class="card-price">${esc(formatPrice(p.price))}</div>
        <div class="card-meta">
          <button class="upvote-btn" data-upvote-target="${p.id}" data-action="toggleUpvote" data-param="${p.id}">
            <span class="upvote-icon">👍</span> <span class="upvote-count">${p.like_count || 0}</span>
          </button>
          <span>💬 ${p.comment_count || 0}</span>
          <span>👁 ${p.views || 0}</span>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// POST DETAIL
// ─────────────────────────────────────────────
async function renderDetail() {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="loading"><div class="spinner"></div> 불러오는 중...</div>`;
  const post = await fetchPost(S.postId);
  if (!post) { el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🚫</div><h3>게시글을 찾을 수 없습니다</h3></div>`; return; }
  const comments = await fetchComments(post.id);

  const imgHtml = post.image_url
    ? `<img src="${esc(post.image_url)}" alt="${esc(post.title)}" class="detail-img">`
    : `<div class="detail-img-placeholder">${getCatEmoji(post.category)}</div>`;

  const commentsHtml = comments.length === 0
    ? `<p style="color:var(--text-muted);font-size:14px;">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</p>`
    : comments.map(c => `
      <div class="comment-item">
        <div class="comment-author">${esc(c.users?.email?.split('@')[0] || '익명')}<span class="comment-time">${formatDate(c.created_at)}</span></div>
        <div class="comment-content">${esc(c.content)}</div>
      </div>`).join('');

  el.innerHTML = `
    <div class="post-detail">
      <a class="btn btn-ghost btn-sm detail-back" data-action="historyBack" href="javascript:void(0)">← 목록으로</a>
      <div class="detail-cat">${esc(getCatLabel(post.category))}</div>
      <h1 class="detail-title">${esc(post.title)}</h1>
      <div class="detail-price">${esc(formatPrice(post.price))}</div>
      <div class="detail-meta">
        ${post.category !== 'inquiry' ? `
        <button class="upvote-btn detail-upvote" data-upvote-target="${post.id}" data-action="toggleUpvote" data-param="${post.id}">
          <span class="upvote-icon">👍</span> <span class="upvote-count">${post.like_count || 0}</span>
        </button>
        ` : ''}
        <span>💬 댓글 <span id="detail-comment-count">${comments.length}</span>개</span>
        <span>👁 조회 ${post.views || 0}회</span>
      </div>

      ${post.purchase_link ? `
      <div class="curation-banner" style="
        background: linear-gradient(135deg, var(--card-bg, #1e1e2e) 0%, rgba(99,102,241,0.08) 100%);
        border: 1px solid rgba(99,102,241,0.2);
        border-radius: 16px;
        padding: 32px 24px;
        text-align: center;
        margin: 30px 0;
      ">
        <div style="font-size: 2.8rem; margin-bottom: 12px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">🛍️</div>
        <p style="color: var(--text-sub, #aaa); font-size: 15px; margin: 0 0 24px 0; line-height: 1.6;">
          해당 상품의 상세 내용과 전체 정보는<br>원본 판매 페이지에서 직접 확인하실 수 있습니다.
        </p>
        <a
          href="${esc(post.purchase_link)}"
          target="_blank"
          rel="noopener noreferrer"
          class="purchase-btn"
          style="display: inline-flex; width: auto; min-width: 200px; margin: 0 auto;"
        >
          원본 링크 보러가기
        </a>
      </div>
      ` : `<div class="detail-desc">${esc(post.description || '')}</div>`}

      <div class="comments-section">
        <h2 class="comments-title">댓글 ${comments.length}개</h2>
        ${S.user
      ? `<div class="comment-form">
               <textarea id="c-input" class="comment-input" placeholder="댓글을 입력해 주세요..."></textarea>
               <button class="btn btn-primary btn-sm" onclick="submitComment('${post.id}')">등록</button>
             </div>`
      : `<p style="font-size:13px;color:var(--text-sub);margin-bottom:16px;">
               댓글을 남기려면 <a href="javascript:void(0)" onclick="showLoginModal();return false;" style="color:var(--primary);font-weight:600;">로그인</a>이 필요합니다.
             </p>`}
        <div id="comment-list">
          ${comments.length === 0
      ? `<p style="color:var(--text-sub);font-size:13px;">아직 댓글이 없습니다.</p>`
      : comments.map(c => `
              <div class="comment-item">
                <div class="comment-author">${esc(c.users?.email?.split('@')[0] || '익명')}<span class="comment-time">${formatDate(c.created_at)}</span></div>
                <div class="comment-content">${esc(c.content)}</div>
              </div>`).join('')}
        </div>
      </div>`;

  console.log("--- 댓글 동기화 디버깅 시작 ---");
  console.log("1. 불러온 comments 배열 길이:", comments.length);
  const countEl = document.getElementById('detail-comment-count');
  console.log("2. DOM에서 요소 찾기 결과:", countEl);
  if (countEl) {
    countEl.innerText = comments.length;
    console.log("3. DOM 업데이트 성공!");
  } else {
    console.error("3. 치명적 에러: DOM에서 'detail-comment-count' 요소를 찾을 수 없음! 렌더링 타이밍 꼬임.");
  }
}

async function submitComment(postId) {
  const inp = document.getElementById('c-input');
  const txt = inp?.value.trim();
  if (!txt) { showToast('댓글 내용을 입력해 주세요'); return; }
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    await addComment(postId, txt);
    inp.value = '';
    showToast('댓글이 등록되었습니다');
    // 화면 즉시 반영 (상태 업데이트): 리스트에 새 댓글 추가
    const commentList = document.getElementById('comment-list');
    const author = S.user?.email ? S.user.email.split('@')[0] : '익명';
    const newCommentHtml = `
      <div class="comment-item">
        <div class="comment-author">${esc(author)}<span class="comment-time">${formatDate(new Date().toISOString())}</span></div>
        <div class="comment-content">${esc(txt)}</div>
      </div>`;

    if (commentList) {
      if (commentList.innerHTML.includes('아직 댓글이 없습니다')) {
        commentList.innerHTML = newCommentHtml;
      } else {
        commentList.insertAdjacentHTML('beforeend', newCommentHtml);
      }
    }

    // UI 상태 업데이트 (로컬에서 즉시 댓글 숫자 +1 반영)
    const countEl = document.getElementById('detail-comment-count');
    const titleEl = document.querySelector('.comments-title');
    const currentCount = parseInt(countEl?.textContent || '0', 10) + 1;
    if (countEl) countEl.textContent = currentCount;
    if (titleEl) titleEl.textContent = `댓글 ${currentCount}개`;

  } catch (e) {
    console.error('댓글 작성 오류:', e);
    showToast('오류: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────
async function renderAdmin() {
  const el = document.getElementById('content');
  if (!S.isDemo && S.role !== 'admin') {
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🔐</div><h3>관리자만 접근할 수 있습니다</h3></div>`;
    return;
  }
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  await renderAdminContent();
}

async function renderAdminContent() {
  const el = document.getElementById('content');
  const tabsHtml = `
    <div class="page-header"><h1>관리자 대시보드</h1><p>판매자 승인, 게시글, 카테고리 관리</p></div>
    <div class="admin-tabs">
      <button class="admin-tab${S.adminTab === 'sellers' ? ' active' : ''}" onclick="switchTab('sellers')">판매자 승인</button>
      <button class="admin-tab${S.adminTab === 'posts' ? ' active' : ''}" onclick="switchTab('posts')">게시글 승인</button>
      <button class="admin-tab${S.adminTab === 'all' ? ' active' : ''}" onclick="switchTab('all')">전체 게시글</button>
      <button class="admin-tab${S.adminTab === 'categories' ? ' active' : ''}" onclick="switchTab('categories')">카테고리 관리</button>
    </div>
    <div id="admin-body"></div>`;
  el.innerHTML = tabsHtml;
  await renderAdminTab();
}

async function switchTab(tab) {
  S.adminTab = tab;
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[['sellers', 'posts', 'all', 'categories'].indexOf(tab)]?.classList.add('active');
  await renderAdminTab();
}

async function renderAdminTab() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = `<div class="loading" > <div class="spinner"></div></div > `;

  if (S.adminTab === 'sellers') {
    const data = await fetchPendingSellers();
    body.innerHTML = data.length === 0
      ? `<div class="empty-state" ><div class="empty-emoji">✅</div><h3>대기 중인 판매자 신청이 없습니다</h3></div > `
      : `<table class="admin-table" >
          <thead><tr><th>이메일</th><th>신청일</th><th>상태</th><th>액션</th></tr></thead>
          <tbody>${data.map(d => `
            <tr>
              <td>${esc(d.users?.email || d.user_id)}</td>
              <td>${formatDate(d.created_at)}</td>
              <td><span class="badge badge-pending">대기중</span></td>
              <td><div class="btn-row">
                <button class="btn btn-success btn-sm" onclick="approveSeller('${d.id}','${d.user_id}')">승인</button>
                <button class="btn btn-danger btn-sm"  onclick="rejectSeller('${d.id}')">거절</button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table > `;

  } else if (S.adminTab === 'posts') {
    const data = await fetchPendingPosts();
    body.innerHTML = data.length === 0
      ? `<div class="empty-state" ><div class="empty-emoji">✅</div><h3>승인 대기 게시글이 없습니다</h3></div > `
      : `<table class="admin-table" >
          <thead><tr><th>제목</th><th>카테고리</th><th>가격</th><th>액션</th></tr></thead>
          <tbody>${data.map(p => `
            <tr>
              <td>${esc(p.title)}</td>
              <td>${esc(getCatLabel(p.category))}</td>
              <td>${esc(formatPrice(p.price))}</td>
              <td><div class="btn-row">
                <button class="btn btn-success btn-sm" onclick="approvePost('${p.id}')">승인</button>
                <button class="btn btn-danger btn-sm"  onclick="deletePost('${p.id}')">삭제</button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table > `;

  } else if (S.adminTab === 'all') {
    const data = await fetchAllPostsAdmin();
    body.innerHTML = `
      <div style="margin-bottom: 20px; display:flex; justify-content: flex-end;">
        <button id="btn-deep-scrape" class="btn btn-primary" type="button">🔍 핫딜집 딥크롤링 실행</button>
      </div>
      ${data.length === 0 ? `<div class="empty-state" ><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3></div > ` :
        `<table class="admin-table" >
          <thead><tr><th>제목</th><th>카테고리</th><th>상태</th><th>조회</th><th>액션</th></tr></thead>
          <tbody>${data.map(p => `
            <tr>
              <td>${esc(p.title)}</td>
              <td>
                <select class="form-input" style="width:140px; padding:4px;" onchange="updatePostCategory('${p.id}', this.value)">
                  ${getCategoryOptionsHtml(p.category)}
                </select>
              </td>
              <td><span class="badge ${p.approved ? 'badge-approved' : 'badge-pending'}">${p.approved ? '승인됨' : '대기중'}</span></td>
              <td>${p.views || 0}</td>
              <td><div class="btn-row">
                <button class="btn btn-danger btn-sm" onclick="deletePost('${p.id}')">삭제</button>
              </div></td>
            </tr>`).join('')}
        </table > `}
    `;
  } else if (S.adminTab === 'categories') {
    const { data } = await sb.from('categories').select('*').order('sort_order', { ascending: true });
    const rawList = data || [];

    // Build a tree map for the dropdown (all levels, not just root)
    const mapById = {};
    rawList.forEach(c => { mapById[c.id] = { ...c, subs: [] }; });
    const rootTree = [];
    rawList.forEach(c => {
      if (c.parent_id && mapById[c.parent_id]) mapById[c.parent_id].subs.push(mapById[c.id]);
      else if (!c.parent_id) rootTree.push(mapById[c.id]);
    });

    // Recursive function to build parent dropdown options with visible depth
    function buildParentOpts(list, depth = 0, ancestors = []) {
      let opts = '';
      list.forEach(c => {
        const label = ancestors.length > 0 ? ancestors.join(' > ') + ' > ' + c.name : c.name;
        const prefix = '\u00a0'.repeat(depth * 4); // non-breaking space indentation
        opts += `<option value="${c.id}">${prefix}${c.name}${ancestors.length > 0 ? ' (' + ancestors[ancestors.length - 1] + ' 하위)' : ''}</option>`;
        if (c.subs && c.subs.length > 0) {
          opts += buildParentOpts(c.subs, depth + 1, [...ancestors, c.name]);
        }
      });
      return opts;
    }
    const parentOpts = buildParentOpts(rootTree);

    // Recursive function to build flat table rows with depth label
    const depthLabels = ['대분류', '중분류', '소분류', '하위분류'];
    function buildTableRows(list, depth = 0) {
      let rows = '';
      list.forEach(c => {
        const indent = '\u00a0\u00a0'.repeat(depth * 2);
        const depthLabel = depthLabels[depth] || `${depth + 1}단계`;
        const arrow = depth > 0 ? '↳ ' : '';
        rows += `
          <tr>
            <td>${c.sort_order || 0}</td>
            <td><span style="color: ${depth === 0 ? '#333' : depth === 1 ? '#666' : '#999'}; font-size: ${depth === 0 ? '13px' : '12px'}">${depthLabel}</span></td>
            <td>${indent}${arrow}${esc(c.name)}</td>
            <td>${esc(c.icon || '')}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteAdminCategory('${c.id}')">삭제</button></td>
          </tr>`;
        if (c.subs && c.subs.length > 0) rows += buildTableRows(c.subs, depth + 1);
      });
      return rows;
    }

    body.innerHTML = `
      <div style="margin-bottom: 20px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; background:#f9f9f9; padding:15px; border-radius:8px;">
        <input type="text" id="new-cat-name" placeholder="카테고리명 (새 카테고리)" class="form-input" style="width:180px;" />
        <input type="number" id="new-cat-sort" placeholder="순서(숫자)" class="form-input" style="width:100px;" value="1" />
        <input type="text" id="new-cat-icon" placeholder="아이콘(예:🍎)" class="form-input" style="width:120px;" />
        <select id="new-cat-parent" class="form-input" style="width:220px;">
          <option value="">(최상위 대분류)</option>
          ${parentOpts}
        </select>
        <button type="button" id="btn-add-admin-category" class="btn btn-primary btn-sm">추가</button>
      </div>
      <table class="admin-table">
        <thead><tr><th>순서</th><th>유형</th><th>이름</th><th>아이콘</th><th>액션</th></tr></thead>
        <tbody>
          ${buildTableRows(rootTree)}
        </tbody>
      </table>
    `;
  }
}

function getCategoryOptionsHtml(selectedCat) {
  let html = '';
  function traverse(list, depth = 0) {
    list.forEach(c => {
      if (['hotdeal', 'popular', 'inquiry'].includes(String(c.id))) return;
      const prefix = '-'.repeat(depth) + (depth > 0 ? ' ' : '');
      const selected = String(c.id) === String(selectedCat) ? ' selected' : '';
      html += `<option value="${c.id}"${selected}>${prefix}${esc(c.label)}</option>`;
      if (c.subs && c.subs.length > 0) traverse(c.subs, depth + 1);
    });
  }
  traverse(CATEGORIES);
  return html;
}

window.updatePostCategory = async function (postId, newCategoryId) {
  if (S.isDemo) { showToast('데모 모드 제한'); return; }
  const { error } = await sb.from('posts').update({ category: newCategoryId }).eq('id', postId);
  if (error) { showToast('카테고리 업데이트 실패: ' + error.message); return; }
  showToast('해당 게시글의 카테고리가 갱신되었습니다.');
};

window.addAdminCategory = async function (e) {
  if (e) e.preventDefault();
  console.log('버튼 클릭됨: addAdminCategory 실행');

  try {
    if (S.isDemo) { alert('데모 모드 등급에서는 카테고리를 추가할 수 없습니다.'); return; }

    const nameEl = document.getElementById('new-cat-name');
    const sortEl = document.getElementById('new-cat-sort');
    const iconEl = document.getElementById('new-cat-icon');
    const parentEl = document.getElementById('new-cat-parent');

    if (!nameEl || !sortEl || !iconEl || !parentEl) {
      alert('입력 폼 DOM 요소를 찾을 수 없습니다.');
      return;
    }

    const name = nameEl.value.trim();
    const sort_order = parseInt(sortEl.value) || 0;
    const icon = iconEl.value.trim();
    const parent_id = parentEl.value.trim() || null;

    if (!name) {
      alert('카테고리명은 필수 항목입니다. 이름을 입력해주세요.');
      nameEl.focus();
      return;
    }

    const payload = { name, sort_order, icon };
    if (parent_id) payload.parent_id = parseInt(parent_id);

    const { error } = await sb.from('categories').insert([payload]);
    if (error) {
      alert('서버 DB 추가 실패: ' + error.message);
      return;
    }

    showToast('성공: 새 카테고리가 추가되었습니다.');
    await loadCategories();
    await renderAdminTab();
    renderNav();
  } catch (err) {
    alert('에러 발생: 추가 버튼 처리 중 오류가 발생했습니다. (' + err.message + ')');
    console.error(err);
  }
};

// Global Event Delegation for Dynamic Elements
document.addEventListener('click', async function (e) {
  const target = e.target;
  
  // 1. Actions (buttons, toggles)
  const actionEl = target.closest('[data-action]');
  if (actionEl) {
    e.preventDefault();
    e.stopPropagation();
    const action = actionEl.getAttribute('data-action');
    const param = actionEl.getAttribute('data-param');
    const param2 = actionEl.getAttribute('data-param2');
    
    if (action === 'toggleUpvote') {
      if (typeof window.toggleUpvote === 'function') window.toggleUpvote(param, param2);
    } else if (action === 'loadMore') {
      if (typeof window.loadMore === 'function') window.loadMore();
    } else if (action === 'historyBack') {
      history.back();
    }
    return;
  }

  // 2. Navigation
  const navEl = target.closest('[data-navigate]');
  if (navEl) {
    e.preventDefault();
    const view = navEl.getAttribute('data-navigate');
    const param = navEl.getAttribute('data-param');
    navigateTo(view, param);
    return;
  }

  // 3. Existing admin categories
  const addCatBtn = target.closest('#btn-add-admin-category');
  if (addCatBtn) {
    if (typeof window.addAdminCategory === 'function') {
      await window.addAdminCategory(e);
    } else {
      console.error('addAdminCategory is not globally available');
    }
  }
});

window.deleteAdminCategory = async function (id) {
  if (S.isDemo) { showToast('데모 모드 제한'); return; }
  if (!confirm('정말 삭제하시겠습니까?\n하위 카테고리가 있다면 오류가 발생할 수 있습니다.')) return;

  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { showToast('삭제 실패: ' + error.message); return; }

  showToast('데이터가 삭제되었습니다.');
  await loadCategories();
  await renderAdminTab();
  renderNav();
};

window.triggerScraping = async function () {
  if (S.isDemo) { showToast('데모 모드 제한'); return; }

  const btn = document.getElementById('btn-deep-scrape');
  if (!btn) { showToast('버튼을 찾을 수 없습니다.'); return; }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:5px;"></div> 크롤링 진행 중...';

  try {
    const res = await fetch('https://jaegotellee.thriller8912.workers.dev/api/scrape?secret=pjs8632365', {
      method: 'GET',
    });
    let data;
    try {
      data = await res.json();
    } catch (_) {
      const raw = await res.text().catch(() => '(응답 없음)');
      throw new Error(`HTTP ${res.status} — 응답: ${raw.substring(0, 300)}`);
    }

    if (!res.ok) {
      // 500 / 401 etc: always show as explicit error
      alert(`크롤링 에러 (HTTP ${res.status}):\n${data.error || JSON.stringify(data).substring(0, 300)}`);
    } else if (data.error) {
      alert(`크롤링 에러:\n${data.error}`);
    } else if (data.insertErrors && data.insertErrors.length > 0) {
      alert(`크롤링 부분 완료: ${data.added}개 추가됨\n\nInsert 에러:\n${data.insertErrors.slice(0, 3).join('\n')}`);
      await renderAdminTab();
    } else if (data.success) {
      showToast(`크롤링 완료: ${data.added}개 추가됨 (중복 건너뜀: ${data.skipped || 0}개)`);
      await renderAdminTab();
    } else {
      alert('스크래핑 실패 (원인 불명): ' + JSON.stringify(data).substring(0, 300));
    }
  } catch (e) {
    alert('오류 발생: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

// Event delegation for the deep scrape button (dynamically rendered)
document.addEventListener('click', function (e) {
  if (e.target.closest('#btn-deep-scrape')) {
    window.triggerScraping();
  }
});

async function approveSeller(appId, userId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  await sb.from('seller_applications').update({ status: 'approved' }).eq('id', appId);
  await sb.from('users').update({ role: 'seller' }).eq('id', userId);
  showToast('판매자로 승인되었습니다');
  await renderAdminTab();
}
async function rejectSeller(appId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  await sb.from('seller_applications').update({ status: 'rejected' }).eq('id', appId);
  showToast('신청이 거절되었습니다');
  await renderAdminTab();
}
async function approvePost(postId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  await sb.from('posts').update({ approved: true }).eq('id', postId);
  showToast('게시글이 승인되었습니다');
  await renderAdminTab();
}
async function deletePost(postId) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  await sb.from('posts').delete().eq('id', postId);
  showToast('삭제되었습니다');
  await renderAdminTab();
}

// ─────────────────────────────────────────────
// SELLER APPLY
// ─────────────────────────────────────────────
function renderApply() {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `
      <div class="form-card" >
        <div class="page-header"><h1>판매자 신청</h1><p>판매자가 되어 재고 딜을 올려보세요.</p></div>
        <p style="color:var(--text-sub);margin-bottom:16px;">판매자 신청을 위해 먼저 로그인이 필요합니다.</p>
        <button class="btn btn-primary" onclick="showLoginModal()">로그인하기</button>
      </div > `;
    return;
  }
  if (S.role === 'seller' || S.role === 'admin') {
    el.innerHTML = `<div class="form-card" > <div class="empty-state"><div class="empty-emoji">🎉</div><h3>이미 판매자입니다</h3><p>상단 '+ 글쓰기' 버튼으로 딜을 올려보세요.</p></div></div > `;
    return;
  }
  el.innerHTML = `
      <div class="form-card" >
      <div class="page-header"><h1>판매자 신청</h1><p>신청 후 관리자 검토를 거쳐 승인됩니다.</p></div>
      <div class="form-group">
        <label class="form-label">이메일</label>
        <input class="form-input" type="text" value="${esc(S.user.email)}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label">판매 상품 소개</label>
        <textarea class="form-input" id="apply-desc" placeholder="어떤 재고를 판매하실 예정인지 간략히 적어주세요."></textarea>
      </div>
      <button class="btn btn-primary btn-full" onclick="submitApply()">신청하기</button>
    </div > `;
}

async function submitApply() {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    const { error } = await sb.from('seller_applications').insert({ user_id: S.user.id, status: 'pending' });
    if (error) throw error;
    showToast('신청이 접수되었습니다. 검토 후 승인됩니다.');
    navigateTo('feed');
  } catch (e) { showToast('오류: ' + e.message); }
}

// ─────────────────────────────────────────────
// CREATE INQUIRY
// ─────────────────────────────────────────────
function renderCreateInquiry() {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `<div class="form-card" > <div class="empty-state"><div class="empty-emoji">🔒</div><h3>로그인이 필요합니다</h3></div></div > `;
    return;
  }

  el.innerHTML = `
      <div class="form-card" >
      <div class="page-header"><h1>문의 등록</h1><p>관리자에게 바로 전송됩니다.</p></div>
      <div class="form-group">
        <label class="form-label">제목 *</label>
        <input class="form-input" id="i-title" type="text" placeholder="문의 제목을 입력하세요">
      </div>
      <div class="form-group">
        <label class="form-label">작성자</label>
        <input class="form-input" type="text" value="${esc(S.user.email)}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label">내용 *</label>
        <textarea class="form-input" id="i-desc" style="min-height:130px;" placeholder="문의하시려는 내용을 자세히 적어주세요."></textarea>
      </div>
      <button class="btn btn-primary btn-full" onclick="submitInquiry()">등록 하기</button>
    </div > `;
}

async function submitInquiry() {
  const title = document.getElementById('i-title').value.trim();
  const desc = document.getElementById('i-desc').value.trim();
  if (!title || !desc) { showToast('제목과 내용을 모두 입력해주세요'); return; }

  if (S.isDemo) {
    DEMO_POSTS.unshift({ id: Date.now(), title, description: desc, price: '', image_url: null, category: 'inquiry', views: 0, comment_count: 0, approved: true, is_hot: false });
    showToast('문의가 등록되었습니다 (데모)');
    selectCat('inquiry');
    return;
  }

  const post = {
    user_id: S.user.id,
    title,
    description: desc,
    category: 'inquiry',
    price: null,
    views: 0,
    comment_count: 0,
    approved: true,
    is_hot: false
  };

  try {
    const { error } = await sb.from('posts').insert(post);
    if (error) throw error;
    showToast('문의가 등록되었습니다');
    selectCat('inquiry');
  } catch (e) {
    showToast('오류: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// CREATE POST
// ─────────────────────────────────────────────
function getLeafCategories(items = CATEGORIES) {
  let leaves = [];
  for (const c of items) {
    if (['hotdeal', 'popular', 'inquiry'].includes(String(c.id))) continue;
    if (c.subs && c.subs.length > 0) {
      leaves = leaves.concat(getLeafCategories(c.subs));
    } else {
      leaves.push(c);
    }
  }
  return leaves;
}

function renderCreate() {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `<div class="form-card" > <div class="empty-state"><div class="empty-emoji">🔒</div><h3>로그인이 필요합니다</h3></div></div > `;
    return;
  }
  if (S.role !== 'seller' && S.role !== 'admin') {
    el.innerHTML = `<div class="form-card" > <div class="empty-state"><div class="empty-emoji">🚫</div><h3>판매자 계정이 필요합니다</h3><p>판매자 신청 후 관리자 승인이 필요합니다.</p><br><button class="btn btn-primary" onclick="navigateTo('apply')">판매자 신청하기</button></div></div > `;
    return;
  }

  const leaves = getLeafCategories();
  const selectable = leaves.filter(c => !['all', 'hotdeal', 'inquiry'].includes(c.id));
  const catOptions = selectable.map(s => `<option value = "${s.id}" > ${s.label}</option > `).join('');

  el.innerHTML = `
      <div class="form-card" >
      <div class="page-header"><h1>딜 등록</h1><p>관리자 승인 후 공개됩니다.</p></div>
      <div class="form-group">
        <label class="form-label">제목 *</label>
        <input  class="form-input" id="p-title" type="text" placeholder="상품명 + 핵심 특징">
      </div>
      <div class="form-group">
        <label class="form-label">카테고리 *</label>
        <select class="form-input" id="p-cat">${catOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">가격 *</label>
        <input class="form-input" id="p-price" type="text" placeholder="예: 35,000원/kg">
      </div>
      <div class="form-group">
        <label class="form-label">상세 설명 *</label>
        <textarea class="form-input" id="p-desc" style="min-height:130px;" placeholder="상품 상태, 수량, 배송 방법 등을 자세히 적어주세요."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">이미지 URL</label>
        <input class="form-input" id="p-img" type="url" placeholder="https://...">
      </div>
      <div class="form-group">
        <label class="form-label">구매 링크</label>
        <input class="form-input" id="p-link" type="url" placeholder="https://...">
      </div>
      <button class="btn btn-primary btn-full" onclick="submitPost()">등록 신청</button>
    </div > `;
}

async function submitPost() {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  const title = document.getElementById('p-title')?.value.trim();
  const cat = document.getElementById('p-cat')?.value;
  const price = document.getElementById('p-price')?.value.trim();
  const desc = document.getElementById('p-desc')?.value.trim();
  if (!title || !price || !desc) { showToast('필수 항목을 모두 입력해 주세요'); return; }
  try {
    const { error } = await sb.from('posts').insert({
      title, category: cat, price, description: desc,
      image_url: document.getElementById('p-img')?.value || null,
      purchase_link: document.getElementById('p-link')?.value || null,
      is_hot: false,
      approved: false,
      views: 0,
      comment_count: 0,
      user_id: S.user.id
    });
    if (error) throw error;
    showToast('등록 신청 완료! 관리자 승인 후 공개됩니다.');
    navigateTo('feed');
  } catch (e) { showToast('오류: ' + e.message); }
}

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-container').innerHTML = `<div class="modal" > ${html}</div > `;
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-container').innerHTML = '';
}

function showLoginModal() {
  openModal(`
      <button class="modal-close" onclick = "closeModal()" >✕</button >
    <div class="modal-title">로그인</div>
    <div class="modal-subtitle">히든딜에 오신 것을 환영합니다</div>
    <div id="modal-err" style="color:#dc2626;font-size:13px;margin-bottom:8px;"></div>
    <div class="form-group">
      <label class="form-label">이메일</label>
      <input class="form-input" id="l-email" type="email" placeholder="email@example.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label class="form-label">비밀번호</label>
      <input class="form-input" id="l-pw" type="password" placeholder="비밀번호" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')modalLogin()">
    </div>
    <button class="btn btn-primary btn-full" onclick="modalLogin()">로그인</button>
    <div class="modal-switch">계정이 없으신가요? <a onclick="showSignupModal()">판매자 가입</a></div>`);
  setTimeout(() => document.getElementById('l-email')?.focus(), 50);
}

function showSignupModal() {
  openModal(`
      <button class="modal-close" onclick = "closeModal()" >✕</button >
    <div class="modal-title">판매자 가입</div>
    <div class="modal-subtitle">가입 후 판매자 신청을 진행해 주세요</div>
    <div id="modal-err" style="color:#dc2626;font-size:13px;margin-bottom:8px;"></div>
    <div class="form-group">
      <label class="form-label">이메일</label>
      <input class="form-input" id="s-email" type="email" placeholder="email@example.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label class="form-label">비밀번호 (6자 이상)</label>
      <input class="form-input" id="s-pw" type="password" placeholder="비밀번호" autocomplete="new-password"
        onkeydown="if(event.key==='Enter')modalSignup()">
    </div>
    <button class="btn btn-primary btn-full" onclick="modalSignup()">가입하기</button>
    <div class="modal-switch">이미 계정이 있으신가요? <a onclick="showLoginModal()">로그인</a></div>`);
  setTimeout(() => document.getElementById('s-email')?.focus(), 50);
}

async function modalLogin() {
  const email = document.getElementById('l-email')?.value.trim();
  const pw = document.getElementById('l-pw')?.value;
  const errEl = document.getElementById('modal-err');
  if (!email || !pw) { errEl.textContent = '이메일과 비밀번호를 입력해 주세요'; return; }
  try { await doLogin(email, pw); } catch (e) { errEl.textContent = e.message; }
}

async function modalSignup() {
  const email = document.getElementById('s-email')?.value.trim();
  const pw = document.getElementById('s-pw')?.value;
  const errEl = document.getElementById('modal-err');
  if (!email || !pw) { errEl.textContent = '이메일과 비밀번호를 입력해 주세요'; return; }
  if (pw.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다'; return; }
  try { await doSignup(email, pw); } catch (e) { errEl.textContent = e.message; }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
  await loadCategories();
  if (sb) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) { S.user = session.user; await loadRole(); }
    sb.auth.onAuthStateChange(async (_event, session) => {
      S.user = session?.user || null;
      if (S.user) await loadRole(); else S.role = null;
      renderNav();
    });
  }
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

init();
