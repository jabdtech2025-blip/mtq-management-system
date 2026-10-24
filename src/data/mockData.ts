import {
  Tenant,
  User,
  Kafilah,
  Participant,
  Question,
  ErrorCategory,
  JudgeAssessment,
  ActivityLogItem
} from '../types/mtq';

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: 'tenant-jabar',
    name: 'LPTQ Provinsi Jawa Barat',
    code: 'LPTQ-JBR',
    eventName: 'MTQ Nasional Tingkat Provinsi Jawa Barat XXXI 2025',
    region: 'Jawa Barat'
  },
  {
    id: 'tenant-dki',
    name: 'LPTQ Provinsi DKI Jakarta',
    code: 'LPTQ-DKI',
    eventName: 'MTQ Tingkat Provinsi DKI Jakarta XXX 2025',
    region: 'DKI Jakarta'
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin-rh',
    tenantId: 'tenant-jabar',
    username: 'admin_jabar',
    name: 'H. Rachmat Hidayat, S.Ag',
    role: 'admin'
  },
  {
    id: 'judge-1',
    tenantId: 'tenant-jabar',
    username: 'hakim_dahlan',
    name: 'KH. Ahmad Dahlan, M.Ag',
    role: 'judge',
    judgeCategory: 'Hakim 1',
    judgeField: 'Bidang Tajwid & Makhraj',
    mimbarLocation: 'Mimbar Utama Masjid Al-Jabbar'
  },
  {
    id: 'judge-2',
    tenantId: 'tenant-jabar',
    username: 'hakim_quraish',
    name: 'Dr. H. M. Quraish, MA',
    role: 'judge',
    judgeCategory: 'Hakim 2',
    judgeField: 'Bidang Fasahah & Waqf',
    mimbarLocation: 'Mimbar Utama Masjid Al-Jabbar'
  },
  {
    id: 'judge-3',
    tenantId: 'tenant-jabar',
    username: 'hakim_maria',
    name: 'Hj. Siti Maria, M.Ag',
    role: 'judge',
    judgeCategory: 'Hakim 3',
    judgeField: 'Bidang Lagu & Suara',
    mimbarLocation: 'Mimbar Utama Masjid Al-Jabbar'
  }
];

export const INITIAL_KAFILAHS: Kafilah[] = [
  {
    id: 'kf-bdg',
    tenantId: 'tenant-jabar',
    code: 'KF-BDG',
    name: 'Kota Bandung',
    region: 'Jawa Barat - Wilayah IV',
    participantCount: 16,
    contactPerson: 'Ust. Deden Supriatna',
    contactPhone: '0812-3456-7890',
    status: 'Aktif'
  },
  {
    id: 'kf-bgr',
    tenantId: 'tenant-jabar',
    code: 'KF-BGR',
    name: 'Kabupaten Bogor',
    region: 'Jawa Barat - Wilayah I',
    participantCount: 14,
    contactPerson: 'H. Aep Saepullah',
    contactPhone: '0813-8899-1234',
    status: 'Aktif'
  },
  {
    id: 'kf-tsk',
    tenantId: 'tenant-jabar',
    code: 'KF-TSK',
    name: 'Kota Tasikmalaya',
    region: 'Jawa Barat - Wilayah V',
    participantCount: 12,
    contactPerson: 'KH. Cecep Ridwan',
    contactPhone: '0852-1122-3344',
    status: 'Aktif'
  },
  {
    id: 'kf-crb',
    tenantId: 'tenant-jabar',
    code: 'KF-CRB',
    name: 'Kabupaten Cirebon',
    region: 'Jawa Barat - Wilayah III',
    participantCount: 15,
    contactPerson: 'H. Mansyur Effendi',
    contactPhone: '0878-5544-3322',
    status: 'Aktif'
  },
  {
    id: 'kf-bks',
    tenantId: 'tenant-jabar',
    code: 'KF-BKS',
    name: 'Kota Bekasi',
    region: 'Jawa Barat - Wilayah II',
    participantCount: 11,
    contactPerson: 'Ustazah Wardah',
    contactPhone: '0819-0987-6543',
    status: 'Aktif'
  },
  {
    id: 'kf-grt',
    tenantId: 'tenant-jabar',
    code: 'KF-GRT',
    name: 'Kabupaten Garut',
    region: 'Jawa Barat - Wilayah V',
    participantCount: 13,
    contactPerson: 'H. Ridwan Kamiludin',
    contactPhone: '0821-4455-6677',
    status: 'Aktif'
  }
];

