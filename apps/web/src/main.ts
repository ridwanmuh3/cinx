import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initBrowserTelemetry } from './otel';
import './styles.css';
import './landing.css';

// Start browser tracing before the app mounts so document-load and the
// first API calls are captured. No-op when VITE_OTEL_ENDPOINT is unset.
initBrowserTelemetry();

createApp(App).use(createPinia()).use(router).mount('#app');
