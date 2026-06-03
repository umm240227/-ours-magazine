#!/usr/bin/env node
// HTML 인포그래픽을 Chrome headless로 캡처 후 WebP 자동 변환.
// asset-images.md §2.2-1 (PNG/JPG 금지, WebP 정본) + §4.10.4 (차원 한계 ≤2000) 준수.
//
// 동작: Chrome에서 최대 max-height까지 캡처 → sharp로 하단 배경색 영역 자동 trim →
//       콘텐츠 fit 높이로 잘라 WebP 저장. 결과 한 변이 2000을 넘으면 에러.
//
// 사용:
//   node script/render-infographic.mjs <input.html> <output.webp> [--width=1200] [--max-height=2000] [--quality=85] [--bg=#F6F8FB] [--bottom-padding=32]
// 예:
//   node script/render-infographic.mjs \
//     wp-content/drafts/images/{slug}/infographic.html \
//     wp-content/drafts/images/{slug}/infographic.webp

import { execFileSync } from 'node:child_process';
import { statSync, unlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// === 진입점 lock 게이트 자식 우회 ===
if (process.env.BLOG_IMG_QUALITY_INSIDE_RUN !== '1') {
// === 진입점 lock 게이트 (영구 안전망 — wordpress-integration.md §3.1) ===
// .claude/scheduled_tasks.lock 또는 tmp/*/blog-image-quality-100/.lock 존재 시 exit 75.
// Claude Code /schedule routine 또는 1회성 마이그레이션 작업과의 동시 실행 차단.
{
  const fs = await import('node:fs');
  const locksToCheck = [
    '.claude/scheduled_tasks.lock',
    'tmp/blog-image-quality-100/.lock',
  ];
  for (const lockPath of locksToCheck) {
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, 'utf8').trim();
        // PID 추출: JSON 형식 ({"sessionId":"...","pid":N,...}) 우선 시도 → 정규식 fallback.
        // .claude/scheduled_tasks.lock은 JSON, tmp/*/.lock은 plain PID 텍스트 형식 사용.
        let pid = null;
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.pid === 'number') {
            pid = parsed.pid;
          }
        } catch { /* JSON 아님 — 정규식 fallback */ }
        if (pid === null) {
          const pidMatch = content.match(/^(\d+)/);
          if (pidMatch) pid = Number(pidMatch[1]);
        }
        if (pid !== null) {
          try {
            process.kill(pid, 0); // 살아있으면 차단
            console.error(`[lock-gate] ${lockPath} 활성 (PID ${pid}). 동시 실행 차단.`);
            process.exit(75); // EX_TEMPFAIL
          } catch (e) {
            if (e.code !== 'ESRCH') {
              console.error(`[lock-gate] ${lockPath} 확인 실패: ${e.message}`);
              process.exit(75);
            }
            // ESRCH: 좀비 lock — 무시하고 진입
          }
        } else {
          // PID 정보 없는 lock — 보수적으로 차단
          console.error(`[lock-gate] ${lockPath} PID 정보 없음. 보수적 차단.`);
          process.exit(75);
        }
      } catch (e) {
        console.error(`[lock-gate] ${lockPath} 읽기 실패: ${e.message}`);
        process.exit(75);
      }
    }
  }
}
} // === end lock-gate (BLOG_IMG_QUALITY_INSIDE_RUN 우회) ===

const CHROME = process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const opts = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('='))
);

const [inputHtml, outputFile] = positional;
if (!inputHtml || !outputFile) {
  console.error('사용: render-infographic.mjs <input.html> <output.webp> [--width=1200] [--height=2800] [--quality=85]');
  process.exit(1);
}

