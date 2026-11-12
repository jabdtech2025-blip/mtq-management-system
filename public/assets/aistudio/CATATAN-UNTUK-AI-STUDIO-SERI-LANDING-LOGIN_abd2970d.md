# Catatan untuk AI Studio: Perbaikan Seri, Landing Page, dan Halaman Masuk

> Baca seluruh catatan ini **sebelum** mengubah file yang disebut di bawah. Catatan ini menjelaskan apa yang berubah, mengapa, bagaimana cara kerjanya, dan aturan yang **tidak boleh dilanggar** pada perubahan berikutnya.

Dasar perubahan: `origin/main` commit `46a6690`. Ada tiga kelompok perubahan:
1. Perbaikan aturan nilai seri di **Hasil & Kelulusan**.
2. **Landing page** publik di `/`, sedangkan aplikasi pindah ke `/app`.
3. **Halaman masuk** (gerbang akses) yang didesain ulang.

Selain itu, folder `public/assets/aistudio/` dihapus karena berisi dokumen internal yang bisa dibuka publik.

---

## 0. Ringkasan file

### File baru
| File | Isi |
|---|---|
| `src/components/auth/AuthenticationGateView.tsx` | Halaman masuk baru (semua status: masuk, galat, lupa sandi, tautan terkirim, atur sandi baru, diagnosis akses, Mode Demo) |
| `src/landing/LandingPage.tsx` | Komponen landing page |
| `src/content/landing.ts` | **Seluruh teks** landing page dan data kontak |
| `src/components/brand/Logo.tsx` | Logo "Mushaf Terbuka" (`LogoGlyph`, `LogoTile`, `BRAND_COLORS`) |
| `tests/e2e/07-landing-page.spec.ts` | Tes E2E landing page |
| `public/landing/*.webp` | `hero-podium.webp` (latar hero 2400×1400), `app-log.webp` (log aktivitas 1600×514), 5 tangkapan layar `app-*.webp` (1920×1200) |
| `public/favicon.svg`, `public/favicon-32.png`, `public/og-image.jpg` | Ikon dan gambar pratinjau tautan (1200×630) |

### File yang diubah
| File | Perubahan |
|---|---|
| `src/services/rankingService.ts` | Aturan seri: parameter `isFinalStage`, `championCount`, penanda `isDecisiveTie` |
| `src/components/stages/HasilKelulusanView.tsx` | Meneruskan parameter baru; label seri menentukan vs tidak menentukan |
| `src/tests/domainRules.test.ts` | 6 tes baru (36a–36f) |
| `src/App.tsx` | Komponen login lama **dihapus**, diganti impor `AuthenticationGateView`; judul tab "Masuk" saat gerbang tampil |
| `src/main.tsx` | Pemilihan landing atau aplikasi berdasarkan URL; font dan `noindex` untuk aplikasi |
| `src/context/MtqContext.tsx` | `/app` diperlakukan seperti `/` saat sinkronisasi URL awal |
| `src/services/supabaseDataService.ts` | Bawaan alamat kembali tautan email = `origin + '/app'` |
| `src/hooks/useDocumentMeta.ts` | Parameter ketiga opsional `pageTitleOverride` |
| `src/index.css` | Kelas `.landing-hero-shade` (gradasi di atas gambar hero) |
| `src/types/mtq.ts` | Bawaan `canonicalUrl` dan `ogImageUrl` → domain `mtqsystem.web.id` |
| `index.html` | Meta SEO/OG baru, favicon baru, **tanpa** `<link>` Google Fonts dan tanpa meta `robots` |
| `public/robots.txt`, `public/sitemap.xml` | Domain `mtqsystem.web.id` |
| `tests/e2e/01-auth-gate-and-signup.spec.ts` | Teks disesuaikan dengan halaman masuk baru |
| `tests/e2e/helpers/auth.ts`, `tests/e2e/06-live-credentials-audit.spec.ts` | Membuka `/app`, bukan `/` |
| `package.json`, `package-lock.json`, `bun.lock` | Dependensi baru `@fontsource/ibm-plex-sans` |

### File yang dihapus
- Seluruh folder `public/assets/aistudio/`. **Jangan pernah** menaruh dokumen audit, catatan, atau prompt di dalam `public/`, karena semua isi `public/` bisa diunduh siapa pun lewat URL.

