import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Load BE/.env (Node 22+ built-in loader; no dotenv dependency). Existing process env wins.
const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile) && process.env.SKIP_ENV_FILE !== '1') {
  process.loadEnvFile(envFile);
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AI_PROVIDER: z.enum(['ollama', 'meta_llama_api']).default('ollama'),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8100'),
  NGROK_DOMAIN: z.string().optional().default(''),
  CORS_EXTRA_ORIGINS: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_PEPPER: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().default(30),
  URL_SIGNING_SECRET: z.string().min(16),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().default(600),
  OTP_TTL_SECONDS: z.coerce.number().int().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  OTP_DEV_ECHO: bool,
  SMS_PROVIDER: z.string().default('console'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(8),
  OSRM_URL: z.string().default('https://router.project-osrm.org'),
  WHATSAPP_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_TEMPLATE_NEW_ORDER: z.string().default('od_new_order'),
  /** Dispatch point (Ortho Diamond warehouse) — start of delivery routes */
  WAREHOUSE_LAT: z.coerce.number().default(22.7196),
  WAREHOUSE_LNG: z.coerce.number().default(75.8577),
  /** Demo: move agents of DISPATCHED orders along the route automatically when no real GPS arrives */
  DEMO_SIMULATOR: bool,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    'Invalid environment:',
    parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  /** Doctor website (tracking links). Differs from PUBLIC_BASE_URL when the site is on GitHub Pages. */
  PUBLIC_WEB_URL: (process.env.PUBLIC_WEB_URL || parsed.data.PUBLIC_BASE_URL).replace(/\/$/, ''),
  // Never echo OTPs outside development/test
  OTP_DEV_ECHO: parsed.data.OTP_DEV_ECHO && parsed.data.NODE_ENV !== 'production',
  uploadRoot: path.resolve(__dirname, '../..', parsed.data.UPLOAD_DIR),
};
export type Env = typeof env;
