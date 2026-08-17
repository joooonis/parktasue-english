# AXIS 백지테스트 — 서버 백엔드 및 라우트 분리 설계

날짜: 2026-08-17
상태: 설계 확정 (구현 전)

## 1. 배경과 목표

현재 앱은 단일 `index.html`(Vanilla JS)이며, 지문 보관함과 교사 대시보드가
Claude.ai 아티팩트 전용 API `window.storage`에 의존한다. 일반 웹서버에
배포하면 두 기능이 비활성화된다.

이번 작업의 목표:

1. `window.storage`를 실제 백엔드(Supabase)로 교체하여 지문 저장·제출 집계를
   실서비스로 동작시킨다.
2. 학생용 페이지와 교사용 페이지를 라우트로 분리한다 (`/` 학생, `/admin` 교사).
3. GitHub Pages에 배포한다.

빈칸 생성·채점·인쇄 등 클라이언트 로직은 **변경하지 않는다** (파일 이동만).

## 2. 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 백엔드 | Supabase (Postgres + Auth + RPC), 무료 티어 |
| 정적 호스팅 | GitHub Pages (main 브랜치 root) |
| 파일 구조 | 단일 HTML 해체 → html/css/js 분리, 빌드 도구 없음 |
| 교사 인증 | Supabase Auth 이메일/비밀번호 계정 1개, `/admin` 진입 게이트 |
| 학생 인증 | 계정 없음. 전체 학생 공통 비밀번호 1개 (서버 검증) |
| 지문 배포 단위 | 학교 단위 — 교사가 지문 저장 시 대상 학교 지정, 학생은 자기 학교 목록에서 선택 |
| LLM 빈칸 생성 | 이번 범위에서 제외. 규칙 기반 유지 (추후 Supabase Edge Function으로 확장 가능) |
| 학생 개인 계정 / 반별 배정 | 제외 |
| PDF 라이브러리 | 제외. 브라우저 인쇄(`@media print`) 유지 |

## 3. 파일 구조

```
index.html          ← 학생용: 입장(이름+학교+공통비번) → 지문 목록 → 응시 → 채점/인쇄
admin/index.html    ← 교사용(/admin): 로그인 → 지문 등록·보관함 → 대시보드 → 설정
css/style.css       ← 공용 스타일 (기존 <style> 블록 이동)
js/config.js        ← SUPABASE_URL, SUPABASE_ANON_KEY (anon key는 공개 전제)
js/storage.js       ← Supabase 어댑터 (아래 6절의 함수만 노출)
js/test-engine.js   ← 빈칸 생성·채점·인쇄 로직 (공용, 기존 코드 무변경 이동)
js/student.js       ← 학생 화면 로직
js/admin.js         ← 교사 화면 로직
supabase/schema.sql ← 테이블·RLS·RPC 생성 스크립트 (Supabase SQL Editor에서 1회 실행)
```

- supabase-js는 CDN(`jsdelivr`)에서 로드. npm/번들러 없음.
- GitHub Pages에서 `/admin/` 폴더가 곧 라우트이므로 라우터 불필요.
- `test-engine.js`로 이동하는 함수: `tokenize`, `splitSentences`,
  `pickBlankIndices`, `buildTest`, `measureTextWidth`, `autosizeBlank`,
  `normalize`, 채점 로직, `printCurrentScreen`, `fillPrintHeader`,
  `STOPWORDS`, `DIFFICULTY_RANGES`, `showNotice`.

## 4. 데이터 모델 (Supabase Postgres)

```sql
-- 지문
create table passages (
  id          uuid primary key default gen_random_uuid(),
  school      text not null,            -- 대상 학교 (예: '배명고')
  category    text,                     -- 예: '2학기 기말'
  source      text,                     -- 예: '2025_09_고2_서울시교육청_20번'
  passage     text not null,            -- 영어 지문
  translation text,                     -- 한글 해석 (문장별 줄바꿈, 선택)
  level       text not null default 'basic',  -- basic | advanced | full
  created_at  timestamptz not null default now()
);

-- 제출 기록
create table submissions (
  id            uuid primary key default gen_random_uuid(),
  student_name  text not null,
  school        text not null,
  passage_id    uuid references passages(id) on delete set null,
  passage_source text,                  -- 지문 삭제 후에도 출처 표시 유지용 스냅샷
  level         text,
  correct_count int not null,
  total         int not null,
  pct           numeric not null,
  submitted_at  timestamptz not null default now()
);

-- 설정 (학생 공통 비밀번호 등)
create table app_settings (
  key   text primary key,
  value text not null                   -- student_password는 bcrypt 해시로 저장 (pgcrypto)
);
```

기존 `passage-index`/`submission-index` 인덱스 키 개념은 폐기 — DB 쿼리가 대체.

## 5. 접근 통제 (RLS + RPC)

원칙: **anon 키로는 어떤 테이블도 직접 읽거나 쓸 수 없다.** 학생 접근은 전부
공통 비밀번호를 검증하는 `security definer` RPC를 통해서만 이루어진다.

| 대상 | 방법 | 가능한 작업 |
|---|---|---|
| 학생 (anon + 공통비번) | RPC만 | 학교별 지문 목록/조회, 제출 삽입 |
| 교사 (authenticated) | 테이블 직접 + RLS | passages CRUD, submissions 조회/삭제, 비번 변경 |
| 비밀번호 없는 방문자 | — | 아무것도 불가 |

RLS 정책:

- `passages`, `submissions`, `app_settings`: RLS 활성화.
  `authenticated` 롤에만 전체 권한 정책. `anon`에는 정책 없음(전부 차단).

