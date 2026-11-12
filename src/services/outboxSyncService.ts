/**
 * Status item antrean:
 * - pending  : menunggu dikirim
 * - syncing  : sedang dikirim
 * - failed   : gagal SEMENTARA (mis. jaringan) — dicoba ulang otomatis dengan jeda bertahap
 * - rejected : DITOLAK server (hak akses, babak disahkan, data tidak valid) — TIDAK dicoba ulang otomatis;
 *              pengguna memilih "Coba lagi" atau "Buang" lewat jendela Gagal Menyinkronkan
 * - synced   : terkirim (biasanya langsung dihapus dari antrean)
 */
export type OutboxItemStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'rejected';

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
  /** id akun (auth user) pemilik perubahan; item tanpa ownerId berasal dari versi lama */
  ownerId?: string;
  /** waktu paling cepat percobaan berikutnya (ISO) untuk status failed */
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Jenis kegagalan sinkron. */
export type SyncFailureKind = 'network' | 'rejected';

/**
 * Bedakan gangguan jaringan (boleh dicoba ulang otomatis) dari penolakan server (percuma dicoba ulang).
 */
export function classifySyncFailure(message?: string | null): SyncFailureKind {
  const text = (message || '').toLowerCase();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network';
  if (
    /row-level security|violates|permission denied|42501|not allowed|tidak diizinkan|forbidden|unauthori[sz]ed|jwt|foreign key|tidak ditemukan|not found|tidak valid|invalid input|sudah (difinalisasi|final|disahkan|dikunci)|terkunci|finalized|is_locked|duplicate key|tidak dikenal|tidak lengkap|check constraint/.test(
      text
    )
  ) {
    return 'rejected';
  }
  return 'network';
}

/** Terjemahkan pesan teknis menjadi kalimat yang mudah dipahami panitia & hakim. */
export function friendlySyncError(message?: string | null): string {
  const text = (message || '').toLowerCase();
  if (!text) return 'Server tidak memberi alasan.';
  if (/row-level security|permission denied|42501|not allowed|tidak diizinkan|forbidden/.test(text)) {
    return 'Ditolak server: akun ini tidak berhak menyimpan data tersebut (mis. tidak ditugaskan di babak ini, atau babak sudah disahkan).';
  }
  if (/sudah (difinalisasi|final|disahkan|dikunci)|terkunci|finalized|is_locked/.test(text)) {
    return 'Ditolak server: lembar atau babak ini sudah dikunci/disahkan.';
  }
  if (/foreign key|tidak ditemukan|not found/.test(text)) {
    return 'Ditolak server: data terkait (peserta, babak, atau soal) tidak ditemukan di server.';
  }
  if (/jwt|unauthori[sz]ed|session/.test(text)) {
    return 'Sesi masuk berakhir. Masuk kembali lalu coba lagi.';
  }
  if (/failed to fetch|network|timeout|timed out|kesalahan jaringan|load failed/.test(text)) {
    return 'Koneksi ke server terputus. Akan dicoba lagi otomatis.';
  }
  return message as string;
}

/** Jeda bertahap percobaan ulang untuk gangguan jaringan: 20 dtk, 1 mnt, lalu tiap 5 mnt. */
export function retryDelayMs(retryCount: number): number {
  const steps = [20_000, 60_000, 300_000];
  return steps[Math.min(Math.max(retryCount - 1, 0), steps.length - 1)];
}

export interface OutboxSummary {
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  rejectedCount: number;
  syncedCount: number;
  lastSyncedAt: string | null;
  items: OutboxRecord[];
}

type OutboxListener = (summary: OutboxSummary) => void;
// `message` diterima juga karena pemroses di MtqContext mengembalikan { success, message }
// `skipped: true` = item bukan milik akun yang sedang masuk; biarkan apa adanya
type OutboxProcessor = (
  record: OutboxRecord
) => Promise<{ success: boolean; error?: string; message?: string; skipped?: boolean }>;

