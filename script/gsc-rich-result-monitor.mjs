#!/usr/bin/env node
// GSC 인상수 모니터 — 7d 평균 vs 90d rolling baseline 비교 후 트리거 JSON 출력
// design §16.1-§16.4 정합, AC-33.
//
// 사용:
//   node --env-file=.env script/gsc-rich-result-monitor.mjs [--json]
//
// 출력 (stdout):
//   { trigger: boolean, reason?: string, avg7?: number, avg90?: number, drop?: number, error?: string }
//
// 의존: Node 내장 fetch + OAuth 2.0 token 교환만 (google-auth-library 등 신규 dep 금지).
// 패턴: script/gsc-inspect.mjs 의 refreshAccessToken 답습.
//
// credential 누락·OAuth/API 호출 실패 시: trigger=false 출력 + exit 0 (false negative 방지).

// --- 상수 ---
const SITE_URL = 'https://www.helpsns.com/';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

// --- 날짜 헬퍼 ---

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function isoDate(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function mean(arr) {
  if (!arr.length) return 0;
  const sum = arr.reduce((s, v) => s + v, 0);
  return sum / arr.length;
}

// --- OAuth (gsc-inspect.mjs 패턴 답습) ---

async function refreshAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`token-refresh-failed: HTTP ${res.status} ${body}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('token-refresh-failed: no access_token');
  return data.access_token;
}

// --- GSC searchAnalytics.query ---

async function fetchImpressions(accessToken, daysBack) {
  // 트레이드오프: GSC searchAnalytics는 D-2~D-3가 보통 최신 데이터.
  // 본 모니터는 7d 평균/90d 평균 비교가 목적이라 end=today, start=daysAgo(daysBack)로 충분.
  const end = isoDate(daysAgo(0));
  const start = isoDate(daysAgo(daysBack));
  const url = `https://searchconsole.googleapis.com/v1/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: start,
      endDate: end,
      dimensions: ['date'],
      searchType: 'web',
    }),
  });
  if (!res.ok) {
    // 호출 실패 = 빈 결과로 처리 (false negative 방지)
    return [];
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.rows) ? data.rows : [];
}

// --- 메인 ---

async function main() {
  // credential 미설정 분기 (AC-33 stale 처리 정합)
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.log(JSON.stringify({ trigger: false, error: 'credentials_missing' }));
    process.exit(0);
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken();
  } catch (e) {
    // OAuth 실패 → false negative 방지
    console.log(JSON.stringify({ trigger: false, error: `oauth_failed: ${e.message}` }));
    process.exit(0);
  }

  let rows7, rows90;
  try {
    rows7 = await fetchImpressions(accessToken, 7);
    rows90 = await fetchImpressions(accessToken, 90);
  } catch (e) {
    console.log(JSON.stringify({ trigger: false, error: `gsc_query_failed: ${e.message}` }));
    process.exit(0);
  }

  // stale 검사: 24h 이내 데이터 포함 여부 (GSC는 D-2~D-3 lag 있으므로 D-2도 stale 아님)
  // 정책: 7d range 안에 isoDate(daysAgo(3)) 이후 데이터가 1건이라도 있으면 not-stale
  const staleCutoff = isoDate(daysAgo(3));
  const hasRecent = rows7.some((r) => Array.isArray(r.keys) && r.keys[0] >= staleCutoff);
  if (!hasRecent) {
    console.log(JSON.stringify({ trigger: false, reason: 'stale' }));
    process.exit(0);
  }

  const avg7 = mean(rows7.map((r) => Number(r.impressions) || 0));
  const avg90 = mean(rows90.map((r) => Number(r.impressions) || 0));

  // 90d baseline 0이면 비교 불가 → trigger=false
  if (avg90 <= 0) {
    console.log(JSON.stringify({ trigger: false, reason: 'no_baseline', avg7, avg90 }));
    process.exit(0);
  }

  const drop = (avg90 - avg7) / avg90;
  if (drop >= 0.5) {
    console.log(
      JSON.stringify({
        trigger: true,
        reason: 'impression_drop',
        drop: Number(drop.toFixed(4)),
        avg7: Number(avg7.toFixed(2)),
        avg90: Number(avg90.toFixed(2)),
      }),
    );
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      trigger: false,
      avg7: Number(avg7.toFixed(2)),
      avg90: Number(avg90.toFixed(2)),
      drop: Number(drop.toFixed(4)),
    }),
  );
  process.exit(0);
}

main().catch((e) => {
  // 어떤 예외가 발생해도 false negative 방지
  console.log(JSON.stringify({ trigger: false, error: `unexpected: ${e.message}` }));
  process.exit(0);
});
