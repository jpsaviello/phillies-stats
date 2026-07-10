# Local Docker Desktop Kubernetes Deployment (Phillies Stats)

This is the setup actually in use for local Kubernetes testing — Docker
Desktop's built-in single-node cluster (kubeadm-based), not the
Multipass/k3s VM described in `local-k3s-deployment-plan.md` (that doc was
an earlier plan and was not the path taken).

## Why this is simpler than the k3s/Multipass plan

Docker Desktop's Kubernetes shares the same image store as `docker build` —
there is no VM, no `docker save` / `multipass transfer` / `ctr images
import` step. An image built locally is immediately usable by the cluster.

## Prerequisites

- Docker Desktop with Kubernetes enabled (Settings → Kubernetes → Enable
  Kubernetes). This provisions a single-node kubeadm cluster and points
  `kubectl`'s `docker-desktop` context at it automatically.

## 1. Build the image

```bash
docker build -t phillies-stats:latest .
```

(Add `--build-arg VITE_ODDS_API_KEY=...` if you want odds to render — see
the Dockerfile comment; omitting it just means odds silently don't show.)

## 2. Manifests (`k8s/`)

Structured as Kustomize base + overlays so future environments (staging,
etc.) can patch the base without duplicating it:

- `k8s/base/deployment.yaml` — Deployment, `imagePullPolicy: Never` (image
  is local, not in a registry).
- `k8s/base/service.yaml` — NodePort service, `nodePort: 30080`.
- `k8s/base/ingress.yaml` — Ingress routing host `phillies-stats.com` → the
  service, `ingressClassName: nginx`.
- `k8s/base/kustomization.yaml` — lists all three as resources.
- `k8s/overlays/local/kustomization.yaml` — references `../../base`; no
  patches yet since local is currently the only environment.

Apply everything with:

```bash
kubectl apply -k k8s/overlays/local
```

To add another environment later, create
`k8s/overlays/<env>/kustomization.yaml` referencing `../../base` plus
whatever patches differ (image tag, ingress host, replicas, etc.) — leave
`base/` untouched. Example — a hypothetical `prod` overlay running 4
replicas instead of base's 1 (not created; no real prod target exists for
this app, which deploys to Vercel per CLAUDE.md):

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - target:
      kind: Deployment
      name: phillies-stats
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 4
```

## 3. Ingress controller (one-time per cluster)

Docker Desktop's cluster doesn't ship an ingress controller by default.
Install ingress-nginx:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/cloud/deploy.yaml
```

This creates a `LoadBalancer` service that Docker Desktop automatically
exposes on `localhost:80`/`:443`.

**Note:** right after installing, the admission webhook pod takes a few
seconds to come up. If `kubectl apply -k k8s/overlays/local` (or any
`Ingress` apply) fails with something like:

```
Internal error occurred: failed calling webhook "validate.nginx.ingress.kubernetes.io": ... connect: connection refused
```

just wait ~20-30s for `kubectl get pods -n ingress-nginx` to show the
controller pod `Running`, then re-apply.

## 4. Hosts entry

```bash
sudo sh -c 'echo "127.0.0.1 phillies-stats.com" >> /etc/hosts'
```

## 5. Access

- Via ingress hostname: `http://phillies-stats.com`
- Via NodePort directly: `http://localhost:30080`
- Via port-forward (alternative to NodePort): `kubectl port-forward svc/phillies-stats 8080:80` → `http://localhost:8080`

## 6. Re-deploy workflow after a code change

`imagePullPolicy: Never` means the cluster won't notice a rebuilt image
with the same tag on its own:

```bash
docker build -t phillies-stats:latest .
kubectl rollout restart deployment/phillies-stats
```

No image transfer step needed (unlike the k3s/Multipass plan) since the
image store is shared with the cluster.

## Useful checks

```bash
kubectl get pods                       # app pod status
kubectl get svc phillies-stats         # service/NodePort
kubectl get ingress phillies-stats     # ingress host/address
kubectl get pods -n ingress-nginx      # controller status
```
