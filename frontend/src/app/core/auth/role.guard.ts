import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from './auth.models';
import { safeReturnUrl } from './session.utils';

export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.hasValidSession()) return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: safeReturnUrl(state.url) },
  });
  const allowed = route.data['roles'] as readonly UserRole[] | undefined;
  const role = auth.userRole();
  return role && allowed?.includes(role) ? true : router.createUrlTree(['/sin-acceso']);
};
