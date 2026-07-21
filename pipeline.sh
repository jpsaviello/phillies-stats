#!/bin/bash

# Build fresh docker images for both the front-end and back-end.
# Front-end is pushed to Docker Hub (jsaviello1/phillies-stats) and the
# cluster pulls it from there. Back-end stays local-only (imagePullPolicy:
# Never) — free Docker Hub account only allows publishing one image.

set -e

docker build -t jsaviello1/phillies-stats:latest .
docker push jsaviello1/phillies-stats:latest

docker build -t phillies-stats-api:latest server/

# restart front-end
kubectl rollout restart deploy/phillies-stats

sleep 10

#restart back-end
kubectl rollout restart deploy/phillies-stats-api

sleep 10

kubectl apply -k k8s/overlays/local
