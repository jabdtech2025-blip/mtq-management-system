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

export interface JudgeAssignment {
  id: string;
  tenantId: string;
  judgeId: string;
  judgeName: string;
  stageId?: string;
  stageName: string;
  branchName: string;
  judgeField: string;
}

export interface CompetitionStage {
  id: string;
  tenantId: string;
  name: string;
  order: number;
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
  stageId: string;
  stageName: string;
  participantId: string;
  judgeId: string;
  judgeName: string;
  judgeField: string;
  questionId?: string; // Optional question identifier for multi-question assessments
  status: 'not_started' | 'in_progress' | 'finalized';
  errorCounts: Record<string, number>; // { [categoryId]: count }
  deductions: Record<string, number>;  // { [categoryId]: totalPoints }
  totalDeductions: number;
  finalScore: number;
  annotations: CanvasStroke[];
  note?: string;
  rubricVersion?: string;
  lastUpdated: string;
  finalizedAt?: string;
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