export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 'mq-04',
    tenantId: 'tenant-jabar',
    code: 'MQ-TLW-04',
    title: 'Maqra 04: QS. Maryam [19]: 1 - 15',
    surahName: 'Maryam',
    surahNumber: 19,
    startAyah: 1,
    endAyah: 15,
    pageNumber: 305,
    branchAndLevel: 'Tilawah Dewasa Putra Ulya',
    stageName: 'Penyisihan',
    status: 'Aktif',
    description: "Dibaca dengan riwayat Hafs 'an 'Ashim Thariq Asy-Syathibiyyah..."
  },
  {
    id: 'mq-01',
    tenantId: 'tenant-jabar',
    code: 'MQ-TLW-01',
    title: "Maqra 01: QS. Al-An'am [6]: 95 - 99",
    surahName: "Al-An'am",
    surahNumber: 6,
    startAyah: 95,
    endAyah: 99,
    pageNumber: 140,
    branchAndLevel: 'Tilawah Dewasa Putra Ulya',
    stageName: 'Penyisihan',
    status: 'Aktif',
    description: "Dibaca dengan tartil dan riwayat Hafs. Diawali Bayyati..."
  },
  {
    id: 'mq-02',
    tenantId: 'tenant-jabar',
    code: 'MQ-TLW-02',
    title: 'Maqra 02: QS. Ibrahim [14]: 35 - 41',
    surahName: 'Ibrahim',
    surahNumber: 14,
    startAyah: 35,
    endAyah: 41,
    pageNumber: 260,
    branchAndLevel: 'Tilawah Dewasa Putra Ulya',
    stageName: 'Penyisihan',
    status: 'Aktif',
    description: 'Penekanan pada hukum waqf dan ibtida pada doa Nabi Ibrahim...'
  },
  {
    id: 'mq-03',
    tenantId: 'tenant-jabar',
    code: 'MQ-TLW-03',
    title: 'Maqra 03: QS. Al-Kahf [18]: 102 - 110',
    surahName: 'Al-Kahf',
    surahNumber: 18,
    startAyah: 102,
    endAyah: 110,
    pageNumber: 304,
    branchAndLevel: 'Tilawah Dewasa Putri Ulya',
    stageName: 'Penyisihan',
    status: 'Aktif',
    description: 'Khatam surat Al-Kahf dengan nada penutup Bayyati/Sika.'
  }
];

export const INITIAL_ERROR_CATEGORIES: ErrorCategory[] = [
  {
    id: 'cat-mkh',
    tenantId: 'tenant-jabar',
    code: 'MKH',
    name: 'Makharijul Huruf',
    scope: 'Ketepatan letak keluarnya huruf hijaiyyah, sifat huruf (jahr, hams, qalqalah, isti\'la)',
    defaultDeduction: 0.50,
    methodType: 'Pengurangan tetap',
    status: 'Aktif',
    order: 1
  },
  {
    id: 'cat-idg',
    tenantId: 'tenant-jabar',
    code: 'IDG',
    name: 'Idgham & Ghunnah',
    scope: 'Idgham bighunnah, bilaghunnah, ikhfa haqiqi, iqlab, ketukan ghunnah 2 harakat',
    defaultDeduction: 0.50,
    methodType: 'Pengurangan tetap',
    status: 'Aktif',
    order: 2
  },
  {
    id: 'cat-fsh',
    tenantId: 'tenant-jabar',
    code: 'FSH',
    name: 'Fasahah & Ahkamul Waqf',
    scope: 'Waqf & ibtida\', tammatul harakat (sempurna vokal), kelancaran, tidak terputus nafas mendadak',
    defaultDeduction: 1.00,
    methodType: 'Pengurangan berbobot',
    status: 'Aktif',
    order: 3
  },
  {
    id: 'cat-tjw',
    tenantId: 'tenant-jabar',
    code: 'TJW',
    name: 'Tajwid & Ahkamul Madd',
    scope: 'Kadar panjang mad wajib, jaiz, lazim, thabi\'i, tarqiq & tafkhim lam jalalah dan ra\'',
    defaultDeduction: 1.00,
    methodType: 'Pengurangan berbobot',
    status: 'Aktif',
    order: 4
  },
  {
    id: 'cat-lag',
    tenantId: 'tenant-jabar',
    code: 'LAG',
    name: 'Lagu, Suara & Irama',
    scope: 'Keutuhan maqam bayyati, shoba, hijaz, nahawand, sikah, rast, variasi nada dan keindahan suara',
    defaultDeduction: 1.00,
    methodType: 'Pengurangan berbobot',
    status: 'Aktif',
    order: 5
  }
];

