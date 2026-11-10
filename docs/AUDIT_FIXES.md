# Laporan & Pelacakan Perbaikan Audit (AUDIT_FIXES)

Dokumen ini mencatat status pengerjaan seluruh item audit dari Fase 0 hingga Fase 2, termasuk bukti pengujian dan nomor migrasi SQL baru.

## Baseline Awal (Fase 0)
- `npm run lint`: **LULUS** (0 error TypeScript).
- `npm run build`: **LULUS** (bundel produksi berhasil dibangun via Vite).
- `npm test`: **66 / 67 LULUS**, **1 GAGAL** (Tes #59 gagal karena `detachedErrCatField` masih terisi setelah penghapusan bidang rubrik).
- Lockfile: terdapat `bun.lock` dan `package.json` masih bernama `react-example` dengan dependensi `xlsx@0.18.5`.

## Tabel Status Tugas Audit

| Kode | Tugas | Fase | Status | Bukti Pengujian / Migrasi |
| :--- | :--- | :--- | :--- | :--- |
| **F0** | Baseline & pencatatan status awal | Fase 0 | [x] Selesai | `docs/AUDIT_FIXES.md`, `docs/DECISIONS.md` |
| **T1.1** | Metadata maqra selalu cocok dengan teks mushaf (114 surah, 604 halaman, validasi 3 lapis, RPC audit) | Fase 1 | [x] Selesai | Tes #35i & #61 LULUS; `src/data/quranIndex.json`, `src/services/quranIndex.ts`, `20261112_maqra_integrity_and_completion.sql` |
| **T1.2** | Satu definisi "lengkap" (`getStageCompletion`) & `blockingReason` terstruktur + paritas SQL | Fase 1 | [x] Selesai | Tes #35j & #62 LULUS; `src/services/completion.ts`, `get_stage_completion_sql` |
| **T1.3** | Perbaikan tes #59 (`delete_rubric_field_cascade` & `ON DELETE SET NULL`), sinkronisasi lockfile npm, & perbaikan CI | Fase 1 | [x] Selesai | Tes #59 LULUS (71/71), `bun.lock` dihapus, `.github/workflows/ci.yml` diperbarui |
| **T2.1** | Isolasi profil pengguna lintas-tenant pada `upsert_tenant_member_profile` & audit `profiles.role` | Fase 2 | [x] Selesai | Tes #63 LULUS; `20261113_security_tenant_profile_isolation.sql` |
| **T2.2** | Pengerasan Edge Function `admin-provision-user` (rate-limit 429, anti-enumerasi, CORS allowlist, validasi payload) | Fase 2 | [x] Selesai | Tes #35k LULUS; `supabase/functions/admin-provision-user/index.ts`, `src/utils/provisionSecurity.ts` |
| **T2.3** | Penggantian `xlsx@0.18.5` dengan `exceljs` + batas ukuran 5 MB, 5.000 baris, blokir formula & `__proto__` | Fase 2 | [x] Selesai | Tes #35l LULUS, `npm audit --omit=dev --audit-level=high` bersih (0 kerentanan) |
| **T2.4** | Higiene repositori (pindah aset internal dari `public/`, tambah `.aistudio/` ke `.gitignore`, tambah `README.md` & `LICENSE`) | Fase 2 | [x] Selesai | `docs/internal/aistudio/`, `README.md`, `LICENSE`, `.gitignore` |
