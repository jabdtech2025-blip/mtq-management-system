# Catatan Keputusan Domain & Konfigurasi (DECISIONS)

Dokumen ini mencatat keputusan arsitektur dan konfigurasi default yang diambil selama perbaikan audit, termasuk butir yang memerlukan konfirmasi resmi dari pemilik rubrik / Dewan Hakim LPTQ.

## 1. Standar Peta Halaman Mushaf (T1.1)
- **Keputusan**: Menggunakan standar **Mushaf Al-Madinah An-Nabawiyyah (114 Surah, 6.236 Ayat, 604 Halaman)** sebagai acuan kalkulasi otomatis halaman awal (`page_start`) dan halaman akhir (`page_end`) berdasarkan nomor surah dan rentang ayat.
- **Fleksibilitas**: Administrator tetap dapat melakukan *override* nomor halaman secara manual apabila penyelenggara menggunakan cetakan mushaf khusus, namun sistem menampilkan peringatan eksplisit dan tetap menegakkan invarian `1 <= page_start <= page_end <= 604` serta `1 <= start_ayah <= end_ayah <= total_ayah(surah)`.
- **Status Konfirmasi**: *Perlu konfirmasi pemilik rubrik/LPTQ apabila penyelenggara menggunakan Mushaf Pojok selain standar 604 halaman Madinah.*

## 2. Definisi Tunggal Kelengkapan Babak (`getStageCompletion`) (T1.2)
- **Keputusan**: Seorang peserta pada suatu babak dinyatakan **Lengkap (`isComplete = true`)** jika dan hanya jika:
  1. Peserta memiliki minimal 1 maqra yang ditetapkan pada babak tersebut ($\text{assignedMaqraCount} \ge 1$).
  2. Cabang/babak tersebut memiliki minimal 1 dewan hakim aktif yang bertugas ($\text{requiredJudgeCount} \ge 1$).
  3. Seluruh kombinasi $(\text{maqra ditetapkan} \times \text{hakim bertugas})$ memiliki lembar penilaian berstatus `finalized`.
- **Alasan Pemblokiran Pengesahan (`blockingReason`)**: Menggunakan kode terstruktur (`STAGE_ALREADY_FINALIZED`, `NO_PARTICIPANTS`, `NO_JUDGES_ASSIGNED`, `INCOMPLETE_ASSESSMENTS`, `UNMAPPED_ERROR_CATEGORIES`, `UNRESOLVED_BOUNDARY_TIE`, `QUOTA_EXCEEDED`, `NO_QUALIFIERS_SELECTED`, `MISSING_OVERRIDE_REASON`) sehingga UI tidak pernah menampilkan pesan ambigu seperti *"0 peserta belum lengkap"* ketika terkunci.

## 3. Penanganan Kategori Kesalahan saat Bidang Rubrik Dihapus (T1.3)
- **Keputusan**: Ketika sebuah bidang rubrik dihapus permanen melalui `delete_rubric_field_cascade` atau penghapusan baris `rubric_fields`, kolom `error_categories.rubric_field_id` diatur menjadi `NULL` (`ON DELETE SET NULL`).
- **Dampak Operasional**: Kategori kesalahan yang kehilangan bidang rubrik ditandai dengan status **"Belum Dipetakan"** di halaman Master Data dan tidak melakukan *fallback* diam-diam ke bidang lain (mis. Tajwid). Penilaian yang memuat kategori tak terpetakan akan menghasilkan *validation error* dan memblokir finalisasi hingga Admin memetakan ulang kategori tersebut ke bidang aktif.
- **Status Konfirmasi**: *Sesuai dengan prinsip akurasi penilaian LPTQ; perlu konfirmasi pemilik rubrik untuk daftar pemetaan kategori kustom per daerah.*

## 4. Isolasi Profil Pengguna Lintas-Tenant (T2.1)
- **Keputusan**: Tabel `public.profiles` menyimpan identitas dasar akun, namun peran operasional (`admin`, `judge`) wajib selalu diturunkan dari `public.tenant_memberships` pada tenant aktif. Hanya peran `superadmin` yang bersifat global. Apabila Admin Tenant A mengundang/menautkan email pengguna yang sudah menjadi anggota aktif di Tenant B, sistem hanya menambahkan baris `tenant_memberships` di Tenant A tanpa menimpa `name`, `username`, `email`, atau `role` milik pengguna tersebut di `public.profiles`.