export const INITIAL_PARTICIPANTS: Participant[] = [
  {
    id: 'part-04',
    tenantId: 'tenant-jabar',
    lotteryNumber: '04',
    participantId: 'TLW-004',
    name: 'Muhammad Fatih Al-Habsyi',
    gender: 'Putra',
    kafilahId: 'kf-bdg',
    kafilahName: 'Kota Bandung',
    branchName: 'Tilawah Dewasa Putra',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'mq-04',
    assignedMaqra: "Maqra 04: QS. Maryam [19]: 1 - 15 (Hal. 305)",
    pageNumber: 305,
    status: 'Berlangsung'
  },
  {
    id: 'part-01',
    tenantId: 'tenant-jabar',
    lotteryNumber: '01',
    participantId: 'TLW-001',
    name: 'Ahmad Syauqi Al-Bantani',
    gender: 'Putra',
    kafilahId: 'kf-bgr',
    kafilahName: 'Kabupaten Bogor',
    branchName: 'Tilawah Dewasa Putra',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'mq-01',
    assignedMaqra: "Maqra 01: QS. Al-An'am [6]: 95 - 99 (Hal. 140)",
    pageNumber: 140,
    status: 'Final'
  },
  {
    id: 'part-02',
    tenantId: 'tenant-jabar',
    lotteryNumber: '02',
    participantId: 'TLW-002',
    name: 'Zulfa Nur Ramadhani',
    gender: 'Putri',
    kafilahId: 'kf-tsk',
    kafilahName: 'Kota Tasikmalaya',
    branchName: 'Tilawah Dewasa Putri',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'mq-03',
    assignedMaqra: "Maqra 03: QS. Al-Kahf [18]: 102 - 110 (Hal. 304)",
    pageNumber: 304,
    status: 'Final'
  },
  {
    id: 'part-03',
    tenantId: 'tenant-jabar',
    lotteryNumber: '03',
    participantId: 'TLW-003',
    name: 'Fauzi Rahmatullah',
    gender: 'Putra',
    kafilahId: 'kf-crb',
    kafilahName: 'Kabupaten Cirebon',
    branchName: 'Tilawah Dewasa Putra',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'mq-02',
    assignedMaqra: "Maqra 02: QS. Ibrahim [14]: 35 - 41 (Hal. 260)",
    pageNumber: 260,
    status: 'Final'
  },
  {
    id: 'part-05',
    tenantId: 'tenant-jabar',
    lotteryNumber: '05',
    participantId: 'TLW-005',
    name: 'Siti Hanifah Az-Zahra',
    gender: 'Putri',
    kafilahId: 'kf-bks',
    kafilahName: 'Kota Bekasi',
    branchName: 'Tilawah Dewasa Putri',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'mq-04',
    assignedMaqra: "Maqra 04: QS. Maryam [19]: 1 - 15 (Hal. 305)",
    pageNumber: 305,
    status: 'Menunggu'
  },
  {
    id: 'part-06',
    tenantId: 'tenant-jabar',
    lotteryNumber: '06',
    participantId: 'TLW-006',
    name: 'Rifqi Hamdani',
    gender: 'Putra',
    kafilahId: 'kf-grt',
    kafilahName: 'Kabupaten Garut',
    branchName: 'Tilawah Dewasa Putra',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'mq-01',
    assignedMaqra: "Maqra 01: QS. Al-An'am [6]: 95 - 99 (Hal. 140)",
    pageNumber: 140,
    status: 'Menunggu'
  }
];

