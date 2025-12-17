FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV PAGSMILE_APP_ID=
ENV PAGSMILE_SECURITY_KEY=
ENV PAGSMILE_PUBLIC_KEY=
ENV PAGSMILE_ENVIRONMENT=sandbox
ENV PAGSMILE_NOTIFY_URL=http://localhost:3000/api/webhook/payment
ENV PAGSMILE_RETURN_URL=http://localhost:3000/success

COPY --from=deps /app/node_modules ./node_modules
COPY . .

USER bun
EXPOSE 3000

CMD ["bun", "run", "index.ts"]
