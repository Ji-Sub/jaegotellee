/**
 * 재고털이 — Stock Clearance Platform
 * MVP SPA · Supabase + Vanilla JS
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

  const hotdealMap = data.find(c => c.name === '핫딜 모음' || c.name === '핫딜');
  DEFAULT_CATEGORY_ID = hotdealMap ? String(hotdealMap.id) : (tree[0] ? String(tree[0].id) : null);
}

// ─────────────────────────────────────────────
// DEMO DATA
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
  role: null,
  view: 'feed',
  postId: null,
  category: 'hotdeal',
  page: 1,
  totalPages: 1,
  totalCount: 0,
  adminTab: 'sellers',
  expanded: new Set(['clearance', 'food', 'health', 'living', 'electronics']),
  isDemo: false,
  renderToken: 0,
};

function bumpRenderToken() {
  S.renderToken += 1;
  return S.renderToken;
}

function removeRenderSpinnerIfCurrent(myToken) {
  // ✅ 토큰 조건 제거 — 스피너 id가 myToken 기준이라 다른 화면 스피너에 영향 없음
  document.getElementById(`spinner-${myToken}`)?.remove();
}

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
  if (!val && val !== 0) return '';
  const str = String(val).trim();
  if (!str) return '';
  if (/^[\d,.]+$/.test(str)) {
    const num = Number(str.replace(/,/g, ''));
    if (!isNaN(num)) return num.toLocaleString('ko-KR') + '원';
  }
  return str.includes('원') ? str : str + '원';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function withTimeout(promise, ms = 30000, msg = '요청 시간이 초과되었습니다. 네트워크를 확인해 주세요.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function retryInsert(makeFn, { btn, sp, baseLabel = '등록 중...', ms = 15000 } = {}) {
  const MAX_RETRIES = 2;
  const isTimeoutErr = (e) => {
    const msg = (e?.message || String(e)).toLowerCase();
    return msg.includes('시간이 초과') || msg.includes('timeout');
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      if (btn) btn.innerHTML = `${sp}재시도 중 (${attempt}/${MAX_RETRIES})...`;
      await new Promise(r => setTimeout(r, 2000));
    }
    try {
      const { error } = await withTimeout(makeFn(), ms);
      if (error) throw error;
      return;
    } catch (e) {
      lastErr = e;
      if (!isTimeoutErr(e) || attempt === MAX_RETRIES) throw e;
      console.warn(`[retryInsert] 타임아웃, ${attempt + 1}/${MAX_RETRIES + 1} 시도 후 재시도 예정`, e.message);
    }
  }
  throw lastErr;
}

function stripSpaces(str) {
  return String(str || '').replace(/\s/g, '');
}

const DEAL_CREATE_FORBIDDEN_KEYWORDS = ['핫딜', '인기', '문의'];
function isForbiddenDealCreateCategoryLeaf(c) {
  const normLabel = stripSpaces(c.label);
  const normName = stripSpaces(c.name);
  const normPath = stripSpaces(c.pathLabel);
  return DEAL_CREATE_FORBIDDEN_KEYWORDS.some(
    kw => normLabel.includes(kw) || normName.includes(kw) || normPath.includes(kw)
  );
}

function eventTargetElement(e) {
  const t = e?.target;
  if (!t) return null;
  if (t instanceof Element) return t;
  return t.parentElement || null;
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
  try {
    const { data: ud, error: ue } = await sb
      .from('users')
      .select('role')
      .eq('id', S.user.id)
      .maybeSingle();

    if (!ue && ud?.role) {
      S.role = ud.role;
      console.log('[loadRole] role:', S.role);
      return;
    }

    const { data: pd } = await sb
      .from('profiles')
      .select('role')
      .eq('id', S.user.id)
      .maybeSingle();

    S.role = pd?.role || 'user';
    console.log('[loadRole] profiles fallback → role:', S.role);
  } catch (err) {
    console.error('[loadRole] 에러:', err);
    S.role = 'user';
  }
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
  try {
    if (sb) await sb.auth.signOut();
  } catch (e) {
    console.error('[doLogout]', e);
    showToast(e?.message || '로그아웃 처리 중 오류가 발생했습니다');
  }
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

  if (category === 'hotdeal') {
    q = q.eq('is_hot', true);
  } else if (category === 'popular') {
    q = sb.from('posts').select('*, users(email)', { count: 'exact' }).eq('approved', true).gte('like_count', 10).order('like_count', { ascending: false });
  } else {
    // ✅ [FIX 4] 중분류(부모) 선택 시 소분류 전체 .in() 쿼리
    const catNode = findCategory(category);
    const isParentCat = catNode && catNode.subs && catNode.subs.length > 0;
    if (isParentCat) {
      const leafIds = getAllLeafIds(catNode);
      q = q.in('category', leafIds.length > 0 ? leafIds : [category]);
    } else {
      q = q.eq('category', category);
    }
  }

  q = q.range(start, end);
  const { data, count } = await withTimeout(q);
  if (count !== null) {
    S.totalCount = count;
    S.totalPages = Math.ceil(count / pageSize) || 1;
  }
  return data || [];
}

async function fetchPost(id) {
  if (S.isDemo) return DEMO_POSTS.find(p => p.id == id) || null;
  await sb.rpc('increment_views', { post_id: id });
  const { data } = await withTimeout(sb.from('posts').select('*').eq('id', id).single());
  return data;
}

async function fetchComments(postId) {
  if (S.isDemo) return DEMO_COMMENTS;
  const { data } = await withTimeout(
    sb.from('comments')
      .select('*, users(email)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
  );
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
  const { data } = await withTimeout(sb.from('seller_applications').select('*, users(email)').eq('status', 'pending').order('created_at', { ascending: false }), 60000);
  return data || [];
}

async function fetchPendingPosts() {
  if (S.isDemo) return [];
  const { data, error } = await withTimeout(sb.from('posts').select('*').eq('approved', false).order('created_at', { ascending: false }), 60000);
  if (error) { showToast('대기글 조회 오류: ' + error.message); return []; }
  return data || [];
}

async function fetchAllPostsAdmin() {
  if (S.isDemo) return DEMO_POSTS;
  const { data, error } = await withTimeout(sb.from('posts').select('*, users(email)').order('created_at', { ascending: false }), 60000);
  if (error) { showToast('전체 게시글 불러오기 오류: ' + error.message); return []; }
  return data || [];
}

async function allPostsHasUpvote(postId) {
  if (!S.user) return false;
  try {
    const { data } = await sb.from('user_upvotes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', S.user.id)
      .maybeSingle();
    return !!data;
  } catch (_) {
    return false;
  }
}

window.toggleUpvote = async function (id, elId) {
  if (!S.user) {
    alert('로그인이 필요합니다.');
    showLoginModal();
    return;
  }
  if (S.isDemo) { showToast('데모 모드에선 추천이 제한됩니다.'); return; }

  try {
    const { error } = await sb.rpc('toggle_upvote', {
      p_post_id: id,
      p_user_id: S.user.id
    });
    if (error) throw error;

    const btns = document.querySelectorAll(`[data-upvote-target="${id}"]`);
    btns.forEach(btn => {
      const isCurrentlyActive = btn.classList.contains('active');
      btn.classList.toggle('active');
      const countSpan = btn.querySelector('.upvote-count');
      if (countSpan) {
        let currentCount = parseInt(countSpan.textContent || '0', 10);
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
  const currentToken = bumpRenderToken();
  const views = { feed: renderFeed, detail: renderDetail, hotdeal_detail: renderHotdealDetail, admin: renderAdmin, apply: renderApply, create: renderCreate, create_inquiry: renderCreateInquiry };
  const viewFn = views[S.view] || renderFeed;

  const promise = viewFn(currentToken);
  if (promise && promise.catch) {
    promise.catch(e => {
      console.error('Render error:', e);
      if (S.renderToken !== currentToken) return;
      removeRenderSpinnerIfCurrent(currentToken);
      const msg = e && typeof e.message === 'string' ? e.message : String(e);
      document.getElementById('content').innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>화면을 그리는 중 오류가 발생했습니다</h3><p>${esc(msg)}</p></div>`;
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
        ${S.role === 'admin' ? `<button class="btn btn-outline btn-sm" onclick="navigateTo('admin')">⚙️ 관리</button><a href="/bookmarklet.html" target="_blank" class="btn btn-ghost btn-sm" title="밴드 북마크릿 설치">📌</a>` : ''}
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
    // ✅ [FIX 4-A] 부모 카테고리도 active 처리
    const active = String(S.category) === String(c.id);

    const pl = depth === 0 ? '' : `style="padding-left: ${18 + (depth * 16)}px;"`;
    const iconHtml = c.icon ? `<span class="sidebar-icon">${c.icon}</span>` : '';
    const arrowHtml = hasKids ? `<span class="sidebar-arrow">${expanded ? '▾' : '▸'}</span>` : '';
    const subClass = depth > 0 ? ' sidebar-sub' : '';
    const activeClass = active ? ' active' : '';

    // ✅ [FIX 4-A] 부모 클릭 시 selectParentCat 호출
    html += `<div class="sidebar-item${activeClass}${subClass}" ${pl}
        onclick="${hasKids ? `selectParentCat('${c.id}')` : `selectCat('${c.id}')`}">
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

/**
 * ✅ [FIX 4-B] 중분류 클릭 시 소분류 전체 상품 보여주기
 * 펼침 유지 + 해당 카테고리 ID로 피드 전환
 * fetchPosts에서 getAllLeafIds로 소분류 전체 .in() 쿼리 처리
 */
function selectParentCat(id) {
  const strId = String(id);
  S.expanded.add(strId); // 항상 펼침 유지
  S.category = strId;
  S.page = 1;
  S.view = 'feed';
  closeDrawer();
  if (window.location.hash === '#/') render();
  else window.location.hash = '#/';
}

/**
 * ✅ [FIX 4-B] 카테고리 트리에서 리프(소분류) ID 전부 수집
 * 중분류 클릭 시 .in(category, [...leafIds]) 쿼리에 사용
 */
function getAllLeafIds(cat) {
  if (!cat.subs || cat.subs.length === 0) return [String(cat.id)];
  let ids = [];
  cat.subs.forEach(sub => { ids = ids.concat(getAllLeafIds(sub)); });
  return ids;
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
      render();
    }
  } catch (e) {
    console.error(e);
    const msg = e && typeof e.message === 'string' ? e.message : String(e);
    document.getElementById('content').innerHTML = `<div class="empty-state"><h3>오류가 발생했습니다</h3><p>${esc(msg)}</p></div>`;
  } finally {
    isNavigating = false;
  }
}

function selectCat(id) {
  S.category = id;
  S.page = 1;
  S.view = 'feed';
  closeDrawer();
  if (window.location.hash === '#/') {
    render();
  } else {
    window.location.hash = '#/';
  }
}

window.loadMore = async function () {
  const btn = document.getElementById('btn-load-more');
  const originalHtml = btn ? btn.innerHTML : '';
  const defaultMoreLabel = '더보기 <span style="font-size:12px;opacity:0.8;">(다음 20개)</span>';
  let pageIncremented = false;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '불러오는 중...';
    }

    S.page += 1;
    pageIncremented = true;
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
    }
  } catch (e) {
    if (pageIncremented) S.page -= 1;
    console.error('[loadMore]', e);
    showToast(e && typeof e.message === 'string' ? e.message : String(e));
  } finally {
    const b = document.getElementById('btn-load-more');
    if (b) {
      b.disabled = false;
      b.innerHTML = (originalHtml && originalHtml.trim()) ? originalHtml : defaultMoreLabel;
    }
  }
};

