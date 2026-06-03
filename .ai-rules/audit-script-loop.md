---
name: audit-script-loop
description: "블로그 감사에서 AI 직접 판단 ↔ audit-*.mjs 스크립트 self-improving 루프 정본. AI 판단이 1차 진실, 스크립트는 보조. AI가 발견한 스크립트 사각지대를 누적해 스크립트를 개선하고, gap이 0으로 수렴한 검사 항목은 스크립트만으로 전환. /blog audit-all·fix, audit 단계(blog/audit.md), survey 전수조사에서 audit-*.mjs를 실행하는 모든 작업 시 이 문서를 따른다."
---

# audit-*.mjs self-improving 루프 (정본)

## 0. 현행 스크립트 신뢰도 — 미완성 (CRITICAL)

**현재 `script/audit-*.mjs`·`render-infographic.mjs` 등 블로그 관련 스크립트는 미완성·부정확하다. 신뢰하지 않는다.**

- **블로그 스크립트를 "검증 통과" 근거로 자동 실행해 결론 내리지 마라.** 감사·보강·이미지 작업은 **AI가 직접(수동) 판단하는 것이 1차**다.
- 스크립트는 **AI가 수동 작업한 결과를 스크립트가 따라잡도록 보강하는 용도**로만 쓴다. 즉 AI가 먼저 정답을 만들고, 그 정답을 스크립트가 재현하게 개선하는 방향(§2-4). 스크립트가 AI를 대체하는 게 아니다.
- 스크립트가 모든 항목에서 AI와 0 gap으로 **완벽히 수렴하기 전까지는, 스크립트 단독 판정을 신뢰하지 않는다.**
- 특히 **시각·레이아웃·폰트·여백·줄바꿈** 판정은 정적 분석으로 불가 — 반드시 AI multimodal Read.

---

블로그 글 감사에서 **AI 직접 판단이 1차 진실**이고 `script/audit-*.mjs` 스크립트는 보조 도구다. AI 판단으로 스크립트의 사각지대를 메우고, 그 사각지대를 누적해 스크립트를 개선한 뒤, 검사 항목별로 gap이 0으로 수렴하면 그 항목은 스크립트만으로 전환한다.

진입점: [blog/SKILL.md §3-C·§3-D](../.claude/skills/blog/SKILL.md), [blog/audit.md](../.claude/skills/blog/audit.md) Phase 2, [survey-methodology.md](survey-methodology.md) 블로그 전수조사 섹션.

---

## 1. 왜 AI 직접 판단이 1차인가

현행 `script/audit-*.mjs`의 검사 범위와 사각지대:

| 스크립트 | 검사 범위 | 사각지대 (AI 직접 판단 필수) |
|---|---|---|
| `audit-infographic-visual.mjs` | HTML 인포그래픽 CSS 정적 분석 (wrap·대비·금지색·폰트·footer 로고 등) | 렌더 결과 webp 실제 픽셀, matplotlib 차트, codex 일러스트, 스크린샷 |
| `validate-post-html.mjs` | wp:block / HTML 태그 짝 + 알려진 깨짐 패턴 | 블록 출현 순서, 의미적 정합, 미등록 깨짐 패턴 |
| `audit-post-html.mjs` | alt·figcaption·S3 경로·레거시 식별자 | figcaption ↔ 이미지 **내용** 일치(시각), 이미지 안 텍스트 정확성 |
| `measure-answer-capsule.mjs` | H2 직후 첫 단락 글자 수 (50-80 STRICT) | 요약의 의미 품질, 직답 적합성 |

→ 스크립트는 **구조·길이·정규식 매칭**만 본다. 이미지 시각 내용·의미·다종 자산은 못 본다. 그래서 스크립트 통과 = 검증 완료가 **아니다**. AI가 본문·이미지를 직접 Read/multimodal로 판단하는 것이 진실이고, 스크립트는 빠른 1차 필터·회귀 방지용이다.

---

## 2. 루프 절차 (글 1편 = sub-agent 1개 기준)

각 per-post sub-agent(또는 단일 글 `fix`)는 다음을 수행한다.

