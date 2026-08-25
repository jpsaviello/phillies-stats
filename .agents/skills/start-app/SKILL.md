---
name: start-app
description: Use when asked to run, start, or launch the phillies-stats app locally, or to confirm a change works in the running app.
---

# Start phillies-stats Locally

## Launch

```powershell
Set-Location C:\Users\savie\Codex-projects\phillies-stats; npm run dev
```

Run this in PowerShell with `run_in_background: true`. Check output after ~3 seconds.

- Default port: **5173** (increments to 5174, 5175... if taken)
- App URL: **http://localhost:5173**

## Kill a port

If a stale dev server is occupying a port:

```powershell
$proc = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
if ($proc) { Stop-Process -Id $proc -Force }
```

Replace `5173` with the actual port. `TimeWait` connections after kill are normal -- the port is free.

## Notes

- Use PowerShell (`run_in_background: true`), not Bash -- the Bash `&` background operator is not allowed in PowerShell and will fail.
- `node_modules` is already present; no `npm install` needed unless dependencies changed.
