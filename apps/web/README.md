# Web

CinX web frontend — Vue 3 + TypeScript + Vite, with Pinia for state, Vue Router for
navigation, and [Naive UI](https://www.naiveui.com/) as the component library
(themed to the CinX "Showtime Board" amber/dark look).

## Development server

To start a local development server, run:

```bash
pnpm dev
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`.
The application will automatically reload whenever you modify any of the source files.
During local dev, `/api` is proxied to the REST gateway at `http://localhost:3000`
(see `vite.config.ts`).

## Building

To build the project run:

```bash
pnpm build
```

This type-checks the app (`vue-tsc --noEmit`) and compiles it with Vite, storing the
build artifacts in `dist/`.

## Running unit tests

To execute unit tests with [Vitest](https://vitest.dev/), use the following command:

```bash
pnpm test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
pnpm e2e
```

Playwright boots the full backend stack (`scripts/e2e-services.sh`) and the Vite dev
server before running the specs in `e2e/`.

## Project layout

Feature-sliced layers — `app` → `pages` → `features` → `entities` → `shared`:

- `src/app/` — app wiring: entry (`main.ts`), router with auth/admin guards, `App.vue`,
  `AppShell`, global styles
- `src/pages/` — route screens by feature (`auth/`, `movies/`, `booking/`, `admin/`,
  `landing/`), each lazily loaded
- `src/features/` — reusable user-flow logic (`booking`: hold-countdown composable,
  booking-status mappers)
- `src/entities/` — cross-page domain state (`user`: auth store, `theme`)
- `src/shared/api/` — fetch client with Bearer token injection and error normalisation
- `src/shared/lib/` — formatters, browser telemetry
- `src/shared/ui/` — reusable widgets (ThemeToggle) and the Naive UI theme overrides

See `AGENTS.md` for the full architecture conventions.

## Additional Resources

- [Vite documentation](https://vite.dev/)
- [Vue 3 documentation](https://vuejs.org/)
- [Naive UI documentation](https://www.naiveui.com/en-US/os-theme)
