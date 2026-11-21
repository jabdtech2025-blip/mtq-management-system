# Perbaikan Gabungan: Penugasan di Manajemen Akun & Kolom Hakim di Rekap Nilai Real-Time

Dasar: repo `main` terbaru (commit 468579a). Zip `penugasan-akun-dan-rekap-nilai.zip` menggantikan zip sebelumnya. Ganti 4 file berikut dengan isi dari zip, **apa adanya**. Tidak perlu menjalankan SQL.

| File | Status |
|---|---|
| `src/components/users/UserManagementView.tsx` | diubah |
| `src/components/rekap/RekapNilaiView.tsx` | diubah |
| `src/utils/judgeAssignmentLabels.ts` | **baru** |
| `src/tests/multiBranch.test.ts` | diubah (tes UA-01, RK-01, RK-02 ditambahkan di akhir) |

---

## A. Kolom "Penugasan Bidang & Cabang" di Manajemen Akun

**Masalah:** kolom itu selalu menampilkan "Tilawah Dewasa (Penyisihan)" untuk semua hakim. Teks itu ditulis langsung di kode sebagai cadangan (`u.assignedBranch || 'Tilawah Dewasa'`), sedangkan `assignedBranch`/`assignedStage` tidak pernah diisi dari database. Penugasan yang sebenarnya ada di tabel `judge_assignments`.

**Perubahan:**
1. Kolom Penugasan memakai `judgeAssignments` aktif milik penyelenggara yang sedang dibuka. Formatnya "Bidang" dan "Cabang (Babak)", urut babak, lalu cabang, lalu bidang. Duplikat dibuang. Bila lebih dari 3, sisanya diringkas menjadi "+N penugasan lainnya" dengan tooltip.
2. Hakim tanpa penugasan ditandai "Belum ditugaskan".
3. Formulir Tambah/Edit akun hakim: pilihan "Cabang Penugasan" dihapus karena tidak tersimpan. "Bidang Penilaian Utama" tetap ada. Saat edit, penugasan saat ini ditampilkan, ditambah tombol "Buka Master Data & Rubrik › Penugasan Hakim".
4. Pencarian juga mencocokkan cabang, babak, dan bidang dari penugasan.
5. Nilai `assignedBranch`/`assignedStage` yang sudah ada tidak dihapus. Formulir hanya tidak lagi mengirimkannya, sehingga Mode Demo tetap berperilaku sama.

## B. Kolom hakim di Rekap Nilai Real-Time

**Masalah:** kolom hakim memakai cadangan bertingkat. Bila filter "Semua Babak" atau babak tanpa penugasan dipilih, yang tampil adalah **semua akun hakim** dengan bidang dari **akun**, bukan dari penugasan. Bila belum ada akun hakim, yang tampil adalah **3 akun sembarang**, termasuk admin. Akibatnya:
1. Nama admin muncul saat belum ada hakim.
2. Hakim yang penugasannya dicabut masih muncul.
3. Hakim yang belum ditugaskan ikut muncul.
4. Hakim yang ditugaskan di Itqon tampil sebagai Tajwid (bidang bawaan akun).

Selain itu, hakim yang memegang dua bidang hanya ditampilkan dengan satu bidang.

**Perubahan:**
1. Kolom hakim dihitung oleh `resolveRekapJudgeColumns` (di `src/utils/judgeAssignmentLabels.ts`) dan **hanya** berasal dari penugasan aktif sesuai filter babak dan cabang. Cadangan "semua akun hakim" dan "akun sembarang" dihapus.
2. Label bidang diambil dari penugasan (nama bidang rubrik lewat `rubricFieldId`, atau `judgeField`). Bila lebih dari satu, digabung dengan koma, misalnya "Lagu, Suara".
3. **Hakim yang dicabut setelah menilai** tetap tampil dengan tanda kuning "Tidak lagi ditugaskan", agar nilainya tidak hilang dari rekap. Ini berlaku hanya bila ia punya lembar penilaian untuk peserta dalam cakupan filter babak/cabang. Hakim yang dicabut dan belum pernah menilai **tidak** ditampilkan. Di ekspor CSV, judul kolomnya diberi akhiran "[tidak lagi ditugaskan]".
4. Bila tidak ada hakim yang ditugaskan, muncul pesan "Belum ada hakim yang ditugaskan pada babak …" dengan tombol "Buka Penugasan Hakim".
5. Perhitungan nilai (rata-rata per bidang, kelengkapan, status) **tidak diubah**.

## Jangan diubah oleh AI Studio

- Jangan kembalikan teks cadangan `'Tilawah Dewasa'` / `'Penyisihan'` di Manajemen Akun.
- Jangan tambahkan kembali pilihan Cabang/Babak di formulir akun. Penugasan diatur hanya di Master Data & Rubrik › Penugasan Hakim.
- Jangan kembalikan cadangan "semua hakim di tenant" atau `users.slice(...)` untuk kolom hakim di Rekap Nilai.

## Hasil pengujian

- `npm run lint` (tsc): lulus.
- `npm test`: 168 dari 168 lulus (termasuk UA-01, RK-01, RK-02 yang baru).
- `npm run build`: berhasil.
- E2E 02, 03, 04 (Desktop Chrome): 14 lulus. E2E 02 dan 05 untuk Manajemen Akun: 20 lulus.
- Dicek langsung di Mode Demo: kolom Penugasan di Manajemen Akun, kolom hakim di Rekap (termasuk hakim dua bidang), dan pesan kosong pada babak tanpa penugasan.

## Temuan terpisah (tidak diubah)

- Tes E2E `05-user-management-and-passwords.spec.ts` nomor 04 gagal sejak perubahan filter status penyelenggara. Setelah penyelenggara dinonaktifkan, barisnya hilang dari filter bawaan "Aktif", sehingga tombol "Aktifkan Penyelenggara MTQ" tidak ditemukan. Perilaku aplikasinya benar. Tes tersebut perlu memilih filter "Semua Status" sebelum mengaktifkan kembali.
- Selama E2E muncul peringatan React "Can't perform a React state update on a component that hasn't mounted yet". Peringatan ini juga muncul sebelum perubahan ini dan tidak memengaruhi fungsi.
