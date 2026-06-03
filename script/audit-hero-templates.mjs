#!/usr/bin/env node
// Hero 템플릿 8종(v1-v8)을 sample data로 렌더 → §4.8.5 모바일 가독성 자동 검증.
// 정본: .ai-rules/asset-images.md §4.8.5 + script/hero-templates/schema.json
//
// 동작:
//   1. schema.json 읽기 → 8종 hero 템플릿 + sample 데이터 로드
//   2. 각 hero에 대해 placeholder를 sample data로 치환 → 임시 HTML 작성
//   3. render-infographic.mjs로 1200×675 webp 렌더 (width=1200, max-height=675)
//   4. §4.8.5 폰트 크기·opacity·로고 박스·푸터 로고 정합 자동 검증
//   5. AC-룰-6 텍스트 길이 검증 (제목 ≤ 32자, 부제 ≤ 60자)
//   6. sample 더미 텍스트(Lorem ipsum / TODO / 샘플) 0건 검증
//   7. 결과 보고서 tmp/audit-hero-templates/report-{TS}.json + stdout 요약
//
// 사용:
//   node script/audit-hero-templates.mjs                    # 8종 모두 검사
//   node script/audit-hero-templates.mjs --template=v4-quote-hero
//   node script/audit-hero-templates.mjs --json             # stdout JSON
//   node script/audit-hero-templates.mjs --out=tmp/.../foo.json
//
// exit code: 모두 통과 0, 실패 있으면 2

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const HERO_DIR = 'script/hero-templates';
const SCHEMA_PATH = path.join(HERO_DIR, 'schema.json');
const OUT_DIR = 'tmp/audit-hero-templates';

// §4.8.5 강제 폰트 최소값 (asset-images.md §4.8.5 표)
const MIN_FONT_SIZES = {
  title: 56,
  subtitle: 40,
  category_badge: 24,
  year_tag: 18,
  logo_brand_text: 22,
  logo_url_text: 14,
  stat_label: 14,
};
// 로고 박스 최소 (px)
const MIN_LOGO_BOX = 60;
// opacity 최소 (보조 텍스트 마지노선)
const MIN_TEXT_OPACITY = 0.55;

// AC-룰-6 텍스트 길이 한계
const TEXT_LENGTH_LIMITS = {
  title: { min: 6, max: 32 },
  subtitle: { max: 60 },
};

// sample 더미 텍스트 패턴 (검출되면 실패)
const DUMMY_TEXT_PATTERNS = [
  /lorem\s+ipsum/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /샘플\s*텍스트/,
  /\bplaceholder\b/i,
];

// 금지 단어 (CLAUDE 작업 규칙)
const FORBIDDEN_WORDS = ['n8n'];

// ====== CLI 파싱 ======
const args = process.argv.slice(2);
const opts = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v === undefined ? true : v];
  }),
);
const TARGET_TEMPLATE = opts.template || null;
const JSON_MODE = Boolean(opts.json);
const OUT_PATH = opts.out || null;

// ====== 유틸 ======
function nowTs() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function log(...a) {
  if (!JSON_MODE) console.log(...a);
}
function warn(...a) {
  if (!JSON_MODE) console.warn(...a);
}
function err(...a) {
  console.error(...a);
}

// placeholder 치환 — `{{KEY}}` → sample[KEY]
function applyPlaceholders(html, sample) {
  let out = html;
  for (const [k, v] of Object.entries(sample || {})) {
    const re = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
    out = out.replace(re, String(v));
  }
  return out;
}

// HTML에서 남은 unresolved placeholder 검출
function findUnresolvedPlaceholders(html) {
  const matches = html.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g) || [];
  return [...new Set(matches)];
}

