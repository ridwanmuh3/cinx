import { test as base, request as playwrightRequest, APIRequestContext } from '@playwright/test';
import { API_BASE, ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD } from './helpers';

async function authContext(email: string, password: string): Promise<APIRequestContext> {
  const anon = await playwrightRequest.newContext();
  const res = await anon.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const body = (await res.json()) as { accessToken: string };
  await anon.dispose();
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
  return playwrightRequest.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${body.accessToken}` },
  });
}

export const test = base.extend<{
  userApi: APIRequestContext;
  adminApi: APIRequestContext;
}>({
  userApi: async ({}, use) => {
    const ctx = await authContext(USER_EMAIL, USER_PASSWORD);
    await use(ctx);
    await ctx.dispose();
  },
  adminApi: async ({}, use) => {
    const ctx = await authContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from '@playwright/test';
