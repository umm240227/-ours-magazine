#!/usr/bin/env node
// trace-cost.mjs — 발행 1회의 실제 Anthropic 비용을 transcript jsonl에서 계측 (Step 0 진단)
//
// prod 발행 파서(run-railway.sh의 status JSON 추출)를 건드리지 않는 별도 진단 도구.
// Claude Code가 디스크에 남기는 세션 transcript(메인 + sub-agent)의 per-message
// model·usage를 읽어 모델별·에이전트별 비용을 분해한다.
//
// 사용법:
//   node script/trace-cost.mjs <세션-transcript-dir | jsonl 파일 | 세션-id>
//   node script/trace-cost.mjs --project ~/.claude/projects/<proj> --latest
//   node script/trace-cost.mjs <dir> --json   # 기계 판독용 JSON 출력
//
// 답하는 것 (재검토 Step 0):
//   ① sub-agent(이미지검증·리뷰어·팩트체크)가 실제 Opus냐 Sonnet이냐  → per-agent model
//   ② 캐싱이 실제로 먹나                                              → cache_read 비중
//   ③ 비용이 어디 몰리나                                              → 모델·에이전트별 비용 랭킹
//   ④ 어느 경로(seed/full)가 돌았나                                   → 호출 인자/도구 흔적은 별도(로그)
//
// 주의: input_tokens = 비캐시 입력, cache_creation = 캐시 write, cache_read = 캐시 hit, output = 출력.
//       이 4개를 각각 다른 단가로 청구한다(아래 PRICES). 추정 아님 — usage 실측값.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'

// 2026 공식 가격 (per MTok). cache_read = base_in × 0.1, cache_write_5m = ×1.25, cache_write_1h = ×2.0
const PRICES = {
  opus:   { in: 5, out: 25 },
  sonnet: { in: 3, out: 15 },
  haiku:  { in: 1, out: 5 },
}
const CACHE_READ_MULT = 0.1
const CACHE_WRITE_5M_MULT = 1.25
const CACHE_WRITE_1H_MULT = 2.0
const WEB_SEARCH_USD = 0.01 // 웹검색 $10 / 1,000 requests (server_tool_use.web_search_requests — 모델 무관 별도 과금)

function modelFamily(model) {
  if (!model) return null
  const m = model.toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return null // 알 수 없는 모델(<synthetic> 등)은 비용 0 처리
}

// usage 1건 → 달러. base 단가에 토큰 종류별 배수 적용.
function costOf(family, u) {
  const p = PRICES[family]
  if (!p) return 0
  const baseIn = p.in / 1e6
  const baseOut = p.out / 1e6
  const cc = u.cache_creation || {}
  const w5 = cc.ephemeral_5m_input_tokens ?? 0
  const w1 = cc.ephemeral_1h_input_tokens ?? 0
  // cache_creation_input_tokens가 세분 합과 다르면 세분 우선, 없으면 5m으로 간주
  const wTotal = u.cache_creation_input_tokens ?? (w5 + w1)
  const w5eff = (w5 + w1) > 0 ? w5 : wTotal // 세분 없으면 전량 5m
  const w1eff = w1
  return (
    (u.input_tokens ?? 0) * baseIn +
    w5eff * baseIn * CACHE_WRITE_5M_MULT +
    w1eff * baseIn * CACHE_WRITE_1H_MULT +
    (u.cache_read_input_tokens ?? 0) * baseIn * CACHE_READ_MULT +
    (u.output_tokens ?? 0) * baseOut
  )
}

// 입력 경로 해석 → 읽을 jsonl 파일 목록
function collectJsonl(input, projectDir) {
  const files = []
  let root = input
  // 세션 id만 준 경우 project 디렉토리에서 찾기
  if (projectDir && !existsSync(root)) {
    const cand = join(projectDir, root.endsWith('.jsonl') ? root : root + '.jsonl')
    if (existsSync(cand)) root = cand
    else if (existsSync(join(projectDir, root))) root = join(projectDir, root)
  }
  if (!existsSync(root)) throw new Error(`경로 없음: ${root}`)
  const st = statSync(root)
  if (st.isFile()) {
    files.push(root)
    // 같은 세션의 sub-agent 디렉토리도 포함 (<session>.jsonl ↔ <session>/)
    const sib = root.replace(/\.jsonl$/, '')
    if (existsSync(sib) && statSync(sib).isDirectory()) walkDir(sib, files)
  } else {
    walkDir(root, files)
    // 형제 <dir>.jsonl(메인 세션)도 포함
    const mainJsonl = root.replace(/\/$/, '') + '.jsonl'
    if (existsSync(mainJsonl)) files.push(mainJsonl)
  }
  return [...new Set(files)]
}
function walkDir(dir, out) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) walkDir(p, out)
    else if (e.endsWith('.jsonl') && e !== 'journal.jsonl') out.push(p)
  }
}

function agentLabel(o, file) {
  // sub-agent 식별: agentId + 워크플로 라벨(파일명) + sidechain 여부
  const id = o.agentId || o.attributionAgent
  if (o.isSidechain || (id && id !== o.sessionId)) {
    return `agent:${(id || basename(file)).slice(0, 14)}`
  }
  return 'main-loop'
}

