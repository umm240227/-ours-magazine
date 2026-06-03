---
name: subagent-checkpoint
description: "다수 sub-agent / Workflow fan-out 작업의 중단 복구 정본. 각 작업 단위 sub-agent가 독립 진행 파일(tmp/{task}-progress/{id}.json)에 실시간 기록하고, 메인은 그 파일을 읽어 미완 항목만 재개한다. VSCode 재시작·네트워크 끊김·토큰 한도로 워크플로우가 끊겨도 처음부터 다시 하지 않는다. /audit all·/survey·/spec·/blog audit-all·/review 등 다수 sub-agent를 fan-out하는 모든 작업 시 반드시 따른다."
---

# sub-agent 중단 복구 — 진행 파일 체크포인트 (정본)

다수 sub-agent를 fan-out하는 작업(전수조사·일괄 재발행·병렬 감사·대규모 마이그레이션)은 sub-agent와 메인이 **메모리(대화 컨텍스트)로만 소통하면 안 된다.** VSCode 재시작·네트워크 끊김·토큰 한도·크래시로 워크플로우가 끊기면, 아직 최종 보고(StructuredOutput)를 못 부른 sub-agent의 작업 기록이 전부 사라져 어디까지 됐는지 추적 불가 → 전량 재실행 낭비 + 중복 작업.

해결: **sub-agent는 독립 진행 파일에 실시간 기록하고, 메인은 그 파일을 읽어 미완 항목만 재개**한다. 진행 파일은 디스크에 남으므로 끊겨도 다음 턴에 이어갈 수 있다.

---

## 1. 진행 파일 컨벤션

- 경로: `tmp/{task}-progress/{id}.json` — 작업 단위 1개 = 파일 1개
  - `{task}`: 작업 종류 (예: `blog-audit`, `site-audit`, `review-audit`, `republish`)
  - `{id}`: 작업 단위 식별자 (글 pid, 페이지 경로 slug, reviewId 등)
- `tmp/` 하위라 gitignore됨 — 1회성 복구용이다. 영속 학습 상태(예: 수렴 플래그 `script/audit-state/convergence.json`)와는 경로를 구분한다.

## 2. 기록 시점 (실시간 — 끝 한 번에 의존 금지)

sub-agent는 아래 3시점에 진행 파일을 write/update 한다:

1. **시작 시**: `{id, status: "start", targets: [처리할 하위 항목 목록]}` — targets는 그 작업이 끝내야 할 단위 리스트(이미지 src·단계·검사 항목 등)
2. **각 하위 항목 완료 직후**: 해당 targets 항목을 `done: true`로 update (+ 산출 식별자: media_id·md5·score 등)
3. **종료 시**: `status: "done"`

최종 보고(StructuredOutput)는 여전히 호출하되, **중단 시 유일한 복구 소스는 진행 파일**이다. 보고 실패 ≠ 작업 손실 — 진행 파일이 1차 복구 소스.

## 3. 진행 파일 스키마

```json
{
  "id": "<작업 단위 식별자>",
  "task": "<작업 종류>",
  "status": "start | in_progress | done",
  "targets": [
    { "key": "<하위 항목 키>", "done": false, "evidence": null }
  ],
  "updated_count": 0
}
```

각 target 완료 시 `done: true` + `evidence`(재현 근거: URL·md5·dim·score 등)를 기록한다. 증거 정책 정본은 [audit-script-loop.md](audit-script-loop.md) §6.2 (no-evidence = 미완료).

## 4. 메인 재개 절차 (매 라운드 launch 전 강제)

다수 sub-agent를 launch하기 **전에** 메인은 항상:

1. `tmp/{task}-progress/*.json` 전체를 읽는다
2. `status === "done"` 인 작업 단위는 **건너뛴다** (중복 작업·중복 발행 방지)
3. `status !== "done"` 이거나 `targets` 중 `done:false`가 남은 단위만 다음 라운드 args로 **재투입**한다 — 이미 done인 targets는 sub-agent 프롬프트에서 제외해 남은 것만 처리시킨다
4. 진행 파일이 하나도 없으면 fresh 시작

이 절차 덕분에 작업 단위 수와 무관하게, 몇 번 끊기든 한 작업을 완주할 수 있다.

## 5. Workflow 오케스트레이션과의 관계

`pipeline()`/`parallel()`로 대량 fan-out할 때도 동일하다. Workflow 자체가 resume 저널을 갖더라도(같은 세션 한정), 진행 파일은 **세션·도구를 넘어 살아남는 디스크 기록**이라 VSCode 재시작·도구 교체 후에도 복구된다. 둘은 상호 보완이며 진행 파일이 1차 복구 소스다.

## 6. 금지

- ❌ 메모리(대화 컨텍스트)로만 sub-agent 진행 상황 추적 — 끊기면 전손
- ❌ 최종 보고(StructuredOutput) 한 번에만 기록 의존 — 중단 시 그 sub-agent 작업 증발
- ❌ 재개 시 done 단위 재실행 — 중복 작업·중복 발행·CDN 캐시 낭비
- ❌ 진행 파일을 영속 경로(gitignore 안 되는 곳)에 저장 — 1회성 복구용이므로 `tmp/`
