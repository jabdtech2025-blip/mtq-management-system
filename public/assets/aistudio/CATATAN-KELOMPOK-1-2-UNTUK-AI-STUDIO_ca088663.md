# Catatan Perubahan Kelompok 1–2 — Tempel ke Agen AI Studio

Dasar: commit `7ba46bb`. Perubahan berikut **disengaja**. Jangan dikembalikan, jangan dilonggarkan, dan jangan "diperbaiki" supaya tes lolos.

## Status gerbang kualitas
- `npm run lint`: lulus, 0 error
- `npm test`: 103/103 lulus (sebelumnya 92; 11 tes baru, nomor 80–90)
- `npm run build`: berhasil

## File yang berubah (5)
| File | Status | Isi |
| --- | --- | --- |
| `supabase/migrations/20261116_integrity_hardening.sql` | BARU | Semua trigger & fungsi pengaman di bawah |
| `supabase/schema.sql` | DIUBAH | Disamakan (isi migrasi 20261116 ditambahkan di akhir + guard T7) |
| `supabase/migrations/20261114_audit_fixes.sql` | DIUBAH | Hanya blok backfill verifikasi (T7) |
| `src/tests/supabaseRules.test.ts` | DIUBAH | 11 tes baru + 4 ekspektasi tes lama disesuaikan |
| `src/services/supabaseDataService.ts` | DIUBAH | 1 baris: simpan log undian memakai `ignoreDuplicates` (log kini append-only) |

## Aturan baru di database (berlaku untuk semua klien)
- **K1** `stage_participations`: setelah babak disahkan, data peserta babak itu tidak bisa diubah, ditambah, atau dihapus. Kolom `final_score`, `rank`, `is_qualified`, `champion_rank`, `champion_title`, `qualification_reason` hanya bisa diisi oleh `advance_stage_qualifiers`. Peserta hanya bisa masuk babak lanjutan (bila ada babak sebelumnya yang sudah disahkan) lewat pengesahan resmi. Error: `STAGE_RESULT_LOCKED`, `STAGE_RESULT_RPC_ONLY`, `STAGE_ENTRY_VIA_QUALIFICATION_ONLY`.
- **K2** Lembar nilai wajib memakai maqra milik peserta yang sama (`ASSESSMENT_MAQRA_MISMATCH`). Peringkat hanya menghitung lembar seperti itu.
- **K3** `finalize_judge_assessment` menolak potongan di luar bidang tugas hakim (`JUDGE_FIELD_VIOLATION`). Bidang tugas dibaca dari `judge_assignments.rubric_field_id`, atau dari `judge_field` (mis. "Tajwid"/"Bidang Tajwid"). Penugasan yang tidak cocok dengan satu bidang (mis. "Dewan Hakim") dianggap boleh menilai semua bidang.
- **K4** `lottery_draw_logs` append-only (tidak bisa diubah/dihapus).
- **T1** Keputusan pleno untuk nilai seri wajib mencakup setiap peserta yang seri, dengan urutan unik 1..n dan alasan ≥ 5 karakter per peserta.
- **T2** Penugasan/keanggotaan hakim yang sudah memfinalisasi nilai di babak yang belum disahkan tidak bisa dinonaktifkan/dihapus langsung (`JUDGE_HAS_FINALIZED_SHEETS`). Gunakan RPC `release_judge_with_reason(p_tenant_id, p_judge_profile_id, p_reason, p_stage_id)`; alasan ≥ 10 karakter, tercatat di `audit_logs` (`JUDGE_RELEASED`). **Belum ada tombol di UI untuk RPC ini.**
- **T3** Kategori kesalahan & aturan potongan yang sudah dipakai lembar final tidak bisa diubah bobot/pemetaannya atau dihapus (`ERROR_CATEGORY_LOCKED`, `DEDUCTION_RULE_LOCKED`). Ganti nama tetap boleh.
- **T4** Undian server mengabaikan peserta berstatus Ditolak; hanya peserta Diajukan yang memblokir.
- **T5** `verification_status` hanya bisa diubah lewat `verify_participant` (`VERIFICATION_RPC_ONLY`), dan status Diverifikasi tidak bisa dicabut saat penilaian peserta sedang berjalan (`VERIFICATION_LOCKED_DURING_JUDGING`).
- **T7** Backfill "Diverifikasi" di migrasi 20261114 hanya berjalan saat kolom pertama kali dibuat.
- **T8** `compute_stage_rankings` hanya untuk admin/superadmin. Hakim tidak lagi bisa melihat peringkat sementara.

## Catatan untuk tes
- Boot tes kini menjalankan migrasi 20261116, sehingga `finalize_judge_assessment` yang dipakai tes adalah versi terbaru yang **menghitung ulang nilai di server** dari `error_counts`. Karena itu ekspektasi tes 44, 45, 48, 58 diperbarui (mis. 97 → 99, 98.5 → 100). Sebelumnya tes tanpa sengaja memakai versi lama yang mempercayai nilai dari klien.
- Data uji lama menyisipkan `stage_participations` langsung sebagai superuser, jadi boot tes mengaktifkan flag sesi `mtq.rpc_participation_setup`. Flag ini hanya bisa diset dari SQL sisi server (tidak lewat Data API). Tes 80–90 mematikannya dan berjalan sebagai `ROLE authenticated`.

## Langkah di Supabase (manual)
1. Jalankan `supabase/migrations/20261116_integrity_hardening.sql` di SQL Editor (setelah 20261114 dan 20261115). Uji dulu di proyek terpisah.
2. Bila ada data lama yang melanggar K2 (lembar nilai dengan maqra milik peserta lain), lembar itu tetap tersimpan tetapi tidak lagi dihitung di peringkat. Cek dengan:
   ```sql
   SELECT ja.id, ja.stage_participation_id, ja.assigned_maqra_id
   FROM judge_assessments ja
   JOIN assigned_maqras am ON am.id = ja.assigned_maqra_id
   WHERE am.stage_participation_id <> ja.stage_participation_id;
   ```