---

## 1. Perbaikan nilai seri

### 1.1 Masalah yang diperbaiki
Di babak penyisihan (kuota 7, babak berikutnya Final), dua peserta seri identik di **peringkat 1**. Keduanya jelas lolos, tetapi:
- tombol **Konfirmasi & Loloskan** terkunci dengan pesan "seri pada posisi Podium Juara (1/2/3)";
- panel **Keputusan Sidang Pleno** tidak muncul, sehingga admin buntu.

Kasus kedua: dua peserta seri di **peringkat 11** (keduanya tidak lolos) diberi teks merah "Perlu Keputusan Sidang Pleno", padahal tidak ada tombol pleno dan seri itu tidak memengaruhi apa pun.

### 1.2 Penyebab
Ada dua aturan seri yang tidak sejalan:
- **Server** (`compute_stage_rankings` / `advance_stage_qualifiers`) dan **panel pleno** (`criticalTieGroups` di `HasilKelulusanView`) sudah benar. Seri dianggap *menentukan* hanya bila:
  - **babak punya babak berikutnya**: seri **melintasi batas kuota** (`minOrder <= quota && maxOrder > quota`);
  - **babak final** (tanpa babak berikutnya): seri di **peringkat `<= championCount`**.
- **Pemeriksaan di layar** (`RankingService.evaluateStageParticipants`) selalu memblokir seri di `rank <= 3` tanpa melihat apakah babak itu final, dan memakai angka 3 tetap.

### 1.3 Aturan yang berlaku sekarang (WAJIB dipertahankan)

| Jenis babak | Seri yang MENENTUKAN (memblokir, butuh pleno) | Seri yang TIDAK menentukan |
|---|---|---|
| Babak dengan babak berikutnya | Kelompok seri yang melintasi batas kuota (mis. kuota 7, seri di peringkat 7 & 8) | Semua seri lain (mis. peringkat 1 & 2, atau 11 & 12) |
| Babak final | Kelompok seri yang menyentuh peringkat 1…`championCount` | Seri di bawah posisi juara (mis. peringkat 4 & 5 bila 3 juara) |

Seri yang tidak menentukan **tidak boleh** memblokir pengesahan dan **tidak boleh** diberi label merah atau kata "sidang pleno".

### 1.4 Perubahan di `src/services/rankingService.ts`

**a. Parameter baru `evaluateStageParticipants`:**
```ts
isFinalStage?: boolean;   // true bila babak TIDAK punya babak berikutnya di cabang yang sama (bawaan false)
championCount?: number;   // jumlah juara babak final (bawaan 3; nilai tidak valid → 3)
```

**b. Field baru di `EvaluatedParticipantStage`:**
```ts
isDecisiveTie?: boolean;  // true bila peserta ada di kelompok seri tak terpecahkan yang menentukan hasil
```

**c. Langkah "5b" (setelah `evaluatedParticipants` dibentuk):**
- Kelompokkan peserta berurutan yang `hasUnresolvedTie === true` dengan `displayScore` sama.
- Untuk tiap kelompok (peringkat pertama `firstRank`, terakhir `lastRank`), kelompok dianggap menentukan bila berisi lebih dari 1 peserta **dan**:
  - babak final: `firstRank <= championCount`;
  - babak lain: `firstRank <= quota && lastRank > quota`.
- Hasilnya:
  - `isDecisiveTie = decisive`;
  - `tieBreakResolvedBy` = `"Nilai seri identik pada seluruh kriteria bidang — perlu keputusan sidang pleno"` (menentukan) atau `"Seri — berbagi peringkat, tidak memengaruhi kelulusan"` (tidak menentukan).

**d. Pemeriksaan blokir:**
- `boundaryTie` (batas kuota) hanya dihitung bila `!isFinalStage`.
- `podiumTies` hanya diisi bila `isFinalStage` dan `rank <= championCount`.
- `podiumUnresolved` = `isFinalStage && ada peserta rank <= championCount, isDecisiveTie, dan !isOverridden`.
- Pesannya: `"Terdapat nilai seri identik pada posisi juara 1–{championCount}. Wajib diputuskan dalam sidang pleno dewan hakim atau melalui override manual."`
- Urutan pemeriksaan lain (kuota tidak valid, hakim, aturan, maqra, penilaian belum lengkap, alasan override, kuota terlampaui) **tidak berubah**.

