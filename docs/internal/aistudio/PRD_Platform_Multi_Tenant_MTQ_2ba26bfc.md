# Product Requirements Document (PRD)
## Platform Manajemen MTQ Multi-Tenant

- **Versi:** 0.1 — Draft kebutuhan produk
- **Tanggal:** 22 Oktober 2026
- **Status:** Konsep awal untuk validasi kebutuhan
- **Platform:** Aplikasi web responsif

## 1. Ringkasan Produk

Platform mengelola banyak penyelenggara MTQ dalam satu aplikasi. Setiap tenant memiliki data, admin, hakim, peserta, kafilah, bank soal, master data, penilaian, rekap, dan dashboard yang terisolasi.

Halaman hakim menggunakan dua panel: mushaf digital di kiri dan input kategori kesalahan di kanan. Input disimpan otomatis dan direkap real-time. Tombol **Simpan Penilaian** berfungsi sebagai finalisasi/penguncian nilai sekaligus menyimpan snapshot anotasi mushaf.

### Tujuan
- Isolasi data multi-tenant.
- Pengelolaan kafilah, peserta, bank soal, dan master data dari halaman admin.
- Penilaian hakim dengan mushaf yang dapat diberi anotasi.
- Input jumlah kesalahan dengan tombol plus/minus dan bobot terkonfigurasi.
- Rekap per peserta dengan kolom per hakim dan komponen nilai.
- Dashboard dengan statistik aktual serta aktivitas terbaru.

### Bukan sasaran MVP
- Deteksi kesalahan otomatis berbasis AI.
- Penilaian otomatis dari audio.
- Aplikasi native terpisah.
- Integrasi eksternal yang belum ditetapkan.

## 2. Prinsip dan Istilah

| Istilah | Definisi |
|---|---|
| Tenant | Satu penyelenggara/lingkungan data MTQ. |
| Admin tenant | Pengelola data dan konfigurasi tenant. |
| Hakim | Pengguna yang diberi penugasan penilaian. |
| Babak | Contoh: Penyisihan, Final, Super Final. |
| Jenjang | Contoh: Mutawassit, Ulya, Jami’ah, sesuai master data. |
| Kategori kesalahan | Contoh: Aslah (label sementara), Fasahah, Tajwid, Makharijul Huruf, Idgham, Lagu. |
| Anotasi mushaf | Coretan/penanda digital dengan koordinat dan referensi halaman. |
| Real-time | Update diterima server dan tampil tanpa reload manual. |
| Simpan/finalisasi | Aksi mengunci penilaian dan snapshot anotasi. |

Kategori, bobot, formula, batas nilai, serta metode agregasi harus configurable. Nomenklatur “Aslah” perlu dikonfirmasi pemilik rubrik.

## 3. Peran dan Hak Akses

| Peran | Kewenangan |
|---|---|
| Superadmin platform (opsional) | Mengelola tenant dan dukungan platform; akses lintas tenant tercatat. |
| Admin MTQ | Mengelola event, master data, kafilah, peserta, bank soal, hakim, dashboard, dan rekap tenant sendiri. |
| Hakim | Menilai peserta yang ditugaskan, menandai mushaf, mengisi jumlah kesalahan, dan menyimpan penilaian final. |

Hakim tidak dapat membuka peserta di luar penugasan atau melihat rekap lengkap hakim lain secara default. Semua otorisasi ditegakkan di server.

## 4. Struktur Navigasi

### Admin
- Dashboard.
- Manajemen Data: Kafilah, Peserta, Bank Soal.
- Master Data: Babak, Jenjang, Cabang/Golongan, Kategori Kesalahan & Bobot, Rubrik/Aturan Nilai, Pengguna & Penugasan Hakim.
- Penilaian Hakim (monitoring).
- Rekap Nilai.
- Pengaturan Event.

### Hakim
- Daftar peserta yang ditugaskan.
- Halaman penilaian peserta: soal, mushaf, anotasi/coretan, kategori kesalahan, tombol plus/minus, nilai, Simpan Penilaian.

## 5. Alur Utama

### Admin menyiapkan event
1. Membuat/membuka tenant dan event.
2. Mengatur babak, jenjang, cabang/golongan, dan rubrik.
3. Mengisi kategori kesalahan serta bobot/metode hitung.
4. Membuat kafilah dan menambah peserta.
5. Membuat bank soal dan menetapkan soal.
6. Membuat akun hakim dan menetapkan peserta.

### Hakim menilai
1. Memilih peserta dari daftar penugasan.
2. Melihat identitas dan soal yang benar.
3. Menandai/coret mushaf di panel kiri.
4. Menambah/mengurangi kejadian per kategori pada panel kanan.
5. Perubahan otomatis tersimpan dan dikirim ke rekap.
6. Menekan **Simpan Penilaian**, lalu mengonfirmasi finalisasi.
7. Sistem memvalidasi, mengunci nilai, dan menyimpan snapshot anotasi.

### Admin merekap
1. Memfilter peserta berdasarkan event/babak/jenjang/cabang/kafilah.
2. Melihat kolom setiap hakim dan komponen nilainya.
3. Memantau live update saat penilaian berlangsung.
4. Melihat status Final/Terkunci setelah hakim menyimpan final.

