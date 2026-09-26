# apps/api/Dockerfile: one image for the AbotKamay API and the media worker.
#   API     node dist/main.js     the default CMD (Render web service)
#   Worker  node dist/worker.js   same image, dockerCommand override (Render background worker)
#
# Build from the REPOSITORY ROOT: the npm workspaces share one package-lock.json.
#   docker build -f apps/api/Dockerfile -t abotkamay-api .
#   docker run --rm -p 4000:10000 --env-file .env abotkamay-api
#
# Stages: build (all dependencies, Prisma client, nest build) -> prod-deps (runtime dependencies
# only) -> runtime (Debian slim + ffmpeg + libheif, non-root, tini as PID 1). Migrations are not run
# from this image: CI applies them (.github/workflows/ci.yml, migrate-neon) and /health/ready keeps a
# new deploy out of rotation until they are applied (src/health/health.controller.ts).

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# ---------------------------------------------------------------------------------------------- build
FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# npm ci checks every workspace listed in the lockfile; only the web app's manifest is needed.
COPY apps/web/package.json apps/web/
# The API's postinstall runs `prisma generate`, which reads these.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci --workspace @abotkamay/api
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json apps/api/
COPY apps/api/src apps/api/src
RUN npm run build --workspace @abotkamay/api

# ------------------------------------------------------------------------------------------ prod-deps
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/scripts/prune-runtime-deps.mjs apps/api/scripts/
# --ignore-scripts: the generated Prisma client is compiled into dist, and sharp ships prebuilt
# linux-x64 binaries (@img/sharp-linux-x64), so no install script is needed at runtime.
# The prune drops the Prisma CLI, Prisma Studio, PGlite, TypeScript and React, which --omit=dev keeps
# because they are optional peers of @prisma/client: about half of node_modules, never loaded.
RUN npm ci --workspace @abotkamay/api --omit=dev --ignore-scripts \
 && node apps/api/scripts/prune-runtime-deps.mjs

# -------------------------------------------------------------------------------------------- runtime
FROM base AS runtime
# ffmpeg/ffprobe: video re-encoding; libheif-examples: heif-convert for iPhone HEIC photos;
# tini: forwards SIGTERM and reaps ffmpeg children; ca-certificates: TLS to Neon and object storage.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libheif-examples tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=10000
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node apps/api/package.json apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
# Read by /health/ready to spot pending migrations.
COPY --chown=node:node apps/api/prisma/migrations apps/api/prisma/migrations

WORKDIR /app/apps/api
USER node
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
