# Catatan untuk AI Studio: Gambar Mushaf Lokal (Opsional) dengan Cadangan Pihak Ketiga

Dasar: `origin/main` commit `dd55583`.

## Perilaku
- **Bila folder `public/mushaf/` berisi `page001.webp` … `page604.webp`**, lembar penilaian memakai gambar lokal. Bila satu halaman gagal dimuat, aplikasi otomatis beralih ke android.quran.com, lalu everyayah.com.
- **Bila folder itu tidak ada**, aplikasi langsung memakai android.quran.com, lalu everyayah.com. Perilakunya sama seperti sebelumnya.
- Ketersediaan file lokal diperiksa **sekali per sesi** dengan meminta `/mushaf/page001.webp`. Hasilnya dianggap "ada" hanya bila server menjawab dengan tipe `image/*`. Rewrite SPA yang mengembalikan `index.html` (text/html) berarti "tidak ada". Hasil pemeriksaan disimpan di `sessionStorage` dengan kunci `mtq_mushaf_local_available_v1`.
- Sumber ketiga lama (`raw.githubusercontent.com/the-quran/quran-images`) **dihapus** karena sudah 404.

## Cache untuk kondisi offline
- Saat lembar dibuka, halaman-halaman maqra aktif ditambah 1 halaman berikutnya **diunduh lebih dulu** (`prefetchMushafPages`), maksimal 12 halaman.
- Service worker (vite-plugin-pwa) menyimpan gambar itu:
  - `mushaf-lokal`: StaleWhileRevalidate, maksimal 120 halaman, 60 hari, hanya respons 200.
  - `mushaf-pihak-ketiga`: CacheFirst, maksimal 60 halaman, 60 hari. Respons lintas domain berstatus 0 (opaque) sehingga dibatasi lebih ketat.
- Gambar mushaf **tidak** di-precache saat instal PWA. `globPatterns` sengaja tidak memuat `.webp`; jangan ditambahkan.

## File yang berubah
| File | Perubahan |
|---|---|
| `src/services/mushafSource.ts` (**baru**) | `getMushafPageSources`, `detectLocalMushaf`, `getKnownLocalMushafAvailability`, `prefetchMushafPages` |
| `src/components/penilaian/PenilaianDualPanelView.tsx` | Memakai `mushafSource`. Gambar baru dimuat setelah pemeriksaan sumber lokal selesai (`src` belum diisi sampai hasil diketahui), lalu prefetch halaman maqra. |
| `vite.config.ts` | Dua aturan `runtimeCaching` baru untuk mushaf |

## Bila nanti ingin memakai gambar lokal
Ekstrak zip mushaf ke akar proyek sehingga terbentuk `public/mushaf/page001.webp` … `page604.webp`. **Tidak perlu mengubah kode apa pun.** Ukuran total sekitar 180 MB; lihat pertimbangannya di percakapan.

## Uji yang sudah dilakukan
- Tanpa `public/mushaf/`: hanya satu permintaan pemeriksaan, lalu gambar dari android.quran.com / everyayah.com.
- Dengan `public/mushaf/`: gambar tampil dari `/mushaf/page305.webp` (lebar 1260), dan halaman 305–307 diunduh lebih dulu.
- `npm run lint`, `npm test` (123 lulus), `npm run build`, dan E2E penilaian hakim (8 lulus).
