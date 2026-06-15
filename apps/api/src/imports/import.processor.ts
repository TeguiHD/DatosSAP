import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ImportsService } from './imports.service';
import { createRedisConnection, IMPORT_QUEUE_NAME, type ImportQueuePayload } from './import.queue';

@Injectable()
export class ImportProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportProcessor.name);
  private worker?: Worker<ImportQueuePayload>;

  constructor(private readonly imports: ImportsService) {}

  onModuleInit() {
    this.worker = new Worker<ImportQueuePayload>(
      IMPORT_QUEUE_NAME,
      async (job) => {
        const { jobId, action, actorUserId } = job.data;
        this.logger.log(`Processing import ${jobId} action=${action}`);
        if (action === 'dry-run') {
          await this.imports.markDryRun(jobId, actorUserId);
          return;
        }
        await this.imports.apply(jobId, actorUserId);
      },
      {
        connection: createRedisConnection(),
        concurrency: 1,
        lockDuration: 10 * 60 * 1000,
      },
    );

    this.worker.on('failed', (job, error) => {
      const jobId = job?.data.jobId;
      if (!jobId) {
        return;
      }
      this.logger.error(`Import job failed: ${jobId}`, error.stack);
      void this.imports.markFailed(jobId, error);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