/** Seberapa sering antrean diperiksa (item 'failed' tetap menunggu nextAttemptAt masing-masing). */
const RETRY_INTERVAL_MS = 15_000;
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

  private isDue(item: OutboxRecord, now = Date.now()): boolean {
    if (item.status === 'pending') return true;
    if (item.status !== 'failed') return false;
    return !item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now;
  }

  private hasRetryableItems(): boolean {
    const now = Date.now();
    for (const item of this.memoryStore.values()) {
      if (this.isDue(item, now)) return true;
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

  public getSummary(filter?: string | ((item: OutboxRecord) => boolean)): OutboxSummary {
    const predicate =
      typeof filter === 'function'
        ? filter
        : (item: OutboxRecord) => !filter || item.tenantId === filter;
    const allItems = Array.from(this.memoryStore.values())
      .filter(predicate)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return OutboxSyncService.summarize(allItems, this.lastSyncedAt);
  }

  public static summarize(allItems: OutboxRecord[], lastSyncedAt: string | null): OutboxSummary {
    let pendingCount = 0;
    let syncingCount = 0;
    let failedCount = 0;
    let rejectedCount = 0;
    let syncedCount = 0;

    for (const item of allItems) {
      if (item.status === 'pending') pendingCount += 1;
      else if (item.status === 'syncing') syncingCount += 1;
      else if (item.status === 'failed') failedCount += 1;
      else if (item.status === 'rejected') rejectedCount += 1;
      else if (item.status === 'synced') syncedCount += 1;
    }

    return {
      pendingCount,
      syncingCount,
      failedCount,
      rejectedCount,
      syncedCount,
      lastSyncedAt,
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
    ownerId?: string;
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

    // Penolakan server langsung ditandai 'rejected' (tidak dicoba ulang otomatis)
    const initialStatus: OutboxItemStatus =
      params.errorMessage && classifySyncFailure(params.errorMessage) === 'rejected' ? 'rejected' : 'pending';

    const record: OutboxRecord<TPayload> = existing
      ? {
          ...(existing as OutboxRecord<TPayload>),
          payload: params.payload,
          entityLabel: params.entityLabel,
          status: initialStatus,
          lastError: params.errorMessage || existing.lastError,
          ownerId: params.ownerId || existing.ownerId,
          nextAttemptAt: undefined,
          updatedAt: now,
        }
      : {
          id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          idempotencyKey: params.idempotencyKey,
          tenantId: params.tenantId,
          operationType: params.operationType as OutboxOperationType,
          entityLabel: params.entityLabel,
          payload: params.payload,
          status: initialStatus,
          retryCount: 0,
          lastError: params.errorMessage,
          ownerId: params.ownerId,
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

  /** Kirim ulang satu item sekarang (dipakai tombol "Coba lagi"), termasuk item yang ditolak. */
  public async retryItem(id: string): Promise<void> {
    if (this.initPromise) await this.initPromise;
    const item = this.memoryStore.get(id);
    if (!item) return;
    await this.persistRecord({ ...item, status: 'pending', nextAttemptAt: undefined, updatedAt: new Date().toISOString() });
    this.notifyListeners();
    await this.flushPendingQueue();
  }

  /** Buang item dari antrean (tombol "Buang perubahan ini"). Perubahan itu tidak akan dikirim ke server. */
  public async discardItems(ids: string[]): Promise<void> {
    if (this.initPromise) await this.initPromise;
    for (const id of ids) {
      if (this.memoryStore.has(id)) await this.removeRecord(id);
    }
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

    const nowMs = Date.now();
    const candidates = Array.from(this.memoryStore.values())
      .filter((item) => this.isDue(item, nowMs))
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
          if (res.skipped) {
            // Bukan milik akun yang sedang masuk: kembalikan apa adanya
            await this.persistRecord(item);
            processed -= 1;
          } else if (res.success) {
            succeeded += 1;
            await this.removeRecord(syncingItem.id);
            this.lastSyncedAt = new Date().toISOString();
          } else {
            failed += 1;
            const errorText = res.error || res.message || 'Sinkronisasi gagal pada server.';
            const retryCount = syncingItem.retryCount + 1;
            const kind = classifySyncFailure(errorText);
            const failedItem: OutboxRecord = {
              ...syncingItem,
              status: kind === 'rejected' ? 'rejected' : 'failed',
              retryCount,
              lastError: errorText,
              nextAttemptAt:
                kind === 'rejected' ? undefined : new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await this.persistRecord(failedItem);
          }
        } catch (err) {
          failed += 1;
          const retryCount = syncingItem.retryCount + 1;
          const failedItem: OutboxRecord = {
            ...syncingItem,
            status: 'failed',
            retryCount,
            lastError: err instanceof Error ? err.message : 'Kesalahan jaringan saat sinkronisasi.',
            nextAttemptAt: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
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
