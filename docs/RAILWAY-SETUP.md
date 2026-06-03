# Railway 블로그 엔진 배포 가이드 (ours-magazine 전용 서비스)

ours-magazine.jp 블로그 자동 발행 엔진을 Railway에 헤드리스로 배포한다.
**스케줄 + 시드 리스트 모드**: 매일 cron이 `seed-topics.yml`에서 미발행 주제 1개를 골라 → 일본어 100점 기사 생성(write→인포그래픽→audit→fact-check→md-publish) → `git push origin main` → Vercel 자동배포.

> **현재 모드 = 시드 기반** (Semrush 미연결). 주제를 사람이 `seed-topics.yml`에 넣어야 함. 사람 없는 자동 주제 발굴은 Semrush 붙이면 활성화(`.env.railway.example` 하단).

---

## 0. 사전 준비 (필수)

1. **레포를 main에 push.** Railway는 `umm240227/-ours-magazine` 의 main에서 빌드한다. 이 자동화 일체(`.claude/skills`, `.ai-rules`, `script/`, `content/articles`, `Dockerfile`, `railway.json`)가 origin/main에 있어야 한다. (POC 기사를 push하면 사이트에 공개되니 검토 후 진행.)
2. **토큰 2개 발급:**
   - `ANTHROPIC_API_KEY` — console.anthropic.com (claude -p 헤드리스 인증).
   - `GIT_PUSH_TOKEN` — gono92의 fine-grained PAT, 스코프 `-ours-magazine` 1개 + **Contents: Read/Write**.

## 1. Railway 서비스 생성

1. Railway 대시보드 → **New Project → Deploy from GitHub repo** → `umm240227/-ours-magazine` 선택. (또는 기존 프로젝트에 New Service.)
2. 빌드는 자동으로 **`Dockerfile`** 사용(`railway.json`에 명시). Nixpacks 아님.

## 2. 환경변수 (Service → Variables)

`.env.railway.example` 참고. 최소:
```
ANTHROPIC_API_KEY = sk-ant-...
GIT_PUSH_TOKEN    = github_pat_...
SLACK_WEBHOOK_URL = https://hooks.slack.com/...   (선택)
MAX_BUDGET_USD    = 30                              (1회 예산 캡)
```

## 3. Cron 스케줄 설정 (CRITICAL)

이 서비스는 **상시 실행이 아니라 cron 트리거**다(`restartPolicyType: NEVER`).
- Railway Service → **Settings → Cron Schedule** 에 cron 식 입력.
- 예: `30 22 * * *` = 매일 **07:30 JST**(UTC 22:30). 한국 KR 07:30 launchd 대응.
- cron이 발화하면 컨테이너가 `run-railway.sh` 1회 실행 → 1편 생성·push 후 종료.

## 4. 배포 + 검증

1. Deploy 트리거 (push 또는 수동).
2. 빌드 로그: Chromium·Noto CJK 폰트·claude CLI·npm ci 설치 확인.
3. 수동 1회 실행(또는 cron 대기) 후:
   - **Deploy Logs**: `시드: tiktok-fyp-reach-guide` → `claude -p 실행` → `✅ 발행+push`.
   - **Slack**: `✅ Railway 블로그 발행: <slug> → Vercel 배포 시작`.
   - **사이트**: `https://www.ours-magazine.jp/articles/<slug>` 새 글 + 인포그래픽.
   - `git log origin/main` 에 `post: <slug> (audit 100)` 커밋.

## 5. 시드 리스트 관리

- `script/cron/seed-topics.yml` 에 주제 추가 (slug·topic·main_keyword·secondary·category).
- 스케줄러는 `content/articles/`에 **없는** 첫 시드를 고름 → 매일 1개씩 소진.
- 전부 발행되면 Slack `시드 소진` → 주제 추가 후 다시 채워짐.

## 6. 비용·한도

- 1편 = Opus 헤드리스 (write+audit 루프+인포그래픽+팩트체크). `MAX_BUDGET_USD`로 캡(기본 $30/편). 매일 1편 = 월 ~$X.
- 100점 게이트(이미지품질·팩트체크·답변캡슐·구조)를 `md-publish`가 전부 강제 → **게이트 미통과 시 발행 안 됨**(failed Slack). 즉 "발행되면 100점".

## 7. 컨테이너가 강제하는 품질 게이트 (md-publish)

발행되려면 전부 통과: `_audit_score===100` · 이미지≥3·hero typography · **이미지품질 audit-blog-image-quality 0결함** · **fact-check-gate(외부출처≥3 + `_fact_checked` 마커 + 죽은링크0)** · audit-cdn-gate(dim/md5) · validate-blog-publish(여백·width·타입) · 답변캡슐 100%. 하나라도 실패하면 보강 재시도, 8회 초과 시 `failed`.

## 8. 남은 Phase 3 후속

- **Semrush jp** 붙이면: 시드 없이 자동 주제 발굴(`create auto` 무시드) 활성. `SEMRUSH_API_KEY` + topic/keywords의 Semrush MCP→HTTP API 전환.
- **Google 색인**: `index-submit.mjs` 무인화 — `GOOGLE_REFRESH_TOKEN`(1회 로컬 발급).
- **폰트 self-host**: Tailwind 정적빌드 + Noto JP woff2 로컬화(현재 Railway는 네트워크로 CDN OK + 컨테이너 fonts-noto-cjk fallback).
