# Catatan untuk AI Studio: Realtime Hemat Kuota, CMS Ringan, Halaman Publik, SEO & Ikon

Dasar perubahan: `origin/main` commit `dd55583`. Zip ini **sudah termasuk** perubahan "mushaf lokal opsional" sebelumnya (`src/services/mushafSource.ts`, dsb.).
Baca catatan ini sebelum mengubah file-file di bawah.

## ⚠️ Langkah wajib di Supabase
Jalankan migrasi **`supabase/migrations/20261119_realtime_and_site_content.sql`** di Supabase → SQL Editor. Migrasi ini aman dijalankan berulang.

Isi migrasi:
1. **Mendaftarkan tabel realtime.** `judge_assessments`, `stage_participations`, dan `stages` dimasukkan ke publikasi `supabase_realtime`. Sebelumnya tidak ada migrasi yang melakukan ini, sehingga langganan realtime aplikasi kemungkinan besar tidak pernah menerima apa pun dan aplikasi hanya mengandalkan polling.
2. **Tabel CMS:**
   - `site_content`: isi landing page;
   - `site_pages`: halaman publik;
   - `site_page_versions`: riwayat versi, append-only, ditulis oleh trigger.
3. **RLS:**
   - Pengunjung boleh membaca `site_content` dan `site_pages` yang berstatus `published`.
   - Hanya Superadmin yang boleh menulis.
   - Kebijakan dipisah per peran supaya peran `anon` tidak pernah memanggil `is_superadmin()`, fungsi yang memang tidak boleh dijalankan `anon`.
4. **Domain di `site_settings`:** `canonical_url` dan `og_image_url` yang masih memakai domain lama `mtq.id` diganti ke `mtqsystem.web.id`.
5. Mencatat versi skema `20261119` untuk Health Check.

Migrasi sudah diuji di PostgreSQL 16:
- bisa dijalankan dua kali tanpa galat;
- pengunjung hanya melihat halaman terbit;
- hakim tidak bisa menulis;
- versi tercatat otomatis.

---

## 1. Realtime & hemat kuota Supabase

**Masalah lama:**
- Rekap Nilai memuat ulang **seluruh workspace (±25 permintaan)** setiap 3 detik.
- Hasil & Kelulusan memuat ulang setiap 15 detik.
- Setiap event realtime dan setiap event login Supabase (termasuk `TOKEN_REFRESHED`) juga memicu muat ulang total.

Itulah penyebab log ingestion dan egress tinggi.

**Sekarang:**

| Pemicu | Tindakan |
|---|---|
| Event `judge_assessments` (koreksi hakim) | **Baris itu saja** diterapkan ke state lewat `applyRealtimeAssessmentRow` dan `mapJudgeAssessmentRow`, tanpa muat ulang. Bila data pendukung belum ada di perangkat (partisipasi atau maqra baru), muat ulang penuh dijadwalkan. |
| Event `stage_participations` / `stages` (undian, finalisasi, pengesahan: jarang) | Muat ulang penuh, digabung dengan jeda 2 detik |
| Koneksi realtime pulih (`CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` lalu `SUBSCRIBED`) | Satu kali muat ulang penuh untuk menutup celah |
| Pengaman | Muat ulang penuh tiap **5 menit**, hanya saat tab terlihat |
| `onAuthStateChange` | Muat ulang hanya bila **identitas sesi berubah** (`SIGNED_IN` / `INITIAL_SESSION` dengan user berbeda), `SIGNED_OUT`, `USER_UPDATED`, atau `PASSWORD_RECOVERY`. `TOKEN_REFRESHED` diabaikan. |
| BroadcastChannel antar-tab | Diabaikan saat mode akun aktif (realtime sudah menangani); tetap dipakai di Mode Demo |
| Rekap Nilai | Polling 3 detik **dihapus** |
| Hasil & Kelulusan | Polling 15 detik **dihapus**; tetap memuat ulang sekali saat halaman dibuka |

Detail kode:
- `supabaseDataService.subscribeToTenantRealtime(tenantId, onChange)` kini menerima `TenantRealtimeEvent { table, eventType, newRow, oldRow }`.
- Ketiga tabel difilter `tenant_id=eq.<tenant>` **di server**.
- Event DELETE (tidak bisa difilter di server) disaring di klien.
- `mapJudgeAssessmentRow` diekspor dan dipakai bersama oleh muat ulang penuh dan event realtime, supaya tidak ada dua versi pemetaan.
- Versi lokal yang masih di antrean atau sedang dikirim tetap menang, lewat `mergeUnsyncedLocalAssessments`.

