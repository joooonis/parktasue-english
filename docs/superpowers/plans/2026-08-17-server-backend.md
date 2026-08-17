# 서버 백엔드 및 라우트 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude 아티팩트 전용 `window.storage`를 Supabase로 교체하고, 학생(`/`)·교사(`/admin`) 페이지를 분리해 GitHub Pages에 배포 가능하게 만든다.

**Architecture:** 정적 HTML 2장(학생/교사)이 공용 스크립트(`test-engine.js`, `storage.js`)를 plain `<script>` 태그로 로드한다. 학생 접근은 공통 비밀번호를 검증하는 Postgres RPC(`security definer`)로만 이루어지고, 교사는 Supabase Auth 세션으로 테이블에 직접 접근한다(RLS). 빌드 도구 없음.

**Tech Stack:** Vanilla JS, supabase-js v2 (jsDelivr UMD, `window.supabase.createClient`), Supabase Postgres + Auth + pgcrypto, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-17-server-backend-design.md`

## Global Constraints

- 빌드 도구·npm 금지. plain `<script>` 태그, 전역 네임스페이스(`TestEngine`, `StorageAPI`) 사용.
- `alert()`/`confirm()` 금지 — `showNotice()` 토스트 + 삭제는 2번 클릭 인라인 확인(`data-confirming` + 3초 타임아웃) 유지.
- 빈칸 생성·채점·인쇄 알고리즘(`tokenize`, `splitSentences`, `pickBlankIndices`, `normalize`, autosize, print CSS)은 로직 무변경 이동. 유일한 허용 변경: `buildTest()`가 DOM 입력 대신 데이터 객체를 파라미터로 받도록 하는 것.
- anon 키로 테이블 직접 접근 불가 (RLS 정책은 `authenticated` 전용, 학생은 RPC만).
- UI 문구는 한국어, 기존 브랜드 스타일(`css/style.css`) 공유.
- 테스트: 유닛 테스트 프레임워크 없음(의존성 0 원칙). 검증은 (a) 로컬 `python3 -m http.server` 수동 플로우, (b) Supabase 세팅 후 curl로 RLS 차단 확인.

---

### Task 1: `supabase/schema.sql` — 테이블·RLS·RPC

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: 테이블 `passages`, `submissions`, `app_settings`; RPC `verify_student_password(p_password)`, `list_passages(p_password, p_school)`, `submit_result(...)`, `set_student_password(p_new_password)` — 시그니처는 스펙 5절과 동일. Task 3의 `StorageAPI`가 이 이름을 그대로 호출한다.

- [ ] **Step 1: schema.sql 작성** — 스펙 4·5절 그대로. pgcrypto 활성화, 3개 테이블, RLS enable + `authenticated` 전용 정책, 4개 RPC(`security definer`, `set search_path = public`), `anon`에 RPC 3개만 `grant execute`(`set_student_password`는 `authenticated`만). 초기 비밀번호는 `select set_student_password('CHANGE-ME');` 주석 안내로 처리.
- [ ] **Step 2: 문법 검토** — `psql` 없이 육안 검토(로컬 Postgres 없음). 함수마다 `revoke execute ... from public, anon;` 후 필요한 롤에만 grant 하는지 확인.
- [ ] **Step 3: Commit** — `git add supabase/schema.sql && git commit -m "feat: add Supabase schema (tables, RLS, student-password RPCs)"`

### Task 2: 정적 자산 분리 — `css/style.css`, `js/config.js`

**Files:**
- Create: `css/style.css` (index.html 9–312행의 `<style>` 내용 + 신규 화면용 소량 추가: 입장 폼, 지문 목록 카드, 로그인 폼, admin 탭)
- Create: `js/config.js` (`window.APP_CONFIG = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };` — 값은 배포 시 기입)

**Interfaces:**
- Produces: 모든 페이지가 `<link rel="stylesheet" href="/css/style.css">`(admin은 `../css/style.css`)와 `window.APP_CONFIG`를 사용.

- [ ] **Step 1: style.css로 스타일 이동** (기존 규칙 무변경, 신규 클래스만 추가: `.entry-form`, `.plist-item` 등 — 기존 `.lib-item` 패턴 재사용 우선)
- [ ] **Step 2: config.js 작성** (빈 값 + 주석으로 기입 안내)
- [ ] **Step 3: Commit**

### Task 3: `js/storage.js` — Supabase 어댑터

**Files:**
- Create: `js/storage.js`

**Interfaces:**
- Consumes: `window.APP_CONFIG`, `window.supabase.createClient`, Task 1의 RPC/테이블.
- Produces: `window.StorageAPI` =
  - `available()` → boolean (config 기입 여부)
  - `verifyStudentPassword(pw)` → Promise<boolean>
  - `listPassages(pw, school)` → Promise<passage[]> (컬럼: id, school, category, source, passage, translation, level, created_at)
  - `submitResult(pw, {studentName, school, passageId, passageSource, level, correctCount, total, pct, elapsedSeconds})` → Promise<void>
  - `signIn(email, pw)` / `signOut()` / `getSession()` → supabase auth 위임
  - `listAllPassages()` → Promise<passage[]> (교사, 테이블 직접 select)
  - `savePassage(row)` / `updatePassage(id, row)` / `deletePassage(id)`
  - `listSubmissions()` / `deleteSubmission(id)`
  - `setStudentPassword(newPw)`
  - 모든 실패는 `Error` throw — 화면 계층이 `showNotice`로 안내.

주의: `submissions`에 `elapsed_seconds int` 컬럼이 필요하다(기존 대시보드가 소요시간 표시). Task 1 schema에 포함할 것. `submit_result` RPC 파라미터에도 `p_elapsed_seconds int` 추가.

- [ ] **Step 1: storage.js 작성** (위 시그니처 그대로; supabase 클라이언트는 config 값 있을 때만 생성)
- [ ] **Step 2: Commit**

### Task 4: `js/test-engine.js` — 공용 시험 엔진

**Files:**
- Create: `js/test-engine.js` (index.html 503–865행에서 이동)

**Interfaces:**
- Produces: `window.TestEngine` =
  - `init({ getScreens, onSubmit })` — `getScreens()`는 `{testScreen, resultScreen, setupScreen}` DOM 반환; `onSubmit({correctCount,total,pct,elapsedSeconds})` 콜백
  - `build({passage, translation, source, student, level, showHint})` → async, 기존 buildTest 로직 (DOM 읽기 대신 파라미터)
  - `submit()` → 채점 + 결과 화면 전환 + `onSubmit` 호출
  - `retry()` → 같은 지문 재응시(빈칸 새로 추첨)
  - `stopTimer()`, `printCurrentScreen(hint)`, `DIFFICULTY_LABELS`
  - `showNotice(msg)`, `escapeHtml(str)` (공용 유틸로 함께 노출)
- 이동 대상 함수(로직 무변경): `STOPWORDS`, `DIFFICULTY_RANGES`, `showNotice`, `tokenize`, `pickBlankIndices`, `shuffle`, `splitSentences`, `measureTextWidth`, `autosizeBlank`, `updateAxisProgress`, `startTimer`/`stopTimer`, `normalize`, `escapeHtml`, `DIFFICULTY_LABELS`, `todayStr`, `fillPrintHeader`, `printCurrentScreen`
- `fillPrintHeader`는 build 시 전달받은 source/student/level 상태를 사용하도록 변경 (DOM input 참조 제거).

- [ ] **Step 1: test-engine.js 작성** (기존 코드 이동 + 파라미터화)
- [ ] **Step 2: Commit**

### Task 5: 학생 페이지 — `index.html` 재작성 + `js/student.js`

**Files:**
- Modify: `index.html` (전면 재작성 — 스타일·스크립트는 외부 파일 참조)
- Create: `js/student.js`

**Interfaces:**
- Consumes: `StorageAPI.verifyStudentPassword/listPassages/submitResult`, `TestEngine.*`

화면 구성:
1. `#entry-screen`: 이름·학교·공통 비밀번호 입력 → 검증 성공 시 목록으로. 세 값 localStorage(`axis-student-name/school/password`) 저장·자동입력. 검증 실패 시 showNotice.
2. `#list-screen`: `listPassages(pw, school)` 결과 카드 목록(출처/카테고리/난이도/등록일, `.lib-item` 스타일 재사용) + 새로고침. "응시" 클릭 → 힌트 토글 여부 선택 없이 기존 기본값(힌트 없음) + 지문의 저장된 level로 `TestEngine.build` 호출.
3. `#test-screen` / `#result-screen`: 기존 markup 이동(print header 포함). 결과 화면 버튼: "같은 지문 다시 풀기", "목록으로".
4. `onSubmit` 콜백에서 `submitResult` 호출 (실패 시 showNotice, 채점 자체는 유지 — 기존 동작과 동일).
5. `StorageAPI.available()`이 false면 입장 화면에 설정 안내 문구.