// 본문 인포그래픽 정본 폭 1200px (asset-images.md §4.10.1). DPR=2 캡처 → 2400×N webp.
// webp 실제 dim = width × DPR × height × DPR. CSS dim ≤ 2000 한도(§4.10.4)는 input width(=1200)에만 적용.
const width = Number(opts.width || 1200);
// max-height: Chrome 캡처 시 최대 잡는 캔버스 높이. 콘텐츠가 짧으면 그보다 작게 자동 trim됨.
// height(legacy)도 호환 — 동일하게 max-height로 해석.
const maxHeight = Number(opts['max-height'] || opts.height || 2000);
const quality = Number(opts.quality || 85);
// HTML 파일에서 <body> 배경색 자동 감지 (--bg 미지정 시 사용)
function detectBodyBg(htmlPath) {
  try {
    const html = readFileSync(htmlPath, 'utf8');
    // 인라인 스타일: <body style="...background:#RRGGBB...">
    const inline = html.match(/<body[^>]*style="[^"]*background:\s*(#[0-9a-fA-F]{6})/);
    if (inline) return inline[1];
    // CSS 블록: body { background: #RRGGBB }
    const css = html.match(/body\s*\{[^}]*background\s*:\s*(#[0-9a-fA-F]{6})/);
    if (css) return css[1];
  } catch { /* 읽기 실패 시 기본값 사용 */ }
  return null;
}

const bgColor = opts.bg || detectBodyBg(inputHtml) || '#F6F8FB'; // body bg, 자동 trim 기준
const bottomPadding = Number(opts['bottom-padding'] || 32); // trim 후 하단에 남길 여백

// asset-images.md §4.10.4 — Claude Read 차원 한계(2000px) 회피
const MAX_DIMENSION = 2000;
if (width > MAX_DIMENSION || maxHeight > MAX_DIMENSION) {
  console.error(
    `✗ 차원 한계 초과: width=${width}, max-height=${maxHeight}. 한 변이 ${MAX_DIMENSION}px를 넘으면 Claude Read 도구가 실패해 세션이 죽음.`,
  );
  process.exit(1);
}

// '#RRGGBB' → {r,g,b}
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bg 색상 형식 오류: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

const inputAbs = path.resolve(inputHtml);
const outputAbs = path.resolve(outputFile);
// 중간 단계 PNG (Chrome은 PNG로만 캡처 가능)
const tmpPng = outputAbs.replace(/\.(webp|png)$/, '') + '.__tmp.png';

try {
  statSync(inputAbs);
} catch {
  console.error(`✗ 입력 파일 없음: ${inputAbs}`);
  process.exit(1);
}

console.log(`▶ Chrome headless 렌더: ${inputHtml}`);
console.log(`  캡처 캔버스: ${width}×${maxHeight} (max-height, 실제 출력은 콘텐츠에 맞게 trim)`);

// 2배 해상도 (deviceScaleFactor=2)로 캡처 → Retina/HiDPI 디스플레이에서 깨짐 방지.
// 본문 인포 폭 1200 + DPR=2 = webp 2400×N. CSS dim ≤ 2000 한도 유지 (§4.10.4 — input width 기준).
// 1배로 캡처하면 PC Retina + 모바일 고밀도에서 작은 폰트 양자화 손실로 글자 깨짐.
// 최종 webp 실제 dim = width × DPR × height × DPR. 디스플레이가 자동 2x scale로 선명하게 표시.
const DPR = Number(process.env.RENDER_DPR || opts.dpr || 2);
execFileSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--window-size=${width},${maxHeight}`,
    `--force-device-scale-factor=${DPR}`,
    '--hide-scrollbars',
    '--virtual-time-budget=6000',
    `--screenshot=${tmpPng}`,
    `file://${inputAbs}`,
  ],
  { stdio: 'pipe' },
);

const pngStat = statSync(tmpPng);
console.log(`  PNG 임시: ${(pngStat.size / 1024).toFixed(0)}KB`);

// 콘텐츠 fit-to-content trim: 하단 배경색 영역 자동 제거 (좌우·상단은 디자인 의도된 padding 유지)
const bg = hexToRgb(bgColor);
const TOLERANCE = 6;
const { data: rawData, info: rawInfo } = await sharp(tmpPng)
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = rawInfo.width;
const H = rawInfo.height;
const C = rawInfo.channels;

// 아래에서 위로 스캔하여 배경색이 아닌 마지막 row 탐지
let lastContentRow = -1;
for (let y = H - 1; y >= 0; y--) {
  let foundContent = false;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    if (
      Math.abs(rawData[i] - bg.r) > TOLERANCE ||
      Math.abs(rawData[i + 1] - bg.g) > TOLERANCE ||
      Math.abs(rawData[i + 2] - bg.b) > TOLERANCE
    ) {
      foundContent = true;
      break;
    }
  }
  if (foundContent) {
    lastContentRow = y;
    break;
  }
}

