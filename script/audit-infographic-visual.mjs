#!/usr/bin/env node
// 인포그래픽 HTML 정적 분석: wrap 위험, cols 부적합, 폰트/색상 결함 검출
// JP(jp-site-config §2·§6): 대상 = drafts/images/<slug>/*.html (KR wp-content/drafts/images 폐기).
//   경로는 lib/jp-paths.mjs에서 import. snshelp 로고/footer 규칙·KR 금지어 사전은 JP로 무력화/교체.
//   draft 경로가 없거나 대상 0개면 조용히 통과하지 않고 경고 + 비통과(exit 2) — false-pass 방지.
// 사용:
//   node script/audit-infographic-visual.mjs                       # 전수
//   node script/audit-infographic-visual.mjs --post=341            # 특정 글 ID
//   node script/audit-infographic-visual.mjs --json                # JSON 출력
//   node script/audit-infographic-visual.mjs --out=tmp/x.md        # 출력 경로 지정
//   node script/audit-infographic-visual.mjs --update-dictionary   # AC-에러-2: script/audit-dict/banned-phrases.json 일괄 재검증
//
// 룰: .ai-rules/asset-images.md §4.10.6 인포그래픽 텍스트 wrap 금지
//
// 차원 한계 분리 (asset-images.md §4.10.4):
// - 이 스크립트는 HTML CSS 표현(text-[NNpx], grid-cols-N) 기준 정적 분석. CSS dim만 본다.
// - 실제 산출물 webp dim 검사 안 함 — render-infographic.mjs가 DPR=2로 캡처해 2x dim webp를
//   저장하므로 실제 webp dim은 CSS dim의 2배. webp dim 기준으로 한계(2000px)를 검사하면
//   false positive 발생. CSS dim 기준 분석만 안전.

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT as JP_ROOT, DRAFTS_DIR, draftImagesDir } from './lib/jp-paths.mjs';

// JP 경로 정본(jp-site-config §2): draft 이미지 = drafts/images/<slug>/ (KR wp-content/drafts/images 폐기).
// 경로는 jp-paths에서 import — 하드코딩 금지.
const ROOT = JP_ROOT;
const DRAFT_ROOT = path.join(DRAFTS_DIR, 'images'); // = <repo>/drafts/images, jp-paths.draftImagesDir(slug)와 동일 부모

const args = process.argv.slice(2);
const postFlag = args.find((a) => a.startsWith('--post='));
const wantJson = args.includes('--json');
const outFlag = args.find((a) => a.startsWith('--out='));
const updateDictionary = args.includes('--update-dictionary'); // AC-에러-2 금지 어휘 사전 갱신 후 일괄 재검증
const onlyPost = postFlag ? postFlag.split('=')[1] : null;

// AC-에러-2: 금지 문구 사전 외부 파일 (운영자가 갱신 가능). 없으면 기본 BANNED_PHRASES 사용.
const DICT_PATH = path.join(ROOT, 'script/audit-dict/banned-phrases.json');

// 본문 인포그래픽 표준 폭 (AC-템플릿-2). 폭 600 → 1200 마이그레이션 완료.
const MAIN_WIDTH = 1200;
const CARD_PADDING = 60; // 카드 + 본문 padding 추정

const BANNED_COLORS = ['#999', '#A5C0FF', '#FFD9C2', '#B6BBC5'];
// MAIN_WIDTH 1200 기준 (AC-룰-6 / design §7.2). 폭 600 시절 56/44/36/28의 약 2배 비율.
const STAT_FONT_MAX_BY_LEN = [
  { max: 5, font: 88 },
  { max: 8, font: 64 },
  { max: 12, font: 48 },
  { max: 99, font: 40 },
];

// AC-룰-6 글자수 한계 (requirements.md §7.1)
const TEXT_LENGTH_LIMITS = {
  h1: { min: 6, max: 28 },          // 헤드라인
  h2: { min: 4, max: 20 },          // 섹션/카드 타이틀
  statValue: { min: 1, max: 8 },    // 큰 숫자 + 단위
  statLabel: { min: 4, max: 14 },   // 라벨
  cardBody: { min: 8, max: 60 },    // 카드 본문
  figcaption: { min: 12, max: 120 },// figcaption
};

// AC-룰-6 금지 어휘 사전 (requirements.md §7.2 + design §7.2).
// 단독 매칭 금지. AC-에러-2 운영자 승인 후 외부 dict 파일(script/audit-dict/banned-phrases.json) 갱신 가능.
// loadBannedPhrases()가 외부 파일 우선 + fallback 정본 반환.
//
// JP(jp-site-config §6 로케일 강제): KR 어휘(무려/혁명적/네이버 부업스팸)는 일본어 인포그래픽에서
// 절대 매칭되지 않아 false-pass를 유발한다. 따라서 기본 사전을 일본어 誇大広告(景品表示法 우려) 어휘로 교체.
// 외부 dict(script/audit-dict/banned-phrases.json)가 없고 이 기본 사전을 쓸 때는 main()에서 stderr 경고를 낸다(locale-aware).
const BANNED_PHRASES_DEFAULT_JP = [
  // 誇大 / 断定（景品表示法 優良誤認の懸念）
  '必ず', '絶対', '100%保証', '100％保証', '完全保証', '保証します',
  '誰でも稼げる', '確実に稼げる', '簡単に稼げる', '不労所得',
  // 過剰な煽り
  '驚異の', '革命的', '圧倒的', 'たった一つ', 'これだけで',
  // 副業スパム系（KR seo-policy §1.8.1 의 JP 대응）
  '放置で稼ぐ', '自動で稼ぐ', '寝ているだけで',
];
let BANNED_PHRASES = [...BANNED_PHRASES_DEFAULT_JP];

// figcaption 형식 화이트리스트 (requirements.md §7.3) — JP 로케일 동시 허용(jp-site-config §6).
// 1) "{메시지}. 출처: {기관}, {YYYY}." / "出典: {機関}, {YYYY}。" — 인포그래픽/차트
// 2) "이미지: {라이선스}" / "画像: {ライセンス}" — 사진/일러스트
// 3) "예시 이미지" / "イメージ画像" 단독 — stock
// 4) "출처: {플랫폼}, {YYYY-MM-DD 캡처}" / "出典: {…}, {YYYY-MM-DD キャプチャ}" — 스크린샷
const FIGCAPTION_PATTERNS = [
  /(출처|出典)\s*[:：]\s*[^,、]+[,、]\s*\d{4}([.년。]|年|-\d{2}-\d{2}\s*(캡처|キャプチャ))/, // 패턴 1·4 (KR/JP)
  /^(이미지|画像)\s*[:：]\s*\S+/,                            // 패턴 2 (KR/JP)
  /^(예시\s*이미지|イメージ画像)(\s*[（(][^)）]+[)）])?$/,    // 패턴 3 (KR/JP)
];

