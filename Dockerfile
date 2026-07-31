# Stage 1: build the static site
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_-prefixed vars at build time, so it must be passed in
# as a build-arg here -- it's not read at container runtime like the
# backend's env vars are. Not a secret: LaunchDarkly client-side IDs are
# meant to be public, they ship in the browser bundle either way.
ARG VITE_LAUNCHDARKLY_CLIENT_SIDE_ID
ENV VITE_LAUNCHDARKLY_CLIENT_SIDE_ID=$VITE_LAUNCHDARKLY_CLIENT_SIDE_ID

RUN npm run build

# Stage 2: serve dist/ with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
