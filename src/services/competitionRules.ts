import { RubricVersion, CompetitionRuleConfig } from '../types/mtq';

/**
 * ATURAN RESMI DAN MATRIKS KOMPETISI MTQ
 * 
 * Sumber Terverifikasi:
 * 1. Buku Pedoman Musabaqah Al-Qur'an dan Al-Hadits 2025 (LPTQ Jateng / Kemenag RI)
 *    - Bidang Seni Baca Al-Qur'an (hal. 42-45):
 *      - Tajwid: Maks 30
 *      - Fashahah: Maks 30
 *      - Lagu: Maks 25
 *      - Suara: Maks 15
 *      - Total Maksimum: 100
 *    - Prosedur Penyelesaian Nilai Seri (Tie-Break) Seni Baca:
 *      1. Jumlah Nilai Total Tertinggi
 *      2. Nilai Bidang Tajwid
 *      3. Nilai Bidang Lagu
 *      4. Nilai Bidang Fashahah
 *      5. Penampilan Ulang / Keputusan Sidang Pleno Dewan Hakim
 * 
 * 2. Juknis MTQ Nasional XXXI Tahun 2026:
 *    - Mayoritas cabang berlangsung dalam 2 babak (Penyisihan dan Final).
 *    - MFQ (Fahmil) dan KTIQ (Karya Tulis Ilmiah) berlangsung dalam 3 babak.
 *    - Penetapan Maqra: Tilawah Dewasa ditetapkan sebelum naik mimbar (Penyisihan) dan 1 jam sebelum (Final).
 */

