# 배포 가이드

한 번만 하면 되는 초기 세팅입니다. 이후에는 `main`에 push하는 것만으로 배포됩니다.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 가입 → **New project** (무료 플랜이면 충분)
2. 프로젝트 생성 완료 후 **SQL Editor** 열기
3. 이 저장소의 `supabase/schema.sql` 내용 전체를 붙여넣고 **Run**
4. 이어서 학생 공통 비밀번호를 설정 (원하는 비밀번호로 바꿔서 실행):
   ```sql
   select set_student_password('여기에-학생-공통-비밀번호');
   ```

## 2. 교사 계정 만들기 + 회원가입 차단

1. **Authentication → Users → Add user → Create new user**
   - 이메일/비밀번호 입력 (이 계정으로 `/admin`에 로그인)
   - "Auto Confirm User" 체크
2. **Authentication → Sign In / Up** 설정에서 **Allow new users to sign up 끄기**
   (외부인이 계정을 만들어 교사 권한을 얻는 것을 차단)

## 3. 접속 정보 기입

**Project Settings → API** 에서 두 값을 복사해 `js/config.js`에 기입:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',   // Project URL
  SUPABASE_ANON_KEY: 'eyJ...'                     // anon public key
};
```

anon key는 공개되어도 안전한 전제입니다 — 실제 접근 통제는 DB의 RLS와
비밀번호 검증 RPC가 담당합니다.

커밋 & push:

```bash
git add js/config.js
git commit -m "chore: add Supabase credentials"
git push
```

## 4. GitHub Pages 켜기

저장소 **Settings → Pages → Source: `main` 브랜치 / `/ (root)`** 선택 후 저장.
잠시 후 접속 가능:

- 학생: `https://joooonis.github.io/parktasue-english/`
- 교사: `https://joooonis.github.io/parktasue-english/admin/`

## 5. 배포 후 검증

### 기능 확인
1. `/admin` 접속 → 교사 로그인 → 지문 저장 (대상 학교 지정)
2. `/` 접속 → 이름·학교·공통 비밀번호로 입장 → 지문 목록 → 응시 → 채점
   - 일부러 틀린 비밀번호를 넣어 입장이 차단되는지도 확인
3. `/admin` → 제출 현황 탭에서 방금 제출한 점수 확인

### 보안 확인 (선택)
anon key만으로 테이블이 직접 읽히지 않는지 확인 — 빈 배열 `[]`이 나와야 정상:

```bash
curl -s "https://xxxxxxxx.supabase.co/rest/v1/passages?select=*" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
# 기대 결과: []   (RLS가 anon의 조회를 차단)
```

## 운영 팁

- **학생 비밀번호 변경**: `/admin` → 설정 탭. 학기마다 바꾸는 것을 권장.
- **교사 비밀번호 분실**: Supabase 대시보드 → Authentication → Users에서 재설정.
- **데이터 백업**: Supabase 대시보드 → Table Editor에서 CSV 내보내기 가능.
