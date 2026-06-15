import type { ConnectionOptions } from 'bullmq';

export const IMPORT_QUEUE_NAME = 'datos-imports';

export interface ImportQueuePayload {
  jobId: string;
  action: 'dry-run' | 'apply';
  actorUserId?: string;
}

export function createRedisConnection(): ConnectionOptions {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:56379');
  const database = redisUrl.pathname ? Number(redisUrl.pathname.slice(1)) : 0;
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: Number.isFinite(database) ? database : 0,
    maxRetriesPerRequest: null,
  };
}
