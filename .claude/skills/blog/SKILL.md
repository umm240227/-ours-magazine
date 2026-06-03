---
name: blog
description: "snshelp 블로그 워크플로우 통합 진입점. 사용자 진입은 3개 — new(새 글 100점 작성) · fix <id>(특정 글 감사+100점 보강) · audit-all(전체 글 전수조사+보강+발행). topic·keywords·write·audit·publish는 내부 단계로 dispatch되고, create·create auto는 cron 자동 발행 전용 별칭이다. TRIGGER: 사용자 명시 호출 전용 (모델 자동 호출 금지)"
disable-model-invocation: true
user-invocable: true
argument-hint: "[new | fix <id> | audit-all] (내부·cron 별칭: create·create auto·topic·keywords·write·audit·publish·all)"
---

# /blog — 블로그 워크플로우 통합 진입점

## 역할

**0. `.ai-rules/jp-site-config.md`를 가장 먼저 Read** (상대경로 `../../../.ai-rules/jp-site-config.md`) — JP 플랫폼/로케일 정본. 본 문서와 충돌하는 발행 경로·DB·Naver·draft 경로·/referral·폰트·검증 타깃은 이 문서가 **무조건 우선**. 모든 모드는 진입 시 이 문서를 먼저 적용한다.

블로그 라이프사이클을 하나의 진입점에서 dispatch.

```
topic (주제 선정)
   ↓
keywords (키워드 확정)
   ↓
write (자료 조사 + 글 + 이미지)
   ↓
audit (SEO/AEO/GEO 감사)
   ↓ (점수 < 100 → write 보강 루프: 사용자 모드 5회 / cron auto 모드 무제한)
publish (md-publish.mjs → git push origin main → Vercel 빌드)
```

각 단계는 별도 sub-skill로 분리되어 있고, 이 스킬은 **사용자 진입점** 역할만 한다. 실제 절차는 sub-skill을 Read해서 실행한다.

**Sub agent 규칙**: Pre-flight / 승인 대기 없이 즉시 실행.

## ⚠️ Semrush MCP 비용 게이트 (CRITICAL)

이 진입점이 dispatch하는 sub-skill 대부분이 Semrush MCP를 호출한다. **모드 진입 직후 [.ai-rules/semrush-budget.md](../../../.ai-rules/semrush-budget.md) 정본 반드시 적용**.

**모드별 예상 비용**:
- `topic` (시드 없음, 갭 탐색): 1,000~3,000 units **사전 승인 권장**
- `topic <시드>` (시드 분석): 500~1,500 units
- `keywords <주제>`: 200~1,200 units (phrase_related 사용 시 폭발 주의)
- `write <키워드>` 1편: 500~1,500 units
- `audit <post-id>` 1편: ~200 units
- `audit --all` 또는 `audit --recent=50`: **수천~만 units 폭발 — 명시 승인 필수**
- `create`: topic + keywords + write + audit-loop = **2,000~5,000 units / 글 1편**
- `create auto` (cron 자동): 5,000+ units / 자동 발행 → 월 한도 추적 별도

임계값: < 500 자동 / 500~2,000 사전 보고 / ≥ 2,000 STOP+승인 / 누적 ≥ 5,000 중단.

**병렬 N편 작성 시 (예: 7편 한꺼번에)**: 7 × 평균 1,500 = 10,500 units 예상. **반드시 사전 비용 표 보고 + "진행해" 명시 승인** + 각 sub-agent 1,500 units 예산 한도 명시.

---

## 모드 선택

`$ARGUMENTS`의 첫 단어로 모드 결정. **사용자 진입은 아래 3개뿐**이다.

### 사용자 진입 (3개)

| 모드 | 호출 시점 | 내부 흐름 |
|---|---|---|
| `new [<시드>]` | **새 글 1편을 처음부터 100점까지** (주제→키워드→글+이미지→100점 보강→draft) | topic→keywords→write→audit-loop 5회→draft (§3) |
| `fix <post-id>` | **특정 기존 글 1편을 감사하고 100점까지 보강** | audit→write 보강 루프(5회)→재audit (§3-B) |
| `audit-all` | **전체 블로그 글 전수조사 + 보강 + 발행** (글 1편당 독립 sub-agent 8병렬) | per-post audit→보강→md-publish --push (§3-C) |

### 내부·cron 별칭 (사용자가 직접 호출하지 않음 — 호환 유지)

