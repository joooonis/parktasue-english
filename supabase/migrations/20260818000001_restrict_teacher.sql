-- 권한을 "authenticated 전체"에서 "교사 계정 이메일"로 좁힌다.
-- 혹시 회원가입이 열려 있어도 새 계정은 아무 권한을 얻지 못한다.
-- 교사 이메일을 바꾸려면 아래 문자열을 바꿔 재실행.

drop policy if exists "teacher full access" on passages;
create policy "teacher full access" on passages
  for all to authenticated
  using ((auth.jwt()->>'email') = 'ed@bvrly.ai')
  with check ((auth.jwt()->>'email') = 'ed@bvrly.ai');

drop policy if exists "teacher full access" on submissions;
create policy "teacher full access" on submissions
  for all to authenticated
  using ((auth.jwt()->>'email') = 'ed@bvrly.ai')
  with check ((auth.jwt()->>'email') = 'ed@bvrly.ai');

drop policy if exists "teacher full access" on app_settings;
create policy "teacher full access" on app_settings
  for all to authenticated
  using ((auth.jwt()->>'email') = 'ed@bvrly.ai')
  with check ((auth.jwt()->>'email') = 'ed@bvrly.ai');

-- 학생 비밀번호 변경 함수도 교사 이메일(또는 service_role)로 제한
create or replace function set_student_password(p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role'
     and coalesce(auth.jwt()->>'email','') <> 'ed@bvrly.ai' then
    raise exception 'not authorized';
  end if;
  insert into app_settings (key, value)
  values ('student_password', crypt(p_new_password, gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end;
$$;
