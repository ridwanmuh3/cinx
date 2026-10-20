#!/usr/bin/env node
// Pre-provision benchmark users and write their JWTs to a k6 SharedArray file.
//
// Registering/logging in 1,000 users inside the measured run would add
// bcrypt CPU and auth traffic to every scenario. This script does it once.
//
//   BENCH_USERS=1000 node scripts/benchmark-users.mjs
//
// Env:
//   GATEWAY_URL=http://localhost:3000/api/v1
//   BENCH_USERS=1000
//   BENCH_USER_PREFIX=bench-user
//   BENCH_PASSWORD=demo1234
//   BENCH_SEED_CONCURRENCY=16
//   BENCH_TOKEN_FILE=<repo>/benchmark/.data/tokens.json

import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = (
  process.env.GATEWAY_URL || 'http://localhost:3000/api/v1'
).replace(/\/$/, '');
const COUNT = Number(process.env.BENCH_USERS || 1000);
const PREFIX = process.env.BENCH_USER_PREFIX || 'bench-user';
const PASSWORD = process.env.BENCH_PASSWORD || 'demo1234';
const CONCURRENCY = Number(process.env.BENCH_SEED_CONCURRENCY || 16);
const WORKERS =
  Number.isSafeInteger(CONCURRENCY) && CONCURRENCY > 0 ? CONCURRENCY : 16;
const OUTPUT = path.resolve(
  process.env.BENCH_TOKEN_FILE ||
    path.join(process.cwd(), 'benchmark/.data/tokens.json'),
);

function emailFor(index) {
  return `${PREFIX}-${index}@example.com`;
}

async function request(pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

async function withRetry(fn, label) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const result = await fn();
      if (result.status < 500 && result.status !== 429) return result;
      last = result;
    } catch (error) {
      last = { status: 0, body: { message: error.message } };
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw new Error(
    `${label} failed after retries: HTTP ${last?.status} ${JSON.stringify(last?.body)}`,
  );
}

async function provision(index) {
  const email = emailFor(index);
  const registration = await withRetry(
    () =>
      request('/auth/register', {
        email,
        password: PASSWORD,
        name: `Benchmark User ${index}`,
      }),
    `register ${email}`,
  );
  if (![200, 201, 409, 422].includes(registration.status)) {
    throw new Error(
      `register ${email} returned HTTP ${registration.status}: ${JSON.stringify(registration.body)}`,
    );
  }

  const login = await withRetry(
    () => request('/auth/login', { email, password: PASSWORD }),
    `login ${email}`,
  );
  if (login.status !== 200 || typeof login.body.accessToken !== 'string') {
    throw new Error(
      `login ${email} returned HTTP ${login.status}: ${JSON.stringify(login.body)}`,
    );
  }
  return { email, token: login.body.accessToken };
}

async function main() {
  if (!Number.isSafeInteger(COUNT) || COUNT < 1) {
    throw new Error(`BENCH_USERS must be a positive integer (got ${COUNT})`);
  }
  console.log(
    `[benchmark-users] provisioning ${COUNT} users via ${BASE_URL} ` +
      `(concurrency ${WORKERS})`,
  );

  const users = new Array(COUNT);
  let next = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= COUNT) return;
      users[index] = await provision(index + 1);
      completed += 1;
      if (completed % 100 === 0 || completed === COUNT) {
        console.log(`[benchmark-users] ${completed}/${COUNT}`);
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  const tokens = users.map((user) => user.token);
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(
    OUTPUT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        count: COUNT,
        tokens,
        users,
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  await chmod(OUTPUT, 0o600);
  console.log(`[benchmark-users] wrote ${COUNT} tokens to ${OUTPUT}`);
}

void main().catch((error) => {
  console.error('[benchmark-users] FAILED', error);
  process.exitCode = 1;
});