| 모드 | 용도 |
|---|---|
| `create [<시드>]` | `new`의 **레거시 사용자 별칭**(비권장, `new` 사용 권장). 동작은 `new`와 동일 (§3). cron·기존 참조 호환 유지 |
| `create auto` | **cron 자동 발행 전용** (주제 자동 선정 + write + 100점 무제한 보강 + status=publish + git commit + Slack). 정본 prompt: [`script/cron/daily-blog-prompt.md`](../../../script/cron/daily-blog-prompt.md). launchd 매일 07:30 통합 진입점 [`daily-all.sh`](../../../script/cron/daily-all.sh)(블로그+리뷰 단일 push). 흐름은 §3-A |
| `topic [<시드>]` | (내부) 주제 후보만 → `blog-topic` |
| `keywords <주제>` | (내부) 키워드 후보·검증만 → `blog-keywords` |
| `write <키워드>` | (내부) 글 초안+이미지만 → `blog-write` |
| `audit <post-id>` | (내부) 단일 글 점수만 (보강 없이) → `blog-audit` |
| `publish <draft\|post-id>` | (내부) md-publish.mjs 발행 + git push origin main 안내 → `blog-publish` |
| `all <주제>` | (레거시) 키워드→write→audit→publish drafts 1회 |
| 인자 없음 | 사용 안내 (진입 3개) 표시 |

**모드 선택 가이드**:
- 새 글을 처음부터 100점으로 → `new`
- 이미 있는 글 1편을 점검·보강 → `fix <id>`
- 전체 글을 한꺼번에 점검·보강·발행 → `audit-all`

---

## 실행 흐름

### 1. 모드 dispatch

```
$ARGUMENTS의 첫 단어 = 모드명
나머지 = sub-skill에 전달할 인자
```

### 2. sub-skill 실행

각 모드에 따라 해당 sub-skill의 SKILL.md를 Read하고 그 절차를 그대로 수행한다.

| 모드 | 읽을 파일 |
|---|---|
| `topic` | `$CLAUDE_PROJECT_DIR/.claude/skills/blog/topic.md` |
| `keywords` | `$CLAUDE_PROJECT_DIR/.claude/skills/blog/keywords.md` |
| `write` | `$CLAUDE_PROJECT_DIR/.claude/skills/blog/write.md` |
| `audit` | `$CLAUDE_PROJECT_DIR/.claude/skills/blog/audit.md` |
| `publish` | `$CLAUDE_PROJECT_DIR/.claude/skills/blog/publish.md` |

각 sub-skill의 절차를 그대로 따르고, 사용자 인자를 그대로 전달한다.

### 3. `new` 모드 — 100점 글 풀 워크플로 (핵심)

`/blog new [<시드>]` (별칭 `/blog create [<시드>]`) 호출 시 처음부터 끝까지 100점 글 1편 생성. 진행 중 핵심 분기점에서만 사용자 확인 받음.

