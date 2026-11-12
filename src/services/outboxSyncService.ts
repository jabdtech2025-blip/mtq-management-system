export type OutboxItemStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export type OutboxOperationType =
  | 'UPSERT_ASSESSMENT_DRAFT'
  | 'UPSERT_PARTICIPANT'
  | 'DELETE_PARTICIPANT'
  | 'UPSERT_QUESTION'
  | 'DELETE_QUESTION'
  | 'COMMIT_LOTTERY_DRAW'
  | 'UPSERT_MASTER_DATA'
  | 'GENERIC_MUTATION';

export interface OutboxRecord<TPayload = Record<string, unknown>> {
  id: string;
  idempotencyKey: string;
  tenantId: string;
  operationType: OutboxOperationType;
  entityLabel: string;
  payload: TPayload;
  status: OutboxItemStatus;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxSummary {
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  syncedCount: number;
  lastSyncedAt: string | null;
  items: OutboxRecord[];
}

type OutboxListener = (summary: OutboxSummary) => void;
// `message` diterima juga karena pemroses di MtqContext mengembalikan { success, message }
type OutboxProcessor = (
  record: OutboxRecord
) => Promise<{ success: boolean; error?: string; message?: string }>;

/** Jeda percobaan ulang otomatis untuk item tertunda/gagal (milidetik). */
const RETRY_INTERVAL_MS = 20_000;
/** Jeda setelah perangkat kembali online, memberi waktu sesi login pulih lebih dulu. */
const ONLINE_FLUSH_DELAY_MS = 2_500;

const DB_NAME = 'mtq_outbox_db_v1';
const STORE_NAME = 'outbox_operations';
const STORAGE_FALLBACK_KEY = 'mtq_outbox_fallback_v1';

// Forbidden operations that must NEVER be queued for offline fake-completion
const FORBIDDEN_OFFLINE_OPERATIONS = new Set([
  'FINALIZE_ASSESSMENT',
  'RATIFY_STAGE',
  'AUTH_TOKEN_STORAGE',
]);

class OutboxSyncService {
  private memoryStore: Map<string, OutboxRecord> = new Map();
  private listeners: Set<OutboxListener> = new Set();
  private processor: OutboxProcessor | null = null;
  private isProcessing = false;
  private lastSyncedAt: string | null = null;
  private idbAvailable = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initializeStore();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        // Tunggu sebentar agar token sesi diperbarui sebelum antrean dikirim
        window.setTimeout(() => {
          void this.flushPendingQueue();
        }, ONLINE_FLUSH_DELAY_MS);
      });
      // Percobaan ulang berkala: item yang gagal (mis. dikirim saat sesi belum pulih) tidak macet selamanya
      window.setInterval(() => {
        if (this.hasRetryableItems()) {
          void this.flushPendingQueue();
        }
      }, RETRY_INTERVAL_MS);
    }
  }

  private async initializeStore(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      if ('indexedDB' in window && window.indexedDB) {
        const db = await this.openIndexedDB();
        const records = await this.readAllFromIndexedDB(db);
        records.forEach((rec) => {
          // Reset stuck 'syncing' items back to 'pending' on boot
          if (rec.status === 'syncing') {
            rec.status = 'pending';
          }
          this.memoryStore.set(rec.id, rec);
        });
        this.idbAvailable = true;
        this.notifyListeners();
        return;
      }
    } catch {
      this.idbAvailable = false;
    }

    // Fallback to non-sensitive localStorage metadata queue if IndexedDB is unavailable in sandbox
    try {
      const raw = window.localStorage.getItem(STORAGE_FALLBACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OutboxRecord[];
        if (Array.isArray(parsed)) {
          parsed.forEach((rec) => {
            if (rec.status === 'syncing') rec.status = 'pending';
            this.memoryStore.set(rec.id, rec);
          });
        }
      }
    } catch {
      // Ignore storage access errors
    }
    this.notifyListeners();
  }

  private openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
          store.createIndex('status', 'status', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private readAllFromIndexedDB(db: IDBDatabase): Promise<OutboxRecord[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OutboxRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  private async persistRecord(record: OutboxRecord): Promise<void> {
    this.memoryStore.set(record.id, record);
    if (this.idbAvailable && typeof window !== 'undefined' && window.indexedDB) {
      try {
        const db = await this.openIndexedDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      } catch {
        // Fallback below
      }
    }
    this.persistFallback();
  }

  private async removeRecord(id: string): Promise<void> {
    this.memoryStore.delete(id);
    if (this.idbAvailable && typeof window !== 'undefined' && window.indexedDB) {
      try {
        const db = await this.openIndexedDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      } catch {
        // Fallback below
      }
    }
    this.persistFallback();
  }

  private persistFallback(): void {
    if (typeof window === 'undefined') return;
    try {
      const serialized = JSON.stringify(Array.from(this.memoryStore.values()));
      window.localStorage.setItem(STORAGE_FALLBACK_KEY, serialized);
    } catch {
      // Ignore quota errors
    }
  }

  private hasRetryableItems(): boolean {
    for (const item of this.memoryStore.values()) {
      if (item.status === 'pending' || item.status === 'failed') return true;
    }
    return false;
  }

  public registerProcessor(processor: OutboxProcessor): void {
    this.processor = processor;
  }

  public subscribe(listener: OutboxListener): () => void {
    this.listeners.add(listener);
    listener(this.getSummary());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSummary(tenantId?: string): OutboxSummary {
    const allItems = Array.from(this.memoryStore.values())
      .filter((item) => !tenantId || item.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    let pendingCount = 0;
    let syncingCount = 0;
    let failedCount = 0;
    let syncedCount = 0;

    for (const item of allItems) {
      if (item.status === 'pending') pendingCount += 1;
      else if (item.status === 'syncing') syncingCount += 1;
      else if (item.status === 'failed') failedCount += 1;
      else if (item.status === 'synced') syncedCount += 1;
    }

    return {
      pendingCount,
      syncingCount,
      failedCount,
      syncedCount,
      lastSyncedAt: this.lastSyncedAt,
      items: allItems,
    };
  }

  private notifyListeners(): void {
    const summary = this.getSummary();
    this.listeners.forEach((listener) => listener(summary));
  }

  /**
   * Enqueues a mutation idempotently by `idempotencyKey`.
   * If an entry with the same `idempotencyKey` is already pending/failed, it updates the payload
   * rather than creating a duplicate operation.
   */
  public async enqueueOperation<TPayload = Record<string, unknown>>(params: {
    idempotencyKey: string;
    tenantId: string;
    operationType: OutboxOperationType | string;
    entityLabel: string;
    payload: TPayload;
    errorMessage?: string;
  }): Promise<OutboxRecord<TPayload>> {
    if (FORBIDDEN_OFFLINE_OPERATIONS.has(params.operationType)) {
      throw new Error(
        `Operasi "${params.operationType}" wajib diverifikasi langsung oleh server dan tidak diizinkan masuk ke antrean offline.`
      );
    }

    if (this.initPromise) {
      await this.initPromise;
    }

    const now = new Date().toISOString();
    const existing = Array.from(this.memoryStore.values()).find(
      (item) => item.idempotencyKey === params.idempotencyKey && item.status !== 'synced'
    );

    const record: OutboxRecord<TPayload> = existing
      ? {
          ...(existing as OutboxRecord<TPayload>),
          payload: params.payload,
          entityLabel: params.entityLabel,
          status: 'pending',
          lastError: params.errorMessage || existing.lastError,
          updatedAt: now,
        }
      : {
          id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          idempotencyKey: params.idempotencyKey,
          tenantId: params.tenantId,
          operationType: params.operationType as OutboxOperationType,
          entityLabel: params.entityLabel,
          payload: params.payload,
          status: 'pending',
          retryCount: 0,
          lastError: params.errorMessage,
          createdAt: now,
          updatedAt: now,
        };

    await this.persistRecord(record as OutboxRecord);
    this.notifyListeners();
    return record;
  }

  public async markSynced(idempotencyKey: string): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    const existing = Array.from(this.memoryStore.values()).find(
      (item) => item.idempotencyKey === idempotencyKey
    );
    if (existing) {
      await this.removeRecord(existing.id);
    }
    this.lastSyncedAt = new Date().toISOString();
    this.notifyListeners();
  }

  public async flushPendingQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (this.isProcessing || !this.processor) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const candidates = Array.from(this.memoryStore.values())
      .filter((item) => item.status === 'pending' || item.status === 'failed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (candidates.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      for (const item of candidates) {
        processed += 1;
        const syncingItem: OutboxRecord = {
          ...item,
          status: 'syncing',
          updatedAt: new Date().toISOString(),
        };
        await this.persistRecord(syncingItem);
        this.notifyListeners();

        try {
          const res = await this.processor(syncingItem);
          if (res.success) {
            succeeded += 1;
            await this.removeRecord(syncingItem.id);
            this.lastSyncedAt = new Date().toISOString();
          } else {
            failed += 1;
            const failedItem: OutboxRecord = {
              ...syncingItem,
              status: 'failed',
              retryCount: syncingItem.retryCount + 1,
              lastError: res.error || res.message || 'Sinkronisasi gagal pada server.',
              updatedAt: new Date().toISOString(),
            };
            await this.persistRecord(failedItem);
          }
        } catch (err) {
          failed += 1;
          const failedItem: OutboxRecord = {
            ...syncingItem,
            status: 'failed',
            retryCount: syncingItem.retryCount + 1,
            lastError: err instanceof Error ? err.message : 'Kesalahan jaringan saat sinkronisasi.',
            updatedAt: new Date().toISOString(),
          };
          await this.persistRecord(failedItem);
        }
        this.notifyListeners();
      }
    } finally {
      this.isProcessing = false;
      this.notifyListeners();
    }

    return { processed, succeeded, failed };
  }

  public async clearAll(): Promise<void> {
    const ids = Array.from(this.memoryStore.keys());
    for (const id of ids) {
      await this.removeRecord(id);
    }
    this.notifyListeners();
  }
}

export const outboxSyncService = new OutboxSyncService();
