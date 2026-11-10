# Audit Model Data dan Aturan Bisnis — MTQ Management System

**Tanggal audit:** 27 Oktober 2026  
**Repositori:** [jabdtech2025-blip/mtq-management-system](https://github.com/jabdtech2025-blip/mtq-management-system)  
**Branch yang ditinjau:** `main`  
**Commit yang ditinjau:** [`70d8495aa2f1b50d17da9ce4fe4e6c110125a0a7`](https://github.com/jabdtech2025-blip/mtq-management-system/commit/70d8495aa2f1b50d17da9ce4fe4e6c110125a0a7)

## Ringkasan keputusan

**Status: belum siap dijadikan dasar migrasi backend final.** Sebagian besar entitas bisnis sudah tergambar, tetapi identitas relasi, rubrik penilaian, rumus skor, tie-break, dan aturan finalisasi belum cukup ketat untuk menjaga hasil resmi.

Audit ini adalah **review statis kode** dan perbandingan dengan pedoman resmi yang ditemukan. Saya tidak menjalankan `npm run lint`, `npm run build`, atau pengujian runtime; repositori yang ditinjau tidak menunjukkan folder/file test atau workflow CI yang ditemukan pada pemeriksaan ini.

## 1. Sumber aturan resmi yang digunakan

1. [LPTQ Jateng — Regulasi nasional](https://lptq.jatengprov.go.id/regulasi/) mencantumkan **Juknis MTQ Nasional XXXI Tahun 2026** dan **Buku Pedoman Musabaqah Al-Qur’an dan Al-Hadits 2025**.
2. [Juknis MTQ Nasional XXXI/2026 (PDF)](https://lptq.jatengprov.go.id/wp-content/uploads/2026/01/JUKNIS-MTQN-JATENG-2026.pdf): sistem umum adalah dua babak (penyisihan dan final), sedangkan MFQ dan KTIQ tiga babak. Jadwal penetapan maqra juga berbeda menurut cabang/golongan; contoh Tilawah Dewasa menentukan maqra penyisihan ketika peserta akan naik mimbar dan maqra final satu jam sebelum naik mimbar.
3. [Buku Pedoman MTQ 2025 (PDF, LPTQ Jateng)](https://lptq.jatengprov.go.id/wp-content/uploads/2025/11/2025-Buku-Pedoman-MTQ-25-April.pdf): untuk **Seni Baca Al-Qur’an**, rubrik bidang menyebut batas maksimal Tajwid 30, Fashahah 30, Lagu 25, dan Suara 15. Jika memakai pedoman ini, jumlah maksimum keempat bidang tersebut adalah 100; cara menilai setiap bidang tetap mengikuti lembar rubriknya masing-masing.
4. Buku pedoman yang sama menyatakan penentuan finalis/kejuaraan berdasarkan jumlah nilai tertinggi; jika sama, bandingkan nilai Tajwid, kemudian Lagu, kemudian Fashahah; jika masih sama, diadakan penampilan ulang.

**Batas penerapan:** sumber di atas relevan sebagai acuan nasional yang tersedia saat audit, tetapi tidak otomatis menjadi aturan untuk setiap tingkat, penyelenggara, cabang, golongan, atau edisi. Sebelum skema rubrik dikunci, panitia perlu menyatakan dokumen resmi mana yang berlaku untuk MTQ yang akan dikelola aplikasi.

## 2. Temuan model data saat ini

Referensi kode utama: [`src/types/mtq.ts`](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/types/mtq.ts) dan [`src/context/MtqContext.tsx`](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/context/MtqContext.tsx).

### P0 — Identitas babak dan cabang belum menjadi kunci relasi yang konsisten

- `Participant` menyimpan `stageName`, `questionId`, `assignedMaqra`, `assignedQuestions`, dan `questionIds`.
- `StageParticipation` juga menyimpan `stageId`, `stageName`, `questionId`, `assignedMaqra`, dan `assignedQuestions`.
- `Question` menyimpan `stageName` dan `branchAndLevel` dalam teks bebas; `Participant` menggunakan `branchName` dan `levelName` sebagai teks; `JudgeAssignment` menggunakan `stageName`/`branchName` meski memiliki `stageId` opsional.
- `getParticipantStageQuestions`, `getParticipantProgress`, dan `advanceQualifiers` banyak mencari data memakai nama babak, bukan ID stabil. `advanceQualifiers` mengelompokkan seluruh `StageParticipation` berdasarkan tenant + `stageName`, sehingga peserta dari beberapa cabang yang sama-sama mempunyai babak “Penyisihan” dapat masuk ke satu himpunan peringkat.

**Keputusan:** jadikan `stage_id`, `branch_id`/`category_id`, dan `level_id` relasi utama. Nama hanyalah label yang bisa diubah. Untuk setiap cabang/golongan, babak dan kuota kelulusan harus dikonfigurasi pada lingkup yang tepat.

### P1 — Satu penetapan maqra memiliki beberapa sumber kebenaran

Maqra disalin ke `Participant.assignedQuestions`, `StageParticipation.assignedQuestions`, serta `Question.assignedToParticipantId`/`assignedToParticipantIds`. `questionId` tunggal masih dipertahankan sebagai kompatibilitas, sementara `assignedQuestions` memuat banyak maqra. Ini membuka kemungkinan data tidak sinkron saat ditambah, dihapus, dipindah babak, atau peserta diloloskan.

**Keputusan:** buat tabel relasi satu baris per maqra yang ditetapkan kepada satu keikutsertaan babak. Hindari menyimpan array ID dan status penetapan yang sama di banyak entitas. Snapshot ayat/halaman boleh disimpan untuk menjaga riwayat, tetapi harus jelas mana data master dan mana snapshot historis.

### P1 — Relasi penilaian belum wajib lengkap

`JudgeAssessment.questionId` bersifat opsional walau penilaian multi-maqra memerlukan identitas maqra yang wajib. `stageParticipationId` dan `stageId` diwajibkan bersamaan dengan `stageName`, dan identitas hakim/bidang juga disalin sebagai teks (`judgeName`, `judgeField`).

**Keputusan:** `assessment` harus terkait ke `stage_participation_id`, `assigned_maqra_id`, `judge_assignment_id` atau identitas penugasan yang setara, dan `rubric_version_id`. Simpan teks nama sebagai snapshot hanya bila diperlukan untuk arsip/ekspor, bukan sebagai kunci relasi.

### P1 — Rubrik tidak cukup terstruktur

`ErrorCategory` saat ini hanya memuat `defaultDeduction`, `methodType`, `scope`, dan status. Belum ada struktur versi rubrik, bidang nilai, kriteria, nilai maksimum/minimum, kelas kesalahan dan tarif per kelas, maupun aturan bobot per kriteria. `rubricVersion` di `JudgeAssessment` juga opsional.

**Keputusan:** rubrik harus berversi dan tidak berubah setelah digunakan pada penilaian final. Pisahkan rubric, bidang, kriteria, jenis kesalahan, tarif pengurangan, dan batas skor. Penilaian final menyimpan versi rubrik yang dipakai.

### P1 — Keikutsertaan babak dan hasil akhir bercampur

`Participant.status` memakai `Menunggu | Berlangsung | Final`, dan `finalizeAssessment` dapat mengubah status peserta menjadi `Final` setelah seluruh hakim menyelesaikan satu babak. Status finalisasi satu penilaian, kelengkapan nilai satu babak, dan kejuaraan akhir adalah tiga konsep berbeda.

**Keputusan:** pisahkan status `assessment`, `stage_participation`, `stage`, dan `competition_result`. Jangan menggunakan status peserta `Final` untuk menyatakan penilaian satu babak lengkap.

## 3. Audit rumus penilaian

Kode helper `calculateScore` berada di [`src/data/mockData.ts`](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/data/mockData.ts). Secara ringkas, helper menghitung:

```text
potongan_kategori = jumlah_kesalahan × defaultDeduction
total_potongan = jumlah seluruh potongan
nilai_akhir = max(0, nilai_awal_100 − total_potongan)
```

Helper tersebut juga:
- menggunakan `defaultDeduction` yang sama untuk semua kejadian pada kategori;
- tidak menerapkan cabang hitung yang berbeda untuk `methodType` (tetap/berbobot);
- tidak memfilter kategori nonaktif pada saat iterasi kalkulasi;
- tidak merepresentasikan skor terpisah per bidang hakim;
- membatasi nilai bawah pada 0, tetapi tidak membatasi tiap bidang ke maksimum yang ditetapkan rubrik.

### Penilaian terhadap Seni Baca Al-Qur’an

Jika penyelenggara memang memakai rubrik Seni Baca pada Buku Pedoman MTQ 2025 yang dirujuk, susunan bidangnya adalah:

| Bidang | Nilai maksimum |
|---|---:|
| Tajwid | 30 |
| Fashahah | 30 |
| Lagu | 25 |
| Suara | 15 |
| **Total maksimum** | **100** |

Angka maksimum bidang ini bersumber dari buku pedoman resmi; **bukan** berarti semua kategori dapat dihitung dengan `100 - jumlah semua kesalahan` secara bebas. Setiap bidang memiliki kriteria dan cara menilai tersendiri. Daftar kategori awal aplikasi (`Makharijul Huruf`, `Idgham & Ghunnah`, `Fasahah & Ahkamul Waqf`, `Tajwid & Ahkamul Madd`, `Lagu, Suara & Irama`) juga tidak merepresentasikan secara langsung empat bidang dan kriteria pada lembar resmi.

**Rekomendasi:** jangan mengunci satu formula universal di `calculateScore`. Implementasikan kalkulator berdasarkan `rubric_version` dan `rubric_criteria`, lalu konfigurasi rubrik sesuai cabang/golongan/tingkat/edisi. Jangan membuat formula untuk cabang lain berdasarkan dugaan dari lembar Seni Baca.

## 4. Penghitungan nilai dan kualifikasi

### Ketidakkonsistenan saat ini

1. `HasilKelulusanView` memilih penilaian berdasarkan hakim dalam `stageJudges`; fungsi `advanceQualifiers` menghitung snapshot nilai dengan mengumpulkan semua assessment final berdasarkan tenant, peserta, babak, dan maqra tanpa membatasi ke daftar hakim wajib. Karena itu nilai ranking yang terlihat dan snapshot pengesahan dapat berbeda.
2. `advanceQualifiers` mengurutkan berdasarkan skor saja. Jika skor sama, peserta tetap mendapat rank berdasarkan urutan input; tidak ada penerapan tie-break resmi pada fungsi pengurutan.
3. `hasBoundaryTie` hanya memeriksa seri di sekitar batas kuota Top-N, bukan semua posisi podium atau keputusan lain yang memerlukan tie-break. Nilai seri juga tidak otomatis mempunyai hasil putusan terstruktur.
4. `qualificationMethod: 'top_n' | 'manual'` sudah ada pada tipe `CompetitionStage`, tetapi alur UI terutama menentukan peserta lolos menurut Top-N dan override manual. Mode `manual` belum menjadi alur keputusan yang eksplisit dan tervalidasi.
5. Kuota kelulusan dan struktur babak di data contoh tidak boleh dianggap universal. Juknis Nasional 2026 menyebut mayoritas cabang dua babak, sedangkan MFQ dan KTIQ tiga babak; kuota dan susunan tahap harus mengikuti aturan cabang/golongan untuk edisi penyelenggara.

### Kebijakan yang disarankan

- Hanya skor dari seluruh penilaian wajib yang sudah final dan valid yang boleh menentukan nilai resmi.
- Hitung skor dan peringkat menggunakan satu fungsi domain yang sama baik untuk preview, rekap, maupun pengesahan.
- Simpan snapshot resmi: skor per bidang, total, urutan peringkat, aturan tie-break yang digunakan, keputusan sidang/override beserta alasan, siapa yang mengesahkan, dan waktu pengesahan.
- Aturan finalis/kuota harus konfigurabel per cabang/golongan dan babak.
- Jika nilai sama, jalankan tie-break berdasarkan aturan yang melekat pada versi regulasi event; sistem tidak boleh memecah seri secara implisit karena urutan array.

### Tie-break: aturan yang ditemukan

Untuk Seni Baca Al-Qur’an pada Buku Pedoman MTQ 2025 yang diperiksa: urutkan dari jumlah nilai tertinggi; jika sama, bandingkan nilai bidang **Tajwid**, kemudian **Lagu**, kemudian **Fashahah**; jika masih sama, dilakukan penampilan ulang. Terapkan ini hanya bila dokumen tersebut yang berlaku bagi event. Untuk cabang/golongan lain perlu mengambil ketentuan tie-break yang sesuai; jangan menggunakannya secara universal.

## 5. Penguncian nilai dan otorisasi

### Risiko implementasi sekarang

`updateErrorCount`, `saveAnnotations`, dan `finalizeAssessment` memeriksa `currentUser.role === 'judge'`, tetapi fungsi konteks tidak memastikan bahwa `judgeId` yang dikirim sama dengan identitas hakim yang masuk dan ditugaskan pada cabang/babak/bidang itu. Ini hanya proteksi di frontend/state, bukan otorisasi server. Selain itu, `finalizeAssessment` dapat membuat assessment baru berstatus final dengan nilai 100 ketika belum ada assessment sebelumnya; tindakan “finalisasi” dengan demikian bisa menghasilkan nilai penuh tanpa bukti bahwa lembar telah diisi dan ditinjau.

### Kebijakan yang direkomendasikan

1. **Draft:** penilaian dapat disimpan otomatis selama hakim yang bersangkutan memiliki penugasan yang sah.
2. **Finalisasi individu:** hakim finalisasi lembar untuk maqra/bidang yang ditugaskan setelah validasi kelengkapan; sistem mencatat aktor dan waktu. Lembar tidak dapat diedit lagi setelah final.
3. **Koreksi setelah final:** tidak ada overwrite diam-diam. Perubahan harus melalui pembukaan kembali oleh peran berwenang, alasan wajib, pencatatan nilai sebelum/sesudah, aktor, dan timestamp pada audit log.
4. **Pengesahan babak:** tindakan berbeda dari finalisasi lembar individu. Hanya boleh dilakukan setelah seluruh lembar wajib final, konflik/seri telah diputuskan, dan peringkat resmi sudah dihitung.
5. **Setelah babak disahkan:** bekukan paket maqra, daftar penugasan yang dipakai, versi rubrik, nilai, peringkat, dan daftar peserta lolos. Membuka kembali babak wajib lewat proses berizin dan diaudit.
6. **Otorisasi harus di database/server:** jangan bergantung pada tombol yang disembunyikan atau pemeriksaan role React. Periksa actor, tenant, assignment, tahap, bidang, status final, dan hak reopen pada setiap transaksi.

## 6. Alur undian maqra

`commitLotteryDrawResults` memvalidasi bahwa peserta ada dan soal aktif, tetapi validasi server/domain perlu mencakup juga:

- peserta berada pada cabang/golongan serta babak yang dimaksud;
- soal cocok dengan cabang/golongan/babak dan jenis seleksi yang berlaku;
- jumlah hasil per peserta tepat sama dengan jumlah yang diminta;
- tidak ada soal duplikat untuk peserta-babak;
- aturan penggunaan ulang soal antar peserta dipatuhi sesuai regulasi event;
- seluruh batch lolos pemeriksaan sebelum ada perubahan data.

Catatan penting dari Juknis Nasional 2026: waktu penetapan maqra berbeda antara cabang/golongan dan babak. Oleh sebab itu model sebaiknya memiliki konfigurasi kebijakan/trigger penetapan maqra per tahap, bukan hanya label generik `stageName`.

## 7. Struktur data target untuk Supabase

Ini rancangan konseptual, bukan SQL final.

- `competitions`/`tenants`: event, edisi, tingkat, penyelenggara, regulasi aktif.
- `profiles` + `tenant_memberships`: identitas Auth, tenant, peran dan status keanggotaan.
- `kafilahs`, `participants`: data induk; kode peserta dan nomor undian mempunyai unique constraint sesuai scope yang ditetapkan panitia.
- `branches`/`categories`, `levels`, `stages`: master data ber-ID. Stage terkait ke cabang/golongan serta memiliki urutan, jenis babak, kuota, metode kelulusan, konfigurasi maqra dan status finalisasi.
- `stage_participations`: unique `(participant_id, stage_id)`; data keikutsertaan peserta per babak.
- `questions` atau `maqra_packages` + `assigned_maqras`: satu baris per maqra yang diberikan kepada satu keikutsertaan babak, dengan metode, aktor, timestamp, dan snapshot ayat/halaman jika diperlukan.
- `judge_assignments`: stage, cabang/golongan, bidang rubrik, hakim dan status penugasan; constraint mencegah duplikasi penugasan yang tidak diinginkan.
- `rubric_versions`, `rubric_fields`, `rubric_criteria`, `rubric_deduction_rules`: rubrik tidak berubah setelah direferensikan nilai final.
- `assessments` + `assessment_criterion_values`/`assessment_errors`: penilaian per penugasan hakim dan maqra, versi rubrik, skor tiap bidang/kriteria, status, finalisasi dan aktor.
- `stage_result_snapshots`/`competition_results`: hasil yang sudah ditetapkan, termasuk skor final, rank, tie-break, alasan putusan, dan waktu.
- `audit_logs`: catatan append-only untuk penetapan soal, perubahan rubrik, finalisasi, reopen, koreksi, kelulusan dan pengesahan.

Gunakan foreign key, unique constraint, check constraint, transaksi/SQL function untuk operasi kritis dan RLS. Jangan percaya nilai total/rank yang dikirim frontend sebagai hasil otoritatif.

## 8. Urutan pekerjaan sebelum implementasi

1. Konfirmasi dokumen regulasi yang benar-benar berlaku bagi MTQ target: tingkat penyelenggara, edisi, cabang, golongan, tahap, form nilai, tie-break dan kuota.
2. Setujui model relasi menggunakan ID, rubrik berversi, dan sumber kebenaran tunggal untuk penetapan maqra.
3. Tulis aturan bisnis sebagai spesifikasi yang bisa diuji: rumus skor per rubrik, kelengkapan hakim, tie-break, finalisasi, reopen, undian, dan kelulusan.
4. Turunkan spesifikasi itu ke ERD dan migrasi SQL Supabase, lalu buat seed data uji.
5. Buat tes otomatis untuk nilai, tie-break, multi-maqra, lintas cabang, transaksi undian, finalisasi/reopen, dan isolasi tenant sebelum migrasi seluruh frontend.

## Referensi kode utama

- [Tipe data (`src/types/mtq.ts`)](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/types/mtq.ts)
- [Context/data access dan aturan bisnis (`src/context/MtqContext.tsx`)](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/context/MtqContext.tsx)
- [Data contoh dan `calculateScore` (`src/data/mockData.ts`)](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/data/mockData.ts)
- [Perhitungan peringkat/kelulusan (`HasilKelulusanView.tsx`)](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/components/stages/HasilKelulusanView.tsx)
- [Rekap nilai (`RekapNilaiView.tsx`)](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/components/rekap/RekapNilaiView.tsx)
- [Tipe penilaian hakim (`PenilaianDualPanelView.tsx`)](https://github.com/jabdtech2025-blip/mtq-management-system/blob/main/src/components/penilaian/PenilaianDualPanelView.tsx)
