import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { of, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';

/** Activates only for authenticated users; verifies the stored token on use. */
export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // No token at all → send to login (remember where to return).
  if (!auth.token()) {
    return of(
      router.createUrlTree(['/login'], {
        queryParams: { redirect: router.url },
      }),
    );
  }

  return auth.refreshMe().pipe(
    map((user) =>
      user
        ? true
        : router.createUrlTree(['/login'], {
            queryParams: { redirect: router.url },
          }),
    ),
  );
};
