# Prompt Pengembangan — UI/UX, PWA, Landing Page, Pengaturan SEO & Health Dashboard

> Tempel seluruh isi file ini ke agen AI Studio. Kerjakan **satu fase per sesi**, lalu berhenti dan laporkan.

---

## Peran & konteks

Kamu adalah senior frontend engineer dan product designer untuk aplikasi **Manajemen MTQ** (React 19 + TypeScript + Vite + Tailwind CSS v4 + Supabase), yang di-deploy di Vercel. Aplikasi ini dipakai panitia LPTQ, dewan hakim (sering di tablet, di Wi-Fi venue yang tidak stabil), dan superadmin platform.

Basis kode saat ini sudah lolos `npm run lint`, `npm test` (112 tes), `npm run build`, dan `npm run test:e2e` (30 lulus). Logika penilaian, peringkat, juara, undian, dan keamanan database **sudah diaudit dan dikunci**. Tugasmu sekarang adalah tampilan, pengalaman pengguna, dan fitur pendukung.

## Aturan wajib (berlaku untuk semua fase)

1. **Jangan mengubah logika bisnis atau keamanan.** Dilarang mengubah atau melonggarkan: fungsi SQL penilaian/peringkat/undian/pengesahan, trigger, kebijakan RLS, `rankingService.ts`, `scoringEngine.ts`, dan alur RPC di `supabaseDataService.ts`. Kalau sebuah perubahan tampilan terasa membutuhkan perubahan logika, berhenti dan laporkan.
2. **Jangan mengubah migrasi lama.** Perubahan database hanya lewat migrasi baru `supabase/migrations/20261118_site_settings_and_health.sql`, lalu sinkronkan ke `supabase/schema.sql` (tambahkan di akhir) dan daftarkan di README serta di boot tes `src/tests/supabaseRules.test.ts`.
3. **Gerbang kualitas di akhir setiap fase:** `npm run lint`, `npm test` (minimal 112 lulus, tidak boleh berkurang), `npm run build`, `npm run test:e2e`. Bila teks yang dicari tes E2E berubah, perbarui tesnya, jangan hapus tesnya.
4. **Bahasa Indonesia** untuk semua teks antarmuka. Istilah teknis (Supabase, RLS, RPC, Fail-Closed) hanya boleh muncul di halaman superadmin.
5. **Aksesibilitas:** kontras teks minimal 4.5:1, semua tombol ikon punya `aria-label`, fokus keyboard terlihat jelas (`focus-visible`), target sentuh minimal 44×44px di tablet/ponsel, hormati `prefers-reduced-motion` dan `prefers-reduced-transparency`.
6. **Efisiensi kerja:**
   - Jangan membaca file besar (`MtqContext.tsx`, `supabaseDataService.ts`, `schema.sql`) secara utuh. Cari dengan grep, lalu baca hanya rentang barisnya.
   - Jangan membaca ulang file yang baru diedit kecuali edit gagal.
   - Jalankan lint dan tes setelah satu sub-tugas selesai, bukan setelah setiap edit. Build cukup sekali di akhir fase.
   - Bila tes yang sama gagal 3 kali berturut-turut, berhenti dan laporkan penyebabnya.
7. **Satu commit per fase**, pesan commit dalam bahasa Indonesia yang menjelaskan apa yang berubah.
8. **Konten jujur:** jangan membuat testimoni, statistik pengguna, logo instansi, atau klaim sertifikasi yang tidak ada. Gunakan placeholder yang jelas (mis. `[Nomor WhatsApp Panitia]`) bila data belum tersedia.

---

## FASE 1 — Fondasi Desain (Design System)

**Tujuan:** tampilan yang bersih, rapi, nyaman, dengan kelengkungan, ukuran, dan efek blur yang konsisten di seluruh aplikasi.

### 1.1 Inventaris dulu
Sebelum mengubah apa pun, buat ringkasan singkat (di laporan, bukan di kode): ada berapa variasi `rounded-*`, tinggi tombol, ukuran teks, padding kartu, dan bayangan yang dipakai sekarang. Ini dasar untuk menyatukannya.

### 1.2 Token desain di satu tempat
Definisikan token di `src/index.css` memakai `@theme` Tailwind v4:

