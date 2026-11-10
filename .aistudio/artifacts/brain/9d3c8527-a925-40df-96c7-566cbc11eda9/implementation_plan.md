# Penyempurnaan Fungsionalitas, Sinkronisasi Real-Time, Routing URL & Standarisasi Antarmuka MTQ

Pembaruan menyeluruh untuk menyederhanakan alur administrasi pengguna, menyembunyikan entitas Jenjang Usia dari antarmuka, menstabilkan relasi kategori kesalahan dengan bidang rubrik, memastikan tombol koreksi hakim dan pemantauan nilai berjalan secara *real-time*, menerapkan *routing* tautan URL per halaman, serta merapikan tata letak tabel, tab, dan barisan filter di seluruh halaman.

## Keputusan Kritis & Konfirmasi Pengguna

> [!IMPORTANT]
> Berikut adalah keputusan produk yang telah dikonfirmasi dan menjadi acuan utama implementasi:

- **Penyembunyian Jenjang Usia Secara Menyeluruh**: Tab **Jenjang Usia** pada halaman Master Data disembunyikan, begitu pula seluruh filter, kolom tabel, dan input pilihan Jenjang di halaman Grup & Peserta, Bank Soal, serta Master Data. Di belakang layar, sistem secara otomatis menetapkan nilai jenjang default agar integritas relasi *foreign key* database tetap aman.
- **Dropdown Bidang Penilaian & Cabang Penugasan pada Modal Pengguna**: Pada modal Tambah/Edit Pengguna & Hakim, kolom **Label Hakim** dan **Lokasi Mimbar** dihapus. Kolom **Bidang Penilaian** dan **Cabang Penugasan** keduanya diubah menjadi *dropdown* yang mengacu langsung pada Master Data Bidang Rubrik aktif dan Master Data Cabang/Golongan aktif.

---

## 1. Gambaran Umum & Konsep Inti

- **Apa yang Dilakukan**:
  1. **Manajemen Pengguna & Hakim**: Menyederhanakan konfigurasi penugasan hakim menjadi dua *dropdown* terstandarisasi (**Bidang Penilaian** dari Bidang Rubrik aktif dan **Cabang Penugasan** dari Master Data Cabang/Golongan), tanpa input manual Label Hakim dan Lokasi Mimbar.
  2. **Penyederhanaan Tanpa Jenjang Usia**: Menghilangkan kompleksitas tab, filter, dan input Jenjang Usia dari seluruh antarmuka pengguna sambil mempertahankan kompatibilitas skema data di belakang layar.
  3. **Form Tambah Grup**: Mengubah label *Nama Kabupaten / Kota* menjadi **Nama Grup** dengan tetap mempertahankan **Wilayah Koordinasi**.
  4. **Referensi Babak Aktif pada Template Excel Bank Soal**: Menambahkan daftar **Babak Aktif** pada *Sheet* ke-2 (`Referensi_Master_Data`) di file *Template Excel Import Bank Soal*.
  5. **Stabilisasi Pemetaan Bidang Rubrik pada Kategori Kesalahan**: Menjamin kolom **Bidang Rubrik Terkait** tidak pernah terlepas atau kosong secara tiba-tiba melalui normalisasi ID bidang yang konsisten dan pencocokan otomatis (*fallback matching*) berdasarkan nama/cakupan bidang rubrik.
  6. **Perbaikan Tombol Tambah Kesalahan (`+`) di Lembar Penilaian Hakim**: Memperbaiki validasi bidang penugasan saat hakim menekan tombol `+` atau `-` sehingga seluruh kategori kesalahan yang tampil pada lembar penilaian hakim dapat diklik dan langsung memperbarui skor tanpa penolakan diam-diam atau *rollback* state.
  7. **Sinkronisasi Real-Time pada Rekap Nilai**: Memperbaiki mekanisme pembaruan langsung (*live sync*) antara lembar kerja hakim dan tabel Rekap Nilai Admin menggunakan kombinasi *Supabase Realtime channel*, *polling* latar belakang yang stabil tanpa *re-render loop*, serta *broadcast* instan antar-tab browser.
  8. **Routing URL Terpisah Antar Halaman**: Menghubungkan *state* navigasi halaman dengan URL browser (`/dashboard`, `/grup-peserta`, `/bank-soal`, `/master-data`, `/penilaian-hakim`, `/lembar-penilaian`, `/rekap-nilai`, `/hasil-kelulusan`, `/manajemen-babak`, `/pengguna-hakim`, `/log-aktivitas`) lengkap dengan dukungan tombol *Back/Forward* browser dan aturan *rewrite* SPA saat di-*deploy*.
  9. **Tab Bersih Tanpa Ikon & Angka**: Menghapus seluruh ikon dan *badge* angka pada tombol tab di halaman **Grup & Peserta** serta **Bank Soal & Maqra**, menyisakan label teks yang bersih.
  10. **Barisan Filter Lebar Penuh (*Zero Empty Space*)**: Memperlebar *Search Bar* (`flex-1`) dan mengatur proporsi *dropdown* filter di seluruh halaman agar memenuhi 100% lebar kontainer tanpa menyisakan ruang kosong yang tanggung.
  11. **Tabel Log Aktivitas Scrollable & Modal Lihat Detail**: Mengubah tabel Log Aktivitas menjadi *scrollable* ke samping tanpa memotong teks, menghapus avatar profil dan sub-teks nama event pada kolom Aktor, menampilkan status `Success` sebagai teks bersih tanpa *background* maupun ikon centang, serta menambahkan kolom **Aksi (Lihat Detail)** untuk membuka modal rincian lengkap log.
