# Dokumentasi Sumber Data & Layanan Pihak Ketiga (THIRD_PARTY)

Dokumen ini menjelaskan ketergantungan eksternal dan sumber referensi data yang digunakan oleh Sistem Manajemen MTQ.

## 1. Indeks Metadata Al-Qur'an (`src/data/quranIndex.json`)
- **Fungsi**: Menyimpan daftar 114 surah (nomor surah, nama Arab, nama Latin, jumlah ayat) dan pemetaan batas ayat per halaman Mushaf Madinah (halaman 1 s/d 604) untuk validasi deterministik pada Bank Soal dan impor spreadsheet.
- **Sumber Referensi Build-Time**: Standar Mushaf Al-Madinah An-Nabawiyyah (King Fahd Glorious Quran Printing Complex / Tanzil / Quran.com API v4 metadata).
- **Sifat Penggunaan**: Dihasilkan saat *build-time* melalui `scripts/build-quran-index.ts` dan dibundel secara statis di dalam repositori, sehingga validasi maqra tidak memerlukan panggilan jaringan saat *runtime*.

## 2. Layanan Teks Mushaf & Font (`api.quran.com`)
- **Fungsi**: Mengambil teks ayat Al-Qur'an per halaman Mushaf Madinah (1–604) beserta penanda tajwid dan baris mushaf pada tampilan lembar penilaian dua panel (`src/services/quranApi.ts`).
- **Catatan Verifikasi Lisensi (Wajib Ditinjau Pemilik)**:
  - Pemilik produk **wajib memverifikasi ketentuan layanan (Terms of Service) Quran.com API** dan lisensi font mushaf (`code_v1` / KFGQPC Uthmanic Script Hafs) sebelum menggunakan aplikasi untuk operasional komersial berskala penuh.
  - Untuk ketahanan operasional di lokasi lomba dengan koneksi internet terbatas, disarankan menghosting data halaman mushaf secara mandiri (*self-hosted*) di penyimpanan internal penyelenggara.
