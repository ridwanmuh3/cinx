#!/usr/bin/env node
// Minimal Xendit API double for load tests.
//
// It implements only the endpoints used by payment-service:
//   POST /v2/invoices
//   GET  /v2/invoices/:id
//   POST /invoices/:id/expire!
//   POST /refunds
//   GET  /refunds/:id
//
// By default it settles each invoice after SETTLE_DELAY_MS by POSTing a
// signed callback to the gateway, so the full saga completes:
//   hold -> pay -> payment.settled -> booking.confirmed -> tickets.issued
//
// Env:
//   PORT=8099
//   GATEWAY_WEBHOOK_URL=http://127.0.0.1:3000/api/v1/payments/xendit/webhook
//   XENDIT_WEBHOOK_TOKEN=benchmark-webhook-token
//   AUTO_SETTLE=true
//   SETTLE_DELAY_MS=1000
//   LATENCY_MS=0
//   FAIL_RATE=0          probability of a 500 on invoice creation
//   RATE_LIMIT_RATE=0    probability of a 429 on invoice creation
//   DUPLICATE_WEBHOOK=false
//
// This server is intentionally test-only and has no rate limiter of its own.

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8099);
const GATEWAY_WEBHOOK_URL =
  process.env.GATEWAY_WEBHOOK_URL ||
  'http://127.0.0.1:3000/api/v1/payments/xendit/webhook';
const WEBHOOK_TOKEN =
  process.env.XENDIT_WEBHOOK_TOKEN || 'benchmark-webhook-token';
const AUTO_SETTLE = (process.env.AUTO_SETTLE || 'true') !== 'false';
const SETTLE_DELAY_MS = Number(process.env.SETTLE_DELAY_MS || 1000);
const LATENCY_MS = Number(process.env.LATENCY_MS || 0);
const FAIL_RATE = Number(process.env.FAIL_RATE || 0);
const RATE_LIMIT_RATE = Number(process.env.RATE_LIMIT_RATE || 0);
const DUPLICATE_WEBHOOK = (process.env.DUPLICATE_WEBHOOK || 'false') === 'true';
const MAX_BODY_BYTES = 1024 * 1024;

const invoices = new Map();
const refunds = new Map();
const stats = {
  invoicesCreated: 0,
  refundsCreated: 0,
  callbacksSent: 0,
  callbackFailures: 0,
  failuresInjected: 0,
  rateLimited: 0,
};

let invoiceSeq = 0;
let refundSeq = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('request body too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function buildInvoice(input) {
  const id = `inv_bench_${++invoiceSeq}_${randomUUID().slice(0, 8)}`;
  const now = new Date();
  return {
    id,
    external_id: input.external_id,
    amount: input.amount,
    currency: input.currency || 'IDR',
    description: input.description || '',
    payer_email: input.payer_email || null,
    status: 'PENDING',
    invoice_url: `http://mock-xendit.local/checkout/${id}`,
    expiry_date: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    created: now.toISOString(),
    updated: now.toISOString(),
  };
}

async function postWebhook(invoice) {
  const payload = {
    id: invoice.id,
    external_id: invoice.external_id,
    status: 'PAID',
    paid_at: invoice.paid_at,
    payment_method: 'EWALLET',
    payment_channel: 'OVO',
    paid_amount: invoice.amount,
    amount: invoice.amount,
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(GATEWAY_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-callback-token': WEBHOOK_TOKEN,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        stats.callbacksSent += 1;
        if (DUPLICATE_WEBHOOK) {
          stats.callbacksSent += 1;
          await fetch(GATEWAY_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-callback-token': WEBHOOK_TOKEN,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
          });
        }
        return;
      }
      console.error(
        `[xendit-mock] webhook ${invoice.id} attempt ${attempt}: HTTP ${response.status}`,
      );
    } catch (error) {
      console.error(
        `[xendit-mock] webhook ${invoice.id} attempt ${attempt}: ${error.message}`,
      );
    }
    await sleep(250 * attempt);
  }
  stats.callbackFailures += 1;
}