```
Phase 1: 주제 선정 (blog-topic)
   ↓ 시드 있으면 시드 주변, 없으면 카테고리 갭 자동
   ↓ Top 10 주제 후보 + 점수 출력
   ↓ ⟲ Topic Reviewer (blog-topic Phase 8, 독립 sub-agent)
   ↓   - 시드 적합 / 검색량 (Semrush database=jp 단일, 네이버 fallback 제거 — jp-site-config §7) / SERP 의도 / 갭 정확성 / 거래 다리 / 페르소나 매칭
   ↓   - 채택 < 5개면 Phase 1-7 재실행 (최대 3회)
   ↓ 🔵 사용자 확인: "Reviewer ✅ Top 5 중 어떤 후보로 갈까요?"
   ↓
Phase 2: 키워드 확정 (blog-keywords)
   ↓ 선택된 후보의 메인 키워드를 시드로 keywords 실행
   ↓ 메인 + 보조 키워드 셋 산출 (SERP 의도 + 검색량 + 중복 검사)
   ↓ ⟲ Keyword Reviewer (blog-keywords Phase 8, 독립 sub-agent)
   ↓   - 검색량 ≥ 100 (Semrush database=jp 단일 — 네이버 제거, jp-site-config §7) / SERP 의도 / 중복(grep) / KD / intent / title 길이
   ↓   - 메인 채택 < 3개면 Phase 2-6 재실행 (최대 3회)
   ↓ 🔵 사용자 확인: "Reviewer ✅ 메인 키워드로 진행할까요?"
   ↓
Phase 3: 자료 조사 + 글 + 이미지 (blog-write)
   ↓ Phase 0 게이트: SERP 의도 + 검색량 + 중복 (seo-policy §1.5) — 통과해야 진행
   ↓ Phase 1-B (1차 출처·수치) + 페르소나 자동 선택 (blog-personas §2.5)
   ↓ 본문 + 인포그래픽 HTML 작성 + render-infographic 생성 + 일러스트 codex 생성
   ↓ ⟲ 일러스트 검증 루프 (asset-images §4.9, 5회) — codex 재생성
   ↓ ⟲ 인포그래픽 Reviewer (asset-images §4.9.1, 독립 sub-agent, 3회) — 본문-데이터 일치, 누락, alt
   ↓ Phase 7 다각도 검증 (SEO/AEO·GEO/한국어 3 Reviewer 병렬) + Phase 8 codex 세컨드 (조건부) + Phase 9 보강 (5회)
   ↓
Phase 4: 독립 audit (blog-audit, draft 대상)
   ↓ 점수 산출 (메인 키워드 정확 어구 + SERP 의도 + 검색량 + 중복 검사 모두 채점)
   ↓ Phase 5 codex 세컨드 오피니언 (80-94 자동 호출)
   ↓
Phase 5: 100점 보강 루프 (최대 5회)
   IF 점수 ≥ 100:
     → Phase 6으로
   ELSE:
     → blog-audit의 Top 5 개선안을 blog-write에 전달해 재작성
     → blog-audit 재실행
     → 시도 카운트 +1
     → 5회 미만이고 100 미달이면 반복
     → 5회에 도달하면:
       🔵 사용자 보고: "현재 점수 N/100, 남은 결함 [...], 그대로 발행할지 / 추가 손볼지 / 보류할지?"
   ↓
Phase 6: draft 확정
   → drafts/{slug}.md 최종 저장
   🔵 사용자 확인: "Vercel에 발행할까요? status는 draft / publish 어느 쪽?"
   ↓
Phase 7: 발행 (blog-publish)
   → 사용자 응답한 status로 md-publish.mjs 발행 (`node script/md-publish.mjs <draft.md>`)
   → 이미지 public/ 복사 + content/articles/{slug}.md 생성 (md-publish.mjs)
   ↓
Phase 8: ours-magazine.jp 반영 안내 (Vercel)
   → blog-publish가 자동 안내하는 git add + commit + push 명령을 사용자에게 보여주고
   🔵 사용자 확인: "git push origin main → Vercel 자동빌드 트리거할까요?"
```

### 3-A. `create auto` 모드 — cron 자동 발행 (사용자 확인 5개 모두 SKIP)

`/blog create auto` 호출 시 위 Phase 1-8 동일 흐름 + 모든 🔵 사용자 확인 자동 결정 + Phase 5 보강 한도 무제한 + Phase 7 status=publish 자동 + Phase 8 **git commit까지만** (push는 통합 cron `daily-all.sh`가 리뷰 단계 후 마지막에 1회 수행 — 이 흐름 안에서 `git push` 직접 호출 금지, [daily-blog-prompt.md](../../../script/cron/daily-blog-prompt.md) 정본). cron 호출 [`script/cron/daily-blog.sh`](../../../script/cron/daily-blog.sh) 전용.

**자동 결정 룰** (기존 흐름 그대로, 사용자 입력 자리만 자동값):

| 분기 | `create` (default) | `create auto` |
|---|---|---|
| Phase 1 Top 후보 선택 | 사용자 선택 | Reviewer 점수 Top 1 자동 |
| Phase 2 메인 키워드 확정 | 사용자 확인 | Reviewer 통과 메인 자동 |
| Phase 5 보강 루프 한도 | 5회 (한도 도달 시 사용자 보고) | **무제한** (100점 도달까지) |
| Phase 6 → 7 발행 status | 사용자 선택 (draft/publish) | `publish` 자동 |
| Phase 8 git | 사용자 확인 후 push | **commit까지만** (push는 `daily-all.sh`가 마지막에 1회 — 직접 push 금지) |

**시드 정책 (CRITICAL)**: `create auto` 호출 시 인자 없음. blog-topic Phase 1의 **"시드 없는 경우" 흐름 정본 그대로** 적용 — 시의성 시드(플랫폼 공식 발표·시즌·트렌딩 음원) 우선 발굴 → snshelp 적합도 4/4 필터 → 통과 ≥ 3개면 시의성 시드로 진행, 부족하면 카테고리 갭 fallback. Topic Reviewer Phase 8의 항목 3-A (시의성 적합도 재검증)에서 부적합 시의성(연예·정치·소송 뉴스) 한 번 더 필터링. Semrush(database=jp 단일 — 네이버 API 제거, jp-site-config §7) + 카니발 검사는 그대로.

