/**
 * Seluruh teks landing page ada di sini (bukan di JSX), supaya nanti bisa
 * diganti CMS tanpa mengubah komponen. Ubah isi di file ini saja.
 */

export interface LandingContact {
  address: string;
  email: string;
  whatsappNumber: string; // format internasional tanpa '+', mis. 6282134342089
  whatsappDisplay: string;
  whatsappMessage: string;
}

export interface LandingCard {
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  imagePosition?: string; // object-position CSS
}

export interface LandingStep {
  title: string;
  body: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
}

export interface LandingContent {
  brand: { name: string; tagline: string; markCaption: string };
  nav: { label: string; href: string }[];
  hero: {
    chip: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    highlights: string[];
    backgroundImage: string;
  };
  background: { chip: string; title: string; body: string; cards: LandingCard[] };
  roles: { chip: string; title: string; backdrop: string; items: { title: string; body: string }[] };
  steps: { chip: string; title: string; body: string; items: LandingStep[] };
  features: { chip: string; title: string; body: string; cards: LandingCard[] };
  integrity: {
    chip: string;
    title: string;
    body: string;
    points: string[];
    logImage: string;
    logImageAlt: string;
    logWindowTitle: string;
    lockBadgeTitle: string;
    lockBadgeBody: string;
  };
  faq: { title: string; items: LandingFaq[]; contactPrompt: string };
  cta: { title: string; body: string; primary: string; secondary: string };
  footer: { about: string; copyright: string };
  contact: LandingContact;
}