- [ ] **Step 1: index.html 재작성** (기존 test/result markup 재사용, setup/library/dashboard 제거)
- [ ] **Step 2: student.js 작성**
- [ ] **Step 3: 로컬 서버로 수동 검증** — `python3 -m http.server`; config 미기입 상태에서 안내 문구 확인, 콘솔 에러 0 확인
- [ ] **Step 4: Commit**

### Task 6: 교사 페이지 — `admin/index.html` + `js/admin.js`

**Files:**
- Create: `admin/index.html`
- Create: `js/admin.js`

**Interfaces:**
- Consumes: `StorageAPI.signIn/getSession/signOut/listAllPassages/savePassage/updatePassage/deletePassage/listSubmissions/deleteSubmission/setStudentPassword`, `TestEngine.*`

화면 구성:
1. `#login-screen`: 이메일·비밀번호 → `signIn`. 로드 시 `getSession()` 있으면 바로 통과.
2. `#setup-screen`: 기존 지문 입력 폼 + **대상 학교** 필드 추가. "저장" → `savePassage`; 보관함 목록(카테고리 필터 유지, DB 기반) → 불러오기(폼에 채움, 수정 저장은 `updatePassage`)/삭제(2클릭 확인). "테스트 미리보기 →" → `TestEngine.build`(응시자명 공란) → 시험지 PDF 인쇄 가능.
3. `#dashboard-screen`: 기존 대시보드 이동 + 학교 필터 추가(출처 필터와 병행). 데이터는 `listSubmissions()`.
4. `#settings-screen`: 학생 공통 비밀번호 변경(`setStudentPassword`) + 로그아웃 버튼.
5. 상단 탭 내비게이션(지문 관리 / 제출 현황 / 설정).