function renderLoadMoreButton() {
  return `
    <div id="load-more-container" style="text-align: center; margin: 30px 0; width: 100%;">
      <button id="btn-load-more" class="btn btn-outline" data-action="loadMore" style="width: 100%; max-width: 400px; padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer;">
        더보기 <span style="font-size:12px;opacity:0.8;">(다음 20개)</span>
      </button>
    </div>
  `;
}

// ─────────────────────────────────────────────
// HOT DEAL FETCHING
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

async function renderHotdealDetail(myToken) {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div> 불러오는 중...</div>`;

  try {
    const rawParam = decodeURIComponent(S.postId);
    const targetUrl = rawParam.startsWith('http') ? rawParam : `https://hotdeal.zip/${rawParam}`;
    const res = await fetch(`/api/hotdeal?url=${encodeURIComponent(targetUrl)}`);
    if (S.renderToken !== myToken) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const htmlText = await res.text();
    if (S.renderToken !== myToken) return;

    let safeHtmlText = htmlText;
    if (htmlText.includes('<product_name>') || htmlText.includes('class="board-contents"') || htmlText.includes("class='board-contents'")) {
      safeHtmlText = htmlText.replace(/<td([^>]*)>/gi, '<div$1>').replace(/<\/td>/gi, '</div>');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(safeHtmlText, 'text/html');

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.content || '';
    const ogImage = doc.querySelector('meta[property="og:image"]')?.content || '';
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.content || '';

    let title = doc.querySelector('.deal-title')?.textContent?.trim() || doc.querySelector('product_name')?.textContent || ogTitle || '제목 없음';
    let price = doc.querySelector('.price-value')?.textContent?.trim() || doc.querySelector('price')?.textContent || '';
    let mall = doc.querySelector('.shop-name')?.innerText?.trim() || doc.querySelector('shopping_mall')?.textContent || '';

    let externalLinks = [];
    const buyBtn = doc.querySelector('.buy-button') || doc.querySelector('a.purchase-btn') || doc.querySelector('a[href*="outlink"]');
    if (buyBtn && buyBtn.getAttribute('href')) externalLinks.push(buyBtn.getAttribute('href'));
    if (externalLinks.length === 0) {
      const linkMatches = [...htmlText.matchAll(/<link>(.*?)<\/link>/g)];
      externalLinks = linkMatches.map(m => m[1].trim());
    }

    let contentEl =
      doc.querySelector('.board-contents') ||
      doc.querySelector('.deal-description') ||
      doc.querySelector('.post-content') ||
      doc.querySelector('.post-article') ||
      doc.querySelector('.post_content') ||
      doc.querySelector('.content-body') ||
      doc.querySelector('.view-content') ||
      doc.querySelector('.board-view-content') ||
      doc.querySelector('div[itemprop="description"]') ||
      doc.querySelector('.content') ||
      doc.querySelector('article') ||
      doc.querySelector('content');

    const originMatch = htmlText.match(/현재 URL:<\/strong>\s*(https?:\/\/[^\s<]+)/);
    const originUrl = originMatch ? originMatch[1].replace(/&amp;/g, '&') : targetUrl;
    let contentHtml = '';

    if (contentEl) {
      const originBase = (() => { try { return new URL(originUrl).origin; } catch(_) { return 'https://hotdeal.zip'; } })();

      contentEl.querySelectorAll('img').forEach(img => {
        const rawSrc =
          img.getAttribute('data-src') ||
          img.getAttribute('data-original') ||
          img.getAttribute('data-lazy-src') ||
          img.getAttribute('src') ||
          img.getAttribute('lazy-src');

        if (rawSrc) {
          if (rawSrc.startsWith('data:image')) {
            img.src = rawSrc;
            img.setAttribute('referrerpolicy', 'no-referrer');
            img.setAttribute('loading', 'lazy');
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '10px auto';
            return;
          }

          let finalUrl = rawSrc;
          try { finalUrl = new URL(rawSrc, originBase).href; }
          catch (_) {
            if (rawSrc.startsWith('//')) finalUrl = 'https:' + rawSrc;
            else if (rawSrc.startsWith('/')) finalUrl = originBase + rawSrc;
          }
          img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(finalUrl);
          img.setAttribute('onerror', `this.onerror=null;this.src=${JSON.stringify(finalUrl)};`);
        }
        img.setAttribute('referrerpolicy', 'no-referrer');
        img.setAttribute('loading', 'lazy');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px auto';
      });
      contentEl.querySelectorAll('script, style, iframe').forEach(s => s.remove());
      contentHtml = contentEl.innerHTML.trim();
    }

    if (!contentHtml || contentHtml.replace(/\s+/g, '').length < 50) {
      let bestDiv = null;
      let bestLen = 0;
      doc.body?.querySelectorAll('div').forEach(div => {
        const text = div.innerText || div.textContent || '';
        const len = text.replace(/\s+/g, '').length;
        if (len >= 500 && len > bestLen) {
          bestLen = len;
          bestDiv = div;
        }
      });
      if (bestDiv) {
        const originBase = (() => { try { return new URL(originUrl).origin; } catch(_) { return 'https://hotdeal.zip'; } })();
        bestDiv.querySelectorAll('img').forEach(img => {
          const rawSrc =
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('src') ||
            img.getAttribute('lazy-src');
          if (rawSrc) {
            if (rawSrc.startsWith('data:image')) {
              img.src = rawSrc;
              img.setAttribute('referrerpolicy', 'no-referrer');
              img.setAttribute('loading', 'lazy');
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
              img.style.display = 'block';
              img.style.margin = '10px auto';
              return;
            }

            let finalUrl = rawSrc;
            try { finalUrl = new URL(rawSrc, originBase).href; }
            catch (_) {
              if (rawSrc.startsWith('//')) finalUrl = 'https:' + rawSrc;
              else if (rawSrc.startsWith('/')) finalUrl = originBase + rawSrc;
            }
            img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(finalUrl);
            img.setAttribute('onerror', `this.onerror=null;this.src=${JSON.stringify(finalUrl)};`);
          }
          img.setAttribute('referrerpolicy', 'no-referrer');
          img.setAttribute('loading', 'lazy');
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.display = 'block';
          img.style.margin = '10px auto';
        });
        bestDiv.querySelectorAll('script, style, iframe').forEach(s => s.remove());
        contentHtml = bestDiv.innerHTML.trim();
      }
    }

    const wafKeywords = ['just a moment', 'cloudflare', '보안 확인', '로봇이 아닙니다', 'access denied', '아카라이브'];
    const wafHitByHtml = wafKeywords.some(k => htmlText.toLowerCase().includes(k.toLowerCase()));
    const contentTextLen = (() => {
      if (!contentHtml) return 0;
      const tmp = document.createElement('div');
      tmp.innerHTML = contentHtml;
      return (tmp.textContent || '').replace(/\s+/g, '').length;
    })();
    const wafHitByContent = contentTextLen > 0 && contentTextLen < 50;
    const isWafBlocked = wafHitByHtml || wafHitByContent;

    if (isWafBlocked) {
      if (post.description && post.description.trim()) {
        contentHtml = post.description.replace(/\n/g, '<br>');
      } else {
        contentHtml = `
          <div style="text-align:center; padding: 40px 20px; background: var(--bg-secondary, #f8fafc); border-radius: 12px;">
            <div style="font-size: 40px; margin-bottom: 16px;">🛡️</div>
            <h3 style="margin-bottom: 8px; color: var(--text-main);">보안 정책 안내</h3>
            <p style="color: var(--text-sub); line-height: 1.6; word-break: keep-all;">
              해당 쇼핑몰/커뮤니티의 보안 정책으로 인해 본문 미리보기를 제공할 수 없습니다.<br>
              아래 <b>[원본 링크 보러가기]</b> 버튼을 눌러 상세 정보를 확인해 주세요.
            </p>
          </div>
        `;
      }
    } else if (!contentHtml || contentHtml.length < 20) {
      contentHtml = `
        <div style="text-align:center;">
          ${ogImage ? `<img src="https://wsrv.nl/?url=${encodeURIComponent(ogImage)}" referrerpolicy="no-referrer" loading="lazy" style="max-width:100%; height:auto; border-radius:8px; margin-bottom:20px;">` : ''}
          <p style="font-size:16px; line-height:1.6; color:var(--text-main); text-align:left; word-break:keep-all;">
            ${ogDesc ? ogDesc.replace(/\n/g, '<br>') : '상세 내용은 원본 링크에서 확인해주세요.'}
          </p>
        </div>
      `;
    }

    if (S.renderToken !== myToken) return;
    el.innerHTML = `
      <div class="post-detail">
        <a class="btn btn-ghost btn-sm detail-back" data-action="historyBack" href="javascript:void(0)">← 목록으로</a>
        <div class="detail-cat">${esc(mall)}</div>
        <h1 class="detail-title">${esc(title)}</h1>
        <div class="detail-price">${esc(formatPrice(price))}</div>
        <div class="comments-section" style="padding-top:20px; border-bottom: 1px solid var(--border-color); margin-bottom: 30px; padding-bottom: 30px;">
          <div class="detail-desc" style="white-space:pre-wrap; overflow:hidden; width:100%; max-width:100%;">
            ${post.image_url ? `
              <img src="https://wsrv.nl/?url=${encodeURIComponent(post.image_url)}"
                referrerpolicy="no-referrer"
                loading="lazy"
                style="width:100%; max-width:500px; height:auto; border-radius:12px; margin-bottom:20px; display:block;">
            ` : ''}
            ${contentHtml}
          </div>
        </div>
        <div style="text-align: center; margin: 40px 0;">
          ${externalLinks.length > 0 ? `<a href="${esc(externalLinks[0])}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display: inline-flex; min-width: 200px; padding: 14px; font-size: 15px; font-weight: bold; border-radius: 8px; background: #8b5cf6; border: none; cursor:pointer;">🔗 원본 게시글 보러가기 ↗</a>` : '<p style="color: #ef4444;">원본 링크를 찾을 수 없습니다.</p>'}
        </div>
      </div>
    `;
  } catch (e) {
    if (S.renderToken !== myToken) return;
    const msg = e && typeof e.message === 'string' ? e.message : String(e);
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🚫</div><h3>핫딜을 불러올 수 없습니다</h3><p>${esc(msg)}</p></div>`;
  } finally {
    removeRenderSpinnerIfCurrent(myToken);
  }
}

// ─────────────────────────────────────────────
// FEED
// ─────────────────────────────────────────────
async function renderFeed(myToken) {
  console.log(`[renderFeed] Start - category: ${S.category}`);
  S.page = 1;
  const el = document.getElementById('content');
  el.innerHTML = '';
  el.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div> 불러오는 중...</div>`;

  try {
    if (S.category === 'hotdeal') {
      const deals = await fetchHotDeals();
      if (S.renderToken !== myToken) return;

      if (!deals || deals.length === 0) {
        if (S.renderToken !== myToken) return;
        el.innerHTML = `<div class="empty-state"><div class="empty-emoji">📭</div><h3>핫딜이 없습니다</h3><p>현재 불러올 수 있는 핫딜이 없습니다.</p></div>`;
        return;
      }

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

      if (S.renderToken !== myToken) return;
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

    const posts = await fetchPosts(S.category);
    if (S.renderToken !== myToken) return;

    const catLabel = getCatLabel(S.category);
    const isServerCat = S.category === 'inquiry';
    const canPost = isServerCat ? !!S.user : (S.role === 'seller' || S.role === 'admin');
    const createPath = isServerCat ? 'create_inquiry' : 'create';

    const cardsHtml = posts.length === 0
      ? `<div class="empty-state"><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3><p>${isServerCat ? '질문이나 건의사항을 남겨주세요.' : '곧 새로운 딜이 업로드됩니다.'}</p></div>`
      : (isServerCat ? renderInquiryListHtml(posts) : `<div class="cards-grid">${posts.map(p => cardHtml(p)).join('')}</div>`);

    if (S.renderToken !== myToken) return;
    el.innerHTML = `
      <div class="feed-header">
        <h2 class="feed-title">${esc(catLabel)}</h2>
        ${canPost ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('${createPath}')">+ 글쓰기</button>` : ''}
      </div>
      ${S.isDemo ? `<div class="demo-banner">🔧 <strong>데모 모드</strong> — main.js 상단의 Supabase 키를 입력하면 실제 데이터가 연동됩니다.</div>` : ''}
      ${cardsHtml}
      ${renderLoadMoreButton()}`;

  } catch (error) {
    console.error(`[renderFeed] Error:`, error);
    if (S.renderToken !== myToken) return;
    const msg = error && typeof error.message === 'string' ? error.message : String(error);
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>데이터를 불러오는 중 오류가 발생했습니다</h3><p>${esc(msg)}</p></div>`;
  } finally {
    removeRenderSpinnerIfCurrent(myToken);
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
    ? `<img src="https://wsrv.nl/?url=${encodeURIComponent(p.image_url)}" alt="${esc(p.title)}" class="card-img" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="card-placeholder">${getCatEmoji(p.category)}</div>`;
  return `
    <div class="post-card" data-navigate="detail" data-param="${p.id}">
      <div class="card-img-wrap">
        ${img}
        ${(p.like_count >= 10) ? `<span class="hot-badge">🔥 인기</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-cat">${esc(getCatLabel(p.category))}</div>
        <div class="card-title">${esc(p.title)}</div>
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
async function renderDetail(myToken) {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div> 불러오는 중...</div>`;

  try {
    const post = await fetchPost(S.postId);
    if (S.renderToken !== myToken) return;
    if (!post) {
      if (S.renderToken !== myToken) return;
      el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🚫</div><h3>게시글을 찾을 수 없습니다</h3></div>`;
      return;
    }
    const comments = await fetchComments(post.id);
    if (S.renderToken !== myToken) return;

    let contentHtml = post.description || '';

    if (post.purchase_link) {
      try {
        const res = await fetch(`/api/hotdeal?url=${encodeURIComponent(post.purchase_link)}`);
        if (S.renderToken !== myToken) return;
        if (res.ok) {
          const htmlText = await res.text();
          if (S.renderToken !== myToken) return;

          const safeHtml = htmlText
            .replace(/<td([^>]*)>/gi, '<div$1>')
            .replace(/<\/td>/gi, '</div>');

          const parser = new DOMParser();
          const doc = parser.parseFromString(safeHtml, 'text/html');

          const ogImage = doc.querySelector('meta[property="og:image"]')?.content || '';
          const ogDesc = doc.querySelector('meta[property="og:description"]')?.content || '';

          let contentEl =
            doc.querySelector('.board-contents') ||
            doc.querySelector('.deal-description') ||
            doc.querySelector('.post-content') ||
            doc.querySelector('.post-article') ||
            doc.querySelector('.post_content') ||
            doc.querySelector('.content-body') ||
            doc.querySelector('.view-content') ||
            doc.querySelector('.board-view-content') ||
            doc.querySelector('div[itemprop="description"]') ||
            doc.querySelector('.article-body') ||
            doc.querySelector('.content') ||
            doc.querySelector('article') ||
            doc.querySelector('content');

          const originMatch = htmlText.match(/현재 URL:<\/strong>\s*(https?:\/\/[^\s<]+)/);
          const originUrl = originMatch
            ? originMatch[1].replace(/&amp;/g, '&')
            : post.purchase_link;
          const originBase = (() => { try { return new URL(originUrl).origin; } catch(_) { return new URL(post.purchase_link).origin; } })();

          if (contentEl) {
            contentEl.querySelectorAll('img').forEach(img => {
              const rawSrc =
                img.getAttribute('data-src') ||
                img.getAttribute('data-original') ||
                img.getAttribute('data-lazy-src') ||
                img.getAttribute('src') ||
                img.getAttribute('lazy-src');

              if (rawSrc) {
                if (rawSrc.startsWith('data:image')) {
                  img.src = rawSrc;
                  img.setAttribute('referrerpolicy', 'no-referrer');
                  img.setAttribute('loading', 'lazy');
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  img.style.display = 'block';
                  img.style.margin = '10px auto';
                  return;
                }

                let finalUrl = rawSrc;
                try { finalUrl = new URL(rawSrc, originBase).href; }
                catch (_) {
                  if (rawSrc.startsWith('//')) finalUrl = 'https:' + rawSrc;
                  else if (rawSrc.startsWith('/')) finalUrl = originBase + rawSrc;
                }
                img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(finalUrl);
                img.setAttribute('onerror', `this.onerror=null;this.src=${JSON.stringify(finalUrl)};`);
              }
              img.setAttribute('referrerpolicy', 'no-referrer');
              img.setAttribute('loading', 'lazy');
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
              img.style.display = 'block';
              img.style.margin = '10px auto';
            });

            contentEl.querySelectorAll('script, style, iframe').forEach(s => s.remove());
            contentHtml = contentEl.innerHTML.trim();
          }

          if (!contentHtml || contentHtml.replace(/\s+/g, '').length < 50) {
            let bestDiv = null;
            let bestLen = 0;
            doc.body?.querySelectorAll('div').forEach(div => {
              const text = div.innerText || div.textContent || '';
              const len = text.replace(/\s+/g, '').length;
              if (len >= 500 && len > bestLen) {
                bestLen = len;
                bestDiv = div;
              }
            });
            if (bestDiv) {
              bestDiv.querySelectorAll('img').forEach(img => {
                const rawSrc =
                  img.getAttribute('data-src') ||
                  img.getAttribute('data-original') ||
                  img.getAttribute('data-lazy-src') ||
                  img.getAttribute('src') ||
                  img.getAttribute('lazy-src');
                if (rawSrc) {
                  if (rawSrc.startsWith('data:image')) {
                    img.src = rawSrc;
                    img.setAttribute('referrerpolicy', 'no-referrer');
                    img.setAttribute('loading', 'lazy');
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    img.style.display = 'block';
                    img.style.margin = '10px auto';
                    return;
                  }

                  let finalUrl = rawSrc;
                  try { finalUrl = new URL(rawSrc, originBase).href; }
                  catch (_) {
                    if (rawSrc.startsWith('//')) finalUrl = 'https:' + rawSrc;
                    else if (rawSrc.startsWith('/')) finalUrl = originBase + rawSrc;
                  }
                  img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(finalUrl);
                  img.setAttribute('onerror', `this.onerror=null;this.src=${JSON.stringify(finalUrl)};`);
                }
                img.setAttribute('referrerpolicy', 'no-referrer');
                img.setAttribute('loading', 'lazy');
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.display = 'block';
                img.style.margin = '10px auto';
              });
              bestDiv.querySelectorAll('script, style, iframe').forEach(s => s.remove());
              contentHtml = bestDiv.innerHTML.trim();
            }
          }

          const wafKeywords = ['just a moment', 'cloudflare', '보안 확인', '로봇이 아닙니다', 'access denied', '아카라이브'];
          const wafHitByHtml = wafKeywords.some(k => htmlText.toLowerCase().includes(k.toLowerCase()));
          const contentTextLen = (() => {
            if (!contentHtml) return 0;
            const tmp = document.createElement('div');
            tmp.innerHTML = contentHtml;
            return (tmp.textContent || '').replace(/\s+/g, '').length;
          })();
          const wafHitByContent = contentTextLen > 0 && contentTextLen < 50;
          const isWafBlocked = wafHitByHtml || wafHitByContent;

          if (isWafBlocked) {
            if (post.description && post.description.trim()) {
              contentHtml = post.description.replace(/\n/g, '<br>');
            } else {
              contentHtml = `
                <div style="text-align:center; padding: 40px 20px; background: var(--bg-secondary, #f8fafc); border-radius: 12px;">
                  <div style="font-size: 40px; margin-bottom: 16px;">🛡️</div>
                  <h3 style="margin-bottom: 8px; color: var(--text-main);">보안 정책 안내</h3>
                  <p style="color: var(--text-sub); line-height: 1.6; word-break: keep-all;">
                    해당 쇼핑몰/커뮤니티의 보안 정책으로 인해 본문 미리보기를 제공할 수 없습니다.<br>
                    아래 <b>[원본 링크 보러가기]</b> 버튼을 눌러 상세 정보를 확인해 주세요.
                  </p>
                </div>
              `;
            }
          } else if (!contentHtml || contentHtml.length < 20) {
            contentHtml = `
              <div style="text-align:center;">
                ${ogImage ? `<img src="${ogImage}" style="max-width:100%; height:auto; border-radius:8px; margin-bottom:20px;">` : ''}
                <p style="font-size:16px; line-height:1.6; color:var(--text-main); text-align:left; word-break:keep-all;">
                  ${ogDesc ? ogDesc.replace(/\n/g, '<br>') : (post.description || '상세 내용은 원본 링크에서 확인해주세요.')}
                </p>
              </div>
            `;
          }
        }
      } catch (scrapeErr) {
        console.warn('[renderDetail] 실시간 파싱 실패, DB description 사용:', scrapeErr.message);
        contentHtml = post.description || '';
      }
    }

    if (S.renderToken !== myToken) return;
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

        <div class="detail-desc" style="white-space:pre-wrap; overflow:hidden; width:100%; max-width:100%;">
          ${post.image_url ? `
            <img src="https://wsrv.nl/?url=${encodeURIComponent(post.image_url)}"
              referrerpolicy="no-referrer"
              loading="lazy"
              style="width:100%; max-width:500px; height:auto; border-radius:12px; margin-bottom:20px; display:block;">
          ` : ''}
          ${contentHtml}
        </div>

        ${post.purchase_link ? `
        <div style="text-align: center; margin: 30px 0; padding-top: 24px; border-top: 1px solid var(--border);">
          <a
            href="${esc(post.purchase_link)}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-primary"
            style="display: inline-flex; align-items: center; gap: 8px; min-width: 200px; padding: 14px 28px; font-size: 15px; font-weight: bold; border-radius: 8px; background: #8b5cf6; border: none; cursor: pointer; justify-content: center;">
            🔗 원본 링크 보러가기 ↗
          </a>
        </div>
        ` : ''}

        <div class="comments-section">
          <h2 class="comments-title">댓글 ${comments.length}개</h2>
          ${S.user
            ? `<div class="comment-form">
                 <textarea id="c-input" class="comment-input" placeholder="댓글을 입력해 주세요..."></textarea>
                 <button type="button" id="btn-submit-comment" class="btn btn-primary btn-sm" onclick="submitComment('${post.id}')">등록</button>
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
        </div>
      </div>`;

    if (S.renderToken !== myToken) return;
    const countEl = document.getElementById('detail-comment-count');
    if (countEl) countEl.innerText = comments.length;
  } catch (e) {
    console.error('[renderDetail]', e);
    if (S.renderToken !== myToken) return;
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>화면을 불러오는 중 오류가 발생했습니다</h3><p>${esc(e.message)}</p></div>`;
  } finally {
    removeRenderSpinnerIfCurrent(myToken);
  }
}

async function submitComment(postId) {
  const inp = document.getElementById('c-input');
  const txt = inp?.value.trim();
  const btn = document.getElementById('btn-submit-comment');
  const originalBtnHtml = btn ? btn.innerHTML : '';
  const sp = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div>';
  if (!txt) { showToast('댓글 내용을 입력해 주세요'); return; }
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${sp}등록 중...`;
    }
    await addComment(postId, txt);
    inp.value = '';
    showToast('댓글이 등록되었습니다');
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

    const countEl = document.getElementById('detail-comment-count');
    const titleEl = document.querySelector('.comments-title');
    const currentCount = parseInt(countEl?.textContent || '0', 10) + 1;
    if (countEl) countEl.textContent = currentCount;
    if (titleEl) titleEl.textContent = `댓글 ${currentCount}개`;

  } catch (e) {
    console.error('댓글 작성 오류:', e);
    showToast('오류: ' + (e?.message || String(e)));
  } finally {
    const b = document.getElementById('btn-submit-comment');
    if (b) {
      b.disabled = false;
      b.innerHTML = (originalBtnHtml && originalBtnHtml.trim()) ? originalBtnHtml : '등록';
    }
  }
}

// ─────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────
async function renderAdmin(myToken) {
  const el = document.getElementById('content');

  if (!S.isDemo && S.role !== 'admin') {
    if (S.renderToken !== myToken) return;
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🔐</div><h3>관리자만 접근할 수 있습니다</h3></div>`;
    return;
  }

  if (S.renderToken !== myToken) return;
  el.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div></div>`;

  try {
    await renderAdminContent(myToken);
  } catch (e) {
    console.error('[renderAdmin]', e);
    if (S.renderToken !== myToken) return;
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>관리 화면을 불러오지 못했습니다</h3><p>${esc(e?.message || String(e))}</p></div>`;
  } finally {
    removeRenderSpinnerIfCurrent(myToken);
  }
}

async function renderAdminContent(myToken) {
  const el = document.getElementById('content');
  try {
    if (S.renderToken !== myToken) return;
    const tabsHtml = `
    <div class="page-header"><h1>관리자 대시보드</h1><p>판매자 승인, 게시글, 카테고리, 회원 관리</p></div>
    <div class="admin-tabs">
      <button class="admin-tab${S.adminTab === 'sellers' ? ' active' : ''}" onclick="switchTab('sellers')">판매자 승인</button>
      <button class="admin-tab${S.adminTab === 'posts' ? ' active' : ''}" onclick="switchTab('posts')">게시글 승인</button>
      <button class="admin-tab${S.adminTab === 'all' ? ' active' : ''}" onclick="switchTab('all')">전체 게시글</button>
      <button class="admin-tab${S.adminTab === 'categories' ? ' active' : ''}" onclick="switchTab('categories')">카테고리 관리</button>
      <button class="admin-tab${S.adminTab === 'members' ? ' active' : ''}" onclick="switchTab('members')">👥 회원 관리</button>
    </div>
    <div id="admin-body"></div>`;
    if (S.renderToken !== myToken) return;
    el.innerHTML = tabsHtml;
    if (S.renderToken !== myToken) return;
    await renderAdminTab(myToken);
  } catch (e) {
    console.error('[renderAdminContent]', e);
    if (S.renderToken !== myToken) return;
    const msg = e && typeof e.message === 'string' ? e.message : String(e);
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>관리자 화면을 불러오지 못했습니다</h3><p>${esc(msg)}</p></div>`;
  }
}

async function switchTab(tab) {
  S.adminTab = tab;
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[['sellers', 'posts', 'all', 'categories', 'members'].indexOf(tab)]?.classList.add('active');
  const tabToken = bumpRenderToken();
  try {
    await renderAdminTab(tabToken);
  } catch (e) {
    console.error('[switchTab]', e);
    showToast(e && typeof e.message === 'string' ? e.message : String(e));
  }
}

async function renderAdminTab(myToken) {
  const body = document.getElementById('admin-body');
  if (!body) return;
  if (S.renderToken !== myToken) return;
  body.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div></div>`;

  try {
    if (S.adminTab === 'sellers') {
      const data = await fetchPendingSellers();
      if (S.renderToken !== myToken) return;
      body.innerHTML = data.length === 0 ? `<div class="empty-state" ><div class="empty-emoji">✅</div><h3>대기 중인 판매자 신청이 없습니다</h3></div>` : `<table class="admin-table"><thead><tr><th>이메일</th><th>신청일</th><th>상태</th><th>액션</th></tr></thead><tbody>${data.map(d => `<tr><td>${esc(d.users?.email || d.user_id)}</td><td>${formatDate(d.created_at)}</td><td><span class="badge badge-pending">대기중</span></td><td><div class="btn-row"><button class="btn btn-success btn-sm" onclick="approveSeller('${d.id}','${d.user_id}')">승인</button><button class="btn btn-danger btn-sm"  onclick="rejectSeller('${d.id}')">거절</button></div></td></tr>`).join('')}</tbody></table>`;
    } else if (S.adminTab === 'posts') {
      const data = await fetchPendingPosts();
      if (S.renderToken !== myToken) return;
      body.innerHTML = data.length === 0 ? `<div class="empty-state" ><div class="empty-emoji">✅</div><h3>승인 대기 게시글이 없습니다</h3></div>` : `<table class="admin-table"><thead><tr><th>제목</th><th>카테고리</th><th>가격</th><th>액션</th></tr></thead><tbody>${data.map(p => `<tr><td>${esc(p.title)}</td><td>${esc(getCatLabel(p.category))}</td><td>${esc(formatPrice(p.price))}</td><td><div class="btn-row"><button class="btn btn-success btn-sm" onclick="approvePost('${p.id}')">승인</button><button class="btn btn-danger btn-sm"  onclick="deletePost('${p.id}')">삭제</button></div></td></tr>`).join('')}</tbody></table>`;
    } else if (S.adminTab === 'all') {
      const data = await fetchAllPostsAdmin();
      if (S.renderToken !== myToken) return;

      const catSet = new Set(data.map(p => p.category).filter(Boolean));
      const catFilterOpts = ['<option value="">전체 카테고리</option>',
        ...[...catSet].sort().map(c => `<option value="${esc(c)}">${esc(getCatLabel(c))}</option>`)
      ].join('');

      const tableRows = data.length === 0
        ? ''
        : data.map(p => {
          const isAuto   = !p.users || p.category === 'hotdeal';
          const authorStr = isAuto ? '자동' : esc((p.users.email || '').split('@')[0]);
          const dateStr   = p.created_at ? formatDate(p.created_at).replace(/\.\s*/g, '/').slice(0, -1) : '-';
          return `
          <tr data-id="${esc(p.id)}" data-title="${esc(p.title.toLowerCase())}" data-cat="${esc(p.category || '')}">
            <td style="width:36px;text-align:center;"><input type="checkbox" class="admin-row-check" data-id="${esc(p.id)}" onchange="adminUpdateBulkBtn()"></td>
            <td>${esc(p.title)}</td>
            <td><select class="form-input" style="width:140px;padding:4px;" onchange="updatePostCategory('${p.id}', this.value)">${getCategoryOptionsHtml(p.category)}</select></td>
            <td><span class="badge ${p.approved ? 'badge-approved' : 'badge-pending'}">${p.approved ? '승인됨' : '대기중'}</span></td>
            <td>${p.views || 0}</td>
            <td style="font-size:12px;color:#6b7280;">${authorStr}</td>
            <td style="font-size:12px;color:#6b7280;white-space:nowrap;">${dateStr}</td>
            <td><div class="btn-row"><button class="btn btn-primary btn-sm" onclick="openEditPostModal('${p.id}')">수정</button><button class="btn btn-danger btn-sm" onclick="deletePost('${p.id}')">삭제</button></div></td>
          </tr>`;
        }).join('');

      body.innerHTML = `
        <div style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button id="btn-deep-scrape" class="btn btn-primary btn-sm" type="button">🔍 핫딜집 딥크롤링 실행</button>
            <select id="admin-cat-filter" class="form-input" style="width:160px;padding:6px 8px;" onchange="adminFilterTable()">${catFilterOpts}</select>
            <input type="text" id="admin-search" class="form-input" style="width:200px;padding:6px 8px;" placeholder="제목 검색..." oninput="adminFilterTable()">
          </div>
          <button id="btn-bulk-delete" class="btn btn-danger btn-sm" style="display:none;" onclick="bulkDeletePosts()">🗑 선택 삭제 (<span id="bulk-count">0</span>개)</button>
        </div>
        ${data.length === 0
          ? `<div class="empty-state"><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3></div>`
          : `<table class="admin-table" id="admin-all-table">
              <thead><tr>
                <th style="width:36px;text-align:center;"><input type="checkbox" id="admin-check-all" onchange="adminToggleAll(this)"></th>
                <th>제목</th><th>카테고리</th><th>상태</th><th>조회</th><th>작성자</th><th>등록일</th><th>액션</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>`
        }`;
    } else if (S.adminTab === 'members') {
      const users = await fetchAdminUsers();
      if (S.renderToken !== myToken) return;

      const roleFilterOpts = `
        <option value="">전체 회원</option>
        <option value="admin">관리자</option>
        <option value="seller">판매자</option>
        <option value="user">일반 유저</option>
        <option value="banned">정지된 유저</option>`;

      const rows = users.length === 0 ? '' : users.map(u => {
        const isBanned = u.status === 'banned';
        const isAdmin  = u.role === 'admin';
        const isSeller = u.role === 'seller';
        const roleBadge = isAdmin
          ? `<span class="badge badge-approved">관리자</span>`
          : isSeller
            ? `<span class="badge" style="background:#e0f2fe;color:#0369a1;">판매자</span>`
            : `<span class="badge" style="background:#f3f4f6;color:#374151;">일반</span>`;
        const statusBadge = isBanned
          ? `<span class="badge badge-pending">정지됨</span>`
          : `<span class="badge badge-approved">정상</span>`;
        return `
          <tr data-email="${esc((u.email || '').toLowerCase())}"
              data-role="${esc(u.role || 'user')}"
              data-status="${esc(u.status || 'active')}">
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(u.email || '')}">
              ${esc(u.email || u.id.slice(0, 8))}
            </td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td>
              <div class="btn-row">
                <button class="btn btn-sm ${isBanned ? 'btn-success' : 'btn-danger'}"
                  onclick="toggleUserBan('${esc(u.id)}', ${isBanned})">
                  ${isBanned ? '정지 해제' : '활동 정지'}
                </button>
              </div>
            </td>
          </tr>`;
      }).join('');

      body.innerHTML = `
        <div style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="member-search" class="form-input" style="width:220px;padding:6px 8px;"
            placeholder="이메일 / 닉네임 검색..." oninput="memberFilterTable()">
          <select id="member-role-filter" class="form-input" style="width:150px;padding:6px 8px;"
            onchange="memberFilterTable()">${roleFilterOpts}</select>
          <span id="member-count-label" style="font-size:13px;color:#666;margin-left:4px;">
            총 <strong>${users.length}</strong>명
          </span>
        </div>
        ${users.length === 0
          ? `<div class="empty-state"><div class="empty-emoji">👥</div><h3>회원이 없습니다</h3></div>`
          : `<div style="overflow-x:auto;">
              <table class="admin-table" id="admin-member-table">
                <thead><tr>
                  <th>이메일</th>
                  <th>권한</th>
                  <th>상태</th>
                  <th>액션</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
        }`;

    } else if (S.adminTab === 'categories') {
      // ✅ [FIX 5-B] 타임아웃 60초 → 15초
      const { data } = await withTimeout(sb.from('categories').select('*').order('sort_order', { ascending: true }), 15000);
      if (S.renderToken !== myToken) return;
      const rawList = data || [];
      const mapById = {}; rawList.forEach(c => { mapById[c.id] = { ...c, subs: [] }; });
      const rootTree = []; rawList.forEach(c => { if (c.parent_id && mapById[c.parent_id]) mapById[c.parent_id].subs.push(mapById[c.id]); else if (!c.parent_id) rootTree.push(mapById[c.id]); });
      function buildParentOpts(list, depth = 0, ancestors = []) { let opts = ''; list.forEach(c => { const prefix = '\u00a0'.repeat(depth * 4); opts += `<option value="${c.id}">${prefix}${c.name}${ancestors.length > 0 ? ' (' + ancestors[ancestors.length - 1] + ' 하위)' : ''}</option>`; if (c.subs && c.subs.length > 0) { opts += buildParentOpts(c.subs, depth + 1, [...ancestors, c.name]); } }); return opts; }
      const parentOpts = buildParentOpts(rootTree);
      const depthLabels = ['대분류', '중분류', '소분류', '하위분류'];
      function buildTableRows(list, depth = 0) {
        let rows = '';
        list.forEach(c => {
          const indent = '\u00a0\u00a0'.repeat(depth * 2);
          const depthLabel = depthLabels[depth] || `${depth + 1}단계`;
          const arrow = depth > 0 ? '↳ ' : '';
          const nameEsc = esc(c.name);
          const iconEsc = esc(c.icon || '');
          rows += `<tr id="cat-row-${c.id}">
            <td>${c.sort_order || 0}</td>
            <td><span style="color:${depth === 0 ? '#333' : depth === 1 ? '#666' : '#999'};font-size:${depth === 0 ? '13px' : '12px'}">${depthLabel}</span></td>
            <td id="cat-name-cell-${c.id}">${indent}${arrow}${nameEsc}</td>
            <td id="cat-icon-cell-${c.id}">${iconEsc}</td>
            <td>
              <div class="btn-row" id="cat-actions-${c.id}">
                <button class="btn btn-primary btn-sm" onclick="editAdminCategory('${c.id}','${nameEsc}','${iconEsc}')">수정</button>
                <button class="btn btn-danger btn-sm" onclick="deleteAdminCategory('${c.id}')">삭제</button>
              </div>
            </td>
          </tr>`;
          if (c.subs && c.subs.length > 0) rows += buildTableRows(c.subs, depth + 1);
        });
        return rows;
      }
      body.innerHTML = `<form id="admin-category-form" class="admin-category-form" style="margin-bottom: 20px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; background:#f9f9f9; padding:15px; border-radius:8px;" action="#" method="post" novalidate><input type="text" id="new-cat-name" name="new_cat_name" placeholder="카테고리명 (새 카테고리)" class="form-input" style="width:180px;" autocomplete="off" /><input type="number" id="new-cat-sort" name="new_cat_sort" placeholder="순서(숫자)" class="form-input" style="width:100px;" value="1" /><input type="text" id="new-cat-icon" name="new_cat_icon" placeholder="아이콘(예:🍎)" class="form-input" style="width:120px;" autocomplete="off" /><select id="new-cat-parent" name="new_cat_parent" class="form-input" style="width:220px;" aria-label="상위 카테고리"><option value="">(최상위 대분류)</option>${parentOpts}</select><button type="submit" id="btn-add-admin-category" class="btn btn-primary btn-sm">추가</button></form><table class="admin-table"><thead><tr><th>순서</th><th>유형</th><th>이름</th><th>아이콘</th><th>액션</th></tr></thead><tbody>${buildTableRows(rootTree)}</tbody></table>`;
    }
  } catch (e) {
    console.error('[renderAdminTab 에러]', e);
    if (S.renderToken !== myToken) return;
    body.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>데이터를 불러오지 못했습니다</h3><p>${esc(e?.message || String(e))}</p><button class="btn btn-primary" style="margin-top:16px;" onclick="switchTab('${S.adminTab}')">다시 시도</button></div>`;
  } finally {
    // ✅ [FIX 5-A] 토큰 조건 제거 — 항상 스피너 제거 (stale render 무한 로딩 방지)
    document.getElementById(`spinner-${myToken}`)?.remove();
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
  try {
    const { error } = await sb.from('posts').update({ category: newCategoryId }).eq('id', postId);
    if (error) throw error;
    showToast('해당 게시글의 카테고리가 갱신되었습니다.');
  } catch (e) {
    console.error('[updatePostCategory]', e);
    showToast('카테고리 업데이트 실패: ' + (e?.message || String(e)));
  }
};

window.addAdminCategory = async function (e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  console.log('[addAdminCategory] 트리거됨', { type: e?.type, isDemo: S.isDemo, hasSb: !!sb });

  const submitBtn = document.getElementById('btn-add-admin-category');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  const btnSpinner = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div>';

  try {
    if (S.isDemo) {
      console.warn('[addAdminCategory] 데모 모드 — Supabase 비활성');
      alert('데모 모드 등급에서는 카테고리를 추가할 수 없습니다.');
      return;
    }
    if (!sb) {
      console.error('[addAdminCategory] Supabase 클라이언트(sb)가 없습니다.');
      alert('데이터베이스에 연결되지 않았습니다. 페이지 설정을 확인해 주세요.');
      return;
    }

    const nameEl = document.getElementById('new-cat-name');
    const sortEl = document.getElementById('new-cat-sort');
    const iconEl = document.getElementById('new-cat-icon');
    const parentEl = document.getElementById('new-cat-parent');

    if (!nameEl || !sortEl || !iconEl || !parentEl) {
      console.error('[addAdminCategory] 폼 필드 DOM 누락', { nameEl: !!nameEl, sortEl: !!sortEl, iconEl: !!iconEl, parentEl: !!parentEl });
      alert('입력 폼 DOM 요소를 찾을 수 없습니다.');
      return;
    }

    const name = nameEl.value.trim();
    const sort_order = parseInt(sortEl.value, 10) || 0;
    const icon = iconEl.value.trim();
    const parent_id = parentEl.value.trim() || null;

    if (!name) {
      alert('카테고리명은 필수 항목입니다. 이름을 입력해주세요.');
      nameEl.focus();
      return;
    }

    const payload = { name, sort_order, icon };
    if (parent_id) payload.parent_id = parseInt(parent_id, 10);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `${btnSpinner}추가 중...`;
    }

    console.log('[addAdminCategory] Supabase insert 요청', payload);
    const { error } = await sb.from('categories').insert([payload]);
    if (error) {
      console.error('[addAdminCategory] Supabase insert 실패', error, { payload });
      alert('서버 DB 추가 실패: ' + error.message);
      return;
    }
    console.log('[addAdminCategory] insert 성공');

    showToast('성공: 새 카테고리가 추가되었습니다.');
    // ✅ [FIX 5-C] 버튼 먼저 복원 후 re-render (re-render 중 버튼이 로딩 상태로 보이는 버그 방지)
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHtml || '추가'; }
    await loadCategories();
    await renderAdminTab(bumpRenderToken());
    renderNav();
  } catch (err) {
    console.error('[addAdminCategory] 처리 중 예외', err);
    alert('에러 발생: 추가 버튼 처리 중 오류가 발생했습니다. (' + (err?.message || String(err)) + ')');
  } finally {
    const b = document.getElementById('btn-add-admin-category');
    if (b) {
      b.disabled = false;
      b.innerHTML = (originalBtnHtml && originalBtnHtml.trim()) ? originalBtnHtml : '추가';
    }
  }
};

document.addEventListener('submit', async function (e) {
  const form = e.target;
  if (!form || form.id !== 'admin-category-form') return;
  e.preventDefault();
  e.stopPropagation();
  console.log('[admin-category-form] submit 이벤트 — addAdminCategory 호출');
  if (typeof window.addAdminCategory === 'function') {
    await window.addAdminCategory(e);
  } else {
    console.error('[admin-category-form] addAdminCategory 미정의');
  }
});

document.addEventListener('click', async function (e) {
  const target = eventTargetElement(e);
  if (!target) return;

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

  const navEl = target.closest('[data-navigate]');
  if (navEl) {
    e.preventDefault();
    const view = navEl.getAttribute('data-navigate');
    const param = navEl.getAttribute('data-param');
    navigateTo(view, param);
    return;
  }
});

window.deleteAdminCategory = async function (id) {
  if (S.isDemo) { showToast('데모 모드 제한'); return; }
  if (!confirm('정말 삭제하시겠습니까?\n하위 카테고리가 있다면 오류가 발생할 수 있습니다.')) return;

  try {
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) throw error;
    showToast('데이터가 삭제되었습니다.');
    await loadCategories();
    await renderAdminTab(bumpRenderToken());
    renderNav();
  } catch (e) {
    console.error('[deleteAdminCategory]', e);
    showToast('삭제 실패: ' + (e?.message || String(e)));
  }
};

window.editAdminCategory = function (id, currentName, currentIcon) {
  const nameCell    = document.getElementById(`cat-name-cell-${id}`);
  const iconCell    = document.getElementById(`cat-icon-cell-${id}`);
  const actionsCell = document.getElementById(`cat-actions-${id}`);
  if (!nameCell || !iconCell || !actionsCell) return;

  const plainName = currentName.replace(/[\u00a0↳ ]/g, '').trim();
  nameCell.innerHTML = `<input id="cat-edit-name-${id}" class="form-input" style="width:140px;padding:4px 6px;" value="${esc(plainName)}">`;
  iconCell.innerHTML = `<input id="cat-edit-icon-${id}" class="form-input" style="width:70px;padding:4px 6px;" value="${esc(currentIcon)}">`;
  actionsCell.innerHTML = `
    <div class="btn-row">
      <button class="btn btn-success btn-sm" onclick="saveAdminCategory('${id}')">저장</button>
      <button class="btn btn-ghost btn-sm" onclick="renderAdminTab(bumpRenderToken())">취소</button>
    </div>`;
};

window.saveAdminCategory = async function (id) {
  if (S.isDemo) { showToast('데모 모드 제한'); return; }
  const nameVal = document.getElementById(`cat-edit-name-${id}`)?.value.trim();
  const iconVal = document.getElementById(`cat-edit-icon-${id}`)?.value.trim();
  if (!nameVal) { showToast('카테고리 이름을 입력해 주세요.'); return; }
  try {
    const { error } = await sb.from('categories').update({ name: nameVal, icon: iconVal || null }).eq('id', id);
    if (error) throw error;
    showToast('카테고리가 수정되었습니다.');
    await loadCategories();
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[saveAdminCategory]', e);
    showToast('수정 실패: ' + (e?.message || String(e)));
  }
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
      alert(`크롤링 에러 (HTTP ${res.status}):\n${data.error || JSON.stringify(data).substring(0, 300)}`);
    } else if (data.error) {
      alert(`크롤링 에러:\n${data.error}`);
    } else if (data.insertErrors && data.insertErrors.length > 0) {
      alert(`크롤링 부분 완료: ${data.added}개 추가됨\n\nInsert 에러:\n${data.insertErrors.slice(0, 3).join('\n')}`);
      await renderAdminTab(bumpRenderToken());
    } else if (data.success) {
      showToast(`크롤링 완료: ${data.added}개 추가됨 (중복 건너뜀: ${data.skipped || 0}개)`);
      await renderAdminTab(bumpRenderToken());
    } else {
      alert('스크래핑 실패 (원인 불명): ' + JSON.stringify(data).substring(0, 300));
    }
  } catch (e) {
    alert('오류 발생: ' + (e?.message || String(e)));
  } finally {
    const b = document.getElementById('btn-deep-scrape');
    if (b) {
      b.disabled = false;
      b.innerHTML = originalHtml;
    }
  }
};

document.addEventListener('click', function (e) {
  const el = eventTargetElement(e);
  if (el && el.closest('#btn-deep-scrape')) {
    window.triggerScraping();
  }
});

async function approveSeller(appId, userId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    const { error: e1 } = await sb.from('seller_applications').update({ status: 'approved' }).eq('id', appId);
    if (e1) throw e1;
    const { error: e2 } = await sb.from('users').update({ role: 'seller' }).eq('id', userId);
    if (e2) throw e2;
    showToast('판매자로 승인되었습니다');
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[approveSeller]', e);
    showToast(e?.message || String(e));
  }
}
async function rejectSeller(appId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    const { error } = await sb.from('seller_applications').update({ status: 'rejected' }).eq('id', appId);
    if (error) throw error;
    showToast('신청이 거절되었습니다');
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[rejectSeller]', e);
    showToast(e?.message || String(e));
  }
}
async function approvePost(postId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    const { error } = await sb.from('posts').update({ approved: true }).eq('id', postId);
    if (error) throw error;
    showToast('게시글이 승인되었습니다');
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[approvePost]', e);
    showToast(e?.message || String(e));
  }
}
async function openEditPostModal(postId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    const { data: post, error } = await sb.from('posts').select('*').eq('id', postId).single();
    if (error) throw error;
    const catOpts = getCategoryOptionsHtml(post.category);
    openModal(`
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-title">게시글 수정</div>
      <div class="form-group">
        <label class="form-label">제목 *</label>
        <input class="form-input" id="edit-post-title" type="text" value="${esc(post.title || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">카테고리 *</label>
        <select class="form-input" id="edit-post-cat">${catOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">가격</label>
        <input class="form-input" id="edit-post-price" type="text" value="${esc(post.price || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">상세설명</label>
        <textarea class="form-input" id="edit-post-desc" style="min-height:120px;">${esc(post.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">이미지 URL</label>
        <input class="form-input" id="edit-post-img" type="url" value="${esc(post.image_url || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">구매 링크</label>
        <input class="form-input" id="edit-post-link" type="url" value="${esc(post.purchase_link || '')}">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="edit-post-approved" ${post.approved ? 'checked' : ''}>
        <label for="edit-post-approved" class="form-label" style="margin:0;">승인됨</label>
      </div>
      <button class="btn btn-primary btn-full" style="margin-top:8px;" onclick="saveEditPost('${postId}')">저장</button>
    `);
  } catch (e) {
    console.error('[openEditPostModal]', e);
    showToast('게시글 정보를 불러오지 못했습니다: ' + (e?.message || String(e)));
  }
}

async function saveEditPost(postId) {
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  const title    = document.getElementById('edit-post-title')?.value.trim();
  const category = document.getElementById('edit-post-cat')?.value;
  const price    = document.getElementById('edit-post-price')?.value.trim();
  const desc     = document.getElementById('edit-post-desc')?.value.trim();
  const imgUrl   = document.getElementById('edit-post-img')?.value.trim();
  const link     = document.getElementById('edit-post-link')?.value.trim();
  const approved = document.getElementById('edit-post-approved')?.checked ?? false;

  if (!title || !category) { showToast('제목과 카테고리는 필수입니다'); return; }

  const btn = document.querySelector('#modal-container .btn-primary.btn-full');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  try {
    const { error } = await sb.from('posts').update({
      title,
      category,
      price: price || null,
      description: desc || null,
      image_url: imgUrl || null,
      purchase_link: link || null,
      approved,
    }).eq('id', postId);
    if (error) throw error;
    closeModal();
    showToast('게시글이 수정되었습니다');
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[saveEditPost]', e);
    showToast('수정 실패: ' + (e?.message || String(e)));
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
}

async function deletePost(postId) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  try {
    const { error } = await sb.from('posts').delete().eq('id', postId);
    if (error) throw error;
    showToast('삭제되었습니다');
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[deletePost]', e);
    showToast(e?.message || String(e));
  }
}

// ─────────────────────────────────────────────
// ADMIN: 회원 관리
// ─────────────────────────────────────────────
async function fetchAdminUsers() {
  const { data: users, error } = await withTimeout(
    sb.from('users')
      .select('id, email, role, status')
      .order('email', { ascending: true }),
    60000
  );
  if (error) throw error;
  const list = users || [];

  let postCounts = [];
  try {
    const { data: pc } = await withTimeout(
      sb.from('posts').select('user_id').neq('user_id', null),
      60000
    );
    postCounts = pc || [];
  } catch (_) {}

  let commentCounts = [];
  try {
    const { data: cc } = await withTimeout(
      sb.from('comments').select('user_id').neq('user_id', null),
      60000
    );
    commentCounts = cc || [];
  } catch (_) {}

  const postMap = {};
  (postCounts || []).forEach(r => { postMap[r.user_id] = (postMap[r.user_id] || 0) + 1; });
  const commentMap = {};
  (commentCounts || []).forEach(r => { commentMap[r.user_id] = (commentMap[r.user_id] || 0) + 1; });

  return list.map(u => ({
    ...u,
    post_count: postMap[u.id] || 0,
    comment_count: commentMap[u.id] || 0,
  }));
}

window.toggleUserBan = async function (userId, currentlyBanned) {
  const action = currentlyBanned ? '정지를 해제' : '활동을 정지';
  if (!confirm(`이 회원의 ${action}하시겠습니까?`)) return;
  const newStatus = currentlyBanned ? 'active' : 'banned';
  try {
    const { error } = await sb.from('users').update({ status: newStatus }).eq('id', userId);
    if (error) throw error;
    showToast(`회원 상태가 '${newStatus === 'banned' ? '정지됨' : '정상'}'으로 변경되었습니다.`);
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[toggleUserBan]', e);
    showToast('상태 변경 실패: ' + (e?.message || String(e)));
  }
};

window.memberFilterTable = function () {
  const keyword    = (document.getElementById('member-search')?.value || '').toLowerCase().trim();
  const roleFilter = (document.getElementById('member-role-filter')?.value || '').toLowerCase();
  const rows       = document.querySelectorAll('#admin-member-table tbody tr');
  let visible = 0;
  rows.forEach(tr => {
    const email  = tr.dataset.email  || '';
    const role   = tr.dataset.role   || 'user';
    const status = tr.dataset.status || 'active';
    const matchWord = !keyword || email.includes(keyword);
    const matchRole = !roleFilter
      || roleFilter === role
      || (roleFilter === 'banned' && status === 'banned');
    const show = matchWord && matchRole;
    tr.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const label = document.getElementById('member-count-label');
  if (label) label.innerHTML = `총 <strong>${visible}</strong>명 표시 중`;
};

// ─────────────────────────────────────────────
// ADMIN: 전체선택 / 필터 / 일괄삭제
// ─────────────────────────────────────────────
window.adminToggleAll = function (masterCb) {
  const checks = document.querySelectorAll('.admin-row-check');
  checks.forEach(cb => {
    if (cb.closest('tr').style.display !== 'none') {
      cb.checked = masterCb.checked;
    }
  });
  adminUpdateBulkBtn();
};

window.adminUpdateBulkBtn = function () {
  const checked = [...document.querySelectorAll('.admin-row-check')].filter(cb => cb.checked);
  const btn = document.getElementById('btn-bulk-delete');
  const countEl = document.getElementById('bulk-count');
  if (!btn) return;
  if (checked.length > 0) {
    btn.style.display = '';
    if (countEl) countEl.textContent = checked.length;
  } else {
    btn.style.display = 'none';
  }
};

window.adminFilterTable = function () {
  const catVal   = (document.getElementById('admin-cat-filter')?.value  || '').toLowerCase();
  const keyword  = (document.getElementById('admin-search')?.value      || '').toLowerCase().trim();
  const rows     = document.querySelectorAll('#admin-all-table tbody tr');
  rows.forEach(tr => {
    const title = tr.dataset.title || '';
    const cat   = (tr.dataset.cat  || '').toLowerCase();
    const matchCat  = !catVal   || cat === catVal;
    const matchWord = !keyword  || title.includes(keyword);
    tr.style.display = (matchCat && matchWord) ? '' : 'none';
  });
  const masterCb = document.getElementById('admin-check-all');
  if (masterCb) masterCb.checked = false;
  adminUpdateBulkBtn();
};

window.bulkDeletePosts = async function () {
  const checked = [...document.querySelectorAll('.admin-row-check')].filter(cb => cb.checked);
  if (checked.length === 0) return;
  if (!confirm(`선택한 ${checked.length}개의 게시글을 삭제하시겠습니까?`)) return;
  if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
  const ids = checked.map(cb => cb.dataset.id);
  try {
    const { error } = await sb.from('posts').delete().in('id', ids);
    if (error) throw error;
    showToast(`${ids.length}개 게시글이 삭제되었습니다.`);
    await renderAdminTab(bumpRenderToken());
  } catch (e) {
    console.error('[bulkDeletePosts]', e);
    showToast('삭제 실패: ' + (e?.message || String(e)));
  }
};

// ─────────────────────────────────────────────
// SELLER APPLY
// ─────────────────────────────────────────────
function renderApply(_myToken) {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `
      <div class="form-card">
        <div class="page-header"><h1>판매자 신청</h1><p>판매자가 되어 재고 딜을 올려보세요.</p></div>
        <p style="color:var(--text-sub);margin-bottom:16px;">판매자 신청을 위해 먼저 로그인이 필요합니다.</p>
        <button class="btn btn-primary" onclick="showLoginModal()">로그인하기</button>
      </div>`;
    return;
  }
  if (S.role === 'seller' || S.role === 'admin') {
    el.innerHTML = `<div class="form-card"><div class="empty-state"><div class="empty-emoji">🎉</div><h3>이미 판매자입니다</h3><p>상단 '+ 글쓰기' 버튼으로 딜을 올려보세요.</p></div></div>`;
    return;
  }
  el.innerHTML = `
      <div class="form-card">
      <div class="page-header"><h1>판매자 신청</h1><p>신청 후 관리자 검토를 거쳐 승인됩니다.</p></div>
      <div class="form-group">
        <label class="form-label">이메일</label>
        <input class="form-input" type="text" value="${esc(S.user.email)}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label">판매 상품 소개</label>
        <textarea class="form-input" id="apply-desc" placeholder="어떤 재고를 판매하실 예정인지 간략히 적어주세요."></textarea>
      </div>
      <button type="button" id="btn-submit-apply" class="btn btn-primary btn-full" onclick="submitApply()">신청하기</button>
    </div>`;
}

async function submitApply() {
  const btn = document.getElementById('btn-submit-apply');
  const originalHtml = btn ? btn.innerHTML : '';
  const sp = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></div>';
  try {
    if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${sp}신청 중...`;
    }

    const rawSession = localStorage.getItem('sb-ohjmvkmuhuoiuguetmyp-auth-token');
    const accessToken = rawSession ? JSON.parse(rawSession)?.access_token : null;
    if (!accessToken) throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/seller_applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ user_id: S.user.id, status: 'pending' }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`DB 저장 실패 (${res.status}): ${errText}`);
    }

    showToast('신청이 접수되었습니다. 검토 후 승인됩니다.');
    navigateTo('feed');
  } catch (e) {
    console.error('[submitApply 에러]');
    console.dir(e);
    showToast('오류: ' + (e?.message || String(e)));
  } finally {
    const b = document.getElementById('btn-submit-apply');
    if (b) {
      b.disabled = false;
      b.innerHTML = (originalHtml && originalHtml.trim()) ? originalHtml : '신청하기';
    }
  }
}

