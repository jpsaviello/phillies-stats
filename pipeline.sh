#!/bin/bash

# Build fresh docker images for both the front-end and back-end.
# Front-end is pushed to Docker Hub (jsaviello1/phillies-stats) and the
# cluster pulls it from there. Back-end stays local-only (imagePullPolicy:
# Never) — free Docker Hub account only allows publishing one image.

set -e

# Not a secret -- LaunchDarkly client-side IDs are meant to be public, they
# ship in the browser bundle. Read from .env.local since Vite needs it as a
# build-arg (build-time inline), not a container runtime env var.
VITE_LAUNCHDARKLY_CLIENT_SIDE_ID=$(grep -E '^VITE_LAUNCHDARKLY_CLIENT_SIDE_ID=' .env.local | cut -d '=' -f2-)

docker build \
  --build-arg VITE_LAUNCHDARKLY_CLIENT_SIDE_ID="$VITE_LAUNCHDARKLY_CLIENT_SIDE_ID" \
  -t jsaviello1/phillies-stats:latest .
docker push jsaviello1/phillies-stats:latest

docker build -t phillies-stats-api:latest server/

# restart front-end
kubectl rollout restart deploy/phillies-stats

sleep 10

#restart back-end
kubectl rollout restart deploy/phillies-stats-api

sleep 10

kubectl apply -k k8s/overlays/local
