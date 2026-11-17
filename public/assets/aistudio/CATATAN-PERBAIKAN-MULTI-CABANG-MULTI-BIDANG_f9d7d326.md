# Catatan Perbaikan: Multi-Cabang & Hakim Multi-Bidang

Dasar: GitHub `origin/main` commit `f0c94ff`. Zip `mtq-multi-cabang-multi-bidang.zip` berisi **18 berkas** dan sudah menggabungkan perbaikan multi-cabang sebelumnya dengan perbaikan hakim multi-bidang. Zip lama (`mtq-multi-cabang.zip`) tidak perlu dipakai lagi.

---

## 1. Urutan pemasangan

1. **Salin 18 berkas** dari zip ke repositori (3 berkas baru, sisanya menimpa). Struktur folder sama dengan repositori.
2. **Jalankan migrasi di Supabase** → SQL Editor → tempel isi `supabase/migrations/20261120_multi_branch_integrity.sql` → Run.
   - Aman dijalankan berulang dan tidak mengubah data.
   - Bila `20261119_realtime_and_site_content.sql` belum pernah dijalankan, jalankan itu dulu.
   - Bila versi lama migrasi 20261120 sudah sempat Anda jalankan, jalankan lagi versi baru ini; isinya menimpa.
3. **Periksa data** dengan kueri di bagian 6 sebelum acara.
4. Deploy.

---

## 2. Daftar berkas

| Berkas | Status | Isi |
|---|---|---|
| `src/services/stageResolver.ts` | baru | Pencarian babak per cabang |
| `src/tests/multiBranch.test.ts` | baru | 13 uji multi-cabang dan multi-bidang |
| `supabase/migrations/20261120_multi_branch_integrity.sql` | baru | Penjaga server dan fungsi peringkat baru |
| `src/context/MtqContext.tsx` | diubah | Babak per cabang; validasi kategori hakim multi-bidang |
| `src/services/scoringEngine.ts` | diubah | Cakupan bidang hakim; rata-rata per bidang; kategori rubrik lain dilewati |
| `src/services/rankingService.ts` | diubah | Peringkat memakai rata-rata per bidang; blokir bidang tanpa hakim; abaikan peserta Ditolak |
| `src/services/completion.ts` | diubah | Kode blokir baru `FIELD_WITHOUT_JUDGE` |
| `src/components/masterData/MasterDataView.tsx` | diubah | Formulir penugasan hakim baru (lihat 3.2) |
| `src/components/penilaian/PenilaianDualPanelView.tsx` | diubah | Lembar hakim menampilkan bidang tugas; kategori sesuai bidang |
| `src/components/penilaian/PenilaianHakimListView.tsx` | diubah | Daftar peserta hakim dicocokkan per cabang secara persis |
| `src/components/kafilah/KafilahPesertaView.tsx` | diubah | Formulir peserta memakai babak cabangnya |
| `src/components/rekap/RekapNilaiView.tsx` | diubah | Saringan cabang |
| `src/data/mockData.ts` | diubah | Data Demo: Hj. Siti Maria memegang dua bidang (Lagu + Suara) |
| `src/tests/runAllTests.ts`, `domainRules.test.ts`, `supabaseRules.test.ts` | diubah | Uji baru; data uji lama disesuaikan (lihat 5) |
| `supabase/schema.sql` | diubah | Memuat migrasi 20261119 dan 20261120 |
| `supabase/seed.sql` | diubah | Kategori kesalahan rubrik Tahfizh |

---

## 3. Hakim multi-bidang

### 3.1 Aturannya

Seorang hakim di satu babak bisa memegang:

- **satu bidang** (mis. Tajwid),
- **beberapa bidang** (mis. Lagu + Suara), atau
- **semua bidang** (penugasan "Semua bidang").

Hakim mengisi **satu lembar** per peserta per maqra, mencakup semua bidang yang dipegangnya. Ia hanya bisa memotong kategori dari bidangnya; potongan di luar bidang ditolak, baik di layar maupun di server (`JUDGE_FIELD_VIOLATION`).

### 3.2 Formulir penugasan (Master Data → Penugasan Hakim)

- Pilih **cabang lebih dulu**. Pilihan babak hanya menampilkan babak milik cabang itu.
- Bidang ditampilkan dari **rubrik resmi cabang** itu, sebagai kotak centang.
- Centang satu atau beberapa bidang, atau centang **Semua bidang**.
- Satu baris penugasan dibuat untuk setiap bidang yang dicentang. Bidang yang sudah dipegang hakim itu ditandai "sudah" dan tidak bisa dipilih lagi.

