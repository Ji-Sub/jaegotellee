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
  /** 비동기 렌더 경쟁 방지용 번호표 — navigate 시마다 증가, stale 작업은 DOM 갱신·스피너 제거를 건너뜀 */
  renderToken: 0,
};

/** SPA 비동기 렌더 Race Condition 방지: 새 화면 진입 시마다 호출해 고유 번호표를 발급 */
function bumpRenderToken() {
  S.renderToken += 1;
  return S.renderToken;
}

/** 해당 번호표가 여전히 현재 렌더일 때만 스피너 DOM 제거 (다른 화면 스피너를 지우지 않음) */
function removeRenderSpinnerIfCurrent(myToken) {
  if (S.renderToken !== myToken) return;
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
  // 숫자·콤마·점만으로 이루어진 순수 숫자 문자열이면 천단위 콤마 + '원'
  if (/^[\d,.]+$/.test(str)) {
    const num = Number(str.replace(/,/g, ''));
    if (!isNaN(num)) return num.toLocaleString('ko-KR') + '원';
  }
  // 혼합 문자열(한글·괄호·영문 등)은 원문 그대로, '원'이 없으면 '원' 추가
  return str.includes('원') ? str : str + '원';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Promise에 타임아웃을 건다.
 * Supabase 응답이 없을 때 무한 로딩 방지용.
 */
function withTimeout(promise, ms = 12000, msg = '요청 시간이 초과되었습니다. 네트워크를 확인해 주세요.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Supabase Cold Start 대비 지능형 재시도 래퍼.
 * 타임아웃 에러가 발생하면 2초 대기 후 최대 2회 자동 재시도한다.
 * @param {Function} makeFn  - () => Supabase insert promise 를 반환하는 팩토리 함수
 * @param {Object}   opts
 *   @param {Element|null} opts.btn       - 버튼 DOM (없으면 null)
 *   @param {string}       opts.sp        - 스피너 HTML 문자열
 *   @param {string}       opts.baseLabel - 최초 로딩 텍스트 (예: '등록 중...')
 *   @param {number}       [opts.ms=15000]- 1회 시도 타임아웃(ms)
 */
async function retryInsert(makeFn, { btn, sp, baseLabel = '등록 중...', ms = 15000 } = {}) {
  const MAX_RETRIES = 2;
  const isTimeoutErr = (e) => {
    const msg = (e?.message || String(e)).toLowerCase();
    return msg.includes('시간이 초과') || msg.includes('timeout');
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 재시도 전 2초 대기 + 버튼 텍스트 갱신
      if (btn) btn.innerHTML = `${sp}재시도 중 (${attempt}/${MAX_RETRIES})...`;
      await new Promise(r => setTimeout(r, 2000));
    }
    try {
      const { error } = await withTimeout(makeFn(), ms);
      if (error) throw error;
      return; // 성공
    } catch (e) {
      lastErr = e;
      // 타임아웃이 아닌 에러거나 마지막 시도면 즉시 상위로 throw
      if (!isTimeoutErr(e) || attempt === MAX_RETRIES) throw e;
      console.warn(`[retryInsert] 타임아웃, ${attempt + 1}/${MAX_RETRIES + 1} 시도 후 재시도 예정`, e.message);
    }
  }
  throw lastErr;
}

/** 공백·띄어쓰기 제거 (딜 등록 카테고리 필터 등) */
function stripSpaces(str) {
  return String(str || '').replace(/\s/g, '');
}

/** 딜 등록 폼: 라벨/이름/경로에서 공백 제거 후 금지 키워드 포함 시 제외 (ID 기준 필터 아님) */
const DEAL_CREATE_FORBIDDEN_KEYWORDS = ['핫딜', '인기', '문의'];
function isForbiddenDealCreateCategoryLeaf(c) {
  const normLabel = stripSpaces(c.label);
  const normName = stripSpaces(c.name);
  const normPath = stripSpaces(c.pathLabel);
  return DEAL_CREATE_FORBIDDEN_KEYWORDS.some(
    kw => normLabel.includes(kw) || normName.includes(kw) || normPath.includes(kw)
  );
}

/** 클릭 이벤트에서 e.target이 Text 노드 등이면 .closest가 없어 예외가 납니다 → Element로 정규화 */
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
  if (category === 'hotdeal') q = q.eq('is_hot', true);
  else if (category === 'popular') {
    q = sb.from('posts').select('*, users(email)', { count: 'exact' }).eq('approved', true).gte('like_count', 10).order('like_count', { ascending: false });
  }
  else q = q.eq('category', category);

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
  const { data } = await withTimeout(sb.from('seller_applications').select('*, users(email)').eq('status', 'pending').order('created_at', { ascending: false }), 25000);
  return data || [];
}