**e. `evaluateStageByBranches`** meneruskan:
```ts
isFinalStage: Boolean(branchStage) && !branchNextStage,
championCount: branchStage?.championCount || 3
```

### 1.5 Perubahan di `src/components/stages/HasilKelulusanView.tsx`
- Pemanggilan `RankingService.evaluateStageParticipants` kini menyertakan:
  ```ts
  isFinalStage: Boolean(currentStage) && !nextStage,
  championCount: currentStage?.championCount || 3
  ```
  `nextStage` dan `currentStage` ditambahkan ke dependensi `useMemo`.
- `decisiveTieIds` (Set id peserta yang ada di kelompok seri menentukan):
  - **sumber utama**: `criticalTieGroups` dari peringkat server (`serverRankings`);
  - **cadangan** bila data server belum ada: `isDecisiveTie` dari evaluasi di layar.
- Tampilan per baris:
  - kata "Seri" di kolom peringkat: merah (`text-rose-700`) bila menentukan, abu-abu (`text-slate-500`) bila tidak;
  - di bawah nama peserta, bila `hasUnresolvedTie`:
    - menentukan dan belum di-override → lencana merah **"Nilai Seri Identik"** + teks merah **"Perlu keputusan sidang pleno"**;
    - menentukan dan sudah di-override → abu-abu **"Seri — sudah diputuskan melalui override"**;
    - tidak menentukan → abu-abu **"Seri — berbagi peringkat, tidak memengaruhi kelulusan"**;
  - bila seri berhasil dipecahkan oleh tie-break, teks ⚖️ `tieBreakResolvedBy` tetap tampil seperti sebelumnya.
- Logika panel pleno (`criticalTieGroups`, `isTieGroupValid`, penerapan keputusan) **tidak diubah**.

### 1.6 Tes baru (`src/tests/domainRules.test.ts`, 36a–36f)
Memakai helper `buildTieScenario(scores)` / `runTieScenario(scores, opts)`. Peserta dengan nilai sama diberi `fieldScores` identik sehingga seri tidak terpecahkan.

| Tes | Skenario | Harapan |
|---|---|---|
| 36a | Non-final, kuota 7, 8 peserta, seri di peringkat 1 | `canFinalize === true`, keduanya lolos, `isDecisiveTie === false` |
| 36b | Non-final, kuota 7, seri di peringkat 7 & 8 | Diblokir `UNRESOLVED_TIE`, `isDecisiveTie === true` |
| 36c | Final, 3 juara, seri di peringkat 2 | Diblokir `UNRESOLVED_TIE`, pesan memuat "1–3" |
| 36d | Final, 3 juara, seri di peringkat 4 | Tidak diblokir |
| 36e | Final, seri di peringkat 2, sudah di-override dengan alasan | Tidak diblokir |
| 36f | Non-final, kuota 7, seri di peringkat 11 & 12 | Tidak diblokir, keduanya tidak lolos, label "Seri — berbagi peringkat…" |

### 1.7 Larangan
- **Jangan** mengubah SQL, trigger, RLS, `advance_stage_qualifiers`, atau `compute_stage_rankings` untuk urusan ini. Aturan server sudah benar; yang diperbaiki hanya pemeriksaan di layar.
- **Jangan** kembali memakai angka `3` tetap untuk posisi juara. Selalu pakai `championCount`.
- Pesan blokir dan panel pleno harus selalu konsisten. Bila pengesahan diblokir karena seri, panel pleno harus tampil untuk kelompok itu; bila tidak ada seri yang menentukan, tidak boleh ada blokir karena seri.

---

## 2. Landing page dan pemisahan rute

### 2.1 Peta rute
| URL | Yang tampil |
|---|---|
| `/` (dan `/index.html`) | **Landing page**, kecuali URL membawa token dari email Supabase |
| `/app` | Aplikasi (halaman masuk bila belum login, lalu dashboard) |
| `/dashboard`, `/platform/...`, dan rute aplikasi lain | Aplikasi seperti biasa |

