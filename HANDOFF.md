# AXIS 백지테스트 — 개발자 인계 문서

박태수영어(대치명인은평 · 현시선학원) 내신영어 인터랙티브 빈칸 테스트 웹앱.
학생이 브라우저에서 지문의 빈칸을 채우고 즉시 채점받을 수 있는 단일 HTML 파일 애플리케이션입니다.

## 1. 파일 구조

```
axis_interactive_test.html   ← 전체 소스 (HTML + CSS + JS, 단일 파일, 약 1,170줄)
```

- 빌드 과정 없음. 외부 패키지 의존성 없음 (npm/webpack 등 불필요).
- 외부 리소스는 웹폰트 2건만 CDN에서 로드:
  - Google Fonts: `Noto Serif KR`, `Noto Sans KR`
  - jsDelivr: `Pretendard` variable font (브랜드 로고 워드마크 전용)
- 어떤 정적 웹서버에 올려도 그대로 동작 (Netlify, Vercel, GitHub Pages, 학원 자체 호스팅 등).

## 2. 기술 스택

순수 Vanilla JS (프레임워크 없음) + CSS 커스텀 프로퍼티(`:root` 변수) + 시맨틱 HTML.
IIFE 하나로 전체 스크립트를 감싸고 있으며(`<script>(function(){ ... })();</script>`), DOM 조작은 전부 `document.getElementById` / `createElement` 기반입니다.

## 3. 화면 구성 (4개 스크린, `.hidden` 클래스로 토글)

| id | 설명 |
|---|---|
| `#setup-screen` | 지문/해석/출처/난이도 입력, 지문 보관함(라이브러리) |
| `#test-screen` | 실제 빈칸 풀이 화면 (타이머, AXIS 진행바, 문장별 지문+해석) |
| `#result-screen` | 채점 결과 (점수, 색칠된 전체 지문 재노출, 빈칸별 정답 리스트) |
| `#dashboard-screen` | 교사용 — 전체 학생 제출 현황 집계 |

화면 전환은 각 스크린의 `.hidden` 클래스를 add/remove하는 방식이며, 라우터나 히스토리 API는 사용하지 않습니다.

## 4. 핵심 로직 (함수 맵)

### 지문 처리 / 빈칸 생성
- `tokenize(text)` — 텍스트를 단어/비단어 토큰으로 분리 (정규식 `/[A-Za-z]+(?:['’-][A-Za-z]+)*/g`)
- `splitSentences(text)` — 문단(빈 줄) → 문장(`.!?`) 단위로 분리, 한글 해석과 1:1 매칭시키는 데 사용
- `pickBlankIndices(wordTokens, level)` — 난이도별 빈칸 위치 선정
  - `basic`/`advanced`: 내용어(4글자 이상 & 불용어 아님) 우선순위로 셔플 후 목표 비율만큼 선택
  - `full`(통암기): 불용어(`STOPWORDS` Set, ~110단어) 제외 전부 빈칸 처리 (비율 아님, 결정론적)
  - 난이도별 목표 비율은 `DIFFICULTY_RANGES` 상수 (현재: 기본 15–20%, 심화 38–42%, 통암기는 불용어 제외 전체)
- `buildTest()` — 위 로직을 조합해 `#passageBox`에 문장 블록(영어+빈칸 `<input>`+한글 해석)을 렌더링. `async`이며 시작 시 `document.fonts.ready`를 기다려 폰트 로딩 전 너비 오측정을 방지함.

### 빈칸 입력 폭 자동조정
- `measureTextWidth(text)` — `<canvas>` 2D context로 실제 픽셀 폭을 측정 (ch 단위는 볼드체에서 부정확해 폐기됨)
- `autosizeBlank(input)` — 입력값과 정답 단어 중 더 넓은 쪽 기준으로 `input.style.width`를 픽셀 단위로 갱신, 15% 여유 + 40px 버퍼

### 채점 / 결과
- `submitTest()` — 모든 `.blank-input`을 비교(`normalize()`로 대소문자·문장부호 무시) → 정답/오답 클래스 부여 → `#passageBox`를 `#result-screen`으로 실제 DOM 이동(클론 아님, 그래야 `<input>`의 현재 value가 보존됨) → `submitScoreToTeacher()` 호출

### 인쇄 / PDF
- `printCurrentScreen(filenameHint)` — `document.title`을 임시로 바꾼 뒤 `window.print()` 호출. 실제 PDF 생성 라이브러리는 사용하지 않고 브라우저 인쇄 기능 + `@media print` CSS(파일 하단)로 처리.
- 인쇄 시 `.timer`, `.axis-track`, `.actions`, `#libraryBox` 등 화면 전용 UI는 CSS로 강제 숨김, 대신 `.print-only` 클래스의 인쇄 전용 헤더(`fillPrintHeader()`가 채움)가 노출됨.