export const INITIAL_ASSESSMENTS: JudgeAssessment[] = [
  // Participant TLW-004 (Sedang Berlangsung)
  {
    id: 'asm-04-j1',
    tenantId: 'tenant-jabar',
    participantId: 'part-04',
    judgeId: 'judge-1',
    judgeName: 'KH. Ahmad Dahlan, M.Ag',
    judgeField: 'Bidang Tajwid & Makhraj',
    status: 'in_progress',
    errorCounts: {
      'cat-mkh': 1,
      'cat-idg': 1,
      'cat-fsh': 0,
      'cat-tjw': 1,
      'cat-lag': 0
    },
    deductions: {
      'cat-mkh': 0.50,
      'cat-idg': 0.50,
      'cat-fsh': 0.00,
      'cat-tjw': 1.00,
      'cat-lag': 0.00
    },
    totalDeductions: 2.00,
    finalScore: 98.00,
    annotations: [],
    note: 'Suara jernih, waspada ketukan ghunnah di ayat 4.',
    lastUpdated: '13:14:18 WIB'
  },
  {
    id: 'asm-04-j2',
    tenantId: 'tenant-jabar',
    participantId: 'part-04',
    judgeId: 'judge-2',
    judgeName: 'Dr. H. M. Quraish, MA',
    judgeField: 'Bidang Fasahah & Waqf',
    status: 'in_progress',
    errorCounts: {
      'cat-mkh': 0,
      'cat-idg': 0,
      'cat-fsh': 2,
      'cat-tjw': 0,
      'cat-lag': 0
    },
    deductions: {
      'cat-fsh': 2.00
    },
    totalDeductions: 2.00,
    finalScore: 98.00,
    annotations: [],
    lastUpdated: '13:12:00 WIB'
  },
  {
    id: 'asm-04-j3',
    tenantId: 'tenant-jabar',
    participantId: 'part-04',
    judgeId: 'judge-3',
    judgeName: 'Hj. Siti Maria, M.Ag',
    judgeField: 'Bidang Lagu & Suara',
    status: 'in_progress',
    errorCounts: {
      'cat-lag': 1
    },
    deductions: {
      'cat-lag': 1.00
    },
    totalDeductions: 1.00,
    finalScore: 99.00,
    annotations: [],
    lastUpdated: '13:13:00 WIB'
  },

  // Participant TLW-001 (Final 98.50)
  {
    id: 'asm-01-j1',
    tenantId: 'tenant-jabar',
    participantId: 'part-01',
    judgeId: 'judge-1',
    judgeName: 'KH. Ahmad Dahlan, M.Ag',
    judgeField: 'Bidang Tajwid & Makhraj',
    status: 'finalized',
    errorCounts: {
      'cat-mkh': 1,
      'cat-idg': 0,
      'cat-fsh': 0,
      'cat-tjw': 1,
      'cat-lag': 0
    },
    deductions: {
      'cat-mkh': 0.50,
      'cat-tjw': 1.00
    },
    totalDeductions: 1.50,
    finalScore: 98.50,
    annotations: [],
    lastUpdated: '11:45:00 WIB',
    finalizedAt: '11:45:10 WIB'
  },
  {
    id: 'asm-01-j2',
    tenantId: 'tenant-jabar',
    participantId: 'part-01',
    judgeId: 'judge-2',
    judgeName: 'Dr. H. M. Quraish, MA',
    judgeField: 'Bidang Fasahah & Waqf',
    status: 'finalized',
    errorCounts: {
      'cat-fsh': 1
    },
    deductions: {
      'cat-fsh': 1.00
    },
    totalDeductions: 1.00,
    finalScore: 99.00,
    annotations: [],
    lastUpdated: '11:46:00 WIB',
    finalizedAt: '11:46:05 WIB'
  },
  {
    id: 'asm-01-j3',
    tenantId: 'tenant-jabar',
    participantId: 'part-01',
    judgeId: 'judge-3',
    judgeName: 'Hj. Siti Maria, M.Ag',
    judgeField: 'Bidang Lagu & Suara',
    status: 'finalized',
    errorCounts: {
      'cat-lag': 1
    },
    deductions: {
      'cat-lag': 1.00
    },
    totalDeductions: 1.00,
    finalScore: 99.00,
    annotations: [],
    lastUpdated: '11:45:30 WIB',
    finalizedAt: '11:45:35 WIB'
  },

  // Participant TLW-002 (Final 99.50)
  {
    id: 'asm-02-j1',
    tenantId: 'tenant-jabar',
    participantId: 'part-02',
    judgeId: 'judge-1',
    judgeName: 'KH. Ahmad Dahlan, M.Ag',
    judgeField: 'Bidang Tajwid & Makhraj',
    status: 'finalized',
    errorCounts: {
      'cat-mkh': 0,
      'cat-idg': 1,
      'cat-fsh': 0,
      'cat-tjw': 0,
      'cat-lag': 0
    },
    deductions: {
      'cat-idg': 0.50
    },
    totalDeductions: 0.50,
    finalScore: 99.50,
    annotations: [],
    lastUpdated: '12:15:00 WIB',
    finalizedAt: '12:15:15 WIB'
  },
  {
    id: 'asm-02-j2',
    tenantId: 'tenant-jabar',
    participantId: 'part-02',
    judgeId: 'judge-2',
    judgeName: 'Dr. H. M. Quraish, MA',
    judgeField: 'Bidang Fasahah & Waqf',
    status: 'finalized',
    errorCounts: {
      'cat-fsh': 1
    },
    deductions: {
      'cat-fsh': 1.00
    },
    totalDeductions: 1.00,
    finalScore: 99.00,
    annotations: [],
    lastUpdated: '12:15:00 WIB',
    finalizedAt: '12:15:20 WIB'
  },
  {
    id: 'asm-02-j3',
    tenantId: 'tenant-jabar',
    participantId: 'part-02',
    judgeId: 'judge-3',
    judgeName: 'Hj. Siti Maria, M.Ag',
    judgeField: 'Bidang Lagu & Suara',
    status: 'finalized',
    errorCounts: {
      'cat-lag': 2
    },
    deductions: {
      'cat-lag': 2.00
    },
    totalDeductions: 2.00,
    finalScore: 98.00,
    annotations: [],
    lastUpdated: '12:16:00 WIB',
    finalizedAt: '12:16:05 WIB'
  },

  // Participant TLW-003 (Final 100.00)
  {
    id: 'asm-03-j1',
    tenantId: 'tenant-jabar',
    participantId: 'part-03',
    judgeId: 'judge-1',
    judgeName: 'KH. Ahmad Dahlan, M.Ag',
    judgeField: 'Bidang Tajwid & Makhraj',
    status: 'finalized',
    errorCounts: {
      'cat-mkh': 0,
      'cat-idg': 0,
      'cat-fsh': 0,
      'cat-tjw': 0,
      'cat-lag': 0
    },
    deductions: {},
    totalDeductions: 0.00,
    finalScore: 100.00,
    annotations: [],
    lastUpdated: '12:35:00 WIB',
    finalizedAt: '12:35:10 WIB'
  },
  {
    id: 'asm-03-j2',
    tenantId: 'tenant-jabar',
    participantId: 'part-03',
    judgeId: 'judge-2',
    judgeName: 'Dr. H. M. Quraish, MA',
    judgeField: 'Bidang Fasahah & Waqf',
    status: 'finalized',
    errorCounts: {},
    deductions: {},
    totalDeductions: 0.00,
    finalScore: 100.00,
    annotations: [],
    lastUpdated: '12:35:00 WIB',
    finalizedAt: '12:35:10 WIB'
  },
  {
    id: 'asm-03-j3',
    tenantId: 'tenant-jabar',
    participantId: 'part-03',
    judgeId: 'judge-3',
    judgeName: 'Hj. Siti Maria, M.Ag',
    judgeField: 'Bidang Lagu & Suara',
    status: 'finalized',
    errorCounts: {},
    deductions: {},
    totalDeductions: 0.00,
    finalScore: 100.00,
    annotations: [],
    lastUpdated: '12:35:00 WIB',
    finalizedAt: '12:35:10 WIB'
  }
];

