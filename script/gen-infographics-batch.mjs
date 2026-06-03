#!/usr/bin/env node
// 21글 인포그래픽 일괄 HTML 생성기.
// 정본 4 템플릿(stats-insights / steps-guide / checklist / tools-comparison) 구조를
// 데이터 주입 방식으로 인스턴스화한다. 출력: wp-content/drafts/images/post-{id}-{slug}/infographic.html

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ── 공통 헤더/푸터 ─────────────────────────────────────────────
const headHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/[email protected]/dist/web/static/pretendard.css" rel="stylesheet">
<style>body{font-family:'Pretendard',-apple-system,sans-serif;-webkit-font-smoothing:antialiased}.num{font-variant-numeric:tabular-nums}</style>
</head><body class="bg-[#F6F8FB]"><main class="w-[1200px] mx-auto py-8 px-6">`;

const footerHtml = (sourceLine = '데이터 출처: 자체 분석 + 1차 출처 합산') => `
<footer class="bg-white rounded-[28px] p-5 flex items-center justify-between shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
  <div class="flex items-center gap-4">
    <img src="../../../illustrations/snshelp-logo.webp" alt="snshelp 로고" class="w-11 h-11" />
    <div>
      <div class="text-[20px] font-bold text-[#0A0A0A]">snshelp.com</div>
      <div class="text-[14px] text-[#555]">SNS 마케팅 셀프 서비스</div>
    </div>
  </div>
  <div class="text-[14px] text-[#555] italic text-right leading-relaxed">${sourceLine}</div>