1. **AI 직접 판단 (항상 우선)**
   - 본문: seo-policy §9 7영역 기준으로 직접 채점 (라인 인용, 추측 금지)
   - 이미지: 모든 `<img>`/`<figure>`를 multimodal Read로 직접 확인 (이미지 1개당 sub-agent sonnet — survey-methodology "인포그래픽·본문 figure 시각 검증" 정본). 단 **§4 수렴 플래그(`script_only: true`)가 켜진 검사 항목은 sentinel 표본(§4)을 제외하고 생략 가능**.

2. **스크립트 병행 실행 + 비교**
   - 같은 글에 대해 audit-*.mjs 실행 (`--post=<id> --json`)
   - AI 판단 결과와 스크립트 결과를 **항목별로 diff**

3. **gap 기록** → `tmp/script-gap/{pid}.json`
   - 스크립트가 **놓친 결함**(false negative): AI는 잡았는데 스크립트는 통과
   - 스크립트의 **오탐**(false positive): 스크립트는 결함이라는데 AI 판단은 정상
   - **미지원 자산**: 스크립트가 아예 검사 못 하는 자산 종류 (matplotlib·codex·스크린샷·webp 등)
   - 각 gap에 **스크립트 수정안**을 함께 기록 (어떤 함수·라인에 어떤 검사를 추가/수정하면 잡히는지)

4. **취합 → 스크립트 개선** (전수조사 종료 후, 메인)
   - `tmp/script-gap/*.json` 전체를 패턴별로 종합
   - 같은 유형 gap이 **2건 이상**이면 audit-*.mjs 수정안 1건으로 정리해 적용 (검토 후). 단 **severity=high gap은 1건이라도 즉시 수정 후보** (놓치면 운영 글 결함 직결)
   - 스크립트 수정 후 `npx astro check` 영향 없음 확인 (별도 .mjs라 무관하나 import 시 확인)

5. **수렴 판정** (§4)

---

## 3. gap JSON 스키마

`tmp/script-gap/{pid}.json`:

```json
{
  "pid": 1234,
  "slug": "english-kebab-slug",
  "gaps": [
    {
      "check": "figcaption_image_mismatch",
      "kind": "false_negative | false_positive | unsupported_asset",
      "script": "audit-post-html.mjs",
      "ai_verdict": "figcaption '출처: 2026 통계'인데 이미지는 codex 일러스트 — mismatch",
      "script_verdict": "통과 (텍스트 패턴만 봄)",
      "fix_proposal": "audit-post-html.mjs: figcaption에 '출처/통계/연도' 패턴 + 이미지 type=codex 조합 시 medium 플래그 추가. 단 이미지 내용 일치는 스크립트로 불가 → multimodal 유지 항목으로 분류"
    }
  ],
  "convergence_candidates": ["missing_tags", "tldr_bullet_length"]
}
```

- `convergence_candidates`: 이 글에서 스크립트와 AI 판단이 100% 일치한 검사 항목 (수렴 후보)

---

## 4. 수렴 플래그 — 스크립트만으로 전환

검사 항목별로 "스크립트만으로 충분한지"를 추적한다. 정본 상태 파일: `script/audit-state/convergence.json` (**영속 — gitignore 하지 않는다**. 수렴은 1회성이 아니라 누적 학습 상태라 `tmp/`에 두면 안 된다. per-post gap 파일 `tmp/script-gap/*.json`만 1회성으로 `tmp/`에 둔다).

```json
{
  "missing_tags":         { "script_only": true,  "gap_free_rounds": 3 },
  "tldr_bullet_length":   { "script_only": true,  "gap_free_rounds": 2 },
  "figcaption_image_mismatch": { "script_only": false, "gap_free_rounds": 0 },
  "matplotlib_codex_visual":   { "script_only": false, "gap_free_rounds": 0 }
}
```

> 키는 항상 `snake_case`이며 `convergence.json`의 실제 검사 항목과 **1:1 일치**해야 한다. 예시를 본떠 `kebab-case` 신규 키(`figcaption-image-mismatch` 등)를 만들면 실제 `figcaption_image_mismatch`와 별개 키로 갈려 `gap_free_rounds` 누적이 조용히 깨진다. 위 값(`gap_free_rounds`)은 형태 예시일 뿐 실제 상태가 아니다.