- **Radius (kelengkungan):**
  - `--radius-sm: 8px` untuk badge, chip, input kecil
  - `--radius-md: 12px` untuk input, select, tombol
  - `--radius-lg: 16px` untuk kartu dan panel
  - `--radius-xl: 20px` untuk modal, sheet, dan kartu hero
  - `--radius-full` untuk avatar dan pill
  Aturan: elemen di dalam kartu memakai radius **satu tingkat lebih kecil** dari kartunya, supaya lengkungan bersarang terlihat rapi.
- **Ukuran kontrol:** tinggi tombol dan input `sm 32px`, `md 40px` (default), `lg 48px` (aksi utama dan layar hakim). Ikon di tombol 16px (sm/md) dan 20px (lg).
- **Tipografi:** skala `12 / 14 / 16 / 18 / 20 / 24 / 30px`. Isi tabel penilaian minimal 14px, label minimal 12px. Satu keluarga font untuk UI dan satu font mono hanya untuk angka/nilai (`tabular-nums`).
- **Spasi:** kelipatan 4px. Padding kartu 16px (ponsel) / 24px (desktop). Jarak antar-seksi halaman 24–32px.
- **Bayangan:** maksimal 3 tingkat (`--shadow-sm` untuk kartu, `--shadow-md` untuk dropdown/popover, `--shadow-lg` untuk modal). Bayangan lembut, tidak gelap.
- **Warna:** palet hijau emerald yang sudah ada sebagai warna utama, ditambah warna semantik `success`, `warning`, `danger`, `info`, dan skala netral. Semua status (Diverifikasi/Ditolak/Diajukan, Lolos/Gugur/Final, Juara) memakai warna semantik ini secara konsisten.
- **Efek blur (glass):** satu kelas utilitas, mis. `.surface-glass` = latar putih/gelap semi-transparan (`bg-white/70`), `backdrop-blur-md`, `backdrop-saturate-150`, border tipis `border-white/40`. Dipakai **hanya** untuk header lengket, sidebar mobile, modal overlay, dan toolbar mengambang. Wajib punya fallback warna solid saat `backdrop-filter` tidak didukung atau `prefers-reduced-transparency: reduce`. Jangan pakai blur di dalam tabel atau daftar panjang (berat di tablet).
- **Gerak:** durasi 150ms (hover) dan 200–250ms (modal/sheet), easing `ease-out`. Matikan saat `prefers-reduced-motion`.
- **Mode gelap (opsional, tapi siapkan token-nya):** semua warna lewat CSS variable supaya mode gelap bisa ditambahkan tanpa mengubah komponen.

### 1.3 Komponen dasar
Buat di `src/components/ui/` dengan varian lewat props (bukan menyalin kelas):
`Button` (primary, secondary, ghost, danger; sm/md/lg; loading; icon-only), `Input`, `Select`, `Textarea`, `Checkbox`, `Card` (header/body/footer), `Badge` (warna semantik), `Modal`/`Dialog` (fokus terkunci, Esc untuk tutup, `aria-modal`), `Table` (header lengket, baris zebra halus, mode kartu otomatis di bawah 768px), `Tabs`, `Toast`, `EmptyState`, `Skeleton`, `PageHeader` (judul, deskripsi, aksi), `StatCard`, `ConfirmDialog` (untuk aksi tak bisa dibatalkan seperti pengesahan babak).

### 1.4 Terapkan ke seluruh halaman
Ganti kelas ad-hoc dengan komponen dan token di semua halaman: Login, Dashboard, Grup & Peserta, Bank Soal, Master Data, Pengguna & Hakim, Monitoring Penilaian, Lembar Penilaian (dual panel), Rekap Nilai, Manajemen Babak, Hasil & Kelulusan, Log Aktivitas, dan semua halaman Superadmin. Kerjakan **per halaman**, cek tampilannya, lalu lanjut.

Perhatian khusus:
- **Lembar Penilaian Hakim (tablet):** tombol penambah/pengurang kesalahan minimal 48px, nilai besar dan jelas, tidak ada elemen yang bergeser saat angka berubah.
- **Hasil & Kelulusan:** panel Keputusan Sidang Pleno dan tombol pengesahan harus tetap menonjol dan memakai `ConfirmDialog`.
- **Navigasi:** kelompokkan sidebar per tahap lomba: *Persiapan* (Master Data, Pengguna & Hakim, Bank Soal), *Pendaftaran* (Grup & Peserta), *Pelaksanaan* (Manajemen Babak, Monitoring, Rekap), *Hasil* (Hasil & Kelulusan), *Audit* (Log Aktivitas). Samakan breadcrumb dengan label menu.