**Phase 0 사전 차단 게이트 (CRITICAL — 외부 시스템 한도·장애 fallback)**:

cron 자동 발행은 외부 API(Semrush, codex)에 의존한다. 한도 도달·장애 시 무한 재시도로 비용 폭주를 유발하지 않도록 Phase 1 진입 전 다음 두 게이트를 통과해야 한다.

1. **Semrush 월 한도 게이트**:
   - 월 누적 Semrush units **≥ 45,000 (Pro 플랜 50,000의 90%)** 도달 시 cron 자동 발행 **즉시 SKIP**. 다음 달 1일까지 발행하지 않는다.
   - 누적 추적은 `tmp/semrush-usage-{YYYYMM}.json`에 호출별 units를 append. 매월 1일 00:00 KST에 새 파일 시작.
   - 한도 도달 시 결과 JSON: `{"status":"skipped","reason":"semrush-monthly-budget","cumulative_units":N,"limit":45000}` 출력 후 종료.
   - daily-blog.sh가 이 status를 받으면 Slack에 "Semrush 한도 도달 — 익월까지 자동 발행 SKIP" 알림.

2. **codex API cooldown 게이트** (24h):
   - codex API가 직전 24h 내 **429(rate limit) / 402(quota) / 503(service unavailable)** 응답을 한 번이라도 받았으면 cron 자동 발행 **SKIP**. 재호출하지 않는다.
   - cooldown 기록: `tmp/codex-cooldown.json` 형식 `{"last_failure_at": ISO timestamp, "status": HTTP code, "error": "..."}`. 실패 시 즉시 기록하고, 다음 호출 시 `last_failure_at + 24h < 현재시각` 이면 자동 만료(파일 삭제).
   - cooldown 중 결과 JSON: `{"status":"skipped","reason":"codex-cooldown","cooldown_until": ISO timestamp, "last_failure":{...}}` 출력 후 종료.
   - cooldown 만료 후 첫 호출이 다시 실패하면 cooldown 재시작 — 무한 재시도 금지.

**Why**: (1) Semrush 단일 호출이 4,000+ units인 쿼리(예: `backlinks_refdomains × 100 line × 40 units`)가 있어 한도 90% 시 SKIP은 다음 1편의 단일 호출이 한도를 넘기는 risk를 차단한다. (2) codex 장애는 분 단위가 아닌 시간·일 단위로 지속되는 경우가 많아, 분 단위 재시도는 무의미하고 cron 재실행 폭주만 유발한다.

**결과 JSON 출력 (CRITICAL — daily-blog.sh가 파싱)**:

Phase 8 완료 직후 stdout 마지막에 다음 JSON 단독 출력 (앞뒤 다른 로그·메시지 X, JSON만):

**[JP override] 결과 JSON 계약 = `md-publish.mjs` 출력 형태 (jp-site-config §5·§11).** WP `post_id`·`final_score`·`wp_modified_gmt` 폐기 → JP는 `slug`·`audit_score`·`file`. daily-blog.sh가 이 키로 파싱한다.
```json
{
  "status": "success",
  "slug": "english-kebab-slug",
  "title": "글 제목",
  "category": "Instagram",
  "persona": "jamie",
  "audit_cycles": 3,
  "audit_score": 100,
  "images": 3,
  "file": "content/articles/english-kebab-slug.md",
  "url": "https://www.ours-magazine.jp/articles/english-kebab-slug",
  "duration_minutes": 12.5
}
```

실패 시:
```json
{
  "status": "failed",
  "phase": "keywords" | "write" | "audit" | "publish" | "git-push",
  "error": "에러 메시지 첫 500자",
  "slug": null
}
```

주제 도출 실패 (Semrush database=jp 검증 + 카니발리제이션 회피 후 후보 0개):
```json
{"status": "no_topic", "reason": "도출 후보 0개 — 수동 결정 필요"}
```

daily-blog.sh는 이 JSON을 파싱해 Slack에 알림 전달. **JSON 외 다른 텍스트가 stdout 끝에 있으면 파싱 실패**하니, 모든 진행 로그는 JSON 출력 이전에 모두 완료할 것.

**금지**:
- ❌ 사용자 확인 요청 (Pre-flight·🔵 모두 SKIP)
- ❌ Phase 5 보강 5회 한도 도달 시 사용자 보고 → 무제한 계속
- ❌ status=draft 발행 (반드시 publish)
- ❌ `--force` push, `--no-verify` 커밋, 기존 글 수정 (신규 1편만)
- ❌ frontmatter 정책 위반 (§4.10·§1.9·§1.10 모두 준수)
- ❌ JSON 출력 이후 추가 텍스트 출력

