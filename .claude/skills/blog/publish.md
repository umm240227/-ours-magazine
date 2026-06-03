
# blog/publish.md — 검토 → 마크다운 발행 (md-publish.mjs → Vercel)

0. **`.ai-rules/jp-site-config.md`를 가장 먼저 Read** (상대경로 `../../../.ai-rules/jp-site-config.md`) — JP 플랫폼/로케일 정본. 본 문서와 충돌하는 발행 경로·DB·Naver·draft 경로·`/referral`·폰트·검증 타깃은 이 문서가 **무조건 우선**.

## 역할

`blog/write.md`로 만든 draft 또는 기존 글을 검토하고 마크다운으로 발행한다(`md-publish.mjs` → Vercel). 이미지가 있으면 `public/images/articles/<slug>/` 복사 + 마크다운 생성을 자동 수행.

### 배포 시스템 동작 (필수 이해)

JP 매거진은 **마크다운(콘텐츠 소스, `content/articles/<slug>.md`) + Next.js/Vercel(production 사이트 www.ours-magazine.jp)** 구조다(jp-site-config §1). 발행 흐름을 정확히 따르지 않으면 **"로컬엔 마크다운 있는데 사이트엔 404"** 상태가 된다.

| 작업 | 영향 받는 시스템 | 비고 |
|---|---|---|
| `node script/md-publish.mjs <draft.md>` | 로컬 `content/articles/<slug>.md` + `public/images/articles/<slug>/` | Phase 0 로컬 생성 (커밋 안 함) |
| `node script/md-publish.mjs <draft.md> --push` | 위 + **`git push origin main`** | Vercel 자동빌드 트리거 |
| `git push origin main` | **Vercel 자동빌드** → www.ours-magazine.jp 갱신 | App Router 정적 생성 |

**중요**: 로컬에 마크다운만 생성하고 git push를 안 하면 www.ours-magazine.jp에는 보이지 않는다. 기사 페이지는 Vercel 빌드 시점 데이터로 정적 생성되기 때문이다. 신규 글이든 수정 글이든 production 반영을 원하면 반드시 git commit + push (`origin main`).

**Sub agent 규칙**: 모든 sub-agent는 Pre-flight / 승인 대기 없이 즉시 실행한다.

---

## 입력

| 인자 | 의미 |
|---|---|
| `<draft.md>` | `drafts/<slug>.md` 경로 (신규 발행 / 기존 글 재생성) |
| `--push` | 발행 후 `git push origin main` → Vercel 자동빌드 (미지정 시 로컬 생성만) |
| `--skip-audit` | 발행 전 audit 생략 (긴급 시) |

---

## 사전 조건

JP는 S3/CloudFront 없음(jp-site-config §6) — 이미지는 `public/images/articles/<slug>/`로 복사된다.

---

## 실행 흐름

### Phase 0: 환경 검증
1. 입력이 draft 파일 경로인지 기존 글 slug인지 판정
2. `content/articles/` · `public/images/articles/` 디렉터리 쓰기 가능 확인
3. JP는 S3/CloudFront/AWS 불필요(jp-site-config §6)

### Phase 0.5: 구조 게이트 (CRITICAL — 발행 차단 조건)

발행 직전 GFM 구조 검사 (C2 완료 — JP GFM sanity로 재작성됨, jp-site-config §3):

```bash
node script/validate-post-html.mjs <slug-or-draft-path>   # 미닫힌 코드펜스 · 깨진 GFM 표 · 깨진 md 이미지/링크
node script/audit-post-html.mjs --post=<slug>             # 본문 truncate · 이미지 중복 · alt 길이 · 내부링크 allowlist
```

- 두 스크립트는 **C2에서 GFM 파싱으로 재작성**됨(KR Gutenberg `wp:block`/`<figure>` 검사 폐기, `jp-paths.mjs` 경로). draft 경로·slug 둘 다 입력 가능(`resolvePostPath`).
- `validate-post-html` 위반(exit≠0) 시 차단. `audit-post-html`의 LOW 결함(alt 길이 등)은 보고, HIGH는 차단.
- 추가로 `md-publish.mjs`가 발행 시 placeholder 잔존 0·이미지 ≥3·hero 분리를 exit 2로 강제(jp-site-config §5).
- 본문은 순수 GFM이라 Gutenberg 블록 짝·중첩 figure·S3 키 mismatch 결함군은 **구조적으로 부재**.

