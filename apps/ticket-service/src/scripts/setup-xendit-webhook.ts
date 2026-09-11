/**
 * Registers the Xendit invoice webhook URL via the Xendit API and verifies
 * the local callback token matches the one Xendit will actually send.
 *
 * Usage (from repo root, with .env loaded — e.g. via `pnpm --filter ... exec`):
 *
 *   pnpm --filter @ticketing/ticket-service exec tsx src/scripts/setup-xendit-webhook.ts
 *
 * Required env:
 *   XENDIT_SECRET_KEY     — Xendit secret API key (Basic auth username)
 *   XENDIT_WEBHOOK_URL    — public HTTPS URL of the gateway webhook endpoint
 *                           (https://<host>/api/v1/payments/xendit/webhook)
 *   XENDIT_WEBHOOK_TOKEN  — the webhook verification token from Dashboard →
 *                           Settings → Developers → Webhooks. If Xendit
 *                           returns a different token, the script tells you
 *                           to update it (tokens are secrets; it is NOT
 *                           printed).
 *
 * API: POST /callback_urls/{type} — https://docs.xendit.co/apidocs/set-webhook-url
 */
import {
  XENDIT_API_URL,
  XENDIT_SECRET_KEY,
  XENDIT_WEBHOOK_TOKEN,
} from '@ticketing/shared';

const WEBHOOK_TYPE = 'invoice' as const;

function assertConfigured(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`[xendit-setup] Missing ${name} in environment.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const secretKey = assertConfigured('XENDIT_SECRET_KEY', XENDIT_SECRET_KEY);
  const webhookUrl = assertConfigured('XENDIT_WEBHOOK_URL', process.env.XENDIT_WEBHOOK_URL);

  // Basic auth: secret key as username, empty password (trailing colon).
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
  const apiUrl = XENDIT_API_URL.replace(/\/$/, '');

  const endpoint = new URL(webhookUrl);
  if (endpoint.protocol !== 'https:') {
    console.error(
      '[xendit-setup] XENDIT_WEBHOOK_URL must be HTTPS — Xendit rejects plain HTTP.',
    );
    process.exit(1);
  }
  if (!endpoint.pathname.endsWith('/api/v1/payments/xendit/webhook')) {
    console.error(
      `[xendit-setup] Warning: expected the URL path to end with /api/v1/payments/xendit/webhook (got ${endpoint.pathname})`,
    );
  }

  console.log(`[xendit-setup] Registering ${WEBHOOK_TYPE} webhook → ${endpoint.origin}${endpoint.pathname}`);

  const res = await fetch(`${apiUrl}/callback_urls/${WEBHOOK_TYPE}`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const payload = (await res.json().catch(() => null)) as {
    status?: string;
    url?: string;
    environment?: string;
    callback_token?: string;
    error_code?: string;
    message?: string;
  } | null;

  if (!res.ok || !payload) {
    console.error(
      `[xendit-setup] FAILED (${res.status}): ${payload?.error_code ?? 'no body'} — ${payload?.message ?? res.statusText}`,
    );
    process.exit(1);
  }

  if (payload.status !== 'SUCCESSFUL') {
    console.error(`[xendit-setup] Unexpected status: ${payload.status}`);
    process.exit(1);
  }

  console.log(`[xendit-setup] Registered OK (environment: ${payload.environment})`);
  console.log(`[xendit-setup] URL: ${payload.url}`);

  // Cross-check the verification token. Never print either value.
  if (!XENDIT_WEBHOOK_TOKEN) {
    console.warn(
      '[xendit-setup] XENDIT_WEBHOOK_TOKEN is not set — set it in .env, otherwise every webhook will be rejected with 401 by payment verification.',
    );
    process.exit(1);
  }
  if (!payload.callback_token) {
    console.log(
      '[xendit-setup] Xendit did not return the callback token in the response; verify XENDIT_WEBHOOK_TOKEN matches Dashboard → Settings → Developers → Webhooks manually.',
    );
    return;
  }
  if (payload.callback_token !== XENDIT_WEBHOOK_TOKEN) {
    console.error(
      '[xendit-setup] TOKEN MISMATCH: XENDIT_WEBHOOK_TOKEN in .env does not match the token Xendit will send. Update XENDIT_WEBHOOK_TOKEN (Dashboard → Settings → Developers → Webhooks shows the same value) and re-run.',
    );
    process.exit(1);
  }
  console.log('[xendit-setup] XENDIT_WEBHOOK_TOKEN matches — webhook fully configured.');
}

main().catch((err: unknown) => {
  console.error('[xendit-setup] FAILED', err instanceof Error ? err.message : err);
  process.exit(1);
});
