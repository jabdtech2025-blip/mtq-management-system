# Audit Lanjutan MTQ (commit 7ba46bb)

Nov 11, 2026 · @JundiAbdullah

## Ringkasan

Commit 7ba46bb lolos lint, 92/92 tes, dan build, tetapi hasil lomba masih bisa diubah tanpa jejak oleh admin tenant maupun hakim. Saya menemukan 4 temuan kritis dan 8 temuan tinggi. Sembilan di antaranya saya buktikan langsung di PostgreSQL 16 (PGlite) memakai peran `authenticated`, sama seperti pengguna sungguhan lewat Supabase.

Celah ini lolos dari 92 tes karena sebagian besar tes berjalan sebagai superuser database, sehingga aturan RLS tidak ikut diuji (lihat J3).

| # | Tingkat | Temuan | Pelaku | Bukti |
| --- | --- | --- | --- | --- |
| K1 | Kritis | Hasil resmi babak yang sudah disahkan bisa diubah, dan peserta lain bisa disisipkan sebagai Juara 1 | Admin tenant | Diuji |
| K2 | Kritis | Hakim bisa melipatgandakan bobot nilainya lewat lembar nilai dengan "maqra pinjaman" | Hakim | Diuji (93,00 → 96,50) |
| K3 | Kritis | Hakim bisa memotong nilai di bidang yang bukan tugasnya | Hakim | Diuji |
| K4 | Kritis | Log undian bisa diubah atau dihapus, sehingga verifikasi undian tidak bermakna | Admin tenant | Diuji |
| T1 | Tinggi | Keputusan pleno untuk satu peserta saja diterima; sisa peserta seri diurutkan menurut nomor undian | Admin tenant | Diuji |
| T2 | Tinggi | Menonaktifkan hakim setelah ia memfinalisasi nilai menghapus nilainya dari peringkat, tanpa alasan atau audit | Admin tenant | Diuji (93 → kosong) |
| T3 | Tinggi | Bobot potongan kategori kesalahan bisa diubah di tengah lomba | Admin tenant | Diuji |
| T4 | Tinggi | Satu peserta berstatus Ditolak memblokir undian seluruh babak | Sistem | Kode |
| T5 | Tinggi | Peserta yang ditolak setelah undian tetap dihitung dan bisa menjadi juara | Sistem | Kode |
| T6 | Tinggi | Nilai akhir dirata-rata dari semua lembar, bukan dari nilai per bidang | Sistem | Kode |
| T7 | Tinggi | Menjalankan ulang migrasi 20261114 otomatis memverifikasi semua peserta yang masih menunggu | Operator | Kode |
| T8 | Tinggi | Hakim bisa melihat peringkat dan rata-rata nilai hakim lain sebelum pleno | Hakim | Kode |

Urutan perbaikan yang disarankan: K1–K4 dulu (semuanya trigger dan validasi di database, tanpa perubahan UI), lalu T1–T5, lalu T6 setelah model penilaian dikonfirmasi dengan juknis resmi.

## Bug kritis (terbukti)

Keempatnya bisa dilakukan dari browser memakai anon key dan sesi login biasa, tanpa melewati RPC resmi.

### K1. Hasil resmi bisa diubah setelah babak disahkan

- **Masalah:** tabel `stage_participations` masuk daftar `strict_tenant_tables` dengan kebijakan admin `FOR ALL`, dan tidak ada trigger yang menguncinya setelah babak disahkan. Trigger lintas tenant hanya memeriksa `tenant_id`.
- **Bukti (sebagai admin, babak sudah disahkan):** `UPDATE stage_participations SET champion_rank=NULL, rank=2` berhasil. `INSERT` peserta lain dengan `champion_rank=1, champion_title='Juara 1'` juga berhasil.
- **Dampak:** snapshot resmi memang tetap utuh (append-only), tetapi riwayat peserta, rekap, dan data yang dibaca layar lain berasal dari `stage_participations`. Sebelum pengesahan, admin juga bisa langsung memasukkan peserta yang tidak lolos ke babak berikutnya.
- **Perbaikan:** buat trigger `BEFORE INSERT/UPDATE/DELETE` pada `stage_participations` yang menolak semua perubahan bila `stages.is_finalized = true`. Kolom `final_score`, `rank`, `is_qualified`, dan `champion_*` hanya boleh diubah saat flag `mtq.rpc_stage_finalize_active` aktif. `INSERT` ke babak dengan `stage_order > 1` hanya lewat `advance_stage_qualifiers`.