### 저장 기능 (⚠️ 아래 5번 항목 필독)
- 지문 보관함: `loadIndex/saveIndex/saveCurrentToLibrary/loadFromLibrary/deleteFromLibrary` — 개인 저장(`shared:false`)
- 교사 대시보드: `loadSubmissionIndex/saveSubmissionIndex/submitScoreToTeacher/refreshDashboard/deleteSubmission` — 공유 저장(`shared:true`)
- 두 기능 모두 삭제 시 네이티브 `confirm()`을 쓰지 않고, 버튼을 2번 눌러야 삭제되는 인라인 확인 방식(`data-confirming` 속성 + 3초 타임아웃)을 사용함. `window.confirm()`은 iframe sandbox 환경에서 씹히는 경우가 있어 의도적으로 배제함. 같은 이유로 `alert()`도 전부 제거하고 자체 `showNotice(msg)` 토스트로 대체함.

## 5. ⚠️ 가장 중요한 제약: `window.storage`

지문 보관함과 교사 대시보드는 **Claude.ai 아티팩트 런타임 전용 API**인 `window.storage`(`get/set/delete/list`, key-value, `shared` boolean 파라미터)에 의존합니다. 이 API는:

- Claude.ai 안에서 이 HTML을 아티팩트로 열었을 때만 존재함
- 일반 웹서버에 그대로 배포하면 `window.storage`가 `undefined`가 되고, 코드 상단의 `storageAvailable` 플래그가 `false`가 되어 관련 UI가 자동으로 비활성화됨(에러 없이 안내 문구만 노출). 이 부분은 이미 방어 코드가 되어 있어 배포 자체는 깨지지 않음.

**실서비스로 이 기능(지문 저장, 학생 제출 결과 집계)을 살리려면 실제 백엔드가 필요합니다.** 교체 지점은 정확히 아래 두 그룹의 함수 내부이며, 시그니처(파라미터/리턴 형태)를 맞춰서 REST API 또는 Firebase 등으로 바꿔치기하면 나머지 UI 코드는 손댈 필요가 없습니다:

```js
// 교체 대상 1 — 개인 저장 (지문 보관함)
window.storage.get(key, shared)      // → {key, value, shared} | null (없으면 throw)
window.storage.set(key, value, shared)
window.storage.delete(key, shared)
window.storage.list(prefix, shared)

// 교체 대상 2 — 공유 저장 (제출 현황), shared=true로 호출되는 부분
```

키 네이밍 규칙 (그대로 유지 권장):
- `passage-index` (개인) — 보관함 목록 인덱스, JSON 배열
- `passage:{id}` (개인) — 개별 저장 지문 데이터
- `submission-index` (공유) — 전체 학생 제출 인덱스, JSON 배열
- `submission:{id}` — 현재는 별도 저장 없이 인덱스에 통째로 넣는 구조 (인덱스 배열 안에 모든 필드 포함)

## 6. 알려진 트레이드오프 / 설계 결정

- **로그인 시스템 없음**: "응시자 이름"은 자유 텍스트 입력이며 인증이 아님. 실제 계정/반별 로그인이 필요하면 새로 설계해야 함.
- **문장 분리는 정규식 기반**: `Dr.`, `U.S.` 같은 약어가 있으면 문장이 잘못 나뉠 수 있음 (마침표 기준 분리이므로).
- **PDF는 브라우저 인쇄 기반**: 별도 PDF 라이브러리(jsPDF 등) 미사용. 페이지네이션/여백은 `@page` CSS 규칙으로 제어.
- **공유 저장소 접근 통제 없음**: `shared:true` 데이터는 같은 링크에 접속하는 모든 사용자가 원칙적으로 접근 가능한 구조. 대시보드에 비밀번호 게이트는 없음 (민감 정보 아니라는 전제).

## 7. 빠르게 확인할 수 있는 진입점

- 난이도별 빈칸 비율 조정: `DIFFICULTY_RANGES` 상수 (검색: `const DIFFICULTY_RANGES`)
- 불용어 목록: `STOPWORDS` Set (검색: `const STOPWORDS`)
- 브랜드/색상 토큰: 파일 최상단 `:root { --navy: ...; --gold: ...; }`
- 인쇄 스타일: `@media print { ... }` 블록 (파일 내 검색)