export const OFFICIAL_SENI_BACA_RUBRIC: RubricVersion = {
  id: 'rubric-seni-baca-2025',
  tenantId: 'system',
  code: 'RUBRIC-SENI-BACA-2025',
  name: "Rubrik Resmi Seni Baca Al-Qur'an (Pedoman MTQ 2025)",
  branchCode: 'TLW',
  branchName: 'Tilawah',
  version: '2025.1',
  description: 'Rubrik resmi LPTQ/Kemenag untuk Cabang Seni Baca Al-Qur’an (Tilawah Anak, Remaja, Dewasa, Mujawwad/Murattal).',
  officialSource: 'Buku Pedoman Musabaqah Al-Qur’an dan Al-Hadits 2025 hal. 42-45',
  status: 'Aktif',
  startingScore: 100,
  createdAt: '2025-04-25T00:00:00Z',
  fields: [
    {
      id: 'field-tjw',
      code: 'TJW',
      name: 'Tajwid',
      maxScore: 30,
      minScore: 0,
      order: 1,
      description: 'Makharijul huruf, shifatul huruf, ahkamul madd wal qashr, ahkamul waqf wal ibtida, ahkamul huruf.',
      criteria: [
        {
          id: 'crit-tjw-jali',
          fieldId: 'field-tjw',
          code: 'TJW-JALI',
          name: 'Kesalahan Jali (Nyata)',
          description: 'Perubahan huruf, harakat, atau struktur lafal yang merusak makna.',
          maxDeduction: 30,
          deductionRules: [
            {
              id: 'rule-tjw-jali',
              criterionId: 'crit-tjw-jali',
              name: 'Kesalahan Jali',
              errorGrade: 'Jali',
              deductionPoints: 1.0,
              methodType: 'Pengurangan tetap'
            }
          ]
        },
        {
          id: 'crit-tjw-khafi',
          fieldId: 'field-tjw',
          code: 'TJW-KHAFI',
          name: 'Kesalahan Khafi (Samar)',
          description: 'Kekurangan pada ghunnah, mad, tarqiq/tafkhim yang tidak merusak harakat pokok.',
          maxDeduction: 20,
          deductionRules: [
            {
              id: 'rule-tjw-khafi',
              criterionId: 'crit-tjw-khafi',
              name: 'Kesalahan Khafi',
              errorGrade: 'Khafi',
              deductionPoints: 0.5,
              methodType: 'Pengurangan tetap'
            }
          ]
        }
      ]
    },
    {
      id: 'field-fsh',
      code: 'FSH',
      name: 'Fashahah',
      maxScore: 30,
      minScore: 0,
      order: 2,
      description: 'Muraatul huruf wal harakat, muraatul waqf wal ibtida, suara bersih, kelancaran bacaan.',
      criteria: [
        {
          id: 'crit-fsh-waqf',
          fieldId: 'field-fsh',
          code: 'FSH-WQF',
          name: 'Kesalahan Waqaf dan Ibtida',
          description: 'Waqaf qabih, ibtida bil ma’na al-fasid, terputus nafas di tengah lafal.',
          maxDeduction: 30,
          deductionRules: [
            {
              id: 'rule-fsh-waqf',
              criterionId: 'crit-fsh-waqf',
              name: 'Kesalahan Waqaf/Ibtida',
              errorGrade: 'Jali',
              deductionPoints: 1.0,
              methodType: 'Pengurangan tetap'
            }
          ]
        },
        {
          id: 'crit-fsh-lancar',
          fieldId: 'field-fsh',
          code: 'FSH-LNC',
          name: 'Kelancaran & Fashahah Kalimah',
          description: 'Tersendat, pengulangan tidak wajar, tempo terganggu.',
          maxDeduction: 20,
          deductionRules: [
            {
              id: 'rule-fsh-lancar',
              criterionId: 'crit-fsh-lancar',
              name: 'Kekurangan Kelancaran',
              errorGrade: 'Khafi',
              deductionPoints: 0.5,
              methodType: 'Pengurangan tetap'
            }
          ]
        }
      ]
    },
    {
      id: 'field-lag',
      code: 'LAG',
      name: 'Lagu',
      maxScore: 25,
      minScore: 0,
      order: 3,
      description: 'Keutuhan dan variasi lagu, keserasian tempo, perpindahan maqam lagu minimal 3 maqam.',
      criteria: [
        {
          id: 'crit-lag-irama',
          fieldId: 'field-lag',
          code: 'LAG-IRM',
          name: 'Kekurangan Variasi & Keindahan Maqam',
          description: 'Kurang dari 3 maqam, perpindahan lagu kaku, fashilah monoton.',
          maxDeduction: 25,
          deductionRules: [
            {
              id: 'rule-lag-irama',
              criterionId: 'crit-lag-irama',
              name: 'Pengurangan Lagu',
              errorGrade: 'Sedang',
              deductionPoints: 0.5,
              methodType: 'Pengurangan tetap'
            }
          ]
        }
      ]
    },
    {
      id: 'field-sua',
      code: 'SUA',
      name: 'Suara',
      maxScore: 15,
      minScore: 0,
      order: 4,
      description: 'Kejernihan suara, kehalusan, kenyaringan, jangkauan nada (tinggi/rendah), dan pengaturan nafas.',
      criteria: [
        {
          id: 'crit-sua-vokal',
          fieldId: 'field-sua',
          code: 'SUA-VKL',
          name: 'Kekurangan Kualitas Suara & Nafas',
          description: 'Suara serak/pecah, nafas terputus sebelum fashilah, ketidakstabilan nada.',
          maxDeduction: 15,
          deductionRules: [
            {
              id: 'rule-sua-vokal',
              criterionId: 'crit-sua-vokal',
              name: 'Pengurangan Suara',
              errorGrade: 'Sedang',
              deductionPoints: 0.5,
              methodType: 'Pengurangan tetap'
            }
          ]
        }
      ]
    }
  ]
};

/**
 * Konfigurasi aturan kompetisi per cabang.
 * Terverifikasi vs Konfigurasi Fleksibel.
 */
export const DEFAULT_COMPETITION_RULES: Record<string, CompetitionRuleConfig> = {
  'Tilawah': {
    id: 'rule-cfg-tilawah',
    tenantId: 'system',
    branchName: 'Tilawah',
    branchCode: 'TLW',
    rubricVersionId: 'rubric-seni-baca-2025',
    // Urutan resmi: Total -> Tajwid -> Lagu -> Fashahah (Pedoman 2025)
    tieBreakOrder: ['total', 'Tajwid', 'Lagu', 'Fashahah'],
    quotaPerStage: {
      'Penyisihan': 3,
      'Final': 3
    },
    maqraTiming: 'sebelum_mimbar',
    officialSource: 'Buku Pedoman Musabaqah Al-Qur’an dan Al-Hadits 2025 hal. 42-45',
    isVerifiedOfficial: true
  },
  'Tahfizh': {
    id: 'rule-cfg-tahfizh',
    tenantId: 'system',
    branchName: 'Tahfizh',
    branchCode: 'THF',
    rubricVersionId: 'rubric-tahfizh-default',
    // Tahfizh: Total -> Tahfizh (Kelancaran) -> Tajwid -> Fashahah
    tieBreakOrder: ['total', 'Tahfizh', 'Tajwid', 'Fashahah'],
    quotaPerStage: {
      'Penyisihan': 3,
      'Final': 3
    },
    maqraTiming: 'saat_undian',
    officialSource: 'Buku Pedoman Musabaqah 2025 (Ketentuan Khusus Tahfizh)',
    isVerifiedOfficial: true
  },
  'Fahmil': {
    id: 'rule-cfg-fahmil',
    tenantId: 'system',
    branchName: 'Fahmil',
    branchCode: 'MFQ',
    rubricVersionId: 'rubric-fahmil-default',
    tieBreakOrder: ['total', 'Paket Reguler', 'Rebutan'],
    quotaPerStage: {
      'Penyisihan': 3,
      'Semi Final': 3,
      'Final': 3
    },
    officialSource: 'Juknis MTQN 2026 (Kompetisi Cepat Tepat Regu)',
    isVerifiedOfficial: true
  }
};