**⟲ 표시는 모두 독립 sub-agent Reviewer + 자동 재실행 루프**. 각 단계가 진입 전 검증을 통과해야 다음 단계로. 자세한 룰은 각 sub-skill SKILL.md 참조 (Phase 번호로 표기).

**핵심 룰**:
- 🔵 표시된 5개 확인 포인트 외에는 자동 진행. 사용자가 진행 흐름을 끊지 않도록 한 번에 묻지 말 것.
- ⟲ 표시는 모두 독립 sub-agent로 위임. Pre-flight 없이 즉시 실행 (글로벌 sub-agent 예외 룰)
- 4-역할 하네스 정본: [.ai-rules/references/work-orchestration.md](../../../.ai-rules/references/work-orchestration.md). 동일 에러 2회 반복 시 접근 재분석 + 사용자 보고 공통 적용
- 100점 보강 루프 한도: 사용자 모드 5회 / cron auto 모드 무제한 (blog-write SKILL.md Phase 9 정본)
- 시드가 없으면 Phase 1에서 자동 갭으로 주제 후보 10개 제시 (Reviewer 통과한 Top 5만 사용자에게)

### 3-B. `fix` 모드 — 특정 글 1편 감사 + 100점 보강

`/blog fix <post-id>` 호출 시 기존 글 1편을 감사하고 100점까지 보강한다. `audit` 모드(점수만 보고)와 달리 **보강 루프까지 자동 실행**한다.

```
Phase 1: 대상 글 로드 (content/articles/{slug}.md)
   ↓
Phase 2: blog-audit 감사 (글 1편)
   ↓ 본문 7영역 채점 (메인 직접) + 이미지 multimodal 검증 (이미지 1개당 sub-agent sonnet, 8병렬 cycle — survey-methodology.md "인포그래픽·본문 figure 시각 검증" 정본)
   ↓ 종합 점수 산출 + frontmatter _audit_score 기록 (blog-audit Phase 6.5)
   ↓
Phase 3: 100점 보강 루프 (최대 5회)
   IF 점수 ≥ 100 → Phase 4
   ELSE → blog-audit Top 5 개선안을 blog-write에 전달해 재작성 → 재audit → +1
        → 5회 도달 시 🔵 사용자 보고 (점수·남은 결함·다음 액션)
   ↓
Phase 4: 발행 결정
   🔵 사용자 확인: "100점 도달. Vercel 반영(git push origin main)할까요?"
   → 승인 시 blog-publish (`node script/md-publish.mjs <draft.md> --push`, jp-site-config §5)
```

- 글 1편이므로 **per-post sub-agent는 1개**. 이미지 검증만 이미지당 sub-agent 8병렬.
- 보강 한도: 사용자 모드 5회 (blog-write Phase 9 정본). 5회 초과 시 사용자 결정 위임.
- `fix`는 단일 글이라 발행(md-publish --push) 전 사용자 확인을 받는다 (전수조사 `audit-all`과 다름).

### 3-C. `audit-all` 모드 — 전체 글 전수조사 + 보강 + 발행 (CRITICAL)

`/blog audit-all` 호출 시 `content/articles/*.md` **전체**를 글 1편당 독립 sub-agent로 전수조사하고, 100점 미달 글을 보강한 뒤 발행한다.

- `/blog audit-all` (기본): 감사 → 보강 → **발행까지 자동**. 명시적으로 `--report-only`가 없으면 항상 발행 포함
- `/blog audit-all --report-only`: **감사만** (Phase 0-1 + 리포트). 보강·발행 안 함. 현황 파악용 안전 모드

**전수조사 정본**: [.ai-rules/survey-methodology.md](../../../.ai-rules/survey-methodology.md) "블로그 본문/figure/SEO 전수조사 (글 1편당 sub-agent 1개)" 섹션을 **반드시 그대로 따른다**. 샘플링·batch 위임 금지.

**한 세션 완주 (CRITICAL — 분할·중단 금지)**: 전체 글을 **한 세션에서 끝까지** 처리한다. 글 수가 많아 메인 컨텍스트에 다 못 담는 문제는 **Workflow 오케스트레이션으로 해결**한다 — 글 1편 = 독립 sub-agent이므로 각 글의 채점·보강은 sub-agent의 독립 컨텍스트에서 일어나고 메인에는 결과 요약(점수·결함 수·gap)만 돌아온다. pipeline(글 리스트, 감사 stage, 보강 stage)로 8개 동시 cap 안에서 전수를 흘려보내면 글 수와 무관하게 한 세션에서 완주한다. "토큰 한계로 분할" 같은 중단 사유를 만들지 않는다.