- **Target Pengguna**: Administrator MTQ, Panitia Sekretariat, dan Dewan Hakim.
- **Nilai Utama**: Alur kerja yang jauh lebih konsisten, bebas *bug* klik penilaian, pemantauan nilai yang benar-benar *real-time*, URL halaman yang dapat dibagikan/di-*refresh*, serta tampilan tabel dan filter berstandar *Enterprise SaaS*.

---

## 2. Pengalaman Pengguna & Desain Visual

- **Alur Utama Pengguna**:
  - **Navigasi Berbasis URL**: Saat pengguna berpindah menu di Sidebar (misalnya ke *Rekap Nilai* atau *Bank Soal*), alamat URL di browser otomatis berubah (misalnya `/rekap-nilai` atau `/bank-soal`). Saat halaman di-*refresh*, pengguna tetap berada di halaman tersebut.
  - **Penilaian Hakim ke Rekap Nilai Real-Time**: Ketika hakim menekan tombol `+` pada salah satu kategori kesalahan di *Lembar Penilaian*, angka kesalahan dan pengurangan nilai langsung bertambah seketika, tersimpan ke penyimpanan/database, dan dalam hitungan detik langsung tercermin pada layar *Rekap Nilai Realtime* milik Admin tanpa perlu memuat ulang halaman.
  - **Inspeksi Log Aktivitas**: Pengguna dapat menggulir tabel Log Aktivitas ke samping untuk membaca informasi secara utuh, atau menekan tombol **Lihat Detail** di kolom paling kanan untuk melihat seluruh rincian aktivitas di dalam modal.
- **Identitas Visual & Tema**:
  - *Aesthetic Direction*: *Clean Enterprise SaaS Workspace* — tata letak fungsional dengan hierarki tipografi yang tenang dan kepadatan data terukur.
  - *Color Palette & Mood*: Kanvas netral (`bg-slate-50` / `bg-white`), garis batas halus (`border-slate-200`), teks utama kontras tinggi (`text-slate-900`), serta aksen hijau zamrud (`bg-emerald-800`) khusus pada aksi utama dan tab aktif.
  - *Typography & Hierarchy*: Teks tanpa penebalan berlebih, penggunaan angka tabular (`font-mono tabular-nums`) pada seluruh skor, nomor urut, dan waktu log.
  - *Component Styling & Layout*:
    - Barisan filter menggunakan sistem *flex/grid* adaptif di mana *Search Bar* tumbuh mengisi ruang tersisa (`flex-1 min-w-[260px]`) dan *dropdown* filter merapat rapi hingga ke tepi kanan kontainer.
    - Tombol *switch tab* pada halaman Grup & Peserta dan Bank Soal hanya menampilkan teks satu baris (`whitespace-nowrap`) tanpa ikon dekoratif maupun *counter badge*.

---

## 3. Keputusan Produk & Pertimbangan Teknis

- **Keputusan 1: Penyembunyian Jenjang Usia Tanpa Merusak Skema Database**
  - *Pendekatan*: Menyembunyikan seluruh kontrol UI Jenjang Usia (tab Master Data, *dropdown* filter, dan input form), lalu secara otomatis mengisi nilai jenjang *default* dari daftar jenjang yang ada saat menyimpan peserta, soal, atau rubrik.
  - *Alasan*: Memenuhi kebutuhan pengguna yang hanya menggunakan **Cabang / Golongan**, sekaligus menjaga agar tabel database dan fungsi RPC yang memiliki kolom `level_id` tetap berjalan lancar tanpa perlu migrasi destruktif.
- **Keputusan 2: Resolusi Ganda untuk Pemetaan Bidang Rubrik pada Kategori Kesalahan**
  - *Pendekatan*: Saat menyimpan kategori kesalahan atau versi rubrik, ID bidang dijaga tetap deterministik dan tidak di-reset ke `null` saat pembaruan rubrik. Selain pencocokan via `fieldId`, sistem menyertakan *fallback* pencocokan otomatis berdasarkan nama/kode bidang dan cakupan (`scope`) kategori.
  - *Alasan*: Mencegah status *"Belum Dipetakan"* muncul tiba-tiba setelah sinkronisasi database atau penyuntingan rubrik.
- **Keputusan 3: Sinkronisasi Real-Time Multi-Jalur pada Rekap Nilai**
  - *Pendekatan*: Memperbaiki referensi fungsi sinkronisasi agar tidak memicu *infinite effect loop*, memperluas *listener* perubahan tabel penilaian, menambahkan *polling* periodik yang aman berbasis *ref*, serta menambahkan *event listener* `storage` / `BroadcastChannel` untuk pembaruan lintas-tab seketika.
  - *Alasan*: Menjamin layar Rekap Nilai Admin selalu memperbarui skor baik saat diuji pada perangkat berbeda (via database) maupun pada tab berbeda di browser yang sama.

