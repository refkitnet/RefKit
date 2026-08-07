# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG BUILD_NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46
ARG RUNTIME_NODE_IMAGE=gcr.io/distroless/nodejs22-debian13:nonroot@sha256:939d6f1671529d230f50b563578e9b5d206af58f038b10ebd7e1233023d4e167

FROM ${BUILD_NODE_IMAGE} AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN npm ci

ARG REFKIT_VERSION
ARG VCS_REF
ARG SOURCE_URL

RUN test -n "${REFKIT_VERSION}" \
    && test "${REFKIT_VERSION}" != "development" \
    && test -n "${VCS_REF}" \
    && test "${VCS_REF}" != "unknown" \
    && test -n "${SOURCE_URL}"

ENV REFKIT_BUILD_STANDALONE=true \
    REFKIT_BUILD_VERSION=${REFKIT_VERSION} \
    REFKIT_SOURCE_REVISION=${VCS_REF} \
    REFKIT_SOURCE_URL=${SOURCE_URL}

RUN npm run build -w @refkitnet/app
RUN find /app/apps/app/.next/standalone/node_modules -type d \
    \( -name sharp -o -path '*/@img/sharp-*' \) \
    -prune -exec rm -rf '{}' +
RUN node apps/app/scripts/self-hosted/runtime-metadata.mjs write /tmp/runtime-metadata.json
RUN mkdir -p /tmp/refkit-runtime/var/lib/refkit/uploads

FROM ${RUNTIME_NODE_IMAGE} AS runner

ARG REFKIT_VERSION
ARG VCS_REF
ARG SOURCE_URL

LABEL org.opencontainers.image.title="RefKit" \
      org.opencontainers.image.description="Self-hosted affiliate infrastructure" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${REFKIT_VERSION}" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    REFKIT_BUILD_STANDALONE=true \
    PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    UPLOADS_DIR=/var/lib/refkit/uploads \
    REFKIT_BUILD_VERSION=${REFKIT_VERSION} \
    REFKIT_SOURCE_REVISION=${VCS_REF} \
    REFKIT_SOURCE_URL=${SOURCE_URL} \
    REFKIT_RUNTIME_METADATA_FILE=/app/runtime-metadata.json

COPY --from=builder --chown=65532:65532 /tmp/refkit-runtime/var/lib/refkit /var/lib/refkit
COPY --from=builder /app/apps/app/.next/standalone ./
COPY --from=builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder /app/apps/app/public ./apps/app/public
COPY --from=builder /app/apps/app/src/db/migrations ./apps/app/src/db/migrations
COPY --from=builder /app/apps/app/scripts/self-hosted ./apps/app/scripts/self-hosted
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder /tmp/runtime-metadata.json ./runtime-metadata.json
COPY --from=builder /app/LICENSE /app/LICENSES.md /app/NOTICE /app/THIRD_PARTY_NOTICES.md /app/TRADEMARKS.md ./legal/

USER 65532:65532

EXPOSE 3000
VOLUME ["/var/lib/refkit/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["apps/app/server.js"]