**Jangan:**
- menambah polling berkala baru;
- memanggil `refreshSupabaseConnection()` dari event yang sering terjadi.

## 2. Halaman SEO dan Meta Situs (disederhanakan)

Halaman lama menampilkan banyak isian yang **tidak berpengaruh**: deskripsi, Open Graph, Twitter, canonical, robots, dan verifikasi Google disimpan tapi tidak pernah dipasang. Halaman yang baru (`SuperadminSettingsView.tsx`) dibagi dua:

- **Kiri (berlaku di aplikasi):** nama situs, template judul tab, judul bawaan, warna tema, favicon (**URL saja**, unggah dihapus).
- **Kanan (hanya-baca):** pratinjau tautan landing page dari `src/content/seo.ts`, ditambah penjelasan bahwa bagian ini statis di `index.html`.

Kolom lain di tabel `site_settings` **tidak dihapus**, supaya data lama tetap utuh.

Tes `38c` memastikan `index.html` dan `src/content/seo.ts` selalu sama. Bila salah satunya diubah, ubah keduanya.

## 3. Meta statis, gambar pratinjau, dan ikon

- **`public/og-image.jpg` baru:** 1200×630, ±60 KB. Isinya logo, label "Sistem Penilaian MTQ & STQ", tagline, domain, dan latar podium.
- **`index.html`:** ditambah `og:image:type` dan `twitter:image:alt`.
- **Ikon PWA & favicon diganti ke logo "Mushaf Terbuka"**, sehingga sama dengan landing:
  - `public/icon.svg`;
  - `public/icons/icon-192x192.png`, `icon-512x512.png`, `icon-maskable-512x512.png` (ruang aman 60%), dan `apple-touch-icon.png`;
  - `public/apple-touch-icon.png`.
- **`public/sitemap.xml`:** ditambah `/panduan`, `/panduan/hakim`, `/panduan/admin`, `/privasi`, `/ketentuan`. Domain mengikuti versi Anda (`mtq-management-system.vercel.app`).
- ⚠️ `canonical` dan `og:url` di `index.html` memakai `https://mtqsystem.web.id/`, sedangkan `sitemap.xml` dan `robots.txt` memakai `mtq-management-system.vercel.app`. Setelah domain resmi tersambung, samakan semuanya ke `mtqsystem.web.id`.

## 4. CMS ringan: Superadmin → **Konten Situs** (`/platform/content`)

File: `src/components/superadmin/SuperadminContentView.tsx`. Menu baru ada di sidebar Superadmin, dan tipe tampilannya `superadmin_content`.

**Tab Landing Page:**
- Semua teks per bagian bisa diubah: hero, latar belakang, pengguna, tahapan, fitur, integritas, tanya jawab, ajakan akhir, footer, kontak.
- Daftar (kartu, tahapan, FAQ) bisa ditambah, dihapus, dan diurutkan.
- **Gambar hanya lewat URL** (`https://…` atau path situs `/…`). Bila **dikosongkan**, gambar **bawaan dari repo** dipakai. Pratinjau gambar langsung tampil.
- Kolom teks yang dikosongkan juga memakai teks bawaan.
- Navigasi (`nav`) dan `markCaption` dikunci, tidak bisa diubah.
- Tersedia tombol **Kembalikan semua ke bawaan**.
- Di Mode Demo editor bisa dilihat, tapi tidak bisa menyimpan.

**Cara landing memakai isi CMS:**
- `src/public/usePublicContent.ts` → `useLandingContent()` langsung menampilkan isi bawaan (atau cache `localStorage`), lalu mengambil `site_content` lewat REST (`src/services/publicContent.ts`, **tanpa supabase-js** agar landing tetap ringan), lalu menggabungkannya dengan `mergeLandingContent`.
- `mergeLandingContent` (di `src/content/landing.ts`) mengikuti **struktur bawaan**:
  - field yang tidak dikenal diabaikan;
  - string kosong berarti pakai bawaan;
  - URL gambar yang tidak aman (mis. `javascript:`) berarti pakai bawaan.

  Tes `38a` menguji aturan ini.