### Phase 0.5.1: placeholder 치환 (md-publish.mjs 내장)

`md-publish.mjs`는 placeholder `[[IMG:N]]`를 실제 마크다운 이미지(`![{alt}](/images/articles/<slug>/...)`)로 치환한다. JP 본문은 순수 GFM이므로 Gutenberg figure 래퍼 없음(jp-site-config §3).

본문 작성 시 권장 패턴: **placeholder는 단독 라인의 마크다운 이미지로 박을 것**:
```
![{alt}]([[IMG:0]])
```

### Phase 0.6: 시각 검증 게이트 (CRITICAL — 발행 차단 조건)

발행 직전 본문에 포함된 모든 이미지·인포그래픽이 시각 검증을 통과했는지 확인.

> **[C4 완료] (jp-site-config §6)**: `audit-infographic-visual.mjs`는 C4에서 `drafts/images/<slug>/` 경로·JP 誇大広告 사전으로 repath됨(빈 경로 false-pass 제거 → 경고+exit 2). `--post`는 숫자 ID 전용이라 **slug 글은 `--post` 없이 호출**(현재 run의 `drafts/images/` 인포그래픽 정적 감사).

**확인 절차** (멀티모달 AI + 정적 감사 + md-publish 게이트):

1. **이전 검증 로그 확인** — `tmp/image-verify-{slug}.md` (blog-write Phase 5 산출). 모든 일러스트·인포그래픽 "통과" 표시면 OK
2. **정적 시각 감사 재실행** (인포그래픽, C4 JP 포팅 완료):
   ```bash
   node script/audit-infographic-visual.mjs   # --post 없이: 현재 run drafts/images/<slug>/ 정적 감사
   ```
   `risk:high` 또는 `risk:medium` 잔존 시 차단
3. **dimension 가드**:
   ```bash
   file drafts/images/{slug}/infographic.webp
   ```
   width·height 둘 다 ≤ 2000 확인. 초과 시 §4.10.4 룰 따라 재렌더
4. **신규 글·로그 누락 시**: §4.9.1 인포그래픽 Reviewer sub-agent 즉시 호출 (6항목 검증, 최대 3회 재생성)

**차단 조건 (모두 통과해야 발행 가능)**:
- `_draft.images` 최소 **3장** (hero typography 1 + 본문 ≥ 2, §4.8.2 + §4.8.4) — `md-publish.mjs` exit 2로 자동 차단(이미지 게이트 **유지·C5 연결 완료**). 모든 모드 동일 적용
- **AC-감사-1 자동 검사**: `audit-blog-image-quality.mjs` 합산 100점 — **[C4 포팅 완료]**: content/articles·drafts/images로 repath됨. validate-blog-publish의 enforced 호출은 `C4_IMAGE_QUALITY_READY` opt-in(JP draft는 postId 없어 현재 auto-skip — 슬러그 트리거+실데이터 검증은 POC F 때)
- **AC-룰-4 본문 인포그래픽/차트 width ≥ 1200** — 미달 차단
- **AC-룰-5 본문 이미지 종류 분포** — 인포그래픽/차트/실사/스크린샷 중 ≥ 2 종
- **AC-레거시-명명-제거 산출물 0건** — alt·figcaption·src·S3 키 레거시 식별자(n8n) 매칭 0건
- 일러스트 시각 검증 5회 후에도 미통과 (§4.9)
- 인포그래픽 Reviewer 3회 후에도 미통과 (§4.9.1)
- 정적 시각 감사 `risk:high`/`risk:medium` 잔존 (§4.10.7)
- 인포그래픽 dimension > 2000px

**우회 불가**: `--skip-image-check` / `SKIP_IMAGE_GATE` 환경변수 모두 무시. About·정책 페이지 등 텍스트 위주 페이지도 hero typography 1장 + 본문 보조 1장은 필수.

