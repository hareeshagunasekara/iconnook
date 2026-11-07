import { QUEUE_PACKS, type PackRequest } from '@iconnook/jobs';
import type { Job, Queue } from 'bullmq';

import type { PackQueue, PackState, PackStatus } from '../domain.js';

const STATE: Record<string, PackState> = {
  waiting: 'queued',
  delayed: 'queued',
  prioritized: 'queued',
  'waiting-children': 'queued',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
};

export const PACK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  // Keep job records as long as the files exist (cleanup deletes packs after 7 days).
  removeOnComplete: { age: 7 * 86_400 },
  removeOnFail: { age: 86_400 },
} as const;

export class BullPackQueue implements PackQueue {
  constructor(private readonly queue: Queue) {
    if (queue.name !== QUEUE_PACKS) throw new Error(`Expected the "${QUEUE_PACKS}" queue`);
  }

  private async toStatus(job: Job<PackRequest>): Promise<PackStatus> {
    const state = STATE[await job.getState()] ?? 'queued';
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    return {
      id: job.id ?? '',
      state,
      progress: state === 'completed' ? 100 : progress,
      format: job.data.format,
      // Internal error messages never leak: clients get a generic reason.
      ...(state === 'failed' ? { error: 'The pack could not be built' } : {}),
    };
  }

  async enqueue(id: string, request: PackRequest): Promise<PackStatus> {
    const existing = (await this.queue.getJob(id)) as Job<PackRequest> | undefined;
    if (existing) {
      if ((await existing.getState()) === 'failed') await existing.retry();
      return this.toStatus(existing);
    }
    const job = (await this.queue.add('pack', request, {
      ...PACK_JOB_OPTIONS,
      jobId: id,
    })) as Job<PackRequest>;
    return this.toStatus(job);
  }

  async rebuild(id: string, request: PackRequest): Promise<PackStatus> {
    const existing = await this.queue.getJob(id);
    if (existing) await existing.remove();
    const job = (await this.queue.add('pack', request, {
      ...PACK_JOB_OPTIONS,
      jobId: id,
    })) as Job<PackRequest>;
    return this.toStatus(job);
  }

  async status(id: string): Promise<PackStatus | null> {
    const job = (await this.queue.getJob(id)) as Job<PackRequest> | undefined;
    return job ? this.toStatus(job) : null;
  }
}