**Tab Halaman:**
- Daftar halaman, gabungan bawaan dan database. Label: **Bawaan / Terbit / Draf**.
- Isian per halaman:
  - judul;
  - alamat (slug);
  - kategori (Panduan / Kebijakan / Lainnya);
  - status Draf atau Terbit;
  - tanggal berlaku;
  - urutan;
  - ringkasan;
  - tampil di footer.
- Isi ditulis dalam **Markdown** dengan tombol **Tulis/Pratinjau**.
- **Riwayat versi**: versi lama bisa dimuat kembali lewat "Pakai isi ini".
- Menghapus halaman yang punya versi bawaan akan mengembalikannya ke isi bawaan.

## 5. Halaman publik

| URL | Isi |
|---|---|
| `/panduan` | Daftar panduan + informasi lainnya |
| `/panduan/hakim`, `/panduan/admin` | Panduan bawaan |
| `/privasi` | Kebijakan Privasi (**draf awal, perlu ditinjau ahli hukum**) |
| `/ketentuan` | Ketentuan Penggunaan (**draf awal**) |
| `/halaman/<slug>` | Halaman lain buatan Superadmin |

Detail teknis:
- **Perutean:** `src/content/publicRoutes.ts` (`slugFromPath`, `pageHref`). `main.tsx` memuat `src/public/PublicPage.tsx` secara terpisah (lazy). Halaman publik **tidak** diberi `noindex`.
- **Isi bawaan:** `src/content/defaultPages.ts`. Isi dari database (berstatus Terbit) menggantikan bawaan untuk slug yang sama.
- **Markdown:** `src/lib/markdown.tsx`, pengubah aman **tanpa `dangerouslySetInnerHTML`**. Mendukung `##`/`###`, daftar, kutipan, garis, tebal, miring, kode, dan tautan (hanya `https`, `http`, `mailto`, `/`, `#`). Jangan diganti dengan pengubah yang merender HTML mentah.
- **Tautan:**
  - footer landing: kolom **Informasi** (Panduan, Privasi, Ketentuan, dan halaman lain yang ditandai "tampil di footer");
  - footer halaman masuk: Panduan, Privasi, Ketentuan.

## 6. Health Check

- Item manual "Bucket Storage (Mushaf & Foto Peserta)" **dihapus**, karena aplikasi tidak memakai Supabase Storage.
- Diganti dua item:
  - **Pendaftaran mandiri dinonaktifkan**;
  - **Realtime Supabase aktif** (migrasi 20261119).
- Checkbox manual kini punya `data-testid="manual-check-<id>"`.

## 7. Tes

- **Unit:** 126 lulus. Tes baru 38a–38c: penggabungan CMS, rute publik, dan kesamaan meta statis.
- **E2E: 48 lulus, 0 gagal, 8 dilewati.** Tes Superadmin yang sebelumnya gagal (SEO, Health Check, Supervisi, Manajemen Akun) **sudah diperbaiki**. Penyebabnya tes yang ketinggalan tampilan, misalnya nama tombol sidebar bentrok dengan kartu di dashboard. Sekarang tes memakai `getByRole('navigation', { name: 'Menu Utama' })`.
- Tes baru E2E:
  - `07-landing-page` tes 05: halaman publik;
  - `02` tes 07: membuka menu Konten Situs.
- Build berhasil.
- Yang **belum diuji** dengan Supabase sungguhan:
  - penerimaan event realtime per baris;
  - menyimpan konten dan halaman lewat dashboard.

  Logikanya sudah diuji lewat tes unit dan migrasi di PostgreSQL lokal.

## 8. Uji manual setelah deploy & migrasi

1. **Realtime:** buka Rekap Nilai di laptop admin, lalu tambah kesalahan di tablet hakim. Rekap harus berubah dalam ±1 detik tanpa memuat ulang halaman. Di Supabase → Logs, jumlah permintaan seharusnya turun drastis.
2. **Konten Situs:** ubah judul hero dan satu URL gambar → Simpan → buka landing page di tab baru.
3. **Halaman:** buka Kebijakan Privasi di Konten Situs → ubah → Terbit → buka `/privasi`.
4. **Pratinjau tautan:** bagikan tautan landing di WhatsApp, atau cek lewat Facebook Sharing Debugger.
