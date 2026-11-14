/**
 * Isi BAWAAN halaman publik (dipakai bila Superadmin belum membuat/menerbitkan versi sendiri di menu Konten Situs).
 *
 * PENTING: Kebijakan Privasi & Ketentuan Penggunaan di bawah adalah DRAF AWAL dan perlu ditinjau oleh pihak yang
 * memahami hukum (antara lain UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi) sebelum dianggap final.
 */

export type SitePageCategory = 'panduan' | 'kebijakan' | 'lainnya';

export interface SitePage {
  id?: string;
  slug: string;
  title: string;
  summary: string;
  category: SitePageCategory;
  bodyMd: string;
  status: 'draft' | 'published';
  effectiveDate?: string; // YYYY-MM-DD
  sortOrder: number;
  showInFooter: boolean;
  updatedAt?: string;
  /** true bila isi berasal dari bawaan aplikasi (belum disimpan di database) */
  isDefault?: boolean;
}

const CONTACT_EMAIL = 'admin@mtqsystem.web.id';

export const DEFAULT_SITE_PAGES: SitePage[] = [
  {
    slug: 'panduan/hakim',
    title: 'Panduan Dewan Hakim',
    summary: 'Cara masuk, membuka lembar penilaian, mencatat kesalahan, dan mengunci nilai.',
    category: 'panduan',
    status: 'published',
    sortOrder: 10,
    showInFooter: false,
    isDefault: true,
    bodyMd: `## Sebelum lomba dimulai
- Pastikan Anda sudah menerima **email undangan** dan telah mengatur kata sandi.
- Gunakan tablet atau laptop dengan browser terbaru. Untuk tampilan terbaik, pasang aplikasi lewat tombol **Instal Aplikasi**.
- Pastikan Anda sudah **ditugaskan** oleh panitia pada babak, cabang, dan bidang yang benar. Bila tidak, lembar penilaian akan tampil **hanya-baca**.

## Membuka lembar penilaian
1. Masuk di halaman **Masuk** dengan email dan kata sandi Anda.
2. Buka menu **Penilaian Hakim**, lalu pilih peserta yang sedang tampil.
3. Mushaf Madinah di sebelah kiri otomatis membuka halaman maqra peserta.

## Mencatat kesalahan
- Ketuk **+** untuk menambah dan **−** untuk mengurangi kesalahan pada kategori di bidang Anda.
- Anda hanya dapat mengisi kategori pada **bidang yang ditugaskan kepada Anda**. Bila Anda memegang dua bidang, kategori kedua bidang ditampilkan.
- Gunakan pena atau stabilo untuk menandai bagian mushaf; coretan tersimpan otomatis.

## Bila koneksi terputus
- Koreksi tetap tersimpan di perangkat dan dikirim otomatis saat tersambung kembali.
- Bila muncul jendela **Gagal menyinkronkan**, baca alasannya lalu pilih **Coba lagi** atau **Buang perubahan ini**.

## Mengunci nilai
- Setelah peserta selesai, tekan **Simpan Penilaian** lalu konfirmasi. Nilai yang sudah dikunci **tidak dapat diubah** kecuali dibuka kembali oleh admin dengan alasan tertulis.
- Mengunci nilai **wajib dalam keadaan online**.

Butuh bantuan? Hubungi panitia penyelenggara atau ${CONTACT_EMAIL}.`
  },
  {
    slug: 'panduan/admin',
    title: 'Panduan Admin Penyelenggara',
    summary: 'Urutan kerja panitia dari master data sampai pengesahan juara.',
    category: 'panduan',
    status: 'published',
    sortOrder: 20,
    showInFooter: false,
    isDefault: true,
    bodyMd: `## Urutan kerja yang disarankan
1. **Master Data & Rubrik** — siapkan cabang, jenjang, rubrik, dan kategori kesalahan sesuai juknis.
2. **Pengguna & Hakim** — undang admin dan dewan hakim melalui email.
3. **Grup & Peserta** — daftarkan peserta per kafilah/utusan (manual atau impor Excel), lalu verifikasi berkas.
4. **Bank Soal & Maqra** — siapkan maqra dan lakukan undian; hasil undian tercatat permanen.
5. **Manajemen Babak** — atur kuota kelulusan, jumlah juara babak final, dan **penugasan hakim per babak dan per bidang**.
6. **Monitoring Penilaian** dan **Rekap Nilai Real-Time** — pantau kelengkapan penilaian. Rekap diperbarui otomatis.
7. **Hasil & Kelulusan** — sahkan hasil babak. Seri yang menentukan (batas kuota atau posisi juara di final) wajib diputuskan dalam **sidang pleno**.

## Penugasan hakim
- Satu penugasan = satu hakim, satu bidang, satu babak. Hakim yang memegang dua bidang mendapat dua penugasan.
- Setelah babak disahkan, buat penugasan baru untuk babak berikutnya. Lembar babak lama otomatis menjadi hanya-baca bagi hakim.

## Koreksi setelah dikunci
- Lembar yang sudah dikunci hakim hanya dapat dibuka kembali oleh admin **sebelum babak disahkan**, dengan alasan tertulis yang tercatat di log audit.

Butuh bantuan? Hubungi ${CONTACT_EMAIL}.`
  },
  {
    slug: 'privasi',
    title: 'Kebijakan Privasi',
    summary: 'Data apa yang kami olah, untuk apa, berapa lama, dan hak Anda.',
    category: 'kebijakan',
    status: 'published',
    effectiveDate: '2026-11-19',
    sortOrder: 90,
    showInFooter: true,
    isDefault: true,
    bodyMd: `> Draf awal. Mohon ditinjau oleh pihak yang memahami peraturan pelindungan data pribadi sebelum dinyatakan final.

## 1. Siapa kami
**Manajemen MTQ** (mtqsystem.web.id) adalah platform penilaian digital dan manajemen musabaqah yang digunakan oleh **penyelenggara** MTQ/STQ (misalnya LPTQ atau panitia). Penyelenggara menentukan data peserta apa yang dikumpulkan dan untuk apa; pengelola platform memproses data tersebut atas nama penyelenggara.

## 2. Data yang diolah
- **Peserta:** nama, nama ayah/wali, jenis kelamin, asal daerah/lembaga, kafilah/utusan, cabang dan jenjang lomba, nomor undian, maqra, nilai, dan status kelulusan.
- **Panitia, admin, dan dewan hakim:** nama, email, peran, penugasan, serta catatan aktivitas di aplikasi (log audit).
- **Data teknis:** alamat IP, jenis perangkat/browser, dan catatan akses yang dicatat otomatis oleh penyedia layanan hosting dan database.

## 3. Tujuan pengolahan
- Menyelenggarakan musabaqah: pendaftaran, verifikasi, undian, penilaian, rekapitulasi, dan pengesahan hasil.
- Menjaga akuntabilitas: mencatat siapa melakukan apa dan kapan (log audit).
- Menjaga keamanan dan keandalan layanan.

Data **tidak dijual** dan **tidak dipakai untuk iklan**.

## 4. Siapa yang dapat mengakses
- **Penyelenggara** (admin) — data penyelenggaraannya sendiri.
- **Dewan hakim** — data peserta pada babak dan bidang yang ditugaskan.
- **Pengelola platform** — untuk dukungan teknis dan pemeliharaan, terbatas pada yang diperlukan.
- **Penyedia layanan** — penyimpanan database dan hosting aplikasi, yang dapat berlokasi di luar Indonesia.

Hasil yang telah disahkan dapat diumumkan oleh penyelenggara sesuai ketentuan lomba.

## 5. Penyimpanan dan keamanan
- Akses dibatasi per peran dan per penyelenggara di tingkat database.
- Koneksi terenkripsi (HTTPS).
- Hasil yang disahkan bersifat permanen sebagai arsip resmi penyelenggaraan.
- Data disimpan selama diperlukan untuk penyelenggaraan dan arsip, sesuai keputusan penyelenggara.

## 6. Hak Anda
Anda dapat meminta akses, perbaikan, atau penghapusan data pribadi Anda. Permintaan terkait data peserta diajukan kepada **penyelenggara** lomba; permintaan lain dapat dikirim ke ${CONTACT_EMAIL}. Beberapa data (misalnya hasil yang telah disahkan dan log audit) mungkin perlu dipertahankan untuk kepentingan akuntabilitas.

## 7. Perubahan kebijakan
Kebijakan ini dapat diperbarui. Tanggal berlaku tercantum di halaman ini.

## 8. Kontak
${CONTACT_EMAIL}`
  },
  {
    slug: 'ketentuan',
    title: 'Ketentuan Penggunaan',
    summary: 'Aturan penggunaan platform bagi penyelenggara, panitia, dan dewan hakim.',
    category: 'kebijakan',
    status: 'published',
    effectiveDate: '2026-11-19',
    sortOrder: 91,
    showInFooter: true,
    isDefault: true,
    bodyMd: `> Draf awal. Mohon ditinjau sebelum dinyatakan final.

## 1. Penerimaan
Dengan menggunakan Manajemen MTQ, Anda menyetujui ketentuan ini.

## 2. Akun
- Akun hanya untuk panitia, admin, dan dewan hakim yang **diundang**. Pendaftaran mandiri tidak tersedia.
- Jaga kerahasiaan kata sandi. Setiap tindakan dengan akun Anda tercatat atas nama Anda.
- Segera hubungi penyelenggara bila akun Anda digunakan tanpa izin.

## 3. Kewajiban pengguna
- Mengisi data dengan benar dan sesuai kewenangan.
- Dewan hakim menilai secara jujur, hanya pada babak dan bidang yang ditugaskan.
- Tidak mencoba mengakses data penyelenggara lain atau melewati pembatasan sistem.

## 4. Hasil dan koreksi
- Nilai yang dikunci hakim dan hasil yang disahkan tercatat permanen.
- Koreksi hanya dapat dilakukan sebelum pengesahan, oleh admin, dengan alasan tertulis.
- Keputusan sidang pleno dewan hakim bersifat final sesuai ketentuan penyelenggara.

## 5. Ketersediaan layanan
Kami berupaya menjaga layanan tetap berjalan, termasuk saat koneksi terputus sesaat, namun tidak menjamin layanan bebas gangguan. Penyelenggara disarankan menyiapkan prosedur cadangan.

## 6. Data pribadi
Pengolahan data pribadi mengikuti **Kebijakan Privasi**.

## 7. Perubahan
Ketentuan ini dapat diperbarui. Tanggal berlaku tercantum di halaman ini.

## 8. Kontak
${CONTACT_EMAIL}`
  }
];

export const findDefaultPage = (slug: string): SitePage | undefined =>
  DEFAULT_SITE_PAGES.find((p) => p.slug === slug);

/** Gabungkan halaman dari database dengan bawaan: versi database menang untuk slug yang sama. */
export function mergeWithDefaultPages(dbPages: SitePage[]): SitePage[] {
  const bySlug = new Map<string, SitePage>();
  DEFAULT_SITE_PAGES.forEach((p) => bySlug.set(p.slug, p));
  dbPages.forEach((p) => bySlug.set(p.slug, p));
  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}


export { pageHref, slugFromPath } from './publicRoutes';
