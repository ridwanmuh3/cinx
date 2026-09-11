import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import App from './App.vue';

function mountApp(): ReturnType<typeof mount> {
  return mount(App, {
    global: {
      plugins: [createPinia()],
      stubs: {
        RouterView: true,
        NConfigProvider: true,
        NGlobalStyle: true,
        NMessageProvider: true,
        NDialogProvider: true,
        NNotificationProvider: true,
      },
    },
  });
}

describe('App', () => {
  it('should create the app', () => {
    const wrapper = mountApp();
    expect(wrapper.exists()).toBe(true);
  });

  it('should render a router outlet', () => {
    const wrapper = mountApp();
    const outlet = wrapper.findComponent({ name: 'RouterView' });
    expect(outlet.exists()).toBe(true);
  });
});