export const landingContent: LandingContent = {
  brand: {
    name: 'Manajemen MTQ',
    tagline: 'E-Scoring Musabaqah',
    markCaption: 'MUSABAQAH · DIGITAL'
  },
  nav: [
    { label: 'Beranda', href: '#beranda' },
    { label: 'Fitur', href: '#fitur' },
    { label: 'Tahapan', href: '#tahapan' },
    { label: 'Integritas', href: '#integritas' },
    { label: 'Tanya Jawab', href: '#tanya-jawab' }
  ],
  hero: {
    chip: 'Sistem Penilaian MTQ & STQ',
    title: 'Penilaian yang tertib, hasil yang dapat dipertanggungjawabkan.',
    subtitle:
      'Mendukung panitia dan dewan hakim dari pendaftaran peserta sampai pengesahan juara, dengan setiap keputusan terekam dalam log audit permanen.',
    primaryCta: 'Masuk Panitia & Dewan Hakim',
    secondaryCta: 'Pelajari Tahapannya',
    highlights: ['Mushaf Madinah 604 halaman', 'Nilai dihitung server', 'Hasil terkunci setelah disahkan'],
    backgroundImage: '/landing/hero-podium.webp'
  },
  background: {
    chip: 'Latar Belakang',
    title: 'Tiga tantangan yang kami jawab',
    body: 'Rekapitulasi manual memakan waktu, rawan salah hitung, dan sulit dipertanggungjawabkan saat ada keberatan.',
    cards: [
      {
        title: 'Waktu rekapitulasi',
        body: 'Nilai tersedia saat hakim mengunci lembar, tanpa menyalin ulang dari kertas.',
        image: '/landing/app-rekap.webp',
        imageAlt: 'Rekap nilai real-time per dewan hakim',
        imagePosition: '30% 40%'
      },
      {
        title: 'Ketepatan perhitungan',
        body: 'Potongan dan peringkat dihitung server sesuai rubrik yang ditetapkan panitia.',
        image: '/landing/app-hasil.webp',
        imageAlt: 'Peringkat dan kuota kelulusan babak',
        imagePosition: '45% 45%'
      },
      {
        title: 'Akuntabilitas keputusan',
        body: 'Undian, koreksi, dan pengesahan terekam lengkap untuk menjawab keberatan.',
        image: '/landing/app-banksoal.webp',
        imageAlt: 'Bank soal dengan riwayat dan audit undian',
        imagePosition: '40% 18%'
      }
    ]
  },
  roles: {
    chip: 'Pengguna',
    title: 'Peran yang jelas, wewenang yang terbatas',
    backdrop: '/landing/app-dashboard.webp',
    items: [
      {
        title: 'Panitia & LPTQ',
        body: 'Mengelola peserta, rubrik, bank soal, undian, pemantauan penilaian, dan pengesahan hasil.'
      },
      {
        title: 'Dewan Hakim',
        body: 'Menilai peserta pada babak dan bidang yang ditugaskan; tidak dapat mengubah lembar hakim lain.'
      },
      {
        title: 'Pengelola Platform',
        body: 'Membuka penyelenggara baru, menunjuk administrator, dan memantau audit seluruh platform.'
      }
    ]
  },
  steps: {
    chip: 'Tahapan',
    title: 'Enam tahapan penyelenggaraan',
    body: 'Setiap tahapan memiliki syarat yang diperiksa sistem sebelum tahap berikutnya dibuka.',
    items: [
      { title: 'Pendaftaran', body: 'Per kafilah atau utusan daerah, manual atau impor Excel.' },
      { title: 'Verifikasi Berkas', body: 'Diterima atau ditolak dengan catatan; hanya yang terverifikasi ikut undian.' },
      { title: 'Undian Maqra', body: 'Nomor tampil dan maqra diundi server dan tercatat permanen.' },
      { title: 'Penilaian Hakim', body: 'Setiap hakim menilai bidang tugasnya, lalu mengunci lembar.' },
      { title: 'Rekap & Sidang Pleno', body: 'Peringkat tersusun otomatis; seri yang menentukan diputuskan pleno.' },
      { title: 'Pengesahan & Juara', body: 'Hasil dibekukan sebagai snapshot resmi yang final dan mengikat.' }
    ]
  },
  features: {
    chip: 'Fitur',
    title: 'Kelengkapan untuk penyelenggaraan resmi',
    body: 'Mushaf Madinah 604 halaman, perhitungan di server, dan banyak penyelenggara dalam satu platform.',
    cards: [
      {
        title: 'Undian maqra terverifikasi',
        body: 'Benih acak tercatat dengan sidik SHA-256; hasil dapat dihitung ulang.',
        image: '/landing/app-banksoal.webp',
        imageAlt: 'Halaman Bank Soal & Maqra',
        imagePosition: '38% 20%'
      },
      {
        title: 'Verifikasi berkas peserta',
        body: 'Impor dari Excel; penolakan wajib disertai catatan.',
        image: '/landing/app-peserta.webp',
        imageAlt: 'Halaman Kafilah & Peserta dengan status verifikasi',
        imagePosition: '50% 30%'
      },
      {
        title: 'Peringkat dan sidang pleno',
        body: 'Tie-break sesuai juknis; seri yang menentukan diputuskan pleno.',
        image: '/landing/app-hasil.webp',
        imageAlt: 'Halaman Hasil & Kelulusan dengan peringkat peserta',
        imagePosition: '60% 55%'
      }
    ]
  },
  integrity: {
    chip: 'Integritas',
    title: 'Aturan dijaga di tingkat database',
    body: 'Berlaku untuk seluruh peran, termasuk pengelola platform, sehingga tidak dapat dilewati dari aplikasi.',
    points: [
      'Hasil yang disahkan dibekukan permanen',
      'Setiap tindakan penting tercatat',
      'Hakim hanya menilai bidang tugasnya',
      'Data antar-penyelenggara terpisah',
      'Koreksi hanya oleh admin, dengan alasan',
      'Tetap berjalan saat koneksi putus sesaat'
    ],
    logImage: '/landing/app-log.webp',
    logImageAlt: 'Log aktivitas berisi tindakan pengguna, modul, dan rincian yang tercatat permanen',
    logWindowTitle: 'Log Aktivitas · permanen',
    lockBadgeTitle: 'Hasil Babak Final terkunci',
    lockBadgeBody: 'Snapshot resmi · tidak dapat diubah'
  },
  faq: {
    title: 'Pertanyaan yang sering diajukan',
    items: [
      {
        question: 'Apakah peserta perlu membuat akun?',
        answer: 'Tidak. Akun hanya untuk panitia dan dewan hakim, dibuat atau diundang oleh administrator.'
      },
      {
        question: 'Perangkat apa yang dibutuhkan dewan hakim?',
        answer: 'Tablet atau laptop dengan browser modern. Tidak perlu memasang aplikasi tambahan.'
      },
      {
        question: 'Bagaimana bila koneksi internet terputus?',
        answer: 'Perubahan disimpan sementara di perangkat dan dikirim otomatis saat koneksi pulih.'
      },
      {
        question: 'Apakah rubrik dapat mengikuti juknis setempat?',
        answer:
          'Dapat. Bidang, nilai maksimum, bobot potongan, kuota, dan urutan tie-break ditetapkan panitia per cabang.'
      },
      {
        question: 'Bagaimana penanganan nilai seri?',
        answer:
          'Sistem menerapkan urutan tie-break dari juknis. Bila tetap seri di batas kuota kelulusan atau di posisi juara babak final, pengesahan menunggu keputusan sidang pleno.'
      },
      {
        question: 'Apakah hasil dapat diubah setelah disahkan?',
        answer:
          'Tidak. Hasil yang disahkan bersifat final dan mengikat; koreksi hanya dapat dilakukan sebelum pengesahan.'
      }
    ],
    contactPrompt: 'Masih ada pertanyaan? Hubungi kami lewat WhatsApp'
  },
  cta: {
    title: 'Mulai gunakan untuk penyelenggaraan berikutnya',
    body: 'Hubungi pengelola untuk pembukaan akun penyelenggara.',
    primary: 'Masuk Sistem',
    secondary: 'Hubungi Pengelola'
  },
  footer: {
    about: 'Platform e-scoring dan manajemen musabaqah untuk penyelenggaraan MTQ dan STQ.',
    copyright: 'Manajemen MTQ. Seluruh hak dilindungi.'
  },
  contact: {
    address: 'Kalibagor, Banyumas, Jawa Tengah',
    email: 'admin@mtqsystem.web.id',
    whatsappNumber: '6282134342089',
    whatsappDisplay: '+62 821-3434-2089',
    whatsappMessage: "Assalamu'alaikum, saya ingin informasi tentang Manajemen MTQ."
  }
};