**Semrush 무조건 OFF (CRITICAL)**: 전수조사는 **Semrush를 절대 호출하지 않는다**. 채점은 100% 본문 기반(seo-policy §9). 검색량·SERP·KD 항목은 "외부 데이터 없음 — 본문 기반 채점"으로 처리하고 그것을 이유로 감점하지 않는다 (blog-audit "외부 데이터 부재를 감점 사유로 쓰지 않음" 정합). 비용 0.

```
Phase 0: 대상 글 리스트 확정 (Semrush OFF 고정)
   ↓ content/articles/*.md 전체 Bash 집계 (head_limit 잘림 금지)
   ↓ Semrush 호출 없음 — 본문 기반 채점만. 비용 0
   ↓
Phase 1: per-post 전수 감사 (글 1편당 sub-agent 1개, 8개씩 cycle)
   ↓ 각 글 sub-agent:
   ↓   (a) AI가 본문·이미지를 직접 Read/multimodal로 판단 (1차 — 항상 우선)
   ↓   (b) audit-*.mjs 스크립트도 실행 → AI 판단과 비교
   ↓   (c) 스크립트가 놓치거나 틀린 항목은 tmp/script-gap/{pid}.json에 수정안 기록
   ↓       (self-improving 루프 — §3-D, .ai-rules/audit-script-loop.md 정본)
   ↓   (d) 산출: tmp/per-post-audit/{pid}.json {pid, slug, score, defects, script_gaps}
   ↓
Phase 2: gap 취합 → audit-*.mjs 수정안 종합
   ↓ 모든 sub-agent 종료 후 메인이 tmp/script-gap/*.json 취합
   ↓ → audit-*.mjs 개선안 1건으로 정리 + 적용 (§3-D 수렴 정책)
   ↓
Phase 3: 미달 글 보강 (결함 글 1편당 sub-agent 1개, 8병렬)
   ↓ blog-write 보강 → 재audit → 100점 도달까지 (cron auto 무제한 / 수동 호출은 글당 5회)
   ↓ 여기까지는 로컬 content/articles/*.md 변경만 (prod 미반영)
   ↓
Phase 4: 발행 (prod) — 기본 자동, 글 1편당 sub-agent
   ↓ **발행 파이프라인 정본 = jp-site-config §5 (`node script/md-publish.mjs <draft.md> --push` → git push origin main → Vercel 자동빌드) 반드시 따른다**
   ↓ 글마다: ① 신규 이미지 **[C4 인포그래픽 미이전]** upload-infographic.mjs(S3 업로드)는 JP 경로에서 호출 금지 — public/images/articles/{slug}/로 배치(md-publish가 [[IMG:N]] → 실제 경로 치환)
   ↓        ② 본문 이미지 placeholder([[IMG:N]])를 md-publish가 **실제 public/ 경로로** 치환 (추측 URL 금지 — 깨진 이미지 사고 원인)
   ↓        ③ 본문 모든 이미지 경로 200 확인 → ④ md-publish --push (200 확인 후에만)
   ↓        ⑤ 발행 후 공개 페이지(ours-magazine.jp)로 이미지 200 검증
   ↓        ⑥ **`node script/audit-cdn-gate.mjs --source=local` 통과 = 완료 조건 (CRITICAL, jp-site-config §5)**
   ↓           CDN 실물 dim·md5·중복출현 객관 측정. fail이면 미완료 — 세로형 재렌더 + 재발행 후 재검증
   ↓           (HTML만 고치고 webp 재발행 누락 = CDN 옛 이미지 잔존을 이 게이트가 잡는다. audit-script-loop §6.4)
   ↓ **prod 쓰기라 5글 파일럿 먼저 → 무결 확인 후 전체 확대** (한 번에 전량 발행 금지)
   ↓ 메인이 sub-agent 자가보고 불신 — 공개 페이지 + audit-cdn-gate로 직접 전수 재검증 (자가보고 텍스트 아닌 게이트 출력으로 판정 — §6.3)
```

**자동 수정 범위**: `audit-all`(기본)은 **감사 → 보강(로컬 .md) → prod 발행까지 한 세션에서 자동 완주**. 발행을 원치 않으면 `--report-only`를 명시. 즉 **"명시적 감사-only가 없으면 발행까지가 기본"**.