### 2.2 `src/main.tsx`
- `LandingPage` dan `App` dimuat terpisah dengan `React.lazy`, sehingga pengunjung landing tidak mengunduh kode aplikasi.
- `isLandingRoute()` mengembalikan `true` hanya bila path `/` atau `/index.html` **dan** URL bukan callback autentikasi. Callback dikenali dari:
  - hash: `access_token=`, `refresh_token=`, `type=recovery|invite|signup|magiclink`, `error_description=`;
  - query: `?code=` atau `token_hash=`.
  
  Tujuannya agar tautan reset sandi atau undangan lama yang masih mengarah ke `/` tetap diproses aplikasi.
- `prepareAppDocument()` (hanya untuk aplikasi):
  - menambah `<meta name="robots" content="noindex, nofollow">`;
  - memuat Google Fonts aplikasi: Amiri, JetBrains Mono, Plus Jakarta Sans, Scheherazade New.
  
  Karena itu `index.html` **tidak** lagi memuat Google Fonts. Jangan menambahkannya kembali ke `index.html`, karena akan memperlambat landing page.

### 2.3 Penyesuaian aplikasi untuk `/app`
- `MtqContext.tsx`: saat aplikasi dibuka di `/` **atau** `/app`, URL diganti ke path tampilan awal (mis. `/dashboard`) dengan `history.replaceState`.
- `supabaseDataService.ts` → `validateRedirectUrl`: bila tidak ada URL kandidat, bawaan alamat kembali adalah `window.location.origin + '/app'`. Tautan email baru pun langsung membuka aplikasi.
- Tes E2E kini membuka `/app` (lihat `tests/e2e/helpers/auth.ts`).

### 2.4 Struktur `LandingPage.tsx`
Urutan bagian (id dipakai menu navigasi):
1. **Hero** (`#beranda`):
   - latar `#06201F` dengan `<img>` `hero-podium.webp` (desktop: kanan, lebar 72%; ponsel: penuh);
   - bayangan `.landing-hero-shade` (didefinisikan di `src/index.css`, berbeda untuk ponsel dan desktop ≥1024px);
   - header: logo, menu, tombol "Masuk", dan menu hamburger di ponsel;
   - chip, judul h1, subjudul, dua tombol, dan tiga centang emas.
   - **Tidak ada** strip atau banner tipis di atas header, dan **tidak ada** logo besar di hero. Keduanya sengaja dihapus atas permintaan pemilik.
2. **Latar Belakang**: lembar terang membulat (`-mt-16`, `rounded-t-[48px]`) menumpuk ke hero, berisi 3 kartu bergambar.
3. **Pengguna**: blok gelap dengan gambar dashboard redup dan 3 kartu kaca.
4. **Tahapan** (`#tahapan`): linimasa 6 langkah dengan titik emas; langkah terakhir hijau tua.
5. **Fitur** (`#fitur`): 3 kartu gambar rasio 4:5 dengan gradasi gelap di bawah.
6. **Integritas** (`#integritas`): dua kolom.
   - Kiri: panel gelap berpola bintang dengan "jendela" berisi `app-log.webp` selebar 118% yang sengaja terpotong di kanan, plus lencana "Hasil Babak Final terkunci".
   - Kanan: chip, judul, dan 6 poin centang.
7. **Tanya Jawab** (`#tanya-jawab`): `<details>` dengan garis teal di kiri, plus tautan WhatsApp.
8. **Footer**: CTA, tautan, kontak, dan hak cipta.

Token desain:
- font **IBM Plex Sans** (di-host sendiri lewat `@fontsource/ibm-plex-sans`, bobot 400/500/600/700, diimpor di `LandingPage.tsx` dan `AuthenticationGateView.tsx`);
- warna `#06201F` (malam), `#09403E` (hijau tua), `#159893` (teal), `#0E6F6B` (teal teks kecil, kontras cukup), `#E9A23B` (emas), `#4B5563` (teks sekunder), `#E5E7EB` (garis).

### 2.5 Mengubah teks
**Semua teks** ada di `src/content/landing.ts` (objek `landingContent`). Ubah teks di sana, **bukan** di JSX.

Data kontak resmi:
- Alamat: Kalibagor, Banyumas, Jawa Tengah
- Email: admin@mtqsystem.web.id
- WhatsApp: `6282134342089` (tampilan +62 821-3434-2089). Tautan dibuat oleh `whatsappLink()`.