// ─────────────────────────────────────────────
// CREATE INQUIRY
// ─────────────────────────────────────────────
function renderCreateInquiry(_myToken) {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `<div class="form-card"><div class="empty-state"><div class="empty-emoji">🔒</div><h3>로그인이 필요합니다</h3></div></div>`;
    return;
  }

  el.innerHTML = `
      <div class="form-card">
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
      <button type="button" id="btn-submit-inquiry" class="btn btn-primary btn-full" onclick="submitInquiry()">등록 하기</button>
    </div>`;
}

async function submitInquiry() {
  const btn = document.getElementById('btn-submit-inquiry');
  const originalHtml = btn ? btn.innerHTML : '';
  const sp = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></div>';
  try {
    const titleEl = document.getElementById('i-title');
    const descEl = document.getElementById('i-desc');
    const title = titleEl ? titleEl.value.trim() : '';
    const desc = descEl ? descEl.value.trim() : '';
    if (!title || !desc) { showToast('제목과 내용을 모두 입력해주세요'); return; }

    if (S.isDemo) {
      DEMO_POSTS.unshift({ id: Date.now(), title, description: desc, price: '', image_url: null, category: 'inquiry', views: 0, comment_count: 0, approved: true, is_hot: false });
      showToast('문의가 등록되었습니다 (데모)');
      selectCat('inquiry');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${sp}등록 중...`;
    }

    const rawSession = localStorage.getItem('sb-ohjmvkmuhuoiuguetmyp-auth-token');
    const accessToken = rawSession ? JSON.parse(rawSession)?.access_token : null;
    if (!accessToken) throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: S.user.id,
          title: String(title),
          description: String(desc),
          category: 'inquiry',
          price: null,
          views: 0,
          comment_count: 0,
          approved: true,
          is_hot: false
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`DB 저장 실패 (${res.status}): ${errText}`);
    }

    showToast('문의가 등록되었습니다');
    selectCat('inquiry');
  } catch (e) {
    console.error('[submitInquiry 에러]');
    console.dir(e);
    showToast('오류: ' + (e?.message || String(e)));
  } finally {
    const b = document.getElementById('btn-submit-inquiry');
    if (b) {
      b.disabled = false;
      b.innerHTML = (originalHtml && originalHtml.trim()) ? originalHtml : '등록 하기';
    }
  }
}

// ─────────────────────────────────────────────
// CREATE POST
// ─────────────────────────────────────────────
function getLeafCategories(items = CATEGORIES, forbiddenIds = [], ancestorLabels = []) {
  const forbidden = new Set((forbiddenIds || []).map(String));
  let leaves = [];
  for (const c of items) {
    if (forbidden.has(String(c.id))) continue;
    const chain = [...ancestorLabels, c.label];
    if (c.subs && c.subs.length > 0) {
      leaves = leaves.concat(getLeafCategories(c.subs, forbiddenIds, chain));
    } else {
      leaves.push({
        ...c,
        pathLabel: chain.join(' > '),
      });
    }
  }
  return leaves;
}

function renderCreate(_myToken) {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `<div class="form-card"><div class="empty-state"><div class="empty-emoji">🔒</div><h3>로그인이 필요합니다</h3></div></div>`;
    return;
  }
  if (S.role !== 'seller' && S.role !== 'admin') {
    el.innerHTML = `<div class="form-card"><div class="empty-state"><div class="empty-emoji">🚫</div><h3>판매자 계정이 필요합니다</h3><p>판매자 신청 후 관리자 승인이 필요합니다.</p><br><button class="btn btn-primary" onclick="navigateTo('apply')">판매자 신청하기</button></div></div>`;
    return;
  }

  const allLeaves = getLeafCategories(CATEGORIES, []);
  const forbidden = ['핫딜', '인기', '문의'];
  const selectable = allLeaves.filter(c => {
    const str = (c.label + ' ' + c.name + ' ' + c.pathLabel).replace(/\s/g, '');
    return !forbidden.some(kw => str.includes(kw));
  });

  const catOptions = selectable.map(s =>
    `<option value="${esc(String(s.id))}">${esc(s.pathLabel || s.label)}</option>`
  ).join('');

  el.innerHTML = `
      <div class="form-card">
      <div class="page-header"><h1>딜 등록</h1><p>관리자 승인 후 공개됩니다.</p></div>

      ${S.role === 'admin' ? `
      <div class="form-group" style="background:#f0f7ff;border:1.5px solid #b3d4f5;border-radius:10px;padding:14px 16px 12px;">
        <label class="form-label" style="color:#1a6bbf;font-weight:700;">📷 밴드 게시글 자동 불러오기 <span style="font-size:11px;font-weight:400;color:#555;">(선택사항)</span></label>
        <div style="display:flex;gap:8px;align-items:stretch;">
          <input class="form-input" id="p-band-url" type="url" placeholder="https://www.band.us/page/..." style="flex:1;min-width:0;">
          <button type="button" id="btn-fetch-band" class="btn btn-primary btn-sm" onclick="fetchBandPost()" style="white-space:nowrap;padding:0 14px;">자동 불러오기</button>
        </div>
        <p style="margin:6px 0 0;font-size:11px;color:#666;">밴드 링크를 붙여넣고 버튼을 누르면 이미지·제목이 자동으로 채워집니다.</p>
        <div style="margin-top:10px;">
          <button type="button"
            onclick="(function(btn){const el=document.getElementById('p-band-body-wrap');const open=el.style.display!=='none';el.style.display=open?'none':'block';btn.textContent=open?'📋 밴드 본문 직접 붙여넣기 (선택) ▼':'📋 밴드 본문 직접 붙여넣기 (선택) ▲';})(this)"
            style="background:none;border:none;color:#1a6bbf;font-size:12px;font-weight:600;cursor:pointer;padding:0;">
            📋 밴드 본문 직접 붙여넣기 (선택) ▼
          </button>
          <div id="p-band-body-wrap" style="display:none;margin-top:8px;">
            <textarea id="p-band-body" class="form-input"
              style="min-height:100px;font-size:13px;"
              placeholder="밴드 앱/웹에서 게시글 본문을 복사해서 붙여넣으세요"></textarea>
            <p style="margin:4px 0 0;font-size:11px;color:#888;">밴드 보안 정책으로 자동 추출이 제한될 수 있습니다. 본문이 잘리면 여기에 직접 붙여넣어 주세요.</p>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="form-group"><label class="form-label">제목 *</label><input class="form-input" id="p-title" type="text" placeholder="상품명 + 핵심 특징"></div>
      <div class="form-group"><label class="form-label">카테고리 *</label><select class="form-input" id="p-cat">${catOptions}</select></div>
      <div class="form-group"><label class="form-label">가격 *</label><input class="form-input" id="p-price" type="text" placeholder="예: 35,000원/kg"></div>
      <div class="form-group"><label class="form-label">상세 설명 *</label><textarea class="form-input" id="p-desc" style="min-height:130px;" placeholder="상품 상태, 수량, 배송 방법 등을 자세히 적어주세요."></textarea></div>
      <div class="form-group">
        <label class="form-label">이미지</label>
        <input class="form-input" id="p-img-file" type="file" accept="image/*" multiple
          style="padding:6px;"
          onchange="uploadPostImages(this)">
        <div id="p-img-upload-status" style="display:none;margin-top:6px;font-size:13px;color:#6b7280;align-items:center;gap:6px;">
          <div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;flex-shrink:0;"></div>
          <span>업로드 중...</span>
        </div>
        <input class="form-input" id="p-img" type="url" placeholder="https://... (직접 입력 또는 파일 업로드)" style="margin-top:8px;">
        <div id="p-img-picker" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px;"></div>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">이미지 링크 직접 입력 (최대 5개)</div>
          ${[1,2,3,4,5].map(i => `
          <input class="form-input img-url-input" id="img-url-${i}" type="url"
            placeholder="이미지 링크 ${i} — https://coresos.phinf.naver.net/..."
            style="font-size:13px;padding:6px 10px;">`).join('')}
        </div>
      </div>
      <div class="form-group"><label class="form-label">구매 링크</label><input class="form-input" id="p-link" type="url" placeholder="https://..."></div>
      <button type="button" id="btn-submit-post" class="btn btn-primary btn-full" onclick="submitPost()">등록 신청</button>
    </div>`;

  // 북마크릿에서 전달된 bandData 파라미터 자동 채우기
  setTimeout(() => {
    const hashParts = window.location.hash.split('?');
    if (hashParts.length < 2) return;
    const params = new URLSearchParams(hashParts[1]);
    const raw = params.get('bandData');
    if (!raw) return;
    try {
      const bandData = JSON.parse(decodeURIComponent(raw));
      if (bandData.body) {
        const descEl = document.getElementById('p-desc');
        if (descEl) descEl.value = bandData.body;
        const bandBodyEl = document.getElementById('p-band-body');
        if (bandBodyEl) {
          bandBodyEl.value = bandData.body;
          const wrap = document.getElementById('p-band-body-wrap');
          if (wrap) wrap.style.display = 'block';
        }
      }
      if (bandData.title) {
        const titleEl = document.getElementById('p-title');
        if (titleEl && !titleEl.value) titleEl.value = bandData.title;
      }
      if (bandData.images && bandData.images.length > 0) {
        const imgEl = document.getElementById('p-img');
        if (imgEl) imgEl.value = bandData.images[0];
        bandData.images.forEach((url, i) => {
          const el = document.getElementById('img-url-' + (i + 1));
          if (el) el.value = url;
        });
      }
      if (bandData.url) {
        const linkEl = document.getElementById('p-link');
        if (linkEl && !linkEl.value) linkEl.value = bandData.url;
        const bandUrlEl = document.getElementById('p-band-url');
        if (bandUrlEl) bandUrlEl.value = bandData.url;
      }
      showToast('📋 밴드에서 본문 ' + (bandData.body || '').length + '자, 이미지 ' + (bandData.images || []).length + '개를 가져왔습니다!');
      history.replaceState(null, '', '#/create');
    } catch (e) {
      console.error('[bookmarklet data parse]', e);
    }
  }, 300);
}

async function submitPost() {
  const btn = document.getElementById('btn-submit-post');
  const spinnerHtml = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></div>';

  try {
    if (S.isDemo) { showToast('데모 모드에서는 사용할 수 없습니다'); return; }
    if (!sb || !S.user) { showToast('로그인 또는 데이터 연결이 필요합니다'); showLoginModal(); return; }

    const titleEl = document.getElementById('p-title');
    const catEl = document.getElementById('p-cat');
    const priceEl = document.getElementById('p-price');
    const descEl = document.getElementById('p-desc');
    const imgEl = document.getElementById('p-img');
    const linkEl = document.getElementById('p-link');

    const title = titleEl ? String(titleEl.value).trim() : '';
    const cat = catEl ? String(catEl.value).trim() : '';
    const price = priceEl ? String(priceEl.value).trim() : '';
    // p-band-body 직접 입력값 우선, 없으면 p-desc 사용
    const bandBodyEl = document.getElementById('p-band-body');
    const bandBodyVal = bandBodyEl ? bandBodyEl.value.trim() : '';
    if (bandBodyVal && descEl) descEl.value = bandBodyVal; // p-desc에도 반영
    const desc = bandBodyVal || (descEl ? String(descEl.value).trim() : '');
    const purchase_link = linkEl && linkEl.value.trim() ? linkEl.value.trim() : null;

    // 이미지 링크 입력란 1~5 수집 (빈 값 제외)
    const extraImgUrls = [1,2,3,4,5]
      .map(i => document.getElementById(`img-url-${i}`)?.value.trim())
      .filter(Boolean);
    // URL 입력란 첫 번째 > p-img 순으로 우선 사용
    const image_url = extraImgUrls[0] || (imgEl && imgEl.value.trim() ? imgEl.value.trim() : null);

    if (!title || !cat || !price || !desc) {
      showToast('필수 항목을 모두 입력해 주세요');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${spinnerHtml}등록 중...`;
    }

    const rawSession = localStorage.getItem('sb-ohjmvkmuhuoiuguetmyp-auth-token');
    const accessToken = rawSession ? JSON.parse(rawSession)?.access_token : null;
    if (!accessToken) throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.');

    const insertPayload = {
      title: String(title),
      category: String(cat),
      price: String(price),
      description: String(desc),
      image_url,
      purchase_link,
      is_hot: false,
      approved: S.role === 'admin',
      views: 0,
      comment_count: 0,
      user_id: S.user.id
    };

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(insertPayload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`DB 저장 실패 (${res.status}): ${errText}`);
    }

    showToast(S.role === 'admin'
      ? '등록이 완료되었습니다. 바로 피드에 공개됩니다.'
      : '등록 신청 완료! 관리자 승인 후 공개됩니다.');
    if (titleEl) titleEl.value = '';
    if (catEl) catEl.selectedIndex = 0;
    if (priceEl) priceEl.value = '';
    if (descEl) descEl.value = '';
    if (imgEl) imgEl.value = '';
    if (linkEl) linkEl.value = '';

    navigateTo('feed');
  } catch (e) {
    console.error('[submitPost 에러]');
    console.dir(e);
    const msg = e && typeof e.message === 'string' ? e.message : String(e);
    showToast('오류 발생: ' + msg);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '등록 신청';
    }
  }
}

window.submitPost = submitPost;

// ─────────────────────────────────────────────
// 이미지 파일 업로드 → R2
// ─────────────────────────────────────────────
window.uploadPostImages = async function (input) {
  const files = input.files;
  if (!files || files.length === 0) return;

  const statusEl = document.getElementById('p-img-upload-status');
  const imgEl    = document.getElementById('p-img');
  const pickerEl = document.getElementById('p-img-picker');

  // 업로드 중 표시
  if (statusEl) { statusEl.style.display = 'flex'; }
  if (pickerEl) { pickerEl.style.display = 'none'; pickerEl.innerHTML = ''; }

  try {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok || !data.success) throw new Error(data.error || '업로드 실패');

    const urls = data.urls || [];
    if (urls.length === 0) throw new Error('업로드된 URL이 없습니다');

    // 첫 번째 이미지 자동 입력
    if (imgEl) imgEl.value = urls[0];

    // 썸네일 피커 표시 (2장 이상)
    if (pickerEl && urls.length > 1) {
      pickerEl.style.display = 'flex';
      pickerEl.innerHTML = urls.map((url, i) => `
        <img src="${url}"
          data-url="${url}"
          style="width:70px;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;border:3px solid ${i === 0 ? 'var(--primary,#2563eb)' : '#ddd'};transition:border-color 0.15s;"
          loading="lazy"
          title="이미지 ${i + 1} 선택"
          onclick="
            document.getElementById('p-img').value=this.dataset.url;
            document.getElementById('p-img-picker').querySelectorAll('img').forEach(el=>el.style.borderColor='#ddd');
            this.style.borderColor='var(--primary,#2563eb)';
          ">
      `).join('');
    }

    showToast(`이미지 ${urls.length}장 업로드 완료`);
  } catch (e) {
    console.error('[uploadPostImages]', e);
    showToast('이미지 업로드 실패: ' + (e?.message || String(e)));
  } finally {
    if (statusEl) statusEl.style.display = 'none';
    // 파일 input 초기화 (같은 파일 재선택 가능하게)
    input.value = '';
  }
};

// ─────────────────────────────────────────────
// BAND 게시글 자동 불러오기
// ─────────────────────────────────────────────
window.fetchBandPost = async function () {
  const bandUrlEl = document.getElementById('p-band-url');
  const btn       = document.getElementById('btn-fetch-band');
  const bandUrl   = bandUrlEl ? bandUrlEl.value.trim() : '';

  if (!bandUrl) { showToast('밴드 게시글 링크를 입력해 주세요'); return; }
  if (!bandUrl.includes('band.us')) { showToast('band.us 링크만 지원합니다'); return; }

  const sp = '<div class="spinner" style="width:13px;height:13px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div>';
  const originalHtml = btn ? btn.innerHTML : '자동 불러오기';

  try {
    if (btn) { btn.disabled = true; btn.innerHTML = `${sp}페이지 분석 중...`; }

    const res  = await fetch(`/api/band?url=${encodeURIComponent(bandUrl)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast('불러오기 실패: ' + (data.error || '알 수 없는 오류'));
      return;
    }

    const originalImages = data.images && data.images.length > 0
      ? data.images
      : (data.image_url ? [data.image_url] : []);

    const imgEl    = document.getElementById('p-img');
    const pickerEl = document.getElementById('p-img-picker');
    const linkEl   = document.getElementById('p-link');
    const titleEl  = document.getElementById('p-title');
    const priceEl  = document.getElementById('p-price');
    const descEl   = document.getElementById('p-desc');

    if (imgEl && originalImages.length > 0) imgEl.value = originalImages[0];

    if (pickerEl) {
      if (originalImages.length > 1) {
        pickerEl.style.display = 'flex';
        pickerEl.innerHTML = originalImages.map((origUrl, i) => {
          const proxyUrl = `/api/imgproxy?url=${encodeURIComponent(origUrl)}`;
          return `
          <img src="${proxyUrl}"
            data-url="${esc(origUrl)}"
            style="width:70px;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;
                   border:3px solid ${i === 0 ? 'var(--primary, #2563eb)' : '#ddd'};
                   transition:border-color 0.15s;"
            loading="lazy"
            title="이미지 ${i + 1} 선택"
            onclick="
              document.getElementById('p-img').value=this.dataset.url;
              document.getElementById('p-img-picker').querySelectorAll('img')
                .forEach(el => el.style.borderColor='#ddd');
              this.style.borderColor='var(--primary, #2563eb)';
            ">
        `;
        }).join('');
      } else {
        pickerEl.style.display = 'none';
        pickerEl.innerHTML = '';
      }
    }

    if (linkEl && !linkEl.value.trim()) linkEl.value = bandUrl;

    if (data.ai) {
      if (titleEl && data.ai.name)        titleEl.value = data.ai.name;
      if (priceEl && data.ai.price)       priceEl.value = data.ai.price;
      // p-band-body 직접 입력값이 있으면 그것을 우선 사용
      const bandBodyEl = document.getElementById('p-band-body');
      const bandBodyVal = bandBodyEl ? bandBodyEl.value.trim() : '';
      if (descEl && data.ai.description && !bandBodyVal) descEl.value = data.ai.description;

      // description이 200자 미만이면 본문 잘림 경고 + 토글 자동 펼침
      const finalDesc = bandBodyVal || (descEl ? descEl.value : '');
      if (finalDesc.length < 200) {
        const wrap = document.getElementById('p-band-body-wrap');
        if (wrap) wrap.style.display = 'block';
        if (bandBodyEl) {
          bandBodyEl.style.border = '2px solid #f59e0b';
          bandBodyEl.style.transition = 'border-color 0.3s';
          setTimeout(() => { if (bandBodyEl) bandBodyEl.style.border = ''; }, 3000);
          bandBodyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        showToast('⚠️ 밴드 보안 정책으로 본문이 잘렸습니다. 밴드에서 본문을 복사해서 아래에 붙여넣어 주세요.');
      } else {
        const imgCount = originalImages.length;
        showToast(`✅ AI 분석 완료! 이미지 ${imgCount}개, 내용을 확인 후 등록하세요.`);
      }
    } else if (data.ai_error) {
      showToast('⚠️ AI 분석 한도 초과: 이미지만 자동으로 불러옵니다.');
    } else {
      const skipped = data.ai_skipped || '원인 불명';
      if (skipped.includes('OPENAI_API_KEY')) {
        showToast('⚠️ OpenAI API 키 미설정 — Cloudflare Pages 환경변수에 OPENAI_API_KEY를 추가해주세요.');
      } else if (skipped.includes('텍스트 없음') || skipped.includes('body_too_short')) {
        showToast('⚠️ AI 분석 실패: 밴드 게시글에서 본문을 가져오지 못했습니다.');
      } else {
        showToast('⚠️ AI 분석 실패: ' + skipped);
      }
      console.warn('[fetchBandPost] ai_skipped:', skipped);
    }
  } catch (e) {
    console.error('[fetchBandPost]', e);
    showToast('오류: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
};

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal-container').innerHTML = `<div class="modal">${html}</div>`;
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-container').innerHTML = '';
}

function showLoginModal() {
  openModal(`
      <button class="modal-close" onclick="closeModal()">✕</button>
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
    <button type="button" id="modal-btn-login" class="btn btn-primary btn-full" onclick="modalLogin()">로그인</button>
    <div class="modal-switch">계정이 없으신가요? <a onclick="showSignupModal()">판매자 가입</a></div>`);
  setTimeout(() => document.getElementById('l-email')?.focus(), 50);
}

function showSignupModal() {
  openModal(`
      <button class="modal-close" onclick="closeModal()">✕</button>
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
    <button type="button" id="modal-btn-signup" class="btn btn-primary btn-full" onclick="modalSignup()">가입하기</button>
    <div class="modal-switch">이미 계정이 있으신가요? <a onclick="showLoginModal()">로그인</a></div>`);
  setTimeout(() => document.getElementById('s-email')?.focus(), 50);
}

async function modalLogin() {
  const email = document.getElementById('l-email')?.value.trim();
  const pw = document.getElementById('l-pw')?.value;
  const errEl = document.getElementById('modal-err');
  const btn = document.getElementById('modal-btn-login');
  const originalHtml = btn ? btn.innerHTML : '';
  try {
    if (!email || !pw) {
      if (errEl) errEl.textContent = '이메일과 비밀번호를 입력해 주세요';
      return;
    }
    if (errEl) errEl.textContent = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '로그인 중...';
    }
    await doLogin(email, pw);
  } catch (e) {
    if (errEl) errEl.textContent = e?.message || String(e);
  } finally {
    const b = document.getElementById('modal-btn-login');
    const modal = document.getElementById('modal-container');
    if (b && modal?.contains(b)) {
      b.disabled = false;
      b.innerHTML = (originalHtml && originalHtml.trim()) ? originalHtml : '로그인';
    }
  }
}

async function modalSignup() {
  const email = document.getElementById('s-email')?.value.trim();
  const pw = document.getElementById('s-pw')?.value;
  const errEl = document.getElementById('modal-err');
  const btn = document.getElementById('modal-btn-signup');
  const originalHtml = btn ? btn.innerHTML : '';
  try {
    if (!email || !pw) {
      if (errEl) errEl.textContent = '이메일과 비밀번호를 입력해 주세요';
      return;
    }
    if (pw.length < 6) {
      if (errEl) errEl.textContent = '비밀번호는 6자 이상이어야 합니다';
      return;
    }
    if (errEl) errEl.textContent = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '가입 중...';
    }
    await doSignup(email, pw);
  } catch (e) {
    if (errEl) errEl.textContent = e?.message || String(e);
  } finally {
    const b = document.getElementById('modal-btn-signup');
    const modal = document.getElementById('modal-container');
    if (b && modal?.contains(b)) {
      b.disabled = false;
      b.innerHTML = (originalHtml && originalHtml.trim()) ? originalHtml : '가입하기';
    }
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
  const sessionResult = await Promise.allSettled([
    loadCategories(),
    sb ? sb.auth.getSession() : Promise.resolve(null),
  ]);

  if (sessionResult[0].status === 'rejected') {
    console.error('[init] loadCategories', sessionResult[0].reason);
    showToast(sessionResult[0].reason?.message || '카테고리를 불러오지 못했습니다');
  }

  if (sb) {
    if (sessionResult[1].status === 'fulfilled' && sessionResult[1].value) {
      try {
        const { data: sessionData } = sessionResult[1].value;
        const session = sessionData?.session ?? null;
        if (session) { S.user = session.user; await loadRole(); }
      } catch (e) {
        console.error('[init] getSession parse', e);
        showToast(e?.message || '세션을 확인하지 못했습니다');
      }
    } else if (sessionResult[1].status === 'rejected') {
      console.error('[init] getSession', sessionResult[1].reason);
      showToast(sessionResult[1].reason?.message || '세션을 확인하지 못했습니다');
    }

    sb.auth.onAuthStateChange(async (_event, session) => {
      try {
        S.user = session?.user || null;
        if (S.user) await loadRole(); else S.role = null;
        renderNav();
      } catch (e) {
        console.error('[onAuthStateChange]', e);
      }
    });
  }

  setInterval(async () => {
    try {
      await sb.from('categories').select('id').limit(1);
      console.log('[keepalive] Supabase 연결 유지');
    } catch (_) {}
  }, 4 * 60 * 1000);

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

init();
