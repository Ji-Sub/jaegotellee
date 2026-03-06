# Supabase 연동 가이드 — 재고털이

## 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) → **New Project** 생성
2. Project URL과 anon public key를 복사
3. `main.js` 상단 두 줄을 수정:

```js
const SUPABASE_URL      = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';
```

---

## 2. Database 스키마 (SQL Editor에서 실행)

```sql
-- Users (프로필 테이블, Supabase Auth와 연동)
create table public.users (
  id       uuid primary key references auth.users(id) on delete cascade,
  email    text not null,
  role     text not null default 'user'  -- 'user' | 'seller' | 'admin'
);

-- Seller Applications
create table public.seller_applications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,
  status     text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz default now()
);

-- Posts
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.users(id) on delete cascade not null,
  title          text not null,
  description    text not null,
  price          text not null,
  image_url      text,
  purchase_link  text,
  category       text not null,
  views          int  default 0,
  comments_count int  default 0,
  approved       bool default false,
  is_hot         bool default false,
  created_at     timestamptz default now()
);

-- Comments
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);

-- Helper functions
create or replace function increment_views(post_id uuid)
returns void language sql as $$
  update posts set views = views + 1 where id = post_id;
$$;

create or replace function increment_comments(post_id uuid)
returns void language sql as $$
  update posts set comments_count = comments_count + 1 where id = post_id;
$$;
```

---

## 3. Row Level Security (RLS) 설정

```sql
-- users: 자신의 row만 읽기/업데이트
alter table public.users enable row level security;
create policy "users_select" on public.users for select using (true);
create policy "users_insert" on public.users for insert with check (auth.uid() = id);
create policy "users_update" on public.users for update using (auth.uid() = id);

-- posts: approved된 글은 모두 읽기 가능, 삽입/수정은 인증 필요
alter table public.posts enable row level security;
create policy "posts_select"         on public.posts for select using (approved = true or auth.uid() is not null);
create policy "posts_insert_seller"  on public.posts for insert with check (auth.uid() is not null);
create policy "posts_update_admin"   on public.posts for update using (auth.uid() is not null);
create policy "posts_delete_admin"   on public.posts for delete using (auth.uid() is not null);

-- comments: 인증 사용자 작성
alter table public.comments enable row level security;
create policy "comments_select" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (auth.uid() is not null);

-- seller_applications
alter table public.seller_applications enable row level security;
create policy "applications_insert" on public.seller_applications for insert with check (auth.uid() = user_id);
create policy "applications_select" on public.seller_applications for select using (auth.uid() = user_id or auth.uid() is not null);
create policy "applications_update" on public.seller_applications for update using (auth.uid() is not null);
```

---

## 4. 최초 Admin 계정 설정

1. 사이트에서 일반 회원가입
2. Supabase 대시보드 → **Table Editor** → `users` 테이블
3. 해당 계정의 `role` 컬럼 값을 `admin` 으로 직접 수정

---

## 5. Cloudflare Pages 배포

1. GitHub 저장소에 프로젝트 파일 3개 push
2. [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project** → GitHub 연결
3. Build settings:
   - **Build command**: (비워두기, 정적 파일)
   - **Build output directory**: `/`
4. **Save and Deploy**

> Supabase의 **Authentication → URL Configuration**에서 `Site URL`을 Cloudflare Pages URL로 설정할 것.

---

## 6. 워크플로우 요약

```
일반 가입 → 판매자 신청 → 관리자 승인 → 판매자 글쓰기 → 관리자 게시글 승인 → 공개
```
