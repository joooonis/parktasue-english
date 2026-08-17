-- AXIS 백지테스트 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 1회 실행하세요.
-- 실행 후 맨 아래의 "초기 비밀번호 설정" 안내를 따라주세요.

create extension if not exists pgcrypto with schema extensions;

-- ---------- 테이블 ----------

create table if not exists passages (
  id          uuid primary key default gen_random_uuid(),
  school      text not null,                 -- 대상 학교 (예: '배명고')
  category    text,                          -- 예: '2학기 기말'
  source      text,                          -- 예: '2025_09_고2_서울시교육청_20번'
  passage     text not null,                 -- 영어 지문
  translation text,                          -- 한글 해석 (문장별 줄바꿈, 선택)
  level       text not null default 'basic', -- basic | advanced | full
  created_at  timestamptz not null default now()
);

create table if not exists submissions (
  id              uuid primary key default gen_random_uuid(),
  student_name    text not null,
  school          text not null,
  passage_id      uuid references passages(id) on delete set null,
  passage_source  text,                      -- 지문 삭제 후에도 출처 표시 유지용 스냅샷
  level           text,
  correct_count   int not null,
  total           int not null,
  pct             numeric not null,
  elapsed_seconds int not null default 0,
  submitted_at    timestamptz not null default now()
);

create table if not exists app_settings (
  key   text primary key,
  value text not null                        -- student_password는 bcrypt 해시로 저장
);

-- ---------- RLS: anon은 어떤 테이블도 직접 접근 불가, 교사(authenticated)만 전체 권한 ----------

alter table passages     enable row level security;
alter table submissions  enable row level security;
alter table app_settings enable row level security;

drop policy if exists "teacher full access" on passages;
create policy "teacher full access" on passages
  for all to authenticated using (true) with check (true);

drop policy if exists "teacher full access" on submissions;
create policy "teacher full access" on submissions
  for all to authenticated using (true) with check (true);

drop policy if exists "teacher full access" on app_settings;
create policy "teacher full access" on app_settings
  for all to authenticated using (true) with check (true);

-- ---------- RPC: 학생 접근은 공통 비밀번호 검증을 거치는 함수로만 ----------
-- security definer 함수는 소유자(postgres) 권한으로 실행되어 RLS를 우회하므로,
-- 함수 안의 비밀번호 검증이 실질적인 방어선이다.

create or replace function verify_student_password(p_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from app_settings
    where key = 'student_password'
      and value = crypt(p_password, value)
  );
$$;

create or replace function list_passages(p_password text, p_school text)
returns setof passages
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not verify_student_password(p_password) then
    raise exception 'invalid password';
  end if;
  return query
    select * from passages
    where school = p_school
    order by created_at desc;
end;
$$;

create or replace function submit_result(
  p_password        text,
  p_student_name    text,
  p_school          text,
  p_passage_id      uuid,
  p_passage_source  text,
  p_level           text,
  p_correct         int,
  p_total           int,
  p_pct             numeric,
  p_elapsed_seconds int
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not verify_student_password(p_password) then
    raise exception 'invalid password';
  end if;
  insert into submissions
    (student_name, school, passage_id, passage_source, level,
     correct_count, total, pct, elapsed_seconds)
  values
    (p_student_name, p_school, p_passage_id, p_passage_source, p_level,
     p_correct, p_total, p_pct, p_elapsed_seconds);
end;
$$;

-- 학생 공통 비밀번호 변경 (교사 전용 — grant로 통제, SQL Editor의 postgres는 superuser라 항상 실행 가능)
create or replace function set_student_password(p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into app_settings (key, value)
  values ('student_password', crypt(p_new_password, gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- ---------- 함수 실행 권한 ----------

revoke execute on function verify_student_password(text) from public;
grant  execute on function verify_student_password(text) to anon, authenticated;

revoke execute on function list_passages(text, text) from public;
grant  execute on function list_passages(text, text) to anon, authenticated;

revoke execute on function submit_result(text, text, text, uuid, text, text, int, int, numeric, int) from public;
grant  execute on function submit_result(text, text, text, uuid, text, text, int, int, numeric, int) to anon, authenticated;

revoke execute on function set_student_password(text) from public, anon;
grant  execute on function set_student_password(text) to authenticated, service_role;

-- ---------- 초기 비밀번호 설정 (아래 주석을 원하는 비밀번호로 바꿔 실행) ----------
-- select set_student_password('여기에-학생-공통-비밀번호');