**전환 규칙**:
- 한 전수조사 라운드에서 어떤 검사 항목의 gap이 **0건**이면 `gap_free_rounds` +1
- `gap_free_rounds ≥ 2`이면 `script_only: true` → 다음 회차부터 그 항목은 **AI 직접 판단을 표본만 수행**, 나머지는 스크립트만 실행

**sentinel 재검증 (CRITICAL — gap 감지 관측자 유지)**:
- `script_only: true`로 전환해도 **AI 직접 판단을 완전히 끄지 않는다**. 매 라운드 대상 글의 **표본 5~10% (최소 3편)** 에 대해 그 항목을 AI가 재검증한다 (sentinel).
- sentinel에서 gap이 발견되면 즉시 `script_only: false` + `gap_free_rounds: 0`으로 되돌리고 전수 AI 직접 판단 복귀 (회귀 방지).
- **이유**: AI 판단을 완전히 생략하면 스크립트가 새로 놓치기 시작한 결함(룰 변경·새 자산 유형·엣지 케이스)을 감지할 관측자가 사라진다. sentinel은 최소 비용으로 회귀를 감시한다.
- sentinel 표본은 매 라운드 다른 글로 (인덱스 기반 rotation — 시간·난수 의존 금지).

**영구 multimodal 유지 항목** (스크립트로 원리적 불가 — `script_only` 전환 금지):
- 이미지 시각 내용 일치 (figcaption ↔ 이미지 실제 그림)
- matplotlib 차트·codex 일러스트·스크린샷의 시각 정확성·가독성
- 본문 의미·논리·E-E-A-T 1차 경험 신호

→ 목표: 구조·길이·정규식성 항목은 스크립트로 수렴시켜 전수조사 속도를 높이고, 시각·의미 항목만 AI가 집중한다.

---

## 5. 보강 시 주의 (이번 작업 실사고 반영)

