import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';
import { AppConfigService } from '../config/config.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  async check() {
    const [database, queue] = await Promise.all([
      this.prisma.healthCheck(),
      this.queue.healthCheck(),
    ]);

    const isHealthy = database && queue;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: this.config.nodeEnv,
      services: {
        database: database ? 'up' : 'down',
        queue: queue ? 'up' : 'down',
      },
    };
  }

  @Get('database')
  async checkDatabase() {
    const isHealthy = await this.prisma.healthCheck();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'database',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('queue')
  async checkQueue() {
    const isHealthy = await this.queue.healthCheck();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'queue',
      timestamp: new Date().toISOString(),
    };
  }
}
