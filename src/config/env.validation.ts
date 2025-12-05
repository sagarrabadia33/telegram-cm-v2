import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsNumber()
  @IsNotEmpty()
  TELEGRAM_API_ID: number;

  @IsString()
  @IsNotEmpty()
  TELEGRAM_API_HASH: string;

  @IsString()
  @IsNotEmpty()
  TELEGRAM_PHONE_NUMBER: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number = 6379;

  @IsString()
  @IsOptional()
  SESSION_STORAGE?: string = 'file';

  @IsNumber()
  @IsOptional()
  SYNC_BATCH_SIZE?: number = 50;

  @IsNumber()
  @IsOptional()
  SYNC_DELAY_MS?: number = 500;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