## 6. Kebutuhan Fungsional

### Multi-tenant dan akses — P0
- Semua data bisnis berisi `tenant_id`.
- Admin dan hakim tergabung ke tenant melalui membership/role.
- Query, API, export, file, dan subscription real-time harus terisolasi per tenant.
- Hakim hanya dapat mengakses peserta sesuai `judge_assignments`.

### Dashboard — P0/P1
- P0: total peserta, kafilah, hakim, event/babak aktif; progres Belum Dimulai/Berlangsung/Final; aktivitas terbaru real-time.
- P1: filter event, babak, jenjang, cabang/golongan, arena; peringatan konflik atau data tidak lengkap.

### Manajemen Data: Kafilah dan Peserta — P0
- Daftar kafilah; tambah/edit/nonaktifkan.
- Klik kafilah membuka detail dengan daftar pesertanya.
- Tambah peserta dari halaman detail kafilah.
- Daftar peserta lintas kafilah dengan pencarian dan filter.
- Form peserta minimal berisi ID/nomor, nama, kafilah, jenjang, cabang/golongan, event/babak bila relevan.
- Validasi duplikasi; import massal dapat masuk P1.

### Bank Soal — P0
- Daftar/cari/tambah/edit soal.
- Soal menyimpan kode/judul, instruksi, referensi surah/ayat/halaman/segmen mushaf, dan cakupan.
- Admin menetapkan soal kepada peserta atau kelompok.
- Hakim hanya melihat soal yang ditetapkan untuk penugasan yang dipilih.
- Pengundian dapat masuk P1 jika digunakan panitia.

### Master Data — P0
- Babak: dapat menambah dan mengurutkan Penyisihan, Final, Super Final, dll.
- Jenjang: dapat menambah dan mengurutkan Mutawassit, Ulya, Jami’ah, dll.
- Cabang/golongan: konfigurasi kompetisi per tenant/event.
- Kategori kesalahan: nama, kode, deskripsi, urutan, status aktif, dan cakupan.
- Bobot/aturan: per kejadian atau metode lain yang didefinisikan rubrik; tidak hard-coded.
- Versi aturan: penilaian menyimpan versi rubrik yang digunakan.

### Halaman penilaian hakim — P0
- Daftar peserta yang ditugaskan.
- Detail peserta dengan layout dua panel: mushaf di kiri, kontrol kesalahan di kanan.
- Mushaf mendukung navigasi, zoom, coret/penanda, penghapus, undo (redo bila tersedia).
- Anotasi menyimpan posisi relatif halaman dan referensi halaman/ayat bila tersedia.
- Kategori memiliki tombol +/−; jumlah tidak boleh negatif.
- Perubahan otomatis tersimpan selama penilaian berjalan.
- Tombol **Simpan Penilaian** menampilkan konfirmasi; saat disetujui, server menyimpan status final/terkunci beserta snapshot nilai dan anotasi.
- Nilai per hakim terpisah; Hakim A tidak menimpa Hakim B.
- Reopen/koreksi setelah final (P1) harus punya alasan dan audit.

### Rekap nilai — P0/P1
- Tabel peserta dengan kelompok kolom Hakim A, B, C, dst.
- Tiap kelompok memperlihatkan jumlah/poin kategori: Makharijul Huruf, Idgham, Fasahah, Tajwid, Lagu, dan kategori tenant lainnya.
- Jumlah kesalahan, poin pengurangan, nilai komponen, dan nilai akhir diberi label berbeda.
- Update diterima server muncul tanpa reload manual.
- Status per hakim: Belum Dimulai, Berlangsung, Final/Terkunci.
- Detail peserta menunjukkan nilai per hakim dan anotasi sesuai hak akses.
- Filter, sort, pencarian, ekspor, dan ranking masuk P1; ranking mengikuti metode resmi.

### Audit dan ketahanan — P0
- Log user, waktu, tenant, peserta, hakim, kategori, nilai sebelum/sesudah, dan aksi.
- Update plus/minus aman terhadap request bersamaan.
- UI menampilkan status sinkronisasi; gagal simpan tidak boleh terlihat sukses.
- Draft live dan anotasi yang tersimpan pulih setelah refresh/login ulang.

## 7. Real-Time dan Finalisasi

| Kondisi | Perilaku |
|---|---|
| Berlangsung | Input jumlah dan anotasi tersimpan otomatis; rekap menampilkan update live dengan status Berlangsung/sementara. |
| Final/Terkunci | Tombol Simpan Penilaian memvalidasi, menyimpan snapshot nilai dan anotasi, lalu mengunci penilaian hakim tersebut. |
| Koreksi setelah final | Tidak ada edit biasa; gunakan prosedur koreksi/reopen yang tercatat. |

Sinkronisasi target awal: perubahan tampil di rekap dalam ≤2 detik pada jaringan normal (perlu diuji). Operasi hitung harus atomik/idempoten; data final dan anotasi harus berada pada snapshot yang konsisten.

## 8. Rubrik dan Bobot

