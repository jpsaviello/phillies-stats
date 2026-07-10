# Stage 1: compile TypeScript, then drop dev deps
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Stage 2: runtime — ODDS_API_KEY is supplied at container runtime (k8s
# Secret); omitting it is fine, /api/odds returns 503 and the client
# fails soft.
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
