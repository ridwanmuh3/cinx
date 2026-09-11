You are an expert in TypeScript, Vue 3, and scalable web application development. You write functional, maintainable, performant, and accessible code following Vue and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
- Use `type` imports (`import type { X }`) for type-only imports

## Vue Best Practices

- Always use `<script setup lang="ts">` composition API
- Use `ref`/`computed`/`watch` for local state; keep state transformations pure
- Prefer `computed` over methods for derived values used in templates
- Use lazy-loaded routes (`() => import(...)`) for feature routes
- Implement route guards (auth/admin) in `src/router.ts` via `beforeEach`
- Keep components small and focused on a single responsibility

## State Management

- Use Pinia stores for shared/cross-component state (`src/stores/`)
- Pinia setup-style stores (`defineStore('x', () => {...})`) are preferred
- Do not mutate store state outside actions

## UI Components

- Use Naive UI components (NButton, NInput, NSelect, NDataTable, NForm, NDatePicker,
  NMessage/NNotification, useDialog, etc.) instead of hand-rolled equivalents
- Theme all Naive UI usage through `src/ui/theme.ts` overrides — do not hard-code
  component colors outside it
- Add `data-testid` attributes on Naive UI form controls where e2e tests target them
- The CinX "Showtime Board" design tokens live in `src/styles.css` (CSS variables);
  keep the board aesthetic: 0 radius, amber single-action, uppercase dot-matrix labels

## Data & API

- All HTTP calls go through `src/api.ts` (fetch-based client that injects the Bearer
  token from the auth store and normalises errors into `ApiError`)
- Do not call `fetch` directly from views

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

## Templates

- Keep templates simple and avoid complex logic in markup
- Use `v-if`/`v-for`/`v-else` natively; prefer `computed` for derived display data
- Preserve the e2e contract: seat buttons carry `bx-seat` classes, summary rows carry
  `bx-summary-label`/`bx-summary-value`, ticket stubs carry `bx-stub-code`