**cron 자동 모드(`/blog create auto`) 동작**: 본 게이트 차단 시 발행 중단 + status JSON `{"status":"failed","phase":"image-verify","error":"..."}` 출력 + Slack 알림. 다음 trigger(익일 07:30)에 재시도.

### Phase 1: 사전 audit (skip-audit 미지정 시)
1. `blog/audit.md` 스킬을 본 컨텍스트 안에서 실행 (SKILL.md Read → 동일 절차)
2. blog-audit Phase 6.5가 frontmatter `_audit_score`·`_audit_cycles`·`_audit_at`를 갱신한다
3. 종합 점수가 (snshelp 100점 통과 정책):
   - **100**: 그대로 진행 ✅
   - **95-99**: 사용자에게 결함 + "1회 보강 후 발행" / "그대로 발행" / "보류" 선택 요청. cron 자동 모드(`/blog create auto`)는 무조건 보강 (100 도달까지 무제한)
   - **80-94**: 사용자에게 경고 + 보강 권장. cron 자동 모드는 무조건 보강
   - **< 80**: 발행 **거부**, 보강 필수

audit 리포트 경로를 사용자에게 안내.

### Phase 1.5: 100점 게이트 (HARD — 우회 금지)

`md-publish.mjs`가 frontmatter `_audit_score`를 검사해 다음 시 exit 2 차단(`_audit_score===100` 게이트 **유지 — C5 완료**: md-publish가 validate·cdn-gate를 subprocess로 실제 호출, jp-site-config §5):
- `_audit_score` 키 없음 (audit 미실행)
- `_audit_score < 100`

차단 시 동작:
- 일반 모드: 사용자에게 "현재 N/100. blog-audit 보강 후 재시도" 안내
- cron 자동 모드: blog-audit Top 5 개선안을 blog-write에 전달 → 재작성 → blog-audit 재실행 → 100 도달까지 무제한 반복. 매 사이클 frontmatter `_audit_cycles` +1

**`--skip-audit` 의미**: audit 실행만 건너뛰는 옵션이 아니라, frontmatter `_audit_score`가 이미 100인 경우 재실행 생략. 100 미달인데 `--skip-audit`로 우회 금지.

### Phase 2: 사용자 명시 승인 (필수)
발행은 **사용자의 명시 승인** 없이 진행 금지. CLAUDE.md 13장 (Deployment) 룰.

승인 요청 형식:
```
[발행 준비 완료]
대상: {제목} ({draft 파일})
대상 경로: content/articles/{slug}.md
이미지: {N}장 → public/images/articles/{slug}/ 복사 예정
audit 점수: {N}/100

발행하시려면 "발행" 또는 "publish" 라고 응답해주세요.
```

사용자가 "발행", "publish", "올려" 등 명시 표현 사용 시에만 Phase 3 진입.

### Phase 3-A: 신규 글 발행 (draft 파일)
```bash
# Phase 0 — 로컬 생성만 (커밋 안 함)
node script/md-publish.mjs <draft.md>

# Phase 1 — 위 + git push origin main → Vercel 자동빌드
node script/md-publish.mjs <draft.md> --push
```

스크립트가 자동 수행:
1. frontmatter `_draft.images` 매핑 읽기
2. 각 이미지를 `public/images/articles/<slug>/`로 복사
3. 본문 `[[IMG:N]]` placeholder를 실제 마크다운 이미지 경로(`/images/articles/<slug>/...`)로 치환
4. `content/articles/<slug>.md` 생성 (YAML frontmatter — title, description, date, category, image, tags)
5. `--push` 지정 시 `git add` + commit + `git push origin main`
6. 원본 draft 파일은 `.recycle/drafts/`로 이동 (룰: 삭제 금지)

### Phase 3-B: 기존 글 업데이트 (slug)
```bash
# 기존 draft를 수정 후 같은 slug로 재생성 (덮어쓰기)
node script/md-publish.mjs <draft.md>          # 로컬 재생성
node script/md-publish.mjs <draft.md> --push   # + git push origin main
```
같은 slug면 `content/articles/<slug>.md`를 덮어쓰며 이미지도 `public/images/articles/<slug>/`에 재복사된다(git diff로 변경 확인).

