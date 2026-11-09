# Pembenahan Integritas Multi-Cabang & Otoritas Hasil MTQ Management System

Rencana ini menuntaskan seluruh temuan kritis (P0), prioritas tinggi (P1), reliabilitas penyimpanan database/Outbox, serta cakupan pengujian otomatis dari laporan Audit Lanjutan agar sistem siap dan sah digunakan untuk pengesahan hasil musabaqah multi-cabang.

## User Review & Critical Decisions

> [!IMPORTANT]
> Ketiga keputusan arsitektur berikut telah dikonfirmasi bersama pengguna dan menjadi landasan utama eksekusi:

- **Confirmed Decision 1 — Mode "Semua Cabang" pada Hasil Babak & Kelulusan (P0-01 & P0-02)**: Saat memilih *Semua Cabang*, sistem mengelompokkan dan mengevaluasi tabel peringkat secara terpisah per cabang lomba (`branchId`), masing-masing dengan dewan hakim, rubrik, aturan tie-break, dan kuota cabangnya sendiri. Tindakan pengesahan hasil babak dan pelolosan peserta wajib dieksekusi per cabang dan per ID babak (`stageId` + `branchId` → `nextStageId`).
- **Confirmed Decision 2 — Satu Sumber Kebenaran Kuota Kelulusan (P1-04)**: Kuota kelulusan resmi ditetapkan secara terpusat pada **Manajemen Babak** per cabang (`qualificationQuota`). Konfigurasi Aturan Cabang menyinkronkan dan membaca nilai kuota langsung dari konfigurasi babak terkait, serta mesin evaluasi memblokir pengesahan apabila jumlah peserta yang diloloskan melalui *manual override* melebihi kuota babak.
- **Confirmed Decision 3 — Perubahan Rubrik & Aturan Saat Penilaian Berjalan (P1-07)**: Administrator diizinkan mengubah rubrik aktif atau aturan cabang dengan dialog peringatan konfirmasi eksplisit. Ketika dikonfirmasi, sistem secara otomatis menghitung ulang (*recalculate*) seluruh lembar penilaian yang terdampak agar versi rubrik dan skor bidang tetap konsisten 100% antara lembar penilaian, rekap, dan snapshot pengesahan babak.

---

## 1. Overview & Core Concept

- **What It Does**: Memperkuat integritas relasional di seluruh siklus operasional musabaqah—mulai dari pendaftaran dan import peserta, undian dan penetapan maqra, penilaian dewan hakim, pemeringkatan dan *tie-break* multi-cabang, hingga transaksi pengesahan babak dan kejuaraan di server PostgreSQL.
- **Target Audience / Persona**: Superadmin, Administrator Panitia MTQ, dan Majelis Dewan Hakim yang mengelola musabaqah dengan banyak cabang, golongan/jenjang, dan babak secara paralel.
- **Key Value**: Menjamin bahwa setiap peserta hanya dinilai dengan maqra yang sah untuk cabang, jenjang, dan babaknya; perhitungan pengurangan nilai di layar hakim identik dengan mesin penilaian resmi; peringkat antar cabang tidak pernah tercampur; serta keputusan tie-break dan kualifikasi dihitung secara otoritatif baik di aplikasi maupun di server database.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Hasil Babak & Kelulusan Multi-Cabang**: Ketika filter cabang berada pada *Semua Cabang*, antarmuka menampilkan kartu dan tabel pemeringkatan yang dikelompokkan per cabang lomba secara mandiri. Untuk melakukan finalisasi/pengesahan babak, tombol aksi mengarahkan atau mengeksekusi pengesahan secara spesifik per grup `(stageId, branchId)` menuju `nextStageId` pada cabang yang sama.
  2. **Undian & Penetapan Maqra Ketat**: Baik saat undian otomatis, penetapan manual, maupun *commit* hasil undian, sistem memvalidasi kecocokan tiga dimensi (`branchId`, `levelId`, dan `stageId`/`stageName`) serta menolak soal dari jenjang atau cabang berbeda dengan pesan kesalahan yang jelas.
  3. **Penilaian Dewan Hakim Presisi**: Panel penilaian hakim hanya menampilkan kategori kesalahan yang berstatus **Aktif** untuk cabang/rubrik terkait, dan menampilkan angka pengurangan poin langsung dari hasil kalkulasi mesin penilaian resmi (termasuk aturan *DeductionRule* dan batas *maxDeduction*).
  4. **Import Excel & Undian Transaksional**: Proses import peserta/bank soal dan penyimpanan hasil undian menunggu (*await*) penyelesaian operasi database sebelum menampilkan ringkasan akhir: jumlah baris valid, berhasil disimpan ke database, dan daftar rinci baris yang gagal disimpan.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian Enterprise SaaS Dashboard yang bersih, berwibawa, dan fokus pada keterbacaan data tabel berdensitas tinggi.
  - *Color Palette & Mood*: Kanvas netral terang (`#F8FAFC` / `#FFFFFF`), permukaan struktural dengan garis batas halus `1px` (`#E2E8F0`), serta aksen hijau zamrud (`#047857`) untuk aksi pengesahan utama, kuning amber (`#D97706`) untuk status penilaian berjalan/peringatan, dan merah (`#DC2626`) untuk pelanggaran validasi atau *boundary tie*.
  - *Typography & Hierarchy*: Pasangan font geometris dan humanis yang tegas (`Plus Jakarta Sans` untuk judul/navigasi dan `DM Sans` untuk teks tabel), dipadukan dengan `JetBrains Mono` (`tabular-nums`) untuk seluruh skor desimal, nomor undian, kuota, dan peringkat agar sejajar vertikal.
  - *Component Styling & Layout*: Satu tingkat elevasi kartu (*single-elevation depth*), tanpa *nested cards* berlebih, serta pemisahan metadata menggunakan pemisah tipografis bersih (`·`).