**발행 핵심 (이번 작업 실사고 반영)**:
- ❌ AI가 이미지 경로를 임의(`blog/{slug}/x.webp`)로 추측해 본문에 박기 → 본문은 placeholder([[IMG:N]])만, md-publish가 public/images/articles/{slug}/ 실제 경로로 치환
- ❌ md-publish가 이미지도 자동 배치한다고 가정 → 이미지는 public/images/articles/{slug}/에 선행 배치 필수 (**[C4 인포그래픽 미이전]** — S3 upload-infographic.mjs는 JP 경로 호출 금지)
- ❌ 인증 API content 응답(간헐 HTTP 000)으로 검증 → 공개 페이지로 검증
- ❌ 동시 curl 부하의 000을 깨짐으로 판정 → 단건 재확인
- ❌ sub-agent "발행 성공" 자가보고만으로 완료 결론 → 메인 직접 전수 재검증
- ❌ 마크다운만 고치고 이미지 재배치 누락 → 옛 이미지 잔존. 발행 후 `audit-cdn-gate.mjs --source=local` 필수 (§6.4)
- ❌ 로컬 draft 렌더로 "고침/정상" 판정 → prod(Vercel) 실물로 검증 (audit-script-loop §6.1)
- ❌ 증거(CDN URL·실측 dim·md5·HTTP 200) 없는 "정상/완료" 보고 (§6.2)

**금지** (survey-methodology.md 정본):
- ❌ batch sub-agent에 N편 묶어서 위임 (결함 누락)
- ❌ "sample N편만 검증" 식 부분 검사
- ❌ audit-*.mjs 점수 100점만으로 통과 결론 (스크립트 사각지대 — §3-D)

### 3-D. AI 직접 판단 ↔ audit-*.mjs self-improving 루프 (CRITICAL)

audit-*.mjs 스크립트는 사각지대가 있다 (HTML 인포그래픽만 검사, matplotlib·codex·스크린샷·webp 미검사 — [audit.md](./audit.md) 자산 검사 표 참조). 따라서 **AI 직접 판단이 1차 진실**이고 스크립트는 보조다. 정본 절차는 [.ai-rules/audit-script-loop.md](../../../.ai-rules/audit-script-loop.md)를 Read해서 따른다.

요약:
1. **AI 직접 판단 우선**: 각 글/이미지를 AI가 직접 Read/multimodal로 채점 (항상 수행)
2. **스크립트 병행 실행 + 비교**: 같은 대상에 audit-*.mjs 실행 → AI 판단과 diff
3. **gap 기록**: 스크립트가 놓침(false negative)·오탐(false positive)·미지원 자산을 `tmp/script-gap/{pid}.json`에 "어떤 검사가 어떻게 틀렸는지 + 스크립트 수정안" 형식으로 기록
4. **취합 → 스크립트 개선**: 전수조사 종료 후 gap을 종합해 audit-*.mjs 수정안 1건으로 적용
5. **수렴 판정**: 한 라운드에서 특정 검사 항목의 gap이 0건이면 그 항목은 "스크립트만으로 충분" 플래그 → 다음 회차부터 그 항목은 AI 직접 판단 생략하고 스크립트만 실행. gap이 다시 발생하면 AI 직접 판단 복귀.

→ 목표: gap이 모두 0으로 수렴하면 AI 직접 판단을 최소화하고 스크립트 위주로 빠르게 검사.

### 4. `all` 모드 (레거시)

기존 `/blog all <주제>` 호출도 유지 (broken 방지). `create` 모드로 마이그레이션 권장하나 강제하지 않음.

```
1단계: blog-keywords (주제로부터 키워드 추천)
   🔵 사용자 확인
2단계: blog-write
3단계: blog-audit (보강 2회까지)
4단계: blog-publish (status=draft 기본)
```

각 단계 사이에 사용자 검토 포인트 존재. all 모드라도 publish 전에는 반드시 사용자 명시 승인.

### 4. 사용 안내 (인자 없을 때)