export const OFFICIAL_TAHFIZH_RUBRIC: RubricVersion = {
  id: 'rubric-tahfizh-default',
  tenantId: 'system',
  code: 'RUBRIC-TAHFIZH-2025',
  name: "Rubrik Resmi Tahfizh Al-Qur'an (Pedoman MTQ 2025)",
  branchCode: 'THF',
  branchName: 'Tahfizh',
  version: '2025.1',
  description: 'Rubrik resmi untuk Cabang Hifzhil Qur’an (1 Juz, 5 Juz, 10 Juz, 20 Juz, 30 Juz).',
  officialSource: 'Buku Pedoman Musabaqah 2025 (Ketentuan Khusus Tahfizh)',
  status: 'Aktif',
  startingScore: 100,
  createdAt: '2025-04-25T00:00:00Z',
  fields: [
    {
      id: 'field-thf-lancar',
      code: 'THF',
      name: 'Tahfizh',
      maxScore: 50,
      minScore: 0,
      order: 1,
      description: 'Kelancaran hafalan, tawaqquf, tarkul ayat, terbalik ayat, dan pengulangan.'
    },
    {
      id: 'field-thf-tjw',
      code: 'TJW',
      name: 'Tajwid',
      maxScore: 25,
      minScore: 0,
      order: 2,
      description: 'Makharijul huruf, shifatul huruf, ahkamul mad wal waqf.'
    },
    {
      id: 'field-thf-fsh',
      code: 'FSH',
      name: 'Fashahah',
      maxScore: 25,
      minScore: 0,
      order: 3,
      description: 'Fashahah kalimah, waqaf dan ibtida, suara dan adab.'
    }
  ]
};

export const INITIAL_RUBRIC_VERSIONS: RubricVersion[] = [
  OFFICIAL_SENI_BACA_RUBRIC,
  OFFICIAL_TAHFIZH_RUBRIC
];

/**
/**
 * Mencari konfigurasi aturan kompetisi berdasarkan nama cabang, tenant, dan branchId.
 * Prioritas:
 * 1. Konfigurasi dinamis tenant dari database / state admin (customConfigs) via branchId atau branchName
 * 2. Pencocokan langsung cabang standar yang terverifikasi (Tahfizh, Tilawah, Fahmil)
 * 3. HAPUS FALLBACK DIAM-DIAM KE SENI BACA: Cabang yang belum dikonfigurasi ditandai 'Draft'
 *    dengan rubricVersionId kosong agar sistem menuntut konfigurasi sah dari Administrator.
 */