export const INITIAL_ACTIVITY_LOGS: ActivityLogItem[] = [
  {
    id: 'act-1',
    tenantId: 'tenant-jabar',
    type: 'autosave',
    title: 'Simpan Otomatis (Autosave)',
    description: 'Pembaruan jumlah kesalahan kategori Tajwid & Ahkamul Madd (+1) untuk peserta TLW-004 Muhammad Fatih Al-Habsyi.',
    timestamp: '10:28:40 WIB'
  },
  {
    id: 'act-2',
    tenantId: 'tenant-jabar',
    type: 'annotation',
    title: 'Anotasi Mushaf Digital',
    description: 'Goresan tanda Tajwid Jali pada QS. Maryam [19]: 4 disimpan oleh KH. Ahmad Dahlan.',
    timestamp: '10:26:02 WIB'
  },
  {
    id: 'act-3',
    tenantId: 'tenant-jabar',
    type: 'finalized',
    title: 'Penilaian Final Dikunci',
    description: 'Penilaian peserta TLW-003 Fauzi Rahmatullah berhasil difinalisasi oleh 3 Dewan Hakim.',
    timestamp: '10:15:30 WIB'
  }
];

export interface QuranPageData {
  pageNumber: number;
  pageNumberArabic: string;
  surahName: string;
  surahNumber: number;
  surahType: string;
  totalAyah: number;
  juzNumber: number;
  juzName: string;
  hizbName: string;
  hasSurahHeader: boolean;
  hasBasmalah: boolean;
  lines: string[];
}

