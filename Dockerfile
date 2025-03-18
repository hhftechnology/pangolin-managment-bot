FROM node:19-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json /app
RUN npm install

# Copy the rest of the application
COPY . .

ENV DISCORD_TOKEN "" \
    DISCORD_CLIENT_ID "" \
    DISCORD_GUILD_ID ""

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "try { require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"

CMD [ "node", "index.js" ]