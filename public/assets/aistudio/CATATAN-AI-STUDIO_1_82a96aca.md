# Instruksi untuk AI Studio: Kelengkapan Babak per Bidang (Dewan Hakim Bisa Dibagi Beberapa Tim) + Perbaikan Undian

> Salin seluruh teks di bawah garis ini ke AI Studio, lalu lampirkan `kelengkapan-per-bidang.zip`.

---

## Konteks

Repo ini adalah aplikasi MTQ (React + Vite + TypeScript + Supabase). Paket ini dibuat dari `main` terbaru di GitHub (commit `39392f1`). Isinya **15 file** dengan struktur folder yang sama persis dengan repo.

Paket ini **sudah termasuk perbaikan undian** (migrasi 20261123) yang sebelumnya dikirim terpisah sebagai `perbaikan-undian.zip`. Paket undian itu **tidak perlu** dipasang lagi.

## Masalah yang diselesaikan

1. **Dewan hakim dibagi dua tim dalam satu babak.** Contoh: Tim A (Juri Tajwid, Juri Itqon) menilai separuh peserta, Tim B (Juri Tajwid, Juri Itqon) menilai separuh lainnya. Sebelumnya babak atau juara baru bisa disahkan bila **setiap hakim** yang ditugaskan sudah menilai **setiap peserta**. Akibatnya babak dengan 2 tim tidak pernah bisa disahkan.
2. **Undian gagal `INSUFFICIENT_QUESTION_POOL`.** Soal tertaut ke babak milik cabang lain (data lama). Rinciannya ada di paket undian sebelumnya.

## Aturan baru kelengkapan

Peserta dianggap **lengkap** bila untuk setiap maqra, setiap bidang rubrik yang dipegang hakim sudah punya **minimal satu lembar final dari hakim yang memegang bidang itu**. Tidak harus dinilai semua hakim.

- **Perhitungan nilai tidak berubah.** Nilai tiap bidang tetap rata-rata dari hakim pemegang bidang yang menilai, lalu dijumlah.
- **Masih memblokir pengesahan:** peserta yang terlewat atau bidangnya belum dinilai, peserta tanpa maqra, dan bidang yang tidak dipegang hakim mana pun (`FIELD_WITHOUT_JUDGE`).
- Babak dengan hakim yang memegang **semua bidang** berperilaku sama seperti sebelumnya.

## Tugas

1. **Timpa** ke-15 file berikut dengan isi dari zip, **apa adanya**, pada path yang sama:

   **File baru:**
   - `supabase/migrations/20261123_question_stage_branch.sql`
   - `supabase/migrations/20261124_completion_per_field.sql`

   **File yang diganti:**
   - `src/components/bankSoal/BankSoalView.tsx`
   - `src/components/penilaian/PenilaianHakimListView.tsx`
   - `src/components/rekap/RekapNilaiView.tsx`
   - `src/components/stages/HasilKelulusanView.tsx`
   - `src/components/stages/StageManagementView.tsx`
   - `src/context/MtqContext.tsx`
   - `src/services/completion.ts`
   - `src/services/rankingService.ts`
   - `src/services/scoringEngine.ts`
   - `src/services/stageResolver.ts`
   - `src/tests/multiBranch.test.ts`
   - `src/tests/supabaseRules.test.ts`
   - `supabase/schema.sql`

2. **Aturan penting:**
   - **Jangan** menulis ulang, merapikan, atau memotong isi file. Salin persis dari zip, termasuk file besar `MtqContext.tsx`, `schema.sql`, dan migrasi 20261124 (sekitar 1.200 baris).
   - **Jangan** mengubah file lain di luar 15 file di atas, termasuk migrasi lama yang sudah dijalankan.
   - Bila ada konflik, **gunakan versi dari zip**.

3. **Setelah menyalin, jalankan pemeriksaan berikut dan laporkan hasilnya:**
   ```
   npm run lint
   npm test
   npm run build
   ```
   Hasil yang diharapkan: lint tanpa error, `npm test` **159 lulus, 0 gagal**, dan build berhasil. Jika ada yang gagal, **laporkan pesan error-nya saja** tanpa mengubah kode.

4. **Commit** dengan pesan:
   ```
   Kelengkapan babak per bidang + perbaikan undian soal

   - Babak/juara bisa disahkan bila setiap bidang tiap peserta dinilai minimal satu hakim pemegangnya
     (dewan hakim bisa dibagi beberapa tim dalam satu babak)
   - Rekap menghitung nilai per bidang dari hakim pemegang bidang
   - Halaman hakim: tanda "Sudah Dinilai Juri Lain" dan filter "Belum Dinilai Siapa Pun"
   - Undian: soal yang tertaut ke babak cabang lain diluruskan; layar undian memakai aturan server
   ```