Field yang ditambahkan di versi ini:
- `hero.chip`, `hero.highlights`, `hero.backgroundImage`;
- `integrity.chip`, `integrity.logImage`, `integrity.logImageAlt`, `integrity.logWindowTitle`, `integrity.lockBadgeTitle`, `integrity.lockBadgeBody`.

Jawaban FAQ tentang seri sudah disesuaikan dengan aturan baru: "batas kuota kelulusan atau posisi juara babak final".

### 2.6 SEO
- `index.html`:
  - judul "Manajemen MTQ — Sistem Penilaian Digital MTQ & STQ";
  - canonical dan OG ke `https://mtqsystem.web.id/`;
  - `og-image.jpg`;
  - `favicon.svg` dan `favicon-32.png`;
  - JSON-LD `WebApplication`;
  - **tanpa** meta `robots` agar landing bisa diindeks. Tes E2E 07 memeriksa landing tidak punya meta robots.
- Halaman aplikasi selalu `noindex,nofollow` (lewat `main.tsx` dan `useDocumentMeta`).
- `robots.txt` melarang `/app`, `/dashboard`, `/platform/`; `sitemap.xml` hanya berisi `/`.
- `src/types/mtq.ts`: bawaan `canonicalUrl` = `https://mtqsystem.web.id`, `ogImageUrl` = `https://mtqsystem.web.id/og-image.jpg`.
- Gambar `.webp` di `public/landing/` tidak masuk precache PWA (pola glob hanya js/css/html/png/svg/woff). Ini disengaja agar cache aplikasi tetap kecil.

---

## 3. Halaman masuk baru

### 3.1 Lokasi dan pemakaian
- Komponen: `src/components/auth/AuthenticationGateView.tsx` (ekspor bernama dan default).
- Dipakai di `src/App.tsx` → `MainLayout`:
  ```tsx
  const showAuthGate = !isLiveAccessAuthorized || isPasswordRecoveryMode;
  useDocumentMeta(currentView, siteSettings, showAuthGate ? 'Masuk' : undefined);
  if (showAuthGate) return <AuthenticationGateView />;
  ```
  Judul tab saat gerbang tampil: "Masuk — Manajemen MTQ".
- Komponen lama yang dulu ada di dalam `App.tsx` **sudah dihapus seluruhnya**. Jangan menghidupkannya kembali.

### 3.2 Fungsi dari `useMtq()` yang dipakai (tidak diubah)
`connectionInfo`, `authenticatedProfile`, `accessGateReason`, `workspaceError`, `isPasswordRecoveryMode`, `setIsPasswordRecoveryMode`, `refreshSupabaseConnection`, `signInWithSupabase`, `signOutSupabase`, `requestPasswordReset`, `completePasswordReset`, `bootstrapFirstSuperadmin`, `enterOfflineDemoSimulation`.

### 3.3 Urutan pemilihan tampilan
```
isPasswordRecoveryMode        → "Atur kata sandi baru"
else showDiagnostic           → Diagnosis akses
else step === 'forgot'        → "Lupa kata sandi?"
else step === 'sent'          → "Periksa email Anda"
else                          → "Masuk ke sistem"
```
`showDiagnostic` = bukan mode pemulihan **dan** ada `authenticatedProfile` **dan** `accessGateReason` bukan `unauthenticated`, `supabase_unconfigured`, atau `connection_checking`.

### 3.4 Rincian tiap status
- **Masuk** (`renderLogin`):
  - Bila `connectionInfo.isConfigured`: form berisi Email (`#masuk-email`) dan Kata sandi (`#masuk-sandi`, dengan tombol tampil/sembunyikan), tautan "Lupa kata sandi?", dan tombol "Masuk".
  - Bila Supabase belum dikonfigurasi: kotak info "Masuk dengan akun belum tersedia". **Jangan** menampilkan istilah teknis seperti "Supabase", "Fail-Closed", atau status koneksi; tes E2E 01 memeriksa hal ini.
  - Di bawahnya: pemisah "atau", tombol kartu **"Coba Mode Demo"** (berupa `<button>`; nama aksesibelnya diawali "Coba Mode Demo" dan dipakai tes E2E), lalu catatan "Belum punya akun? … WhatsApp".
- **Galat**:
  - kotak merah "Gagal masuk" dengan pesan dari `friendlyAuthMessage()` dan tautan "Atur ulang kata sandi";
  - kolom email dan sandi berbingkai merah (`aria-invalid`).
