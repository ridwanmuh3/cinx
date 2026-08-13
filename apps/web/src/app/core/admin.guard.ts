import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { of, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';

/** Activates only for authenticated admins (role === 'admin'). */
export const adminGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token()) {
    return of(router.createUrlTree(['/login']));
  }

  return auth.refreshMe().pipe(
    map((user) => {
      if (user && user.role === 'admin') {
        return true;
      }
      return router.createUrlTree(['/movies']);
    }),
  );
};
