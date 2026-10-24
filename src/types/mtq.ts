export interface Tenant {
  id: string;
  name: string;
  code: string;
  eventName: string;
  region: string;
}

export type UserRole = 'admin' | 'judge' | 'superadmin';

export interface User {
  id: string;
  tenantId: string;
  username: string;
  name: string;
  role: UserRole;
  judgeCategory?: string;
  judgeField?: string;
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

export interface CanvasStroke {
  id: string;
  tool: 'pen' | 'marker' | 'eraser';
  color: string;
  size: number;
  page: number;
  points: { x: number; y: number }[];
}

export interface JudgeAssessment {
  id: string;
  tenantId: string;
  participantId: string;
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
  type: 'autosave' | 'annotation' | 'finalized' | 'config';
  title: string;
  description: string;
  timestamp: string;
}
