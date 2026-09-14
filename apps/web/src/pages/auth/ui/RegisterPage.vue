<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NForm, NFormItem, NInput, type FormInst, type FormRules } from 'naive-ui';
import { useAuthStore } from '@/entities/user';
import ThemeToggle from '@/shared/ui/ThemeToggle.vue';

const auth = useAuthStore();
const router = useRouter();

const formRef = ref<FormInst | null>(null);
const form = ref({ name: '', email: '', password: '' });
const loading = ref(false);
const error = ref<string | null>(null);

const rules: FormRules = {
  name: [{ required: true, message: 'Name is required.', trigger: ['blur', 'input'] }],
  email: [
    { required: true, type: 'email', message: 'Enter a valid email.', trigger: ['blur', 'input'] },
  ],
  password: [
    {
      required: true,
      min: 8,
      max: 72,
      message: 'Password must be 8–72 characters.',
      trigger: ['blur', 'input'],
    },
  ],
};

async function onSubmit(): Promise<void> {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    await auth.register(form.value);
    router.push('/login');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Registration failed';
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
      <h1 class="bx-auth-title">Create your account</h1>
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
        class="bx-form-grid"
        @submit.prevent="onSubmit"
      >
        <n-form-item class="bx-span-2" label="Name" path="name" data-testid="register-name">
          <n-input v-model:value="form.name" placeholder="Your name" autocomplete="name" />
        </n-form-item>
        <n-form-item class="bx-span-2" label="Email" path="email" data-testid="register-email">
          <n-input v-model:value="form.email" placeholder="you@example.com" autocomplete="email" />
        </n-form-item>
        <n-form-item
          class="bx-span-2"
          label="Password"
          path="password"
          data-testid="register-password"
        >
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            autocomplete="new-password"
          />
        </n-form-item>
        <p v-if="error" role="alert" class="bx-err bx-span-2">{{ error }}</p>
        <div class="bx-span-2">
          <n-button type="primary" block :loading="loading" attr-type="submit" class="bx-ctl-btn">
            {{ loading ? 'Creating account…' : 'Register' }}
          </n-button>
        </div>
      </n-form>
      <p class="bx-auth-switch">
        Already have an account?
        <router-link to="/login">Sign in</router-link>
      </p>
    </div>
  </section>
</template>