### 3.3 Cara nilai dihitung (perubahan penting)

**Sebelumnya:** nilai peserta = rata-rata nilai akhir semua lembar. Lembar hakim Lagu otomatis bernilai penuh di Tajwid, jadi potongan hakim Tajwid ikut "diencerkan".

**Sekarang:** nilai tiap bidang = rata-rata **hanya dari hakim yang memegang bidang itu**. Total = jumlah nilai bidang × bobotnya, sama dengan cara lembar hakim dihitung.

Contoh dari uji (Hakim A = Tajwid + Fashahah, Hakim B = Lagu + Suara, Hakim C = Tajwid):

| Bidang | Dihitung dari | Nilai |
|---|---|---|
| Tajwid | A (28) dan C (26) | 27,00 |
| Fashahah | A saja | 29,00 |
| Lagu | B saja | 24,00 |
| Suara | B saja | 14,50 |
| **Total** | | **94,50** |

Cara lama menghasilkan 97,17. Server dan layar menghasilkan angka yang sama (94,50).

Bila semua hakim memegang "Semua bidang", hasilnya sama persis dengan cara lama.

### 3.4 Bidang tanpa hakim

Bila ada bidang rubrik yang tidak dipegang hakim mana pun di suatu babak, babak itu **tidak bisa disahkan**. Pesannya menyebut bidangnya:

*Bidang Suara belum dipegang hakim mana pun pada babak "Penyisihan" cabang "…". Tugaskan hakim untuk bidang tersebut.*

Peringatan ini sudah muncul sejak awal (kelengkapan babak berkode `FIELD_WITHOUT_JUDGE`), tidak hanya saat pengesahan. Jadi panitia bisa membereskannya sebelum penilaian dimulai.

### 3.5 Pengaman tambahan

- Lembar hakim menampilkan **"Bidang tugas: …"** dan hanya kategori kesalahan dari bidang-bidang itu, dari rubrik cabang peserta.
- Status "Lengkap" hanya menghitung lembar dari hakim yang saat ini bertugas. Hakim yang sudah dilepas tidak lagi dihitung.
- Log audit finalisasi mencatat nilai hasil hitung server, bukan angka kiriman layar.
- Mode live tidak lagi memakai penugasan cadangan dari profil hakim; hakim wajib punya penugasan resmi.

---

## 4. Multi-cabang (dari perbaikan sebelumnya, ikut di zip ini)

- Babak dicari **per cabang**, tidak pernah jatuh ke babak cabang lain. Ini berlaku untuk tambah/ubah peserta, penetapan maqra, undian, penugasan hakim, dan bank soal.
- Finalisasi tetap jalan walaupun tenant punya kategori kesalahan untuk lebih dari satu rubrik (Tilawah dan Tahfizh).
- Undian berjalan per cabang. Peserta Ditolak dilewati dan tidak lagi memblokir pengesahan.
- **Penjaga server:**

| Kode galat | Kapan muncul |
|---|---|
| `STAGE_BRANCH_MISMATCH` | Peserta ke babak cabang lain |
| `JUDGE_ASSIGNMENT_BRANCH_MISMATCH` | Hakim ke babak cabang lain |
| `JUDGE_ASSIGNMENT_DUPLICATE` | Penugasan kembar |
| `JUDGE_FIELD_NOT_IN_RUBRIC` | Bidang tidak ada di rubrik cabang |
| `RULE_CONFIG_DUPLICATE_ACTIVE` | Aturan aktif ganda |
| `RULE_CONFIG_RUBRIC_LOCKED` | Rubrik diganti padahal sudah ada nilai final |
| `FIELD_WITHOUT_JUDGE` | Bidang rubrik tanpa hakim (baru) |

- Lain-lain: Rekap Nilai punya saringan cabang; Health Check tidak lagi salah melaporkan versi skema sebagai "critical"; seed punya kategori Tahfizh.

---

## 5. Hasil uji

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | Lulus |
| `npm test` | **140 lulus, 0 gagal** (126 lama + 14 baru) |
| `npm run build` | Berhasil |
| Playwright E2E | 48 lulus, 8 dilewati (uji live butuh kredensial) |
| Pasang baru dari `schema.sql` + `seed.sql` | Tanpa galat |
| Migrasi dijalankan dua kali | Tanpa galat |

**Uji alur di database lokal:**

- **Multi-bidang, satu cabang:** tiga hakim (dua bidang, satu bidang, lalu ditambah bidang keempat).
  - Potongan di luar bidang ditolak.
  - Pengesahan diblokir selama Suara belum punya hakim.
  - Nilai bidang sesuai tabel di 3.3.
  - Setelah Suara ditugaskan, babak disahkan.