</footer></main></body></html>`;

// ── 템플릿 생성기 ─────────────────────────────────────────────

// stats-insights: 헤더 + 빅넘버 3개 + 가로 막대 5종 + KEY TAKEAWAY + footer
function statsInsights(spec) {
  const { chip, illust, chipColor = '#FF6B2C', headerGrad = 'from-[#FFF1E8] via-[#F5EFE0] to-[#F6F8FB]', titleLine1, titleLine2, titleAccent = '#FF6B2C', subtitle, kpis, sectionTitle, sectionSub, breakdown, takeaway, takeawayBg = '#FF6B2C', source } = spec;

  const kpiCards = kpis.map((k, i) => {
    const colors = [['#FF6B2C', '#FFE8DC'], ['#3B70FF', '#E8F1FF'], ['#1A3DA8', '#E8F1FF']];
    const [c, bg] = colors[i % 3];
    return `<div class="bg-white rounded-[28px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <p class="text-[14px] text-[#555] tracking-widest uppercase mb-2">${k.label}</p>
      <div class="flex items-baseline gap-1 mb-2">
        <span class="text-[56px] font-black num leading-none" style="color:${c}">${k.value}</span>
        <span class="text-[28px] font-black num" style="color:${c}">${k.unit || ''}</span>
      </div>
      <div class="inline-flex items-center gap-1 text-[14px] font-bold px-2.5 py-1 rounded-full" style="background:${bg};color:${c}">
        <span class="num">${k.tag}</span>
      </div>
      <p class="text-[16px] text-[#444] leading-relaxed mt-2">${k.note}</p>
    </div>`;
  }).join('\n');

  const bars = breakdown.map(b => `<div>
    <div class="flex items-baseline justify-between mb-1.5">
      <span class="text-[20px] font-bold text-[#0A0A0A]">${b.label}</span>
      <span class="text-[20px] font-black num" style="color:#3B70FF">${b.pct}%</span>
    </div>
    <div class="h-3 bg-[#F1F5FF] rounded-full overflow-hidden">
      <div class="h-full bg-[#3B70FF] rounded-full" style="width:${b.pct}%"></div>
    </div>
  </div>`).join('\n');

  return headHtml + `
  <header class="bg-gradient-to-br ${headerGrad} rounded-[32px] p-6 mb-4 relative overflow-hidden">
    <div class="inline-flex items-center gap-2 text-white text-[14px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full mb-3" style="background:${chipColor}">
      <span class="w-1.5 h-1.5 rounded-full bg-white"></span>${chip}
    </div>
    <div class="flex justify-center mb-4">
      <img src="../../../illustrations/${illust}" alt="" class="w-[200px] h-[200px] object-contain" />
    </div>
    <h1 class="text-[44px] font-black leading-[1.1] tracking-tight text-[#0A0A0A] mb-3">
      ${titleLine1}<br><span style="color:${titleAccent}">${titleLine2}</span>
    </h1>
    <p class="text-[20px] text-[#444] leading-relaxed">${subtitle}</p>
  </header>

  <section class="grid grid-cols-3 gap-3 mb-4">${kpiCards}</section>

  <section class="bg-white rounded-[28px] p-6 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
    <div class="flex items-center gap-3 mb-1">
      <div class="w-8 h-8 rounded-full bg-[#E8F1FF] flex items-center justify-center text-[20px]">📊</div>
      <h2 class="text-[24px] font-bold text-[#0A0A0A]">${sectionTitle}</h2>
    </div>
    <p class="text-[16px] text-[#555] ml-11 mb-5">${sectionSub}</p>
    <div class="space-y-3">${bars}</div>
  </section>

  <section class="text-white rounded-[28px] p-6 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]" style="background:${takeawayBg}">
    <p class="text-[14px] tracking-widest uppercase mb-2" style="color:#FFEEDC">한 줄 요약</p>
    <h3 class="text-[22px] font-bold leading-snug">${takeaway}</h3>
  </section>` + footerHtml(source);
}

// steps-guide: 헤더 + 요약 + 단계 5개 + KEY TAKEAWAY + footer
function stepsGuide(spec) {
  const { chip, illust, chipColor = '#3B70FF', headerGrad = 'from-[#E8F1FF] via-[#F5EFE0] to-[#F6F8FB]', titleLine1, titleLine2, titleAccent = '#3B70FF', subtitle, summary, steps, takeaway, takeawayBg = '#1A3DA8', source } = spec;

  const stepBlocks = steps.map((s, i) => {
    const stepColors = ['#3B70FF', '#2553D7', '#3B70FF', '#2553D7', '#1A3DA8'];
    const c = stepColors[i % stepColors.length];
    const tags = (s.tags || []).map(t => `<span class="text-[14px] bg-[#F1F5FF] text-[#2553D7] font-bold px-2.5 py-1 rounded-full">${t}</span>`).join(' ');
    return `<div class="bg-white rounded-[28px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex gap-4 items-start">
      <div class="flex-shrink-0 w-12 h-12 rounded-2xl text-white flex items-center justify-center text-[24px] font-black num" style="background:${c}">${i + 1}</div>
      <div class="flex-1">
        <div class="flex items-baseline justify-between mb-2">
          <h3 class="text-[22px] font-bold text-[#0A0A0A]">${s.title}</h3>
          <span class="text-[16px] text-[#555] num">${s.time}</span>
        </div>
        <p class="text-[16px] text-[#444] leading-relaxed mb-2">${s.desc}</p>
        <div class="flex flex-wrap gap-1.5">${tags}</div>
      </div>
    </div>`;
  }).join('\n');

  return headHtml + `
  <header class="bg-gradient-to-br ${headerGrad} rounded-[32px] p-6 mb-4 relative overflow-hidden">
    <div class="inline-flex items-center gap-2 text-white text-[14px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full mb-3" style="background:${chipColor}">
      <span class="w-1.5 h-1.5 rounded-full bg-white"></span>${chip}
    </div>
    <div class="flex justify-center mb-4">
      <img src="../../../illustrations/${illust}" alt="" class="w-[200px] h-[200px] object-contain" />
    </div>
    <h1 class="text-[44px] font-black leading-[1.1] tracking-tight text-[#0A0A0A] mb-3">
      ${titleLine1}<br><span style="color:${titleAccent}">${titleLine2}</span>
    </h1>
    <p class="text-[20px] text-[#444] leading-relaxed">${subtitle}</p>
  </header>

  <section class="bg-white rounded-[28px] p-5 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
    <div class="grid grid-cols-3 gap-6">
      <div class="text-center"><p class="text-[14px] text-[#555] tracking-widest uppercase mb-1">총 단계</p><p class="text-[24px] font-black num leading-none" style="color:${chipColor}">${summary.steps}</p></div>
      <div class="text-center border-l border-r border-[#F0F0F0]"><p class="text-[14px] text-[#555] tracking-widest uppercase mb-1">소요 시간</p><p class="text-[24px] font-black num leading-none" style="color:${chipColor}">${summary.time}</p></div>
      <div class="text-center"><p class="text-[14px] text-[#555] tracking-widest uppercase mb-1">${summary.thirdLabel || '필요 도구'}</p><p class="text-[24px] font-black num leading-none" style="color:${chipColor}">${summary.thirdValue}</p></div>
    </div>
  </section>

  <section class="space-y-3 mb-4">${stepBlocks}</section>

  <section class="text-white rounded-[28px] p-6 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]" style="background:${takeawayBg}">
    <p class="text-[14px] tracking-widest uppercase mb-2" style="color:#D6E2FF">핵심 인사이트</p>
    <h3 class="text-[22px] font-bold leading-snug">${takeaway}</h3>
  </section>` + footerHtml(source);
}

// checklist: 헤더 + Do/Don't 좌우 + KEY + footer
function checklist(spec) {
  const { chip, illust, chipColor = '#0A0A0A', headerGrad = 'from-[#E8F1FF] via-[#F5EFE0] to-[#FFE8DC]', titleLine1, titleLine2, titleAccent = '#FF4A4A', subtitle, doItems, dontItems, takeaway, source } = spec;

  const renderItems = (items, color, lightBg) => items.map((it, i) => `<li class="flex gap-3">
    <span class="flex-shrink-0 w-6 h-6 rounded-full text-[14px] font-black flex items-center justify-center num" style="background:${lightBg};color:${color}">${i + 1}</span>
    <div>
      <p class="text-[18px] font-bold text-[#0A0A0A] leading-snug mb-0.5">${it.title}</p>
      <p class="text-[15px] text-[#444] leading-relaxed">${it.desc}</p>
    </div>
  </li>`).join('\n');

  return headHtml + `
  <header class="bg-gradient-to-br ${headerGrad} rounded-[32px] p-8 mb-5 relative overflow-hidden">
    <div class="inline-flex items-center gap-2 text-white text-[14px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full mb-3" style="background:${chipColor}">
      <span class="w-1.5 h-1.5 rounded-full bg-white"></span>${chip}
    </div>
    <div class="flex justify-center mb-4">
      <img src="../../../illustrations/${illust}" alt="" class="w-[200px] h-[200px] object-contain" />
    </div>
    <h1 class="text-[44px] font-black leading-[1.1] tracking-tight text-[#0A0A0A] mb-3">
      ${titleLine1}<br><span style="color:${titleAccent}">${titleLine2}</span>
    </h1>
    <p class="text-[20px] text-[#444] leading-relaxed">${subtitle}</p>
  </header>

  <section class="grid grid-cols-2 gap-4 mb-5">
    <div class="bg-white rounded-[28px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div class="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F0F0]">
        <div class="w-10 h-10 rounded-2xl bg-[#21B26A] flex items-center justify-center"><span class="text-white text-[22px] font-black leading-none">✓</span></div>
        <div><p class="text-[12px] text-[#21B26A] font-bold tracking-widest uppercase">Do</p><h2 class="text-[20px] font-bold text-[#0A0A0A]">해야 할 것</h2></div>
      </div>
      <ul class="space-y-3">${renderItems(doItems, '#21B26A', '#E8F7EE')}</ul>
    </div>
    <div class="bg-white rounded-[28px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div class="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F0F0]">
        <div class="w-10 h-10 rounded-2xl bg-[#FF4A4A] flex items-center justify-center"><span class="text-white text-[22px] font-black leading-none">✕</span></div>
        <div><p class="text-[12px] text-[#FF4A4A] font-bold tracking-widest uppercase">Don't</p><h2 class="text-[20px] font-bold text-[#0A0A0A]">하지 말 것</h2></div>
      </div>
      <ul class="space-y-3">${renderItems(dontItems, '#FF4A4A', '#FFE8E8')}</ul>
    </div>
  </section>

  <section class="bg-[#0A0A0A] text-white rounded-[28px] p-6 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
    <p class="text-[14px] tracking-widest uppercase mb-2" style="color:#888">한 줄 요약</p>
    <h3 class="text-[22px] font-bold leading-snug">${takeaway}</h3>
  </section>` + footerHtml(source);
}

// tools-comparison: 헤더 + 매트릭스 + 추천 조합 2종
function toolsComparison(spec) {
  const { chip, illust, chipColor = '#3B70FF', headerGrad = 'from-[#E8F1FF] via-[#F5EFE0] to-[#F6F8FB]', titleLine1, titleLine2, titleAccent = '#3B70FF', subtitle, tools, criteria, scenarios, source } = spec;

  const scoreCell = (n) => {
    const cfg = { 5: ['#2553D7', 'white'], 4: ['#5C8AFF', 'white'], 3: ['#B8CFFF', '#0A0A0A'], 2: ['#E8EEF7', '#888'], 1: ['#F5F5F5', '#999'] }[n] || ['#E8EEF7', '#888'];
    return `<td class="text-center py-2"><div class="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[18px] font-bold" style="background:${cfg[0]};color:${cfg[1]}">${n}</div></td>`;
  };

  const thCells = tools.map(t => `<th class="text-center py-3 px-1"><div class="text-[16px] font-bold">${t.name}</div><div class="text-[12px] text-[#555] font-normal">${t.sub || ''}</div></th>`).join('');
  const rows = criteria.map(cr => `<tr class="border-b border-[#F0F0F0]"><td class="text-left py-3 text-[15px] font-medium text-[#0A0A0A]">${cr.label}</td>${cr.scores.map(scoreCell).join('')}</tr>`).join('\n');

  const scenarioCards = scenarios.map((sc, i) => `<div class="bg-white rounded-[28px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
    <div class="inline-block self-start bg-[#E8F1FF] text-[#2553D7] text-[12px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full mb-3">Scenario ${i + 1}</div>
    <h3 class="text-[22px] font-bold text-[#0A0A0A] mb-2">${sc.title}</h3>
    <p class="text-[16px] text-[#444] leading-relaxed mb-4">${sc.desc}</p>
    <div class="flex flex-wrap gap-1.5">${sc.tags.map(t => `<span class="text-[13px] bg-[#F1F5FF] text-[#2553D7] font-bold px-2.5 py-1 rounded-full">${t}</span>`).join('')}</div>
  </div>`).join('');

  return headHtml + `
  <header class="bg-gradient-to-br ${headerGrad} rounded-[32px] p-6 mb-4 relative overflow-hidden">
    <div class="inline-flex items-center gap-2 text-white text-[14px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full mb-3" style="background:${chipColor}">
      <span class="w-1.5 h-1.5 rounded-full bg-white"></span>${chip}
    </div>
    <div class="flex justify-center mb-4">
      <img src="../../../illustrations/${illust}" alt="" class="w-[200px] h-[200px] object-contain" />
    </div>
    <h1 class="text-[40px] font-black leading-[1.1] tracking-tight text-[#0A0A0A] mb-3">
      ${titleLine1}<br><span style="color:${titleAccent}">${titleLine2}</span>
    </h1>
    <p class="text-[18px] text-[#444] leading-relaxed">${subtitle}</p>
  </header>

  <section class="bg-white rounded-[28px] p-5 mb-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
    <div class="flex items-center gap-3 mb-2">
      <div class="w-8 h-8 rounded-full bg-[#E8F1FF] flex items-center justify-center text-[18px]">🛠️</div>
      <h2 class="text-[22px] font-bold text-[#0A0A0A]">${spec.matrixTitle || '한눈에 비교'}</h2>
    </div>
    <p class="text-[14px] text-[#555] ml-11 mb-4">5점 만점 · 진할수록 강점</p>
    <table class="w-full border-collapse num">
      <thead><tr class="border-b-2 border-[#0A0A0A]"><th class="text-left py-3 px-1 w-[110px]"></th>${thCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>

  <section class="grid grid-cols-2 gap-4 mb-5">${scenarioCards}</section>` + footerHtml(source);
}

// ── 21글 데이터 ─────────────────────────────────────────────
const posts = [
  // 133 — YouTube 통계 42개 (stats)
  {
    id: 133, slug: 'yt-stats-2026', template: statsInsights,
    spec: {
      chip: '2026 YouTube 통계', illust: 'marketer-laptop-ai-video.webp',
      chipColor: '#FF0000', titleAccent: '#FF0000', headerGrad: 'from-[#FFE8E8] via-[#FFF1E8] to-[#F6F8FB]',
      titleLine1: '숫자로 보는', titleLine2: '2026 YouTube',
      subtitle: '월 24.9억 명 로그인 사용자·광고 매출 <strong style="color:#FF0000">315억 달러</strong>. 모바일 시청 88%가 결정적 전환점.',
      kpis: [
        { label: '월간 사용자', value: '24.9', unit: '억', tag: '세계 2위', note: 'Facebook 다음 가는 글로벌 #2 플랫폼.' },
        { label: '광고 매출', value: '315', unit: '억$', tag: '+8% YoY', note: '2023년 전체 광고 수익. 크리에이터 분배 55%.' },
        { label: '모바일 시청', value: '88', unit: '%', tag: '데스크탑 12%', note: '세로 영상·짧은 호흡 콘텐츠가 표준이 된 이유.' },
      ],
      sectionTitle: '디바이스·포맷별 시청 점유',
      sectionSub: '2026 자체 분석 + YouTube 공식 데이터 합산',
      breakdown: [
        { label: '모바일 (스마트폰·태블릿)', pct: 88 },
        { label: '데스크탑·노트북', pct: 12 },
        { label: '쇼츠 시청자 (일간)', pct: 70 },
        { label: '구독 채널만 보는 비율', pct: 35 },
        { label: '검색으로 영상 발견', pct: 22 },
      ],
      takeaway: '모바일·세로 영상 우선 + Shorts → 롱폼 funnel 설계가 2026 채널 성장의 표준 공식입니다.',
      takeawayBg: '#FF0000',
      source: '출처: YouTube 공식 통계 · 자체 분석 합산 (2026.05 기준)',
    },
  },

  // 264 — 인스타 팔로워 구매 오해 (checklist)
  {
    id: 264, slug: 'insta-followers-myths', template: checklist,
    spec: {
      chip: '인스타 팔로워 구매 오해 4', illust: 'avatar-shop-owner.webp',
      titleLine1: '루머 vs 사실', titleLine2: '팔로워 구매 4가지',
      subtitle: '글로벌 사용자 <strong>49%</strong>가 고려·실행. 무조건 차단이라는 오해부터 풀어드립니다.',
      doItems: [
        { title: '인플루언서 진입 점화용 활용', desc: '0→500은 자력 어려움. 초기 사회적 증거 부스트로 활용.' },
        { title: '검증된 한국 활성 계정 공급사', desc: '봇·휴면 계정 X. 실 사용자 활성 계정만 선택.' },
        { title: '소량 분할 입고', desc: '1회 1만 명 X. 100~500명씩 자연 증가 패턴.' },
        { title: '콘텐츠 동시 강화', desc: '팔로워 + 릴스·스토리·하이라이트 정비 병행.' },
        { title: '구매 후 인사이트 점검', desc: '도달·참여율 변화 7·30일 모니터링.' },
        { title: '광고주 협업 진입 기준 활용', desc: '1만 팔로워 + 전환율 3%가 brand collab 진입선.' },
      ],
      dontItems: [
        { title: '봇·휴면 계정 대량 구매', desc: 'Meta AI가 즉시 감지. 알고리즘 페널티 직격.' },
        { title: '하루 1만 명 한 번에', desc: '비정상 패턴 감지. 계정 정지 위험 1순위.' },
        { title: '콘텐츠 0인 상태 구매', desc: '구매 팔로워만 있고 게시물 X → 가짜 계정 의심.' },
        { title: '무명 해외 공급사', desc: '인도·동남아 휴면 봇 다수. 한국어 댓글·반응 X.' },
        { title: '구매 후 방치', desc: '활성 게시물 안 올리면 알고리즘이 가짜로 인지.' },
        { title: '광고용 메인 계정에서 시도', desc: '브랜드 본 계정은 100% 자력. 서브로만 실험.' },
      ],
      takeaway: '구매 자체는 합법·일반. 단 <span style="color:#FF4A4A">봇 대량·한 번에 만 명</span>만 피하면 알고리즘 페널티 회피 가능.',
      source: '근거: Later·HypeAuditor 1차 보고서 + 자체 상담 200건',
    },
  },

  // 341 — K-브랜드 SNS 마케팅 (stats)
  {
    id: 341, slug: 'k-brand-sns', template: statsInsights,
    spec: {
      chip: 'K-Brand 2030', illust: 'phone-cinematic-clip.webp',
      chipColor: '#3B70FF', titleAccent: '#3B70FF', headerGrad: 'from-[#E8F1FF] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: '글로벌을 휩쓴', titleLine2: 'K-브랜드 4축 공식',
      subtitle: 'K-뷰티 <strong style="color:#3B70FF">1,874억$</strong> · K-푸드 <strong style="color:#3B70FF">130억$</strong>. 초현지화·팬덤·숏폼·인플루언서가 핵심.',
      kpis: [
        { label: 'K-뷰티 시장 (2030 예측)', value: '1,874', unit: '억$', tag: '연 9.5% 성장', note: '전 세계 K-뷰티 시장 규모 추정치.' },
        { label: 'K-푸드 수출액', value: '130', unit: '억$', tag: '+9% YoY', note: '농수산식품 수출 사상 최고치 기록.' },
        { label: '한류 팬덤 (세계)', value: '2.25', unit: '억', tag: '+15% YoY', note: 'KOFICE 2024 한류실태조사 기준.' },
      ],
      sectionTitle: 'K-브랜드 SNS 4축 비중',
      sectionSub: '한류 마케팅 캠페인 130건 분석 (자체 + KOFICE)',
      breakdown: [
        { label: '초현지화 (Localization)', pct: 78 },
        { label: '팬덤 마케팅 (Fandom)', pct: 72 },
        { label: '숏폼·릴스·쇼츠', pct: 85 },
        { label: '글로벌 인플루언서 협업', pct: 64 },
        { label: 'UGC 챌린지', pct: 58 },
      ],
      takeaway: '국가별 현지 인플루언서 + 숏폼 챌린지 + K-팬덤 자산 활용이 글로벌 진출 표준 공식.',
      takeawayBg: '#3B70FF',
      source: '출처: KOFICE 한류실태조사 2024 · 농식품부 · 자체 분석',
    },
  },

  // 419 — 유튜브 구독자 늘리기 (steps)
  {
    id: 419, slug: 'yt-influencer-subs', template: stepsGuide,
    spec: {
      chip: 'YouTube Subscribers', illust: 'marketer-laptop-ai-video.webp',
      chipColor: '#FF0000', titleAccent: '#FF0000', headerGrad: 'from-[#FFE8E8] via-[#FFF1E8] to-[#F6F8FB]',
      titleLine1: '광고주 협업 진입선', titleLine2: '1만 구독 5단계',
      subtitle: '구독 <strong style="color:#FF0000">1만 + 전환율 3%</strong>가 브랜드 collab 진입선. funnel 설계가 핵심.',
      summary: { steps: '5단계', time: '90일', thirdLabel: '필요 채널', thirdValue: 'YT+Shorts' },
      steps: [
        { title: '채널 컨셉·페르소나 확정', time: '주 1', desc: '1년 후에도 만들 주제 1개. 페르소나 명확히 (직업·고민·언어).', tags: ['컨셉 시트', 'YT Studio'] },
        { title: 'Shorts 8편 우선 발행', time: '주 2-3', desc: '롱폼 1편 시간에 Shorts 8편. 알고리즘 첫 1만 노출 진입 핵심.', tags: ['Shorts', 'CapCut'] },
        { title: '히트작 1편 → 롱폼 확장', time: '주 4', desc: 'Shorts 조회 5만+ 영상의 주제를 8-12분 롱폼으로 확장.', tags: ['DaVinci', '풀버전'] },
        { title: 'CTR 4%+ / 시청 50%+ 점검', time: '주 5-8', desc: '썸네일·제목 A/B. CTR 4% 미달이면 즉시 교체. 시청 지속률 50% 목표.', tags: ['Analytics', 'TubeBuddy'] },
        { title: 'Shorts→롱폼 funnel 고정', time: '주 9-12', desc: 'Shorts 매일 1편 + 롱폼 주 1편 패턴 고정. 90일 후 1만 도달.', tags: ['일정', 'Notion'] },
      ],
      takeaway: 'Shorts로 노출 확보 + 롱폼으로 시청 시간·구독 전환. 두 채널 분리 운영이 1만 가속 공식.',
      takeawayBg: '#FF0000',
      source: 'SNS헬프 인플루언서 컨설팅 300건 데이터 (2025-2026)',
    },
  },

  // 546 — 유튜브 구독자 1000명 (steps)
  {
    id: 546, slug: 'yt-1k-subscribers', template: stepsGuide,
    spec: {
      chip: 'YPP 1000 Subscribers', illust: 'phone-cinematic-clip.webp',
      chipColor: '#FF0000', titleAccent: '#FF0000', headerGrad: 'from-[#FFE8E8] via-[#FFF1E8] to-[#F6F8FB]',
      titleLine1: '신규 유튜버를 위한', titleLine2: '1,000명 90일 루트',
      subtitle: 'YPP 수익화 최소 기준 <strong style="color:#FF0000">1,000명</strong>. Shorts 1천만 조회로도 대체 가능합니다.',
      summary: { steps: '5단계', time: '90일', thirdLabel: '권장 업로드', thirdValue: '주 3회' },
      steps: [
        { title: '채널 컨셉 1개로 압축', time: '1일', desc: '뷰티+게임+vlog 섞으면 추천 안 붙음. 1개만 선택해 30편까지 진행.', tags: ['컨셉 시트'] },
        { title: '썸네일·제목 템플릿 고정', time: '2일', desc: '4-5가지 패턴 만들어 모든 영상에 동일 적용. 시각 일관성이 구독 신호.', tags: ['Canva', 'Photoshop'] },
        { title: 'Shorts 매일 1편 30일', time: '30일', desc: '롱폼보다 Shorts가 노출 비율 ×10. 매일 60초 영상으로 알고리즘 trust 쌓기.', tags: ['Shorts', 'CapCut'] },
        { title: '롱폼 8-12분 주 1편', time: '주 1', desc: 'Shorts 히트 주제를 롱폼으로. 시청 시간 누적 = YPP 4천 시간 진입.', tags: ['프리미어', 'DaVinci'] },
        { title: '댓글 100% 답글 + 커뮤니티 탭', time: '상시', desc: '답글 = 알고리즘 활동 신호. 첫 100구독자는 댓글로 잡힌다.', tags: ['커뮤니티'] },
      ],
      takeaway: 'Shorts 30편 + 롱폼 12편 = 90일에 1천 구독 가능. 컨셉 일관성이 가장 빠른 길.',
      takeawayBg: '#FF0000',
      source: '자체 채널 50개 운영 데이터 + YouTube Studio 분석',
    },
  },

  // 564 — 노란우산공제 (stats)
  {
    id: 564, slug: 'noran-umbrella-saving', template: statsInsights,
    spec: {
      chip: '노란우산공제', illust: 'avatar-shop-owner.webp',
      chipColor: '#FFB800', titleAccent: '#FFB800', headerGrad: 'from-[#FFF8E1] via-[#FFF1E8] to-[#F6F8FB]',
      titleLine1: '연 복리 3.7-3.9%', titleLine2: '소득공제 600만원',
      subtitle: '월 <strong style="color:#FFB800">5-100만원</strong> 자율 납입. 사업주 채권 압류 보호까지.',
      kpis: [
        { label: '연 복리 이율', value: '3.7-3.9', unit: '%', tag: '2025 기준', note: '소상공인시장진흥공단 공시 평균. 매년 조정.' },
        { label: '소득공제 한도', value: '600', unit: '만원', tag: '연간', note: '소득 4천만 이하 기준. 절세 폭 가장 큼.' },
        { label: '월 납입 범위', value: '5-100', unit: '만원', tag: '자율', note: '매달 자유 조정. 자영업 현금흐름 친화.' },
      ],
      sectionTitle: '연 소득별 절세 효과',
      sectionSub: '2025 기준 · 600만원 납입 시 환급액 추정',
      breakdown: [
        { label: '연 4천만원 이하 (24% 환급)', pct: 100 },
        { label: '4천-1억 (18% 환급)', pct: 75 },
        { label: '1억-4억 (15% 환급)', pct: 62 },
        { label: '4억 이상 (8% 환급)', pct: 33 },
        { label: '미가입 시 환급', pct: 0 },
      ],
      takeaway: '연 600만원 납입 = 평균 90-144만원 환급 + 복리 자산. 자영업 1순위 절세 도구.',
      takeawayBg: '#FFB800',
      source: '출처: 소상공인시장진흥공단 · 국세청 (2025년 기준)',
    },
  },

  // 597 — 캡컷 10분 영상 (steps)
  {
    id: 597, slug: 'capcut-tiktok-10min', template: stepsGuide,
    spec: {
      chip: 'CapCut 10분 제작', illust: 'phone-cinematic-clip.webp',
      chipColor: '#000000', titleAccent: '#FF6B2C', headerGrad: 'from-[#FFE8DC] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: 'CapCut 한 앱으로', titleLine2: '틱톡 영상 10분 컷',
      subtitle: '글로벌 MAU <strong style="color:#FF6B2C">4억 명</strong>·틱톡 크리에이터 70%가 사용. ByteDance 공식 호환.',
      summary: { steps: '5단계', time: '10분', thirdLabel: '필요 앱', thirdValue: '1개' },
      steps: [
        { title: '템플릿 선택 + 영상 삽입', time: '2분', desc: 'CapCut 인기 템플릿 1개 선택 → 핸드폰 갤러리에서 클립 3-5개 자동 매칭.', tags: ['CapCut Template'] },
        { title: '1080×1920 9:16 설정', time: '30초', desc: '비율 9:16 자동. 틱톡 세로 표준 해상도. 가로 영상 자동 크롭.', tags: ['해상도'] },
        { title: '자동 자막 + 폰트 교체', time: '2분', desc: '한국어 인식률 95%. 사장님 멘트 그대로 자막. 무음 시청 85% 대응.', tags: ['자동 자막'] },
        { title: '트렌딩 음원 선택', time: '2분', desc: '인기 차트에서 7일 상승 곡 선택. 틱톡 알고리즘과 동일 음원 풀.', tags: ['트렌딩 사운드'] },
        { title: '0.3초 컷 전환 + 내보내기', time: '3분', desc: '클립 간 0.3초 fade·zoom. 1080p 30fps 내보내기. 틱톡에 바로 업로드.', tags: ['Export', 'TikTok'] },
      ],
      takeaway: '편집·자막·음원이 한 앱 안에서 해결. 외주 1편 30만원 → 무료 10분.',
      takeawayBg: '#000000',
      source: '근거: CapCut 공식 + 자체 시간 측정 50건 평균',
    },
  },

  // 618 — 4대 보험 (stats)
  {
    id: 618, slug: '4-insurance-2025', template: statsInsights,
    spec: {
      chip: '2025 4대 보험', illust: 'avatar-shop-owner.webp',
      chipColor: '#0077C8', titleAccent: '#0077C8', headerGrad: 'from-[#E8F1FF] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: '4대 보험 보험료율', titleLine2: '2025 완전 정복',
      subtitle: '국민연금 9% · 건강 7.09% · 고용 1.8% · 산재 평균 <strong style="color:#0077C8">1.43%</strong>. 동결·인상 한눈에.',
      kpis: [
        { label: '국민연금 보험료율', value: '9.0', unit: '%', tag: '근로자 4.5%', note: '월 소득의 9%. 사용자·근로자 각 절반.' },
        { label: '건강보험 보험료율', value: '7.09', unit: '%', tag: '2025 동결', note: '장기요양 0.9182% 별도. 직장가입자 각 3.545%.' },
        { label: '고용·산재 합계', value: '3.2', unit: '%', tag: '평균', note: '고용 1.8% + 산재 평균 1.43%. 업종별 차등.' },
      ],
      sectionTitle: '월 급여 300만원 기준 본인 부담액',
      sectionSub: '근로자 본인 부담 보험료 (회사 부담분 제외)',
      breakdown: [
        { label: '국민연금 (4.5%)', pct: 90 },
        { label: '건강보험 (3.545%)', pct: 71 },
        { label: '장기요양 (건보의 12.95%)', pct: 9 },
        { label: '고용보험 (0.9%)', pct: 18 },
        { label: '산재 (사업주 부담 100%)', pct: 0 },
      ],
      takeaway: '월 300만원 근로자 본인 부담 합계 약 <span style="color:#FFEEDC">28만원</span>. 사용자도 비슷한 금액 부담.',
      takeawayBg: '#0077C8',
      source: '출처: 국민연금공단 · 건보공단 · 보건복지부 (2025)',
    },
  },

  // 627 — 우리 동네 가게 (comparison)
  {
    id: 627, slug: 'local-shop-success', template: toolsComparison,
    spec: {
      chip: '로컬 비즈니스 전략', illust: 'avatar-shop-owner.webp',
      titleLine1: '대형 브랜드 vs', titleLine2: '동네 성공 가게',
      subtitle: 'MZ <strong style="color:#3B70FF">68%</strong>가 로컬 선호. 4축 전략별 동네 가게가 어디서 이기는지.',
      matrixTitle: '대형 vs 로컬 가게 4축 비교',
      tools: [
        { name: '대형 체인', sub: '프랜차이즈' },
        { name: '동네 가게 A', sub: '카페' },
        { name: '동네 가게 B', sub: '식당' },
        { name: '동네 가게 C', sub: '소품샵' },
      ],
      criteria: [
        { label: '가격 경쟁력', scores: [5, 3, 3, 2] },
        { label: '커뮤니티 결속', scores: [1, 5, 5, 4] },
        { label: '브랜드 스토리', scores: [3, 5, 4, 5] },
        { label: 'SNS 진정성', scores: [2, 5, 4, 5] },
        { label: '재방문율', scores: [3, 5, 5, 4] },
      ],
      scenarios: [
        { title: '커뮤니티+SNS 결합형', desc: '동네 모임·이벤트 → 인스타 릴스. MZ 단골 락인 핵심 공식.', tags: ['Instagram', '오프 이벤트', '단골 카드'] },
        { title: '브랜드 스토리 우선형', desc: '창업 스토리·재료 산지 → 콘텐츠화. 가격이 아닌 가치로 차별화.', tags: ['스토리텔링', 'Naver Blog', 'YT Shorts'] },
      ],
      source: '데이터: 중기부 빅데이터 보고서 + SNS헬프 200개 상점 분석',
    },
  },

  // 637 — 소상공인 디지털 혁신 (stats)
  {
    id: 637, slug: 'smb-digital-ai', template: statsInsights,
    spec: {
      chip: 'SMB Digital AI', illust: 'avatar-shop-owner.webp',
      chipColor: '#3B70FF', titleAccent: '#3B70FF', headerGrad: 'from-[#E8F1FF] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: 'AI·무인결제·로봇', titleLine2: '소상공인 디지털화',
      subtitle: '디지털 전환 도입 시 매출 <strong style="color:#3B70FF">+17.4%</strong>·영업이익 <strong style="color:#3B70FF">+22.3%</strong>. 정부 지원 가속화 중.',
      kpis: [
        { label: '디지털 도입률', value: '17.5', unit: '%', tag: '국내 평균', note: '중기부 2024 소상공인 디지털 전환 실태조사.' },
        { label: '매출 증가', value: '+17.4', unit: '%', tag: '도입 vs 미도입', note: '디지털 도입 소상공인이 평균 매출 17.4%↑.' },
        { label: '영업이익 증가', value: '+22.3', unit: '%', tag: '도입 vs 미도입', note: '영업이익은 매출보다 더 큰 폭 상승.' },
      ],
      sectionTitle: '도입된 디지털·AI 솔루션 비중',
      sectionSub: '국내 소상공인 디지털 도입 카테고리 (2024-2025)',
      breakdown: [
        { label: '무인 결제·키오스크', pct: 62 },
        { label: 'POS·재고 자동화', pct: 48 },
        { label: 'AI 챗봇·자동응답', pct: 28 },
        { label: '서빙·청소 로봇', pct: 15 },
        { label: 'AI 마케팅 도구 (광고·릴스)', pct: 35 },
      ],
      takeaway: '키오스크·POS 자동화가 디지털 1순위. 다음 단계는 AI 마케팅·챗봇으로 매출 직접 견인.',
      takeawayBg: '#3B70FF',
      source: '출처: 중기부 소상공인 디지털 전환 실태조사 2024',
    },
  },

  // 642 — Zapier IFTTT 인스타 자동화 (steps)
  {
    id: 642, slug: 'zapier-ifttt-insta', template: stepsGuide,
    spec: {
      chip: 'IG Automation 2025', illust: 'marketer-laptop-ai-video.webp',
      titleLine1: 'Zapier · IFTTT', titleLine2: '인스타 자동화 5단계',
      subtitle: '게시물·DM·백업·크로스포스팅을 <strong style="color:#3B70FF">코딩 없이</strong> 연동. 메타 페널티 회피 안전 룰까지.',
      summary: { steps: '5단계', time: '60분', thirdLabel: '필요 도구', thirdValue: '2종' },
      steps: [
        { title: 'Zapier·IFTTT 계정 + Instagram 연동', time: '10분', desc: 'Free 플랜으로 시작. Instagram Business 계정 OAuth 연결.', tags: ['Zapier', 'IFTTT'] },
        { title: '크로스포스팅 Zap 만들기', time: '15분', desc: 'IG 새 게시물 → Twitter/Facebook/LinkedIn 자동 발행. 트리거·액션 매핑.', tags: ['Cross-post', '5채널'] },
        { title: 'DM 자동 응답 (제한적)', time: '15분', desc: '특정 키워드 DM 수신 → 자동 답글. Meta 룰 위배 X, 1:1 대화만.', tags: ['ManyChat', 'DM Rule'] },
        { title: '게시물 백업 자동화', time: '10분', desc: 'IG 새 게시물 → Google Drive/Notion DB 자동 저장. 데이터 유실 방지.', tags: ['Google Drive', 'Notion'] },
        { title: '메타 페널티 회피 룰 점검', time: '10분', desc: '단시간 대량 작업 X. 자동 좋아요·팔로우 X. 1:1 DM만 허용.', tags: ['Meta TOS', '안전'] },
      ],
      takeaway: '자동화는 콘텐츠·데이터 동기화만. 좋아요·팔로우 자동화는 즉시 차단 — 절대 X.',
      takeawayBg: '#3B70FF',
      source: '근거: Meta TOS + Zapier/IFTTT 공식 가이드 + 자체 실험',
    },
  },

  // 647 — 로컬 SEO (steps)
  {
    id: 647, slug: 'local-seo-2025', template: stepsGuide,
    spec: {
      chip: '2025 Local SEO', illust: 'avatar-shop-owner.webp',
      chipColor: '#21B26A', titleAccent: '#21B26A', headerGrad: 'from-[#E8F7EE] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: '네이버·구글 로컬팩', titleLine2: '상위노출 5단계',
      subtitle: '소비자 <strong style="color:#21B26A">80%</strong>가 매주 지역 검색. 로컬팩 진입 = 클릭 42% 점유.',
      summary: { steps: '5단계', time: '14일', thirdLabel: '필요 채널', thirdValue: '2종' },
      steps: [
        { title: '네이버 스마트플레이스 등록·인증', time: '1일', desc: '사업자등록증 인증 + 기본 정보(영업시간·전화·주소) 완전 입력. NAP 일치.', tags: ['Naver SP', 'NAP'] },
        { title: '구글 비즈니스 프로필 동일 정보', time: '1일', desc: '네이버와 100% 같은 NAP. 카테고리·서비스 영역 정확 지정.', tags: ['GBP', 'Verification'] },
        { title: '사진 30장+ · 리뷰 10건+', time: '7일', desc: '내부·외부·메뉴·직원 사진. 첫 리뷰 10건 = 로컬팩 진입 임계점.', tags: ['Photo', 'Review'] },
        { title: '지역명+업종 키워드 게시물', time: '주 2회', desc: '"강남 카페", "홍대 미용실" 키워드를 제목·본문 자연 포함.', tags: ['Naver Blog', 'GBP Posts'] },
        { title: 'NAP 일관성 점검 (월 1회)', time: '월 1', desc: '카카오맵·잡플래닛·블로그까지 동일 NAP. 불일치 = 로컬팩 추락.', tags: ['NAP Check'] },
      ],
      takeaway: 'NAP 일관성 + 리뷰 10건 + 사진 30장이 로컬팩 진입 최소 조건. 14일이면 가능.',
      takeawayBg: '#21B26A',
      source: '근거: BrightLocal 2025 + 자체 자영업 200개 운영 데이터',
    },
  },

  // 655 — 리뷰 관리 (checklist)
  {
    id: 655, slug: 'review-management', template: checklist,
    spec: {
      chip: '리뷰 관리 Do & Don\'t', illust: 'avatar-shop-owner.webp',
      titleLine1: '소비자 97%가 본다', titleLine2: '리뷰 관리 함정',
      subtitle: '별점 <strong>0.5↓ = 클릭 20%↓</strong>. 자영업 매출 직격하는 리뷰 대응 12가지.',
      doItems: [
        { title: '24시간 내 답글', desc: '악성리뷰도 24h 내 사실 확인·정중 응대.' },
        { title: '리뷰 이벤트 정기 운영', desc: '월 1회 리뷰 작성 시 사은품·할인.' },
        { title: '사진 리뷰 우선 유도', desc: '텍스트보다 사진 리뷰가 신뢰도 3배.' },
        { title: '명백한 허위·욕설 신고', desc: '플랫폼 신고 + 형사 고소 검토.' },
        { title: '리뷰 자동화 솔루션', desc: '결제 후 자동 SMS·카톡 리뷰 요청.' },
        { title: '5점 만점 리뷰 분석', desc: '왜 만족했는지 → 서비스 강점 강화.' },
      ],
      dontItems: [
        { title: '악성리뷰 무대응·삭제 요청만', desc: '잠재 고객은 답글 없는 사장을 더 의심.' },
        { title: '감정적 반박 답글', desc: '"근거 없는 말입니다" → 화제만 키움.' },
        { title: '가짜 리뷰 작성·구매', desc: '플랫폼 AI 즉시 탐지. 별점 일괄 삭제 + 노출 페널티.' },
        { title: '리뷰 강제 요구', desc: '"리뷰 안 쓰면 서비스 X" → 1점 폭주 위험.' },
        { title: '낮은 별점 리뷰 무시', desc: '3점 리뷰가 가장 진실. 5점·1점보다 중요.' },
        { title: '한 달에 한 번 일괄 확인', desc: '리뷰 작성 후 7일이 답글 골든타임.' },
      ],
      takeaway: 'Do 6 중 24시간 답글 1개만 지켜도 별점 0.3↑. Don\'t 가짜 리뷰는 즉시 페널티.',
      source: '근거: 한국소비자원 + 자체 자영업 300건 리뷰 대응 분석',
    },
  },

  // 660 — 브랜드 스토리텔링 (steps)
  {
    id: 660, slug: 'brand-storytelling', template: stepsGuide,
    spec: {
      chip: 'Brand Storytelling', illust: 'comparison-traditional-vs-ai.webp',
      titleLine1: '팔로워 → 팬덤', titleLine2: '4단계 로드맵',
      subtitle: '팬 vs 비팬: 구매 확률 <strong style="color:#3B70FF">2.5배</strong> · LTV <strong style="color:#3B70FF">5배</strong>. Apple 케이스 데이터로 증명.',
      summary: { steps: '4단계', time: '6개월', thirdLabel: 'LTV 배수', thirdValue: '5x' },
      steps: [
        { title: '브랜드 미션·창업 스토리 정립', time: '월 1', desc: '"왜 시작했는가?" 1문장 정의. 모든 콘텐츠의 단단한 뿌리.', tags: ['Mission', 'Story Doc'] },
        { title: '톤앤매너 · 페르소나 확립', time: '월 1', desc: '"따뜻한 친구" vs "전문가" 등 1개 페르소나 고정. 일관성 유지.', tags: ['Tone & Manner', 'Persona'] },
        { title: '시각·텍스트 콘텐츠 일관 발행', time: '월 2-4', desc: '같은 톤·컬러·서사 12편 발행. The Humane Society 사례식 감성 이미지.', tags: ['IG Feed', 'YT Shorts'] },
        { title: '팬 커뮤니티 운영', time: '월 5-6', desc: 'DM·댓글 답글 100%. 진성 팬 50명 → 옹호자 → 자발적 UGC 발생.', tags: ['DM Reply', 'UGC'] },
      ],
      takeaway: '팔로워 1만보다 진성 팬 100명. 미션·톤·일관성·커뮤니티 4단계가 Apple식 팬덤 공식.',
      takeawayBg: '#1A3DA8',
      source: '데이터: NRG · Sprout Social · Fandom · Marketcast · Qualtrics 1차 38건',
    },
  },

  // 1475 — 인스타 좋아요 점검 (checklist)
  {
    id: 1475, slug: 'insta-likes-checklist', template: checklist,
    spec: {
      chip: 'IG Likes 점검', illust: 'phone-cinematic-clip.webp',
      titleLine1: '좋아요 안 늘 때', titleLine2: '5대 지표 점검',
      subtitle: '초반 1시간 반응 · CTR 3.2% · 완시율 60% · 해시태그 8-12개. <strong>5분 점검</strong>으로 잡힌다.',
      doItems: [
        { title: '초반 1시간 반응 점검', desc: '발행 60분 내 좋아요·저장·댓글 = 알고리즘 1차 신호.' },
        { title: 'CTR 3.2% 이상 유지', desc: '패션·뷰티 3.2%, IT 1.8% 기준. 미달이면 썸네일 교체.' },
        { title: '완시율 60% 목표', desc: '교육 40-50%, 엔터 65%+. 첫 3초 훅 필수.' },
        { title: '해시태그 8-12개 룰', desc: '관련성 ≥ 0.6. 인기·중간·롱테일 3:5:4 비율.' },
        { title: '저장·공유 우선 유도', desc: '저장 1건 = 좋아요 4-5건 가치 (2026 알고리즘).' },
        { title: '주 2회 같은 시간 발행', desc: '팔로워 활동 시간대 고정 = 초기 노출 안정화.' },
      ],
      dontItems: [
        { title: '해시태그 30개 도배', desc: '관련성 낮은 30개 > 정확한 10개. 노출 페널티.' },
        { title: '발행 직후 좋아요 구매', desc: '봇 좋아요 = 즉시 감지. 게시물 노출 ÷10.' },
        { title: '캡션 1줄로 끝', desc: 'IG SEO 키워드 자연 포함 캡션 100자+ 권장.' },
        { title: '같은 톤 반복', desc: 'Carousel·Reels·Story 3종 섞기. 단조 = 추천 감소.' },
        { title: '댓글 답글 X', desc: '댓글 답글은 알고리즘 활동 신호. 답글 없으면 추천 멈춤.' },
        { title: '인사이트 무시', desc: '도달·노출·저장 데이터 안 보면 다음 편 개선 0.' },
      ],
      takeaway: 'Do 6 중 초반 1시간 반응·완시율 60%만 챙겨도 좋아요 1.5-2배. Don\'t 봇 구매가 1순위 차단.',
      source: '근거: Meta Creator + SNS헬프 IG 운영 500계정 데이터',
    },
  },

  // 1503 — 인스타 좋아요 폭발 (steps)
  {
    id: 1503, slug: 'insta-likes-burst', template: stepsGuide,
    spec: {
      chip: '2025 IG Likes Burst', illust: 'phone-cinematic-clip.webp',
      chipColor: '#FF4A4A', titleAccent: '#FF4A4A', headerGrad: 'from-[#FFE8E8] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: '첫 30분이 80%', titleLine2: '좋아요 폭발 5단계',
      subtitle: '발행 <strong style="color:#FF4A4A">30분 반응</strong>이 도달 80% 결정. 릴스 완시율 65% 목표.',
      summary: { steps: '5단계', time: '24h', thirdLabel: '권장 빈도', thirdValue: '주 3회' },
      steps: [
        { title: '발행 시각 = 팔로워 활동 피크', time: '발행', desc: 'Insights → "활동" 탭에서 팔로워 최다 시간대 확인. 그 시간 ±10분에 발행.', tags: ['Insights', 'Timing'] },
        { title: '첫 30분 댓글 답글 100%', time: '30분', desc: '댓글 1개당 답글 1개. 알고리즘이 "활성 게시물"로 인식 → 노출 부스트.', tags: ['Reply', 'Boost'] },
        { title: '릴스: 첫 1.5초 훅', time: '제작', desc: '0.8초~1.5초에 시각 충격·질문·텍스트 오버레이. 완시율 65%+ 목표.', tags: ['Hook', '1.5sec'] },
        { title: '해시태그 8-12개 + 트렌딩 음원', time: '발행', desc: '관련성 높은 8-12개. 음원은 7일 상승 곡으로. 추천 진입 핵심.', tags: ['Hashtag', 'Trending'] },
        { title: '스토리 1시간 내 공유', time: '1시간', desc: '본 피드 → 자기 스토리 공유 = 팔로워 알림 + 도달 1.4배.', tags: ['Story Share'] },
      ],
      takeaway: '첫 30분에 모든 게 결정. 발행 시간 + 댓글 답글 + 스토리 공유 3개가 좋아요 폭발 공식.',
      takeawayBg: '#FF4A4A',
      source: '데이터: 자체 IG 500계정 + Meta Creator 분석 (2025)',
    },
  },

  // 1559 — 틱톡 알고리즘 (stats)
  {
    id: 1559, slug: 'tiktok-algorithm-2025', template: statsInsights,
    spec: {
      chip: '2025 TikTok Algorithm', illust: 'phone-cinematic-clip.webp',
      chipColor: '#000000', titleAccent: '#FF2C55', headerGrad: 'from-[#FFE8EC] via-[#F5EFE0] to-[#F6F8FB]',
      titleLine1: '완주율 · 반복 · 공유', titleLine2: '추천 알고리즘 신호',
      subtitle: '15-30초 = 완주율 안정. 첫 3초 이탈 <strong style="color:#FF2C55">50%↓</strong>이 추천 진입 기준선.',
      kpis: [
        { label: '추천 진입 영상 길이', value: '15-30', unit: '초', tag: '완주율 안정', note: '60초+ 영상은 완주율 절반 이하로 떨어짐.' },
        { label: '첫 3초 이탈률', value: '<50', unit: '%', tag: '추천 기준', note: '50% 이상이면 추천 풀에서 즉시 제외.' },
        { label: '반복 재생 가중치', value: '×3', unit: '', tag: '핵심 신호', note: '루프 자동 재생이 알고리즘 최고 신호.' },
      ],
      sectionTitle: '추천 알고리즘 신호 중요도',
      sectionSub: 'TikTok Creator Portal + 자체 100계정 분석',
      breakdown: [
        { label: '완주율 (Watch Through Rate)', pct: 92 },
        { label: '반복 재생 (Repeat)', pct: 78 },
        { label: '공유 (Share)', pct: 70 },
        { label: '댓글', pct: 55 },
        { label: '좋아요', pct: 40 },
      ],
      takeaway: '15-30초 + 첫 3초 훅 + 루프 가능한 마지막 컷이 추천 풀 진입 3대 공식.',
      takeawayBg: '#000000',
      source: '출처: TikTok Creator Portal 공식 + 자체 분석 (2025)',
    },
  },

  // 1583 — 유튜브 노출·구독 (stats)
  {
    id: 1583, slug: 'yt-impressions-12', template: statsInsights,
    spec: {
      chip: '2025 YouTube Growth', illust: 'marketer-laptop-ai-video.webp',
      chipColor: '#FF0000', titleAccent: '#FF0000', headerGrad: 'from-[#FFE8E8] via-[#FFF1E8] to-[#F6F8FB]',
      titleLine1: 'CTR 4% · 시청 50%', titleLine2: '구독 전환 3% 골든',
      subtitle: '업로드 후 <strong style="color:#FF0000">48시간 골든타임</strong>. 3개 지표 동시 충족이 채널 성장 공식.',
      kpis: [
        { label: 'CTR (클릭률)', value: '4', unit: '%+', tag: '미달 시 추락', note: '썸네일·제목이 결정. 미달은 즉시 교체.' },
        { label: '시청 지속률', value: '50', unit: '%+', tag: '평균', note: '엔터 65%·교육 40% 등 장르별 차등.' },
        { label: '구독 전환율', value: '3', unit: '%+', tag: '1만뷰 → 300구독', note: '엔딩 카드·구독 CTA 설계 필수.' },
      ],
      sectionTitle: '12 실행 체크리스트 카테고리별 점유',
      sectionSub: 'SNS헬프 유튜브 100채널 분석',
      breakdown: [
        { label: '썸네일·제목 (CTR)', pct: 30 },
        { label: '도입부 첫 30초 (시청 지속)', pct: 25 },
        { label: '챕터·태그·설명 (SEO)', pct: 18 },
        { label: '엔딩 카드·구독 CTA', pct: 15 },
        { label: '커뮤니티 탭 활용', pct: 12 },
      ],
      takeaway: '48시간 골든타임 내 CTR·시청·구독 3종 충족이 채널 성장 표준. 썸네일·도입부가 가장 큰 비중.',
      takeawayBg: '#FF0000',
      source: '데이터: YouTube Studio + 자체 100채널 운영 (2025)',
    },
  },

  // 1601 — 인스타 활성 팔로워 (steps)
  {
    id: 1601, slug: 'insta-active-followers', template: stepsGuide,
    spec: {
      chip: '2025 Active Followers', illust: 'phone-cinematic-clip.webp',
      titleLine1: '주 3회+ 도달', titleLine2: '활성 팔로워 5단계',
      subtitle: '활성 팔로워 = <strong style="color:#3B70FF">주 3회+ 도달 + 1회+ 참여</strong>. 도달율 30%+가 기준선.',
      summary: { steps: '5단계', time: '4주', thirdLabel: '도달율 목표', thirdValue: '30%+' },
      steps: [
        { title: '릴스 · 스토리 · 피드 3채널 균형', time: '주 단위', desc: '릴스 2 + 스토리 5 + 피드 1 비율. 한 채널 몰빵 = 도달 감소.', tags: ['Reels', 'Story', 'Feed'] },
        { title: 'DM 24시간 답글', time: '상시', desc: '답글률 90% 유지. 알고리즘이 "친밀도 높은 계정"으로 인식.', tags: ['DM Reply'] },
        { title: '스토리 인터랙션 (퀴즈·투표)', time: '주 5회', desc: '퀴즈·투표·질문 스티커. 응답 1개당 친밀도 ↑·도달 ×1.3.', tags: ['Polls', 'Quiz'] },
        { title: '저장·공유 유도 콘텐츠', time: '주 2회', desc: '"저장각", "친구 태그" 명확 CTA. 저장 1건 = 좋아요 4-5건.', tags: ['Save CTA'] },
        { title: '인사이트 30일 평가', time: '월 1', desc: '도달율 30% 미달 = 콘텐츠 컨셉 재정립. 활성 팔로워 추적.', tags: ['Insights'] },
      ],
      takeaway: '릴스·스토리·피드 균형 + DM 답글 + 인터랙션 스티커. 3주 후 도달율 30% 안정.',
      takeawayBg: '#3B70FF',
      source: '데이터: SNS헬프 IG 500계정 운영 + Meta Insights',
    },
  },

  // 1619 — 릴스 좋아요 3배 (comparison)
  {
    id: 1619, slug: 'reels-likes-3x', template: toolsComparison,
    spec: {
      chip: 'Reels Likes 3x', illust: 'phone-cinematic-clip.webp',
      titleLine1: '훅 vs 사운드 vs 자막', titleLine2: '릴스 좋아요 3배',
      subtitle: '초반 <strong style="color:#3B70FF">1.5초 훅</strong> · 트렌딩 사운드 · 해시 8-12개 · 완시율 60%. 어느 게 효과 큰가.',
      matrixTitle: '릴스 좋아요 4축 효과 비교',
      tools: [
        { name: '훅', sub: '첫 1.5초' },
        { name: '사운드', sub: '트렌딩' },
        { name: '자막', sub: '한국어' },
        { name: '해시태그', sub: '8-12개' },
      ],
      criteria: [
        { label: '도달 증가', scores: [5, 5, 3, 4] },
        { label: '완시율 영향', scores: [5, 4, 4, 2] },
        { label: '저장률 증가', scores: [4, 3, 3, 3] },
        { label: '제작 난이도', scores: [3, 5, 4, 5] },
        { label: '광고주 협업 가능성', scores: [5, 4, 3, 3] },
      ],
      scenarios: [
        { title: '훅 + 사운드 우선형', desc: '초반 1.5초 시각 충격 + 트렌딩 사운드. 도달·완시율 동시 최대화.', tags: ['Hook 1.5sec', 'Trending Audio'] },
        { title: '자막 + 해시태그 보완형', desc: '한국어 자막 + 8-12개 정확 해시. 무음 시청 85% 대응 + 추천 진입.', tags: ['Subtitle', 'Hashtag 8-12'] },
      ],
      source: '데이터: SNS헬프 릴스 1000편 + Meta Creator',
    },
  },

  // 1835 — 인스타 1만 후기 (checklist)
  {
    id: 1835, slug: 'insta-1k-real-route', template: checklist,
    spec: {
      chip: '인스타 1만 현실 후기', illust: 'avatar-shop-owner.webp',
      titleLine1: '릴스 50만 봐도', titleLine2: '팔로워 20명?',
      subtitle: '<strong>한 달 만에 1만</strong> 만든 현실 루트. 프로필·CTA·기본 팔로워 깔기 3단.',
      doItems: [
        { title: '프로필 첫 줄에 가치 제안', desc: '"무엇을 줄 수 있는지" 8단어로. 팔로우 결정의 핵심.' },
        { title: '하이라이트 5종 정비', desc: '소개·후기·메뉴·자주 묻는·연락. 클릭→팔로우 전환 자산.' },
        { title: '릴스 마지막 컷 CTA', desc: '"프로필 클릭" 또는 "팔로우". 명확 한 줄.' },
        { title: '기본 팔로워 깔기 (초기)', desc: '0→200은 자력 어려움. 검증된 한국 활성 계정으로 사회적 증거.' },
        { title: '주 5회 발행 30일', desc: '빈도 = 알고리즘 trust. 한 달 150편 = 1만 진입선.' },
        { title: '인사이트 데일리 체크', desc: '도달율 추적. 릴스 한 편이 5만→50만 폭발 패턴 포착.' },
      ],
      dontItems: [
        { title: '릴스 조회수에만 매달리기', desc: '조회 50만 = 팔로워 20명. 프로필이 더 중요.' },
        { title: '프로필 정비 없이 광고 집행', desc: '클릭은 와도 팔로우 X. 광고비 다 낭비.' },
        { title: '봇·휴면 계정 대량 구매', desc: 'Meta AI 감지. 계정 정지·노출 ÷10.' },
        { title: '메인 채널 1개에 몰빵', desc: '릴스+스토리+피드 균형. 한 채널만 = 도달 감소.' },
        { title: '댓글 답글 안 함', desc: '답글 = 알고리즘 활동 신호. 답글 0이면 추천 멈춤.' },
        { title: '7일 만에 결과 기대', desc: '1만 = 최소 30-60일. 짧으면 봇 의심받음.' },
      ],
      takeaway: '릴스 조회보다 <span style="color:#FF4A4A">프로필 + CTA + 기본 팔로워</span> 3단이 1만 진입 현실 공식.',
      source: '근거: 작성자 본인 계정 1만 운영 + SNS헬프 200계정 케이스',
    },
  },
];

// ── 출력 ─────────────────────────────────────────────────────
for (const p of posts) {
  const html = p.template(p.spec);
  const folder = `post-${p.id}-${p.slug}`;
  const out = path.join(ROOT, 'wp-content', 'drafts', 'images', folder, 'infographic.html');
  await writeFile(out, html, 'utf8');
  console.log(`✓ ${p.id} → ${folder}/infographic.html (${html.length} chars)`);
}

console.log(`\n총 ${posts.length}개 인포그래픽 HTML 생성 완료`);
