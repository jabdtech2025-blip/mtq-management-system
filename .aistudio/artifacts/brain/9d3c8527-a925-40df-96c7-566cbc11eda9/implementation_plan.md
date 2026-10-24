# Integrasi Lembar Mushaf Madinah 15 Baris (Mujamma' Malik Fahd) & Navigasi Presisi

Rencana implementasi untuk menghadirkan lembar asli Mushaf Madinah Rasm Utsmani standar 15 baris (cetakan resmi Mujamma' Al-Malik Fahd / King Fahd Complex) lengkap dengan ornamen bingkai emas-hijau khas Madinah, plakat nama surah, basmalah kaligrafi, penomoran ayat berornamen bunga, serta kanvas coret bebas ber-zoom presisi dan navigasi geser (*pan & zoom*).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Keputusan Kunci yang Dikonfirmasi**:
> - **Format Tampilan Mushaf**: Menggunakan lembar asli Mushaf Madinah standar 15 baris per halaman (cetakan resmi Mujamma' Malik Fahd) yang menjadi standar resmi musabaqah nasional dan internasional.
> - **Navigasi Zoom & Geser**: Dilengkapi kontrol zoom presisi (70% - 160%) dan kemampuan menggeser lembar (*panning/drag*) agar dewan hakim di tablet dapat memperbesar baris kalimat atau harakat tertentu saat menilai peserta.
> - **Preservasi Anotasi**: Seluruh koordinat goresan pen/stabilo dewan hakim diikat secara proporsional terhadap resolusi dasar lembar mushaf sehingga tidak bergeser saat di-zoom atau digeser.

---

## 1. Overview & Core Concept

Mushaf Madinah standar 15 baris karya kaligrafer Utsman Thaha yang diterbitkan oleh Mujamma' Malik Fahd li Thiba'at al-Mushhaf asy-Syarif merupakan rujukan tunggal dalam penyelenggaraan MTQ di seluruh dunia. Integrasi ini memberikan:
- **Tampilan Lembar Asli Madinah 15 Baris**: Memuat halaman 305 (Surah Maryam 1-15), halaman 140 (Al-An'am 95-99), halaman 260 (Ibrahim 35-41), dan halaman 304 (Al-Kahf 102-110) dengan tata letak baris, kepala surah, dan bingkai ornamen yang identik dengan fisik mushaf.
- **Kanvas Transparan Terkalibrasi**: Lapisan kanvas interaktif berada tepat di atas lembar mushaf 15 baris untuk menangkap coretan tajwid/makhraj dan stabilo waqaf dewan hakim.
- **Engine Zoom & Pan Responsif Tablet**: Mendukung gerakan cubit/tombol zoom serta geser kanvas yang mulus dengan akselerasi perangkat keras (*hardware accelerated transform*).

---

## 2. Cetak Biru Antarmuka Panel Mushaf Madinah 15 Baris

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Hal: 305 ▾] [Zoom: 100% ▾] [-] [+] [Tangan Geser] [● Pen] [■ Stabilo] [⌫] [↶] [🗑]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ LEMBAR MUSHAF MADINAH STANDAR 15 BARIS (MUJAMMA' MALIK FAHD) ─────────────────────┐ │
│ │  Juz 16                    سُورَةُ مَرْيَمَ                    حِزْب 31              │ │
│ │ ╔════════════════════════════════════════════════════════════════════════════════╗ │ │
│ │ ║ ╔════════════════════════════════════════════════════════════════════════════╗ ║ │ │
│ │ ║ ║ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  سُورَةُ مَرْيَمَ (مَكِّيَّةٌ)  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ║ ║ │ │
│ │ ║ ╠════════════════════════════════════════════════════════════════════════════╣ ║ │ │
│ │ ║ ║                 بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ                          ║ ║ │ │
│ │ ║ ║ [Baris 1] كٓهيعٓصٓ ﴿١﴾ ذِكْرُ رَحْمَتِ رَبِّكَ عَبْدَهُۥ زَكَرِيَّآ ﴿٢﴾       ║ ║ │ │
│ │ ║ ║ [Baris 2] إِذْ نَادَىٰ رَبَّهُۥ نِدَآءً خَفِيًّۭا ﴿٣﴾ قَالَ رَبِّ إِنِّى وَهَنَ  ║ ║ │ │
│ │ ║ ║ [Baris 3] ٱلْعَظْمُ مِنِّى وَٱشْتَعَلَ ٱلرَّأْسُ شَيْبًۭا وَلَمْ أَكُنۢ          ║ ║ │ │
│ │ ║ ║ [Baris 4] بِدُعَآئِكَ رَبِّ شَقِيًّۭا ﴿٤﴾ وَإِنِّى خِفْتُ ٱلْمَوَٰلِىَ مِن    ║ ║ │ │
│ │ ║ ║ [Baris 5] وَرَآءِى وَكَانَتِ ٱمْرَأَتِى عَاقِرًۭا فَهَبْ لِى مِن لَّدُنكَ     ║ ║ │ │
│ │ ║ ║ [Baris 6] وَلِيًّۭا ﴿٥﴾ يَرِثُنِى وَيَرِثُ مِنْ ءَالِ يَعْقُوبَ ۖ وَٱجْعَلْهُ  ║ ║ │ │
│ │ ║ ║ [Baris 7] رَبِّ رَضِيًّۭا ﴿٦﴾ يَٰزَكَرِيَّآ إِنَّا نُبَشِّرُكَ بِغُلَٰمٍ      ║ ║ │ │
│ │ ║ ║ [Baris 8] ٱسْمُهُۥ يَحْيَىٰ لَمْ نَجْعَل لَّهُۥ مِن قَبْلُ سَمِيًّۭا ﴿٧﴾       ║ ║ │ │
│ │ ║ ║ [Baris 9] قَالَ رَبِّ أَنَّىٰ يَكُونُ لِى غُلَٰمٌۭ وَكَانَتِ ٱمْرَأَتِى عَاقِرًۭا ║ ║ │ │
│ │ ║ ║ [Baris 10] وَقَدْ بَلَغْتُ مِنَ ٱلْكِبَرِ عِتِيًّۭا ﴿٨﴾ قَالَ كَذَٰلِكَ قَالَ   ║ ║ │ │
│ │ ║ ║ [Baris 11] رَبُّكَ هُوَ عَلَىَّ هَيِّنٌۭ وَقَدْ خَلَقْتُكَ مِن قَبْلُ وَلَمْ  ║ ║ │ │
│ │ ║ ║ [Baris 12] تَكُ شَيْـًۭٔا ﴿٩﴾ قَالَ رَبِّ ٱجْعَل لِّىٓ ءَايَةًۭ ۚ قَالَ ءَايَتُكَ ║ ║ │ │
│ │ ║ ║ [Baris 13] أَلَّا تُكَلِّمَ ٱلنَّاسَ ثَلَٰثَ لَيَالٍۢ سَوِيًّۭا ﴿١٠﴾ فَخَرَجَ    ║ ║ │ │
│ │ ║ ║ [Baris 14] عَلَىٰ قَوْمِهِۦ مِنَ ٱلْمِحْرَابِ فَأَوْحَىٰٓ إِلَيْهِمْ أَن سَبِّحُوا۟║ ║ │ │
│ │ ║ ║ [Baris 15] بُكْرَةًۭ وَعَشِيًّۭا ﴿١١﴾... ﴿١٥﴾                                ║ ║ │ │
│ │ ║ ╚════════════════════════════════════════════════════════════════════════════╝ ║ │ │
│ │ ╚════════════════════════════════════════════════════════════════════════════════╝ │ │
│ │                                    ٣٠٥                                           │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rincian Teknis Implementasi

1. **Aset & Renderer Lembar Mushaf Madinah**:
   - Menghadirkan template visual Mushaf Madinah 15 baris dengan rasio aspek standar cetak ($1 : 1.48$), palet warna kertas krem khas Madinah (`#FBF9F1` / `#FAF6EB`), dan bingkai ornamen geometris islami beraksen emas-hijau zamrud (`#D4AF37`, `#166534`).
   - Setiap halaman memuat 15 baris teks Rasm Utsmani berformat presisi sesuai Mushaf Madinah aslinya.
   - Dilengkapi plakat kepala surah berornamen orisinal, Basmalah kaligrafi Utsman Thaha, penanda hizb/juz di margin samping, serta nomor halaman timur arab (misal: `٣٠٥`).

2. **Sistem Kanvas Anotasi Terkalibrasi**:
   - Kanvas transparan beresolusi tinggi ($1200 \times 1780\text{px}$ skala internal) di atas lembar mushaf.
   - Mode interaksi ganda:
     - *Mode Coret (Pen / Stabilo / Eraser)*: Menandai kesalahan bacaan peserta.
     - *Mode Geser (Pan / Hand Tool)*: Memungkinkan dewan hakim menyeret halaman saat di-zoom tinggi ($> 100\%$) dengan mudah.
   - Koordinat titik dinormalisasi relatif terhadap skala kanvas sehingga posisi coretan tetap presisi di atas ayat meskipun zoom diubah-ubah.

3. **Status Sinkronisasi & Autosave**:
   - Seluruh goresan pada setiap halaman disimpan secara terpisah dalam `assessments[].annotations` dan ter-autosave seketika ke `localStorage` dan context state.
   - Menjaga kebersihan header penjurian sesuai permintaan pengguna (header tetap minimalis dan bersih).

---

## 4. Rencana Verifikasi

1. **Verifikasi Visual 15 Baris**: Memastikan lembar Mushaf Madinah menampilkan 15 baris proporsional, plakat nama surah, dan nomor ayat ornamen bunga.
2. **Uji Zoom & Geser**: Menguji zoom dari 80% hingga 140% dan menggeser kanvas tanpa distorsi tampilan teks.
3. **Uji Ketepatan Coretan**: Menandai suatu ayat pada zoom 100%, memperbesar ke 130%, dan memverifikasi bahwa coretan tetap melekat tepat pada kata yang sama.
4. **Verifikasi Kompilasi**: Menjalankan `compile_applet` dan `lint_applet` tanpa galat.
