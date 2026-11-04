import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyTestEnv } from './e2e-env.js';

/**
 * Runs once before the e2e suite:
 *  1. creates the `<DB_DATABASE>_test` database if it does not exist;
 *  2. recreates the schema from prisma/migrations/*\/migration.sql, so the
 *     tests always start from the exact schema the migrations produce.
 */
export default async function globalSetup() {
  applyTestEnv();

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE } = process.env;
  const connection = {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
  };

  const admin = new pg.Client({ ...connection, database: 'postgres' });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_DATABASE],
    );
    if (!rowCount) await admin.query(`CREATE DATABASE "${DB_DATABASE}"`);
  } finally {
    await admin.end();
  }

  const db = new pg.Client({ ...connection, database: DB_DATABASE });
  await db.connect();
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    const migrationsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../prisma/migrations',
    );
    const migrations = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of migrations) {
      const sql = fs.readFileSync(
        path.join(migrationsDir, name, 'migration.sql'),
        'utf8',
      );
      await db.query(sql);
    }
  } finally {
    await db.end();
  }
}