---

## 4. Arsitektur Teknis & Strategi Data

### Diagram Arsitektur & Alur Sinkronisasi

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        LAPISAN NAVIGASI & URL ROUTER                       │
│  Pathname Browser (/dashboard, /grup-peserta, /rekap-nilai, /log-aktivitas)│
│               ▲                                            │               │
│     pushState │                                   popstate ▼               │
│               └──────────────► State Halaman ◄─────────────┘               │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────────┐   ┌───────────────────────┐   ┌─────────────────────┐
│  MASTER DATA & USER  │   │   LEMBAR PENILAIAN    │   │  REKAP & LOG AUDIT  │
│  • Dropdown Bidang & │   │  • Validasi Kategori  │   │  • Tabel Scrollable │
│    Cabang Hakim      │   │    Selaras Rubrik     │   │    + Modal Detail   │
│  • Auto-Map Bidang   │   │  • Tombol (+) Aktif   │   │  • Sinkronisasi     │
│    Kategori Kesalahan│   │    Tanpa Rollback     │   │    Real-Time Stabil │
│  • Tanpa UI Jenjang  │   │    State Lokal        │   │                     │
└──────────┬───────────┘   └───────────┬───────────┘   └──────────▲──────────┘
           │                           │                          │
           └───────────────┐           │                          │
                           ▼           ▼                          │
┌─────────────────────────────────────────────────────────────────┴──────────┐
│                 ENGINE SINKRONISASI DATA & REAL-TIME SYNC                  │
│  • Pembaruan State Optimistik + Antrean Outbox                             │
│  • Supabase Realtime Channel + Polling Stabil Berbasis Ref + Lintas-Tab    │
└────────────────────────────────────────────────────────────────────────────┘
```

### Pemetaan Interaksi Komponen & State

1. **Routing URL (`History API` + Konfigurasi Deployment)**:
   - Setiap nilai halaman memiliki peta *path* URL yang bersih (contoh: `'dashboard' <-> '/dashboard'`, `'kafilah' <-> '/grup-peserta'`, `'bank_soal' <-> '/bank-soal'`, `'master_data' <-> '/master-data'`, `'penilaian_hakim' <-> '/penilaian-hakim'`, `'penilaian_detail' <-> '/lembar-penilaian'`, `'rekap_nilai' <-> '/rekap-nilai'`, `'hasil_kelulusan' <-> '/hasil-kelulusan'`, `'manajemen_babak' <-> '/manajemen-babak'`, `'user_management' <-> '/pengguna-hakim'`, `'log_aktivitas' <-> '/log-aktivitas'`).
   - Saat aplikasi dimuat pertama kali atau tombol *Back/Forward* ditekan, halaman aktif langsung menyesuaikan *path* URL. Konfigurasi `vercel.json` ditambahkan agar akses langsung ke *path* mana pun diarahkan ke aplikasi utama tanpa error 404.
2. **Modal Tambah/Edit Pengguna & Hakim**:
   - Menghapus input *Label Hakim* dan *Lokasi Mimbar*.
   - Mengganti input *Bidang Penilaian* menjadi `<select>` yang berisi daftar nama bidang unik dari versi rubrik aktif di Master Data.
   - Mengganti input *Cabang Penugasan* menjadi `<select>` yang berisi daftar cabang aktif dari Master Data Cabang/Golongan.
3. **Lembar Penilaian Hakim & Perhitungan Kesalahan**:
   - Menyempurnakan fungsi penambahan/pengurangan kesalahan (`updateErrorCount`) agar memeriksa kecocokan kategori kesalahan menggunakan resolusi ID bidang rubrik (`fieldId`) yang sama dengan tampilan daftar kategori di layar hakim, serta mendukung hakim yang ditugaskan melalui profil pengguna maupun tabel penugasan babak.
   - Menghilangkan *rollback* state lokal saat sinkronisasi latar belakang sedang mengantre, sehingga angka kesalahan yang diklik hakim tidak pernah gagal bertambah.
4. **Barisan Filter, Tab, dan Tabel Log Aktivitas**:
   - Di halaman Grup & Peserta serta Bank Soal, tombol tab dirender murni dengan teks label tanpa ikon dan tanpa angka jumlah.
   - Di seluruh halaman yang memiliki barisan filter, kontainer filter menggunakan tata letak fleksibel penuh di mana *Search Bar* mengambil sisa ruang horizontal (`flex-1`) dan *dropdown* filter tersusun rapat tanpa menyisakan ruang kosong.
   - Di halaman Log Aktivitas, tabel mendukung *horizontal scroll* (`whitespace-nowrap`), kolom Aktor hanya menampilkan nama pengguna tanpa avatar/nama event, kolom Status menampilkan `Success` sebagai teks polos tanpa latar/ikon, dan kolom **Aksi** menyediakan tombol **Lihat Detail** yang membuka modal rincian lengkap log.
