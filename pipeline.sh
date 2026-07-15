#build fresh docker images for both the front-end and back-end; running locally and not publishing to docker hub/image repository

docker build -t phillies-stats:latest .
docker build -t phillies-stats-api:latest server/

# restart front-end
kubectl rollout restart deploy/phillies-stats

sleep 10

#restart back-end
kubectl rollout restart deploy/phillies-stats-api