import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Points tests at TEST_DATABASE_URL and applies migrations there (never touches the dev DB). */
export default function setup() {
  const envFile = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  if (testUrl === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}
