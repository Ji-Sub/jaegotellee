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
const CATEGORIES = [
  { id: 'all', label: '모든글', icon: '📋', subs: [] },
  { id: 'hotdeal', label: '핫딜 모음', icon: '🔥', subs: [] },
  {
    id: 'clearance', label: '재고털이', icon: '🏷️',
    subs: [
      { id: 'meat', label: '육류' },
      { id: 'processed', label: '육가공' },
      { id: 'drink', label: '음료' },
      { id: 'vegetable', label: '채소' },
      { id: 'fish', label: '생선' },
      { id: 'fruit', label: '과일' },
    ]
  },
  { id: 'supplement', label: '영양제', icon: '💊', subs: [] },
  { id: 'unique', label: '신박한 아이템', icon: '✨', subs: [] },
  {
    id: 'electronics', label: '전자기기', icon: '💻',
    subs: [
      { id: 'keyboard', label: '키보드' },
      { id: 'mouse', label: '마우스' },
    ]
  },
];

// ─────────────────────────────────────────────
// DEMO DATA  (shown before Supabase is connected)
// ─────────────────────────────────────────────
const DEMO_POSTS = [
  { id: 1, title: '한우 등심 1++ 재고 대방출', description: '냉동 한우 등심 1++ 등급 정육 재고 대량 방출합니다. 마트 납품 후 남은 물량이라 신선도 보장. 소분 가능합니다.', price: '35,000원/kg', image_url: null, category: 'meat', views: 1284, comments_count: 23, approved: true, is_hot: true },
  { id: 2, title: '제주 감귤 10kg 박스 — 시즌 마감 특가', description: '이번 시즌 마지막 감귤입니다. 산지 직송, 당도 높은 제주산 감귤 10kg 박스.', price: '18,000원', image_url: null, category: 'fruit', views: 567, comments_count: 8, approved: true, is_hot: false },
  { id: 3, title: '로지텍 MX Master 3 마우스 재고 처분', description: '리뉴얼로 인한 구모델 재고 처분. 정품 박스 미개봉. 공홈 대비 50% 할인!', price: '55,000원', image_url: null, category: 'mouse', views: 3210, comments_count: 45, approved: true, is_hot: true },
  { id: 4, title: '단백질 보충제 창고 정리 30% 할인', description: '유통기한 1년 이상 남은 단백질 보충제 대량 방출. 초코·바닐라 각 1kg.', price: '25,000원', image_url: null, category: 'supplement', views: 890, comments_count: 12, approved: true, is_hot: false },
  { id: 5, title: '수제 햄 & 소시지 박스세트 특가', description: '소량 생산 공방의 수제 햄/소시지 재고. 방부제 없는 건강한 제품, 냉동 보관.', price: '32,000원', image_url: null, category: 'processed', views: 420, comments_count: 6, approved: true, is_hot: false },
  { id: 6, title: '키크론 K2 키보드 물량 처분 (적축)', description: '리뉴얼 전 구모델 키크론 K2 적축 물량 대방출. 개봉 전 새제품. 맥/윈도우 호환.', price: '79,000원', image_url: null, category: 'keyboard', views: 1875, comments_count: 34, approved: true, is_hot: true },
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
  category: 'all',
  adminTab: 'sellers',  // 'sellers' | 'posts' | 'all'
  expanded: new Set(['clearance', 'electronics']),
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
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getCatLabel(id) {
  for (const c of CATEGORIES) {
    if (c.id === id) return c.label;
    for (const s of c.subs) if (s.id === id) return s.label;
  }
  return id;
}
function getCatEmoji(id) {
  const map = {
    meat: '🥩', processed: '🌭', drink: '🥤', vegetable: '🥦', fish: '🐟', fruit: '🍊',
    supplement: '💊', unique: '✨', keyboard: '⌨️', mouse: '🖱️', electronics: '💻',
    hotdeal: '🔥', clearance: '🏷️', all: '📋'
  };
  return map[id] || '📦';
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
  if (S.isDemo) {
    let p = [...DEMO_POSTS];
    if (category === 'hotdeal') p = p.filter(x => x.is_hot);
    else if (category !== 'all') p = p.filter(x => x.category === category);
    return p;
  }
  let q = sb.from('posts').select('*').eq('approved', true).order('created_at', { ascending: false });
  if (category === 'hotdeal') q = q.eq('is_hot', true);
  else if (category !== 'all') q = q.eq('category', category);
  const { data } = await q;
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
  const { error } = await sb.from('comments').insert({ post_id: postId, user_id: S.user.id, content });
  if (error) throw error;
  await sb.rpc('increment_comments', { post_id: postId });
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

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
function handleRoute() {
  const h = window.location.hash || '#/';
  if (h === '#/') { S.view = 'feed'; }
  else if (h.startsWith('#/post/')) { S.view = 'detail'; S.postId = h.replace('#/post/', ''); }
  else if (h === '#/admin') { S.view = 'admin'; }
  else if (h === '#/apply') { S.view = 'apply'; }
  else if (h === '#/create') { S.view = 'create'; }
  render();
}

// ─────────────────────────────────────────────
// RENDER ORCHESTRATOR
// ─────────────────────────────────────────────
function render() {
  renderNav();
  renderSidebar();
  const views = { feed: renderFeed, detail: renderDetail, admin: renderAdmin, apply: renderApply, create: renderCreate };
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
    <a class="nav-logo" onclick="navigateTo('feed');return false;" href="#/">재고털이</a>
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
function renderSidebar() {
  let html = '';
  CATEGORIES.forEach(cat => {
    const hasKids = cat.subs.length > 0;
    const expanded = S.expanded.has(cat.id);
    const active = !hasKids && S.category === cat.id;
    html += `<div class="sidebar-item${active ? ' active' : ''}"
        onclick="${hasKids ? `toggleExpand('${cat.id}')` : `selectCat('${cat.id}')`}">
      <span class="sidebar-icon">${cat.icon}</span>${esc(cat.label)}
      ${hasKids ? `<span class="sidebar-arrow">${expanded ? '▾' : '▸'}</span>` : ''}
    </div>`;
    if (hasKids && expanded) {
      cat.subs.forEach(s => {
        html += `<div class="sidebar-item sidebar-sub${S.category === s.id ? ' active' : ''}"
            onclick="selectCat('${s.id}')">${esc(s.label)}</div>`;
      });
    }
  });
  document.getElementById('sidebar').innerHTML = html;
}

function toggleExpand(id) {
  S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id);
  renderSidebar();
}

let isNavigating = false;
async function navigateTo(view, param = null) {
  if (isNavigating) return;
  isNavigating = true;

  S.view = view;
  S.postId = param;
  const hash = view === 'feed' ? '#/' : view === 'detail' ? `#/post/${param}` : `#/${view}`;

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
  S.category = id; S.view = 'feed';
  window.location.hash = '#/';
  render();
}

// ─────────────────────────────────────────────
// HOT DEAL FETCHING (hotdeal.zip integration)
// ─────────────────────────────────────────────
async function fetchHotDeals() {
  try {
    const url = encodeURIComponent('https://hotdeal.zip/api/deals.php?page=1&category=all');
    const proxyUrl = `https://api.allorigins.win/get?url=${url}`;
    const res = await fetch(proxyUrl);
    const origin = await res.json();
    const parsed = JSON.parse(origin.contents);
    if (parsed && parsed.success) {
      return parsed.data;
    }
    return [];
  } catch (e) {
    console.error('Failed to fetch hotdeals', e);
    return [];
  }
}

// ─────────────────────────────────────────────
// FEED
// ─────────────────────────────────────────────
async function renderFeed() {
  const el = document.getElementById('content');
  el.innerHTML = `<div class="loading"><div class="spinner"></div> 불러오는 중...</div>`;

  if (S.category === 'hotdeal') {
    const deals = await fetchHotDeals();
    if (!deals || deals.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-emoji">📭</div><h3>핫딜이 없습니다</h3><p>현재 불러올 수 있는 핫딜이 없습니다.</p></div>`;
      return;
    }

    const listHtml = deals.map(d => {
      // Hotdeal UI list items with existing color scheme compatibility.
      return `
        <a href="${esc(d.post_url)}" target="_blank" rel="noopener" class="hotdeal-list-item">
          <img src="${esc(d.thumbnail_url)}" alt="${esc(d.title)}" class="hotdeal-thumb" loading="lazy">
          <div class="hotdeal-info">
            <div class="hotdeal-badge" style="background: ${esc(d.gradient)}">${esc(d.community_name)}</div>
            <h3 class="hotdeal-title">${esc(d.title)}</h3>
            <div class="hotdeal-meta">
              <span class="hotdeal-price">${esc(d.price)}</span>
              <span class="hotdeal-site">${esc(d.site)}</span>
              <span class="hotdeal-time">${esc(d.time)}</span>
            </div>
          </div>
        </a>
      `;
    }).join('');

    el.innerHTML = `
      <div class="feed-header">
        <h2 class="feed-title">🔥 핫딜 모음 <span style="font-size:12px;color:var(--text-sub);font-weight:normal;margin-left:8px;">Powered by hotdeal.zip</span></h2>
      </div>
      <div class="hotdeal-list-container">
        ${listHtml}
      </div>
    `;
    return;
  }

  const posts = await fetchPosts(S.category);
  const catLabel = getCatLabel(S.category);
  const canPost = S.role === 'seller' || S.role === 'admin';

  const cardsHtml = posts.length === 0
    ? `<div class="empty-state"><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3><p>곧 새로운 딜이 업로드됩니다.</p></div>`
    : `<div class="cards-grid">${posts.map(p => cardHtml(p)).join('')}</div>`;

  el.innerHTML = `
    <div class="feed-header">
      <h2 class="feed-title">${esc(catLabel)}</h2>
      ${canPost ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('create')">+ 글쓰기</button>` : ''}
    </div>
    ${S.isDemo ? `<div class="demo-banner">🔧 <strong>데모 모드</strong> — main.js 상단의 Supabase 키를 입력하면 실제 데이터가 연동됩니다.</div>` : ''}
    ${cardsHtml}`;
}

function cardHtml(p) {
  const img = p.image_url
    ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" class="card-img" loading="lazy">`
    : `<div class="card-placeholder">${getCatEmoji(p.category)}</div>`;
  return `
    <div class="post-card" onclick="navigateTo('detail','${p.id}')">
      <div class="card-img-wrap">
        ${img}
        ${p.is_hot ? `<span class="hot-badge">🔥 HOT</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-cat">${esc(getCatLabel(p.category))}</div>
        <div class="card-title">${esc(p.title)}</div>
        <div class="card-desc">${esc(p.description)}</div>
        <div class="card-price">${esc(String(p.price))}</div>
        <div class="card-meta">
          <span>💬 ${p.comments_count || 0}</span>
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
      <a class="btn btn-ghost btn-sm detail-back" onclick="history.back();return false;" href="javascript:void(0)">← 목록으로</a>
      ${imgHtml}
      <div class="detail-cat">${esc(getCatLabel(post.category))}</div>
      <h1 class="detail-title">${esc(post.title)}</h1>
      <div class="detail-price">${esc(String(post.price))}</div>
      <div class="detail-meta">
        <span>💬 댓글 ${post.comments_count || 0}개</span>
        <span>👁 조회 ${post.views || 0}회</span>
      </div>
      <div class="detail-desc">${esc(post.description)}</div>
      ${post.purchase_link ? `<a href="${esc(post.purchase_link)}" target="_blank" rel="noopener" class="purchase-btn">🛒 구매하러 가기</a>` : ''}
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
        <div id="comment-list">${commentsHtml}</div>
      </div>
    </div>`;
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
    const comments = await fetchComments(postId);
    document.getElementById('comment-list').innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="comment-author">${esc(c.users?.email?.split('@')[0] || '익명')}<span class="comment-time">${formatDate(c.created_at)}</span></div>
        <div class="comment-content">${esc(c.content)}</div>
      </div>`).join('');
  } catch (e) { showToast('오류: ' + e.message); }
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
    <div class="page-header"><h1>관리자 대시보드</h1><p>판매자 승인 및 게시글 관리</p></div>
    <div class="admin-tabs">
      <button class="admin-tab${S.adminTab === 'sellers' ? ' active' : ''}" onclick="switchTab('sellers')">판매자 승인</button>
      <button class="admin-tab${S.adminTab === 'posts' ? ' active' : ''}" onclick="switchTab('posts')">게시글 승인</button>
      <button class="admin-tab${S.adminTab === 'all' ? ' active' : ''}" onclick="switchTab('all')">전체 게시글</button>
    </div>
    <div id="admin-body"></div>`;
  el.innerHTML = tabsHtml;
  await renderAdminTab();
}

async function switchTab(tab) {
  S.adminTab = tab;
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[['sellers', 'posts', 'all'].indexOf(tab)]?.classList.add('active');
  await renderAdminTab();
}

async function renderAdminTab() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  if (S.adminTab === 'sellers') {
    const data = await fetchPendingSellers();
    body.innerHTML = data.length === 0
      ? `<div class="empty-state"><div class="empty-emoji">✅</div><h3>대기 중인 판매자 신청이 없습니다</h3></div>`
      : `<table class="admin-table">
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
        </table>`;

  } else if (S.adminTab === 'posts') {
    const data = await fetchPendingPosts();
    body.innerHTML = data.length === 0
      ? `<div class="empty-state"><div class="empty-emoji">✅</div><h3>승인 대기 게시글이 없습니다</h3></div>`
      : `<table class="admin-table">
          <thead><tr><th>제목</th><th>카테고리</th><th>가격</th><th>액션</th></tr></thead>
          <tbody>${data.map(p => `
            <tr>
              <td>${esc(p.title)}</td>
              <td>${esc(getCatLabel(p.category))}</td>
              <td>${esc(String(p.price))}</td>
              <td><div class="btn-row">
                <button class="btn btn-success btn-sm" onclick="approvePost('${p.id}')">승인</button>
                <button class="btn btn-danger btn-sm"  onclick="deletePost('${p.id}')">삭제</button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table>`;

  } else {
    const data = await fetchAllPostsAdmin();
    body.innerHTML = data.length === 0
      ? `<div class="empty-state"><div class="empty-emoji">📭</div><h3>게시글이 없습니다</h3></div>`
      : `<table class="admin-table">
          <thead><tr><th>제목</th><th>카테고리</th><th>상태</th><th>조회</th><th>액션</th></tr></thead>
          <tbody>${data.map(p => `
            <tr>
              <td>${esc(p.title)}</td>
              <td>${esc(getCatLabel(p.category))}</td>
              <td><span class="badge ${p.approved ? 'badge-approved' : 'badge-pending'}">${p.approved ? '승인됨' : '대기중'}</span></td>
              <td>${p.views || 0}</td>
              <td><div class="btn-row">
                <button class="btn btn-danger btn-sm" onclick="deletePost('${p.id}')">삭제</button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table>`;
  }
}

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
      <button class="btn btn-primary btn-full" onclick="submitApply()">신청하기</button>
    </div>`;
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
// CREATE POST
// ─────────────────────────────────────────────
function renderCreate() {
  const el = document.getElementById('content');
  if (!S.user) {
    el.innerHTML = `<div class="form-card"><div class="empty-state"><div class="empty-emoji">🔒</div><h3>로그인이 필요합니다</h3></div></div>`;
    return;
  }
  if (S.role !== 'seller' && S.role !== 'admin') {
    el.innerHTML = `<div class="form-card"><div class="empty-state"><div class="empty-emoji">🚫</div><h3>판매자 계정이 필요합니다</h3><p>판매자 신청 후 관리자 승인이 필요합니다.</p><br><button class="btn btn-primary" onclick="navigateTo('apply')">판매자 신청하기</button></div></div>`;
    return;
  }

  const allSubs = CATEGORIES.flatMap(c => c.subs.length ? c.subs : [c]);
  const catOptions = allSubs.map(s => `<option value="${s.id}">${s.label}</option>`).join('');

  el.innerHTML = `
    <div class="form-card">
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
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="p-hot"> 핫딜로 등록
        </label>
      </div>
      <button class="btn btn-primary btn-full" onclick="submitPost()">등록 신청</button>
    </div>`;
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
      is_hot: document.getElementById('p-hot')?.checked || false,
      approved: false,
      views: 0,
      comments_count: 0,
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
    <div class="modal-subtitle">재고털이에 오신 것을 환영합니다</div>
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
