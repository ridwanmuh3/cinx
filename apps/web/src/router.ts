import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppShell from '@/components/AppShell.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
    },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: '/movies' },
        {
          path: 'movies',
          name: 'movies',
          component: () => import('@/views/MovieListView.vue'),
        },
        {
          path: 'movies/:id',
          name: 'movie-detail',
          component: () => import('@/views/MovieDetailView.vue'),
        },
        {
          path: 'showtimes/:id/seats',
          name: 'seat-picker',
          component: () => import('@/views/SeatPickerView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'bookings',
          name: 'bookings',
          component: () => import('@/views/BookingHistoryView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'bookings/checkout',
          name: 'checkout',
          component: () => import('@/views/CheckoutView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'bookings/confirm/:id',
          name: 'confirmation',
          component: () => import('@/views/ConfirmationView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'admin',
          component: () => import('@/views/AdminLayoutView.vue'),
          meta: { requiresAuth: true, requiresAdmin: true },
          children: [
            { path: '', redirect: '/admin/movies' },
            {
              path: 'movies',
              name: 'admin-movies',
              component: () => import('@/views/MoviesAdminView.vue'),
              meta: { requiresAuth: true, requiresAdmin: true },
            },
            {
              path: 'theaters',
              name: 'admin-theaters',
              component: () => import('@/views/TheatersAdminView.vue'),
              meta: { requiresAuth: true, requiresAdmin: true },
            },
            {
              path: 'showtimes',
              name: 'admin-showtimes',
              component: () => import('@/views/ShowtimesAdminView.vue'),
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