```
## /blog — 블로그 워크플로우

### 진입 모드 (3개)
- /blog new [<시드>]      ⭐ 새 글 1편 100점 풀 워크플로 (주제→키워드→글+이미지→audit×5→draft)
- /blog fix <post-id>     특정 글 1편 감사 + 100점 보강
- /blog audit-all         전체 글 전수조사 + 보강 + 발행 (글 1편당 독립 sub-agent 8병렬)

### 산출물
- new: drafts/{slug}.md + drafts/images/{slug}/
- fix: tmp/audit-{post-id}.md + 보강된 content/articles/{slug}.md
- audit-all: tmp/per-post-audit/{pid}.json + tmp/audit-summary-{ts}.md + tmp/script-gap/*.json

### 정책
- 모든 sub-skill은 .ai-rules/seo-policy.md 정본을 Phase 0에서 Read (§9 블로그 글 전용 룰 포함)
- snshelp는 셀프 마케팅 플랫폼이라 거래/상업 의도 키워드가 1순위 (§9.0)
- 목표 점수 = 100, 사용자 모드 최대 보강 5회 (cron auto 모드는 무제한)
- 전수조사·이미지 검증은 글/이미지 1개당 독립 sub-agent (survey-methodology.md 정본) — 샘플링 금지
- AI 직접 판단이 audit-*.mjs보다 우선. 스크립트 사각지대는 self-improving 루프로 개선 (§3-D)
- 사이트 반영은 git push origin main → Vercel 자동빌드 트리거 필요

### 내부·cron 별칭 (직접 호출 비권장)
- /blog create [<시드>] = new 별칭 · /blog create auto = cron 자동 발행 전용
- /blog topic|keywords|write|audit|publish = new/fix/audit-all 내부 단계
- /blog all <주제> = 레거시
```

---

## 인자 파싱 규칙

```
모드 결정 (CRITICAL — create auto는 두 토큰 우선 매칭):

1) 첫 토큰이 `create`이고 둘째 토큰이 정확히 `auto`이면 → **`create auto` 모드** (§3-A cron 전용). 이때 시드 없음.
2) 첫 토큰이 `create`이고 둘째 토큰이 `auto`가 아니면 → `create` 모드 (= new), 둘째 토큰부터는 시드.
3) 그 외에는 첫 토큰으로 모드 결정.

사용자 진입 (3개):
  new        → §3 풀 워크플로 (create와 동일 동작)
  fix        → §3-B 단일 글 감사+보강 (둘째 토큰 = post-id, 필수)
  audit-all  → §3-C 전체 전수조사+보강+발행

내부·cron 별칭:
  create [<시드>]  → new와 동일 (§3). 레거시 사용자 별칭(비권장)·기존 참조 호환용
  create auto      → §3-A cron 자동 발행 전용 (위 1번 규칙으로만 진입)
  topic, keywords, write, audit, publish, all → 해당 sub-skill로 dispatch

나머지 토큰은 sub-skill의 $ARGUMENTS로 그대로 전달.

예:
  /blog new
  → 시드 없이 풀 워크플로 (자동 갭 → 100점 도달까지)

  /blog new "유튜브 광고 수익"
  → 시드로 풀 워크플로

  /blog fix 1234
  → post-id 1234 글을 감사하고 100점까지 보강 (§3-B)

  /blog audit-all
  → content/articles/*.md 전체 전수조사 + 보강 + 발행 (§3-C)

  /blog create auto
  → cron 자동 발행 (§3-A) — daily-blog.sh 전용
```

`fix`는 둘째 토큰(post-id)이 없으면 사용 안내 출력. 첫 토큰이 모드명 외의 값이거나 빈 경우 사용 안내 출력.

---

## 절대 금지

- sub-skill을 거치지 않고 이 SKILL 안에서 블로그 작성/감사/발행 절차를 직접 실행 (sub-skill의 정본 절차가 누락됨)
- 단일 `publish` 모드에서 사용자 명시 승인 없이 status=publish로 진행 (단, `audit-all`은 예외 — `--report-only`가 없으면 발행까지 자동이 기본. 발행 직전 목록 announce만 하고 진행)
- new/create/all 모드에서 5개 확인 포인트(주제 선택, 키워드 확정, draft 확정, 발행 결정, git push) 생략
- audit 점수 100 미만 글을 사용자 경고 없이 publish (snshelp 100점 통과 정책)
- 사용자 모드 `new`/`fix`의 보강 루프 5회 초과 금지 (무한 루프 방지). 5회 후엔 사용자에게 결정 위임. cron auto 모드는 §3-A 정본에 따라 무제한 — 본 항목 미적용
- `audit-all` 전수조사를 샘플링·batch sub-agent로 수행 (survey-methodology.md 정본 위반 — 글 1편당 독립 sub-agent 필수)
- audit-*.mjs 점수만으로 통과 결론 (AI 직접 판단이 1차 — §3-D)
- publish 후 git push 안내 누락 (ours-magazine.jp / Vercel 반영 누락의 원인)