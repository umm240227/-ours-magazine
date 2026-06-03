#!/usr/bin/env node
// 본문 인포그래픽 카탈로그 31종 sample-data 렌더·정합성 자동 검증.
// design.md §7.5 정본. asset-images.md §4.10.6 (wrap 가드) + §4.10.8 (AC-룰-6 텍스트 검증) 모두 통과해야 한다.
//
// 동작:
//   1) script/infographic-templates/schema.json 로드 → 31종 본문 인포그래픽 카탈로그
//   2) 각 템플릿 HTML을 tmp/audit-infographic-templates/{name}-sample.html로 복사 (sample data 그대로)
//   3) render-infographic.mjs --width=1200 로 webp 렌더
//   4) audit-infographic-visual.mjs의 룰 함수 import 재사용 (코드 중복 방지)
//   5) sample data 더미 텍스트(Lorem ipsum / 샘플 / 예시 데이터 / TODO / XXX / 동일 stat-value 2회 이상 반복) 0건 검증
//   6) 보고서 tmp/audit-infographic-templates/report-{TS}.json 생성
//
// 사용:
//   node script/audit-infographic-templates.mjs                     # 전수
//   node script/audit-infographic-templates.mjs --template=mini-chart-bar
//   node script/audit-infographic-templates.mjs --json              # stdout JSON
//   node script/audit-infographic-templates.mjs --out=tmp/foo.json  # 보고서 경로 지정
//
// exit code: 모두 통과 0, 한 건이라도 실패 2.

import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  detectStatCardWrapRisk,
  detectNumberUnitSplit,
  detectHeadlineWrapRisk,
  detectBannedColors,
  detectContrastAA,
  detectLineBreakBalance,
  detectListItemBalance,
  detectGridColumnMismatch,
  // detectLogoPath는 drafts 트리(3 level up) 기준이므로 catalog audit에서는 비활성. 본 스크립트는 catalogLogoPath로 대체.
  detectOrphanWord,
  detectFooterLogo,
  detectMobileReadability,
  detectTextLengthExceeded,
  detectBannedPhrases,
  detectFigcaptionFormat,
  riskLevel,
} from './audit-infographic-visual.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'script/infographic-templates');
const SCHEMA_PATH = path.join(TEMPLATE_DIR, 'schema.json');
const OUT_DIR = path.join(ROOT, 'tmp/audit-infographic-templates');
const RENDER_SCRIPT = path.join(ROOT, 'script/render-infographic.mjs');

const args = process.argv.slice(2);
const templateFlag = args.find((a) => a.startsWith('--template='));
const wantJson = args.includes('--json');
const outFlag = args.find((a) => a.startsWith('--out='));
const noRender = args.includes('--no-render'); // 정적 분석만 (renderless)
const onlyTemplate = templateFlag ? templateFlag.split('=')[1] : null;

// sample-data 더미 텍스트 시그널 (스펙: "Lorem ipsum / 샘플 / 예시 데이터 / TODO / XXX / 동일 stat-value 2개 이상 반복")
const DUMMY_PATTERNS = [
  { pat: /Lorem\s+ipsum/i, name: 'Lorem ipsum' },
  { pat: /\b샘플\b/, name: '샘플' },
  { pat: /예시\s*데이터/, name: '예시 데이터' },
  { pat: /\bTODO\b/, name: 'TODO' },
  { pat: /\bXXX\b/, name: 'XXX' },
  { pat: /\bFIXME\b/, name: 'FIXME' },
  { pat: /\bplaceholder\b/i, name: 'placeholder' },
];

// 카탈로그-카탈로그 cross-link 텍스트 (스펙: "n8n" 0건)
const BANNED_TOKENS = ['n8n'];

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

// 더미 텍스트 / 금지 토큰 검출 (스펙 명세)
function detectDummyText(html) {
  const findings = [];
  // HTML 태그 제외 본문 텍스트
  const visible = html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '') // 주석 안의 SAMPLE_DATA / placeholder 가이드 제외
    .replace(/<[^>]+>/g, ' ');
  for (const { pat, name } of DUMMY_PATTERNS) {
    const matches = visible.match(pat);
    if (matches) {
      findings.push({
        type: 'dummy-text',
        risk: 'high',
        msg: `더미 텍스트 "${name}" ${matches.length}회 — sample data가 실제 콘텐츠로 교체되지 않음`,
      });
    }
  }
  for (const tok of BANNED_TOKENS) {
    const re = new RegExp(`\\b${tok}\\b`, 'gi');
    const matches = visible.match(re);
    if (matches) {
      findings.push({
        type: 'banned-token',
        risk: 'high',
        msg: `금지 토큰 "${tok}" ${matches.length}회 — 카탈로그에 잔존하면 안 됨`,
      });
    }
  }
  return findings;
}