export const whatsappLink = (contact: LandingContact): string =>
  `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(contact.whatsappMessage)}`;

/* -------------------------------------------------------------------------- */
/*  CMS ringan: penggabungan isi dari Superadmin (tabel site_content) dengan   */
/*  isi bawaan di atas. Field yang kosong / tidak ada => memakai bawaan.        */
/* -------------------------------------------------------------------------- */

/** Nama field berisi URL gambar. Bila dikosongkan, gambar bawaan dari repo dipakai. */
export const LANDING_IMAGE_KEYS = new Set(['image', 'backgroundImage', 'backdrop', 'logImage']);

/** Bagian yang tidak boleh diubah lewat CMS (struktur navigasi & identitas teknis). */
export const LANDING_LOCKED_KEYS = new Set(['nav', 'markCaption']);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** URL gambar yang diizinkan: https:// atau path situs (/…). */
export const isSafeImageUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^(https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)$/i.test(v.trim());

function mergeValue(base: unknown, override: unknown, key: string, fallbackItem?: unknown): unknown {
  if (LANDING_LOCKED_KEYS.has(key)) return base;
  if (override === undefined || override === null) return base;

  if (LANDING_IMAGE_KEYS.has(key)) {
    return isSafeImageUrl(override) ? override.trim() : base;
  }
  if (typeof base === 'string') {
    return typeof override === 'string' && override.trim() !== '' ? override : base;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    const template = base[0] ?? fallbackItem;
    return override
      .map((item, idx) => {
        const baseItem = base[idx] ?? template;
        if (typeof baseItem === 'string') return typeof item === 'string' && item.trim() !== '' ? item : null;
        return mergeValue(baseItem, item, String(idx), template);
      })
      .filter((item) => item !== null);
  }
  if (isPlainObject(base)) {
    if (!isPlainObject(override)) return base;
    const result: Record<string, unknown> = {};
    Object.keys(base).forEach((k) => {
      result[k] = mergeValue(base[k], override[k], k, isPlainObject(fallbackItem) ? fallbackItem[k] : undefined);
    });
    return result;
  }
  return base;
}

/** Gabungkan isi CMS ke isi bawaan. Struktur selalu mengikuti bawaan, jadi isi CMS yang rusak tidak merusak halaman. */
export function mergeLandingContent(override: unknown, base: LandingContent = landingContent): LandingContent {
  if (!isPlainObject(override)) return base;
  return mergeValue(base, override, '') as LandingContent;
}
