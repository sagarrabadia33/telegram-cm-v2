import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, QueueModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