export function getBranchRuleConfig(
  branchName: string,
  tenantId?: string,
  customConfigs?: CompetitionRuleConfig[],
  branchId?: string
): CompetitionRuleConfig {
  // 1. Periksa konfigurasi dinamis yang dikelola oleh Administrator via branchId atau branchName
  if (customConfigs && customConfigs.length > 0) {
    if (branchId) {
      const byBranchId = customConfigs.find(
        (c) =>
          (!tenantId || c.tenantId === tenantId || c.tenantId === 'system') &&
          c.branchId === branchId &&
          c.status !== 'Arsip'
      );
      if (byBranchId) return byBranchId;
    }

    const directMatch = customConfigs.find(
      (c) =>
        (!tenantId || c.tenantId === tenantId || c.tenantId === 'system') &&
        c.status !== 'Arsip' &&
        (c.branchName.toLowerCase() === branchName.toLowerCase() ||
          branchName.toLowerCase().startsWith(c.branchName.toLowerCase()))
    );
    if (directMatch) return directMatch;
  }

  const normalized = branchName.toLowerCase();

  // 2. Pencocokan ke template standar yang diverifikasi resmi
  if (normalized.includes('tahfizh') || normalized.includes('hifzh') || normalized.includes('juz')) {
    return {
      ...DEFAULT_COMPETITION_RULES['Tahfizh'],
      tenantId: tenantId || 'system',
      branchName,
      branchId
    };
  }

  if (normalized.includes('tilawah') || normalized.includes('seni baca') || normalized.includes('tartil') || normalized.includes('murattal') || normalized.includes('mujawwad')) {
    return {
      ...DEFAULT_COMPETITION_RULES['Tilawah'],
      tenantId: tenantId || 'system',
      branchName,
      branchId
    };
  }

  if (normalized.includes('fahmil') || normalized.includes('mfq')) {
    return {
      ...DEFAULT_COMPETITION_RULES['Fahmil'],
      tenantId: tenantId || 'system',
      branchName,
      branchId
    };
  }

  // 3. Cabang belum terverifikasi: DILARANG FALLBACK KE SENI BACA ATAU KUOTA 3!
  // Menghasilkan konfigurasi Draft tanpa rubricVersionId agar proses menuntut penetapan admin di UI.
  return {
    id: `rule-cfg-${branchName.replace(/\s+/g, '-').toLowerCase()}`,
    tenantId: tenantId || 'system',
    branchName,
    branchCode: 'UNCONFIGURED',
    branchId,
    rubricVersionId: '', // Sengaja dikosongkan untuk mencegah silent fallback
    tieBreakOrder: ['total'],
    quotaPerStage: {},
    officialSource: 'Belum Dikonfigurasi (Wajib Ditetapkan Administrator di Master Data)',
    isVerifiedOfficial: false,
    status: 'Draft'
  };
}

/**
 * Resolusi Rubrik Aktif untuk suatu cabang secara aman tanpa fallback diam-diam.
 * Jika konfigurasi atau rubrik aktif tidak ditemukan, mengembalikan error deskriptif.
 */
export function resolveActiveRubricForBranch(params: {
  branchName: string;
  branchId?: string;
  tenantId?: string;
  competitionRules?: CompetitionRuleConfig[];
  rubricVersions: RubricVersion[];
}): { rubric: RubricVersion | null; error?: string } {
  const { branchName, branchId, tenantId, competitionRules, rubricVersions } = params;

  const ruleConfig = getBranchRuleConfig(branchName, tenantId, competitionRules, branchId);

  if (!ruleConfig || !ruleConfig.rubricVersionId || ruleConfig.rubricVersionId === '') {
    return {
      rubric: null,
      error: `Cabang "${branchName}" belum memiliki konfigurasi aturan kompetisi atau rubrik terkait. Harap tetapkan rubrik di Master Data Aturan Cabang.`
    };
  }

  const activeRubric = rubricVersions.find(
    (r) =>
      r.id === ruleConfig.rubricVersionId &&
      (!tenantId || r.tenantId === tenantId || r.tenantId === 'system') &&
      r.status === 'Aktif'
  );

  if (!activeRubric) {
    // Cari apakah ada versi rubrik aktif khusus untuk cabang ini
    const branchSpecificActive = rubricVersions.find(
      (r) =>
        (!tenantId || r.tenantId === tenantId || r.tenantId === 'system') &&
        r.status === 'Aktif' &&
        (r.branchName.toLowerCase() === branchName.toLowerCase() ||
          branchName.toLowerCase().includes(r.branchName.toLowerCase()) ||
          (r.branchCode && r.branchCode.toLowerCase() === (ruleConfig.branchCode || '').toLowerCase()))
    );

    if (branchSpecificActive) {
      return { rubric: branchSpecificActive };
    }

    // DILARANG DIAM-DIAM FALLBACK KE SENI BACA!
    return {
      rubric: null,
      error: `Versi rubrik aktif dengan ID "${ruleConfig.rubricVersionId}" untuk cabang "${branchName}" tidak ditemukan atau belum berstatus "Aktif". Hubungi Administrator.`
    };
  }

  return { rubric: activeRubric };
}
