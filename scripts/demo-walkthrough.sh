#!/usr/bin/env bash
# Demo walkthrough: register → list showtime → hold seats → pay → ticket lookup.
#
# Prerequisites:
#   pnpm infra:up
#   pnpm --filter @ticketing/user-service seed:admin   # optional
#   pnpm --filter @ticketing/cinema-service seed
#   pnpm build && pnpm dev                            # gateway :3000 + services
#
# Usage:
#   ./scripts/demo-walkthrough.sh
#   GATEWAY_URL=http://127.0.0.1:3000 ./scripts/demo-walkthrough.sh

set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000/api/v1}"
DEMO_EMAIL="${DEMO_EMAIL:-demo-$(date +%s)@example.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-demo1234}"
DEMO_NAME="${DEMO_NAME:-Demo User}"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

need_cmd curl
need_cmd python3

json_get() {
  # json_get '<json>' 'python expr using obj'
  local raw="$1"
  local expr="$2"
  DEMO_JSON="$raw" python3 -c "import json,os; obj=json.loads(os.environ['DEMO_JSON']); print($expr)"
}

http() {
  # http METHOD PATH [json-body]
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local args=(-sS -X "$method" "${GATEWAY_URL}${path}" -H 'Content-Type: application/json' -H 'Accept: application/json')
  if [[ -n "${TOKEN:-}" ]]; then
    args+=(-H "Authorization: Bearer ${TOKEN}")
  fi
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  curl "${args[@]}"
}

bold "1. Health check"
HEALTH="$(http GET /health)" || die "gateway unreachable at ${GATEWAY_URL}"
STATUS="$(json_get "$HEALTH" "obj.get('status')" 2>/dev/null || true)"
[[ "$STATUS" == "ok" ]] || die "unexpected health response (is pnpm dev running?): $HEALTH"
ok "GET ${GATEWAY_URL}/health → status=ok"

bold "2. Register demo user (${DEMO_EMAIL})"
REG="$(http POST /auth/register "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\",\"name\":\"${DEMO_NAME}\"}" || true)"
if echo "$REG" | python3 -c "import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if 'id' in d else 1)" 2>/dev/null; then
  ok "registered user id=$(json_get "$REG" "obj['id']")"
else
  ok "register returned non-user payload (may already exist) — continuing to login"
fi

bold "3. Login"
LOGIN="$(http POST /auth/login "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")"
TOKEN="$(json_get "$LOGIN" "obj['accessToken']")"
[[ -n "$TOKEN" ]] || die "login failed: $LOGIN"
ok "got accessToken (${#TOKEN} chars)"

bold "4. List showtimes"
SHOWTIMES="$(http GET '/showtimes?page=1&limit=5')"
SHOWTIME_ID="$(json_get "$SHOWTIMES" "obj['items'][0]['id']")"
MOVIE_TITLE="$(json_get "$SHOWTIMES" "obj['items'][0]['movie']['title']")"
[[ -n "$SHOWTIME_ID" ]] || die "no showtimes — run: pnpm --filter @ticketing/cinema-service seed\n$SHOWTIMES"
ok "showtime=${SHOWTIME_ID} movie=${MOVIE_TITLE}"

bold "5. Fetch seat map"
SEATS="$(http GET "/showtimes/${SHOWTIME_ID}/seats")"
SEAT_IDS="$(json_get "$SEATS" "','.join([s['id'] for s in obj['seats'] if not s.get('isDisabled')][:2])")"
[[ -n "$SEAT_IDS" ]] || die "no available seats in map: $SEATS"
SEAT_JSON="$(json_get "$SEATS" "__import__('json').dumps([s['id'] for s in obj['seats'] if not s.get('isDisabled')][:2])")"
ok "holding seats: ${SEAT_IDS}"

bold "6. Hold seats"
HOLD="$(http POST /bookings/holds "{\"showtimeId\":\"${SHOWTIME_ID}\",\"seatIds\":${SEAT_JSON}}")"
BOOKING_ID="$(json_get "$HOLD" "obj.get('bookingId') or obj.get('id')")"
[[ -n "$BOOKING_ID" ]] || die "hold failed: $HOLD"
ok "bookingId=${BOOKING_ID} status=$(json_get "$HOLD" "obj.get('status')") expiresAt=$(json_get "$HOLD" "obj.get('expiresAt')")"

bold "7. Pay (Xendit invoice)"
PAID="$(http POST "/bookings/${BOOKING_ID}/pay" '{}')"
CHECKOUT_URL="$(json_get "$PAID" "obj.get('checkoutUrl')")"
INVOICE_ID="$(json_get "$PAID" "obj.get('invoiceId')")"
[[ -n "$CHECKOUT_URL" && -n "$INVOICE_ID" ]] || die "pay did not create an invoice: $PAID"
ok "invoice ${INVOICE_ID}"
echo "  Pay here: ${CHECKOUT_URL}"
echo "  Complete payment in Xendit, then the webhook confirms the booking."

BOOKING="$(http GET "/bookings/${BOOKING_ID}")"
STATUS="$(json_get "$BOOKING" "obj.get('status')")"
ok "booking status=${STATUS} (PENDING until the Xendit webhook fires)"
TICKET_CODES="$(json_get "$BOOKING" "','.join([t['code'] for t in obj.get('tickets') or []])")"
if [[ -n "$TICKET_CODES" ]]; then
  ok "tickets: ${TICKET_CODES}"
else
  echo "  (no tickets yet — pay the invoice first)"
fi

bold "8. Public ticket lookup"
FIRST_CODE="${TICKET_CODES%%,*}"
LOOKUP="$(http GET "/tickets/${FIRST_CODE}")"
ok "ticket ${FIRST_CODE} → movie=$(json_get "$LOOKUP" "obj.get('movieTitle')") seat=$(json_get "$LOOKUP" "f\"{obj.get('row')}{obj.get('number')}\"")"

bold "Done"
echo "  Gateway:  ${GATEWAY_URL}"
echo "  User:     ${DEMO_EMAIL} / ${DEMO_PASSWORD}"
echo "  Booking:  ${BOOKING_ID}"
echo "  Tickets:  ${TICKET_CODES}"