async function settleInvoice(invoice) {
  if (invoice.status !== 'PENDING') return;
  invoice.status = 'PAID';
  invoice.paid_at = new Date().toISOString();
  invoice.updated = invoice.paid_at;
  await postWebhook(invoice);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method === 'GET' && path === '/stats') {
    return sendJson(res, 200, {
      ...stats,
      invoices: invoices.size,
      refunds: refunds.size,
    });
  }

  if (req.method === 'POST' && path === '/v2/invoices') {
    if (LATENCY_MS > 0) await sleep(LATENCY_MS);
    if (Math.random() < RATE_LIMIT_RATE) {
      stats.rateLimited += 1;
      return sendJson(
        res,
        429,
        { error_code: 'RATE_LIMIT_EXCEEDED' },
        {
          'Rate-Limit-Limit': '60',
          'Rate-Limit-Remaining': '0',
          'Rate-Limit-Reset': '1',
        },
      );
    }
    if (Math.random() < FAIL_RATE) {
      stats.failuresInjected += 1;
      return sendJson(res, 500, { error_code: 'MOCK_FAILURE' });
    }

    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      return sendJson(res, 400, {
        error_code: 'INVALID_JSON',
        message: error.message,
      });
    }
    if (!input.external_id || typeof input.amount !== 'number') {
      return sendJson(res, 400, {
        error_code: 'INVALID_REQUEST',
        message: 'external_id and amount are required',
      });
    }

    const invoice = buildInvoice(input);
    invoices.set(invoice.id, invoice);
    stats.invoicesCreated += 1;

    if (AUTO_SETTLE) {
      setTimeout(() => {
        void settleInvoice(invoice);
      }, SETTLE_DELAY_MS).unref();
    }

    return sendJson(res, 200, invoice);
  }

  if (req.method === 'GET' && path.startsWith('/v2/invoices/')) {
    const id = decodeURIComponent(path.slice('/v2/invoices/'.length));
    const invoice = invoices.get(id);
    if (!invoice)
      return sendJson(res, 404, { error_code: 'INVOICE_NOT_FOUND' });
    return sendJson(res, 200, invoice);
  }

  if (
    req.method === 'POST' &&
    path.startsWith('/invoices/') &&
    path.endsWith('/expire!')
  ) {
    const id = decodeURIComponent(
      path.slice('/invoices/'.length, -'/expire!'.length),
    );
    const invoice = invoices.get(id);
    if (!invoice)
      return sendJson(res, 404, { error_code: 'INVOICE_NOT_FOUND' });
    if (invoice.status === 'PENDING') {
      invoice.status = 'EXPIRED';
      invoice.updated = new Date().toISOString();
    }
    return sendJson(res, 200, invoice);
  }

  if (req.method === 'POST' && path === '/refunds') {
    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      return sendJson(res, 400, {
        error_code: 'INVALID_JSON',
        message: error.message,
      });
    }
    const id = `refund_bench_${++refundSeq}_${randomUUID().slice(0, 8)}`;
    const refund = {
      id,
      invoice_id: input.invoice_id,
      amount: input.amount,
      status: 'SUCCEEDED',
      reason: input.reason || 'CANCELLATION',
      created: new Date().toISOString(),
    };
    refunds.set(id, refund);
    stats.refundsCreated += 1;
    const invoice = invoices.get(input.invoice_id);
    if (invoice) {
      invoice.status = 'REFUNDED';
      invoice.updated = refund.created;
    }
    return sendJson(res, 200, refund);
  }

  if (req.method === 'GET' && path.startsWith('/refunds/')) {
    const id = decodeURIComponent(path.slice('/refunds/'.length));
    const refund = refunds.get(id);
    if (!refund) return sendJson(res, 404, { error_code: 'REFUND_NOT_FOUND' });
    return sendJson(res, 200, refund);
  }

  return sendJson(res, 404, { error_code: 'NOT_FOUND' });
}

const server = http.createServer((req, res) => {
  void handle(req, res).catch((error) => {
    console.error(
      `[xendit-mock] ${req.method} ${req.url}: ${error.stack || error}`,
    );
    if (!res.headersSent) {
      sendJson(res, 500, { error_code: 'MOCK_ERROR', message: error.message });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[xendit-mock] listening on :${PORT}`);
  console.log(`[xendit-mock] webhook -> ${GATEWAY_WEBHOOK_URL}`);
  console.log(
    `[xendit-mock] autoSettle=${AUTO_SETTLE} delay=${SETTLE_DELAY_MS}ms`,
  );
});

function shutdown(signal) {
  console.log(`[xendit-mock] ${signal} received, closing`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