- [ ] **Step 1: admin/index.html 작성** (경로는 `../css/`, `../js/` 상대 참조)
- [ ] **Step 2: admin/js 로직 작성**
- [ ] **Step 3: 로컬 수동 검증** — 로그인 게이트 표시, 콘솔 에러 0
- [ ] **Step 4: Commit**

### Task 7: 문서 갱신 + 배포 체크리스트

**Files:**
- Modify: `README.md` (새 구조·사용법)
- Modify: `HANDOFF.md` (window.storage 제약 절 → Supabase 구조로 교체, 파일 맵 갱신)
- Create: `docs/DEPLOY.md` (Supabase 프로젝트 생성 → schema.sql 실행 → 교사 계정 생성·signup 비활성화 → config.js 기입 → GitHub Pages 활성화 → curl 검증 명령)

- [ ] **Step 1: 문서 3건 작성/갱신**
- [ ] **Step 2: Commit**

### Task 8: 통합 검증 (Supabase 프로젝트 준비 후)

사용자가 Supabase 프로젝트를 만들고 config.js를 채운 뒤 수행:

- [ ] 학생 플로우: 입장(오답 비번 차단 포함) → 목록 → 응시 → 채점 → 대시보드에 집계 확인
- [ ] 교사 플로우: 로그인 → 지문 저장/수정/삭제 → 미리보기 인쇄 → 비번 변경 후 학생 재입장 확인
- [ ] RLS 검증: `curl -H "apikey: <anon>" <url>/rest/v1/passages` → 빈 배열 또는 401/permission denied 확인