function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  let projectDir = null
  const latest = argv.includes('--latest')
  const pi = argv.indexOf('--project')
  if (pi >= 0) projectDir = argv[pi + 1]
  const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--project')

  let input = positional[0]
  if (!input && latest && projectDir) {
    // 가장 최근 .jsonl 세션
    const sessions = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, t: statSync(join(projectDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    if (!sessions.length) throw new Error('세션 jsonl 없음')
    input = join(projectDir, sessions[0].f)
  }
  if (!input) {
    console.error('사용법: node script/trace-cost.mjs <transcript-dir|jsonl|session-id> [--project DIR] [--latest] [--json]')
    process.exit(1)
  }

  const files = collectJsonl(input, projectDir)
  const byModel = {}   // family → {input, cacheCreate, cacheRead, output, cost, msgs}
  const byAgent = {}   // label → {model 집합, cost, msgs, input, cacheRead, cacheCreate, output}
  let totalCost = 0, unknownModelMsgs = 0, webSearchTotal = 0

  for (const file of files) {
    let raw
    try { raw = readFileSync(file, 'utf8') } catch { continue }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      let o
      try { o = JSON.parse(line) } catch { continue }
      const m = o.message
      if (!m || m.role !== 'assistant' || !m.usage) continue
      const fam = modelFamily(m.model)
      const u = m.usage
      // 웹검색은 토큰과 별도 과금($10/1000). server_tool_use.web_search_requests를 비용에 합산.
      const webReqs = u.server_tool_use?.web_search_requests ?? 0
      const cost = costOf(fam, u) + webReqs * WEB_SEARCH_USD
      totalCost += cost
      webSearchTotal += webReqs
      if (!fam) unknownModelMsgs++

      const fkey = fam || (m.model || 'unknown')
      const bm = (byModel[fkey] ||= { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, cost: 0, msgs: 0 })
      bm.input += u.input_tokens ?? 0
      bm.cacheCreate += u.cache_creation_input_tokens ?? 0
      bm.cacheRead += u.cache_read_input_tokens ?? 0
      bm.output += u.output_tokens ?? 0
      bm.cost += cost; bm.msgs++

      const label = agentLabel(o, file)
      const ba = (byAgent[label] ||= { models: {}, cost: 0, msgs: 0, input: 0, cacheRead: 0, cacheCreate: 0, output: 0 })
      ba.models[m.model] = (ba.models[m.model] ?? 0) + 1
      ba.cost += cost; ba.msgs++
      ba.input += u.input_tokens ?? 0
      ba.cacheRead += u.cache_read_input_tokens ?? 0
      ba.cacheCreate += u.cache_creation_input_tokens ?? 0
      ba.output += u.output_tokens ?? 0
    }
  }

  const totalInput = Object.values(byModel).reduce((s, m) => s + m.input, 0)
  const totalCacheRead = Object.values(byModel).reduce((s, m) => s + m.cacheRead, 0)
  const totalCacheCreate = Object.values(byModel).reduce((s, m) => s + m.cacheCreate, 0)
  const cacheableInput = totalInput + totalCacheRead + totalCacheCreate
  const cacheHitRate = cacheableInput ? (totalCacheRead / cacheableInput) : 0

  if (asJson) {
    console.log(JSON.stringify({ files: files.length, totalCost, byModel, byAgent, cacheHitRate, webSearchRequests: webSearchTotal, webSearchCost: webSearchTotal * WEB_SEARCH_USD, unknownModelMsgs }, null, 2))
    return
  }

  const usd = (n) => '$' + n.toFixed(4)
  const k = (n) => (n / 1000).toFixed(1) + 'k'
  console.log(`\n=== trace-cost — 발행 1회 실측 비용 분해 ===`)
  console.log(`transcript 파일 ${files.length}개\n`)

  console.log(`[모델별]  (cache_read=10%·write_5m=125%·write_1h=200%·output=full 단가 적용)`)
  console.log(`  model     msgs   uncached_in  cache_read  cache_write   output     비용`)
  for (const [fam, m] of Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`  ${fam.padEnd(9)} ${String(m.msgs).padStart(4)}   ${k(m.input).padStart(9)}  ${k(m.cacheRead).padStart(9)}  ${k(m.cacheCreate).padStart(10)}  ${k(m.output).padStart(8)}   ${usd(m.cost)}`)
  }

  console.log(`\n[에이전트별]  (sub-agent 모델이 실제 무엇인지 = 재검토 ① 답)`)
  console.log(`  label                  msgs   model(s)                          비용`)
  for (const [label, a] of Object.entries(byAgent).sort((x, y) => y[1].cost - x[1].cost)) {
    const models = Object.entries(a.models).map(([mm, c]) => `${mm}×${c}`).join(', ')
    console.log(`  ${label.padEnd(22)} ${String(a.msgs).padStart(4)}   ${models.padEnd(33)} ${usd(a.cost)}`)
  }

  console.log(`\n[캐싱 효율]  (재검토 ② 답)`)
  console.log(`  cache_read ${k(totalCacheRead)} / cache_write ${k(totalCacheCreate)} / uncached_in ${k(totalInput)}`)
  console.log(`  cache hit rate = ${(cacheHitRate * 100).toFixed(1)}%  (입력 중 캐시로 읽힌 비율 — 0%면 캐싱 미작동/세션 분절)`)
  if (unknownModelMsgs) console.log(`  ⚠️ 모델 미상 ${unknownModelMsgs}건(비용 0 처리 — synthetic/로컬 메시지)`)

  if (webSearchTotal) {
    console.log(`\n[웹검색]  (토큰과 별도 과금 $10/1000)`)
    console.log(`  web_search_requests ${webSearchTotal}건 → ${usd(webSearchTotal * WEB_SEARCH_USD)} (총비용에 포함됨)`)
  }

  console.log(`\n총 비용(Anthropic 청구분 = 토큰 + 웹검색; codex·Semrush 제외): ${usd(totalCost)}\n`)
}

main()
