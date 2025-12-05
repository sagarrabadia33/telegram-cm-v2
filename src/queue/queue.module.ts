import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigService } from '../config/config.service';
import { QueueService } from './queue.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        connection: {
          host: configService.redisHost,
          port: configService.redisPort,
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 100, // Keep last 100 completed jobs
          },
          removeOnFail: {
            age: 86400, // Keep failed jobs for 24 hours
          },
        },
      }),
    }),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