- **Interactive Feedback & Motion**: Indikator proses simpan database nyata saat *commit* undian dan import batch, modal konfirmasi *recalculate* saat Admin memperbarui rubrik/aturan yang sedang digunakan, serta umpan balik instan $\le 200\text{ms}$ pada kontrol filter babak dan cabang.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Isolasi Evaluasi Ranking Berbasis Grup Cabang (`branchId`)**:
  - *Chosen Approach*: Memisahkan evaluasi `RankingService` per `(stageId, branchId)`. Saat pengguna melihat *Semua Cabang*, sistem menjalankan evaluasi independen untuk setiap cabang yang memiliki peserta pada babak tersebut dan merender bagian hasil per cabang.
  - *Why*: Mencegah digunakannya daftar hakim, rubrik, atau aturan *tie-break* cabang pertama terhadap peserta dari cabang lain.
  - *Alternatives Considered*: Menghapus opsi *Semua Cabang* sepenuhnya; tidak dipilih agar panitia tetap memiliki pandangan ringkas seluruh cabang dalam satu layar.
- **Decision 2 — Pencocokan Penilaian Relasional Tanpa Fallback Lintas Maqra**:
  - *Chosen Approach*: Menghapus fallback pencocokan penilaian yang mengabaikan `questionId` / `assignedMaqraId` atau `stageParticipationId`. Lembar penilaian hanya dihitung sah apabila terikat pada peserta, hakim, partisipasi babak, dan maqra yang ditugaskan pada babak tersebut.
  - *Why*: Mencegah nilai dari maqra lama atau babak sebelumnya terbaca sebagai nilai final pada maqra baru.
  - *Alternatives Considered*: Mempertahankan fallback longgar untuk kompatibilitas data lama; ditolak karena berisiko tinggi memalsukan status kelengkapan penilaian.
- **Decision 3 — Tie-Break & Validasi Override Otoritatif di Server PostgreSQL**:
  - *Chosen Approach*: Memperbarui fungsi RPC `advance_stage_qualifiers` di PostgreSQL agar menghitung sendiri rata-rata nilai per bidang (`field_scores`) dari tabel `judge_assessments`, mengurutkan peringkat sesuai `tie_break_order` cabang di server tanpa bergantung pada `client_tie_break_rank`, serta mewajibkan alasan minimal 5 karakter baik untuk peserta yang diloloskan di luar kuota maupun peserta dalam kuota yang digugurkan secara manual.
  - *Why*: Menjamin hasil kejuaraan yang disahkan di database 100% otoritatif dan tidak dapat dimanipulasi dari sisi browser.
- **Decision 4 — Penyimpanan Transaksional (`await`) & Processor Outbox Terintegrasi**:
  - *Chosen Approach*: Mengubah `importParticipantsBatch`, `importQuestionsBatch`, `updateParticipant`, dan `commitLotteryDrawResults` agar menunggu konfirmasi penyimpanan Supabase secara nyata, serta mendaftarkan `OutboxProcessor` aktif di `MtqContext` dengan payload penilaian lengkap.
  - *Why*: Menghilangkan *false success* pada operasi kritikal dan memastikan antrean *offline outbox* benar-benar dapat dipulihkan saat koneksi kembali aktif.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION & WORKFLOW LAYER                        │
├───────────────────────┬──────────────────────────┬──────────────────────────┤
│  MasterData & Import  │   BankSoal & Penilaian   │  Rekap & HasilKelulusan  │
│  - Kuota Babak Tunggal│   - Validasi 3D Maqra    │  - Grup Evaluasi/Cabang  │
│  - Modal Recalculate  │   - Filter Kategori Aktif│  - Pemilih stageId Unik  │
│  - Laporan Batch DB   │   - Kalkulasi Poin Resmi │  - Map Override Murni    │
└───────────┬───────────┴────────────┬─────────────┴─────────────┬────────────┘
            │                        │                           │
            ▼                        ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DOMAIN & STATE ORCHESTRATION LAYER                      │
