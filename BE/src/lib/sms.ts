import { env } from '../config/env';
import { logger } from './logger';

/** SMS provider interface. Real adapters (MSG91 etc.) plug in here in Step 4. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  async send(to: string, text: string) {
    logger.warn({ to }, `[DEV SMS -> ${to}] ${text}`);
  }
}

let provider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (provider) return provider;
  if (env.SMS_PROVIDER !== 'console') {
    logger.warn(`SMS_PROVIDER "${env.SMS_PROVIDER}" has no adapter yet; falling back to console`);
  }
  provider = new ConsoleSmsProvider();
  return provider;
}

/** Tests can swap the provider. */
export function setSmsProvider(p: SmsProvider) {
  provider = p;
}
