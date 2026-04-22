FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install dependencies
COPY dashboard/package.json dashboard/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
COPY dashboard/ .
RUN pnpm build

# Cloud Run injects PORT=8080
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-8080} -H 0.0.0.0"]
