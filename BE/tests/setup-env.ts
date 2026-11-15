import fs from 'node:fs';
import path from 'node:path';

// Runs before each test file's imports: switch to the test database.
const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.OTP_DEV_ECHO = 'true';
