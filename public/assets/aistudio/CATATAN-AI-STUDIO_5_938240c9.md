# Revisi Live Scoring: Maqra Rahasia + Mushaf Satu Kolom (paket gabungan v2)

Dasar: repo `main` terbaru (commit aa30bc8).

## Pilih salah satu zip

| Kondisi Anda | Pakai zip |
|---|---|
| Paket gabungan 1-2-3 sebelumnya **belum** dipasang | `paket-gabungan-1-2-3-v2.zip` (27 file, sudah termasuk revisi ini dan `PETA-KODE.md`) |
| Paket gabungan 1-2-3 sebelumnya **sudah** dipasang | `revisi-maqra-saja.zip` (10 file) |

Ganti isi file **apa adanya** (hapus isi lama, tempel isi baru). Jangan minta AI Studio menggabungkannya.

## SQL

- **Belum pernah menjalankan SQL apa pun dari paket ini:** jalankan `20261126_combined_champion_score.sql`, lalu `20261127_live_scoring.sql`.
- **Sudah pernah menjalankan `20261127_live_scoring.sql` versi lama:** cukup jalankan ulang `20261127_live_scoring.sql` versi baru ini.
  - Versi baru menambah kolom `shown_maqra_index`.
  - Fungsi versi lama dihapus otomatis, sehingga tidak ada fungsi ganda.
  - Aman dijalankan ulang.

Pasang SQL dulu, baru aplikasinya. Aplikasi baru memanggil fungsi dengan parameter tambahan `p_maqra_index`, dan fungsi itu belum ada di database lama.

## Isi revisi (10 file)

| File | Perubahan |
|---|---|
| `supabase/migrations/20261127_live_scoring.sql` | Kolom `shown_maqra_index`; perintah `show_maqra` / `hide_maqra`; fungsi `live_participation_maqras`; maqra direset saat pindah peserta |
| `supabase/schema.sql` | Salinan migrasi diperbarui |
| `src/services/liveScoring.ts` | Data maqra yang ditampilkan (`maqra`, `maqraCount`), urutan maqra |
| `src/live/LiveDisplayCard.tsx` | "Maqra belum ditampilkan"; mushaf satu kolom bertumpuk |
| `src/components/live/LiveScoringControlView.tsx` | Ikon judul dihapus; tombol Tampilkan Maqra 1, 2, ... dan Sembunyikan Maqra |
| `src/services/supabaseDataService.ts` | Mengirim nomor maqra ke server |
| `src/content/defaultPages.ts` | Kalimat Kebijakan Privasi: maqra dirahasiakan |
| `PETA-KODE.md` | Bagian Live Scoring diperbarui |
| `src/tests/supabaseRules.test.ts`, `src/tests/multiBranch.test.ts` | Tes diperbarui |

## Perilaku baru

1. **Judul halaman admin** tanpa ikon, hanya judul dan deskripsi singkat.
2. **Maqra tersembunyi secara bawaan.** Layar publik hanya menampilkan nomor undian, nama, asal, cabang, dan babak, dengan keterangan "Maqra belum ditampilkan".
3. **Tombol maqra di admin.** Di bawah tombol Sebelumnya/Berikutnya ada kotak "Maqra peserta ini":
   - tombol **Tampilkan Maqra 1**, **Tampilkan Maqra 2**, dan seterusnya, sesuai jumlah maqra peserta;
   - di samping tiap tombol tertulis surat dan ayatnya, hanya terlihat oleh admin;
   - tombol **Sembunyikan Maqra** muncul saat sebuah maqra sedang tampil.
4. **Satu maqra di layar.** Menampilkan Maqra 2 menggantikan Maqra 1.
5. **Reset otomatis.** Pindah peserta (Berikutnya, Sebelumnya, Tampilkan), mulai sesi, dan hentikan sesi selalu menyembunyikan maqra kembali.
6. **Rahasia di server.** Isi maqra yang belum ditampilkan tidak pernah dikirim ke publik, termasuk lewat API dan realtime. Publik hanya menerima jumlah maqranya.
7. **Mushaf satu kolom.** Layar publik hanya menampilkan halaman mushaf milik maqra yang sedang tampil, selebar satu halaman. Maqra 2 halaman ditampilkan bertumpuk, dan halaman kedua dicapai dengan menggulir ke bawah.
8. **Urutan Maqra 1, 2, ...** mengikuti halaman awal, lalu waktu penetapan. Urutan ini sama di admin dan server.

## Jangan diubah oleh AI Studio

- Jangan kirim daftar semua maqra ke layar publik. `display` hanya boleh berisi maqra yang sedang ditampilkan.
- Jangan hapus reset `shown_maqra_index` saat pindah peserta, mulai sesi, atau hentikan sesi.
- Aturan "Jangan diubah" di `PETA-KODE.md` bagian 9 tetap berlaku.

## Hasil pengujian

- `npm run lint`: lulus.
- `npm test`: **178 dari 178 lulus**. Yang diperbarui:
  - **97h** (database):
    - maqra tersembunyi bawaan, dan publik tidak menerima nama surat maupun halaman;
    - `show_maqra` 1 tampil di publik;
    - nomor maqra yang tidak ada ditolak (`LIVE_INVALID_MAQRA`);
    - pindah peserta menyembunyikan maqra lagi;
    - `hide_maqra` berfungsi.
  - **LV-01** (aplikasi): maqra tersembunyi bawaan, Maqra 2 tampil dengan halamannya sendiri saja, urutan maqra, dan pembacaan data publik.
  - **99**: rantai migrasi tanpa fungsi ganda.
- Migrasi dijalankan dua kali di Postgres lokal (di atas versi lama). Fungsi lama terhapus.
- `npm run build`: berhasil.
- E2E Desktop Chrome: 24 lulus, 4 dilewati. Satu kegagalan lama (tes 05 nomor 04) sudah ada sebelum perubahan ini.
- Dicek tampilannya: layar publik saat maqra tersembunyi dan saat Maqra 2 (2 halaman) tampil, serta tombol maqra di admin (Mode Demo).
  - Gambar mushaf di tangkapan layar diganti gambar contoh karena server uji tidak punya akses internet.
