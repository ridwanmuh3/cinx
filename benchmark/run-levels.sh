#!/usr/bin/env bash
# Run three repeats at 100 / 500 / 1,000 closed-loop VUs.
#
#   SCENARIO=read  ./benchmark/run-levels.sh
#   SCENARIO=hold  ./benchmark/run-levels.sh
#   SCENARIO=full-flow ./benchmark/run-levels.sh
#
# Env:
#   LEVELS="100 500 1000"    VU levels to run
#   REPEATS=3                 runs per VU level
#   THINK_TIME=30              seconds of think time between iterations
#   DURATION=10m               steady-state duration for read/hold
#   OUT=1                    additionally stream raw JSON samples
#   BENCH_SEED_CMD=...       override pre-run data/token seed command
#   BENCH_USERS=...          user pool size; must cover highest VUS
#   GATEWAY_URL=...         forwarded to k6 and the user seeder
#   K6_PROMETHEUS_RW_SERVER_URL  optional remote-write target
#
# Prereqs:
#   pnpm bench:seed
#   pnpm bench:mock-xendit (full-flow only)
#   RATE_LIMIT_ENABLED=false on the gateway

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SCENARIO="${SCENARIO:-read}"
LEVELS="${LEVELS:-100 500 1000}"
REPEATS="${REPEATS:-3}"
THINK_TIME="${THINK_TIME:-30}"
DURATION="${DURATION:-10m}"
DATA_DIR="${BENCH_DATA_DIR:-$ROOT/benchmark/.data}"
OUT="${OUT:-0}"
BENCH_USERS="${BENCH_USERS:-1000}"

case "$SCENARIO" in
  read | hold | full-flow | stress | soak | seat-contention) ;;
  *)
    echo "unknown SCENARIO: $SCENARIO" >&2
    exit 1
    ;;
esac

[[ "$REPEATS" =~ ^[1-9][0-9]*$ ]] || { echo 'REPEATS must be positive' >&2; exit 1; }
[[ "$BENCH_USERS" =~ ^[1-9][0-9]*$ ]] || { echo 'BENCH_USERS must be positive' >&2; exit 1; }
mkdir -p "$ROOT/benchmark/results"

if [[ "$SCENARIO" != 'read' && -z "${BENCH_SEED_CMD:-}" ]]; then
  for VUS in $LEVELS; do
    (( VUS <= BENCH_USERS )) || { echo 'BENCH_USERS must cover highest VUS' >&2; exit 1; }
  done
  pnpm bench:seed:users
fi

if [[ "$SCENARIO" != 'read' && -z "${BENCH_SEED_CMD:-}" && ! -s "$DATA_DIR/catalog.json" && "$SCENARIO" != 'full-flow' ]]; then
  pnpm bench:seed:catalog
fi

for VUS in $LEVELS; do
  [[ "$VUS" =~ ^[1-9][0-9]*$ ]] || { echo "invalid VUS: $VUS" >&2; exit 1; }
  for ((rep = 1; rep <= REPEATS; rep++)); do
    if [[ "$SCENARIO" != "read" ]]; then
      # Docker seed refreshes tokens; local seed reuses pool for this matrix.
      # Full-flow consumes seats permanently; reseed its catalog each repeat.
      if [[ -n "${BENCH_SEED_CMD:-}" ]]; then
        bash -c "$BENCH_SEED_CMD"
      elif [[ "$SCENARIO" == 'full-flow' ]]; then
        pnpm bench:seed:catalog
      fi
      [[ -s "$DATA_DIR/tokens.json" && -s "$DATA_DIR/catalog.json" ]] || {
        echo 'benchmark seed files missing' >&2
        exit 1
      }
    fi
    ARGS=(
      -e "VUS=$VUS"
      -e "THINK_TIME=$THINK_TIME"
      -e "DURATION=$DURATION"
      -e "GATEWAY_URL=${GATEWAY_URL:-http://localhost:3000/api/v1}"
      --summary-export "$ROOT/benchmark/results/${SCENARIO}-${VUS}-run${rep}.json"
    )
    if [[ "$SCENARIO" != 'read' ]]; then
      ARGS+=(-e "TOKEN_FILE=$DATA_DIR/tokens.json" -e "CATALOG_FILE=$DATA_DIR/catalog.json")
    fi

    if [[ "$OUT" == "1" ]]; then
      ARGS+=(--out "json=$ROOT/benchmark/results/${SCENARIO}-${VUS}-run${rep}-samples.json")
    fi
    if [[ -n "${K6_PROMETHEUS_RW_SERVER_URL:-}" ]]; then
      ARGS+=(--out experimental-prometheus-rw)
    fi

    echo "== $SCENARIO @ $VUS VUs, repeat $rep/$REPEATS, think=${THINK_TIME}s, duration=${DURATION} =="
    k6 run "${ARGS[@]}" "$ROOT/benchmark/${SCENARIO}.js"
  done
done