## Langkah manual (dilakukan pemilik repo, bukan AI Studio)

Di **Supabase**, buka **SQL Editor**, lalu jalankan **berurutan**:

1. `supabase/migrations/20261123_question_stage_branch.sql`: meluruskan soal yang tertaut ke babak cabang lain dan memasang penjaganya. Langkah ini membetulkan 20 soal Final Marhalah Mutawassithah.
2. `supabase/migrations/20261124_completion_per_field.sql`: aturan kelengkapan per bidang untuk pengesahan babak dan juara.

Keduanya aman dijalankan berulang dan tidak mengubah nilai, lembar penilaian, maupun hasil babak yang sudah disahkan.

## Cara memakai dua tim juri

1. Di **Pengguna & Hakim**, tugaskan **keempat juri** ke babak penyisihan cabang tersebut, masing-masing dengan bidangnya:
   - Ust. Ibrohim (Tim A) dan Ust. Abdul Hakim (Tim B): bidang **Tajwid**.
   - Ust. Rahmat (Tim A) dan Ust. Ubaidullah (Tim B): bidang **Itqon**, atau nama bidang yang sesuai di rubrik.
2. Bagi peserta antar-tim di luar aplikasi, misalnya nomor undian 1–20 untuk Tim A dan 21–40 untuk Tim B.
3. Juri menilai peserta bagiannya. Di **Peserta Saya**:
   - peserta yang sudah dinilai tim lain diberi tanda **"Sudah Dinilai Juri Lain"** beserta nama jurinya;
   - filter **"Belum Dinilai Siapa Pun"** menampilkan peserta yang belum disentuh siapa pun.
4. Di **Hasil & Kelulusan**, kolom **"Kelengkapan Penilaian"** menunjukkan berapa bidang yang sudah dinilai. Babak bisa disahkan setelah semua peserta lengkap. Peringkat tetap digabung dalam satu cabang.
5. **Final** (Juri 1 Ust. Ibrohim, Juri 2 Ust. Abdul Hakim): tugaskan keduanya ke babak Final dengan bidang masing-masing. Satu juri boleh memegang lebih dari satu bidang.

Catatan: aplikasi **tidak membatasi** siapa menilai siapa. Juri Tim A tetap bisa membuka peserta Tim B. Bila satu peserta tidak sengaja dinilai dua juri Tajwid, nilai Tajwid-nya dirata-rata. Hitungannya tidak salah, tetapi sebaiknya dihindari.

## Ringkasan perubahan

| Area | Sebelum | Sesudah |
|---|---|---|
| Pengesahan babak & juara (server) | Semua hakim wajib menilai semua peserta | Setiap bidang (per maqra) cukup dinilai satu hakim pemegangnya |
| Hasil & Kelulusan | "x / y Juri Final" | "x / y Bidang Dinilai" (tampilan lama tetap dipakai bila rubrik tanpa bidang) |
| Rekap Nilai | Rata-rata nilai akhir lembar (keliru bila hakim memegang bidang berbeda) | Nilai per bidang dari hakim pemegang bidang lalu dijumlah, sama dengan Hasil & Kelulusan dan server |
| Monitoring dan Peserta Saya | Tidak tahu peserta sudah dinilai tim lain | Tanda "Sudah Dinilai Juri Lain" dan filter "Belum Dinilai Siapa Pun" |
| Manajemen Babak dan Dashboard | Status "Lengkap" wajib semua hakim | Mengikuti aturan per bidang |
| Undian | Soal yang ditolak server tetap tampil | Hanya soal yang benar-benar bisa diundi, yang lain ditampilkan beserta alasannya |

## Catatan teknis untuk pemeliharaan

- Tes 89 (menjalankan ulang migrasi lama) sebelumnya hanya menjalankan migrasi sampai 20261117, sehingga semua tes sesudahnya diam-diam memakai fungsi server versi lama. Sekarang tes itu menjalankan migrasi sampai yang terbaru.
- Dua fixture tes end-to-end diperbaiki karena tidak lolos aturan server yang sudah berlaku sejak 20261120: penugasan hakim tidak mencakup semua bidang, dan nilai bidang tidak sesuai total.