├────────────────────────────────────┬────────────────────────────────────────┤
│       Scoring & Ranking Engine     │        Context & Outbox Manager        │
│  - Relasi Ketat Assessment-Maqra   │  - Sinkronisasi Penuh Participant->SP  │
│  - Evaluasi Terisolasi per Cabang  │  - Await DB pada Import & Undian       │
│  - Validasi Batas Kuota & Override │  - OutboxProcessor Terdaftar & Aktif   │
└────────────────────────────────────┴───────────────────┬────────────────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   AUTHORITATIVE POSTGRESQL / SUPABASE LAYER                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  - RPC advance_stage_qualifiers: Hitung Skor Total + Rata-Rata Bidang +     │
│    Urutan Tie-Break Cabang + Validasi Override Dua Arah (Lolos & Gugur)     │
│  - RLS & Trigger Imutabilitas Babak, Penugasan Hakim, dan Audit Log         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Identitas Babak & Cabang (`stageId` + `branchId`)**: Setiap objek babak dan partisipasi babak diidentifikasi secara unik menggunakan pasangan `stageId` dan `branchId`. Pemilihan babak berikutnya (`nextStage`) difilter secara ketat untuk cabang yang sama (`s.branchId === currentStage.branchId`) dengan urutan `order` lebih tinggi.
- **Validasi Penetapan Maqra Terpusat (`validateMaqraAssignmentForParticipant`)**: Fungsi validator tunggal memeriksa kesesuaian:
  1. Status soal wajib `Aktif`.
  2. Kecocokan cabang (`question.branchId === participant.branchId` atau nama cabang setara).
  3. Kecocokan jenjang/golongan (`question.levelId === participant.levelId` atau nama jenjang setara).
  4. Kecocokan babak (`question.stageId === targetStageId` atau nama babak setara).
  5. Pencegahan duplikasi soal pada peserta yang sama.
- **Sinkronisasi Penuh `Participant` ↔ `StageParticipation`**: Saat `updateParticipant` atau import memperbarui cabang, jenjang, nomor undian, atau babak peserta, seluruh atribut relasional (`stageId`, `stageName`, `branchId`, `branchName`, `lotteryNumber`) pada `StageParticipation` babak aktif disinkronkan secara utuh disertai validasi anti-duplikasi nomor undian.

### Interactive Component & State Mapping

1. **Perhitungan Ulang Saat Perubahan Rubrik/Aturan (P1-07)**:
   - Ketika Admin mengubah versi rubrik aktif atau aturan cabang pada cabang yang sudah memiliki penilaian, sistem menampilkan konfirmasi peringatan dan menjalankan perhitungan ulang (`calculateScoreWithRubric`) terhadap seluruh lembar penilaian pada cabang tersebut, lalu menyinkronkan pembaruan ke state dan database secara terbatas pada `currentTenantId`.
2. **Kalkulasi Kategori Kesalahan di Panel Hakim (P1-03)**:
   - Daftar kategori kesalahan di `PenilaianDualPanelView` difilter hanya untuk `cat.status === 'Aktif'`. Besaran poin pengurangan per kategori dan per bidang yang ditampilkan kepada hakim diambil langsung dari objek `ScoreCalculationResult.deductions` dan `fieldDeductions` yang dihasilkan oleh `calculateScoreWithRubric`.
3. **Pemetaan Manual Override Murni & Kuota Terpusat (P1-04 & P1-05)**:
   - `HasilKelulusanView` meneruskan objek parameter lengkap `{ currentStageId, nextStageId, branchId, branchName, qualifiedParticipantIds, manualOverrides, overrideReasons }` ke `advanceQualifiers`.
   - Hanya peserta yang benar-benar di-override oleh Admin yang masuk ke dalam `manualOverrides`, dan `RankingService` menolak pengesahan (`canFinalize = false`) apabila jumlah peserta lolos melebihi `qualificationQuota` babak atau apabila ada peserta yang diloloskan/digugurkan secara manual tanpa alasan minimal 5 karakter.
4. **Penyelesaian Outbox & Pengujian Otomatis (Tahap 4 & 5)**:
   - `MtqContext` mendaftarkan `outboxSyncService.registerProcessor(...)` untuk memproses ulang operasi `UPSERT_ASSESSMENT_DRAFT`, `UPSERT_PARTICIPANT`, `UPSERT_QUESTION`, dan `COMMIT_LOTTERY_DRAW` dengan payload lengkap.
   - Menambahkan cakupan pengujian multi-cabang dengan nama babak identik, validasi maqra lintas jenjang, otoritas tie-break server, serta skenario E2E siklus penuh dari pembuatan babak hingga pengesahan juara.
