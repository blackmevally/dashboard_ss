import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { controlDb } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../migrations');

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id BIGSERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function run() {
  const client = await controlDb.connect();
  try {
    await ensureMigrationTable(client);

    const files = (await fs.readdir(migrationsDir))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();

    const { rows: applied } = await client.query(
      'SELECT filename, checksum FROM schema_migration ORDER BY filename'
    );
    const appliedMap = new Map(applied.map((row) => [row.filename, row.checksum]));

    for (const filename of files) {
      const content = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
      const hash = checksum(content);
      const previous = appliedMap.get(filename);

      if (previous) {
        if (previous !== hash) {
          throw new Error(`Migration checksum changed after apply: ${filename}`);
        }
        continue;
      }

      console.log(`Applying migration: ${filename}`);
      await client.query('BEGIN');
      try {
        await client.query(content);
        await client.query(
          'INSERT INTO schema_migration (filename, checksum) VALUES ($1, $2)',
          [filename, hash]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed: ${filename}: ${error.message}`, { cause: error });
      }
    }

    console.log(`Migration complete. ${files.length} migration file(s) checked.`);
  } finally {
    client.release();
    await controlDb.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
