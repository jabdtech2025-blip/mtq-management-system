# Manajemen MTQ — Platform E-Scoring & Manajemen Musabaqah Multi-Tenant

Platform manajemen musabaqah dan penilaian digital (E-Scoring) multi-tenant untuk penyelenggaraan MTQ/STQ (Musabaqah Tilawatil Qur'an & Seleksi Tilawatil Qur'an) dengan arsitektur **Server-Authoritative Scoring** berbasis PostgreSQL / Supabase.

---

## 1. Ringkasan Arsitektur

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4.
- **Database & Otorisasi**: Supabase PostgreSQL 16 dengan **Row Level Security (RLS)** ketat (`tenant_memberships`, `is_tenant_admin`, `is_superadmin`, `is_assigned_judge`).
- **Otoritas Penilaian Server (SQL)**:
  - Perhitungan skor (`calculate_assessment_score_sql`), penguncian lembar nilai (`finalize_judge_assessment`), pembukaan kembali dengan alasan audit (`reopen_judge_assessment`), undian maqra atomik (`commit_lottery_draw`), kelengkapan babak (`get_stage_completion_sql`), serta kualifikasi & pemecahan nilai seri (`advance_stage_qualifiers`) dieksekusi secara atomik di PostgreSQL.
- **Indeks Mushaf Madinah (604 Halaman)**:
  - Pemetaan 114 surah dan 604 halaman Mushaf Standar Madinah (`src/data/quranIndex.json` & `src/services/quranIndex.ts`) yang divalidasi di form UI, import Excel (`exceljs`), dan trigger PostgreSQL (`trg_validate_question_maqra`).
- **Edge Function**:
  - `supabase/functions/admin-provision-user/index.ts` untuk undangan & penautan akun berbasis `SUPABASE_SERVICE_ROLE_KEY` di sisi server dengan rate-limit 20 undangan/jam (HTTP 429), anti-enumerasi, dan allowlist CORS (`ALLOWED_ORIGINS`).

---

## 2. Cara Menjalankan Secara Lokal

1. Pastikan **Node.js 22+** terpasang.
2. Salin `.env.example` menjadi `.env` dan isi variabel lingkungan Supabase Anda (atau kosongkan untuk menjalankan dalam mode pratinjau lokal):
   ```bash
   cp .env.example .env
   ```
3. Instal dependensi dari lockfile bersih:
   ```bash
   npm ci
   ```
4. Jalankan server pengembangan di port `3000`:
   ```bash
   npm run dev
   ```

---

## 3. Cara Menerapkan Database (`schema.sql` + Migrasi + `seed.sql`)

Pada proyek Supabase baru (atau instance PostgreSQL 16):

1. Jalankan skema dasar:
   - `supabase/schema.sql`
2. Jalankan file migrasi inkremental secara berurutan di folder `supabase/migrations/`:
   - `20261027_production_hardening.sql`
   - `20261029_security_and_crud_hardening.sql`
   - `20261030_auth_provisioning_and_bootstrap.sql`
   - `20261109_complete_system_improvement.sql`
   - `20261110_master_data_pure_db.sql`
   - `20261110_server_scoring_and_atomic_lottery.sql`
   - `20261111_fix_v_rule_unassigned.sql`
   - `20261112_maqra_integrity_and_completion.sql`
   - `20261113_security_tenant_profile_isolation.sql`
3. (Opsional untuk lingkungan uji/demo) Jalankan data awal:
   - `supabase/seed.sql`
4. Untuk mem-bootstrap akun Superadmin pertama kali secara aman (hanya dapat dijalankan satu kali):
   ```sql
   SELECT public.bootstrap_first_superadmin('email-superadmin@domain.id', NULL);
   ```

---

## 4. Cara Menjalankan Pengujian & Gerbang Kualitas

- **Pemeriksaan Tipe Statis (TypeScript)**:
  ```bash
  npm run lint
  ```
- **Suite Pengujian Domain, Integritas Mushaf, & PostgreSQL 16 Nyata (PGlite)**:
  ```bash
  npm test
  ```
- **Build Bundel Produksi**:
  ```bash
  npm run build
  ```
- **Audit Keamanan Dependensi Produksi**:
  ```bash
  npm audit --omit=dev --audit-level=high
  ```

---

## 5. Dokumentasi Tambahan

- `docs/AUDIT_FIXES.md` — Pelacakan perbaikan audit teknis & keamanan.
- `docs/DECISIONS.md` — Catatan keputusan domain musabaqah yang memerlukan konfirmasi pemilik rubrik/LPTQ.
- `docs/THIRD_PARTY.md` — Daftar sumber data pihak ketiga & lisensi.
