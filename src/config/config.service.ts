import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: NestConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get databaseUrl(): string {
    return this.configService.get<string>('DATABASE_URL')!;
  }

  get telegramApiId(): number {
    return this.configService.get<number>('TELEGRAM_API_ID')!;
  }

  get telegramApiHash(): string {
    return this.configService.get<string>('TELEGRAM_API_HASH')!;
  }

  get telegramPhoneNumber(): string {
    return this.configService.get<string>('TELEGRAM_PHONE_NUMBER')!;
  }

  get redisHost(): string {
    return this.configService.get<string>('REDIS_HOST', 'localhost');
  }

  get redisPort(): number {
    return this.configService.get<number>('REDIS_PORT', 6379);
  }

  get sessionStorage(): string {
    return this.configService.get<string>('SESSION_STORAGE', 'file');
  }

  get syncBatchSize(): number {
    return this.configService.get<number>('SYNC_BATCH_SIZE', 50);
  }

  get syncDelayMs(): number {
    return this.configService.get<number>('SYNC_DELAY_MS', 500);
  }
}
