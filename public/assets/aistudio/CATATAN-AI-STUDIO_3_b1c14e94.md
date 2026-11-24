# Hemat Egress Tahap 1 + 2 (gabungan)

Dasar: repo `main` terbaru (commit ccb9d8f). Zip ini **menggantikan** zip Tahap 1 sebelumnya.

## Urutan pemasangan

1. **Supabase SQL Editor:** jalankan `20261125_annotation_count.sql` (juga ada di zip, di `supabase/migrations/`).
   - Menambah kolom hitung `annotation_count` (GENERATED) di `judge_assessments`.
   - Aman dijalankan ulang. Tidak mengubah lembar terkunci, dan tidak memicu trigger imutabilitas.
   - Bila aplikasi terpasang lebih dulu sebelum SQL ini dijalankan, aplikasi tetap jalan: muat penuh otomatis kembali mengunduh lengkap seperti dulu, tetapi penghematan coretan belum terasa.
2. **AI Studio:** ganti 12 file berikut dengan isi dari zip, **apa adanya**.

| File | Status |
|---|---|
| `src/context/MtqContext.tsx` | diubah |
| `src/services/supabaseDataService.ts` | diubah |
| `src/components/penilaian/PenilaianDualPanelView.tsx` | diubah |
| `src/components/rekap/RekapNilaiView.tsx` | diubah (jumlah anotasi) |
| `src/components/stages/HasilKelulusanView.tsx` | diubah |
| `src/types/mtq.ts` | diubah |
| `src/utils/realtimeRowApply.ts` | **baru** |
| `src/utils/annotationCarryOver.ts` | **baru** |
| `supabase/migrations/20261125_annotation_count.sql` | **baru** |
| `supabase/schema.sql` | diubah (kolom `annotation_count`) |
| `src/tests/multiBranch.test.ts` | diubah (EG-01, EG-02) |
| `src/tests/supabaseRules.test.ts` | diubah (43h, 50e, 50f; adaptor tes menghormati daftar kolom `select`) |

## Tahap 1: mengurangi frekuensi muat ulang

1. **Realtime `stage_participations` per baris** (`applyStageParticipationRealtimeUpdate`).
   - Event UPDATE yang hanya mengubah `status` atau `provisional_score` diterapkan langsung ke state.
   - Perubahan berat (nomor undian, babak, peserta, peringkat, juara, kelulusan, nilai final, `finalized_at`), event INSERT dan DELETE, serta baris yang belum dikenal tetap memakai muat ulang.
2. **Muat ulang ringan** `refreshSupabaseConnection({ lightweight: true })`.
   - Hanya memanggil `fetchTenantWorkspaceResult`, tanpa `verifyDatabaseConnection` dan tanpa `fetchAuthenticatedUserProfile`.
   - Dipakai oleh muat ulang dari event realtime dan muat ulang berkala.
   - Login, F5, perangkat online kembali, dan koneksi realtime pulih tetap memakai jalur lengkap.
   - Penerapan hasil muat dipusatkan di `applyHydratedWorkspace`.
3. **Muat ulang berkala dari 5 menit menjadi 30 menit**, hanya untuk tab yang terlihat.
4. **Simpan lembar: 1 permintaan untuk simpan berikutnya.**
   - Cache `assessmentSaveTargetCache` menyimpan partisipasi babak dan baris maqra yang sudah dipastikan ada.
   - Bila database menolak karena referensi tidak valid, cache dibuang dan jalur lengkap diulang sekali.
   - Cache dikosongkan saat keluar sesi.

## Tahap 2: memperkecil isi muat penuh

5. **Coretan mushaf tidak ikut muat penuh.**
   - `judge_assessments` diambil dengan `ASSESSMENT_LIST_COLUMNS` (semua kolom kecuali `annotations`, ditambah `annotation_count`).
   - Bila kolom `annotation_count` belum ada di database, otomatis kembali ke `select('*')`.
   - `JudgeAssessment` mendapat `annotationCount` dan `annotationsLoaded`. Nilai `annotationsLoaded` false bila lembar punya coretan yang belum diunduh. Lembar tanpa coretan (`annotation_count = 0`) langsung dianggap termuat.
