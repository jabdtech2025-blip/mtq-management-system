export interface Tenant {
  id: string;
  name: string;
  code: string;
  eventName: string;
  region: string;
  edition?: string;
  period?: string;
  primaryAdminId?: string;
  status: 'Aktif' | 'Nonaktif';
  userCount?: number;
}

export type UserRole = 'admin' | 'judge' | 'superadmin';

export interface User {
  id: string;
  tenantId: string;
  username: string;
  email?: string;
  name: string;
  role: UserRole;
  status?: 'Aktif' | 'Nonaktif';
  judgeCategory?: string;
  judgeField?: string;
  assignedBranch?: string;
  assignedStage?: string;
  mimbarLocation?: string;
}

export interface Kafilah {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  region: string;
  participantCount: number;
  contactPerson: string;
  contactPhone: string;
  status: 'Aktif' | 'Nonaktif';
}

export type ParticipantProgressStatus =
  | 'Belum Dimulai'
  | 'Berlangsung'
  | 'Menunggu Hakim Lain'
  | 'Lengkap'
  | 'Maqra Belum Ditetapkan';

export interface AssignedMaqraItem {
  id?: string; // Primary key ID from database table assigned_maqras.id
  questionId: string;
  code?: string;
  title: string;
  surahName?: string;
  surahNumber?: number;
  startAyah?: number;
  endAyah?: number;
  pageNumber: number;
  pageStart?: number;
  pageEnd?: number;
  pageNumbers?: number[];
  assignedAt?: string;
  stageName?: string;
}

export interface StageParticipation {
  id: string;
  tenantId: string;
  participantId: string;
  stageId: string;
  stageName: string;
  branchId?: string;
  branchName: string;
  lotteryNumber: string;
  questionId: string; // Primary question for backward compatibility
  assignedMaqra: string;
  pageNumber: number;
  assignedQuestions?: AssignedMaqraItem[];
  status: ParticipantProgressStatus;
  finalScore?: number;
  provisionalScore?: number;
  rank?: number;
  isQualified?: boolean;
  qualificationReason?: string;
  finalizedAt?: string;
}

export interface Participant {
  id: string;
  tenantId: string;
  lotteryNumber: string; // Nomor Undian, misal "04"
  participantId: string; // ID Peserta permanen, misal "TLW-004"
  name: string;
  gender: 'Putra' | 'Putri';
  kafilahId: string;
  kafilahName: string;
  branchId?: string;
  branchName: string; // e.g. "Tilawah Dewasa Putra"
  levelName: string;  // e.g. "Ulya"
  stageName: string;  // Current stage for compatibility
  questionId: string; // Primary question for backward compatibility
  assignedMaqra: string;
  pageNumber: number;
  assignedQuestions?: AssignedMaqraItem[]; // Multiple questions support
  questionIds?: string[]; // Array of assigned question IDs
  status: 'Menunggu' | 'Berlangsung' | 'Final';
  stageHistory?: {
    stageId?: string;
    stageName: string;
    status: string;
    score?: number;
    rank?: number;
    qualified?: boolean;
    reason?: string;
    finalizedAt?: string;
  }[];
}

export interface Question {
  id: string;
  tenantId: string;
  code: string; // e.g. "MQ-TLW-04"
  title: string;
  surahName: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  pageNumber: number; // Primary page / first page
  pageStart?: number; // e.g. 305
  pageEnd?: number;   // e.g. 307
  pageNumbers?: number[]; // [305, 306, 307]
  branchAndLevel: string; // "Tilawah Dewasa Putra Ulya"
  stageName: string;      // "Penyisihan"
  status: 'Aktif' | 'Nonaktif';
  description?: string;
  assignedToParticipantId?: string;
  assignedToParticipantIds?: string[];
}

export interface GenericMasterItem {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  status: 'Aktif' | 'Nonaktif';
}

export interface ErrorCategory {
  id: string;
  tenantId: string;
  code: string; // "MKH", "IDG", "FSH", "TJW", "LAG"
  name: string;
  scope: string;
  fieldId?: string; // Explicit relational link to RubricField.id (P0 Dynamic Rubric)
  criterionId?: string; // Explicit relational link to RubricCriterion.id
  deductionRuleId?: string; // Explicit relational link to DeductionRule.id
  maxDeduction?: number; // Optional cap on total deduction for this category
  defaultDeduction: number; // e.g. 0.50, 1.00
  methodType: 'Pengurangan tetap' | 'Pengurangan berbobot';
  status: 'Aktif' | 'Nonaktif';
  order: number;
}

export interface NormalizedPoint {
  x: number; // 0 to 1
  y: number; // 0 to 1
}

export interface CanvasStroke {
  id: string;
  tool: 'pen' | 'marker' | 'eraser';
  color: string;
  size: number;
  page: number;
  points: NormalizedPoint[];
}

export interface DeductionRule {
  id: string;
  criterionId: string;
  name?: string;
  label?: string;
  errorGrade?: 'Jali' | 'Khafi' | 'Umum' | 'Kecil' | 'Sedang' | 'Besar';
  deductionPoints?: number;
  deductionPerError?: number;
  maxDeduction?: number;
  methodType?: 'Pengurangan tetap' | 'Pengurangan berbobot';
}