function textLengthOf(s) {
  // 보이는 글자 수 (HTML 태그 제외, 콤마/공백 포함)
  return s.replace(/<[^>]+>/g, '').trim().length;
}

export function detectStatCardWrapRisk(html) {
  const findings = [];
  // 1. grid-cols-3/4 안의 stat-value span 길이 검사
  const sectionRe = /<section[^>]*class="[^"]*grid grid-cols-(\d+)[^"]*"[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = sectionRe.exec(html)) !== null) {
    const cols = parseInt(m[1], 10);
    const inner = m[2];
    if (cols < 3) continue; // cols-1/2는 보통 안전
    // 카드 가용 폭 ≈ MAIN_WIDTH / cols - gap - padding. 폭 1200 기준 (cols=3 → 350, cols=4 → 250)
    const cardWidth = Math.floor(MAIN_WIDTH / cols) - 50;
    // 큰 폰트 stat-value 추출: text-[NNpx] font-(black|bold) 안 텍스트
    const statRe = /<span class="(?:text-\[(\d+)px\]\s+font-(?:black|bold)|num[^"]*)[^"]*"[^>]*>([^<]+)<\/span>/g;
    let sm;
    while ((sm = statRe.exec(inner)) !== null) {
      const font = sm[1] ? parseInt(sm[1], 10) : null;
      const txt = sm[2].trim();
      if (!txt || txt.length < 2) continue;
      // 폰트 크기별 글자 폭 계수 (han·digit 평균)
      const fontEffective = font ?? 32;
      if (fontEffective < 28) continue;
      // 한 글자 ≈ font * 0.55 (Pretendard semi-condensed)
      const estWidth = txt.length * fontEffective * 0.55;
      if (estWidth > cardWidth) {
        findings.push({
          type: 'stat-overflow',
          risk: fontEffective >= 40 ? 'high' : 'medium',
          msg: `grid-cols-${cols} 카드 안 stat "${txt}" (${fontEffective}px, 글자수 ${txt.length}, 추정 폭 ${Math.round(estWidth)}px > 카드 가용 ${cardWidth}px) — wrap 위험`,
        });
      }
    }
  }
  return findings;
}