// stat-value 중복 검출 (스펙: "동일 stat-value 2개 이상 반복")
// 큰 폰트(text-[≥40px] font-(black|bold|extrabold)) span/div 텍스트가 같은 값 2회 이상이면 더미 의심.
function detectDuplicateStatValues(html) {
  const findings = [];
  const re = /<(?:span|div)[^>]*class="[^"]*text-\[(\d+)px\][^"]*font-(?:black|bold|extrabold)[^"]*"[^>]*>([^<]+)<\/(?:span|div)>/g;
  const counts = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    const font = parseInt(m[1], 10);
    if (font < 40) continue;
    const txt = m[2].trim();
    if (!txt || txt.length > 12) continue;
    // 단위 1-3자 또는 숫자형 토큰만
    if (!/^[\d.,]+(?:\s*[%원개건회배명초분시일주월년x])?$|^[가-힣]{1,3}$|^[A-Za-z0-9.]+$/.test(txt)) continue;
    counts.set(txt, (counts.get(txt) || 0) + 1);
  }
  for (const [txt, n] of counts) {
    if (n >= 2 && /^[\d.,]+/.test(txt)) {
      // 숫자형 stat-value가 2회 이상 반복 (예: "73" 두 번) → 더미 의심
      findings.push({
        type: 'duplicate-stat-value',
        risk: 'medium',
        msg: `숫자 stat-value "${txt}" ${n}회 반복 — sample data가 단일 값으로 채워졌을 가능성. 카드별 고유 수치인지 확인`,
      });
    }
  }
  return findings;
}