Kategori dapat mencakup Aslah (label sementara), Fasahah, Tajwid, Makharijul Huruf, Idgham, Lagu, dan kategori lain. Setiap kategori dapat punya kode, deskripsi, jenis aturan, bobot per kejadian, batas, cakupan, status, dan versi.

Formula tidak boleh diasumsikan. Jika berupa pengurangan per kejadian, contoh konseptual: `total pengurangan = jumlah kejadian × bobot`. Nilai akhir, nilai awal komponen, pembulatan, dan agregasi ant hakim harus mengikuti pedoman resmi. Jika bobot 40% Tajwid dan 60% Itqan tetap digunakan, metode penggabungannya perlu dikonfirmasi.

## 9. Model Data Konseptual

- `tenants`, `users`, `memberships`, `roles`
- `events`, `rounds/stages`, `levels`, `branches/categories`
- `kafilahs`, `participants`
- `question_bank`, `question_assignments`
- `judge_assignments`, `judge_assessments`
- `error_categories`, `scoring_rule_versions`
- `error_counts/assessment_components`
- `mushaf_sources`, `mushaf_annotations`
- `assessment_snapshots`, `audit_logs`

## 10. Kebutuhan Nonfungsional

- Perubahan real-time ditargetkan tampil ≤2 detik (P95, target awal).
- Server menjadi sumber kebenaran; tidak boleh menunjukkan sukses sebelum menerima update.
- Isolasi tenant diterapkan pada query/API/file/channel real-time.
- Finalisasi dan snapshot anotasi/value konsisten secara transaksional.
- Web responsif, terutama desktop/tablet untuk panel mushaf dan penilaian.
- Sumber mushaf terverifikasi dan hak penggunaan aset diperiksa.
- Backup dan pemulihan data harus direncanakan dan diuji.

## 11. Kriteria Penerimaan MVP

1. Admin membuat tenant, babak, jenjang, kategori kesalahan, dan bobot.
2. Admin menambah kafilah serta peserta di dalam kafilah.
3. Admin membuat bank soal dan menetapkannya ke peserta.
4. Hakim hanya melihat peserta dan soal yang ditugaskan.
5. Halaman penilaian menampilkan mushaf kiri dan panel kategori kanan.
6. Plus/minus mengubah jumlah secara benar dan tidak mengizinkan negatif.
7. Anotasi mushaf dan hitungan tersimpan otomatis serta pulih setelah refresh.
8. Rekap admin berubah real-time dan memiliki kelompok kolom per hakim.
9. Simpan Penilaian mengunci nilai dan snapshot anotasi dengan konsisten.
10. Dashboard menampilkan statistik dari sumber data yang sama.
11. Tenant A tidak dapat mengakses data tenant B.
12. Riwayat perubahan penting tercatat.

## 12. Skenario Khusus

- Klik plus cepat tidak kehilangan atau menggandakan kejadian.
- Klik minus ketika angka nol tidak mengubah nilai.
- Koneksi terputus menampilkan status belum tersinkronisasi.
- Finalisasi tertahan jika ada perubahan lokal yang belum diterima server.
- Perubahan bobot tidak mengubah penilaian lama tanpa migrasi/koreksi eksplisit.
- Dua hakim yang menilai peserta yang sama mempunyai data terpisah.
- Penilaian final yang perlu dikoreksi harus melewati prosedur tercatat.

## 13. Rencana Implementasi

1. Fondasi tenant, login, role, event dan master dasar.
2. Manajemen kafilah/peserta, bank soal, master kategori serta bobot.
3. Halaman hakim dan mushaf, anotasi, plus/minus, autosave, finalisasi.
4. Rekap real-time dan dashboard admin.
5. Hardening: test concurrent update, jaringan putus, restore, audit dan isolasi tenant.

## 14. Keputusan yang Harus Dikonfirmasi

- Definisi/ejaan resmi kategori, termasuk “Aslah”.
- Bobot tiap kategori dan apakah poin merupakan jumlah atau pengurangan.
- Nilai awal, rentang, formula, pembulatan, dan agregasi antarhakim.
- Prosedur buka kembali/koreksi setelah final dan pejabat yang berwenang.
- Sumber mushaf digital dan hak penggunaan.
- Model penetapan soal (manual/acak/undian).
- Aturan ID peserta dan kemungkinan peserta multi-babak/cabang.
- Target skala tenant/pengguna bersamaan serta backup dan pemulihan.

## 15. Status Penilaian

- **Belum dimulai:** belum ada input.
- **Berlangsung:** perubahan live tersimpan, belum final.
- **Final/Terkunci:** tombol Simpan Penilaian telah berhasil memfinalisasi snapshot nilai dan anotasi.
- **Koreksi dibuka/Direvisi (opsional):** tindakan terkontrol yang tercatat.

## 16. Rekomendasi Penutup

Bangun MVP dengan satu sumber konfigurasi rubrik, satu model penilaian per hakim/peserta, dan satu jalur data untuk rekap/dashboard. Nilai live harus dibedakan dari nilai final. Tombol Simpan Penilaian menjadi batas finalisasi serta menyimpan snapshot nilai dan anotasi mushaf.