export function detectNumberUnitSplit(html) {
  const findings = [];
  // grid-cols-3 이상 카드 컨테이너 안 / 카드 안에 flex items-baseline 또는 flex (nowrap 없이) + 큰 폰트 span 2개
  const gridRe = /<section[^>]*class="[^"]*grid grid-cols-(\d+)[^"]*"[^>]*>([\s\S]*?)<\/section>/g;
  let gm;
  while ((gm = gridRe.exec(html)) !== null) {
    const cols = parseInt(gm[1], 10);
    if (cols < 3) continue;
    const inner = gm[2];
    const cardWidth = Math.floor(MAIN_WIDTH / cols) - 50;
    // flex 컨테이너 매치 (items-baseline / items-center / 일반 flex)
    const flexRe = /<div[^>]*class="([^"]*\bflex\b[^"]*)"[^>]*>([\s\S]*?)<\/div>/g;
    let fm;
    while ((fm = flexRe.exec(inner)) !== null) {
      const cls = fm[1];
      if (cls.includes('flex-nowrap') || cls.includes('whitespace-nowrap')) continue;
      if (cls.includes('flex-col')) continue;
      const flexInner = fm[2];
      // 큰 폰트 span 2개 이상 (text-[NNpx] 중 28 이상)
      const bigSpans = [...flexInner.matchAll(/<span[^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*>([^<]+)<\/span>/g)]
        .filter((m) => parseInt(m[1], 10) >= 28)
        .map((m) => ({ font: parseInt(m[1], 10), text: m[2].trim() }));
      if (bigSpans.length >= 2) {
        const totalWidth = bigSpans.reduce((s, sp) => s + sp.text.length * sp.font * 0.55, 0);
        const overflow = totalWidth > cardWidth;
        const sample = bigSpans.map((s) => `"${s.text}"(${s.font}px)`).join(' + ');
        findings.push({
          type: 'number-unit-wrap',
          risk: overflow ? 'high' : 'medium',
          msg: `grid-cols-${cols} 카드 안 flex 컨테이너에 큰 폰트 span ${bigSpans.length}개 인접 ${sample} (추정 폭 ${Math.round(totalWidth)}px${overflow ? ` > 가용 ${cardWidth}px` : ''}) — flex-nowrap 미적용, wrap 위험`,
        });
      }
    }
  }
  return findings;
}

export function detectBannedColors(html) {
  const findings = [];
  for (const c of BANNED_COLORS) {
    const re = new RegExp(`(text-\\[${c.replace('#', '#')}\\]|color\\s*:\\s*${c}\\b)`, 'gi');
    const matches = html.match(re) || [];
    if (matches.length > 0) {
      findings.push({
        type: 'banned-color',
        risk: 'low',
        msg: `금지 색상 ${c} 사용 ${matches.length}회 (§4.10.1 WCAG AA 미달)`,
      });
    }
  }
  return findings;
}

export function detectHeadlineWrapRisk(html) {
  const findings = [];
  // H1 (text-[44px~72px] font-black/font-bold) 안에 <br> 없이 18자 초과 텍스트
  const h1Re = /<h1[^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*>([\s\S]*?)<\/h1>/g;
  let m;
  while ((m = h1Re.exec(html)) !== null) {
    const font = parseInt(m[1], 10);
    if (font < 40) continue;
    const inner = m[2];
    // <br>로 split
    const lines = inner.split(/<br\s*\/?>/);
    for (const line of lines) {
      const visible = line.replace(/<[^>]+>/g, '').trim();
      if (visible.length > 18) {
        findings.push({
          type: 'h1-wrap',
          risk: 'medium',
          msg: `H1 ${font}px 한 줄 "${visible}" (${visible.length}자 > 18) — <br> 추가 또는 폰트 축소 권장`,
        });
      }
    }
  }
  return findings;
}

export function detectFooterLogo(html) {
  // JP(jp-site-config §6 / C4 템플릿): footer 로고 img는 템플릿에서 제거됨.
  // → KR의 "footer 로고 누락 -3" 규칙(snshelp-logo.webp 검사 포함)을 무력화한다.
  //   footer 섹션 자체가 없거나 로고가 없어도 감점/finding 없음 (false-positive 방지).
  //   참고: 'snshelp-logo.webp' 경로 검사는 JP에서 완전 제거(brand neutral).
  return [];
}

// WCAG AA 대비비 계산 (배경 흰색 가정)
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function relLuminance([r, g, b]) {
  const sr = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sr[0] + 0.7152 * sr[1] + 0.0722 * sr[2];
}
function contrastRatio(fg, bg = '#FFFFFF') {
  const L1 = relLuminance(hexToRgb(fg));
  const L2 = relLuminance(hexToRgb(bg));
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
}

export function detectContrastAA(html) {
  const findings = [];
  // 부모 element의 어두운 배경 hex 추출 — 그 안 텍스트는 흰 배경 가정 검사 skip
  // bg-[#NNN] class 또는 style="background:#NNN" 사용 element 위치 + hex 수집
  const darkBgRanges = []; // [{start, end, bg: hex}]
  const bgRe = /<(\w+)([^>]*?)(?:class="[^"]*\bbg-\[(#[0-9A-Fa-f]{3,6})\][^"]*"|style="[^"]*background(?:-color)?:\s*(#[0-9A-Fa-f]{3,6})[^"]*")[^>]*>/g;
  let bm;
  while ((bm = bgRe.exec(html)) !== null) {
    const bg = bm[3] || bm[4];
    if (!bg) continue;
    const norm = bg.length === 4 ? '#' + bg.slice(1).split('').map((c) => c + c).join('') : bg;
    // luminance < 0.4면 어두운 배경
    const lum = relLuminance(hexToRgb(norm));
    if (lum < 0.4) {
      // 같은 태그 닫는 곳까지 범위 추정 (단순화: 시작부터 +2000자 또는 같은 태그 닫는 곳)
      const tag = bm[1];
      const closeRe = new RegExp(`</${tag}>`, 'g');
      closeRe.lastIndex = bm.index + bm[0].length;
      const closeMatch = closeRe.exec(html);
      const end = closeMatch ? closeMatch.index : bm.index + 2000;
      darkBgRanges.push({ start: bm.index, end, bg: norm });
    }
  }

  const fontRe = /text-\[(\d+)px\]/;
  const classAttrRe = /class="([^"]+)"/g;
  let cm;
  const seen = new Set();
  while ((cm = classAttrRe.exec(html)) !== null) {
    const cls = cm[1];
    const colorMatch = /text-\[(#[0-9A-Fa-f]{3,6})\]/.exec(cls);
    const fontMatch = fontRe.exec(cls);
    if (!colorMatch) continue;
    const color = colorMatch[1].length === 4 ? '#' + colorMatch[1].slice(1).split('').map((c) => c + c).join('') : colorMatch[1];
    const fontPx = fontMatch ? parseInt(fontMatch[1], 10) : 14;
    const key = `${color}-${fontPx}-${cm.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // 이 element가 어두운 배경 안에 있으면 그 배경으로 검사
    let bgContext = '#FFFFFF';
    for (const r of darkBgRanges) {
      if (cm.index >= r.start && cm.index <= r.end) {
        bgContext = r.bg;
      }
    }

    const ratio = contrastRatio(color, bgContext);
    const isLarge = fontPx >= 18 || (fontPx >= 14 && /font-(bold|black|extrabold)/.test(cls));
    const need = isLarge ? 3.0 : 4.5;
    if (ratio < need) {
      findings.push({
        type: 'contrast-aa',
        risk: ratio < need - 1.5 ? 'high' : 'medium',
        msg: `color ${color} (${fontPx}px${isLarge ? ' large' : ''}) vs 배경 ${bgContext} 대비 ${ratio.toFixed(2)}:1 < AA ${need}:1`,
      });
    }
  }
  return findings;
}

// 라인브레이크 균형: 같은 grid-cols 안 카드들의 본문 텍스트 길이 분산 검출
export function detectLineBreakBalance(html) {
  const findings = [];
  const gridRe = /<section[^>]*class="[^"]*grid grid-cols-(\d+)[^"]*"[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = gridRe.exec(html)) !== null) {
    const cols = parseInt(m[1], 10);
    if (cols < 2) continue;
    const inner = m[2];
    // 직속 자식 div 카드들 추출 (rounded-full chip 제외)
    const cards = [];
    // 카드는 rounded-[NNpx] 또는 rounded-2xl/3xl/lg/xl 같은 큰 모서리. rounded-full은 chip이라 제외
    const cardRe = /<div[^>]*class="[^"]*\b(rounded-\[\d+px\]|rounded-(?:2xl|3xl|lg|xl))[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\b(rounded-\[\d+px\]|rounded-(?:2xl|3xl|lg|xl))|<\/section>)/g;
    let cm;
    while ((cm = cardRe.exec(inner)) !== null) cards.push(cm[2]);
    if (cards.length < 2) continue;

    // 각 카드의 본문 p 태그 텍스트 길이 (제목 제외, 가장 긴 p)
    const lens = cards.map((c) => {
      const ps = [...c.matchAll(/<p[^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*>([\s\S]*?)<\/p>/g)];
      const bodies = ps.filter((pp) => parseInt(pp[1], 10) >= 12 && parseInt(pp[1], 10) <= 16);
      if (!bodies.length) return 0;
      // <br> 갯수 + 텍스트 길이로 줄 추정
      const longest = bodies.reduce((a, b) => (b[2].length > a[2].length ? b : a));
      const text = longest[2].replace(/<[^>]+>/g, '').trim();
      const brCount = (longest[2].match(/<br\s*\/?>/g) || []).length;
      return { len: text.length, brs: brCount, raw: text.slice(0, 40) };
    }).filter((x) => typeof x === 'object');

    if (lens.length < 2) continue;
    // 텍스트 길이의 max-min 차이가 평균의 40% 이상이면 균형 깨짐
    const charLens = lens.map((x) => x.len);
    const max = Math.max(...charLens);
    const min = Math.min(...charLens);
    const avg = charLens.reduce((s, n) => s + n, 0) / charLens.length;
    if (avg > 0 && (max - min) / avg > 0.4) {
      findings.push({
        type: 'line-break-balance',
        risk: 'medium',
        msg: `grid-cols-${cols} 카드 본문 텍스트 길이 불균형 (${charLens.join('/')}자, 차이 ${max - min}자) — 같은 슬롯의 카드들은 줄 수/길이를 비슷하게 맞춰야 함 (문구 단축 or 폰트 조정)`,
      });
    }
    // <br> 갯수 불일치 검출
    const brCounts = lens.map((x) => x.brs);
    const brMax = Math.max(...brCounts);
    const brMin = Math.min(...brCounts);
    if (brMax - brMin >= 2) {
      findings.push({
        type: 'line-break-balance',
        risk: 'medium',
        msg: `grid-cols-${cols} 카드 본문 <br> 줄바꿈 갯수 불일치 (${brCounts.join('/')}) — 줄 수를 통일하세요`,
      });
    }
  }
  return findings;
}

// li 줄 균형: 같은 ul 안 li 텍스트 길이 + 같은 폰트 크기 슬롯별 비교
export function detectListItemBalance(html) {
  const findings = [];
  const ulRe = /<ul[^>]*>([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = ulRe.exec(html)) !== null) {
    const inner = m[1];
    const liBlocks = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
    if (liBlocks.length < 2) continue;

    // 1) li 전체 텍스트 길이 비교 (기존 룰)
    const totalLens = liBlocks.map((b) =>
      b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length
    );
    const tMax = Math.max(...totalLens);
    const tMin = Math.min(...totalLens);
    const tAvg = totalLens.reduce((s, n) => s + n, 0) / totalLens.length;
    if (tAvg > 0 && (tMax - tMin) / tAvg > 0.5 && tMax - tMin >= 5) {
      findings.push({
        type: 'list-item-balance',
        risk: 'medium',
        msg: `ul 안 li 길이 불균형 (${totalLens.join('/')}자, 차이 ${tMax - tMin}자) — 한 li만 줄바꿈될 위험. 문구 단축 권장`,
      });
    }

    // 2) li 안 같은 폰트 크기 p/div 슬롯별 비교 (라벨, 본문 등 같은 위치 element)
    // 각 li에서 (font-size, weight) 키로 텍스트 추출
    const slotsByLi = liBlocks.map((b) => {
      const slots = {};
      // text-[NNpx] 가진 p/div/span 추출
      const tags = [...b.matchAll(/<(p|div|span)([^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)];
      for (const t of tags) {
        const fontPx = t[3];
        const bold = /font-(bold|black|extrabold)/.test(t[2]) ? 'b' : 'n';
        const key = `${fontPx}${bold}`;
        const text = t[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text && (!slots[key] || text.length > slots[key].length)) slots[key] = text;
      }
      return slots;
    });
    // 슬롯별로 li 간 길이 비교
    const allKeys = new Set();
    slotsByLi.forEach((s) => Object.keys(s).forEach((k) => allKeys.add(k)));
    for (const key of allKeys) {
      const lens = slotsByLi.map((s) => (s[key] || '').length).filter((n) => n > 0);
      if (lens.length < 2) continue;
      const max = Math.max(...lens);
      const min = Math.min(...lens);
      const avg = lens.reduce((s, n) => s + n, 0) / lens.length;
      if (avg > 0 && (max - min) / avg > 0.5 && max - min >= 5) {
        findings.push({
          type: 'list-item-slot-balance',
          risk: 'medium',
          msg: `ul 안 li의 ${key.replace(/b$/,'px bold').replace(/n$/,'px')} 슬롯 길이 불균형 (${lens.join('/')}자, 차이 ${max - min}자) — 한 li만 줄바꿈될 위험`,
        });
      }
    }
  }
  return findings;
}

// 카드 N개 vs grid-cols-N 일치 검사: N개 카드를 grid-cols-3에 넣으면 나머지가 다음 줄에 떨어짐
export function detectGridColumnMismatch(html) {
  const findings = [];
  // flex flex-wrap 금지
  const flexWrap = [...html.matchAll(/<(?:div|section)[^>]*class="[^"]*\bflex-wrap\b[^"]*"/g)];
  if (flexWrap.length > 0) {
    findings.push({
      type: 'flex-wrap-banned',
      risk: 'medium',
      msg: `flex-wrap 사용 ${flexWrap.length}회 — 카드 수가 안 맞으면 어색하게 떨어짐. grid-cols-N으로 명시할 것`,
    });
  }
  // grid-cols-N 컨테이너 안 직속 카드 수 vs N 비교
  const gridRe = /<(?:section|div)[^>]*class="[^"]*\bgrid grid-cols-(\d+)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div)>/g;
  let m;
  while ((m = gridRe.exec(html)) !== null) {
    const cols = parseInt(m[1], 10);
    const inner = m[2];
    // 직속 자식 카드 수 추정 (rounded-* 가진 div들)
    const cards = [...inner.matchAll(/<div[^>]*class="[^"]*\brounded-(?:\[\d+px\]|2xl|3xl|lg|xl)\b/g)].length;
    if (cards === 0) continue;
    // 카드 수 N과 cols 차이로 마지막 줄 카드 수 계산
    const lastRow = cards % cols;
    if (lastRow !== 0 && cards !== cols * Math.floor(cards / cols)) {
      // 마지막 줄에 일부만 (예: 4 카드를 cols-3 → 1개만 다음 줄)
      // cards > cols 인 경우만 문제
      if (cards > cols) {
        findings.push({
          type: 'grid-card-mismatch',
          risk: 'medium',
          msg: `grid-cols-${cols} 컨테이너에 카드 ${cards}개 — 마지막 줄 ${lastRow}개만 떨어짐. cols-${cards} 또는 ${Math.ceil(cards/2)}x2 형태로`,
        });
      }
    }
  }
  return findings;
}

// 로고 path 정확성 — JP(jp-site-config §6 / C4 템플릿)에서는 snshelp-logo.webp img가 제거됨.
// KR의 wp-content 상대경로(../../../illustrations/snshelp-logo.webp) 정합성 검사는 JP 경로에 존재하지 않아
// 항상 false-positive를 낸다 → 규칙 무력화(brand/path neutral). finding 없음.
export function detectLogoPath(html) {
  return [];
}

// Orphan word 검출: 텍스트 마지막 줄에 1-3자만 떨어지는 케이스
// (예: "...기록 남" + "음" — 한 글자만 다음 줄)
export function detectOrphanWord(html) {
  const findings = [];
  // 카드 폭 추정용: grid-cols-N 안 카드 또는 main 안 단독 텍스트
  // 단순화: 모든 <p class="text-[NNpx]"> 텍스트에 대해 추정
  const textRe = /<(p|div|span)([^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*)>([^<]+)<\/\1>/g;
  // grid-cols 컨테이너 추출하여 카드 폭 계산
  const gridCtx = []; // [{start, end, cols}]
  const gridRe = /<(?:section|div)[^>]*class="[^"]*\bgrid grid-cols-(\d+)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div)>/g;
  let gm;
  while ((gm = gridRe.exec(html)) !== null) {
    gridCtx.push({ start: gm.index, end: gm.index + gm[0].length, cols: parseInt(gm[1], 10) });
  }
  // main 폭 (전체 MAIN_WIDTH=1200) 또는 grid-cols-N 안 카드 폭 (1200/N - padding)
  // MAIN_WIDTH / CARD_PADDING은 모듈 top-level 상수 사용 (AC-템플릿-2 폭 1200 마이그레이션)
  const PADDING = CARD_PADDING;

  let m;
  while ((m = textRe.exec(html)) !== null) {
    const fontPx = parseInt(m[3], 10);
    if (fontPx < 12) continue;
    const text = m[4].trim();
    if (text.length < 15) continue; // 짧은 텍스트는 한 줄 들어감

    // 부모 grid 찾기 (보수적: 추가 10% 마진 — 실제 카드 padding/border 더 있을 수 있음)
    let cardWidth = (MAIN_WIDTH - PADDING) * 0.9;
    for (const ctx of gridCtx) {
      if (m.index >= ctx.start && m.index <= ctx.end) {
        cardWidth = (Math.floor(MAIN_WIDTH / ctx.cols) - PADDING) * 0.9;
        break;
      }
    }
    // 글자 폭 추정 (보수적: 한글 1.0, ASCII 0.55 — Pretendard 실제값 근사)
    const koCount = (text.match(/[가-힣]/g) || []).length;
    const asciiCount = text.length - koCount;
    const totalWidth = koCount * fontPx * 1.0 + asciiCount * fontPx * 0.55;
    if (totalWidth <= cardWidth) continue; // 한 줄에 들어감

    // 여러 줄. 마지막 줄에 몇 글자 들어가는지 추정
    const lines = Math.ceil(totalWidth / cardWidth);
    const usedWidth = (lines - 1) * cardWidth;
    const remainingWidth = totalWidth - usedWidth;
    const remainingChars = Math.round(remainingWidth / (fontPx * 0.85)); // 혼합 평균
    // 마지막 줄이 1-7자면 orphan
    if (remainingChars >= 1 && remainingChars <= 7) {
      findings.push({
        type: 'orphan-word',
        risk: remainingChars <= 4 ? 'high' : 'medium',
        msg: `"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}" (${text.length}자, ${fontPx}px) — 마지막 줄 ${remainingChars}자만 떨어짐. 단축 또는 늘려서 균형 잡을 것`,
      });
    }
  }
  return findings;
}

// asset-images.md §4.8.5 모바일 가독성 정본 검증
// hero 템플릿(`w-[1200px] h-[675px]`)만 대상. body 인포그래픽(w-[600px])은 제외.
export function detectMobileReadability(html) {
  const findings = [];
  if (!/w-\[1200px\][\s\S]{0,30}h-\[675px\]/.test(html)) return findings;

  // FP 회피: 데코 이니셜용 거대 폰트(font-size > 200px) 또는 pointer-events:none + select-none 속성은
  //         가독 대상이 아닌 워터마크/데코이므로 검사 대상에서 제외.
  // 검사용 html에서 데코 element 본문을 제거한 후 검사.
  // 패턴: <div ... pointer-events-none ... font-size:NNNpx> ... </div> (NNN > 200)
  // 패턴: <div ... select-none ... pointer-events-none ...> ... </div>
  let scanHtml = html;
  // (a) inline font-size > 200px 인 element 통째로 제거
  scanHtml = scanHtml.replace(/<(\w+)([^>]*)(font-size:\s*([0-9]+)px)([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, pre, fontDecl, sizeStr, post, body) => {
    return Number(sizeStr) > 200 ? '' : m;
  });
  // (b) pointer-events-none + select-none 둘 다 가진 element 통째로 제거 (데코 워터마크 표시)
  scanHtml = scanHtml.replace(/<(\w+)([^>]*?)>[\s\S]*?<\/\1>/g, (m, tag, attrs) => {
    if (/pointer-events-none|pointer-events\s*:\s*none/.test(attrs) && /select-none|user-select\s*:\s*none/.test(attrs)) return '';
    return m;
  });

  // 1) 글자 색상에 알파 사용 검출 — color: rgba(R,G,B,X) 모두 차단
  // 룰: .ai-rules/infographic-html.md §3 "글자 색상에 알파 사용 금지"
  const textAlphaColor = scanHtml.match(/color:\s*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[0-9.]+\s*\)/g) || [];
  if (textAlphaColor.length > 0) {
    findings.push({
      type: 'text-alpha-banned',
      risk: 'high',
      msg: `글자 color에 알파 사용 ${textAlphaColor.length}건 — 가독성 파괴. 명시 hex 또는 alpha 없는 rgb()로 변경`,
    });
  }

  // 2) Tailwind text-white/N, text-black/N 차단 (N 무관)
  const twWhiteAlpha = scanHtml.match(/\btext-white\/\d+\b/g) || [];
  const twBlackAlpha = scanHtml.match(/\btext-black\/\d+\b/g) || [];
  if (twWhiteAlpha.length + twBlackAlpha.length > 0) {
    findings.push({
      type: 'text-alpha-banned',
      risk: 'high',
      msg: `Tailwind text-white/N · text-black/N ${twWhiteAlpha.length + twBlackAlpha.length}건 — 글자 알파 금지. text-white/text-black 사용`,
    });
  }

  // 3) 텍스트 요소의 opacity-60~90 클래스 차단 (opacity-10|15|20은 장식 워터마크 허용)
  const opacityTextClass = scanHtml.match(/\bopacity-(?:60|70|80|90)\b/g) || [];
  if (opacityTextClass.length > 0) {
    findings.push({
      type: 'text-alpha-banned',
      risk: 'high',
      msg: `opacity-60|70|80|90 클래스 ${opacityTextClass.length}건 — 텍스트 알파 금지. 클래스에서 토큰 제거`,
    });
  }

  // 4) <p> 또는 subtitle 영역에서 font-light 또는 weight 300/400
  const lightWeight = scanHtml.match(/font-(?:thin|light|normal)\b/g) || [];
  const inlineLightWeight = scanHtml.match(/font-weight\s*:\s*[1-4]00/g) || [];
  if (lightWeight.length + inlineLightWeight.length > 0) {
    findings.push({
      type: 'mobile-light-weight',
      risk: 'medium',
      msg: `font-weight ≤ 400 텍스트 발견 (font-light/font-normal/inline 400) — 모바일 LCD 가독 저하. font-semibold(600)+ 권장`,
    });
  }

  return findings;
}

// AC-룰-6 글자수 한계 검증 (requirements.md §7.1)
// - H1 6-28자, H2 4-20자, stat-value ≤ 8자, label 4-14자, card body ≤ 60자
// - figcaption은 detectFigcaptionFormat에서 별도 처리
export function detectTextLengthExceeded(html) {
  const findings = [];

  // H1 검사
  const h1Re = /<h1[^>]*>([\s\S]*?)<\/h1>/g;
  let hm;
  while ((hm = h1Re.exec(html)) !== null) {
    // <br>로 split 후 각 라인 visible 텍스트 길이의 합산
    const visible = hm[1].replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').trim();
    if (!visible) continue;
    if (visible.length < TEXT_LENGTH_LIMITS.h1.min) {
      findings.push({
        type: 'text-length-h1-short',
        risk: 'medium',
        msg: `H1 "${visible}" (${visible.length}자) < 최소 ${TEXT_LENGTH_LIMITS.h1.min}자 (AC-룰-6 §7.1)`,
      });
    } else if (visible.length > TEXT_LENGTH_LIMITS.h1.max) {
      findings.push({
        type: 'text-length-h1-long',
        risk: 'high',
        msg: `H1 "${visible}" (${visible.length}자) > 최대 ${TEXT_LENGTH_LIMITS.h1.max}자 (AC-룰-6 §7.1)`,
      });
    }
  }

  // H2 검사
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/g;
  let h2m;
  while ((h2m = h2Re.exec(html)) !== null) {
    const visible = h2m[1].replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').trim();
    if (!visible) continue;
    if (visible.length < TEXT_LENGTH_LIMITS.h2.min) {
      findings.push({
        type: 'text-length-h2-short',
        risk: 'medium',
        msg: `H2 "${visible}" (${visible.length}자) < 최소 ${TEXT_LENGTH_LIMITS.h2.min}자 (AC-룰-6 §7.1)`,
      });
    } else if (visible.length > TEXT_LENGTH_LIMITS.h2.max) {
      findings.push({
        type: 'text-length-h2-long',
        risk: 'medium',
        msg: `H2 "${visible}" (${visible.length}자) > 최대 ${TEXT_LENGTH_LIMITS.h2.max}자 (AC-룰-6 §7.1)`,
      });
    }
  }

  // stat-value 검사 — text-[NNpx] font-(black|bold) 큰 폰트(≥ 40px) 또는 .num 클래스
  const statRe = /<span[^>]*class="[^"]*(?:text-\[(\d+)px\][^"]*font-(?:black|bold)|\bnum\b)[^"]*"[^>]*>([^<]+)<\/span>/g;
  let sm;
  while ((sm = statRe.exec(html)) !== null) {
    const fontPx = sm[1] ? parseInt(sm[1], 10) : 40;
    if (fontPx < 40) continue; // 작은 폰트는 stat-value 아님
    const txt = sm[2].trim();
    if (!txt) continue;
    if (txt.length > TEXT_LENGTH_LIMITS.statValue.max) {
      findings.push({
        type: 'text-length-stat-value',
        risk: 'high',
        msg: `stat-value "${txt}" (${txt.length}자, ${fontPx}px) > 최대 ${TEXT_LENGTH_LIMITS.statValue.max}자 (AC-룰-6 §7.1)`,
      });
    }
  }

  // 카드 본문 텍스트 (text-[12-26px] p 태그)
  const bodyRe = /<p[^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let bm;
  while ((bm = bodyRe.exec(html)) !== null) {
    const fontPx = parseInt(bm[1], 10);
    if (fontPx < 12 || fontPx > 26) continue; // 카드 본문 범위
    const visible = bm[2].replace(/<[^>]+>/g, '').trim();
    if (!visible) continue;
    if (visible.length > TEXT_LENGTH_LIMITS.cardBody.max) {
      findings.push({
        type: 'text-length-card-body',
        risk: 'medium',
        msg: `카드 본문 "${visible.slice(0, 40)}${visible.length > 40 ? '...' : ''}" (${visible.length}자, ${fontPx}px) > 최대 ${TEXT_LENGTH_LIMITS.cardBody.max}자 (AC-룰-6 §7.1)`,
      });
    }
  }

  return findings;
}

// AC-룰-6 금지 어휘 사전 매칭 (requirements.md §7.2 / design §7.2)
// - 단독 매칭 검출 시 risk:high. AC-에러-2 절차로 사전 갱신 가능.
export function detectBannedPhrases(html) {
  const findings = [];
  // HTML 태그 제거 후 본문 텍스트만 검사 (alt 속성도 매칭되도록 별도로 따로 검사)
  const visibleText = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  for (const phrase of BANNED_PHRASES) {
    // 정확 매칭 (word boundary 한국어 환경에서는 substring 체크가 안전)
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const matches = visibleText.match(re);
    if (matches && matches.length > 0) {
      findings.push({
        type: 'banned-phrase',
        risk: 'high',
        msg: `금지 어휘 "${phrase}" ${matches.length}회 — AC-룰-6 §7.2 사전 매칭. 운영자 승인 후 --update-dictionary로 사전 갱신 가능 (AC-에러-2)`,
      });
    }
  }
  return findings;
}

// figcaption 형식 검사 (requirements.md §7.3 / seo-policy §9.3.7)
// - 길이 12-120자
// - 출처 인용 시 "출처: {기관}, {YYYY}" 또는 "이미지: {라이선스}" 또는 "예시 이미지" 패턴
export function detectFigcaptionFormat(html) {
  const findings = [];
  const figcapRe = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/g;
  let m;
  while ((m = figcapRe.exec(html)) !== null) {
    const visible = m[1].replace(/<[^>]+>/g, '').trim();
    if (!visible) {
      findings.push({
        type: 'figcaption-empty',
        risk: 'medium',
        msg: 'figcaption이 비어 있음 (AC-룰-6 §7.3)',
      });
      continue;
    }
    // 길이 검사
    if (visible.length < TEXT_LENGTH_LIMITS.figcaption.min) {
      findings.push({
        type: 'figcaption-too-short',
        risk: 'medium',
        msg: `figcaption "${visible}" (${visible.length}자) < 최소 ${TEXT_LENGTH_LIMITS.figcaption.min}자 (AC-룰-6 §7.1)`,
      });
    } else if (visible.length > TEXT_LENGTH_LIMITS.figcaption.max) {
      findings.push({
        type: 'figcaption-too-long',
        risk: 'medium',
        msg: `figcaption "${visible.slice(0, 60)}..." (${visible.length}자) > 최대 ${TEXT_LENGTH_LIMITS.figcaption.max}자 (AC-룰-6 §7.1)`,
      });
    }

    // 형식 검사: 출처/자료/연도/통계 같은 인용 시그널이 있으면 화이트리스트 패턴 일치해야 함 (KR/JP 로케일)
    const hasCitationSignal = /(출처\s*[:：]|자료\s*[:：]|이미지\s*[:：]|예시\s*이미지|出典\s*[:：]|資料\s*[:：]|画像\s*[:：]|イメージ画像|\b\d{4}\b)/.test(visible);
    if (hasCitationSignal) {
      const matched = FIGCAPTION_PATTERNS.some((pat) => pat.test(visible));
      if (!matched) {
        findings.push({
          type: 'figcaption-format-violation',
          risk: 'medium',
          msg: `figcaption "${visible.slice(0, 60)}..." 출처/연도 인용이 형식 위반 — "出典: {機関}, {YYYY}。" / "画像: {ライセンス}" / "イメージ画像" (KR: 출처/이미지/예시 이미지) 중 하나 (AC-룰-6 §7.3 / seo-policy §9.3.7)`,
        });
      }
    }
  }
  return findings;
}

// §4.3.1 가변 높이 — main에 h-[Npx] 고정 + mt-auto 푸터 검출 시 빈 여백 위험
export function detectMainFixedHeightBlankRisk(html) {
  const findings = [];
  const mainMatch = html.match(/<main[^>]*class="([^"]*)"[^>]*>/);
  if (!mainMatch) return findings;
  const cls = mainMatch[1];
  const hMatch = cls.match(/\bh-\[(\d+)px\]/);
  const hasMtAuto = /\bmt-auto\b/.test(html);
  const hasFlexCol = /\bflex-col\b/.test(cls);
  if (hMatch && hasMtAuto && hasFlexCol) {
    findings.push({
      type: 'main-fixed-height-blank-risk',
      risk: 'high',
      msg: `main에 h-[${hMatch[1]}px] 고정 + mt-auto 푸터 패턴 — 콘텐츠가 짧으면 빈 여백 발생 (정본 §4.3.1 가변 높이 위반)`,
    });
  }
  // 본문 인포 폭 1200 정본 — 1024 등 옛 폭 검출
  const wMatch = cls.match(/\bw-\[(\d+)px\]/);
  if (wMatch) {
    const w = parseInt(wMatch[1], 10);
    if (w !== 1200) {
      findings.push({
        type: 'main-non-standard-width',
        risk: 'medium',
        msg: `main 폭 ${w}px — 본문 인포 정본 1200px (Hero는 1200x675 별도). 정본 §4.3.1`,
      });
    }
  }
  return findings;
}

// §4.3.2 폰트 — 글마다 개별 조정 (고정 floor 강제 아님).
// 폰트 크기는 글의 텍스트 양에 따라 다르다. floor 미달을 hard 감점하면 긴 텍스트를
// 44px로 강제해 줄바꿈·잘림이 난다(사고 근본 원인). 따라서 "극단적으로 작아 모바일에서
// 안 읽힘"만 low 경고로 남기고, 단순 floor 미달은 risk를 찍지 않는다.
// 최종 판정은 AI multimodal Read (infographic-html.md §4.0.1 5번).
export function detectFontBelowMobileFloor(html) {
  const findings = [];
  // 모바일 환산이 ~10px 미만(= 인포 폭 1200 기준 약 28px 미만)일 때만 "안 읽힘" 경고.
  // 그 이상은 글마다 조정 허용이므로 통과.
  const HARD_MIN = 28; // 이 미만이면 모바일에서 거의 안 읽힘 — low 경고만
  const tagRe = /<(li|p|h3)[^>]*class="[^"]*text-\[(\d+)px\][^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const fontPx = parseInt(m[2], 10);
    if (fontPx >= HARD_MIN) continue; // 글마다 조정 허용 범위 — 통과
    const visible = m[3].replace(/<[^>]+>/g, '').trim().slice(0, 30);
    findings.push({
      type: 'font-too-small-mobile',
      risk: 'low',
      msg: `<${m[1]}> 폰트 ${fontPx}px — 모바일에서 너무 작아 안 읽힐 수 있음 "${visible}" (참고 경고. 정보 과밀이면 폰트보다 정보량을 줄일 것 — §4.3.2). 최종 판정은 AI 시각 확인.`,
    });
  }
  return findings;
}

// §4.4 차트 데이터 명시 — donut/pie SVG 안에 % 텍스트 없으면 위반
export function detectChartDonutPercentMissing(html) {
  const findings = [];
  // SVG circle stroke-dasharray로 그린 도넛 검출
  const svgRe = /<svg[^>]*>([\s\S]*?)<\/svg>/g;
  let m;
  while ((m = svgRe.exec(html)) !== null) {
    const svg = m[0];
    // 도넛 패턴: circle + stroke-dasharray (segment 표시)
    const hasDonut = /<circle\b[^>]*\bstroke-dasharray=/.test(svg);
    if (!hasDonut) continue;
    // 같은 svg 또는 상위 .relative absolute inset-0 형태로 % 텍스트가 있는지
    // SVG 다음에 등장하는 .absolute inset-0 div 안 텍스트 검사 (한 svg 단위로 후방 200자 매칭)
    const after = html.slice(svgRe.lastIndex, svgRe.lastIndex + 800);
    const before = html.slice(Math.max(0, m.index - 200), m.index);
    const context = before + svg + after;
    if (!/%/.test(context)) {
      findings.push({
        type: 'chart-donut-percent-missing',
        risk: 'high',
        msg: `도넛 SVG 검출되었지만 인접 영역에 % 수치 텍스트 없음 — segment 비율 표기 누락 (정본 §4.4)`,
      });
    }
  }
  return findings;
}

export function auditHtml(html) {
  return [
    ...detectStatCardWrapRisk(html),
    ...detectNumberUnitSplit(html),
    ...detectHeadlineWrapRisk(html),
    ...detectBannedColors(html),
    ...detectContrastAA(html),
    ...detectLineBreakBalance(html),
    ...detectListItemBalance(html),
    ...detectGridColumnMismatch(html),
    ...detectLogoPath(html),
    ...detectOrphanWord(html),
    ...detectFooterLogo(html),
    ...detectMobileReadability(html),
    ...detectTextLengthExceeded(html),
    ...detectBannedPhrases(html),
    ...detectFigcaptionFormat(html),
    ...detectMainFixedHeightBlankRisk(html),
    ...detectFontBelowMobileFloor(html),
    ...detectChartDonutPercentMissing(html),
  ];
}

export function riskLevel(findings) {
  if (findings.some((f) => f.risk === 'high')) return 'high';
  if (findings.some((f) => f.risk === 'medium')) return 'medium';
  if (findings.length > 0) return 'low';
  return 'ok';
}

async function findHtmlFiles() {
  const out = [];
  let entries;
  try {
    entries = await readdir(DRAFT_ROOT, { withFileTypes: true });
  } catch (e) {
    // false-pass 제거(핵심): draft 이미지 루트가 없으면 조용히 빈 배열을 반환하지 않는다.
    // 호출부(main)가 missing 플래그를 보고 경고 + 비통과 처리하도록 신호한다.
    out.missing = true;
    out.missingReason = e.code === 'ENOENT' ? 'ENOENT (경로 부재)' : (e.code || e.message);
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(DRAFT_ROOT, e.name);
    let subFiles;
    try {
      subFiles = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of subFiles) {
      if (!f.endsWith('.html')) continue;
      const fp = path.join(dir, f);
      // post ID 추출: post-NNN-slug 또는 폴더명에서 첫 숫자
      let postId = null;
      const m = e.name.match(/^post-(\d+)-/) || e.name.match(/-(\d+)$/) || e.name.match(/^(\d+)-/);
      if (m) postId = m[1];
      out.push({ folder: e.name, file: f, fullPath: fp, postId });
    }
  }
  return out;
}

// AC-에러-2: 금지 어휘 사전 외부 파일 로드. 없으면 JP 기본값(BANNED_PHRASES_DEFAULT_JP) 유지.
async function loadBannedPhrasesDict() {
  try {
    const raw = await readFile(DICT_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      BANNED_PHRASES = parsed.filter((s) => typeof s === 'string' && s.trim().length > 0);
      return { loaded: true, count: BANNED_PHRASES.length, path: DICT_PATH };
    }
    if (parsed && Array.isArray(parsed.phrases)) {
      BANNED_PHRASES = parsed.phrases.filter((s) => typeof s === 'string' && s.trim().length > 0);
      return { loaded: true, count: BANNED_PHRASES.length, path: DICT_PATH };
    }
    return { loaded: false, reason: 'invalid format (expected array or {phrases:[]})', path: DICT_PATH };
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { loaded: false, reason: 'not found (using JP default dict)', path: DICT_PATH };
    }
    return { loaded: false, reason: e.message, path: DICT_PATH };
  }
}

async function main() {
  // AC-에러-2: 금지 어휘 사전 로드 (--update-dictionary면 외부 파일 일괄 재검증)
  const dictStatus = await loadBannedPhrasesDict();
  // locale-aware: 외부 dict가 없으면 JP 기본 사전을 쓴다는 사실을 항상 stderr로 알린다(조용한 KR/locale 미스 방지).
  if (!dictStatus.loaded) {
    process.stderr.write(
      `[audit-infographic-visual] 금지어 사전 미로드 (${dictStatus.reason}) — JP 기본 사전(誇大広告 ${BANNED_PHRASES_DEFAULT_JP.length}개)으로 검사. ` +
      `운영자 갱신: ${path.relative(ROOT, DICT_PATH)} (배열 또는 {phrases:[]}).\n`
    );
  }
  if (updateDictionary) {
    process.stderr.write(`[--update-dictionary] 사전 ${dictStatus.loaded ? `로드 성공 (${dictStatus.count}개, ${dictStatus.path})` : `로드 실패: ${dictStatus.reason}. JP 기본 사전(${BANNED_PHRASES_DEFAULT_JP.length}개)으로 재검증.`}\n`);
  }

  const files = await findHtmlFiles();

  // false-pass 제거(핵심): draft 이미지 경로 부재 = "감사 0개 조용한 통과" 금지.
  // 명확한 stderr 경고 + 비통과(exit 2). JSON 모드도 동일하게 missing 상태를 표시.
  if (files.missing) {
    process.stderr.write(
      `[audit-infographic-visual] draft images 경로 없음: ${path.relative(ROOT, DRAFT_ROOT)} (${files.missingReason}). ` +
      `감사 대상 0개 — 이는 통과가 아님(false-pass 방지). drafts/images/<slug>/ 생성 후 재실행.\n`
    );
    if (wantJson) {
      process.stdout.write(JSON.stringify({ status: 'no-draft-images-dir', path: path.relative(ROOT, DRAFT_ROOT), reason: files.missingReason, audited: 0, pass: false }, null, 2) + '\n');
    } else {
      process.stdout.write(`# 인포그래픽 시각 감사 리포트\n\n- draft images 경로 없음(${path.relative(ROOT, DRAFT_ROOT)}) — 감사 대상 0개. **NOT A PASS** (false-pass 방지).\n`);
    }
    process.exit(2);
  }

  const results = [];
  for (const f of files) {
    // --post 매칭: 숫자 postId(KR) 또는 slug 폴더명(JP) 둘 다 허용
    if (onlyPost && f.postId !== onlyPost && f.folder !== onlyPost) continue;
    let html;
    try {
      html = await readFile(f.fullPath, 'utf-8');
    } catch (e) {
      results.push({ ...f, error: e.message, risk: 'error', findings: [] });
      continue;
    }
    const findings = auditHtml(html);
    const risk = riskLevel(findings);
    results.push({ ...f, risk, findings });
  }

  // false-pass 제거(핵심): 디렉터리는 있으나 감사 대상 HTML 0개 = 조용한 통과 금지.
  // (drafts/images 비었거나, --post=<slug> 매칭 0개) → 경고 + 비통과.
  if (results.length === 0) {
    const scope = onlyPost ? `--post=${onlyPost} 매칭 인포그래픽 HTML 0개` : `${path.relative(ROOT, DRAFT_ROOT)} 안 인포그래픽 HTML 0개`;
    process.stderr.write(
      `[audit-infographic-visual] 감사 대상 0개 (${scope}). 이는 통과가 아님(false-pass 방지). ` +
      `drafts/images/<slug>/ 에 인포그래픽 .html 이 있는지 확인.\n`
    );
    if (wantJson) {
      process.stdout.write(JSON.stringify({ status: 'no-target-html', scope, audited: 0, pass: false }, null, 2) + '\n');
    } else {
      process.stdout.write(`# 인포그래픽 시각 감사 리포트\n\n- ${scope} — 감사 대상 0개. **NOT A PASS** (false-pass 방지).\n`);
    }
    process.exit(2);
  }

  // 정렬: high → medium → low → ok
  const order = { high: 0, medium: 1, low: 2, ok: 3, error: 4 };
  results.sort((a, b) => (order[a.risk] - order[b.risk]) || a.folder.localeCompare(b.folder));

  if (wantJson) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    return;
  }

  const high = results.filter((r) => r.risk === 'high');
  const medium = results.filter((r) => r.risk === 'medium');
  const low = results.filter((r) => r.risk === 'low');
  const ok = results.filter((r) => r.risk === 'ok');
  const errors = results.filter((r) => r.risk === 'error');

  const lines = [];
  lines.push(`# 인포그래픽 시각 감사 리포트`);
  lines.push(``);
  lines.push(`- 감사 파일 ${results.length}개`);
  lines.push(`- **high** ${high.length} / medium ${medium.length} / low ${low.length} / ok ${ok.length}${errors.length ? ` / error ${errors.length}` : ''}`);
  lines.push(``);

  for (const sec of [['high', high], ['medium', medium], ['low', low]]) {
    const [label, items] = sec;
    if (items.length === 0) continue;
    lines.push(`## ${label.toUpperCase()} (${items.length})`);
    lines.push(``);
    for (const r of items) {
      lines.push(`### ${r.folder}/${r.file}${r.postId ? ` (post ${r.postId})` : ''}`);
      for (const f of r.findings) {
        lines.push(`- **[${f.risk}]** ${f.type} — ${f.msg}`);
      }
      lines.push(``);
    }
  }

  if (errors.length) {
    lines.push(`## ERROR (${errors.length})`);
    for (const r of errors) lines.push(`- ${r.folder}/${r.file}: ${r.error}`);
    lines.push(``);
  }

  const out = lines.join('\n');
  if (outFlag) {
    const target = outFlag.split('=')[1];
    await writeFile(path.resolve(ROOT, target), out, 'utf-8');
    console.log(`리포트 저장: ${target}`);
  } else {
    process.stdout.write(out);
  }

  // exit 1 if any high risk (for CI / gate)
  if (high.length > 0) process.exit(1);
}

// 직접 실행 시에만 main() 호출. import해서 함수 재사용하는 경우(예: audit-infographic-templates.mjs)는 실행 안 함.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
