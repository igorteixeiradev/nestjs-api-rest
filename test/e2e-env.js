import 'dotenv/config';

/**
 * Environment for the e2e tests.
 *
 * The tests run against their own database (`<DB_DATABASE>_test`, e.g.
 * `app_test`) so they can truncate tables freely without touching the
 * development data. Values already present in .env / the shell win; the
 * fallbacks below match .env.example so the tests also run in CI without a .env.
 */
export function applyTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.APP_KEY ??= 'e2e-test-secret-key-with-at-least-32-chars';
  process.env.DB_HOST ??= '127.0.0.1';
  process.env.DB_PORT ??= '5432';
  process.env.DB_USER ??= 'root';
  process.env.DB_PASSWORD ??= 'root';

  const base = process.env.DB_DATABASE ?? 'app';
  process.env.DB_DATABASE = base.endsWith('_test') ? base : `${base}_test`;
}
