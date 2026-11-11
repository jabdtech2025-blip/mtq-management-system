# Catatan Perubahan Kelompok 3–4 — Tempel ke Agen AI Studio

Paket ini **sudah termasuk Kelompok 1–2**. Dasar: commit `7ba46bb`. Bila Kelompok 1–2 sudah dimasukkan, cukup ganti file yang berubah. Semua perubahan **disengaja**; jangan dikembalikan atau dilonggarkan supaya tes lolos.

## Status gerbang kualitas
- `npm run lint`: lulus, 0 error
- `npm test`: 112/112 lulus (Kelompok 1–2: 103; tambahan tes 91–99)
- `npm run build`: berhasil
- `npm run test:e2e`: 30 lulus, 8 dilewati (tes akun live & form login, butuh Supabase), 0 gagal — Desktop & iPad

## File yang berubah dibanding 7ba46bb (13)
| File | Status | Kelompok |
| --- | --- | --- |
| `supabase/migrations/20261116_integrity_hardening.sql` | BARU | 1–2 |
| `supabase/migrations/20261117_flow_consistency.sql` | BARU | 3 |
| `supabase/schema.sql` | DIUBAH | 1–3 (isi kedua migrasi ditambahkan di akhir) |
| `supabase/migrations/20261114_audit_fixes.sql` | DIUBAH | 1–2 (blok backfill verifikasi) |
| `src/tests/supabaseRules.test.ts` | DIUBAH | 1–4 |
| `src/services/supabaseDataService.ts` | DIUBAH | 1–3 (log undian, hapus peserta/tenant via RPC) |
| `src/components/stages/HasilKelulusanView.tsx` | DIUBAH | 3 (nomor undian babak) |
| `src/components/superadmin/SuperadminUsersView.tsx` | DIUBAH | 4 (teks) |
| `README.md` | DIUBAH | 4 |
| `tests/e2e/01-auth-gate-and-signup.spec.ts` | DIUBAH | 4 |
| `tests/e2e/02-demo-workspace-navigation.spec.ts` | DIUBAH | 4 |
| `tests/e2e/03-judging-and-scoring.spec.ts` | DIUBAH | 4 |
| `tests/e2e/helpers/auth.ts` | DIUBAH | 4 |

Aturan Kelompok 1–2 tetap seperti di catatan sebelumnya (K1–K4, T1–T5, T7, T8).

## Kelompok 3 — aturan baru di database (migrasi 20261117)
- **S1** Peserta yang seri di luar posisi kritis (mis. peringkat 4 dan 5 di final) kini **berbagi peringkat** di hasil resmi. Nomor undian hanya untuk urutan tampilan.
- **S2** Saat lembar nilai dibuat, `rubric_version_id` ditetapkan server dari `competition_rule_configs` babak itu (nilai dari klien diabaikan bila aturan ada). Rubrik lembar tidak bisa diganti setelah dibuat (`ASSESSMENT_RUBRIC_LOCKED`).
- **S3** `is_assigned_judge` mewajibkan keanggotaan tenant aktif. Hakim berkeanggotaan Nonaktif tidak bisa membuat/memfinalisasi lembar nilai.
- **S5** `draw_lottery_server` mengunci baris babak (`FOR UPDATE`) supaya dua undian bersamaan tidak saling menimpa.
- **S6** Hapus peserta lewat RPC `delete_participant_safe` (satu transaksi; ditolak bila sudah ada lembar nilai apa pun, termasuk draf: `PARTICIPANT_HAS_ASSESSMENTS`). Hapus tenant lewat `delete_tenant_safe` (superadmin; ditolak bila sudah ada riwayat penilaian/undian/audit: `TENANT_HAS_HISTORY` — arsipkan dengan status Nonaktif). `supabaseDataService.deleteParticipant` dan `deleteTenant` sudah memakai RPC ini.
- **S7** Nilai akhir lembar dibatasi `rubric_versions.starting_score` (sama seperti `scoringEngine` klien).
- **S8** Perubahan kuota, jumlah juara, urutan, atau cabang babak tercatat otomatis di `audit_logs` (`STAGE_CONFIG_CHANGED`). Rentang ayat/halaman soal yang sudah dipakai lembar nilai tidak bisa diubah atau dihapus (`QUESTION_LOCKED`).
- **J6** Pemetaan kategori → bidang berdasarkan kemiripan nama (`ILIKE '%tajwid%'` dst.) dihapus. Kategori wajib dipetakan eksplisit (`rubric_field_id`, kriteria, atau aturan potongan; atau nama/kode yang persis sama dengan bidang).
- **S4 (UI)** Hasil & Kelulusan menampilkan nomor undian babak (`stage_participations.lottery_number`), bukan nomor pendaftaran awal.

## Kelompok 4
- README: daftar migrasi lengkap sampai 20261117, langkah mematikan pendaftaran mandiri di dashboard, peringatan **jangan menjalankan ulang satu migrasi lama secara terpisah** (fungsi kembali ke versi lama), panduan rujukan standar.
- Tes E2E diperbarui ke UI terkini. Helper demo kini masuk lewat tombol "Coba Mode Demo" (sebelumnya lewat localStorage, sehingga data babak demo kosong). Tes form login hanya berjalan bila `E2E_SUPABASE_CONFIGURED=true`.
- Tes 99 menjalankan rantai migrasi lengkap (schema + semua migrasi + seed) di database kosong.

## Langkah di Supabase (manual)
1. Jalankan `20261116_integrity_hardening.sql` (bila belum), lalu `20261117_flow_consistency.sql`. Uji dulu di proyek terpisah.
2. Cek kategori kesalahan yang tidak lagi terpetakan setelah J6 (lembar dengan kategori ini akan gagal difinalisasi):
   ```sql
   SELECT ec.tenant_id, ec.code, ec.name
   FROM error_categories ec
   WHERE ec.status = 'Aktif' AND ec.rubric_field_id IS NULL AND ec.criterion_id IS NULL AND ec.deduction_rule_id IS NULL;
   ```
   Petakan kategori tersebut ke bidang rubrik di menu Master Data.

## Yang belum dikerjakan
- **T6** model nilai per bidang (menunggu konfirmasi juknis).
- **J3** seluruh tes integrasi lama dijalankan sebagai `authenticated` (tes baru 80–99 sudah begitu).
- Tombol UI untuk `release_judge_with_reason`.