### K2. Hakim bisa melipatgandakan bobot nilainya

- **Masalah:** tidak ada pemeriksaan bahwa `judge_assessments.assigned_maqra_id` benar milik `stage_participation_id` yang sama. `compute_stage_rankings` lalu merata-rata **semua** lembar final peserta itu.
- **Bukti:** hakim membuat lembar kedua untuk Peserta 1 memakai ID maqra milik Peserta 2, mengisinya tanpa kesalahan, lalu memfinalisasinya. Nilai Peserta 1 naik dari 93,00 menjadi 96,50. Kelengkapan babak tidak terpengaruh, sehingga tidak ada yang curiga.
- **Perbaikan:** tambahkan trigger yang memastikan `assigned_maqras.stage_participation_id = NEW.stage_participation_id`. Di `compute_stage_rankings` dan `advance_stage_qualifiers`, hitung hanya lembar yang di-JOIN ke `assigned_maqras` milik peserta tersebut.

### K3. Hakim bisa memotong nilai di bidang yang bukan tugasnya

- **Masalah:** `calculate_assessment_score_sql` memproses semua kategori kesalahan tenant tanpa melihat `judge_assignments.rubric_field_id` milik hakim.
- **Bukti:** hakim yang ditugaskan hanya di bidang Tajwid mengisi `{"LAG": 10, "MKH": 2}`. Finalisasi berhasil, dan nilai Lagu turun dari 25 menjadi 20.
- **Perbaikan:** di `finalize_judge_assessment`, tolak kategori yang bidangnya tidak termasuk bidang tugas hakim, kecuali penugasannya `rubric_field_id IS NULL` (hakim semua bidang). Batasi juga daftar kategori di UI lembar penilaian.

### K4. Log undian bisa diubah dan dihapus

- **Masalah:** `lottery_draw_logs` juga memakai kebijakan admin `FOR ALL`. Trigger append-only hanya terpasang di `audit_logs` dan `stage_result_snapshots`.
- **Bukti:** `UPDATE lottery_draw_logs SET seed_hex='deadbeef'` dan `DELETE` keduanya berhasil sebagai admin.
- **Dampak:** `verify_lottery_draw` hanya memeriksa log terhadap dirinya sendiri. Kalau log bisa diganti, bukti keadilan undian hilang.
- **Perbaikan:** pasang `enforce_append_only_records` pada `lottery_draw_logs`, dan ubah kebijakannya menjadi SELECT saja untuk anggota tenant (INSERT hanya lewat RPC).

## Bug tinggi & sedang di alur

Temuan ini disusun mengikuti alur lomba: pendaftaran → undian → penilaian → kelulusan → juara.

### Tinggi

