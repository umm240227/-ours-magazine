# ours-magazine 블로그 엔진 — Railway 헤드리스 컨테이너 (jp-site-config §8, Phase 3)
# 시드 파이프라인(write→인포그래픽→audit→fact-check→md-publish) 무인 실행 + git push → Vercel.
FROM node:20-bookworm-slim

# 시스템 의존:
#  - chromium: 인포그래픽 렌더 (render-infographic.mjs, CHROME_BIN)
#  - fonts-noto-cjk: 일본어 렌더 폰트 (Tailwind/Google Fonts CDN 차단 시 fallback)
#  - python3 + pyyaml: 시드 리스트 파싱·결과 JSON 파싱 (run-railway.sh)
#  - git: 발행 후 push, curl/ca-certificates: claude 설치·외부 출처 fetch
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-noto-cjk fonts-noto-cjk-extra \
      python3 python3-yaml git ca-certificates curl bash \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PROJECT_ROOT=/app \
    NODE_ENV=production

# Claude Code CLI — 헤드리스(ANTHROPIC_API_KEY 인증, 키체인/OAuth 불필요 — B1 해소).
# 공식 설치 스크립트(비대화). 실패 시 npm 대안: npm i -g @anthropic-ai/claude-code
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY package*.json ./
# sharp(glibc prebuilt), gray-matter 등. node_modules는 .dockerignore로 제외.
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Railway가 cron 스케줄대로 이 컨테이너를 실행 → 1편 생성 후 종료.
CMD ["bash", "script/cron/run-railway.sh"]
