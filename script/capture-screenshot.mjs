#!/usr/bin/env node
// Chrome headless 기반 페이지 스크린샷 캡처 유틸리티.
// 블로그 글의 hero/본문 이미지로 "실제 플랫폼 화면 캡처"를 쓰기 위함 (asset-images.md §4.8.3).
// render-infographic.mjs와 동일한 Chrome 바이너리 + sharp 패턴.
// puppeteer/playwright 의존성 없이 Chrome --remote-debugging-port + 내장 WebSocket(CDP)로 통신.
//
// 사용:
//   node script/capture-screenshot.mjs --url=https://www.helpsns.com/blog/youtube-key-statistics-2026/ \
//     --out=wp-content/drafts/images/foo/1-screenshot.webp \
//     --width=1792 --height=1024 --crop=16:9
//
// 옵션:
//   --url=<URL>                 (필수) 캡처할 페이지
//   --out=<path>                (필수) 출력 .webp 또는 .png 경로
//   --width=1792                viewport 너비 (기본 1792)
//   --height=1024               viewport 높이 (기본 1024)
//   --crop=16:9                 aspect 비율 강제 (페이지 캡처 후 가로:세로로 crop)
//   --bg=#ffffff                배경색 (page background override)
//   --wait=2000                 로드 후 추가 대기 ms (동적 콘텐츠 대비)
//   --selector=<CSS>            특정 요소만 캡처 (없으면 viewport 전체)
//   --blur-selectors=<a,b,c>    캡처 전에 blur(8px) 처리할 셀렉터들 (개인정보 보호)

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const opts = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...rest] = a.slice(2).split('=');
    return [k, rest.join('=')];
  }),
);

const url = opts.url;
const out = opts.out;
if (!url || !out) {
  console.error('사용: capture-screenshot.mjs --url=<URL> --out=<path> [--width=1792] [--height=1024] [--crop=16:9] [--bg=#ffffff] [--wait=2000] [--selector=<CSS>] [--blur-selectors=a,b,c]');
  process.exit(1);
}

const width = Number(opts.width || 1792);
const height = Number(opts.height || 1024);
const waitMs = Number(opts.wait || 2000);
const bg = opts.bg || null;
const selector = opts.selector || null;
const blurSelectors = (opts['blur-selectors'] || '').split(',').map((s) => s.trim()).filter(Boolean);
const crop = opts.crop || null; // "16:9" 등

const port = 9222 + Math.floor(Math.random() * 1000);
const tmpDir = mkdtempSync(path.join(tmpdir(), 'capture-'));

mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  `--window-size=${width},${height}`,
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${tmpDir}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

function cleanup(code) {
  try { chrome.kill('SIGTERM'); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));

// Chrome DevTools가 뜰 때까지 폴링
async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome DevTools 시작 실패');
}

// 최소 CDP 클라이언트 (내장 WebSocket)
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  };
  return {
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

try {
  const browserWs = await waitForCdp();
  // 새 탭 열기
  const targetResp = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await targetResp.json();
  const page = await connect(target.webSocketDebuggerUrl);

  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  // 페이지 로드 이벤트 대기
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000);
    const check = setInterval(async () => {
      try {
        const r = await page.send('Runtime.evaluate', { expression: 'document.readyState' });
        if (r.result.value === 'complete') { clearInterval(check); clearTimeout(timer); resolve(); }
      } catch {}
    }, 200);
  });

  if (bg) {
    await page.send('Runtime.evaluate', {
      expression: `document.documentElement.style.background='${bg}';document.body.style.background='${bg}';`,
    });
  }
  if (blurSelectors.length) {
    const css = blurSelectors.map((s) => `${s}{filter:blur(8px) !important;}`).join('');
    await page.send('Runtime.evaluate', {
      expression: `(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})()`,
    });
  }
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

  let clip;
  if (selector) {
    const r = await page.send('Runtime.evaluate', {
      expression: `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`,
      returnByValue: true,
    });
    if (!r.result.value) {
      console.error(`✗ 셀렉터 매칭 0개: ${selector}`);
      cleanup(1);
    }
    const v = r.result.value;
    clip = { x: v.x, y: v.y, width: v.w, height: v.h, scale: 1 };
  }

  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: !!selector,
    ...(clip ? { clip } : {}),
  });
  await page.close();

  let img = sharp(Buffer.from(shot.data, 'base64'));
  if (crop && !selector) {
    const [aw, ah] = crop.split(':').map(Number);
    if (!aw || !ah) { console.error(`✗ --crop 형식 오류: ${crop} (예: 16:9)`); cleanup(1); }
    const meta = await img.metadata();
    const targetH = Math.round((meta.width * ah) / aw);
    if (targetH <= meta.height) {
      img = img.extract({ left: 0, top: 0, width: meta.width, height: targetH });
    } else {
      const targetW = Math.round((meta.height * aw) / ah);
      img = img.extract({ left: Math.floor((meta.width - targetW) / 2), top: 0, width: targetW, height: meta.height });
    }
  }

  const outAbs = path.resolve(out);
  if (outAbs.endsWith('.webp')) {
    await img.webp({ quality: 85, effort: 6 }).toFile(outAbs);
  } else if (outAbs.endsWith('.png')) {
    await img.png().toFile(outAbs);
  } else {
    console.error(`✗ 출력 확장자는 .webp 또는 .png 만 지원: ${outAbs}`);
    cleanup(1);
  }
  const s = statSync(outAbs);
  console.log(`✓ 캡처 저장: ${outAbs} (${(s.size / 1024).toFixed(0)}KB)`);
  cleanup(0);
} catch (e) {
  console.error(`✗ 캡처 실패: ${e.message}`);
  cleanup(1);
}
