# AXIS 백지테스트 — 개발자 인계 문서

박태수영어(대치명인은평 · 현시선학원) 내신영어 인터랙티브 빈칸 테스트 웹앱.
학생이 브라우저에서 지문의 빈칸을 채우고 즉시 채점받는 정적 사이트 + Supabase 백엔드 구조입니다.

> 이 문서는 서버 연동 이후 버전입니다. 과거 단일 HTML + `window.storage`(Claude
> 아티팩트 전용 API) 구조는 폐기되었습니다.

## 1. 파일 구조

```
index.html          학생 페이지 (입장 → 지문 목록 → 응시 → 채점)
admin/index.html    교사 페이지 (/admin — 로그인 → 지문 관리 → 대시보드 → 설정)
css/style.css       공용 스타일 (브랜드 토큰, 화면별 스타일, @media print)
js/config.js        window.APP_CONFIG — Supabase URL/anon key
js/storage.js       window.StorageAPI — 서버 통신 유일 계층
js/test-engine.js   window.TestEngine — 빈칸 생성·채점·인쇄 엔진 (공용)
js/student.js       학생 화면 로직
js/admin.js         교사 화면 로직
supabase/schema.sql DB 스키마 (SQL Editor에서 1회 실행)
docs/DEPLOY.md      배포 가이드 (Supabase 세팅 → GitHub Pages)
```

- 빌드 과정 없음, npm 없음. plain `<script>` 태그 + 전역 네임스페이스.
- 외부 리소스: Google Fonts / Pretendard 웹폰트, supabase-js v2 (jsDelivr UMD,
  `window.supabase.createClient`).

## 2. 백엔드 구조 (Supabase)

테이블 3개 (`supabase/schema.sql`):

- `passages` — school, category, source, passage, translation, level, created_at
- `submissions` — student_name, school, passage_id, passage_source(스냅샷), level,
  correct_count, total, pct, elapsed_seconds, submitted_at
- `app_settings` — key/value. `student_password`는 bcrypt 해시(pgcrypto)로 저장.

접근 통제:

- **RLS**: 세 테이블 모두 `authenticated`(교사)에게만 전체 권한. anon은 정책이
  없어 직접 조회 시 빈 배열/차단.
- **학생 접근은 RPC로만** (`security definer`, anon에게 execute 권한):
  - `verify_student_password(p_password)` → boolean
  - `list_passages(p_password, p_school)` → 비번 틀리면 예외
  - `submit_result(p_password, ...)` → 비번 틀리면 예외 (가짜 제출 차단)
  - `set_student_password(p_new_password)` → **authenticated 전용** (anon 실행 불가)
- 교사 인증: Supabase Auth 이메일 계정 1개 (회원가입 비활성화, 대시보드에서 수동
  생성). 세션은 supabase-js가 localStorage에 유지.
- 알려진 허용 한계: 공통 비밀번호를 아는 학생이 다른 학교명을 입력하면 그 학교
  지문도 볼 수 있음 (지문은 민감정보 아님 전제).

## 3. 계층 구조

```
student.js / admin.js   (화면 로직 — 이벤트, 화면 전환, 목록 렌더)
        │
        ├── TestEngine  (js/test-engine.js — 서버 무관, 순수 클라이언트)
        └── StorageAPI  (js/storage.js — 모든 서버 통신)
                └── supabase-js → Supabase
```

`StorageAPI`는 실패 시 `Error`를 throw하고, 화면 계층이 `showNotice()` 토스트로
안내합니다. config 미기입 시 `StorageAPI.available()`이 false → 각 페이지가
버튼 비활성화 + 안내 문구 표시 (에러 없이 동작).

## 4. TestEngine (핵심 로직, 서버 무관)

`window.TestEngine` 공개 API:

- `init({onSubmit})` — 채점 완료 콜백 등록 (학생: 서버 제출 / 교사: null)
- `build({passage, translation, source, student, level, showHint})` — async,
  성공 시 true. 문장 분리 → 토큰화 → 난이도별 빈칸 선정 → `#passageBox` 렌더 →
  타이머 시작. `document.fonts.ready`를 기다려 폭 오측정 방지.
