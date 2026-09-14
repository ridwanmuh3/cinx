<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NForm, NFormItem, NInput, type FormInst, type FormRules } from 'naive-ui';
import { useAuthStore } from '@/entities/user';
import ThemeToggle from '@/shared/ui/ThemeToggle.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const formRef = ref<FormInst | null>(null);
const form = ref({ email: '', password: '' });
const loading = ref(false);
const error = ref<string | null>(null);

const rules: FormRules = {
  email: [
    { required: true, type: 'email', message: 'Enter a valid email.', trigger: ['blur', 'input'] },
  ],
  password: [{ required: true, message: 'Password is required.', trigger: ['blur', 'input'] }],
};

async function onSubmit(): Promise<void> {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  loading.value = true;
  error.value = null;
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined;
  try {
    await auth.login(form.value);
    router.push(redirect || '/movies');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="bx-auth">
    <div class="bx-auth-card">
      <div class="bx-auth-head">
        <router-link class="bx-brand" to="/" aria-label="CinX home">
          <span class="bx-brand-mark" aria-hidden="true"></span>
          <span class="bx-brand-name">CINX</span>
        </router-link>
        <ThemeToggle />
      </div>
      <h1 class="bx-auth-title">Sign in</h1>
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
        class="bx-form-grid"
        @submit.prevent="onSubmit"
      >
        <n-form-item class="bx-span-2" label="Email" path="email" data-testid="login-email">
          <n-input v-model:value="form.email" placeholder="you@example.com" autocomplete="email" />
        </n-form-item>
        <n-form-item
          class="bx-span-2"
          label="Password"
          path="password"
          data-testid="login-password"
        >
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
          />
        </n-form-item>
        <p v-if="error" role="alert" class="bx-err bx-span-2">{{ error }}</p>
        <div class="bx-span-2">
          <n-button type="primary" block :loading="loading" attr-type="submit" class="bx-ctl-btn">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </n-button>
        </div>
      </n-form>
      <p class="bx-auth-switch">
        Don't have an account?
        <router-link to="/register">Register</router-link>
      </p>
    </div>
  </section>
</template>
