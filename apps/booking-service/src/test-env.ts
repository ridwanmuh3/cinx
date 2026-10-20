/**
 * Jest setup for unit tests. Runs once per test file before the module graph
 * loads, so ambient env vars (e.g. EMAIL_BASE_URL exported from a developer's
 * shell or a sourced .env) cannot leak into constants that capture env at
 * module-load time. Keeps unit tests hermetic — no infra, no host env.
 */
delete process.env.EMAIL_BASE_URL;
delete process.env.XENDIT_RETURN_URL;
delete process.env.JWT_SECRET;
