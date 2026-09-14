import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/entities/user';
import AppShell from '@/app/ui/AppShell.vue';

/**
 * Route map. Route components are lazily loaded per page slice
 * (`src/pages/<feature>/ui`), so each screen ships as its own chunk.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/pages/landing/ui/LandingPage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/auth/ui/LoginPage.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/pages/auth/ui/RegisterPage.vue'),
    },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: '/movies' },
        {
          path: 'movies',
          name: 'movies',
          component: () => import('@/pages/movies/ui/MovieListPage.vue'),
        },
        {
          path: 'movies/:id',
          name: 'movie-detail',
          component: () => import('@/pages/movies/ui/MovieDetailPage.vue'),
        },
        {
          path: 'showtimes/:id/seats',
          name: 'seat-picker',
          component: () => import('@/pages/booking/ui/SeatPickerPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'bookings',
          name: 'bookings',
          component: () => import('@/pages/booking/ui/BookingHistoryPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'bookings/checkout',
          name: 'checkout',
          component: () => import('@/pages/booking/ui/CheckoutPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'bookings/confirm/:id',
          name: 'confirmation',
          component: () => import('@/pages/booking/ui/ConfirmationPage.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'admin',
          component: () => import('@/pages/admin/ui/AdminLayoutPage.vue'),
          meta: { requiresAuth: true, requiresAdmin: true },
          children: [
            { path: '', redirect: '/admin/movies' },
            {
              path: 'movies',
              name: 'admin-movies',
              component: () => import('@/pages/admin/ui/MoviesAdminPage.vue'),
              meta: { requiresAuth: true, requiresAdmin: true },
            },
            {
              path: 'theaters',
              name: 'admin-theaters',
              component: () => import('@/pages/admin/ui/TheatersAdminPage.vue'),
              meta: { requiresAuth: true, requiresAdmin: true },
            },
            {
              path: 'showtimes',
              name: 'admin-showtimes',
              component: () => import('@/pages/admin/ui/ShowtimesAdminPage.vue'),
              meta: { requiresAuth: true, requiresAdmin: true },
            },
          ],
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

/** Global guard: authenticated (and admin for /admin) only. */
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  const auth = useAuthStore();

  // No token at all → send to login (remember where to return).
  if (!auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // Verify the stored JWT once per session and refresh the current user.
  if (!auth.user) {
    const user = await auth.refreshMe();
    if (!user) return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { path: '/movies' };
  }

  return true;
});
