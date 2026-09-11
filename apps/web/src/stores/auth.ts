import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { router } from '@/router';
import * as api from '@/api';
import type { User } from '@/types';

const TOKEN_KEY = 'ticketing_access_token';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<User | null>(null);

  const isAuthenticated = computed(() => user.value !== null);
  const isAdmin = computed(() => user.value?.role === 'admin');

  async function register(dto: { email: string; password: string; name?: string }): Promise<void> {
    await api.register(dto);
    router.push('/login');
  }

  async function login(dto: { email: string; password: string }, redirect?: string): Promise<void> {
    const res = await api.login(dto);
    user.value = res.user;
    token.value = res.accessToken;
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    router.push(redirect || '/movies');
  }

  /** Verifies the stored JWT and refreshes the current user (silent). */
  async function refreshMe(): Promise<User | null> {
    if (!token.value) {
      user.value = null;
      return null;
    }
    try {
      const me = await api.me();
      user.value = me;
      return me;
    } catch {
      clearLocal();
      return null;
    }
  }

  function logout(): void {
    clearLocal();
    router.push('/login');
  }

  function clearLocal(): void {
    user.value = null;
    token.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  return { token, user, isAuthenticated, isAdmin, register, login, refreshMe, logout };
});