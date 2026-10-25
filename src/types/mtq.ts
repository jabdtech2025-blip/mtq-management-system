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

export type ParticipantProgressStatus = 'Belum Dimulai' | 'Berlangsung' | 'Menunggu Hakim Lain' | 'Lengkap';

export interface StageParticipation {
  id: string;
  tenantId: string;
  participantId: string;
  stageId: string;
  stageName: string;
  status: ParticipantProgressStatus;
  finalScore?: number;
  rank?: number;
  isQualified?: boolean;
  qualificationReason?: string;
}

export interface Participant {
  id: string;
  tenantId: string;
  lotteryNumber: string; // Undian, e.g. "04"
  participantId: string; // ID Peserta, e.g. "TLW-004"
  name: string;
  gender: 'Putra' | 'Putri';
  kafilahId: string;
  kafilahName: string;
  branchName: string; // e.g. "Tilawah Dewasa Putra"
  levelName: string;  // e.g. "Ulya"
  stageName: string;  // e.g. "Penyisihan"
  questionId: string;
  assignedMaqra: string;
  pageNumber: number;
  status: 'Menunggu' | 'Berlangsung' | 'Final';
  stageHistory?: {
    stageName: string;
    status: string;
    score?: number;
    rank?: number;
    qualified?: boolean;
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
  pageNumber: number;
  branchAndLevel: string; // "Tilawah Dewasa Putra Ulya"
  stageName: string;      // "Penyisihan"
  status: 'Aktif' | 'Nonaktif';
  description?: string;
  assignedToParticipantId?: string;
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
}

export interface JudgeAssessment {
  id: string;
  tenantId: string;
  participantId: string;
  stageName?: string;
  judgeId: string;
  judgeName: string;
  judgeField: string;
  status: 'not_started' | 'in_progress' | 'finalized';
  errorCounts: Record<string, number>; // { [categoryId]: count }
  deductions: Record<string, number>;  // { [categoryId]: totalPoints }
  totalDeductions: number;
  finalScore: number;
  annotations: CanvasStroke[];
  note?: string;
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
  outcome: 'Success' | 'Failed' | 'Warning';
}