export interface RubricCriterion {
  id: string;
  fieldId: string;
  code?: string;
  name: string;
  description?: string;
  deductionRules: DeductionRule[];
  maxDeduction?: number;
}

export interface RubricField {
  id: string;
  code: string; // e.g. "TJW", "FSH", "LAG", "SUA", "ITQ"
  name: string; // e.g. "Tajwid", "Fashahah", "Lagu", "Suara", "Itqan"
  maxScore: number; // e.g. 30, 30, 25, 15
  minScore: number; // e.g. 0
  maxDeduction?: number;
  maxAllowedErrors?: number;
  weight?: number;
  order: number;
  description?: string;
  criteria?: RubricCriterion[];
  status?: 'Aktif' | 'Nonaktif' | 'Arsip';
}

export interface RubricVersion {
  id: string;
  tenantId: string;
  code: string; // e.g. "RUBRIC-SENI-BACA-2025"
  name: string; // e.g. "Rubrik Resmi Seni Baca Al-Qur'an Pedoman 2025"
  branchCode: string;
  branchName: string;
  version: string; // e.g. "2025.1"
  description: string;
  officialSource?: string; // e.g. "Buku Pedoman MTQ 2025 LPTQ hal. 42-45"
  isOfficialVerified?: boolean;
  status: 'Draft' | 'Validasi' | 'Aktif' | 'Arsip';
  startingScore: number; // e.g. 100
  fields: RubricField[];
  createdAt: string;
}

export interface CompetitionRuleConfig {
  id: string;
  tenantId: string;
  branchName: string;
  branchCode?: string;
  branchId?: string;
  rubricVersionId: string;
  tieBreakOrder: string[]; // e.g. ['total', 'Tajwid', 'Lagu', 'Fashahah']
  quotaPerStage: Record<string, number>; // e.g. { 'Penyisihan': 3, 'Final': 3 }
  qualificationMethod?: 'top_n' | 'manual';
  maqraTiming?: string; // e.g. 'sebelum_mimbar', '1_jam_sebelum'
  officialSource?: string;
  isVerifiedOfficial?: boolean;
  status?: 'Draft' | 'Validasi' | 'Aktif' | 'Arsip';
}

export interface JudgeAssignment {
  id: string;
  tenantId: string;
  judgeId: string;
  judgeName: string;
  stageId?: string;
  stageName: string;
  branchName: string;
  branchId?: string;
  judgeField: string;
  rubricFieldId?: string;
  rubricFieldName?: string;
}

export interface CompetitionStage {
  id: string;
  tenantId: string;
  name: string;
  order: number;
  branchId?: string;
  branchName: string;
  status: 'Menunggu' | 'Aktif' | 'Selesai';
  qualificationQuota: number;
  qualificationMethod: 'top_n' | 'manual';
  isFinalized?: boolean;
  finalizedAt?: string;
  finalizedBy?: string;
}

export interface JudgeAssessment {
  id: string;
  tenantId: string;
  stageParticipationId: string;
  assignedMaqraId?: string; // Relational FK to assigned_maqras.id in database
  stageId: string;
  stageName: string;
  participantId: string;
  judgeId: string;
  judgeName: string;
  judgeField: string;
  questionId?: string; // Question identifier for multi-question assessments
  status: 'not_started' | 'in_progress' | 'finalized';
  errorCounts: Record<string, number>; // { [categoryId]: count }
  deductions: Record<string, number>;  // { [categoryId]: totalPoints }
  totalDeductions: number;
  finalScore: number;
  fieldScores?: Record<string, number>;      // { "Tajwid": 28.5, "Lagu": 24.0, ... }
  fieldDeductions?: Record<string, number>;  // { "Tajwid": 1.5, ... }
  annotations: CanvasStroke[];
  note?: string;
  rubricVersion?: string;
  rubricVersionId?: string;
  isLocked?: boolean;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  lastUpdated: string;
  finalizedAt?: string;
}

export interface ParticipantRankingItem {
  participantId: string;
  participantName: string;
  lotteryNumber: string;
  kafilahName: string;
  branchId?: string;
  branchName: string;
  stageId?: string;
  stageName: string;
  totalScore: number;
  fieldScores: Record<string, number>;
  rank: number;
  isQualified: boolean;
  autoQualified?: boolean;
  isOverridden?: boolean;
  overrideReason?: string;
  hasOverrideConflict?: boolean;
  reason: string;
  tieBreakResolvedBy?: string;
}

export interface StageResultSnapshot {
  id: string;
  tenantId: string;
  stageId: string;
  stageName: string;
  branchId?: string;
  branchName: string;
  quota: number;
  qualificationMethod?: 'top_n' | 'manual';
  finalizedAt: string;
  finalizedBy: string;
  rubricVersionId: string;
  tieBreakRuleUsed: string;
  rankings: ParticipantRankingItem[];
}

export interface ActivityLogItem {
  id: string;
  tenantId: string;
  type: 'autosave' | 'annotation' | 'finalized' | 'config' | 'qualification' | 'stage';
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  tenantName: string;
  summary: string;
  reason?: string;
  outcome: 'Success' | 'Failed' | 'Warning';
}