RPC (전부 `security definer`, `anon` 실행 허용):

```sql
-- 입장 게이트: 비밀번호 검증
verify_student_password(p_password text) returns boolean

-- 학교별 지문 목록 (비번 불일치 시 예외)
list_passages(p_password text, p_school text)
  returns setof passages  -- 전 컬럼 반환 (지문 자체가 응시 재료이므로 분리 조회 불필요)

-- 점수 제출 (비번 불일치 시 예외 → 외부인의 가짜 제출 차단)
submit_result(p_password text, p_student_name text, p_school text,
              p_passage_id uuid, p_passage_source text, p_level text,
              p_correct int, p_total int, p_pct numeric) returns void

-- 학생 비밀번호 변경 (authenticated 전용, anon 실행 불가)
set_student_password(p_new_password text) returns void
```

- 비밀번호는 `app_settings.student_password`에 bcrypt 해시(pgcrypto
  `crypt()`)로 저장, `crypt()` 비교로 검증.
- 초기 비밀번호는 `schema.sql` 실행 시 1회 세팅 (플레이스홀더를 교사가 바꿔서 실행).
- 교사 계정은 Supabase 대시보드에서 수동 생성 1개. 회원가입 UI 없음
  (Supabase 프로젝트 설정에서 signup 비활성화).

한계(허용): 공통 비밀번호를 아는 학생이 다른 학교명을 입력하면 그 학교 지문도
볼 수 있다. 지문은 민감 정보가 아니므로 허용 범위로 둔다.

## 6. 프론트 어댑터 (`js/storage.js`)

UI 코드가 호출하는 유일한 저장 계층. 기존 `window.storage` 호출부를 아래
함수로 교체하며, 시그니처 밖의 UI 로직은 손대지 않는다.

```
학생용:  verifyStudentPassword(pw), listPassages(pw, school),
         submitResult(pw, {...})
교사용:  signIn(email, pw), signOut(), getSession(),
         savePassage({...}), updatePassage(id, {...}), deletePassage(id),
         listAllPassages(), listSubmissions(), deleteSubmission(id),
         setStudentPassword(newPw)
```

- 실패 시 예외를 던지고, 화면 계층은 기존 `showNotice()` 토스트로 안내
  (기존 앱의 no-alert/no-confirm 원칙 유지).
- 오프라인/네트워크 오류: 토스트로 "저장 실패, 네트워크 확인" 안내.
  로컬 캐시/재시도 큐는 이번 범위에서 제외.

## 7. 화면 흐름

### 학생 (`/`)

1. **입장 화면**: 이름·학교·공통 비밀번호 입력. 세 값 모두 localStorage에
   기억(재방문 시 자동 입력). 비밀번호는 `verify_student_password`로 확인.
2. **지문 목록**: 자기 학교 지문 카드 목록 (출처·카테고리·난이도·등록일).
   기존 보관함 목록 UI 재사용.
3. **응시 → 채점**: 기존 `#test-screen`/`#result-screen` 흐름 그대로.
   제출 시 `submit_result` 호출 (이름·학교 포함).
4. **인쇄**: 기존 브라우저 인쇄 기능 그대로.
5. 학생 페이지에는 지문 직접 입력창이 없다 (교사 전용으로 이동).

### 교사 (`/admin`)

1. **로그인 게이트**: 이메일/비밀번호. supabase-js가 세션을 localStorage에
   유지하므로 매번 로그인하지 않는다.
2. **지문 등록/보관함**: 기존 설정 화면(지문·해석·출처·카테고리·난이도 입력)
   + **대상 학교** 필드 추가. 저장/수정/삭제. 삭제는 기존의 2번 클릭 인라인
   확인 방식 유지. 시험지 미리보기·PDF 인쇄 가능 (`test-engine.js` 공용).
3. **대시보드**: 제출 현황 목록 + 학교 필터. 삭제 가능.
4. **설정**: 학생 공통 비밀번호 변경.

## 8. 배포

1. Supabase 무료 프로젝트 생성 → `supabase/schema.sql`을 SQL Editor에서 실행
   → 교사 계정 생성, signup 비활성화 → URL/anon key를 `js/config.js`에 기입.
2. GitHub Pages: Settings → Pages → `main` 브랜치 `/ (root)`. 이후 push가 곧 배포.
3. anon key는 공개되어도 안전한 전제(5절의 RLS/RPC가 실제 방어선).

## 9. 테스트 전략

- **회귀 범위**: 빈칸 생성·채점·인쇄 로직은 무변경 이동이므로, 이동 후 학생
  응시 전체 흐름(입장→목록→응시→채점→인쇄)을 수동 확인.
- **어댑터**: 로컬에서 `python3 -m http.server`로 띄워 실제 Supabase 연동 확인
  — 지문 CRUD, 제출 집계, 비번 검증(오답 비번 시 차단 포함).
- **접근 통제 검증**: anon key만으로 REST API 직접 호출 시 passages/submissions
  가 읽히지 않는 것을 curl로 확인.

## 10. 범위 제외 (명시)

- LLM 기반 빈칸 생성·자동 번역 (추후 Edge Function으로 확장 가능하도록 문만 열어둠)
- 학생 개인 계정, 반별 배정, 학생별 이력 페이지
- PDF 생성 라이브러리 (브라우저 인쇄 유지)
- 오프라인 지원, 제출 재시도 큐
- 문장 분리 개선 (`Dr.` 등 약어 이슈는 기지 사항으로 유지)
