# Paket A: Jenjang Dihapus, Impor Andal, Impor Grup, Babak di Master Data

Basis: `main` terbaru (commit `02dbcb7`). Ada 23 file berubah. Isi zip `paket-a-perubahan.zip` memakai struktur folder repo, jadi cukup timpa file dengan path yang sama.

---

## 1. Urutan pemasangan (WAJIB berurutan)

1. **Jalankan SQL migrasi di Supabase dulu.** Buka Supabase, pilih SQL Editor, tempel seluruh isi `supabase/migrations/20261121_remove_levels_usage.sql`, lalu klik Run.
   - Migrasi ini aman diulang. Nilai, lembar penilaian, peringkat, dan hasil babak tidak diubah.
   - Jika muncul NOTICE "Masih ada N aturan kompetisi berjenjang…", berarti ada cabang yang punya dua aturan. Arsipkan yang tidak dipakai di Master Data > Aturan Cabang. Ini bukan error.
2. **Timpa ke-23 file** dari zip ke repo, lewat AI Studio atau upload manual.
3. **Cek di Health Check Superadmin.** Versi skema harus tetap "ok".
4. **Hapus cache PWA di browser panitia**, atau buka sekali dengan Ctrl+Shift+R, supaya versi baru terpakai.

> `supabase/schema.sql` sudah memuat migrasi 20261121 di bagian paling bawah. Untuk instalasi baru dari nol, cukup jalankan `schema.sql`.

---

## 2. Apa yang berubah untuk pengguna

### a. Jenjang tidak ada lagi
- Tab "Golongan / Jenjang" di Master Data dihapus, begitu juga semua kolom, filter, dan pilihan jenjang di Peserta, Bank Soal, Undian, Rubrik, dan Penugasan Hakim.
- Golongan dan jenis kelamin cukup ditulis di **nama cabang**, misalnya `Tilawah Anak Putra` atau `Tilawah Dewasa Putri`.
- Pencocokan soal ke peserta sekarang hanya memeriksa **cabang dan babak yang sama**, plus soal tidak dipakai dua kali. Galat "Ketidaksesuaian jenjang" tidak akan muncul lagi.
- File Excel lama yang masih punya kolom "Jenjang" tetap bisa diimpor. Kolom itu diabaikan.
- Secara teknis, kolom `level_id` di database dibiarkan (dikosongkan) supaya aman. Kalau suatu saat jenjang dibutuhkan lagi, strukturnya masih ada.

### b. Impor peserta dan bank soal lebih andal
Galat "gagal membaca sheet" sudah diatasi. Pembaca file yang baru:
- Tahan terhadap tabel Excel yang dibuat dengan **Format as Table**. Ini penyebab galat lama "reading 'name'".
- Mencari data di **semua sheet**. Sheet Petunjuk di depan tidak masalah.
- Mengenali **baris judul** di atas header, misalnya "DAFTAR PESERTA MTQ 2026", juga baris kosong dan kolom tambahan yang tidak dikenal.
- Menerima **CSV** dengan pemisah koma atau titik koma (format Excel Indonesia).
- Membaca hasil rumus Excel. Rumus yang tidak punya hasil tersimpan ditolak dengan pesan jelas.
- Menolak file `.xls` lama dengan petunjuk "Simpan Sebagai .xlsx".
- Menampilkan **nomor baris Excel yang asli** pada laporan galat.
- Hanya menyatakan berhasil jika **database benar-benar menyimpan**. Baris yang gagal disimpan dilaporkan dengan alasannya.
- Tidak lagi membuat cabang atau babak otomatis. Kalau cabang belum punya babak yang disebut, barisnya ditolak dengan pesan: *Cabang "X" belum memiliki babak "Y". Buat babaknya di Master Data & Rubrik > Babak Musabaqah.*

### c. Impor Grup / Kafilah (baru)
Lokasinya di halaman Grup & Peserta, tombol Import:
- **Template Grup**: unduh template dengan kolom Kode Grup, Nama Grup, Wilayah, Penanggung Jawab, Telepon, dan Status.
- **Import Grup (.xlsx)**: menampilkan pratinjau dulu, lalu simpan.
  - Jika kode sudah ada, grup lama **diperbarui** (tidak digandakan).
  - Jika kode baru, grup **ditambahkan**.
  - Ditolak: kode atau nama ganda di file, nama yang sudah dipakai grup lain, dan nomor telepon tidak sah.
- Kolom impor peserta juga mengenali "Nama Grup" dan "Kode Grup".