- **`friendlyAuthMessage(raw)`** menerjemahkan pesan teknis:
  - `invalid login credentials` → "Email atau kata sandi salah…";
  - `email not confirmed` → minta konfirmasi email;
  - `rate limit` / `too many requests` → minta tunggu;
  - `failed to fetch` / `network` → periksa koneksi;
  - selain itu, awalan "Autentikasi gagal:" dibuang.
- **Lupa kata sandi** (`renderForgot`): tautan kembali, ikon surat, kolom "Email terdaftar" (`#lupa-email`), tombol "Kirim tautan", dan petunjuk folder spam. Bila berhasil → `step = 'sent'` dan hitung mundur dimulai.
- **Tautan terkirim** (`renderSent`):
  - judul "Periksa email Anda" dengan kalimat netral "Bila {email} terdaftar…" (tidak membocorkan apakah email terdaftar);
  - 3 langkah bernomor;
  - tombol "Kirim ulang dalam 0:SS" yang nonaktif selama `RESEND_SECONDS = 45` detik, lalu menjadi "Kirim ulang tautan";
  - tautan kembali ke halaman masuk.
- **Atur kata sandi baru** (`renderRecovery`, aktif bila `isPasswordRecoveryMode`):
  - kolom `#sandi-baru` dengan indikator kekuatan 4 segmen dan daftar syarat dari `evaluatePasswordStrength()`:
    - syarat: minimal 8 karakter, huruf dan angka, simbol (disarankan);
    - skor 0–4 (+1 bila ≥12 karakter dan ketiga syarat terpenuhi);
    - label: Terlalu lemah / Lemah / Cukup / Kuat / Sangat kuat;
  - kolom `#sandi-konfirmasi` dengan teks "Kata sandi cocok" atau "Kata sandi belum cocok";
  - tombol "Simpan kata sandi" nonaktif sampai minimal 8 karakter **dan** konfirmasi cocok;
  - tautan "Batal dan kembali ke halaman masuk" memanggil `setIsPasswordRecoveryMode(false)`;
  - validasi tetap dilakukan saat submit; server juga mewajibkan minimal 8 karakter.
- **Diagnosis akses** (`renderDiagnostic`):
  - judul dan deskripsi sesuai `accessGateReason`: `profile_missing`, `membership_empty`, `membership_inactive`, `query_error`, `workspace_hydration_error`;
  - email dan peran global ditampilkan;
  - tombol **"Bootstrap Superadmin Pertama"** (hanya untuk `profile_missing` / `membership_empty`), **"Periksa Ulang Akses"**, dan **"Keluar dari Sesi Ini"**. Ketiganya wajib dipertahankan.

### 3.5 Tata letak
- **Desktop (≥1024px / `lg`)**:
  - panel kiri 52%: gambar podium dengan gradasi gelap, logo, tagline "Penilaian yang tertib, hasil yang dapat dipertanggungjawabkan.", dan 3 centang emas;
  - panel kanan 48%: tautan "Kembali ke beranda" (`href="/"`), formulir selebar maksimal 400px, dan footer (© tahun, email admin).
- **Ponsel**: panel kiri disembunyikan; diganti kepala gelap pendek berisi logo, tautan "Beranda", dan tagline.

### 3.6 Yang sengaja tidak dipasang
- Kotak centang **"Ingat saya di perangkat ini"** dari desain **tidak dipasang**, karena sesi Supabase selalu tersimpan. Kontrol yang tidak berfungsi menyesatkan pengguna. Bila nanti ingin dipasang, harus benar-benar mengatur penyimpanan sesi (mis. `sessionStorage` vs `localStorage` di klien Supabase), jangan sekadar tampilan.
- Tidak ada pendaftaran mandiri. Jangan menambahkan tombol "Daftar"; tes E2E 01 memeriksanya.

### 3.7 Aksesibilitas yang harus dipertahankan
- Setiap input punya `<label htmlFor>`.
- Galat memakai `role="alert"`, keberhasilan memakai `role="status"`.
- Tombol mata punya `aria-label` dan `aria-pressed`.
- Fokus terlihat (outline teal).
- Tombol saat memuat memakai `aria-busy`.

---

## 4. Tes dan gerbang kualitas