// §4.8.5 폰트 사이즈 검증 — inline style 또는 text-[Npx] 클래스에서 폰트 px 추출
// 룰: 데코·워터마크(font-size > 200px + pointer-events-none + select-none)는 제외
function stripDecorations(html) {
  let s = html;
  // (a) inline font-size > 200px element 통째 제거
  s = s.replace(/<(\w+)([^>]*?)(font-size:\s*([0-9]+)px)([^>]*?)>([\s\S]*?)<\/\1>/g, (m, tag, pre, decl, sizeStr) => {
    return Number(sizeStr) > 200 ? '' : m;
  });
  // (b) pointer-events-none + select-none 동시 보유 element 통째 제거
  s = s.replace(/<(\w+)([^>]*?)>[\s\S]*?<\/\1>/g, (m, tag, attrs) => {
    if (/pointer-events-none|pointer-events\s*:\s*none/.test(attrs)
      && /select-none|user-select\s*:\s*none/.test(attrs)) return '';
    return m;
  });
  return s;
}

// HTML에서 폰트 크기 추출 (inline `font-size:Npx` + Tailwind `text-[Npx]` + `text-[N..]px`)
function extractFontSizes(html) {
  const sizes = [];
  // inline
  const inlineRe = /font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/g;
  let m;
  while ((m = inlineRe.exec(html)) !== null) sizes.push(Number(m[1]));
  // tailwind arbitrary
  const twRe = /text-\[(\d+(?:\.\d+)?)px\]/g;
  while ((m = twRe.exec(html)) !== null) sizes.push(Number(m[1]));
  return sizes;
}

// §4.8.5 검증: 모든 폰트 사이즈가 stat_label 최소(14px) 이상이어야 함
function checkMinFontSize(html, slotName, minPx, scopeHtml) {
  const sizes = extractFontSizes(scopeHtml || html);
  const failed = sizes.filter((s) => s < minPx);
  return { sizes, failed, ok: failed.length === 0 };
}

// rgba 텍스트 opacity < threshold 검출 (color: rgba(R,G,B,A))
function findLowOpacityText(html, threshold) {
  const re = /color\s*:\s*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/g;
  const found = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const a = Number(m[1]);
    if (a < threshold) found.push({ alpha: a, match: m[0] });
  }
  return found;
}

// Tailwind text-white/N (N<55) 검출
function findLowOpacityTwClasses(html, threshold) {
  // threshold=55 의미: text-white/55 미만 = text-white/0~text-white/54
  const re = /\btext-white\/(\d+)\b/g;
  const found = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = Number(m[1]);
    if (n < threshold) found.push({ class: m[0], value: n });
  }
  return found;
}

// 푸터 로고 경로 정합 — `wp-content/illustrations/snshelp-logo.webp` 또는 SNS헬프 로고 박스 패턴
function checkFooterLogo(html) {
  const findings = [];
  const hasLogoImg = /<img[^>]+snshelp-logo\.webp/i.test(html);
  const hasLogoBox = /SNS헬프|snshelp\.com/.test(html);
  if (!hasLogoImg && !hasLogoBox) {
    findings.push({ type: 'logo-missing', msg: '푸터 로고(snshelp-logo.webp 또는 SNS헬프 텍스트) 누락' });
  }
  // 로고 box 크기 ≥ 60×60
  // (a) <img class="h-[Npx]"> 패턴
  const imgHRe = /<img[^>]+snshelp-logo\.webp[^>]*class="[^"]*h-\[(\d+)px\][^"]*"/i;
  const imgM = html.match(imgHRe);
  if (imgM) {
    const h = Number(imgM[1]);
    if (h < MIN_LOGO_BOX) findings.push({ type: 'logo-box-small', msg: `로고 img 높이 ${h}px < ${MIN_LOGO_BOX}px` });
  }
  // (b) <div class="w-[60px] h-[60px]"> 패턴
  const boxRe = /w-\[(\d+)px\][^"]*h-\[(\d+)px\][^"]*rounded[\s\S]{0,200}snshelp|w-\[(\d+)px\][^"]*h-\[(\d+)px\][^"]*flex[\s\S]{0,80}font-black/i;
  const boxM = html.match(boxRe);
  if (boxM) {
    const w = Number(boxM[1] || boxM[3]);
    const h = Number(boxM[2] || boxM[4]);
    if (w < MIN_LOGO_BOX || h < MIN_LOGO_BOX) {
      findings.push({ type: 'logo-box-small', msg: `로고 박스 ${w}×${h} < ${MIN_LOGO_BOX}×${MIN_LOGO_BOX}` });
    }
  }
  return findings;
}

