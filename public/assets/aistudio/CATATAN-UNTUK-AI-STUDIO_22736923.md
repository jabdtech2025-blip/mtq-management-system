# Catatan Perubahan — Tempel ke Agen AI Studio

Kode di proyek ini sudah diperbarui di luar AI Studio (dasar: commit `86025db`). Perubahan berikut **disengaja**. Jangan dikembalikan, jangan "diperbaiki" ulang, dan baca bagian ini sebelum mengubah file terkait.

## Status gerbang kualitas
- `npm run lint`: lulus, 0 error
- `npm test`: 92/92 lulus (sebelumnya 89)
- `npm run build`: berhasil; bundel awal 0,81 MB (sebelumnya 2,1 MB)

## 1. Undian server dapat diaudit ulang
File: `supabase/migrations/20261115_lottery_reproducible.sql` (BARU), `supabase/schema.sql`
- `draw_lottery_server` tidak lagi memakai `random()` maupun `md5`. Urutan peserta dan maqra ditentukan hanya oleh `seed_hex` + ID lewat fungsi baru `lottery_sort_key()`, sehingga hasil undian bisa dihitung ulang dari seed yang tersimpan.
- `seed_sha256` sekarang SHA-256 asli (fungsi bawaan PostgreSQL), tanpa fallback MD5.
- Fungsi baru `verify_lottery_draw(draw_log_id)` memeriksa ulang urutan peserta dan hash seed.
- JANGAN menambahkan `random()` ke pengurutan undian.

## 2. Peringkat resmi dari server & keputusan pleno untuk seri
File: `src/components/stages/HasilKelulusanView.tsx`, `src/context/MtqContext.tsx`
- Hasil & Kelulusan memanggil RPC `compute_stage_rankings` dan menampilkan peringkat server (kolom Rank + label "Seri").
- Bila ada seri penuh di batas kuota atau posisi juara, muncul panel **Keputusan Sidang Pleno**: admin menentukan urutan dan alasan (min. 5 karakter). Data dikirim sebagai `tieResolution` → `p_tie_resolution`.
- `advanceQualifiers` menerima parameter baru `tieResolution`.
- Setelah pengesahan di mode live, data dimuat ulang dari server (`refreshSupabaseConnection`). Snapshot hitungan browser hanya dipakai di mode demo.
- Sinkron berkala halaman Hasil: 15 detik dan hanya saat tab terlihat (sebelumnya 3 detik).

## 3. UI/UX
- `PenilaianHakimListView.tsx`: opsi cabang diambil dari `cabangList` tenant (bukan daftar tetap). Untuk admin, judulnya "Monitoring Penilaian Dewan Hakim" dan kolomnya "Status Hakim" / "Nilai Hakim".
- Fallback `'Tilawah Dewasa Putra'` dihapus dari form (UserManagement, StageManagement, BankSoal, KafilahPeserta).
- `TopHeader.tsx`: badge "Mode Demo" (kuning) di mode demo; label status berbahasa Indonesia.
- `App.tsx`: teks login dan banner demo tidak lagi memakai istilah teknis. Halaman dimuat dengan `React.lazy` + `Suspense` (code-splitting).
- `utils/dateTime.ts`: fungsi baru `formatTimestampDisplay()` untuk menampilkan waktu ISO dalam WIB (dipakai di Dashboard, Log Aktivitas, notifikasi).
- `DashboardView.tsx`: log penilaian menyertakan kode maqra dan nama babak.
- Hasil & Kelulusan otomatis memilih cabang pertama.
- Semua `text-[9px]`, `text-[10px]`, `text-[11px]` diganti `text-xs` (minimal 12px). Jangan menambahkan ukuran teks di bawah 12px.
- `utils/excelHelper.ts`: `exceljs` dimuat dinamis (`await import('exceljs')`). Fungsi `downloadParticipantExcelTemplate`, `downloadQuestionExcelTemplate`, dan `downloadImportErrorReport` sekarang `async`. JANGAN kembali ke `import ExcelJS from 'exceljs'` statis.

## 4. Tes baru
- 71b: seri penuh Juara 2 vs 3 di final → diblokir, lalu Juara 2/3 mengikuti urutan pleno (bukan nomor undian)
- 71c: nilai bidang non-angka di `field_scores` tidak error
- 75b: undian bisa direproduksi dari seed (dihitung ulang secara independen)

## Yang BELUM dikerjakan (untuk sesi berikutnya)
- Pengelompokan menu sidebar per tahap + stepper progres di Dashboard
- Manajemen Babak dikelompokkan per cabang + peringatan cabang tanpa babak
- Tampilan kartu untuk tabel di ponsel
- Refaktor `MtqContext.tsx` (ditunda dengan sengaja)

## Langkah di Supabase (manual, bukan lewat kode)
1. Jalankan `20261114_audit_fixes.sql` (bila belum), lalu `20261115_lottery_reproducible.sql` di SQL Editor. Uji dulu di proyek terpisah.
2. Matikan pendaftaran mandiri di Dashboard Supabase → Authentication → Sign In / Providers ("Allow new users to sign up" = off). Setting di `supabase/config.toml` hanya berlaku untuk Supabase lokal.
