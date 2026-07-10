# Local k3s Deployment Plan (Phillies Stats)

## Goal

Run the `phillies-stats` Docker image on a real k3s cluster locally and access
it from the Mac browser.

## Why a VM is involved

k3s is a full Kubernetes distribution, not a Docker wrapper (that's k3d) — it
requires a Linux kernel and doesn't run natively on macOS. Multipass (already
installed) is used to create a lightweight Ubuntu VM to host it. k3s uses
containerd directly, not the Docker daemon, and the VM won't have Docker
installed — images get imported into containerd directly rather than pulled
from a registry.

## Prerequisites

- Docker Desktop — already installed, used to build the image
- Multipass — already installed, used to create the Linux VM
- `kubectl` on the Mac (`brew install kubectl` if not already present)

## Steps

### 1. Build the image (already done)

```bash
docker build -t phillies-stats:latest .
```

### 2. Create the VM

```bash
multipass launch --name k3s-vm --cpus 2 --memory 4G --disk 20G 22.04
```

### 3. Install k3s inside the VM

```bash
multipass exec k3s-vm -- bash -c "curl -sfL https://get.k3s.io | sh -"
```

### 4. Pull the kubeconfig to the Mac

```bash
multipass exec k3s-vm -- sudo cat /etc/rancher/k3s/k3s.yaml > ~/.kube/k3s-local-config
multipass info k3s-vm   # note the IPv4 address, e.g. 192.168.64.12
sed -i '' "s/127.0.0.1/<VM_IP>/" ~/.kube/k3s-local-config
```

Use with either:

```bash
export KUBECONFIG=~/.kube/k3s-local-config
# or
kubectl --kubeconfig ~/.kube/k3s-local-config <command>
```

### 5. Get the image into the VM's containerd

```bash
docker save phillies-stats:latest -o phillies-stats.tar
multipass transfer phillies-stats.tar k3s-vm:/home/ubuntu/phillies-stats.tar
multipass exec k3s-vm -- sudo k3s ctr images import /home/ubuntu/phillies-stats.tar
```

### 6. Write k8s manifests

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: phillies-stats
spec:
  replicas: 1
  selector:
    matchLabels:
      app: phillies-stats
  template:
    metadata:
      labels:
        app: phillies-stats
    spec:
      containers:
        - name: phillies-stats
          image: phillies-stats:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 80
```

Create `k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: phillies-stats
spec:
  type: NodePort
  selector:
    app: phillies-stats
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
```

### 7. Apply manifests

```bash
kubectl --kubeconfig ~/.kube/k3s-local-config apply -f k8s/
```

### 8. Access from the Mac

Two options:

- **NodePort** (direct, no extra process): open `http://<VM_IP>:30080`
  (Multipass VM IP is reachable from the host network — same IP noted in
  step 4).
- **Port-forward** (if you'd rather use localhost):
  ```bash
  kubectl --kubeconfig ~/.kube/k3s-local-config port-forward svc/phillies-stats 8080:80
  ```
  then open `http://localhost:8080`.

### 9. Re-deploy workflow for future changes

`imagePullPolicy: Never` means k8s won't notice a rebuilt image with the same
tag on its own. After rebuilding:

```bash
docker save phillies-stats:latest -o phillies-stats.tar
multipass transfer phillies-stats.tar k3s-vm:/home/ubuntu/phillies-stats.tar
multipass exec k3s-vm -- sudo k3s ctr images import /home/ubuntu/phillies-stats.tar
kubectl --kubeconfig ~/.kube/k3s-local-config rollout restart deployment/phillies-stats
```

## Notes / open questions

- The odds feature (`VITE_ODDS_API_KEY`) is baked in at `docker build` time
  via `--build-arg`. If you rebuild for this deployment and want odds to
  work, pass the build arg again.
- Tearing down: `multipass delete k3s-vm && multipass purge` removes the VM
  entirely.