- **Multi-cabang:** tiga cabang (Tilawah Putra, Tilawah Putri, Tahfizh), masing-masing 4 peserta sah + 1 Ditolak, dua rubrik. Tiap cabang sampai Juara 1–3 dengan rubriknya sendiri.

**Tampilan di browser (mode Demo):**

- Formulir penugasan menampilkan kotak centang bidang dan "Semua bidang".
- Lembar Hj. Siti Maria menampilkan "Bidang tugas: Lagu, Suara" dengan kategori Lagu saja (data Demo tidak punya kategori Suara).

**Penyesuaian data uji lama:** beberapa uji lama memakai satu hakim berlabel "Tajwid" yang sebenarnya menilai semua bidang. Dengan aturan baru, label itu berarti hakim hanya memegang Tajwid. Labelnya saya ubah menjadi "Semua Bidang" supaya maksud ujinya tetap sama. Dua uji punya data yang tidak konsisten (nilai akhir tidak sama dengan jumlah nilai bidang), jadi angkanya saya rapikan. Tidak ada uji yang dilemahkan.

**Yang belum diuji:** proyek Supabase Anda yang sebenarnya, dan formulir-formulir di browser pada mode live. Mohon coba sekali di lingkungan asli (lihat 7).

---

## 6. Periksa data sebelum acara

**a. Babak yang punya bidang tanpa hakim** (jalankan di SQL Editor setelah migrasi):

```sql
select b.name as cabang, s.name as babak,
       public.get_stage_uncovered_fields(s.id, public.resolve_stage_rubric_by_stage(s.id)) as bidang_tanpa_hakim
from stages s
left join branches b on b.id = s.branch_id
where s.is_finalized = false
  and coalesce(array_length(public.get_stage_uncovered_fields(s.id, public.resolve_stage_rubric_by_stage(s.id)), 1), 0) > 0
order by 1, 2;
```

**b. Penugasan hakim dengan bidang yang tidak dikenali.** Penugasan seperti ini otomatis dianggap "Semua bidang"; periksa apakah memang itu maksudnya:

```sql
select pr.name as hakim, b.name as cabang, s.name as babak, ja.judge_field
from judge_assignments ja
join stages s on s.id = ja.stage_id
left join branches b on b.id = s.branch_id
left join profiles pr on pr.id = ja.judge_profile_id
where ja.status = 'Aktif' and ja.rubric_field_id is null
order by 2, 3, 1;
```

**c. Peserta/hakim di babak cabang lain:** kueri di catatan sebelumnya tetap berlaku. Atau sebagai admin panggil `audit_multi_branch_consistency('<tenant_id>')`.

**Penting untuk data yang sudah berjalan:** bila sebelumnya ada hakim yang ditugaskan dengan satu bidang (karena formulir lama mewajibkan memilih satu) padahal ia menilai semua bidang, sekarang lembarnya hanya dihitung untuk bidang itu. Ubah penugasannya menjadi "Semua bidang" sebelum babak disahkan. Babak yang sudah disahkan tidak berubah.

---

## 7. Uji singkat di lingkungan asli

1. Buat dua cabang, masing-masing punya babak "Penyisihan" dan aturan kompetisi aktif.
2. Di cabang kedua, tugaskan Hakim A ke **dua** bidang dan Hakim B ke sisa bidangnya.
3. Tambah satu peserta di cabang kedua, verifikasi, lalu undi.
4. Masuk sebagai Hakim A: pastikan tertulis "Bidang tugas" dengan dua bidang, dan coba potong kedua bidang itu.
5. Masuk sebagai Hakim B: nilai sisanya.
6. Buka Hasil & Kelulusan cabang kedua: babak bisa disahkan, dan nilai bidang sesuai potongan masing-masing hakim.

---

## 8. Yang masih belum termasuk

1. **Golongan belum menjadi pemisah.** Tetap buat satu cabang untuk tiap kombinasi cabang + golongan + jenis kelamin.
2. **Data Demo** masih hanya punya babak untuk satu cabang dan tidak punya kategori Suara.
3. **Undian per jenjang** bisa menghasilkan nomor kembar dalam satu babak; undi satu babak sekaligus.
4. **Maqra dipakai ulang** tanpa peringatan bila soal kurang dari jumlah peserta.
5. **Temuan keamanan** dari audit pertama (bootstrap superadmin, pendaftaran publik, admin menulis langsung ke keanggotaan) belum diperbaiki.
