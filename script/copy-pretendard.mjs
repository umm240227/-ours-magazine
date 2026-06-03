// Pretendard self-host: node_modules → public/fonts/pretendard 복사
// 빌드 전 자동 실행 (prebuild/predev). public/fonts/pretendard는 .gitignore 처리.
//
// 최적화:
//  1) dynamic-subset CSS + woff2-dynamic-subset만 복사 (legacy woff 제외)
//  2) 미사용 weight 제거: 실제 사용 weight는 400/500/600/700/800.
//     100/200/300/900은 사용처가 없어 @font-face 블록 + 해당 woff2 파일 제거.
//  3) CSS 미니파이: 공백·주석·줄바꿈 제거. cssnano 의존성 없이 dynamic-subset CSS의
//     규칙적인 패턴에 한해 안전한 텍스트 처리.
//
// 사용 weight 변경 시: USED_WEIGHTS 배열 수정 후 재빌드.
import { cp, mkdir, readFile, rm, stat, writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../node_modules/pretendard/dist/web/static');
const DEST = resolve(__dirname, '../public/fonts/pretendard');

const USED_WEIGHTS = new Set([400, 500, 600, 700, 800]);

const WEIGHT_FILE_SUFFIX = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function filterCssByWeight(css, usedWeights) {
  const headerMatch = css.match(/^\/\*[\s\S]*?\*\//);
  const header = headerMatch ? headerMatch[0] : '';
  const body = headerMatch ? css.slice(headerMatch[0].length) : css;

  const blockRe = /\/\*\s*\[\d+\]\s*\*\/\s*@font-face\s*\{[^}]*\}/g;
  const blocks = body.match(blockRe) || [];

  const kept = blocks.filter((block) => {
    const m = block.match(/font-weight:\s*(\d+)/);
    if (!m) return true;
    return usedWeights.has(Number(m[1]));
  });

  return header + '\n' + kept.join('\n') + '\n';
}

function minifyCss(css) {
  const headerMatch = css.match(/^\/\*[\s\S]*?\*\//);
  const header = headerMatch ? headerMatch[0] : '';
  let body = headerMatch ? css.slice(headerMatch[0].length) : css;

  body = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();

  return header + body + '\n';
}

async function main() {
  if (!(await exists(SRC))) {
    console.error(`[copy-pretendard] source not found: ${SRC}`);
    console.error('[copy-pretendard] run `pnpm install` first');
    process.exit(1);
  }

  const cssSrc = resolve(SRC, 'pretendard-dynamic-subset.css');
  const woff2Src = resolve(SRC, 'woff2-dynamic-subset');
  const cssDest = resolve(DEST, 'pretendard-dynamic-subset.css');
  const woff2Dest = resolve(DEST, 'woff2-dynamic-subset');

  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });

  const cssRaw = await readFile(cssSrc, 'utf8');
  const cssFiltered = filterCssByWeight(cssRaw, USED_WEIGHTS);
  const cssMinified = minifyCss(cssFiltered);
  await writeFile(cssDest, cssMinified, 'utf8');

  await cp(woff2Src, woff2Dest, { recursive: true });
  const files = await readdir(woff2Dest);
  const unusedSuffixes = Object.entries(WEIGHT_FILE_SUFFIX)
    .filter(([w]) => !USED_WEIGHTS.has(Number(w)))
    .map(([, suf]) => suf);
  let removed = 0;
  for (const f of files) {
    if (unusedSuffixes.some((suf) => f.startsWith(`Pretendard-${suf}.`))) {
      await unlink(resolve(woff2Dest, f));
      removed++;
    }
  }

  const cssRawSize = cssRaw.length;
  const cssOutSize = cssMinified.length;
  console.log(
    `[copy-pretendard] CSS: ${(cssRawSize / 1024).toFixed(1)}KB → ${(cssOutSize / 1024).toFixed(
      1,
    )}KB (-${(((cssRawSize - cssOutSize) / cssRawSize) * 100).toFixed(0)}%)`,
  );
  console.log(`[copy-pretendard] woff2: removed ${removed} unused weight files`);
  console.log(
    `[copy-pretendard] kept weights: ${[...USED_WEIGHTS].sort((a, b) => a - b).join(', ')}`,
  );
  console.log(`[copy-pretendard] done → ${DEST}`);
}

main().catch((err) => {
  console.error('[copy-pretendard] failed:', err);
  process.exit(1);
});