// HTML에서 H1 visible 텍스트 추출 (placeholder 치환 후)
function extractH1Text(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) return null;
  return m[1].replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').trim();
}

// HTML에서 카테고리 배지 텍스트 추출
function extractCategoryText(html) {
  // 가장 흔한 패턴: rounded-full 안의 마지막 <span>
  const re = /<span[^>]*class="[^"]*inline-flex[^"]*rounded-full[\s\S]*?<span[^>]*>([^<]+)<\/span>/;
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

// dummy 텍스트 검출 — HTML 주석은 제외 (템플릿 가이드용 `<!-- PLACEHOLDER: ... -->` 같은 메타)
function findDummyText(html) {
  // HTML 주석 제거
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  // class·속성 토큰의 false positive 제거: pointer-events-none / placeholder-{xxx} 같이
  // 단어 경계가 아니라 케밥/스네이크 토큰 안에 있는 'placeholder'는 dummy가 아님
  // → 좌측이 알파벳 OR '-' / 우측이 알파벳 OR '-' 이면 토큰 일부로 간주
  const found = [];
  for (const re of DUMMY_TEXT_PATTERNS) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = globalRe.exec(stripped)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const prev = stripped[start - 1] || '';
      const next = stripped[end] || '';
      // 토큰 일부 (앞·뒤가 영문/하이픈/언더스코어) — false positive
      if (/[A-Za-z0-9_-]/.test(prev) || /[A-Za-z0-9_-]/.test(next)) continue;
      found.push({ pattern: re.source, match: m[0] });
    }
  }
  return found;
}

// 금지 단어 검출
function findForbiddenWords(html) {
  const found = [];
  for (const w of FORBIDDEN_WORDS) {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    if (re.test(html)) found.push(w);
  }
  return found;
}

