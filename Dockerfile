# Stage 1: build the static site
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars at build time, so the odds API key must be
# supplied here as a build arg, not at container runtime. Omitting it is
# fine: odds silently don't render (Schedule.tsx swallows the failure).
ARG VITE_ODDS_API_KEY
ENV VITE_ODDS_API_KEY=$VITE_ODDS_API_KEY

RUN npm run build

# Stage 2: serve dist/ with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