async function fetchPendingPosts() {
  if (S.isDemo) return [];
  const { data, error } = await withTimeout(sb.from('posts').select('*').eq('approved', false).order('created_at', { ascending: false }), 25000);
  if (error) { showToast('대기글 조회 오류: ' + error.message); return []; }
  return data || [];
}

async function fetchAllPostsAdmin() {
  if (S.isDemo) return DEMO_POSTS;
  const { data, error } = await withTimeout(sb.from('posts').select('*').order('created_at', { ascending: false }), 25000);
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
  const currentToken = bumpRenderToken();
  const views = { feed: renderFeed, detail: renderDetail, hotdeal_detail: renderHotdealDetail, admin: renderAdmin, apply: renderApply, create: renderCreate, create_inquiry: renderCreateInquiry };
  const viewFn = views[S.view] || renderFeed;

  // viewFn is typically an async function. We catch rejections so the UI doesn't hang.
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
    render(); // hash가 이미 #/이면 hashchange가 안 뜨므로 직접 호출
  } else {
    window.location.hash = '#/'; // hashchange → handleRoute → render() 자동 실행
  }
}

// Feed pagination UI replaced by a "Load more" button. S.page resets in renderFeed.

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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error('[fetchHotdealDetail]', e);
    return null;
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

    // ── 커뮤니티별 다중 본문 셀렉터 + 스마트 폴백 ─────────────────────────────
    // 1차: 사이트별로 자주 쓰이는 본문 컨테이너를 우선순위대로 탐색합니다.
    // 2차: 아무 것도 못 찾으면 body 전체를 훑어서 "텍스트가 가장 많은 큰 div"를 자동 선택합니다.
    //      이렇게 하면 커뮤니티마다 DOM 구조가 달라도 최소한 본문 텍스트는 항상 보여집니다.
    let contentEl =
      doc.querySelector('.board-contents') ||       // 핫딜집 / 뽐뿌 / 클리앙
      doc.querySelector('.deal-description') ||     // hotdeal.zip 자체 상세
      doc.querySelector('.post-content') ||         // FM코리아 등
      doc.querySelector('.post-article') ||         // 일부 블로그/게시판
      doc.querySelector('.post_content') ||         // XE 기반 커뮤니티
      doc.querySelector('.content-body') ||         // 지마켓 등
      doc.querySelector('.view-content') ||         // 루리웹 등
      doc.querySelector('.board-view-content') ||   // 기타 게시판 뷰
      doc.querySelector('div[itemprop="description"]') || // 스키마 마크업 기반
      doc.querySelector('.content') ||              // 범용 content 클래스
      doc.querySelector('article') ||               // 시맨틱 태그 범용
      doc.querySelector('content');                 // XML(프록시) 구조

    const originMatch = htmlText.match(/현재 URL:<\/strong>\s*(https?:\/\/[^\s<]+)/);
    const originUrl = originMatch ? originMatch[1].replace(/&amp;/g, '&') : targetUrl;
    let contentHtml = '';

    if (contentEl) {
      // 원본 사이트의 origin (scheme + host) — 상대경로 이미지 절대화에 사용
      const originBase = (() => { try { return new URL(originUrl).origin; } catch(_) { return 'https://hotdeal.zip'; } })();

      // ── CORS 및 핫링크 방어를 위한 이미지 프록시 로직 ──────────────────────
      // 퀘이사존/펨코 등은 다른 사이트에서 이미지를 불러오면 차단합니다(핫링크 방어).
      // wsrv.nl은 무료 이미지 CDN 프록시로, 서버 측에서 이미지를 가져오므로
      // 브라우저의 Referer 헤더나 CORS 정책이 전혀 개입하지 않아 차단을 무력화합니다.
      contentEl.querySelectorAll('img').forEach(img => {
        // Lazy Loading 이미지 속성 탐색 (4단계 우선순위 + 예외 케이스)
        // data-src → data-original → data-lazy-src → src 순으로 해석하며,
        // 일부 커뮤니티에서 사용하는 lazy-src도 마지막에 함께 폴백으로 처리합니다.
        const rawSrc =
          img.getAttribute('data-src') ||
          img.getAttribute('data-original') ||
          img.getAttribute('data-lazy-src') ||
          img.getAttribute('src') ||
          img.getAttribute('lazy-src');

        if (rawSrc) {
          // ── Base64(data:image...) 예외 처리 ─────────────────────────────────
          // 일부 쇼핑몰/커뮤니티는 이미지를 data:image;base64 형태로 본문에 직접 삽입합니다.
          // 이 경우 wsrv.nl 프록시(외부 URL fetch)가 개입하면 오히려 깨질 수 있으므로
          // 프록시를 태우지 말고 그대로 src에 넣고 다음 이미지로 넘어갑니다.
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

          // 1단계: 상대경로 → 절대경로 변환
          let finalUrl = rawSrc;
          try { finalUrl = new URL(rawSrc, originBase).href; }
          catch (_) {
            if (rawSrc.startsWith('//')) finalUrl = 'https:' + rawSrc;
            else if (rawSrc.startsWith('/')) finalUrl = originBase + rawSrc;
          }
          // 2단계: wsrv.nl 이미지 프록시로 래핑 (핫링크/CORS 완전 우회)
          img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(finalUrl);
          // ── wsrv.nl 차단 대비 onerror 폴백 ─────────────────────────────────
          // wsrv.nl 프록시 IP가 차단되면 엑스박스가 뜰 수 있으므로,
          // 프록시 로딩 실패 시 브라우저가 원본(절대경로)을 직접 요청하도록 강제합니다.
          img.setAttribute('onerror', `this.onerror=null;this.src=${JSON.stringify(finalUrl)};`);
        }
        // referrerpolicy를 항상 no-referrer로 강제 주입하여
        // 원본 서버에 Referer가 절대 전달되지 않도록 합니다.
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

    // 2차 방어선: 셀렉터로 본문을 못 찾았거나 내용이 너무 짧은 경우,
    // body 내 모든 div를 검사해 "텍스트 길이가 가장 긴 div(최소 500자)"를 자동 선택합니다.
    // 이렇게 하면 새로운 커뮤니티 구조라도 최소 텍스트는 항상 사용자에게 보여집니다.
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
        // 스마트 폴백 div에 대해서도 동일한 이미지 정규화/프록시 로직을 다시 적용
        const originBase = (() => { try { return new URL(originUrl).origin; } catch(_) { return 'https://hotdeal.zip'; } })();
        bestDiv.querySelectorAll('img').forEach(img => {
          const rawSrc =
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('src') ||
            img.getAttribute('lazy-src');
          if (rawSrc) {
            // ── Base64(data:image...) 예외 처리 ───────────────────────────────
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

    // 3차 방어선: 그래도 본문이 비었을 때 OG 메타 태그로 Fallback — 절대 빈 화면을 보이지 않습니다.
    // ── WAF(Cloudflare 등) 보안 페이지 감지 + Graceful Degradation UI ─────────
    // 아카라이브/퀘이사존 등은 Cloudflare WAF가 걸려 있으면
    // 서버 프록시(Workers)로 접근해도 정상 본문 대신 "보안 확인/챌린지" HTML을 반환합니다.
    // 이때 OG 메타 태그를 억지로 보여주면 사용자 입장에선 '빈 화면/짧은 화면'처럼 느껴지므로,
    // 명확한 안내 UI로 우아하게 다운그레이드(Graceful Degradation) 합니다.
    const wafKeywords = [
      'just a moment',
      'cloudflare',
      '보안 확인',
      '로봇이 아닙니다',
      'access denied',
      '아카라이브',
    ];
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
    // WAF가 아닌데도 본문이 비었으면 OG 메타 태그로 Fallback
    else if (!contentHtml || contentHtml.length < 20) {
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
  el.innerHTML = ''; // 기존 컨테이너 완벽하게 비우기
  el.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div> 불러오는 중...</div>`;

  try {
    if (S.category === 'hotdeal') {
      console.log(`[renderFeed] Fetching hotdeals...`);
      const deals = await fetchHotDeals();
      if (S.renderToken !== myToken) return;
      console.log(`[renderFeed] Fetched ${deals?.length || 0} hotdeals`);

      if (!deals || deals.length === 0) {
        if (S.renderToken !== myToken) return;
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

    console.log(`[renderFeed] Fetching posts for category: ${S.category}`);
    const posts = await fetchPosts(S.category);
    if (S.renderToken !== myToken) return;
    console.log(`[renderFeed] Fetched ${posts?.length || 0} posts`);

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

    console.log(`[renderFeed] Rendering complete`);
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
    ? `<img src="https://wsrv.nl/?url=${encodeURIComponent(p.image_url)}" alt="${esc(p.title)}" class="card-img" loading="lazy" referrerpolicy="no-referrer">`
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
async function renderDetail(myToken) {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="loading" id="spinner-${myToken}"><div class="spinner"></div> 불러오는 중...</div>`;

  try {
  // ── 1. DB에서 게시물 기본 데이터 로드 ───────────────────────────────────────
  const post = await fetchPost(S.postId);
  if (S.renderToken !== myToken) return;
  if (!post) {
    if (S.renderToken !== myToken) return;
    el.innerHTML = `<div class="empty-state"><div class="empty-emoji">🚫</div><h3>게시글을 찾을 수 없습니다</h3></div>`;
    return;
  }
  const comments = await fetchComments(post.id);
  if (S.renderToken !== myToken) return;

  // ── 2. 실시간 본문 스크래핑 (purchase_link가 있는 핫딜 게시물 전용) ──────────
  // DB에 저장된 짧은 description 대신, 원본 URL에서 실시간으로 전체 본문을 파싱합니다.
  let contentHtml = post.description || '';  // 기본값: DB의 description (실패 시 fallback)

  if (post.purchase_link) {
    try {
      // /api/hotdeal 프록시를 통해 원본 페이지 HTML을 가져옵니다. (CORS 우회)
      const res = await fetch(`/api/hotdeal?url=${encodeURIComponent(post.purchase_link)}`);
      if (S.renderToken !== myToken) return;
      if (res.ok) {
        const htmlText = await res.text();
        if (S.renderToken !== myToken) return;

        // <td> 태그가 DOMParser에서 누락되는 현상 방지 (뽐뿌 등 테이블 기반 커뮤니티 대응)
        const safeHtml = htmlText
          .replace(/<td([^>]*)>/gi, '<div$1>')
          .replace(/<\/td>/gi, '</div>');

        const parser = new DOMParser();
        const doc = parser.parseFromString(safeHtml, 'text/html');

        // OG 메타 태그 파싱 (contentEl이 없을 때 Fallback으로 사용)
        const ogImage = doc.querySelector('meta[property="og:image"]')?.content || '';
        const ogDesc = doc.querySelector('meta[property="og:description"]')?.content || '';

        // ── 커뮤니티별 다중 본문 셀렉터 + 스마트 폴백 ─────────────────────────
        // 1차: 사이트별로 자주 쓰이는 본문 컨테이너를 우선순위대로 탐색합니다.
        // 2차: 아무 것도 못 찾으면 body 전체를 훑어서 "텍스트가 가장 많은 큰 div"를 자동 선택합니다.
        //      이렇게 하면 커뮤니티마다 DOM 구조가 달라도 최소한 본문 텍스트는 항상 보여집니다.
        let contentEl =
          doc.querySelector('.board-contents') ||       // 핫딜집 / 뽐뿌 / 클리앙
          doc.querySelector('.deal-description') ||     // hotdeal.zip 자체 상세 페이지
          doc.querySelector('.post-content') ||         // FM코리아 등
          doc.querySelector('.post-article') ||         // 일부 블로그/게시판
          doc.querySelector('.post_content') ||         // XE 기반 커뮤니티
          doc.querySelector('.content-body') ||         // 지마켓 등
          doc.querySelector('.view-content') ||         // 루리웹 등
          doc.querySelector('.board-view-content') ||   // 기타 게시판 뷰
          doc.querySelector('div[itemprop="description"]') || // 스키마 마크업 기반
          doc.querySelector('.article-body') ||         // 기타 블로그형
          doc.querySelector('.content') ||              // 범용 content 클래스
          doc.querySelector('article') ||               // 시맨틱 태그 범용
          doc.querySelector('content');                 // XML(프록시) 구조

        // ── 이미지 절대경로 보정 + Lazy Loading 대응 ─────────────────────────
        // 핫딜 사이트는 data-src / data-original 속성에 실제 이미지 URL을 담고
        // src에는 placeholder를 넣는 Lazy Loading 방식을 많이 사용합니다.
        // 이를 보정하지 않으면 모든 이미지가 엑스박스(깨진 이미지)로 표시됩니다.
        const originMatch = htmlText.match(/현재 URL:<\/strong>\s*(https?:\/\/[^\s<]+)/);
        const originUrl = originMatch
          ? originMatch[1].replace(/&amp;/g, '&')
          : post.purchase_link;
        // origin만 추출 (scheme + host) — 상대경로 절대화에 사용
        const originBase = (() => { try { return new URL(originUrl).origin; } catch(_) { return new URL(post.purchase_link).origin; } })();

        if (contentEl) {
          contentEl.querySelectorAll('img').forEach(img => {
            // Lazy Loading 이미지 속성 탐색 (4단계 우선순위 + 예외 케이스)
            // data-src → data-original → data-lazy-src → src 순으로 해석하며,
            // 일부 커뮤니티에서 사용하는 lazy-src도 마지막에 함께 폴백으로 처리합니다.
            const rawSrc =
              img.getAttribute('data-src') ||
              img.getAttribute('data-original') ||
              img.getAttribute('data-lazy-src') ||
              img.getAttribute('src') ||
              img.getAttribute('lazy-src');

            if (rawSrc) {
              // ── Base64(data:image...) 예외 처리 ─────────────────────────────
              // 일부 쇼핑몰/커뮤니티는 이미지를 data:image;base64 형태로 본문에 직접 삽입합니다.
              // 이 경우 wsrv.nl 프록시를 태우면 오히려 깨질 수 있으므로
              // 프록시를 거치지 않고 그대로 src에 할당합니다.
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

              // 1단계: 상대경로 → 절대경로 변환 (origin 기준으로 확실하게 보정)
              let finalUrl = rawSrc;
              try { finalUrl = new URL(rawSrc, originBase).href; }
              catch (_) {
                if (rawSrc.startsWith('//')) finalUrl = 'https:' + rawSrc;
                else if (rawSrc.startsWith('/')) finalUrl = originBase + rawSrc;
              }
              // 2단계: wsrv.nl 이미지 프록시로 래핑 (핫링크/CORS 완전 우회)
              img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(finalUrl);
              // ── wsrv.nl 차단 대비 onerror 폴백 ───────────────────────────────
              // wsrv.nl 프록시 IP가 차단되면 엑스박스가 뜰 수 있으므로,
              // 프록시 로딩 실패 시 브라우저가 원본(절대경로)을 직접 요청하도록 강제합니다.
              img.setAttribute('onerror', `this.onerror=null;this.src=${JSON.stringify(finalUrl)};`);
            }
            img.setAttribute('referrerpolicy', 'no-referrer'); // 핫링크 방어 2중 우회
            img.setAttribute('loading', 'lazy');               // 스크롤 시 지연 로드
            // 모바일에서 이미지가 화면 밖으로 삐져나가지 않도록 강제 제한
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '10px auto';
          });

          // XSS 방지 및 불필요한 요소 제거
          contentEl.querySelectorAll('script, style, iframe').forEach(s => s.remove());
          contentHtml = contentEl.innerHTML.trim();
        }

        // 2차 방어선: 셀렉터로 본문을 못 찾았거나 내용이 너무 짧은 경우,
        // body 내 모든 div를 검사해 "텍스트 길이가 가장 긴 div(최소 500자)"를 자동 선택합니다.
        // 이렇게 하면 새로운 커뮤니티 구조라도 최소 텍스트는 항상 사용자에게 보여집니다.
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
                // ── Base64(data:image...) 예외 처리 ───────────────────────────
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

        // ── WAF(Cloudflare 등) 보안 페이지 감지 + Graceful Degradation UI ─────
        // 아카라이브/퀘이사존 등은 Cloudflare WAF가 걸려 있으면
        // 서버 프록시(Workers)로 접근해도 정상 본문 대신 "보안 확인/챌린지" HTML을 반환합니다.
        // 이때는 메타 태그로 억지 렌더링하지 않고, 안내 UI로 우아하게 다운그레이드합니다.
        const wafKeywords = [
          'just a moment',
          'cloudflare',
          '보안 확인',
          '로봇이 아닙니다',
          'access denied',
          '아카라이브',
        ];
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
        // WAF가 아닌데도 본문이 비었으면 OG 메타 태그로 Fallback
        else if (!contentHtml || contentHtml.length < 20) {
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
      // 스크래핑 실패 시 DB의 description을 그대로 사용합니다. (무음 처리)
      console.warn('[renderDetail] 실시간 파싱 실패, DB description 사용:', scrapeErr.message);
      contentHtml = post.description || '';
    }
  }

  if (S.renderToken !== myToken) return;
  // ── 3. 화면 렌더링 ────────────────────────────────────────────────────────────
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

      <!-- 실시간 파싱된 본문 (또는 DB description fallback) -->
      <div class="detail-desc" style="white-space:pre-wrap; overflow:hidden; width:100%; max-width:100%;">
        ${contentHtml}
      </div>

      <!-- 원본 링크 버튼: purchase_link가 있는 핫딜 게시물에만 표시 -->
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

      <!-- 댓글 섹션 (기존 구조 그대로 유지) -->
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
  // 댓글 수 DOM 동기화
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
    <div class="page-header"><h1>관리자 대시보드</h1><p>판매자 승인, 게시글, 카테고리 관리</p></div>
    <div class="admin-tabs">
      <button class="admin-tab${S.adminTab === 'sellers' ? ' active' : ''}" onclick="switchTab('sellers')">판매자 승인</button>
      <button class="admin-tab${S.adminTab === 'posts' ? ' active' : ''}" onclick="switchTab('posts')">게시글 승인</button>
      <button class="admin-tab${S.adminTab === 'all' ? ' active' : ''}" onclick="switchTab('all')">전체 게시글</button>
      <button class="admin-tab${S.adminTab === 'categories' ? ' active' : ''}" onclick="switchTab('categories')">카테고리 관리</button>
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
  tabs[['sellers', 'posts', 'all', 'categories'].indexOf(tab)]?.classList.add('active');
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
      body.innerHTML = `<div style="margin-bottom: 20px; display:flex; justify-content: flex-end;"><button id="btn-deep-scrape" class="btn btn-primary" type="button">🔍 핫딜집 딥크롤링 실행</button></div>${data.length === 0 ? `<div class="empty-state" ><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3></div>` : `<table class="admin-table"><thead><tr><th>제목</th><th>카테고리</th><th>상태</th><th>조회</th><th>액션</th></tr></thead><tbody>${data.map(p => `<tr><td>${esc(p.title)}</td><td><select class="form-input" style="width:140px; padding:4px;" onchange="updatePostCategory('${p.id}', this.value)">${getCategoryOptionsHtml(p.category)}</select></td><td><span class="badge ${p.approved ? 'badge-approved' : 'badge-pending'}">${p.approved ? '승인됨' : '대기중'}</span></td><td>${p.views || 0}</td><td><div class="btn-row"><button class="btn btn-danger btn-sm" onclick="deletePost('${p.id}')">삭제</button></div></td></tr>`).join('')}</table>`}`;
    } else if (S.adminTab === 'categories') {
      const { data } = await withTimeout(sb.from('categories').select('*').order('sort_order', { ascending: true }), 25000);
      if (S.renderToken !== myToken) return;
      const rawList = data || [];
      const mapById = {}; rawList.forEach(c => { mapById[c.id] = { ...c, subs: [] }; });
      const rootTree = []; rawList.forEach(c => { if (c.parent_id && mapById[c.parent_id]) mapById[c.parent_id].subs.push(mapById[c.id]); else if (!c.parent_id) rootTree.push(mapById[c.id]); });
      function buildParentOpts(list, depth = 0, ancestors = []) { let opts = ''; list.forEach(c => { const prefix = '\u00a0'.repeat(depth * 4); opts += `<option value="${c.id}">${prefix}${c.name}${ancestors.length > 0 ? ' (' + ancestors[ancestors.length - 1] + ' 하위)' : ''}</option>`; if (c.subs && c.subs.length > 0) { opts += buildParentOpts(c.subs, depth + 1, [...ancestors, c.name]); } }); return opts; }
      const parentOpts = buildParentOpts(rootTree);
      const depthLabels = ['대분류', '중분류', '소분류', '하위분류'];
      function buildTableRows(list, depth = 0) { let rows = ''; list.forEach(c => { const indent = '\u00a0\u00a0'.repeat(depth * 2); const depthLabel = depthLabels[depth] || `${depth + 1}단계`; const arrow = depth > 0 ? '↳ ' : ''; rows += `<tr><td>${c.sort_order || 0}</td><td><span style="color: ${depth === 0 ? '#333' : depth === 1 ? '#666' : '#999'}; font-size: ${depth === 0 ? '13px' : '12px'}">${depthLabel}</span></td><td>${indent}${arrow}${esc(c.name)}</td><td>${esc(c.icon || '')}</td><td><button class="btn btn-danger btn-sm" onclick="deleteAdminCategory('${c.id}')">삭제</button></td></tr>`; if (c.subs && c.subs.length > 0) rows += buildTableRows(c.subs, depth + 1); }); return rows; }
      body.innerHTML = `<form id="admin-category-form" class="admin-category-form" style="margin-bottom: 20px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; background:#f9f9f9; padding:15px; border-radius:8px;" action="#" method="post" novalidate><input type="text" id="new-cat-name" name="new_cat_name" placeholder="카테고리명 (새 카테고리)" class="form-input" style="width:180px;" autocomplete="off" /><input type="number" id="new-cat-sort" name="new_cat_sort" placeholder="순서(숫자)" class="form-input" style="width:100px;" value="1" /><input type="text" id="new-cat-icon" name="new_cat_icon" placeholder="아이콘(예:🍎)" class="form-input" style="width:120px;" autocomplete="off" /><select id="new-cat-parent" name="new_cat_parent" class="form-input" style="width:220px;" aria-label="상위 카테고리"><option value="">(최상위 대분류)</option>${parentOpts}</select><button type="submit" id="btn-add-admin-category" class="btn btn-primary btn-sm">추가</button></form><table class="admin-table"><thead><tr><th>순서</th><th>유형</th><th>이름</th><th>아이콘</th><th>액션</th></tr></thead><tbody>${buildTableRows(rootTree)}</tbody></table>`;
    }
  } catch (e) {
    console.error('[renderAdminTab 에러]', e);
    if (S.renderToken !== myToken) return;
    // 🔥 [수정됨] 무한 스피너 대신 에러 메시지 + 재시도 버튼으로 덮어쓰기
    body.innerHTML = `<div class="empty-state"><div class="empty-emoji">❌</div><h3>데이터를 불러오지 못했습니다</h3><p>${esc(e?.message || String(e))}</p><button class="btn btn-primary" style="margin-top:16px;" onclick="switchTab('${S.adminTab}')">다시 시도</button></div>`;
  } finally {
    // admin-body 내 스피너 직접 제거 (renderToken이 일치할 때만)
    if (S.renderToken === myToken) {
      document.getElementById(`spinner-${myToken}`)?.remove();
    }
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
    console.log('[addAdminCategory] insert 성공 (rows 반환 생략 — RLS 호환)');

    showToast('성공: 새 카테고리가 추가되었습니다.');
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

// 관리자 카테고리 추가: 동적 폼은 submit 이벤트로 처리 (버튼 type=submit + preventDefault로 이중 전송 방지)
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

// Global Event Delegation for Dynamic Elements
document.addEventListener('click', async function (e) {
  const target = eventTargetElement(e);
  if (!target) return;

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

  // 카테고리 «추가»는 #admin-category-form 의 submit 리스너에서만 처리합니다.
  // (submit 버튼 클릭 시 click + submit 둘 다 오므로 여기서 또 호출하면 이중 insert 됨)
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

// Event delegation for the deep scrape button (dynamically rendered)
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
// SELLER APPLY
// ─────────────────────────────────────────────
function renderApply(_myToken) {
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
      <button type="button" id="btn-submit-apply" class="btn btn-primary btn-full" onclick="submitApply()">신청하기</button>
    </div > `;
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

    // Supabase JS 클라이언트 auth lock 우회 — 직접 REST API 호출
    // Supabase JS auth lock 완전 우회 — localStorage에서 직접 토큰 읽기
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
      <button type="button" id="btn-submit-inquiry" class="btn btn-primary btn-full" onclick="submitInquiry()">등록 하기</button>
    </div > `;
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

    // Supabase JS 클라이언트 auth lock 우회 — 직접 REST API 호출
    // Supabase JS auth lock 완전 우회 — localStorage에서 직접 토큰 읽기
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
/**
 * 트리에서 '말단(리프) 카테고리'만 수집합니다.
 * @param {Array} items - 카테고리 트리 루트(또는 하위 배열)
 * @param {string[]} forbiddenIds - 선택 불가·숨길 카테고리 id (뷰 전용 등)
 * @param {string[]} ancestorLabels - 재귀용 상위 라벨 체인 (드롭다운에 "식품 > 과일" 표시)
 */
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
  // 🔥 초강력 필터링: 라벨이나 이름에 금지어 포함 시 무조건 제외
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

      <div class="form-group" style="background:#f0f7ff;border:1.5px solid #b3d4f5;border-radius:10px;padding:14px 16px 12px;">
        <label class="form-label" style="color:#1a6bbf;font-weight:700;">📷 밴드 게시글 자동 불러오기 <span style="font-size:11px;font-weight:400;color:#555;">(선택사항)</span></label>
        <div style="display:flex;gap:8px;align-items:stretch;">
          <input class="form-input" id="p-band-url" type="url" placeholder="https://www.band.us/page/..." style="flex:1;min-width:0;">
          <button type="button" id="btn-fetch-band" class="btn btn-primary btn-sm" onclick="fetchBandPost()" style="white-space:nowrap;padding:0 14px;">자동 불러오기</button>
        </div>
        <p style="margin:6px 0 0;font-size:11px;color:#666;">밴드 링크를 붙여넣고 버튼을 누르면 이미지·제목이 자동으로 채워집니다.</p>
      </div>

      <div class="form-group"><label class="form-label">제목 *</label><input class="form-input" id="p-title" type="text" placeholder="상품명 + 핵심 특징"></div>
      <div class="form-group"><label class="form-label">카테고리 *</label><select class="form-input" id="p-cat">${catOptions}</select></div>
      <div class="form-group"><label class="form-label">가격 *</label><input class="form-input" id="p-price" type="text" placeholder="예: 35,000원/kg"></div>
      <div class="form-group"><label class="form-label">상세 설명 *</label><textarea class="form-input" id="p-desc" style="min-height:130px;" placeholder="상품 상태, 수량, 배송 방법 등을 자세히 적어주세요."></textarea></div>
      <div class="form-group"><label class="form-label">이미지 URL</label><input class="form-input" id="p-img" type="url" placeholder="https://..."></div>
      <div class="form-group"><label class="form-label">구매 링크</label><input class="form-input" id="p-link" type="url" placeholder="https://..."></div>
      <button type="button" id="btn-submit-post" class="btn btn-primary btn-full" onclick="submitPost()">등록 신청</button>
    </div>`;
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
    const desc = descEl ? String(descEl.value).trim() : '';
    const image_url = imgEl && imgEl.value.trim() ? imgEl.value.trim() : null;
    const purchase_link = linkEl && linkEl.value.trim() ? linkEl.value.trim() : null;

    if (!title || !cat || !price || !desc) {
      showToast('필수 항목을 모두 입력해 주세요');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${spinnerHtml}등록 중...`;
    }

    // Supabase JS 클라이언트 auth lock 우회 — 직접 REST API 호출
    // Supabase JS auth lock 완전 우회 — localStorage에서 직접 토큰 읽기
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
      approved: false,
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

    showToast('등록 신청 완료! 관리자 승인 후 공개됩니다.');
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

// 인라인 onclick="submitPost()"에서 항상 호출 가능하도록 전역 노출
window.submitPost = submitPost;

// ─────────────────────────────────────────────
// BAND 게시글 자동 불러오기 + AI 분석
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

    // 이미지 → 프록시 URL로 변환 저장
    const proxiedImageUrl = `/api/imgproxy?url=${encodeURIComponent(data.image_url)}`;
    const imgEl   = document.getElementById('p-img');
    const linkEl  = document.getElementById('p-link');
    const titleEl = document.getElementById('p-title');
    const priceEl = document.getElementById('p-price');
    const descEl  = document.getElementById('p-desc');

    if (imgEl)  imgEl.value  = proxiedImageUrl;
    if (linkEl  && !linkEl.value.trim())  linkEl.value  = bandUrl;

    if (data.ai) {
      // AI 분석 결과로 모든 필드 자동 채우기
      if (btn) btn.innerHTML = `${sp}AI 분석 완료!`;
      if (titleEl && data.ai.name)        titleEl.value = data.ai.name;
      if (priceEl && data.ai.price)       priceEl.value = data.ai.price;
      if (descEl  && data.ai.description) descEl.value  = data.ai.description;
      showToast('✅ AI가 상품 정보를 자동으로 채웠습니다! 내용을 확인 후 등록하세요.');
    } else {
      // AI 없이 기본 정보만 채우기
      if (titleEl && !titleEl.value.trim() && data.title) titleEl.value = data.title;
      const skipped = data.ai_skipped || '';
      if (skipped.includes('OPENAI_API_KEY')) {
        showToast('✅ 이미지를 불러왔습니다. (AI 분석: OPENAI_API_KEY 미설정)');
      } else {
        showToast('✅ 이미지를 불러왔습니다. 나머지 항목을 직접 입력해 주세요.');
      }
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
    <button type="button" id="modal-btn-login" class="btn btn-primary btn-full" onclick="modalLogin()">로그인</button>
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
  // 카테고리 로딩과 세션 확인을 병렬 실행 — 순차 대기 제거로 초기 렌더링 지연 단축
  const sessionResult = await Promise.allSettled([
    loadCategories(),
    sb ? sb.auth.getSession() : Promise.resolve(null),
  ]);

  // 카테고리 로딩 실패 처리
  if (sessionResult[0].status === 'rejected') {
    console.error('[init] loadCategories', sessionResult[0].reason);
    showToast(sessionResult[0].reason?.message || '카테고리를 불러오지 못했습니다');
  }

  // 세션 확인 결과 처리
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

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

init();


