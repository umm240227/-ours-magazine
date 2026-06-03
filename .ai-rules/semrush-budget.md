# Semrush MCP 비용 관리 정본

> Semrush MCP는 유료 API. Pro 플랜 월 50,000 units. **호출 전 비용 계산 + 임계값 게이트가 핵심**. 영속 추적 시스템은 두지 않는다 (AI가 매 호출 정직히 기록한다는 보장이 없으므로 — 잔량 확인은 Semrush Query Log에서 직접).

## 1. 핵심 원칙 (위반 금지)

1. **호출 전 비용 계산**: 모든 Semrush 호출 전에 `단가 × line = 예상 비용` 계산
2. **임계값 준수**: §3 표에 따라 announce / 승인
3. **세션 내 누적 추적**: 현재 대화 안에서만 카운트 (영속 파일 X). 매 호출 직후 `[Semrush: +X / 세션 누적 Y]` 한 줄 보고
4. **세션 누적 5,000 units 초과**: 즉시 중단하고 사용자에게 Semrush Query Log 잔량 확인 요청
5. **추측 금지**: 호출 비용 데이터를 머리로 만들지 말 것. 단가 × line은 정확히 계산 가능하지만, 실제 응답 비용은 Semrush Query Log가 정본
6. **단일 호출이 한도의 큰 비중을 차지하는 패턴 차단**: `backlinks_refdomains × 다회 × 큰 limit`처럼 사전 보고 없이 일괄 소진하면 월 한도가 한 번에 날아간다. §3 임계값을 반드시 통과해야 호출

## 2. 비용표 (line × 단가)

### overview_research

| 리포트 | 단가 |
|---|---|
| `domain_rank` | 10/line |
| `domain_rank_history` | 10/line |
| `domain_ranks` | 10/line |
| `overview_rank` | 10/line |
| `rank_difference` | 20/line |

### organic_research

| 리포트 | 단가 | 비고 |
|---|---|---|
| `domain_organic` | 10/line | limit 50 = 500 |
| `domain_organic_unique` | 10/line | |
| `domain_organic_subdomains` | 10/line | |
| `domain_adwords` | 20/line | |
| `domain_organic_organic` | 40/line | |
| `domain_adwords_unique` | 40/line | |
| `domain_adwords_adwords` | 40/line | |
| `domain_shopping` | 30/line | |
| `domain_shopping_shopping` | 60/line | |
| `domain_shopping_unique` | 60/line | |
| `domain_domains` | **80/line** | 비쌈 |
| `domain_adwords_historical` | **100/line** | 매우 비쌈 |

### keyword_research

| 리포트 | 단가 | 비고 |
|---|---|---|
| `phrase_this` | 10/line | |
| `phrase_these` | 10/line | **배치 (semicolon). 우선 사용** |
| `phrase_all` | 10/line | |
| `phrase_organic` | 10/line | SERP Top 10 |
| `phrase_fullsearch` | 20/line | |
| `phrase_adwords` | 20/line | |
| `phrase_related` | **40/line** | limit 30 = 1,200 |
| `phrase_questions` | **40/line** | |
| `phrase_kdi` | **50/line** | |
| `phrase_adwords_historical` | **100/line** | |

### backlink_research

| 리포트 | 단가 | 비고 |
|---|---|---|
| `backlinks_overview` | **40/request** | flat. 저렴, 우선 사용 |
| `backlinks_categories` | **50/request** | flat |
| `backlinks_ascore_profile` | **100/request** | flat |
| `backlinks` | 40/line | limit 100 = 4,000 |
| `backlinks_refdomains` | 40/line | **disavow 주의** |
| `backlinks_anchors` | 40/line | |
| `backlinks_geo` | 40/line | |
| `backlinks_historical` | 40/line | |
| `backlinks_comparison` | 40/line | |
| `backlinks_pages` | 40/line | |
| `backlinks_refips` | 40/line | |
| `backlinks_categories_profile` | 40/line | |
| `backlinks_competitors` | 40/line | |
| `backlinks_tld` | 40/line | |
| `backlinks_matrix` | 40/line | |

