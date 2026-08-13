import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeId from '@angular/common/locales/id';

import { routes } from './app.routes';
import { tokenInterceptor } from './core/token.interceptor';

registerLocaleData(localeId);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([tokenInterceptor])),
    provideRouter(routes),
  ],
};