// ====== 렌더 + 검증 한 템플릿 ======
async function auditOne(templateKey, schemaEntry) {
  const result = {
    template: templateKey,
    file: schemaEntry.file,
    status: 'pass',
    failures: [],
    warnings: [],
    metadata: null,
  };

  const htmlPath = path.join(HERO_DIR, schemaEntry.file);
  if (!existsSync(htmlPath)) {
    result.status = 'failed:missing-html';
    result.failures.push({ type: 'missing-html', msg: `템플릿 HTML 없음: ${htmlPath}` });
    return result;
  }

  // 1. 원본 HTML 로드 + sample 치환
  const rawHtml = await readFile(htmlPath, 'utf8');
  const sample = schemaEntry.sample || {};
  const renderedHtml = applyPlaceholders(rawHtml, sample);

  // 2. unresolved placeholder
  const unresolved = findUnresolvedPlaceholders(renderedHtml);
  if (unresolved.length > 0) {
    result.failures.push({
      type: 'unresolved-placeholder',
      msg: `미치환 placeholder: ${unresolved.join(', ')}`,
    });
  }

  // 3. dummy 텍스트 / 금지 단어
  const dummy = findDummyText(renderedHtml);
  if (dummy.length > 0) {
    result.failures.push({
      type: 'dummy-text',
      msg: `더미 텍스트 ${dummy.length}건: ${dummy.map((d) => d.match).join(', ')}`,
    });
  }
  const forbid = findForbiddenWords(renderedHtml);
  if (forbid.length > 0) {
    result.failures.push({
      type: 'forbidden-word',
      msg: `금지 단어: ${forbid.join(', ')}`,
    });
  }

  // 4. AC-룰-6 텍스트 길이
  const titleText = sample.TITLE || extractH1Text(renderedHtml);
  if (titleText) {
    if (titleText.length < TEXT_LENGTH_LIMITS.title.min) {
      result.failures.push({
        type: 'title-too-short',
        msg: `제목 "${titleText}" (${titleText.length}자) < 최소 ${TEXT_LENGTH_LIMITS.title.min}자 (AC-룰-6)`,
      });
    } else if (titleText.length > TEXT_LENGTH_LIMITS.title.max) {
      result.failures.push({
        type: 'title-too-long',
        msg: `제목 "${titleText}" (${titleText.length}자) > 최대 ${TEXT_LENGTH_LIMITS.title.max}자 (AC-룰-6)`,
      });
    }
  }
  // 부제 길이 검증 — 일부 sample은 HTML 블록(SUBTITLE_BLOCK)이고 v6/v7 등은 별도 슬롯. 가능한 키 후보로 검사
  const subtitleCandidates = [
    sample.SUBTITLE_BLOCK,
    sample.SUBTITLE_BLOCK_DARK,
    sample.STAT_DESC,
    sample.QUOTE_TEXT,
    sample.PAIN_LINE,
    sample.INSIGHT_LINE,
  ].filter((v) => typeof v === 'string' && v.length > 0);
  for (const sub of subtitleCandidates) {
    // HTML 블록이면 visible 텍스트만 추출
    const visible = sub.replace(/<[^>]+>/g, '').trim();
    if (visible.length > TEXT_LENGTH_LIMITS.subtitle.max) {
      result.failures.push({
        type: 'subtitle-too-long',
        msg: `부제 "${visible.slice(0, 30)}..." (${visible.length}자) > 최대 ${TEXT_LENGTH_LIMITS.subtitle.max}자 (AC-룰-6)`,
      });
    }
  }

  // 5. §4.8.5 폰트 최소값 — 데코·워터마크 제거 후 검사
  const scanHtml = stripDecorations(renderedHtml);
  // 모든 inline font-size 추출. 14px 미만이 있으면 실패 (stat_label/logo_url_text 최소 14px)
  const allSizes = extractFontSizes(scanHtml);
  const tooSmall = allSizes.filter((s) => s < MIN_FONT_SIZES.stat_label);
  if (tooSmall.length > 0) {
    result.failures.push({
      type: 'font-too-small',
      msg: `폰트 ${tooSmall.length}건이 ${MIN_FONT_SIZES.stat_label}px 미만: ${tooSmall.join(', ')}px (§4.8.5)`,
    });
  }
  // 제목 폰트 검사 — <h1> inline font-size 또는 TITLE_FONT_SIZE
  const h1FontM = scanHtml.match(/<h1[^>]*style="[^"]*font-size\s*:\s*(\d+)px/);
  if (h1FontM) {
    const h1Px = Number(h1FontM[1]);
    if (h1Px < MIN_FONT_SIZES.title) {
      result.failures.push({
        type: 'title-font-small',
        msg: `제목 폰트 ${h1Px}px < ${MIN_FONT_SIZES.title}px (§4.8.5)`,
      });
    }
  }

  // 6. opacity < 0.55 (text-white/55 미만) 검출
  const lowOpacityRgba = findLowOpacityText(scanHtml, MIN_TEXT_OPACITY);
  if (lowOpacityRgba.length > 0) {
    result.failures.push({
      type: 'text-low-opacity',
      msg: `텍스트 opacity < ${MIN_TEXT_OPACITY} ${lowOpacityRgba.length}건 (§4.8.5)`,
    });
  }
  const lowTw = findLowOpacityTwClasses(scanHtml, 55);
  if (lowTw.length > 0) {
    result.failures.push({
      type: 'text-low-opacity-tailwind',
      msg: `text-white/N (N<55) ${lowTw.length}건: ${lowTw.map((x) => x.class).join(', ')} (§4.8.5)`,
    });
  }

  // 7. 푸터 로고 정합
  const logoFindings = checkFooterLogo(renderedHtml);
  for (const f of logoFindings) result.failures.push(f);

  // 8. 임시 HTML + webp 렌더
  await mkdir(OUT_DIR, { recursive: true });
  const tmpHtml = path.join(OUT_DIR, `${templateKey}-sample.html`);
  const tmpWebp = path.join(OUT_DIR, `${templateKey}-sample.webp`);
  await writeFile(tmpHtml, renderedHtml, 'utf8');

  // viewport: 1200×675 (schema common viewport)
  const viewportW = (schemaEntry.viewport && schemaEntry.viewport.width) || 1200;
  const viewportH = (schemaEntry.viewport && schemaEntry.viewport.height) || 675;

  try {
    execFileSync('node', [
      'script/render-infographic.mjs',
      tmpHtml,
      tmpWebp,
      `--width=${viewportW}`,
      `--max-height=${viewportH}`,
      '--quality=85',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    result.status = `failed:render-${templateKey}`;
    const stderr = (e.stderr && e.stderr.toString()) || (e.message || String(e));
    result.failures.push({ type: 'render-failed', msg: `렌더 실패: ${stderr.slice(0, 300)}` });
    return result;
  }

  // 9. webp metadata
  try {
    const meta = await sharp(tmpWebp).metadata();
    result.metadata = { width: meta.width, height: meta.height, format: meta.format };
    // 1200×675 기준 DPR=2 → 2400×1350 픽셀 출력. 폭이 2400이 아니면 경고
    const expectedW = viewportW * 2;
    if (meta.width !== expectedW) {
      result.warnings.push({
        type: 'webp-width-mismatch',
        msg: `webp 폭 ${meta.width} ≠ 예상 ${expectedW} (DPR=2)`,
      });
    }
    // 높이는 fit-trim으로 줄어들 수 있음. 다만 너무 작거나(< 80%) 너무 크면(> 100%) 경고
    const expectedH = viewportH * 2;
    if (meta.height < expectedH * 0.7) {
      result.warnings.push({
        type: 'webp-height-too-small',
        msg: `webp 높이 ${meta.height} < 예상 ${expectedH}의 70% — 콘텐츠 손실 가능`,
      });
    }
  } catch (e) {
    result.warnings.push({ type: 'metadata-failed', msg: `metadata 읽기 실패: ${e.message}` });
  }

  // 최종 status
  if (result.failures.length > 0) result.status = 'failed';
  return result;
}

// ====== 메인 ======
async function main() {
  // schema 로드
  let schema;
  try {
    schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  } catch (e) {
    err(`schema.json 로드 실패: ${e.message}`);
    process.exit(2);
  }

  const allTemplates = Object.entries(schema.templates || {});
  const targets = TARGET_TEMPLATE
    ? allTemplates.filter(([k]) => k === TARGET_TEMPLATE)
    : allTemplates;

  if (targets.length === 0) {
    err(`대상 템플릿 없음 (--template=${TARGET_TEMPLATE})`);
    process.exit(2);
  }

  log(`▶ Hero 템플릿 감사: ${targets.length}종`);

  const results = [];
  for (const [key, entry] of targets) {
    log(`  [${key}] 렌더 + §4.8.5 검증 …`);
    const r = await auditOne(key, entry);
    results.push(r);
    const tag = r.status === 'pass' ? 'PASS' : r.status.toUpperCase();
    log(`    → ${tag} (실패 ${r.failures.length} / 경고 ${r.warnings.length})`);
    for (const f of r.failures) log(`      ✗ ${f.type}: ${f.msg}`);
    for (const w of r.warnings) log(`      ⚠ ${w.type}: ${w.msg}`);
  }

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.length - passCount;

  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    pass: passCount,
    fail: failCount,
    results,
  };

  // 보고서 저장
  const ts = nowTs();
  const reportPath = OUT_PATH || path.join(OUT_DIR, `report-${ts}.json`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  // 출력
  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    log('');
    log(`▶ 요약: PASS ${passCount} / FAIL ${failCount} (총 ${results.length})`);
    log(`▶ 보고서: ${reportPath}`);
  }

  process.exit(failCount > 0 ? 2 : 0);
}

main().catch((e) => {
  err(`✗ 예외: ${e.stack || e.message}`);
  process.exit(2);
});