| # | Tahap | Masalah | Perbaikan |
| --- | --- | --- | --- |
| T1 | Juara | `advance_stage_qualifiers` memeriksa resolusi seri dengan `BOOL_OR`, sehingga cukup **satu** peserta yang diberi keputusan pleno. Uji: seri 3 peserta di final dengan keputusan hanya untuk A diterima. Juara 2 dan 3 lalu ditentukan nomor undian (01 sebelum 02). Nilai urutan juga tidak divalidasi, jadi dua peserta bisa diberi urutan 1. | Wajibkan setiap anggota kelompok seri punya urutan unik 1..n dan alasan ≥ 5 karakter (pakai `BOOL_AND` dan cek `COUNT(DISTINCT)`). UI yang baru sudah mengirim keputusan lengkap, tetapi server harus menolak data yang tidak lengkap. |
| T2 | Penilaian | `compute_stage_rankings` hanya menghitung hakim dengan penugasan **dan** keanggotaan aktif. Admin bisa menonaktifkan hakim setelah ia memfinalisasi nilai, dan nilainya langsung hilang dari peringkat. Uji: 93 → kosong, tanpa alasan dan tanpa audit. | Tolak penonaktifan penugasan atau keanggotaan hakim yang punya lembar final di babak yang belum disahkan, kecuali lewat RPC dengan alasan dan audit. Nilai yang sudah final tetap dihitung. |
| T3 | Penilaian | `error_categories` dan `deduction_rules` bisa diubah kapan saja (uji: potongan diubah menjadi 0 untuk 7 kategori). Lembar yang difinalisasi sesudahnya dihitung dengan aturan berbeda dari lembar sebelumnya. | Kunci kategori dan aturan potongan yang sudah dipakai di lembar final, seperti `enforce_rubric_field_immutability` mengunci bidang rubrik. Perubahan harus lewat versi rubrik baru. |
| T4 | Undian | `draw_lottery_server` menolak seluruh undian bila ada **satu** peserta dalam cakupan yang belum Diverifikasi, termasuk yang berstatus Ditolak. Satu berkas yang ditolak membuat babak tidak bisa diundi sampai peserta itu dihapus. | Peserta Ditolak dikeluarkan dari cakupan. Blokir hanya bila masih ada yang berstatus Diajukan, dan tampilkan daftar namanya. |
| T5 | Kelulusan | `verify_participant` bisa mengubah status kapan saja, tetapi `compute_stage_rankings` dan `advance_stage_qualifiers` tidak memeriksa status verifikasi. Peserta yang ditolak di tengah lomba tetap masuk peringkat dan bisa menjadi juara. | Larang penolakan setelah penilaian dimulai, atau keluarkan peserta Ditolak dari peringkat dan catat sebagai diskualifikasi dengan alasan. |
| T7 | Operasional | Migrasi 20261114 berisi `UPDATE participants SET verification_status='Diverifikasi' WHERE verification_status='Diajukan'`. Migrasi di proyek ini dirancang bisa dijalankan ulang, dan tes memang menjalankannya ulang. Kalau dijalankan lagi di produksi, semua pendaftar baru otomatis terverifikasi. | Pindahkan backfill ke blok yang hanya berjalan saat kolom baru pertama kali dibuat, misalnya dengan mengecek `information_schema.columns` sebelum `ADD COLUMN`. |
| T8 | Penilaian | `compute_stage_rankings` bisa dipanggil semua anggota tenant, termasuk hakim. Sebelum pleno, hakim bisa melihat peringkat sementara dan rata-rata nilai per bidang dari hakim lain. | Batasi untuk admin saja, atau untuk hakim kembalikan hanya data miliknya sampai babak disahkan. |

T6 dibahas di bagian standar, karena menyangkut model penilaian.

### Sedang

| # | Masalah | Perbaikan |
| --- | --- | --- |
| S1 | Peserta yang seri di luar posisi kritis (misalnya peringkat 4 dan 5 di final) diberi peringkat berbeda di snapshot resmi berdasarkan nomor undian, karena `resolved_order` memakai `ROW_NUMBER()`. | Simpan peringkat bersama (`RANK()`) untuk seri yang tidak kritis, dan beri tanda "seri" di snapshot. |
| S2 | `rubric_version_id` lembar nilai dikirim oleh klien dan tidak dicocokkan dengan rubrik di aturan babak. Uji dengan rubrik draft hanya gagal karena kebetulan pemetaan kategorinya tidak cocok. | Saat INSERT, tetapkan `rubric_version_id` di server dari `competition_rule_configs` babak itu. |
| S3 | `is_assigned_judge` tidak memeriksa keanggotaan aktif. Hakim yang dinonaktifkan masih bisa mengisi dan memfinalisasi, tetapi nilainya diam-diam tidak dihitung. | Samakan syaratnya dengan `compute_stage_rankings` (keanggotaan `Aktif`). |
| S4 | Undian mode nomor tampil hanya mengubah `stage_participations.lottery_number`, sementara `participants.lottery_number` tetap. Hasil & Kelulusan menampilkan nomor dari `participants`, dan babak berikutnya kembali ke nomor lama. | Tentukan satu sumber nomor tampil per babak, lalu pakai konsisten di semua layar dan di `advance_stage_qualifiers`. |
| S5 | `draw_lottery_server` membaca babak tanpa `FOR UPDATE`. Dua undian yang berjalan bersamaan bisa saling menimpa `assigned_maqras`, dan `draw_version` bisa ganda. | Kunci baris babak (`SELECT ... FOR UPDATE`) di awal fungsi. |
| S6 | Hapus peserta dan hapus tenant di `supabaseDataService` berupa rangkaian `delete()` tanpa transaksi, dan error ditelan (`catch {}`). Kalau satu langkah gagal, data terhapus sebagian. Lembar nilai yang belum final juga ikut terhapus tanpa peringatan. | Pindahkan ke satu RPC transaksional. Tolak penghapusan bila ada lembar nilai apa pun. |
| S7 | Bobot bidang tidak dinormalisasi: nilai = Σ(nilai bidang × bobot). Dengan bobot ≠ 1, nilai bisa melebihi 100, padahal rencana awal memakai Σ/Σbobot. | Normalisasi dengan Σbobot, atau tegaskan di UI bahwa bobot adalah pengali. |
| S8 | Kuota, `champion_count`, dan isi soal (rentang ayat) bisa diubah kapan saja sebelum pengesahan tanpa jejak audit, termasuk soal yang sudah diundikan. | Catat perubahan ini di `audit_logs`. Kunci soal yang sudah punya `assigned_maqras` dengan penilaian. |