// catalog 전용 로고 path 검사 — 정답: src="../../wp-content/illustrations/snshelp-logo.webp"
// (catalog 템플릿은 script/infographic-templates/ 2 level 깊이. drafts 복사 시 path 재정규화는 별도 워크플로.)
function detectCatalogLogoPath(html) {
  const findings = [];
  const VALID = /src="\.\.\/\.\.\/wp-content\/illustrations\/snshelp-logo\.webp"/;
  const lines = html.split('\n').filter((l) => /snshelp-logo/.test(l));
  for (const line of lines) {
    if (/data:image\//.test(line)) continue;
    const m = line.match(/src="([^"]*snshelp-logo[^"]*)"/);
    if (!m) continue;
    if (!VALID.test(line)) {
      findings.push({
        type: 'catalog-logo-path-wrong',
        risk: 'high',
        msg: `catalog 템플릿 로고 path "${m[1]}" — 정답: src="../../wp-content/illustrations/snshelp-logo.webp" (script/infographic-templates/ 2 level 기준)`,
      });
    }
  }
  return findings;
}

// 폭 1200 일관 검사 (스펙 §7.5 검증 항목 1)
function detectMainWidth(html) {
  const findings = [];
  const mainMatch = html.match(/<main[^>]*class="[^"]*w-\[(\d+)px\][^"]*"/);
  if (!mainMatch) {
    findings.push({
      type: 'main-width-missing',
      risk: 'high',
      msg: '<main class="w-[NNNpx]"> 누락',
    });
    return findings;
  }
  const w = parseInt(mainMatch[1], 10);
  if (w !== 1200) {
    findings.push({
      type: 'main-width-wrong',
      risk: 'high',
      msg: `<main> 폭 ${w}px (정본 1200px). asset-images §4.10.1 + design §6.3 위반`,
    });
  }
  return findings;
}

// 템플릿 HTML → audit findings 합산 (audit-infographic-visual.mjs 룰 + 본 스크립트 추가 룰)
function auditTemplate(html) {
  return [
    ...detectMainWidth(html),
    ...detectStatCardWrapRisk(html),
    ...detectNumberUnitSplit(html),
    ...detectHeadlineWrapRisk(html),
    ...detectBannedColors(html),
    ...detectContrastAA(html),
    ...detectLineBreakBalance(html),
    ...detectListItemBalance(html),
    ...detectGridColumnMismatch(html),
    ...detectCatalogLogoPath(html),
    ...detectOrphanWord(html),
    ...detectFooterLogo(html),
    ...detectMobileReadability(html),
    ...detectTextLengthExceeded(html),
    ...detectBannedPhrases(html),
    ...detectFigcaptionFormat(html),
    ...detectDummyText(html),
    ...detectDuplicateStatValues(html),
  ];
}

// 결과 webp가 figure 래퍼로 wp-block-image size-full 호환인지 확인.
// (스펙 §7.5: "결과 webp가 <figure class='wp-block-image size-full'> 래퍼로 사용 가능")
// 실제 파일 존재 + sharp metadata 로 폭/높이/형식 확인.
async function inspectWebp(webpPath) {
  try {
    const st = await stat(webpPath);
    // sharp는 무거우므로 동적 import
    const { default: sharp } = await import('sharp');
    const meta = await sharp(webpPath).metadata();
    return {
      ok: true,
      bytes: st.size,
      width: meta.width,
      height: meta.height,
      format: meta.format,
      // CSS dim 1200 기준 DPR=2 → webp 픽셀 폭 2400 정본 (asset-images §4.10.4)
      cssWidth: meta.width ? meta.width / 2 : null,
      cssHeight: meta.height ? meta.height / 2 : null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function renderTemplate(srcHtmlPath, sampleHtmlPath, webpPath) {
  // sample HTML은 src 그대로 복사 (sample data가 이미 내재 — schema.json 가이드용)
  await copyFile(srcHtmlPath, sampleHtmlPath);
  // render-infographic.mjs 호출. cwd는 ROOT (lock-gate / 상대경로 일관)
  try {
    execFileSync('node', [RENDER_SCRIPT, sampleHtmlPath, webpPath, '--width=1200', '--max-height=2000'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e.stderr ? e.stderr.toString().slice(0, 500) : e.message,
      code: e.status,
    };
  }
}

async function main() {
  // 1) schema.json 로드
  let schema;
  try {
    schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf-8'));
  } catch (e) {
    console.error(`[fatal] schema.json 로드 실패: ${e.message}`);
    process.exit(2);
  }
  const templateNames = Object.keys(schema.templates || {});
  if (templateNames.length === 0) {
    console.error('[fatal] schema.json에 등록된 템플릿 0개');
    process.exit(2);
  }

  await ensureDir(OUT_DIR);

  // 2) 각 템플릿 처리
  const results = [];
  for (const name of templateNames) {
    if (onlyTemplate && name !== onlyTemplate) continue;
    const srcHtml = path.join(TEMPLATE_DIR, `${name}.html`);
    const sampleHtml = path.join(OUT_DIR, `${name}-sample.html`);
    const webpPath = path.join(OUT_DIR, `${name}-sample.webp`);

    const entry = {
      template: name,
      category: schema.templates[name]?.category || null,
      srcExists: false,
      render: null,
      webp: null,
      findings: [],
      risk: 'ok',
    };

    let html;
    try {
      html = await readFile(srcHtml, 'utf-8');
      entry.srcExists = true;
    } catch (e) {
      entry.findings.push({
        type: 'template-missing',
        risk: 'high',
        msg: `schema에 등록된 ${name}.html 파일 없음 — ${e.message}`,
      });
      entry.risk = 'high';
      results.push(entry);
      continue;
    }

    // 정적 분석 (HTML 룰)
    entry.findings = auditTemplate(html);

    // 렌더 (옵션)
    if (!noRender) {
      const r = await renderTemplate(srcHtml, sampleHtml, webpPath);
      entry.render = r;
      if (!r.ok) {
        entry.findings.push({
          type: 'render-failed',
          risk: 'high',
          msg: `render-infographic.mjs 실패 (exit ${r.code ?? '?'}): ${r.error?.slice(0, 200)}`,
        });
      } else {
        entry.webp = await inspectWebp(webpPath);
        if (!entry.webp.ok) {
          entry.findings.push({
            type: 'webp-inspect-failed',
            risk: 'high',
            msg: `webp 메타 읽기 실패: ${entry.webp.error}`,
          });
        } else {
          // CSS dim ≤ 2000 검사 (스펙 §7.5)
          if (entry.webp.cssHeight && entry.webp.cssHeight > 2000) {
            entry.findings.push({
              type: 'css-dim-exceeded',
              risk: 'high',
              msg: `webp CSS 높이 ${Math.round(entry.webp.cssHeight)}px > 2000 (asset-images §4.10.4)`,
            });
          }
          // 폭 검사 (DPR=2 → 2400px 정본)
          if (entry.webp.width !== 2400) {
            entry.findings.push({
              type: 'webp-width-wrong',
              risk: 'medium',
              msg: `webp 폭 ${entry.webp.width}px ≠ 2400px (1200 × DPR=2 정본)`,
            });
          }
        }
      }
    }

    entry.risk = riskLevel(entry.findings);
    results.push(entry);
  }

  // 3) 결과 정렬
  const order = { high: 0, medium: 1, low: 2, ok: 3, error: 4 };
  results.sort((a, b) => (order[a.risk] ?? 4) - (order[b.risk] ?? 4) || a.template.localeCompare(b.template));

  // 4) 카운트 집계
  const counts = { high: 0, medium: 0, low: 0, ok: 0 };
  for (const r of results) counts[r.risk] = (counts[r.risk] || 0) + 1;

  const summary = {
    timestamp: new Date().toISOString(),
    schemaRegistered: templateNames.length,
    audited: results.length,
    counts,
    pass: counts.high === 0,
    results,
  };

  // 5) 보고서 출력
  const reportPath = outFlag
    ? path.resolve(ROOT, outFlag.split('=')[1])
    : path.join(OUT_DIR, `report-${timestamp()}.json`);

  await writeFile(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');

  if (wantJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(`# 인포그래픽 카탈로그 감사\n`);
    process.stdout.write(`- schema 등록: ${templateNames.length}종\n`);
    process.stdout.write(`- 감사: ${results.length}종 (high ${counts.high} / medium ${counts.medium} / low ${counts.low} / ok ${counts.ok})\n`);
    process.stdout.write(`- 보고서: ${path.relative(ROOT, reportPath)}\n\n`);
    for (const r of results) {
      if (r.risk === 'ok') continue;
      process.stdout.write(`## ${r.template} [${r.risk}]\n`);
      for (const f of r.findings) {
        process.stdout.write(`- [${f.risk}] ${f.type} — ${f.msg}\n`);
      }
      process.stdout.write(`\n`);
    }
  }

  // exit: 통과 0, 실패 2 (스펙)
  process.exit(counts.high === 0 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
