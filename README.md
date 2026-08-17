# 박태수영어 Signature 백지테스트

내신영어 인터랙티브 빈칸 테스트 웹앱. 교사가 지문을 등록하면 학생이 브라우저에서
빈칸을 채우고 즉시 채점받으며, 점수는 교사 대시보드에 자동 집계됩니다.

빌드 도구 없는 정적 사이트(Vanilla JS) + Supabase 백엔드 구조입니다.

## 페이지

| 경로 | 대상 | 기능 |
|---|---|---|
| `/` | 학생 | 이름·학교·공통 비밀번호로 입장 → 학교별 지문 목록 → 응시 → 즉시 채점 → 점수 자동 제출 |
| `/admin` | 교사 | 로그인 → 지문 등록·수정·삭제(보관함) → 시험지 미리보기·PDF 인쇄 → 제출 현황 대시보드 → 학생 비밀번호 변경 |

## 파일 구조

```
index.html          학생 페이지
admin/index.html    교사 페이지
css/style.css       공용 스타일
js/config.js        Supabase URL/anon key (배포 시 기입)
js/storage.js       Supabase 어댑터 (모든 서버 통신)
js/test-engine.js   빈칸 생성·채점·인쇄 엔진 (공용)
js/student.js       학생 화면 로직
js/admin.js         교사 화면 로직
supabase/schema.sql DB 스키마 (테이블·RLS·RPC, 1회 실행)
```

## 배포

[`docs/DEPLOY.md`](./docs/DEPLOY.md) 참고 — Supabase 무료 프로젝트 세팅(1회) 후
GitHub Pages로 배포합니다. 이후에는 `main`에 push하면 곧 배포입니다.

## 로컬 실행

```bash
python3 -m http.server 8000
# 학생: http://localhost:8000/
# 교사: http://localhost:8000/admin/
```

`js/config.js`가 비어 있으면 서버 기능(입장·저장·대시보드)은 비활성화되고
안내 문구가 표시됩니다. 빈칸 생성·채점 자체는 순수 클라이언트 로직입니다.

## 개발 문서

코드 구조·함수 맵·설계 결정은 [`HANDOFF.md`](./HANDOFF.md),
설계 스펙은 `docs/superpowers/specs/`를 참고하세요.