### d. Babak dikelola di Master Data & Rubrik
Tab **Babak Musabaqah** sekarang dikelompokkan per cabang:
- Tombol **"+ Babak untuk cabang ini"** dan **"Tambah Babak"**. Formulirnya berisi cabang, nama (dengan saran Penyisihan, Semifinal, Final), urutan (terisi otomatis), kuota lolos, jumlah juara, dan status.
- Tombol **Ubah** dan **Hapus** di tiap baris.
- Peringatan kuning menampilkan **cabang yang belum punya babak**, supaya panitia tahu cabang mana yang belum siap diisi peserta.
- Validasi: nama wajib, cabang harus ada, urutan dan nama tidak boleh ganda dalam satu cabang, kuota minimal 1, juara antara 1 dan 10. Status "Selesai" hanya bisa didapat lewat pengesahan di Hasil & Kelulusan.
- Halaman **Manajemen Babak** tetap ada untuk operasional, dan punya tombol "Atur di Master Data".

### e. Penguncian babak (penjaga di server dan aplikasi)
- Setelah babak punya **lembar penilaian**, nama, cabang, dan urutan babak **tidak bisa diubah**, karena perubahan itu memindahkan nilai ke babak lain.
- **Kuota lolos dan jumlah juara** masih boleh dikoreksi (tercatat di audit log) **sampai babak disahkan**. Setelah disahkan, keduanya ikut terkunci.
- Status babak tetap bisa diubah seperti biasa.

---

## 3. Operasional banyak cabang: langkah singkat

1. Di Master Data, buka tab **Cabang**, lalu tambah cabang (misalnya "Tilawah Dewasa Putri").
2. Di tab **Babak Musabaqah**, klik "+ Babak untuk cabang ini" dan buat Penyisihan (urutan 1), lalu Final (urutan 2).
3. Di tab **Rubrik** dan **Aturan Cabang**, pastikan cabang itu punya rubrik aktif.
4. Di **Pengguna & Hakim**, tugaskan hakim untuk cabang dan babak tersebut.
5. Impor grup, kemudian peserta, kemudian soal. Kolom Cabang harus sama persis dengan nama cabang, dan kolom Babak harus sudah dibuat untuk cabang itu.
6. Jalankan undian per cabang, lalu penilaian, lalu pengesahan di Hasil & Kelulusan.

---

## 4. Pengujian yang sudah dijalankan

- `npm run lint` (tsc): bersih.
- `npm test`: **150 lulus, 0 gagal**. Termasuk 8 tes impor baru (IMP-01 s.d. IMP-08) dan tes server 97b untuk kunci struktur babak.
- `npm run build`: berhasil.
- E2E Playwright: **50 lulus**, 8 dilewati (tes kredensial live, memang dilewati tanpa akun asli).
- Uji manual otomatis di Mode Demo:
  - tambah babak "Semifinal Uji" dari Master Data berhasil;
  - peringatan cabang tanpa babak tampil;
  - impor grup dari Excel berhasil ("1 ditambahkan, 0 diperbarui") dan grup muncul di tabel.
- SQL migrasi diuji dua kali berturut-turut di Postgres lokal tanpa error.

---

## 5. Daftar file

Baru:
- `supabase/migrations/20261121_remove_levels_usage.sql`
- `src/tests/importParser.test.ts`

Diubah:
- `src/utils/excelHelper.ts`: pembaca Excel/CSV, validasi impor, template, impor grup.
- `src/context/MtqContext.tsx`: impor menunggu hasil database, `importKafilahsBatch`, validasi dan kunci babak, jenjang dihapus.
- `src/components/masterData/MasterDataView.tsx`: tab Babak baru, tab Jenjang dihapus.
- `src/components/kafilah/KafilahPesertaView.tsx`: impor grup, pilihan babak per cabang.
- `src/components/bankSoal/BankSoalView.tsx`: jenjang dihapus, impor diperbarui.
- `src/components/stages/StageManagementView.tsx`
- `src/components/penilaian/PenilaianDualPanelView.tsx`
- `src/services/supabaseDataService.ts`
- `src/services/stageResolver.ts`
- `src/services/scoringEngine.ts`
- `src/services/competitionRules.ts`
- `src/services/rankingService.ts`
- `src/services/completion.ts`
- `src/types/mtq.ts`
- `src/data/mockData.ts`
- `src/content/defaultPages.ts`
- `supabase/schema.sql`: konsolidasi migrasi 20261121.
- `src/tests/domainRules.test.ts`
- `src/tests/supabaseRules.test.ts`
- `src/tests/runAllTests.ts`
- `tests/e2e/06-live-credentials-audit.spec.ts`

---

## 6. Belum termasuk (Paket B, keamanan)

Bagian berikut sengaja dipisah agar Paket A bisa dipasang dan dicoba dulu:
- Kunci bootstrap superadmin dan pendaftaran publik.
- Penulisan langsung `tenant_memberships` dan `judge_assignments` oleh admin tenant.
- Penegakan status tenant (tenant nonaktif tetap bisa dipakai).
- Hak baca audit log dan bank soal oleh hakim.
- **Folder `public/assets/aistudio/` masih ikut terpublikasi.** Isinya zip kode sumber dan catatan. Sebaiknya hapus folder itu dari repo sesegera mungkin, meski Paket B belum dipasang.
- Membersihkan `dev-dist/` dari repo.
