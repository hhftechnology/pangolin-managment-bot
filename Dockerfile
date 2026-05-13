FROM node:19-slim

ENV TZ=UTC

WORKDIR /app

# Install tzdata on Debian
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
  && echo $TZ > /etc/timezone \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /app
RUN npm install

COPY . .

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "try { require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch { process.exit(1); }"

CMD ["node", "index.js"]