기존 글에서 새 이미지를 본문에 추가했다면:
- draft frontmatter `_draft.images`에 추가 후 위 명령으로 재생성하면 자동 복사·치환된다.

### Phase 4: 발행 후 검증
1. `content/articles/<slug>.md` 본문에 `[[IMG:N]]` placeholder 잔존 없음 확인 (전부 `/images/articles/<slug>/...`로 치환됐는지)
2. `public/images/articles/<slug>/` 의 이미지 파일 존재 확인 (frontmatter `image:` + 본문 참조 경로 전부)
3. `--push` 했다면 Vercel preview/prod URL에서 200 확인 (jp-site-config §6 검증 타깃)
4. 결과 보고

### Phase 5: 로컬 동기화
신규 발행 후:
- `content/articles/<slug>.md` 생성됨 (스크립트가 자동)
- git diff로 마크다운·이미지 변경 확인 후 commit (Phase 6)

### Phase 6: production 반영 (git push origin main → Vercel 자동빌드)

로컬 마크다운 생성만으로는 www.ours-magazine.jp에 글이 나타나지 않는다. 반드시 `git push origin main`으로 Vercel 빌드를 트리거(`--push` 미사용 시 수동 push).

```bash
# 신규 글 발행 후 (content/articles/<slug>.md 자동 생성됨)
git add content/articles/<slug>.md public/images/articles/<slug>/
git commit -m "Content: 신규 글 {slug} 발행 — {제목 요약}"
git push origin main

# 기존 글 업데이트 후
git add content/articles/<slug>.md public/images/articles/<slug>/
git commit -m "Content: 글 {slug} SEO 보강 — {핵심 변경}"
git push origin main
```

**push 후 Vercel 자동빌드 완료** → www.ours-magazine.jp에 반영. 빌드 실패는 Vercel 대시보드에서 확인.

긴급 트리거 (콘텐츠 변경이 없을 때):
```bash
git commit --allow-empty -m "Chore: Vercel 빌드 트리거 — {slug} 반영"
git push origin main
```

**사용자에게 안내 시 반드시 포함**: "로컬 마크다운 생성은 끝났습니다. production 반영까지 `git push origin main` 필요합니다. 진행할까요?"

---

## 보고

```
[마크다운 발행 완료]
slug: {slug}
제목: ...
경로: content/articles/{slug}.md
이미지: 3장 복사 (public/images/articles/{slug}/)
audit 점수: 100/100

⚠️ production 반영 대기:
www.ours-magazine.jp는 Next.js + Vercel 정적 생성이라 git push가 필요합니다.
다음 명령으로 빌드 트리거:
  git add content/articles/{slug}.md public/images/articles/{slug}/
  git commit -m "Content: 신규 글 {slug} 발행"
  git push origin main
→ Vercel 빌드 후 https://www.ours-magazine.jp/articles/{slug} 에서 확인 가능
```

---

## 금지

- 사용자 명시 승인 없이 발행
- **audit 점수 100 미만 글 발행** — `_audit_score < 100`이면 md-publish.mjs가 exit 2로 차단(게이트 유지). cron 자동 모드는 100 도달까지 무제한 보강
- **`_draft.images < 3`인 글 발행** — hero typography 1장 + 본문 보조 ≥ 2장은 모든 모드에서 필수(게이트 유지)
- 본문에 로컬 path(`local://`, `../drafts/`) 또는 미치환 `[[IMG:N]]`가 남은 상태로 발행 (placeholder 치환 실패 시 중단)
- 이미지 복사 실패 시 부분 발행 (전체 트랜잭션 실패로 처리)
- 한 번에 여러 글 일괄 발행 (사용자 의도 확인 어려움)
- **로컬 마크다운 생성만 하고 작업 종료 보고 금지** — production 반영을 위해 `git push origin main` 안내까지 의무
- **사용자 승인 없이 git commit/push 자동 실행 금지** — 안내까지만 하고 사용자 승인 후 진행 (단, cron/headless는 jp-site-config §8에 따라 자동 진행)
