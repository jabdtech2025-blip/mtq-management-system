# Instruksi untuk AI Studio: Paket Perbaikan Superadmin, Bank Soal & Urutan Peserta

> Salin seluruh teks di bawah garis ini ke AI Studio, lalu lampirkan `perbaikan-superadmin-banksoal.zip`.

---

## Konteks

Repo ini adalah aplikasi MTQ (React + Vite + TypeScript + Supabase). **Paket A sudah terpasang** (jenjang dihapus, impor Excel baru, babak di Master Data). Paket ini adalah lanjutannya dan berisi **18 file** di dalam zip terlampir, dengan struktur folder yang sama persis dengan repo.

## Tugas

1. **Timpa** ke-18 file berikut di repo dengan isi dari zip, **apa adanya**, pada path yang sama:

   **File baru:**
   - `src/utils/participantSort.ts`
   - `supabase/migrations/20261122_move_member_and_supervision_log.sql`

   **File yang diganti:**
   - `src/components/bankSoal/BankSoalView.tsx`
   - `src/components/penilaian/PenilaianHakimListView.tsx`
   - `src/components/rekap/RekapNilaiView.tsx`
   - `src/components/superadmin/SupervisionModal.tsx`
   - `src/components/superadmin/SuperadminTenantsView.tsx`
   - `src/components/superadmin/SuperadminDashboardView.tsx`
   - `src/components/superadmin/SuperadminHealthView.tsx`
   - `src/components/superadmin/SuperadminAuditView.tsx`
   - `src/components/superadmin/SuperadminUsersView.tsx`
   - `src/context/MtqContext.tsx`
   - `src/services/supabaseDataService.ts`
   - `src/types/mtq.ts`
   - `src/data/mockData.ts`
   - `supabase/schema.sql`
   - `src/tests/multiBranch.test.ts`
   - `src/tests/supabaseRules.test.ts`

2. **Aturan penting:**
   - **Jangan** menulis ulang, merapikan, meringkas, atau "memperbaiki" isi file. Salin persis dari zip. File besar seperti `MtqContext.tsx` dan `schema.sql` harus disalin utuh, tanpa dipotong.
   - **Jangan** mengubah file lain di luar 18 file di atas.
   - **Jangan** menghapus atau mengganti nama file apa pun.
   - Bila ada konflik dengan isi repo saat ini, **gunakan versi dari zip**.
   - `SupervisionModal.tsx` sebelumnya ada tetapi tidak dipakai. Sekarang modal ini dipakai oleh tiga halaman superadmin. Ganti seluruh isinya.

3. **Setelah menyalin, jalankan pemeriksaan berikut dan laporkan hasilnya:**
   ```
   npm run lint
   npm test
   npm run build
   ```
   Hasil yang diharapkan: lint tanpa error, `npm test` **154 lulus, 0 gagal**, dan build berhasil. Jika ada yang gagal, **laporkan pesan error-nya saja**. Jangan mengubah kode untuk "menambal" error tanpa konfirmasi.

4. **Commit** dengan pesan:
   ```
   Perbaikan superadmin, bank soal, dan urutan peserta

   - Mode Supervisi wajib beralasan dan tercatat di audit log (masuk & keluar)
   - Audit Log Platform memuat log semua penyelenggara + filter
   - Pindah MTQ menonaktifkan keanggotaan lama dan melepas penugasan hakim lama
   - Bank Soal: dropdown babak per cabang; tautkan soal hanya ke peserta cabang & babak soal (A-Z)
   - Peserta Saya, Monitoring Penilaian, Rekap Nilai: urut cabang, babak, nomor undian
   ```

## Langkah manual (dilakukan pemilik repo, bukan AI Studio)

AI Studio **tidak** perlu dan **tidak bisa** menjalankan langkah ini:

- Di **Supabase**, buka **SQL Editor**, tempel seluruh isi `supabase/migrations/20261122_move_member_and_supervision_log.sql`, lalu klik **Run**.
- Migrasi ini menambah dua fungsi server, yaitu `move_member_to_tenant` dan `record_supervision_event`. Migrasi aman dijalankan berulang dan tidak mengubah data yang sudah ada.
- **Tanpa migrasi ini**, fitur Pindah MTQ dan masuk Mode Supervisi akan menampilkan galat di mode live.

## Ringkasan perubahan (untuk referensi AI Studio)

| Area | Masalah | Perbaikan |
|---|---|---|
| Mode Supervisi | Masuk workspace tenant tidak tercatat; alasan dibuang | Alasan wajib ≥5 karakter di semua jalur masuk; masuk/keluar dicatat via RPC `record_supervision_event`; jika gagal dicatat, supervisi tidak dibuka |
| Audit Log Platform | Hanya memuat log tenant pertama | Memuat log semua penyelenggara (300 terbaru), filter per penyelenggara, tampilkan alasan |
| Pindah MTQ | Hanya menambah keanggotaan; yang lama tetap aktif, sehingga setelah refresh tenant lama yang tampil | RPC `move_member_to_tenant`: keanggotaan lama Nonaktif, penugasan hakim lama dilepas, audit di kedua tenant; ditolak bila hakim masih punya lembar nilai belum final |
| Bank Soal: dropdown babak | Babak semua cabang muncul (mis. dua "Penyisihan") | Form, filter, dan panel undian hanya menampilkan babak cabang terpilih |
| Bank Soal: tautkan soal | Semua peserta dari semua cabang muncul | Hanya peserta cabang & babak soal, urut nama A–Z |
| Peserta Saya / Monitoring / Rekap | Urutan acak | Urut cabang → babak → nomor undian (angka); Rekap menampilkan cabang & babak per baris |

## Hal yang perlu diketahui

- Pengguna yang **dulu sudah "dipindahkan"** dengan cara lama masih punya keanggotaan aktif di tenant lama. Setelah paket ini terpasang, jalankan "Pindah MTQ" sekali lagi untuk mereka agar keanggotaan lama dinonaktifkan.
- Nomor undian berlaku per cabang. Saat filter **"Semua Cabang"** dipilih, daftar dikelompokkan per cabang lebih dulu. Pilih satu cabang untuk melihat urutan 01, 02, 03, … berturut-turut.
