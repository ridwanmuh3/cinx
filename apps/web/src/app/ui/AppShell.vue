<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/entities/user';
import ThemeToggle from '@/shared/ui/ThemeToggle.vue';

const auth = useAuthStore();
const router = useRouter();

function signOut(): void {
  auth.logout();
  void router.push('/login');
}
</script>

<template>
  <a class="bx-skip-link" href="#main">Skip to content</a>
  <header class="bx-bar">
    <div class="bx-bar-inner">
      <router-link class="bx-brand" to="/" aria-label="CinX home">
        <span class="bx-brand-mark" aria-hidden="true"></span>
        <span class="bx-brand-name">CINX</span>
      </router-link>
      <nav class="bx-bar-nav" aria-label="Primary">
        <router-link v-if="auth.isAdmin" class="bx-bar-link" to="/admin">Admin</router-link>
        <router-link class="bx-bar-link" to="/movies">Cinema</router-link>
        <router-link class="bx-bar-link" to="/bookings">My Bookings</router-link>
      </nav>
      <div class="bx-bar-side">
        <ThemeToggle />
        <span
          v-if="auth.user"
          class="bx-bar-user"
          :aria-label="`Signed in as ${auth.user?.name || auth.user?.email}`"
        >
          {{ auth.user?.name || auth.user?.email }}
        </span>
        <button
          v-if="auth.isAuthenticated"
          class="bx-bar-link-ghost"
          type="button"
          @click="signOut"
        >
          Logout
        </button>
        <router-link v-else class="bx-bar-link-ghost" to="/login">Login</router-link>
      </div>
    </div>
  </header>
  <main id="main" class="bx-page">
    <div class="bx-frame">
      <router-view />
    </div>
  </main>
</template>