- **이미지 결함을 "재생성 필요"로 미루지 마라.** 인포그래픽 텍스트 잘림·줄바꿈(orphan)·하단 여백, 차트 폭<1200 등은 sub-agent가 **HTML을 직접 고치고 재렌더**하면 글 안에서 해결된다. "needs_image=true로 기록만" 하고 넘기면 100점이 영영 안 된다. 진짜 불가능한 것(실제 앱 스크린샷 촬영 등)만 미룬다.
- **폰트는 글마다 개별 조정 — 고정 floor 강제 금지** (infographic-html.md §4.3.2 정본). 우선순위: ① 내용 유지 ② 세로 높이 가변(고정 height·`main h-[Npx]` 금지 → 콘텐츠 fit) ③ 폰트를 가독 범위에서 그 글에 맞게 조정. "44px 무조건" 식으로 폰트를 강제해 텍스트가 컨테이너를 넘쳐 줄바꿈·잘림 나는 것이 이번 사고의 근본 원인. 긴 텍스트는 폰트를 낮추거나 폭을 넓혀 해소하고, 정보 과밀이면 폰트보다 정보량을 먼저 줄인다.
- **차트도 HTML 템플릿이 정본 — matplotlib(.py) 금지.** 막대·선·파이·비교 차트는 `script/infographic-templates/`의 `mini-chart-bar`·`mini-chart-trend`·`pie-chart-mini`·`flowchart-mini` 등 HTML 템플릿으로 만들고 render-infographic.mjs로 webp 캡처한다 (asset-images §4.10.1 정본). **matplotlib는 deprecate** — "누가 봐도 Python 차트"라 디자인 수준 미달. `chart-template.py`로 차트 생성 금지. 보강·이미지 추가에서 차트가 필요하면 반드시 HTML 템플릿 사용.
- **워크플로 sub-agent가 schema(StructuredOutput) 미호출로 "실패" 보고돼도 본문 수정은 됐을 수 있다.** 보고 실패 ≠ 작업 실패. **반드시 산출 파일(`tmp/per-post-audit/*.json` 점수, 실제 본문 diff)로 실제 상태를 재집계**해 판단한다. 보고만 보고 "N건 실패했으니 다시"를 전량 재실행하면 낭비다.
- **wp-content/posts/*.md는 gitignore다.** 보강 결과는 git status에 안 보인다 — 발행(wp-push)으로만 prod 반영된다. "git에 변화 없음 = 작업 안 됨"으로 오판 금지.

## 6. 검증 증거 강제 + prod 실물 고정 (CRITICAL)

AI 직접 판단이 1차(§0)라도, sub-agent가 **실제로 검증하지 않고 "정상/완료"로 보고**하면 1차 판단 자체가 거짓이 된다. 이를 원천 차단하기 위해 모든 감사·보강·재발행 작업은 아래를 강제한다.

### 6.1 검증 대상 = prod 실물 고정

- 이미지·본문의 "고침/정상/완료" 판정은 **항상 prod 실물**을 대상으로 한다:
  - 공개 페이지 HTML: `https://www.helpsns.com/blog/{slug}/`
  - 그 페이지가 참조하는 CDN webp (`assets.helpsns.com/...`)
- **로컬 draft(`wp-content/drafts/images/*.html`·로컬 렌더 webp)만 보고 판정 금지.** 로컬은 수정 중 보조 확인용일 뿐이다. HTML만 고치고 CDN 재발행(upload-infographic/wp-media-replace)을 누락하면 prod는 옛 이미지 그대로다 — 로컬 렌더가 멀쩡해도 prod는 깨져 있다.
- 발행 전 단계(신규 draft가 아직 CDN에 없을 때)는 로컬 webp 측정으로 1차 게이트하되, **발행 후 반드시 CDN 실물로 재검증**한다.

### 6.2 증거 첨부 강제 (no-evidence = 미완료)

sub-agent의 모든 "통과/정상/완료" 판정에는 **재현 가능한 증거**를 산출물(`tmp/per-post-audit/*.json`·`tmp/per-image-audit/*.json`)에 첨부한다. 증거 없는 판정은 메인이 **미완료로 간주하고 자동 재실행**한다.

| 판정 | 필수 증거 |
|---|---|
| 이미지 dim 정상 | CDN webp 실측 px (`fetch → sharp metadata`), 가로/세로 비율 |
| 본문 잘림 없음 | 공개 HTML에서 `…`/truncate 검출 결과 (0건 근거) |
| 중복 없음 | 이미지 md5 해시값 + 출현 위치 (글 내·글 간) |
| 발행 완료 | curl HTTP 200 + 실제 CDN URL |

### 6.3 메인은 산출물로 재집계

메인은 sub-agent **자가보고 텍스트가 아니라 산출물 파일 + 게이트 스크립트 출력으로** 완료를 판정한다 (§5 "보고 실패 ≠ 작업 실패"의 역방향 — "보고 성공 ≠ 작업 완료").

### 6.4 자동 게이트 — `audit-cdn-gate.mjs`

`node script/audit-cdn-gate.mjs --post=<id>`가 prod 실물의 **객관 측정 항목**을 강제한다:
- 인포그래픽/차트 webp **dim 비율** (가로형 깨짐 = ratio > 1.6 등 hard fail 기준)
- **md5 중복** (같은 글 본문에 동일 이미지 2회+, 또는 글 간 동일 인포)
- 본문 **`…`/truncate 잘림**
- **인포그래픽 본문 중복 출현** (같은 인포가 본문에 2회+)

게이트 fail인 글은 **미완료** — 발행/완료 선언 금지. 신규 글은 `wp-publish-new.mjs`가 발행 전 로컬 게이트로 차단하고, 재발행/`fix`/`audit-all`은 **발행 후 `audit-cdn-gate.mjs --post=<id>` 통과가 sub-agent 완료 조건**이다.

### 6.5 게이트 범위 한정 (§0 철학과의 경계)

자동 게이트는 **객관 측정 가능 항목(dim·`…`·md5·출현횟수)만** 강제하는 **하한선**이다. 폰트 가독성·디자인 품질·정보 과밀·의미 정합·figcaption↔이미지 내용 일치 등 **시각·의미 판정은 §0·§4대로 AI multimodal이 1차로 유지**된다. **게이트 통과 ≠ 시각 검증 완료** — 게이트는 "기계가 잡는 바닥", AI 직접 판단은 그 위의 진실이다.

### 6.6 이미지 시각·내용 결함 전수는 AI 직접 Read 필수 (스크립트 전수 판정 금지)

`audit-cdn-gate`(dim·md5)·`audit-post-html`(HTML 텍스트)이 잡는 건 **치수·픽셀 중복·HTML 구조**뿐이다. 아래는 스크립트가 **원리적으로 못 잡으며 반드시 글당 sub-agent가 본문 모든 이미지를 직접 Read(multimodal)** 해야 한다:

- **이미지 안 텍스트 `…`잘림/truncate** — 픽셀이라 HTML grep·dim 측정 둘 다 통과
- **데이터 정확성** — 이미지 안 수치 ↔ 본문 수치 모순 (예: 이미지 90%인데 본문 70%)
- **figcaption ↔ 이미지 실제 내용 정합** — alt/caption은 맞다지만 그림이 다른 주제
- **무관한 이미지·필러** — 본문 주제와 무관한 스크린샷/일러스트가 인포 자리에
- **저품질·옛 디자인** — matplotlib 스타일 차트, "STEP GUIDE / 본문 N개 핵심 섹션 요약" H2 나열형(옛 자동생성), 글번호 불일치 `infographic-{N}.webp`
- **깨진 placeholder** — `file://` 미해결 빈 박스·깨진 이미지 아이콘

**`audit-cdn-gate --all`이 0 fail이어도 "이미지 전수 통과"로 결론 금지.** dim 정상(세로형)이지만 위 결함이 있는 이미지가 다수 존재할 수 있다. 이미지 전수조사는 **글당 sub-agent의 직접 Read 결과로만** 완료 판정한다. 스크립트(dim·md5)는 가로형 깨짐·픽셀 중복의 1차 필터 보조일 뿐이다.

### 6.7 sub-agent 진행 체크포인트 파일 (중단 복구 — CRITICAL)

전수조사·일괄 재발행 등 다수 sub-agent 작업의 중단 복구는 **정본 [subagent-checkpoint.md](subagent-checkpoint.md)** 를 따른다 (도메인 중립 — `/audit`·`/survey`·`/spec` 등도 동일). 핵심: sub-agent가 진행 파일에 **실시간 기록**하고, 메인은 launch 전 그 파일을 읽어 **미완 항목만 재개**한다. 끝의 StructuredOutput 한 번에만 의존하지 않는다.

**블로그 적용례**:
- 진행 파일 `tmp/{task}-progress/{pid}.json` — `{id}` = 글 pid
- targets = 그 글이 처리할 이미지 src·media-id 목록
- **각 이미지/단계 완료 직후** 그 항목 update (`republished:true`·`media_id`·`done` 등)
- 끊겨도 메인이 다음 턴에 `status≠"done"` 또는 미완 targets만 재투입, 이미 done인 글은 건너뜀 (중복 발행·CF 낭비 방지)

---

## 7. 금지

- ❌ audit-*.mjs 점수·통과만으로 "검증 완료" 결론 (AI 직접 판단 1차 원칙 위반)
- ❌ `audit-cdn-gate --all` 0 fail을 이미지 전수 통과로 결론 (이미지 안 텍스트·데이터·정합·무관 이미지는 AI Read 필수 — §6.6)
- ❌ 로컬 draft 렌더만 보고 prod 실물 검증 생략 (§6.1)
- ❌ 증거 없는 "정상/완료" 보고 — 산출물에 재현 증거 미첨부 (§6.2)
- ❌ `audit-cdn-gate.mjs` fail 글을 발행/완료 선언 (§6.4)
- ❌ 게이트 통과를 시각·의미 검증 완료로 간주 (§6.5)
- ❌ 영구 multimodal 유지 항목을 `script_only: true`로 전환
- ❌ gap을 기록만 하고 취합·개선 단계(§2-4) 생략 (루프가 self-improving 되지 않음)
- ❌ 스크립트 수정안을 검토 없이 자동 커밋 (수정은 적용까지, 커밋은 사용자 요청 시)
