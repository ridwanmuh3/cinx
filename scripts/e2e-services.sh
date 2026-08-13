#!/usr/bin/env bash
# Boot the full backend stack for Playwright E2E tests (foreground).
# Builds once, starts all 4 services, and waits until the gateway is healthy.
# Ctrl-C / process kill stops the whole group.
#
# Usage:
#   ./scripts/e2e-services.sh
#   E2E_HEALTH_TIMEOUT=120 ./scripts/e2e-services.sh

set -euo pipefail

cd "$(dirname "$0")/.."

HEALTH_TIMEOUT="${E2E_HEALTH_TIMEOUT:-120}"

cleanup() {
  trap - INT TERM EXIT
  kill 0 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Free the service ports first so a leftover stack never causes
# EADDRINUSE. Set E2E_REUSE_SERVICES=1 to keep an already-running stack.
SERVICE_PORTS=(3000 3001 3002 3003)
free_ports() {
  for port in "${SERVICE_PORTS[@]}"; do
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
      pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u)
      for pid in $pids; do
        echo "==> [e2e] freeing :$port (pid $pid)"
        kill "$pid" 2>/dev/null || true
      done
    fi
  done
  sleep 1
}

if [ "${E2E_REUSE_SERVICES:-0}" = "1" ]; then
  echo "==> [e2e] E2E_REUSE_SERVICES=1 — reusing running stack"
else
  free_ports
fi

echo "==> [e2e] building all packages"
pnpm build

echo "==> [e2e] starting microservices"
node apps/user-service/dist/main.js &
node apps/cinema-service/dist/main.js &
node apps/ticket-service/dist/main.js &
node apps/gateway/dist/main.js &

echo "==> [e2e] waiting for gateway health on :3000/api/v1/health"
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
    echo "==> [e2e] gateway healthy after ${i}s"
    break
  fi
  if ! kill -0 $! 2>/dev/null; then
    echo "ERROR: [e2e] a service exited early — see output above" >&2
    exit 1
  fi
  sleep 1
done

if ! curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
  echo "ERROR: [e2e] gateway did not become healthy within ${HEALTH_TIMEOUT}s" >&2
  exit 1
fi

echo "==> [e2e] stack is up (Ctrl-C to stop)"
wait