## Kejanggalan

Ini bukan bug yang langsung merusak hasil lomba, tetapi membuat sistem sulit dipercaya atau dioperasikan.

| # | Kejanggalan | Saran |
| --- | --- | --- |
| J1 | README hanya mendaftar migrasi sampai 20261113. Operator yang mengikuti README tidak akan menjalankan 20261114 dan 20261115. | Perbarui daftar migrasi di README. |
| J2 | Tes E2E Playwright sudah usang. Tes masih mencari teks "Gerbang Keamanan Produksi MTQ", tombol "Mode Simulasi Lokal", tab "Daftar Akun Baru", dan judul "Mode Pemantauan Penilaian Dewan Hakim", yang semuanya sudah diganti atau dihapus, sebagian oleh paket perbaikan saya sebelumnya. Langkah E2E di CI akan gagal. | Perbarui `tests/e2e/01` dan `02`, dan hapus tes pendaftaran mandiri. |
| J3 | Sebagian besar tes integrasi berjalan sebagai superuser PostgreSQL. Hanya sekitar 10 blok yang memakai `SET LOCAL ROLE authenticated`, sehingga RLS tidak teruji untuk operasi lewat data service. Inilah sebabnya K1 dan K4 lolos dari 92 tes. | Jalankan adapter tes sebagai `authenticated`, dan tambahkan tes negatif untuk setiap tabel yang memakai kebijakan admin `FOR ALL`. |
| J4 | Tes membaca semua file migrasi tetapi tidak menjalankan tiga di antaranya (20261110 ×2, 20261111). Saya menjalankan rantai lengkap sesuai urutan README di atas `schema.sql`: semuanya berhasil, dan tidak ada fungsi ganda (overload). | Jadikan rantai migrasi lengkap sebagai satu tes. |
| J5 | `SuperadminUsersView` masih menyarankan pengguna "Daftar Akun Baru", padahal pendaftaran mandiri sudah ditutup. | Ganti dengan petunjuk undangan oleh admin. |
| J6 | Pemetaan kategori ke bidang masih punya cadangan berdasarkan pencocokan nama (`ILIKE '%tajwid%'`, `'%lagu%'`), padahal pesan error-nya menyatakan "Dilarang fallback ke bidang lain". | Wajibkan `rubric_field_id` pada setiap kategori, lalu hapus cadangan heuristik ini. |
| J7 | Kepala tes menyebut "Pedoman Musabaqah 2025 & Juknis Nasional 2026", dan rubrik seed menyebut "Pedoman MTQ 2025" (Tajwid 30, Fashahah 30, Lagu 25, Suara 15), tetapi repo tidak mengutip sumber atau nomor dokumennya. | Simpan rujukan dokumen resmi (nomor SK atau juknis) di `official_source` dan di README. |

Catatan: tidak ada kunci rahasia, token, atau kata sandi di repo maupun di `docs/internal`.

## Ketidaksesuaian dengan standar MTQ