- `submit()` — 채점, 결과 화면 전환, `{correctCount,total,pct,elapsedSeconds,...}`
  반환 + `onSubmit` 호출
- `retry()` — 같은 지문 재응시 (빈칸 새로 추첨)
- `stopTimer()`, `printCurrentScreen(hint)`, `showNotice(msg)`, `escapeHtml(str)`,
  `DIFFICULTY_LABELS`

내부 로직 (기존 단일 파일 버전에서 무변경 이동):

- `tokenize(text)` — 단어/비단어 토큰 분리 (정규식 `/[A-Za-z]+(?:['’-][A-Za-z]+)*/g`)
- `splitSentences(text)` — 문단(빈 줄) → 문장(`.!?`) 분리, 한글 해석과 1:1 매칭용
- `pickBlankIndices(wordTokens, level)` — 난이도별 빈칸 선정
  - `basic`/`advanced`: 내용어(4글자 이상 & 불용어 아님) 우선 셔플 후 목표 비율 선택
  - `full`(통암기): 불용어(`STOPWORDS` Set, ~110단어) 제외 전부 빈칸
  - 비율은 `DIFFICULTY_RANGES` (기본 15–20%, 심화 38–42%)
- `measureTextWidth`/`autosizeBlank` — `<canvas>`로 실측해 빈칸 폭 픽셀 단위 조정
- `normalize()` — 채점 시 대소문자·문장부호 무시
- 채점 후 `#passageBox`를 결과 화면으로 **DOM 실제 이동**(클론 아님 — input value 보존)
- 인쇄: `window.print()` + `@media print` CSS. PDF 라이브러리 없음.

이 엔진이 요구하는 DOM id는 파일 상단 주석 참고 — 학생/교사 페이지 모두 해당
markup(test-screen, result-screen, print header 등)을 갖고 있어야 합니다.

## 5. 화면 흐름

**학생 (`/`, student.js)**: entry-screen(이름·학교·공통비번, localStorage 기억)
→ list-screen(학교별 지문 카드) → test-screen → result-screen(자동 제출).
지문 직접 입력 기능 없음.

**교사 (`/admin`, admin.js)**: login-screen → 탭 3개(지문 관리 / 제출 현황 / 설정).
지문 관리 화면에서 폼 저장(신규/수정)·보관함(학교/카테고리 필터)·미리보기
(TestEngine.build, 채점 가능하나 서버 제출 없음). 대시보드는 학교+출처 필터.

## 6. 알려진 트레이드오프 / 설계 결정

- **삭제 확인**: 네이티브 `confirm()` 대신 2번 클릭 인라인 확인(`data-confirming`
  + 3초 타임아웃). `alert()`도 미사용 — `showNotice()` 토스트로 통일.
- **문장 분리는 정규식 기반**: `Dr.`, `U.S.` 같은 약어에서 오분리 가능.
- **학생 신원은 자유 텍스트**: 이름·학교는 인증이 아니라 기록용.
- **PDF는 브라우저 인쇄 기반**: `@page` CSS로 여백/페이지네이션 제어.
- **LLM 미사용**: 빈칸 선정은 규칙 기반. AI 빈칸 생성이 필요해지면 Supabase Edge
  Function을 프록시로 추가하는 확장 경로를 열어둠 (설계 스펙 참고).

## 7. 빠르게 확인할 수 있는 진입점

- 난이도별 빈칸 비율: `js/test-engine.js`의 `DIFFICULTY_RANGES`
- 불용어 목록: `js/test-engine.js`의 `STOPWORDS`
- 브랜드/색상 토큰: `css/style.css` 최상단 `:root`
- 인쇄 스타일: `css/style.css`의 `@media print`
- 서버 스키마/권한: `supabase/schema.sql`
- 설계 배경: `docs/superpowers/specs/2026-08-17-server-backend-design.md`
