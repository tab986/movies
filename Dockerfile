# GameWise backend — use this image when your platform builds from the repo (e.g. branch `3bdl`).
# Bookworm-based Node image avoids Ubuntu Noble mirror flakes; apt retries still guard `apt-get update`.
FROM node:20-bookworm-slim

RUN printf '%s\n' \
  'Acquire::Retries "5";' \
  'Acquire::http::Timeout "120";' \
  'Acquire::https::Timeout "120";' \
  > /etc/apt/apt.conf.d/80-retries

RUN set -eux; \
  i=1; \
  while [ "$i" -le 5 ]; do \
    apt-get update && break; \
    echo "apt-get update failed (attempt $i/5), retrying..." >&2; \
    sleep 15; \
    i=$((i + 1)); \
  done; \
  apt-get install -y --no-install-recommends ca-certificates; \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# sequelize/pg live under devDependencies today — install full tree until deps are reorganized
RUN npm ci

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
