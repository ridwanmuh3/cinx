import { request } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  API_BASE,
  APP_ORIGIN,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
} from './helpers';

const TOKEN_KEY = 'ticketing_access_token';
const AUTH_DIR = join(__dirname, '.auth');

async function login(email: string, password: string): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API_BASE}/auth/login`, { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { accessToken: string };
  await ctx.dispose();
  return body.accessToken;
}

function writeStorageState(token: string, file: string): void {
  writeFileSync(
    join(AUTH_DIR, file),
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: APP_ORIGIN,
          localStorage: [{ name: TOKEN_KEY, value: token }],
        },
      ],
    }),
  );
}

export default async function globalSetup(): Promise<void> {
  // 1. Reset + reseed deterministic data.
  console.log('[e2e:setup] seeding cinema data…');
  execSync('pnpm --filter @ticketing/cinema-service seed', { stdio: 'pipe' });
  console.log('[e2e:setup] ensuring admin user…');
  execSync('pnpm --filter @ticketing/user-service seed:admin', { stdio: 'pipe' });

  // 2. Ensure the e2e user exists (422 = already registered).
  const anon = await request.newContext();
  const reg = await anon.post(`${API_BASE}/auth/register`, {
    data: { email: USER_EMAIL, password: USER_PASSWORD, name: 'E2E User' },
  });
  if (!reg.ok() && reg.status() !== 422) {
    throw new Error(`register e2e user failed: ${reg.status()} ${await reg.text()}`);
  }
  await anon.dispose();

  // 3. Purge bookings left behind by previous runs so the suite starts
  //    deterministic (payments/tickets/seats cascade).
  const userToken = await login(USER_EMAIL, USER_PASSWORD);
  const me = await (async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const body = (await res.json()) as { id: string };
    await ctx.dispose();
    return body;
  })();
  execSync('pnpm --filter @ticketing/ticket-service exec tsx src/scripts/e2e-cleanup.ts', {
    stdio: 'pipe',
    env: { ...process.env, E2E_USER_ID: me.id },
  });

  // 4. Login once and persist storage states for fast, isolated tests.
  mkdirSync(AUTH_DIR, { recursive: true });
  writeStorageState(userToken, 'user.json');
  writeStorageState(await login(ADMIN_EMAIL, ADMIN_PASSWORD), 'admin.json');
  console.log('[e2e:setup] storage states ready');
}