export const QURAN_PAGES_DATA: Record<number, QuranPageData> = {
  305: {
    pageNumber: 305,
    pageNumberArabic: '٣٠٥',
    surahName: 'مَرْيَمَ',
    surahNumber: 19,
    surahType: 'مَكِّيَّةٌ',
    totalAyah: 98,
    juzNumber: 16,
    juzName: 'الجزء السادس عشر',
    hizbName: 'الحزب الحادي والثلاثون',
    hasSurahHeader: true,
    hasBasmalah: true,
    lines: [
      'كٓهيعٓصٓ ﴿١﴾ ذِكْرُ رَحْمَتِ رَبِّكَ عَبْدَهُۥ زَكَرِيَّآ ﴿٢﴾',
      'إِذْ نَادَىٰ رَبَّهُۥ نِدَآءً خَفِيًّۭا ﴿٣﴾ قَالَ رَبِّ إِنِّى وَهَنَ',
      'ٱلْعَظْمُ مِنِّى وَٱشْتَعَلَ ٱلرَّأْسُ شَيْبًۭا وَلَمْ أَكُنۢ',
      'بِدُعَآئِكَ رَبِّ شَقِيًّۭا ﴿٤﴾ وَإِنِّى خِفْتُ ٱلْمَوَٰلِىَ مِن',
      'وَرَآءِى وَكَانَتِ ٱمْرَأَتِى عَاقِرًۭا فَهَبْ لِى مِن لَّدُنكَ',
      'وَلِيًّۭا ﴿٥﴾ يَرِثُنِى وَيَرِثُ مِنْ ءَالِ يَعْقُوبَ ۖ وَٱجْعَلْهُ',
      'رَبِّ رَضِيًّۭا ﴿٦﴾ يَٰزَكَرِيَّآ إِنَّا نُبَشِّرُكَ بِغُلَٰمٍ',
      'ٱسْمُهُۥ يَحْيَىٰ لَمْ نَجْعَل لَّهُۥ مِن قَبْلُ سَمِيًّۭا ﴿٧﴾',
      'قَالَ رَبِّ أَنَّىٰ يَكُونُ لِى غُلَٰمٌۭ وَكَانَتِ ٱمْرَأَتِى عَاقِرًۭا',
      'وَقَدْ بَلَغْتُ مِنَ ٱلْكِبَرِ عِتِيًّۭا ﴿٨﴾ قَالَ كَذَٰلِكَ قَالَ',
      'رَبُّكَ هُوَ عَلَىَّ هَيِّنٌۭ وَقَدْ خَلَقْتُكَ مِن قَبْلُ وَلَمْ',
      'تَكُ شَيْـًۭٔا ﴿٩﴾ قَالَ رَبِّ ٱجْعَل لِّىٓ ءَايَةًۭ ۚ قَالَ ءَايَتُكَ',
      'أَلَّا تُكَلِّمَ ٱلنَّاسَ ثَلَٰثَ لَيَالٍۢ سَوِيًّۭا ﴿١٠﴾ فَخَرَجَ',
      'عَلَىٰ قَوْمِهِۦ مِنَ ٱلْمِحْرَابِ فَأَوْحَىٰٓ إِلَيْهِمْ أَن سَبِّحُوا۟',
      'بُكْرَةًۭ وَعَشِيًّۭا ﴿١١﴾... ﴿١٥﴾'
    ]
  },
  140: {
    pageNumber: 140,
    pageNumberArabic: '١٤٠',
    surahName: "الأَنْعَامِ",
    surahNumber: 6,
    surahType: 'مَكِّيَّةٌ',
    totalAyah: 165,
    juzNumber: 7,
    juzName: 'الجزء السابع',
    hizbName: 'الحزب الرابع عشر',
    hasSurahHeader: false,
    hasBasmalah: false,
    lines: [
      '۞ إِنَّ ٱللَّهَ فَالِقُ ٱلْحَبِّ وَٱلنَّوَىٰ ۖ يُخْرِجُ ٱلْحَىَّ مِنَ',
      'ٱلْمَيِّتِ وَمُخْرِجُ ٱلْمَيِّتِ مِنَ ٱلْحَىِّ ۚ ذَٰلِكُمُ ٱللَّهُ ۖ',
      'فَأَنَّىٰ تُؤْفَكُونَ ﴿٩٥﴾ فَالِقُ ٱلْإِصْبَاحِ وَجَعَلَ ٱلَّيْلَ',
      'سَكَنًۭا وَٱلشَّمْسَ وَٱلْقَمَرَ حُسْبَانًۭا ۚ ذَٰلِكَ تَقْدِيرُ ٱلْعَزِيزِ',
      'ٱلْعَلِيمِ ﴿٩٦﴾ وَهُوَ ٱلَّذِى جَعَلَ لَكُمُ ٱلنُّجُومَ لِتَهْتَدُوا۟',
      'بِهَا فِى ظُلُمَٰتِ ٱلْبَرِّ وَٱلْبَحْرِ ۗ قَدْ فَصَّلْنَا ٱلْءَايَٰتِ',
      'لِقَوْمٍۢ يَعْلَمُونَ ﴿٩٧﴾ وَهُوَ ٱلَّذِىٓ أَنشَأَكُم مِّن نَّفْسٍۢ',
      'وَٰحِدَةٍۢ فَمُسْتَقَرٌّۭ وَمُسْتَوْدَعٌۭ ۗ قَدْ فَصَّلْنَا ٱلْءَايَٰتِ',
      'لِقَوْمٍۢ يَفْقَهُونَ ﴿٩٨﴾ وَهُوَ ٱلَّذِىٓ أَنزَلَ مِنَ ٱلسَّمَآءِ',
      'مَآءًۭ فَأَخْرَجْنَا بِهِۦ نَبَاتَ كُلِّ شَىْءٍۢ فَأَخْرَجْنَا مِنْهُ',
      'خَضِرًۭا نُّخْرِجُ مِنْهُ حَبًّۭا مُّتَرَاكِبًۭا وَمِنَ ٱلنَّخْلِ مِن',
      'طَلْعِهَا قِنْوَانٌۭ دَانِيَةٌۭ وَجَنَّٰتٍۢ مِّنْ أَعْنَابٍۢ وَٱلزَّيْتُونَ',
      'وَٱلرُّمَّانَ مُشْتَبِهًۭا وَغَيْرَ مُتَشَٰبِهٍ ۗ ٱنظُرُوٓا۟ إِلَىٰ ثَمَرِهِۦٓ',
      'إِذَآ أَثْمَرَ وَيَنْعِهِۦٓ ۚ إِنَّ فِى ذَٰلِكُمُ لَءَايَٰتٍۢ لِّقَوْمٍۢ',
      'يُؤْمِنُونَ ﴿٩٩﴾'
    ]
  },
  260: {
    pageNumber: 260,
    pageNumberArabic: '٢٦٠',
    surahName: 'إِبْرَاهِيمَ',
    surahNumber: 14,
    surahType: 'مَكِّيَّةٌ',
    totalAyah: 52,
    juzNumber: 13,
    juzName: 'الجزء الثالث عشر',
    hizbName: 'الحزب السادس والعشرون',
    hasSurahHeader: false,
    hasBasmalah: false,
    lines: [
      'وَإِذْ قَالَ إِبْرَٰهِيمُ رَبِّ ٱجْعَلْ هَٰذَا ٱلْبَلَدَ ءَامِنًۭا',
      'وَٱجْنُبْنِى وَبَنِىَّ أَن نَّعْبُدَ ٱلْأَصْنَامَ ﴿٣٥﴾ رَبِّ إِنَّهُنَّ',
      'أَضْلَلْنَ كَثِيرًۭا مِّنَ ٱلنَّاسِ ۖ فَمَن تَبِعَنِى فَإِنَّهُۥ مِنِّى ۖ',
      'وَمَنْ عَصَانِى فَإِنَّكَ غَفُورٌۭ رَّحِيمٌۭ ﴿٣٦﴾ رَّبَّنَآ إِنِّىٓ',
      'أَسْكَنتُ مِن ذُرِّيَّتِى بِوَادٍ غَيْرِ ذِى زَرْعٍ عِندَ بَيْتِكَ',
      'ٱلْمُحَرَّمِ رَبَّنَا لِيُقِيمُوا۟ ٱلصَّلَوٰةَ فَٱجْعَلْ أَفْـِٔدَةًۭ مِّنَ',
      'ٱلنَّاسِ تَهْوِىٓ إِلَيْهِمْ وَٱرْزُقْهُم مِّنَ ٱلثَّمَرَٰتِ لَعَلَّهُمْ',
      'يَشْكُرُونَ ﴿٣٧﴾ رَبَّنَآ إِنَّكَ تَعْلَمُ مَا نُخْفِى وَمَا نُعْلِنُ ۗ',
      'وَمَا يَخْفَىٰ عَلَى ٱللَّهِ مِن شَىْءٍۢ فِى ٱلْأَرْضِ وَلَا فِى ٱلسَّمَآءِ',
      '﴿٣٨﴾ ٱلْحَمْدُ لِلَّهِ ٱلَّذِى وَهَبَ لِى عَلَى ٱلْكِبَرِ إِسْمَٰعِيلَ',
      'وَإِسْحَٰقَ ۚ إِنَّ رَبِّى لَسَمِيعُ ٱلدُّعَآءِ ﴿٣٩﴾ رَبِّ ٱجْعَلْنِى',
      'مُقِيمَ ٱلصَّلَوٰةِ وَمِن ذُرِّيَّتِى ۚ رَبَّنَا وَتَقَبَّلْ دُعَآءِ ﴿٤٠﴾',
      'رَبَّنَا ٱغْفِرْ لِى وَلِوَٰلِدَىَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ',
      'ٱلْحِسَابُ ﴿٤١﴾ وَلَا تَحْسَبَنَّ ٱللَّهَ غَٰفِلًا عَمَّا يَعْمَلُ',
      'ٱلظَّٰلِمُونَ ۚ إِنَّمَا يُؤَخِّرُهُمْ لِيَوْمٍۢ تَشْخَصُ فِيهِ ٱلْأَبْصَٰرُ ﴿٤٢﴾'
    ]
  },
  304: {
    pageNumber: 304,
    pageNumberArabic: '٣٠٤',
    surahName: 'الكَهْفِ',
    surahNumber: 18,
    surahType: 'مَكِّيَّةٌ',
    totalAyah: 110,
    juzNumber: 16,
    juzName: 'الجزء السادس عشر',
    hizbName: 'الحزب الحادي والثلاثون',
    hasSurahHeader: false,
    hasBasmalah: false,
    lines: [
      'أَفَحَسِبَ ٱلَّذِينَ كَفَرُوٓا۟ أَن يَتَّخِذُوا۟ عِبَادِى مِن دُونِىٓ',
      'أَوْلِيَآءَ ۚ إِنَّآ أَعْتَدْنَا جَهَنَّمَ لِلْكَٰفِرِينَ نُزُلًۭا ﴿١٠٢﴾',
      'قُلْ هَلْ نُنَبِّئُكُم بِٱلْأَخْسَرِينَ أَعْمَٰلًا ﴿١٠٣﴾ ٱلَّذِينَ ضَلَّ',
      'سَعْيُهُمْ فِى ٱلْحَيَوٰةِ ٱلدُّنْيَا وَهُمْ يَحْسَبُونَ أَنَّهُمْ يُحْسِنُونَ',
      'صُنْعًا ﴿١٠٤﴾ أُو۟لَٰٓئِكَ ٱلَّذِينَ كَفَرُوا۟ بِـَٔايَٰتِ رَبِّهِمْ وَلِقَآئِهِۦ',
      'فَحَبِطَتْ أَعْمَٰلُهُمْ فَلَا نُقِيمُ لَهُمْ يَوْمَ ٱلْقِيَٰمَةِ وَزْنًۭا ﴿١٠٥﴾',
      'ذَٰلِكَ جَزَآؤُهُمْ جَهَنَّمُ بِمَا كَفَرُوا۟ وَٱتَّخَذُوٓا۟ ءَايَٰتِى وَرُسُلِى',
      'هُزُوًا ﴿١٠٦﴾ إِنَّ ٱلَّذِينَ ءَامَنُوا۟ وَعَمِلُوا۟ ٱلصَّٰلِحَٰتِ كَانَتْ',
      'لَهُمْ جَنَّٰتُ ٱلْفِرْدَوْسِ نُزُلًا ﴿١٠٧﴾ خَٰلِدِينَ فِيهَا لَا يَبْغُونَ',
      'عَنْهَا حِوَلًۭا ﴿١٠٨﴾ قُل لَّوْ كَانَ ٱلْبَحْرُ مِدَادًۭا لِّكَلِمَٰتِ رَبِّى',
      'لَنَفِدَ ٱلْبَحْرُ قَبْلَ أَن تَنفَدَ كَلِمَٰتُ رَبِّى وَلَوْ جِئْنَا بِمِثْلِهِۦ',
      'مَدَدًۭا ﴿١٠٩﴾ قُلْ إِنَّمَآ أَنَا۠ بَشَرٌۭ مِّثْلُكُمْ يُوحَىٰٓ إِلَىَّ',
      'أَنَّمَآ إِلَٰهُكُمْ إِلَٰهٌۭ وَٰحِدٌۭ ۖ فَمَن كَانَ يَرْجُوا۟ لِقَآءَ رَبِّهِۦ',
      'فَلْيَعْمَلْ عَمَلًۭا صَٰلِحًۭا وَلَا يُشْرِكْ بِعِبَادَةِ رَبِّهِۦٓ أَحَدًۢا',
      '﴿١١٠﴾'
    ]
  }
};
