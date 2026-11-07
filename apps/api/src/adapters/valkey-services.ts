import { FlagCache, recordDownload, type FeatureFlag } from '@iconnook/jobs';
import type { ObjectStorage } from '@iconnook/storage';
import type { Redis } from 'ioredis';

import type { DownloadCounter, FeatureFlags, FileStore } from '../domain.js';

export class ValkeyFeatureFlags implements FeatureFlags {
  private readonly cache: FlagCache;
  constructor(redis: Redis) {
    this.cache = new FlagCache(redis);
  }
  isEnabled(flag: FeatureFlag): Promise<boolean> {
    return this.cache.isEnabled(flag);
  }
}

export class ValkeyDownloadCounter implements DownloadCounter {
  constructor(private readonly redis: Redis) {}
  record(iconId: number): Promise<void> {
    return recordDownload(this.redis, iconId);
  }
}

export class StorageFileStore implements FileStore {
  constructor(private readonly storage: ObjectStorage) {}
  get(key: string): Promise<Response | null> {
    return this.storage.get(key);
  }
}
