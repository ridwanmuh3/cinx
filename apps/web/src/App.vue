<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NMessageProvider,
  NNotificationProvider,
  darkTheme,
  lightTheme,
} from 'naive-ui';
import { useThemeStore } from '@/stores/theme';
import { themeOverrides } from '@/ui/theme';

const themeStore = useThemeStore();

const naiveTheme = computed(() => (themeStore.theme === 'dark' ? darkTheme : lightTheme));
const overrides = computed(() => themeOverrides(themeStore.theme));

// Keep <html data-theme> in sync (mirrors the early script in index.html) and
// follow the OS theme live only while the user has not pinned a choice.
watch(
  () => themeStore.theme,
  (t) => {
    document.documentElement.dataset.theme = t;
  },
  { immediate: true },
);

if (typeof window.matchMedia === 'function') {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  media.addEventListener('change', () => {
    if (!themeStore.overridden) themeStore.theme = media.matches ? 'light' : 'dark';
  });
}
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="overrides">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>