**Kriteria selesai Fase 1:**
- Tidak ada lagi `rounded-[...]`, `text-[...px]`, atau bayangan arbitrer di luar token (cek dengan grep, sebutkan jumlahnya sebelum dan sesudah di laporan).
- Tidak ada scroll horizontal di 390px, 768px, dan 1366px.
- Sertakan tangkapan layar sebelum/sesudah untuk Dashboard, Lembar Penilaian, dan Hasil & Kelulusan di laporan.

---

## FASE 2 — PWA (Bisa Diinstal)

1. Pakai `vite-plugin-pwa` dengan mode `generateSW`.
2. **Manifest:** `name: "Manajemen MTQ"`, `short_name: "MTQ"`, `lang: "id"`, `start_url: "/app"`, `scope: "/"`, `display: "standalone"`, `theme_color` dan `background_color` dari token warna, ikon 192, 512, dan 512 maskable (buat dari logo yang sudah ada, simpan di `public/icons/`), plus `apple-touch-icon` 180px dan meta iOS (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`).
3. **Strategi cache — PENTING:**
   - Precache hanya aset statis hasil build (JS, CSS, font, ikon).
   - **Jangan pernah meng-cache** permintaan ke `*.supabase.co`, ke `/functions/v1/`, atau respons data apa pun. Gunakan `NetworkOnly` untuk semua itu. Hakim tidak boleh melihat data basi.
   - `navigateFallback: '/index.html'` dengan `navigateFallbackDenylist` untuk `/api/` dan file statis.
   - Untuk kondisi offline saat menilai, tetap andalkan antrean sinkron (`outboxSyncService`) yang sudah ada. Jangan membuat mekanisme offline baru.
4. **Pembaruan aplikasi:** `registerType: 'prompt'`. Tampilkan toast "Versi baru tersedia — Muat ulang" (jangan memuat ulang otomatis saat hakim sedang mengisi lembar nilai).
5. **Ajakan instal:** tombol "Instal Aplikasi" di menu pengguna yang memakai event `beforeinstallprompt`, dan petunjuk singkat untuk iOS (Bagikan → Tambahkan ke Layar Utama). Jangan tampilkan pop-up otomatis yang mengganggu.
6. **Indikator offline:** badge di header saat `navigator.onLine === false`, dengan jumlah perubahan yang menunggu sinkron.

**Kriteria selesai:** Lighthouse PWA "Installable" lulus di build produksi (`npm run build && npm run preview`), dan uji manual: matikan jaringan → aplikasi tetap terbuka, data tidak dimuat dari cache, perubahan penilaian masuk antrean.

---

## FASE 3 — Landing Page Statis

### 3.1 Struktur rute
- `/` → landing page publik (baru).
- `/app` → aplikasi saat ini (layar login dan workspace).
- Perbarui semua yang terdampak: `vercel.json` rewrites, `redirectTo` untuk reset kata sandi dan undangan, tombol "Keluar" kembali ke `/app`, helper tes E2E (`tests/e2e/helpers/auth.ts` membuka `/app`), dan catat di laporan bahwa **Site URL dan Redirect URLs di Supabase Auth harus ditambah `/app`**.
- Landing page di-*lazy load* terpisah dari aplikasi, supaya pengunjung landing tidak mengunduh kode aplikasi, dan sebaliknya.

### 3.2 Konten di satu file
Semua teks landing page ada di `src/content/landing.ts` (objek TypeScript bertipe), bukan tersebar di JSX. Nanti file ini akan diganti CMS tanpa mengubah komponen.

### 3.3 Seksi
1. **Hero:** judul yang menjelaskan manfaat (mis. "Penilaian MTQ yang transparan, cepat, dan dapat diaudit"), subjudul satu kalimat, tombol utama "Masuk Panitia & Dewan Hakim" (ke `/app`) dan tombol sekunder "Pelajari Alurnya" (gulir ke seksi alur). Visual: ilustrasi atau mockup antarmuka (tangkapan layar aplikasi yang dirapikan), bukan foto stok orang.
2. **Masalah → solusi:** 3 poin (rekap manual lambat, rawan salah hitung, sulit diaudit) dan jawabannya.
3. **Fitur utama** (kartu ikon): penilaian digital per bidang di tablet; nilai dan peringkat dihitung server; undian maqra terverifikasi (bisa diperiksa ulang dari seed); keputusan sidang pleno untuk nilai seri; multi-penyelenggara dengan data terisolasi; log audit permanen; tetap bekerja saat koneksi putus sesaat.
4. **Alur lomba** (visual bertahap, bukan paragraf): Pendaftaran → Verifikasi Berkas → Undian Maqra → Penilaian Dewan Hakim → Rekap & Sidang Pleno → Pengesahan & Juara.
5. **Untuk siapa:** Panitia/LPTQ, Dewan Hakim, Superadmin platform; masing-masing 2–3 manfaat.
6. **Keamanan & integritas:** jelaskan dengan bahasa awam (hasil yang sudah disahkan terkunci, setiap perubahan tercatat, hakim hanya menilai bidangnya).
7. **FAQ** (accordion yang aksesibel): 5–7 pertanyaan.
8. **CTA penutup + kontak:** placeholder `[Email]`, `[WhatsApp]`.
9. **Footer:** nama aplikasi, tautan Masuk, tahun.

### 3.4 Kualitas
- Mobile-first, memakai token dan komponen Fase 1, efek blur hanya pada navbar lengket.
- Satu `<h1>`, hierarki heading benar, `alt` deskriptif pada gambar, gambar `loading="lazy"` dan `width/height` eksplisit.
- Target Lighthouse halaman `/` (mobile): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Cantumkan skornya di laporan.
- Tambahkan tes E2E: landing tampil, tombol "Masuk" membuka `/app`, navigasi anchor bekerja.

---

## FASE 4 — Pengaturan SEO di Superadmin

### 4.1 Database (migrasi `20261118_site_settings_and_health.sql`)
Tabel `site_settings` (satu baris, `id = 'global'`):
`site_name`, `title_template` (mis. `%s — Manajemen MTQ`), `default_title`, `meta_description`, `meta_keywords`, `canonical_url`, `robots` (`index,follow` / `noindex,nofollow`), `og_title`, `og_description`, `og_image_url`, `og_image_alt`, `og_type` (default `website`), `og_locale` (default `id_ID`), `twitter_card` (default `summary_large_image`), `twitter_site`, `theme_color`, `google_site_verification`, `updated_by`, `updated_at`.

- **RLS:** `SELECT` diizinkan untuk `anon` dan `authenticated` (data ini memang publik); `INSERT/UPDATE/DELETE` hanya `is_superadmin()`.
- Trigger yang mencatat setiap perubahan ke `audit_logs` (aksi `SITE_SETTINGS_UPDATED`, berisi kolom yang berubah). Ikuti pola flag `mtq.rpc_audit_active` yang sudah ada.
- Validasi di database: panjang `default_title` ≤ 70, `meta_description` ≤ 200, `canonical_url` dan `og_image_url` harus diawali `https://`.
- Tes di `supabaseRules.test.ts` sebagai `ROLE authenticated`: admin tenant dan hakim ditolak mengubah; superadmin berhasil dan tercatat di audit; anon bisa membaca.

### 4.2 Halaman Superadmin "Pengaturan SEO & Meta"
- Form terkelompok: *Umum* (judul, template, deskripsi, kata kunci, canonical, robots), *Open Graph* (judul, deskripsi, gambar, alt), *Twitter/X*, *Verifikasi* (Google Search Console).
- Penghitung karakter dengan peringatan (judul ideal ≤ 60, deskripsi ideal 120–160).
- **Pratinjau langsung:** kartu hasil Google, kartu pratinjau tautan WhatsApp/Facebook (gambar 1200×630), dan kartu X.
- Cek gambar OG: tampilkan ukuran asli gambar dan peringatan bila bukan rasio ±1.91:1 atau di bawah 1200px lebar.
- Tombol "Simpan" dengan `ConfirmDialog` bila `robots` diubah ke `noindex`.

### 4.3 Menerapkan meta tag — PENTING untuk SPA
Mesin pencari modern menjalankan JavaScript, tetapi **crawler pratinjau tautan (WhatsApp, Facebook, X, Telegram) tidak**. Jadi meta tag harus ada di HTML sejak dari server:
1. **Nilai bawaan** ditulis langsung di `index.html` (judul, deskripsi, OG, Twitter) sebagai cadangan.
2. **Vercel Edge Middleware** (`middleware.ts` di root, hanya untuk permintaan HTML ke `/`): ambil `site_settings` dari Supabase REST memakai anon key (env `SUPABASE_URL`, `SUPABASE_ANON_KEY` di Vercel), sisipkan/ganti tag di `<head>`, cache respons 5 menit (`s-maxage=300, stale-while-revalidate`). Bila Supabase gagal dihubungi, kirim HTML apa adanya (nilai bawaan).
3. **Di dalam aplikasi**, hook kecil yang memperbarui `document.title` per halaman memakai `title_template`.
4. `/app` diberi `robots: noindex` (halaman login tidak perlu diindeks); landing `/` mengikuti pengaturan.
5. Tambahkan `public/robots.txt` dan `public/sitemap.xml` (cukup `/`).
6. Laporan harus berisi cara menguji: Facebook Sharing Debugger, pratinjau tautan di WhatsApp, dan Rich Results Test Google.

---

## FASE 5 — Health Dashboard di Superadmin

### 5.1 Database (migrasi yang sama, `20261118`)
- Tabel `app_schema_versions (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`. Migrasi `20261118` menyisipkan `'20261118'` (`ON CONFLICT DO NOTHING`), dan isi juga versi `20261114`–`20261117` sebagai riwayat.
- RPC `get_platform_health()` — `SECURITY DEFINER`, hanya superadmin, `REVOKE` dari `PUBLIC, anon`. Mengembalikan JSON daftar pemeriksaan, tiap item: `key`, `label`, `status` (`ok`/`warning`/`critical`), `count`, `detail` (maks. 20 baris contoh), `how_to_fix`.

Pemeriksaan minimal:
| Key | Status bila ditemukan | Isi |
| --- | --- | --- |
| `schema_version` | critical bila versi terbaru ≠ `20261118` | Versi migrasi terpasang |
| `unmapped_error_categories` | critical | Kategori kesalahan Aktif tanpa `rubric_field_id`, `criterion_id`, dan `deduction_rule_id` |
| `borrowed_maqra_sheets` | critical | Lembar nilai yang `assigned_maqra_id`-nya milik peserta lain |
| `rubrics_without_official_source` | warning | Rubrik/aturan kompetisi tanpa `official_source` atau `is_verified_official = false` |
| `tenants_without_active_admin` | warning | Tenant Aktif tanpa keanggotaan admin Aktif |
| `stages_without_judges` | warning | Babak belum disahkan yang punya peserta tetapi tanpa penugasan hakim Aktif |
| `pending_verifications` | info/warning | Peserta berstatus Diajukan per tenant |
| `stalled_assessments` | warning | Lembar `in_progress` lebih dari 24 jam |
| `site_settings_missing` | warning | `site_settings` belum diisi atau `og_image_url` kosong |

### 5.2 Tampilan
- Kartu ringkasan di atas Dashboard Superadmin: jumlah critical / warning / ok, dengan warna semantik.
- Daftar pemeriksaan yang bisa dibuka (accordion): penjelasan, contoh data, langkah perbaikan, dan tombol menuju halaman terkait.
- Seksi **"Pemeriksaan manual"** (tidak bisa dibaca dari database): pendaftaran mandiri dimatikan di dashboard Supabase, `ALLOWED_ORIGINS` edge function berisi domain produksi, backup otomatis aktif, Site URL/Redirect URLs Supabase Auth sudah memuat `/app`. Status dicentang manual oleh superadmin dan disimpan (boleh di `site_settings` sebagai JSON `manual_checks`).
- Tombol "Periksa ulang" dan stempel waktu pemeriksaan terakhir (format WIB, pakai `formatDateTimeWIB`).

**Tes:** RPC ditolak untuk admin tenant dan hakim; superadmin menerima semua key di atas; buat data uji yang memicu minimal 3 pemeriksaan dan pastikan statusnya benar.

---

## Format laporan di akhir setiap fase

1. Ringkasan apa yang dikerjakan (5–10 poin).
2. Daftar file yang dibuat/diubah.
3. Hasil `lint`, `test` (jumlah lulus/gagal), `build` (ukuran bundel awal), dan `test:e2e`.
4. Tangkapan layar (Fase 1 dan 3) atau skor Lighthouse (Fase 2 dan 3).
5. Langkah manual yang harus dilakukan pemilik proyek (Supabase, Vercel, env).
6. Keputusan yang kamu ambil sendiri dan alasannya.
7. Hal yang sengaja **tidak** dikerjakan karena di luar lingkup.

**Mulai dari FASE 1. Setelah Fase 1 selesai dan laporan dikirim, berhenti dan tunggu instruksi.**