## 3. 임계값

| 호출 비용 | 처리 |
|---|---|
| < 500 units | 호출 직전 한 줄 announce 후 자동 실행 |
| 500~2,000 units | 사전 비용 보고 + 자동 실행 |
| ≥ 2,000 units | **STOP**. line × 단가 표 + 정당화 + 대안 + "진행해" 명시 승인 필수 |

**세션 누적 ≥ 5,000 units**: 추가 호출 직전 중단 → 누적 보고 + 사용자에게 Semrush Query Log 잔량 확인 요청.

## 4. 호출 전 사전 보고 포맷

500+ units인 경우:

```
## Semrush 호출 예상 비용
- 리포트: <report_name>
- 단가: <X> units/line (또는 flat)
- limit: <N> lines
- 예상 비용: <X × N> units
- 세션 누적 (호출 후): <prev + cost> units
- 정당화: <왜 이 데이터가 필요한가>
- 대안: <더 저렴한 호출 가능성, 있으면>

승인 필요: "진행해"
```

호출 직후:
```
[Semrush: +X units / 세션 누적 Y]
```

## 5. 비용 절감 패턴 (선호 순서)

1. **phrase_these 배치**: 키워드 1개씩 호출 금지. semicolon으로 묶어 1회 (10 × N)
2. **domain_rank 우선**: 10/line. 경쟁사 빠른 비교 최적
3. **backlinks_overview 우선**: flat 40. refdomains/backlinks 전에 먼저
4. **limit 단계적**: Top 20부터 시작. 결과 보고 필요 시 추가 호출
5. **대체 우선** (§6):
   - `phrase_related` 의도 → `phrase_these` + 수동 LSI 우선 시도
   - `backlinks_refdomains` limit ≥ 100 의도 → `backlinks_overview` (flat 40)로 충분한지 먼저 확인
   - `phrase_kdi` (50) 의도 → `phrase_these`의 Co 값(10)으로 근사 가능한지 확인

## 6. 금지 패턴 (즉시 차단)

- ❌ `backlinks_refdomains` / `backlinks` limit ≥ 100 사전 승인 없이 호출 (1회 4,000)
- ❌ `phrase_related` × 키워드 N개 일괄 호출 (개당 1,200 폭발)
- ❌ `domain_domains` (80/line) 큰 limit
- ❌ `domain_adwords_historical` (100/line) 무조건
- ❌ 비용 계산 없이 "한번 더 돌려보자"
- ❌ 임계값 회피용 분할 호출 (누적은 합산)
- ❌ 사용량 데이터 추측·날조

## 7. Sub-agent 위임 시

Sub-agent 프롬프트에 반드시 포함:

```
## Semrush 비용 봉투
- 예산: <N> units 이내
- 호출 전 .ai-rules/semrush-budget.md Read 필수
- 호출 직후 본인 출력에 [Semrush: +X / agent 누적 Y] 한 줄 보고
- agent 누적이 80% (0.8 × 예산) 도달 시 즉시 중단 + parent에게 보고
```

Parent는 spawn 전에 봉투 합 ≤ 합리적 한도 확인. 여러 agent 동시 spawn 시 envelope × N 합계 announce.

## 8. 잔량 확인 (외부 시스템)

- Semrush가 "API units 부족" 에러 반환 시 즉시 중단
- 정확한 잔량 카운터 페이지는 Semrush 미제공
- **잔량 확인 정본**: Semrush Query Log 페이지 (https://www.semrush.com/accounts/profile/query-log/)
  - 우측 상단 Export 버튼 → CSV 받아 Report cost 컬럼 합산
  - 50,000 - 합산 = 잔량
- AI는 잔량 추정 시도 금지 (이번 세션 안 호출만 카운트 가능). 정확한 수치 필요하면 사용자에게 Query Log 확인 요청