| Perintah | Hasil saat diserahkan |
|---|---|
| `npm run lint` (tsc) | Lulus |
| `npm test` | 120 lulus, 0 gagal |
| `npm run build` | Berhasil |
| `npm run test:e2e` | 38 lulus, 8 dilewati, 8 gagal |

**Tentang 8 tes E2E yang gagal:** keempat tes ini (×2 perangkat) **sudah gagal di `origin/main` sebelum perubahan ini**:
- `02-demo-workspace-navigation` tes 05, 06, 07 (Superadmin SEO, Health Check, isolasi menu);
- `05-user-management-and-passwords` tes 02 (Manajemen Akun Global).

Penyebabnya, tes dan tampilan Superadmin sudah tidak cocok; contohnya `data-testid="seo-favicon-section"` tidak ada lagi di halaman SEO. Ini pekerjaan terpisah: perbaiki tampilannya atau tesnya, jangan dihapus.

Tes E2E yang relevan dengan perubahan ini:
- `01-auth-gate-and-signup.spec.ts`:
  - tes 01: heading "Masuk ke sistem", teks "Pendaftaran mandiri tidak tersedia", tautan "Kembali ke beranda", tombol "Coba Mode Demo", dan tidak ada istilah teknis;
  - tes 03 hanya jalan bila `E2E_SUPABASE_CONFIGURED=true`: tombol "Lupa kata sandi?" → heading "Lupa kata sandi?" → tombol "Kirim tautan" → "Kembali ke halaman masuk".
- `07-landing-page.spec.ts`: judul hero, heading Tahapan dan FAQ, tautan email dan WhatsApp, tidak ada meta robots di landing, tombol hero membuka aplikasi (muncul "Coba Mode Demo" dan meta `noindex`), FAQ bisa dibuka, dan URL berisi `#error_description=` di `/` diproses aplikasi.

**Bila mengubah teks** pada halaman masuk atau landing, periksa dan sesuaikan tes di atas dalam perubahan yang sama.

---

## 5. Langkah manual setelah deploy (bukan kode)
1. **Supabase → Authentication → URL Configuration**:
   - Site URL: `https://mtqsystem.web.id/app`
   - Redirect URLs: tambahkan `https://mtqsystem.web.id/**`
2. **Supabase → Edge Functions → `admin-provision-user` → Secrets**: tambahkan `https://mtqsystem.web.id` ke `ALLOWED_ORIGINS`.
3. Arahkan domain `mtqsystem.web.id` ke hosting. Rewrite SPA sudah ada di `vercel.json`, `netlify.toml`, dan `public/_redirects`.
4. **Superadmin → SEO dan Meta Situs**: bila data tersimpan masih memakai `mtq.id`, ganti Canonical URL dan gambar OG ke domain baru.
5. Jalankan `npm install` (atau `bun install`) karena ada dependensi baru `@fontsource/ibm-plex-sans`.

---

## 6. Masalah lain yang diketahui (belum dikerjakan)
- Di Mode Demo, finalisasi lembar nilai bisa gagal untuk kategori **"Pengurangan berbobot"** yang belum punya definisi rumus. Perlu ditinjau terpisah.

---

## 7. Daftar periksa sebelum mengubah area ini lagi
- [ ] Aturan seri tetap: non-final = batas kuota, final = posisi juara (`championCount`).
- [ ] Tidak ada angka `3` tetap untuk juara.
- [ ] SQL/RLS untuk peringkat tidak disentuh.
- [ ] Teks landing diubah di `src/content/landing.ts`, bukan di JSX.
- [ ] `index.html` tetap tanpa Google Fonts dan tanpa meta robots.
- [ ] Tautan email tetap diarahkan ke `/app`; deteksi callback di `main.tsx` tidak dihapus.
- [ ] Halaman masuk: tombol "Coba Mode Demo", "Bootstrap Superadmin Pertama", "Periksa Ulang Akses", dan "Keluar dari Sesi Ini" tetap ada.
- [ ] Tidak ada istilah teknis atau tombol pendaftaran di halaman masuk.
- [ ] Tidak ada dokumen internal di folder `public/`.
- [ ] `npm run lint`, `npm test`, `npm run build`, dan `npm run test:e2e` dijalankan; tidak ada kegagalan baru selain 8 tes Superadmin yang sudah gagal sejak sebelumnya.