Pencarian web tidak aktif di sesi ini, jadi poin-poin berikut berdasarkan praktik umum penilaian MTQ yang saya ketahui, bukan dari dokumen resmi yang saya baca langsung. Setiap poin perlu dicocokkan dengan Pedoman/Juknis LPTQ yang Anda pakai.

### T6. Model nilai akhir

- **Praktik umum:** setiap bidang (mis. Tajwid, Fashahah, Suara, Lagu) dinilai oleh dewan hakim bidang itu. Nilai bidang adalah rata-rata hakim bidang tersebut, dan nilai akhir adalah jumlah nilai bidang.
- **Di sistem:** setiap lembar hakim memuat **semua** bidang. Bidang yang bukan tugasnya otomatis bernilai maksimal. Nilai akhir lalu dihitung sebagai rata-rata semua lembar dari semua hakim.
- **Akibatnya:**
  - Urutan peserta baru sama dengan cara standar kalau setiap bidang punya jumlah hakim yang sama. Kalau Tajwid punya 2 hakim dan Lagu 1, potongan Tajwid berbobot dua kali lipat.
  - Angka yang tampil (mis. 99,00 di situs live) tidak sama dengan jumlah nilai bidang, sehingga sulit dicocokkan dengan berita acara manual.
- **Saran:** hitung nilai per bidang hanya dari hakim yang ditugaskan di bidang itu (`judge_assignments.rubric_field_id`), lalu jumlahkan. Perbaikan ini sejalan dengan K3.

### Poin lain yang perlu dicocokkan

| Aspek | Kondisi di sistem | Yang perlu dicek di juknis |
| --- | --- | --- |
| Nilai maksimum bidang Seni Baca | Tajwid 30, Fashahah 30, Lagu 25, Suara 15 (seed) | Angka maksimum resmi per bidang dan namanya (mis. "Fashahah wal Adab") |
| Independensi hakim | Hakim bisa melihat peringkat dan rata-rata hakim lain sebelum pleno (T8) | Apakah hakim boleh melihat nilai hakim lain sebelum rapat pleno |
| Peringkat seri di luar podium | Diurutkan menurut nomor undian (S1) | Apakah peserta seri berbagi peringkat yang sama |
| Juara Harapan | Sengaja tidak ada (keputusan Anda) | Banyak MTQ memakai Harapan 1–3. Kalau event Anda tidak memakainya, tidak ada yang perlu diubah |
| Batas usia golongan | Sengaja tidak divalidasi (keputusan Anda) | Pastikan pemeriksaan usia dilakukan dan didokumentasikan di luar sistem |
| Penanganan nilai ekstrem | Semua lembar dirata-rata | Apakah juknis memakai aturan membuang nilai tertinggi/terendah |

## Cakupan & metode

Yang diaudit adalah commit `7ba46bb` di [repo GitHub](https://github.com/jabdtech2025-blip/mtq-management-system). Isinya identik dengan paket perbaikan saya sebelumnya, ditambah satu file catatan.

- **Pemeriksaan otomatis:** `tsc --noEmit` bersih, `npm test` 92/92 lulus, build berhasil. Tes E2E Playwright tidak bisa dijalankan di sini karena versi browser tidak cocok, jadi J2 ditemukan dengan mencocokkan teks yang dicari tes terhadap kode.
- **Uji eksploitasi:** saya memakai PGlite (PostgreSQL 16) dengan `schema.sql`, migrasi 20261114 dan 20261115, dan `seed.sql`. Setiap aksi dijalankan dengan `SET LOCAL ROLE authenticated` dan `request.jwt.claim.sub` milik admin atau hakim, sama seperti permintaan dari aplikasi lewat Supabase. Skrip ujinya ada di sesi kerja saya dan bisa saya jadikan tes regresi.
- **Kode yang dibaca:** `calculate_assessment_score_sql`, `finalize_judge_assessment`, `compute_stage_rankings`, `advance_stage_qualifiers`, `draw_lottery_server`, `verify_participant`, `is_assigned_judge`, kebijakan RLS dan trigger, `supabaseDataService` (simpan nilai, hapus peserta/tenant), serta konfigurasi CI.
- **Tidak dicek:** data dan konfigurasi Supabase produksi, termasuk apakah migrasi 20261114/20261115 sudah dijalankan dan apakah pendaftaran mandiri sudah dimatikan di dashboard.