let cropHeight;
if (lastContentRow < 0) {
  console.warn(`⚠ 콘텐츠 감지 실패 (전부 배경색). 캔버스 전체 사용.`);
  cropHeight = H;
} else {
  cropHeight = Math.min(H, lastContentRow + 1 + bottomPadding * DPR);
}
console.log(`  콘텐츠 fit: ${W}×${cropHeight} (캡처 ${H} → trim ${H - cropHeight}px 제거, DPR=${DPR})`);

// 1x CSS dim 환산 (메타 정보) — 한계 검사는 audit 시점 별도 적용. 운영 webp는 자유.
const cssCropHeight = Math.round(cropHeight / DPR);
const cssW = Math.round(W / DPR);
console.log(`  CSS dim: ${cssW}×${cssCropHeight} / actual webp dim: ${W}×${cropHeight}`);

const trimmedPng = tmpPng.replace(/\.__tmp\.png$/, '.__trim.png');
// DPR=2 캡처 → 2x dim webp 그대로 저장 (다운스케일 없음).
// Why: 사용자 신고 — 컨테이너 폭 550px에서 webp 1x(600)를 0.917x로 표시 시 비정수
// 다운스케일 보간으로 글자 깨짐. 컨테이너 650+에서 1:1로 깨끗.
// 2x dim(1200×N) 저장 시 모든 컨테이너 폭(343-650)에서 다운스케일 비율 ≥ 0.5x로
// 보간이 부드러워져 깨짐 사라짐. Retina 1:1도 자동.
// dim 한계 2000(asset-images §4.10.4)은 audit Read 도구 회피용 — 운영 webp는 제외.
await sharp(tmpPng)
  .extract({ left: 0, top: 0, width: W, height: cropHeight })
  .toFile(trimmedPng);
unlinkSync(tmpPng);

// PNG → WebP 변환 (sharp). 출력 확장자가 .webp면 변환, .png면 그대로 (룰 위반이지만 강제 X).
if (outputAbs.endsWith('.webp')) {
  console.log(`▶ WebP 변환 (quality=${quality})`);
  await sharp(trimmedPng).webp({ quality, effort: 6 }).toFile(outputAbs);
  unlinkSync(trimmedPng);
  const webpStat = statSync(outputAbs);
  const saved = Math.round((1 - webpStat.size / pngStat.size) * 100);
  console.log(`✓ WebP 저장: ${(webpStat.size / 1024).toFixed(0)}KB (-${saved}% vs PNG)`);

  // 메인 컨테이너 폭 불일치 경고 — w-[Npx] mx-auto 인데 viewport != N 이면 여백/클리핑 발생
  try {
    const htmlSrc = readFileSync(inputAbs, 'utf8');
    const mainMatch = htmlSrc.match(/<(?:main|div)[^>]+class="[^"]*w-\[(\d+)px\][^"]*"/);
    if (mainMatch) {
      const mainPx = Number(mainMatch[1]);
      const expectedW = mainPx * DPR;
      if (W !== expectedW) {
        console.warn(
          `⚠ 폭 불일치: <main w-[${mainPx}px]> 기준 예상 출력 ${expectedW}px, 실제 ${W}px.` +
          ` --width=${mainPx} 옵션을 명시적으로 지정하세요.`
        );
      }
    }
  } catch {}
} else if (outputAbs.endsWith('.png')) {
  // PNG 직접 출력 (룰 위반 경고)
  execFileSync('mv', [trimmedPng, outputAbs]);
  console.warn(`⚠ PNG 출력 — asset-images.md §2.2-1에 따라 WebP 정본 권장 (.webp 확장자 사용)`);
  console.log(`✓ PNG 저장: ${(pngStat.size / 1024).toFixed(0)}KB`);
} else {
  console.error(`✗ 출력 확장자는 .webp 또는 .png 만 지원 (입력: ${outputAbs})`);
  unlinkSync(trimmedPng);
  process.exit(1);
}