6. **Coretan diunduh saat lembar dibuka.**
   - `PenilaianDualPanelView` memanggil `loadAssessmentAnnotations([id])` dan mencoba lagi saat perangkat online kembali.
   - Selama belum termuat, **pena, stabilo, penghapus, undo, dan hapus halaman dinonaktifkan**, dan muncul label "Memuat coretan sebelumnya…".
7. **Pengaman agar coretan tidak pernah terhapus:**
   - `upsertAssessmentRow` **tidak mengirim kolom `annotations`** bila `annotationsLoaded === false`. Simpan jumlah kesalahan (+/−) pada lembar seperti itu tidak menyentuh coretan di database.
   - `saveAnnotations` menolak menyimpan bila coretan lembar itu belum termuat.
   - `carryOverLoadedAnnotations`: saat data dimuat ulang (muat penuh maupun payload realtime tanpa kolom coretan), coretan yang sudah diunduh di perangkat dibawa selama jumlahnya sama dengan `annotation_count`. Bila berbeda, lembar ditandai belum termuat dan diunduh ulang.
8. **Snapshot hasil babak tanpa daftar peringkat di muat penuh.**
   - `SNAPSHOT_LIST_COLUMNS` dipakai, sehingga `rankingsLoaded` bernilai false.
   - `HasilKelulusanView` memanggil `loadStageSnapshotRankings(id)` saat snapshot ditampilkan. Peringkat yang sudah diunduh dibawa saat muat ulang (`carryOverSnapshotRankings`).
9. Rincian Rekap menampilkan "N anotasi mushaf" dari `annotationCount`.

## Jangan diubah oleh AI Studio

- Jangan kembalikan `select('*')` untuk `judge_assessments` dan `stage_result_snapshots` di muat penuh (kecuali jalur cadangan yang sudah ada).
- Jangan hapus syarat `annotationsLoaded === false` di upsert dan di `saveAnnotations`. Ini pengaman agar coretan tidak terhapus.
- Jangan kirim kolom `annotation_count` saat menyimpan, karena kolom ini GENERATED dan diisi Postgres.
- Jangan kembalikan interval muat ulang ke 5 menit, dan jangan jadikan setiap event `stage_participations` muat ulang penuh.

## Perilaku yang perlu diketahui

- Saat membuka lembar yang sudah berisi coretan, pena aktif sesudah coretan termuat (biasanya kurang dari 1 detik). Bila **offline** dan coretan lembar itu belum pernah diunduh di perangkat tersebut, pena tetap nonaktif sampai online kembali. Tombol +/− tetap bisa dipakai.
- Perubahan akses akun tidak lagi terdeteksi oleh muat ulang rutin. Perubahan itu terdeteksi saat login, F5, perangkat online kembali, atau koneksi realtime pulih. Data tetap dilindungi RLS.

## Perkiraan dampak

Untuk data lomba sebelumnya (172 lembar), satu kali muat penuh turun dari sekitar **1,28 MB menjadi sekitar 0,3 MB**, dan muat penuh terjadi jauh lebih jarang.

## Hasil pengujian

- `npm run lint` (tsc): lulus.
- `npm test`: 173 dari 173 lulus. Tes baru:
  - **43h**: simpan kedua hanya 1 permintaan.
  - **50e**: muat penuh tanpa coretan, simpan tidak menghapus coretan, coretan bisa diunduh.
  - **50f**: snapshot tanpa peringkat, peringkat bisa diunduh.
  - **EG-01**: aturan realtime per baris.
  - **EG-02**: coretan yang sudah diunduh tidak hilang saat muat ulang.
- `npm run build`: berhasil.
- Migrasi diuji di Postgres lokal, termasuk dijalankan dua kali dan dengan lembar terkunci.
- E2E Desktop Chrome: 24 lulus dan 4 dilewati. Satu kegagalan lama di tes 05 nomor 04 (filter "Aktif" Penyelenggara) sudah ada sebelum paket ini. E2E penilaian dan anotasi (03) di semua perangkat: 8 lulus.

## Saran uji setelah dipasang

Coba dulu di penyelenggara **Test**:
1. Hakim membuat coretan di sebuah lembar.
2. Muat ulang halaman (F5).
3. Buka lagi lembar itu. Coretan harus muncul kembali setelah label "Memuat coretan sebelumnya…" hilang.
4. Tambah kesalahan (+), lalu muat ulang. Coretan harus tetap ada.
