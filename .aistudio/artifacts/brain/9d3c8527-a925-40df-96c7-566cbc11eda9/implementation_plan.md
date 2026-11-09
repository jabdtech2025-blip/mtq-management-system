# Rencana Implementasi: Penyempurnaan Tata Letak, Tipografi, dan Konsistensi UI

Dokumen ini merinci langkah-langkah teknis untuk menindaklanjuti seluruh catatan perbaikan tampilan dan tata letak pada aplikasi MTQ.

---

## 1. Daftar Perubahan per Halaman & Komponen

### A. Dashboard (`src/components/dashboard/DashboardView.tsx`)
- Menghapus blok baris atas yang menampilkan teks nama event (`Nasional` / `{currentTenant.eventName}`) di pojok kiri atas serta tombol `Rekap Nilai` di pojok kanan atas.
- Halaman Dashboard langsung diawali dengan jajaran 4 kartu ringkasan statistik secara bersih.

### B. Header Global AppShell (`src/components/layout/TopHeader.tsx`)
- **Tipografi Header Non-Bold**: Mengubah seluruh teks pada `TopHeader` (breadcrumb nama penyelenggara, seksi, judul halaman aktif, serta teks status `Connected`) agar menggunakan bobot teks normal (`font-normal`) tanpa ada teks yang *bold* (`font-bold` / `font-extrabold` / `font-semibold`).
- **Penyederhanaan Empty State Modal Notifikasi**:
  - Menghapus ikon centang (`CheckCircle2`) pada keadaan kosong.
  - Menghapus subteks *"Aktivitas sistem, log error, dan status penyimpanan lokal akan tampil di sini."*
  - Menghapus footer *"Notifikasi tersimpan secara lokal dan otomatis dibersihkan saat halaman di-refresh."*
  - Menyisakan hanya teks tunggal `"Tidak ada notifikasi baru"` secara minimalis.

### C. Sidebar (`src/components/layout/Sidebar.tsx`)
- Menghapus teks `"Simulasi Prototype MTQ v2.0"` yang berada di bagian paling bawah sidebar (di bawah tombol profil/ganti akun).

### D. Halaman Grup & Peserta (`src/components/kafilah/KafilahPesertaView.tsx`)
- **Opsi Default Mode Tampilan**: Mengubah state awal `viewMode` menjadi `'peserta'` (**Tampilan Per Peserta** sebagai opsi pertama, diikuti **Tampilan Grup** sebagai opsi kedua di sampingnya).
- **Baris Header Halaman (Atas)**:
  - Mengembalikan judul halaman **"Grup & Peserta MTQ"** beserta deskripsi singkatnya di sisi kiri atas.
  - Menempatkan tombol dropdown **Import** dan tombol **Tambah Peserta** (atau **Tambah Grup** saat di tab grup) di sisi kanan atas sejajar dengan judul halaman.
- **Kontainer Filter (Tengah)**:
  - Khusus berisi elemen pencarian dan filter saja (tanpa tombol aksi maupun tab).
  - Pada **Tampilan Per Peserta**, urutan elemen filter dalam satu baris proporsional:
    1. `Search Bar`
    2. `Semua Grup`
    3. `Semua Cabang`
    4. `Semua Jenjang`
    5. `Semua Babak`
    6. `No Urut` (Urutkan)
  - Pada **Tampilan Grup**, hanya menampilkan `Search Bar` saja tanpa dropdown filter tambahan.
- **Switch Tab (Di Bawah Filter)**:
  - Menempatkan switch tab di bawah kontainer filter (sebelum tabel utama) dengan urutan:
    1. **Tampilan Per Peserta** (Opsi 1)
    2. **Tampilan Grup** (Opsi 2)

### E. Halaman Bank Soal & Maqra (`src/components/bankSoal/BankSoalView.tsx`)
- **Penyederhanaan Label Tombol Atas**:
  - Menyederhanakan teks ketiga tombol di pojok kanan atas menjadi: **Import**, **Undian**, dan **Tambah**.
- **Perapihan Tata Letak & Tab Riwayat Undian**:
  - Merapikan bar pencarian dan filter agar selaras dalam satu baris.
  - Merombak tampilan tab **Riwayat & Audit Undian** (`riwayat_undian`) menjadi tabel/kartu terstruktur yang ringkas dan rapi (menampilkan versi undian, babak, cabang/jenjang, waktu & petugas, serta daftar peserta dan kode maqra dalam tabel/baris yang rapi, tidak berantakan).

### F. Halaman Master Data & Rubrik (`src/components/masterData/MasterDataView.tsx`)
- **Penyeragaman Tab Jenjang & Cabang**:
  - Mengubah daftar pada tab **Jenjang Usia** dan tab **Cabang / Golongan** menjadi struktur tabel standar (`text-xs`, header kolom `Kode`, `Nama Jenjang / Cabang`, `Status`, `Aksi`) dengan ukuran teks dan ketebalan yang sama persis seperti tab lainnya (tidak lagi berukuran besar/terlalu tebal).

### G. Halaman Hasil & Kelulusan (`src/components/stages/HasilKelulusanView.tsx`)
- **Logika Pemilihan Babak Otomatis**:
  - Jika terdapat babak yang sedang berjalan (`status === 'Aktif'`), otomatis pilih babak tersebut.
  - Apabila seluruh babak telah selesai (`status === 'Selesai'` pada semua babak), otomatis pilih **babak yang paling terakhir** (urutan `order` tertinggi / elemen terakhir pada `uniqueStages`).

### H. Halaman Log Aktivitas (`src/components/logs/ActivityLogView.tsx`)
- **Kartu Statistik Netral**:
  - Mengubah ke-4 kartu di bagian atas (`Total Log Aktivitas`, `Aktivitas Berhasil`, `Peringatan`, `Error / Ditolak`) agar seluruhnya menggunakan latar putih bersih (`bg-white border-slate-200`) dan teks serta angka berwarna hitam/gelap (`text-slate-900`), tanpa latar warna hijau, kuning, maupun merah.
- **Optimasi Ukuran Tabel pada Layar 100%**:
  - Mengurangi ukuran padding sel (`py-2 px-3`), merampingkan ukuran font dan badge (`text-[11px]`), serta mengatur lebar kolom secara proporsional agar tabel terlihat rapi, padat, dan pas pada tingkat *zoom* layar 100%.

---

## 2. Verifikasi
1. Memastikan seluruh 9 kelompok perbaikan visual dan fungsional diterapkan secara presisi.
2. Menjalankan `compile_applet` dan `lint_applet` untuk memverifikasi tidak ada error kompilasi maupun TypeScript.
3. Menjalankan `npm test` untuk memastikan seluruh pengujian tetap lulus 100%.
