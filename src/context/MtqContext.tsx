import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Tenant,
  User,
  Kafilah,
  Participant,
  StageParticipation,
  Question,
  ErrorCategory,
  JudgeAssessment,
  ActivityLogItem,
  CanvasStroke,
  CompetitionStage,
  JudgeAssignment,
  AuditLogItem,
  ParticipantProgressStatus,
  GenericMasterItem,
  AssignedMaqraItem,
  StageResultSnapshot,
  RubricVersion,
  CompetitionRuleConfig
} from '../types/mtq';
import {
  INITIAL_TENANTS,
  INITIAL_USERS,
  INITIAL_KAFILAHS,
  INITIAL_QUESTIONS,
  INITIAL_ERROR_CATEGORIES,
  INITIAL_PARTICIPANTS,
  INITIAL_STAGE_PARTICIPATIONS,
  INITIAL_ASSESSMENTS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_STAGES,
  INITIAL_JUDGE_ASSIGNMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_JENJANG,
  INITIAL_CABANG,
  calculateScore
} from '../data/mockData';
import { calculateAssessmentScore, getActiveRubricFields } from '../services/scoringEngine';
import { RankingService } from '../services/rankingService';
import { supabaseDataService, AuthenticatedSupabaseProfile } from '../services/supabaseDataService';
import {
  SupabaseConnectionInfo,
  AccessGateReason,
  evaluateWorkspaceAccessGate,
  supabase
} from '../lib/supabaseClient';
import { generateUuid, toDeterministicUuid, isValidUuid } from '../utils/uuid';
import {
  OFFICIAL_SENI_BACA_RUBRIC,
  INITIAL_RUBRIC_VERSIONS,
  DEFAULT_COMPETITION_RULES,
  getBranchRuleConfig,
  resolveActiveRubricForBranch
} from '../services/competitionRules';

export type ViewType =
  // Admin MTQ
  | 'dashboard'
  | 'kafilah'
  | 'bank_soal'
  | 'master_data'
  | 'user_management'
  | 'penilaian_hakim'
  | 'rekap_nilai'
  | 'stage_management'
  | 'hasil_kelulusan'
  | 'penilaian_dual_panel'
  // Superadmin
  | 'superadmin_dashboard'
  | 'superadmin_tenants'
  | 'superadmin_users'
  | 'superadmin_audit';

interface MtqContextType {
  tenants: Tenant[];
  currentTenant: Tenant;
  setTenantId: (id: string) => void;
  addTenant: (tenant: Omit<Tenant, 'id'>) => void;
  updateTenant: (id: string, updated: Partial<Tenant>) => void;
  toggleTenantStatus: (id: string) => Promise<{ success: boolean; message: string }>;
  deleteTenant: (id: string) => Promise<{ success: boolean; message: string }>;

  users: User[];
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  addUser: (user: Omit<User, 'id'> & { initialPassword?: string }) => Promise<{ success: boolean; message: string }>;
  updateUser: (id: string, updated: Partial<User>) => Promise<{ success: boolean; message: string }>;
  retryUserProvisioning: (id: string) => Promise<{ success: boolean; message: string }>;
  toggleUserStatus: (id: string) => Promise<{ success: boolean; message: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; message: string }>;

  kafilahs: Kafilah[];
  participants: Participant[];
  stageParticipations: StageParticipation[];
  questions: Question[];
  errorCategories: ErrorCategory[];
  assessments: JudgeAssessment[];
  activityLogs: ActivityLogItem[];
  auditLogs: AuditLogItem[];
  stages: CompetitionStage[];
  judgeAssignments: JudgeAssignment[];

  // Master Data: Jenjang & Cabang (Persisted)
  jenjangList: GenericMasterItem[];
  cabangList: GenericMasterItem[];
  addJenjang: (item: Omit<GenericMasterItem, 'id' | 'tenantId'>) => void;
  updateJenjang: (id: string, updated: Partial<GenericMasterItem>) => void;
  deleteJenjang: (id: string) => { success: boolean; message: string; activeCount?: number };
  addCabang: (item: Omit<GenericMasterItem, 'id' | 'tenantId'>) => void;
  updateCabang: (id: string, updated: Partial<GenericMasterItem>) => void;
  deleteCabang: (id: string) => { success: boolean; message: string; activeCount?: number };

  // Dynamic Competition Rules & Rubric Versions (P0)
  rubricVersions: RubricVersion[];
  competitionRules: CompetitionRuleConfig[];
  addRubricVersion: (rubric: Omit<RubricVersion, 'id' | 'tenantId' | 'createdAt'>) => void;
  updateRubricVersion: (id: string, updated: Partial<RubricVersion>) => { success: boolean; message: string };
  activateRubricVersion: (id: string) => { success: boolean; message: string };
  archiveRubricVersion: (id: string) => void;
  deleteRubricVersion: (id: string) => { success: boolean; message: string };
  addCompetitionRule: (rule: Omit<CompetitionRuleConfig, 'id' | 'tenantId'>) => void;
  updateCompetitionRule: (id: string, updated: Partial<CompetitionRuleConfig>) => void;
  deleteCompetitionRule: (id: string) => { success: boolean; message: string };
  getActiveRubricForBranch: (branchName: string, branchId?: string) => RubricVersion | null;
  getBranchRuleConfigByBranch: (branchName: string, branchId?: string) => CompetitionRuleConfig;

  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  selectedParticipantId: string;
  setSelectedParticipantId: (id: string) => void;
  selectedStageName: string;
  setSelectedStageName: (name: string) => void;

  // Active Monitoring Judge ID (when admin inspects a judge's assessment)
  monitoringJudgeId: string;
  setMonitoringJudgeId: (judgeId: string) => void;

  syncStatus: string;
  lastSyncTime: string;

  // Assessments & Annotations
  initializeAssessment: (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ) => { success: boolean; message: string };
  updateErrorCount: (
    participantId: string,
    judgeId: string,
    categoryId: string,
    delta: number,
    stageName?: string,
    questionId?: string
  ) => void;
  saveAnnotations: (
    participantId: string,
    judgeId: string,
    annotations: CanvasStroke[],
    stageName?: string,
    questionId?: string
  ) => void;
  finalizeAssessment: (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ) => Promise<{ success: boolean; message: string }>;
  reopenAssessment: (
    participantId: string,
    judgeId: string,
    reason: string,
    stageName?: string,
    questionId?: string
  ) => Promise<{ success: boolean; message: string }>;
  stageSnapshots: StageResultSnapshot[];
  getJudgeAssessment: (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ) => JudgeAssessment | undefined;
  getParticipantProgress: (
    participantId: string,
    stageName?: string
  ) => ParticipantProgressStatus;
  getStageParticipation: (
    participantId: string,
    stageName?: string
  ) => StageParticipation | undefined;
  getParticipantStageQuestions: (
    participantId: string,
    stageName?: string
  ) => AssignedMaqraItem[];

  // Master Data & Config (Tenant Scoped)
  addKafilah: (kafilah: Omit<Kafilah, 'id' | 'tenantId'>) => void;
  updateKafilah: (id: string, updated: Partial<Kafilah>) => void;
  addParticipant: (part: Omit<Participant, 'id' | 'tenantId'>) => { success: boolean; message: string };
  updateParticipant: (id: string, updated: Partial<Participant>) => void;
  addQuestion: (q: Omit<Question, 'id' | 'tenantId'>) => void;
  updateQuestion: (id: string, updated: Partial<Question>) => void;
  assignMaqraToParticipant: (
    participantId: string,
    questionId: string,
    stageName?: string
  ) => void;
  addQuestionToParticipant: (
    participantId: string,
    questionId: string,
    stageName?: string
  ) => { success: boolean; message: string };
  removeQuestionFromParticipant: (
    participantId: string,
    questionId: string,
    stageName?: string
  ) => void;
  conductLotteryDraw: (options: {
    stageName: string;
    branchName?: string;
    participantIds: string[];
    questionsPerParticipant: number;
    predefinedResults?: {
      participantId: string;
      participantName: string;
      questionIds: string[];
      questionTitles: string[];
    }[];
  }) => {
    success: boolean;
    message: string;
    results?: {
      participantId: string;
      participantName: string;
      questionIds: string[];
      questionTitles: string[];
    }[];
  };
  commitLotteryDrawResults: (
    results: {
      participantId: string;
      participantName: string;
      questionIds: string[];
      questionTitles: string[];
    }[],
    stageName: string
  ) => { success: boolean; message: string };
  updateCategoryDeduction: (categoryId: string, deduction: number) => void;
  addErrorCategory: (cat: Omit<ErrorCategory, 'id' | 'tenantId'>) => void;
  updateErrorCategory: (id: string, updated: Partial<ErrorCategory>) => void;

  // Stages & Progressions
  addStage: (stage: Omit<CompetitionStage, 'id' | 'tenantId'>) => void;
  updateStage: (id: string, updated: Partial<CompetitionStage>) => void;
  deleteStage: (id: string) => { success: boolean; message: string };
  advanceQualifiers: (
    currentStageNameOrParams:
      | string
      | {
          currentStageId?: string;
          currentStageName: string;
          nextStageId?: string;
          nextStageName?: string;
          branchId?: string;
          branchName?: string;
          qualifiedParticipantIds: string[];
          overrideReasons?: Record<string, string>;
          manualOverrides?: Record<string, boolean>;
        },
    nextStageName?: string,
    qualifiedParticipantIds?: string[],
    overrideReasons?: Record<string, string>
  ) => Promise<{ success: boolean; message: string }>;

  // Judge Assignments
  addJudgeAssignment: (asg: Omit<JudgeAssignment, 'id' | 'tenantId'>) => void;
  removeJudgeAssignment: (id: string) => void;

  // Superadmin Workspace Delegation Mode
  isSuperadminWorkspaceMode: boolean;
  enterTenantWorkspace: (tenantId: string) => void;
  exitTenantWorkspace: () => void;

  // Demo Account Modal & Prototype Storage Reset
  isDemoAccountModalOpen: boolean;
  setIsDemoAccountModalOpen: (open: boolean) => void;
  resetPrototypeData: () => void;

  // Real Supabase Connection & Auth Integration
  connectionInfo: SupabaseConnectionInfo;
  authenticatedProfile: AuthenticatedSupabaseProfile | null;
  dataSourceMode: 'demo_local' | 'supabase_live' | 'supabase_error';
  workspaceError: string | null;
  isOfflineDemoSimulation: boolean;
  isLiveSupabaseMode: boolean;
  isLiveAccessAuthorized: boolean;
  accessGateReason: AccessGateReason;
  isPasswordRecoveryMode: boolean;
  setIsPasswordRecoveryMode: (active: boolean) => void;
  enterOfflineDemoSimulation: () => void;
  exitOfflineDemoSimulation: () => Promise<void>;
  refreshSupabaseConnection: () => Promise<SupabaseConnectionInfo>;
  signInWithSupabase: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  signUpWithSupabase: (params: {
    name: string;
    username: string;
    email: string;
    password: string;
  }) => Promise<{ success: boolean; requiresEmailConfirmation?: boolean; message: string }>;
  signOutSupabase: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  completePasswordReset: (newPassword: string) => Promise<{ success: boolean; message: string }>;
  bootstrapFirstSuperadmin: (targetEmail: string) => Promise<{ success: boolean; message: string }>;
}

const MtqContext = createContext<MtqContextType | undefined>(undefined);

// Storage Prefix V3 with clean isolation and schema versioning
const STORAGE_PREFIX = 'mtq_platform_data_v3_';

let logIdSequence = 0;
const generateUniqueLogId = (prefix: string = 'act') => {
  logIdSequence = (logIdSequence + 1) % 1000000;
  return `${prefix}-${Date.now()}-${logIdSequence}-${Math.random().toString(36).substring(2, 8)}`;
};

export const MtqProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants, setTenants] = useState<Tenant[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'tenants');
      return saved ? JSON.parse(saved) : INITIAL_TENANTS;
    } catch {
      return INITIAL_TENANTS;
    }
  });

  const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_PREFIX + 'tenant_id') || 'tenant-jabar';
    } catch {
      return 'tenant-jabar';
    }
  });

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const isDemoMode = localStorage.getItem('mtq_offline_demo_simulation_v4') === 'true';
      if (!isDemoMode) {
        return [];
      }
      const saved = localStorage.getItem(STORAGE_PREFIX + 'users');
      return saved ? JSON.parse(saved) : INITIAL_USERS;
    } catch {
      return [];
    }
  });

  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_PREFIX + 'user_id') || 'user-admin-rh';
    } catch {
      return 'user-admin-rh';
    }
  });

  const [kafilahs, setKafilahs] = useState<Kafilah[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'kafilahs');
      return saved ? JSON.parse(saved) : INITIAL_KAFILAHS;
    } catch {
      return INITIAL_KAFILAHS;
    }
  });

  const [participants, setParticipants] = useState<Participant[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'participants');
      const loaded: Participant[] = saved ? JSON.parse(saved) : INITIAL_PARTICIPANTS;
      return loaded.map((p) => {
        if (!p.assignedQuestions || p.assignedQuestions.length === 0) {
          return {
            ...p,
            assignedQuestions: p.questionId ? [{
              questionId: p.questionId,
              title: p.assignedMaqra || 'Maqra Perlombaan',
              pageNumber: p.pageNumber || 305,
              stageName: p.stageName
            }] : [],
            questionIds: p.questionId ? [p.questionId] : []
          };
        }
        return p;
      });
    } catch {
      return INITIAL_PARTICIPANTS;
    }
  });

  const [stageParticipations, setStageParticipations] = useState<StageParticipation[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'stage_participations');
      const loaded: StageParticipation[] = saved ? JSON.parse(saved) : INITIAL_STAGE_PARTICIPATIONS;
      return loaded.map((sp) => {
        if (!sp.assignedQuestions || sp.assignedQuestions.length === 0) {
          if (sp.questionId && sp.questionId.trim() !== '') {
            return {
              ...sp,
              assignedQuestions: [
                {
                  questionId: sp.questionId,
                  title: sp.assignedMaqra || 'Maqra Tilawah',
                  pageNumber: sp.pageNumber || 305,
                  stageName: sp.stageName
                }
              ]
            };
          }
        }
        return sp;
      });
    } catch {
      return INITIAL_STAGE_PARTICIPATIONS;
    }
  });

  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'questions');
      return saved ? JSON.parse(saved) : INITIAL_QUESTIONS;
    } catch {
      return INITIAL_QUESTIONS;
    }
  });

  const [errorCategories, setErrorCategories] = useState<ErrorCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'categories');
      return saved ? JSON.parse(saved) : INITIAL_ERROR_CATEGORIES;
    } catch {
      return INITIAL_ERROR_CATEGORIES;
    }
  });

  const [assessments, setAssessments] = useState<JudgeAssessment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'assessments');
      const loaded: JudgeAssessment[] = saved ? JSON.parse(saved) : INITIAL_ASSESSMENTS;
      // Conservative, idempotent migration:
      // Ensure all assessments have tenantId, stageName, and questionId if unambiguously resolvable
      return loaded.map((a) => {
        let stage = a.stageName;
        let qId = a.questionId;

        if (!stage) {
          if (a.stageParticipationId) {
            const spMatch = INITIAL_STAGE_PARTICIPATIONS.find((s) => s.id === a.stageParticipationId);
            stage = spMatch?.stageName || 'Penyisihan';
          } else {
            stage = 'Penyisihan';
          }
        }

        if (!qId) {
          if (a.stageParticipationId) {
            const spMatch = INITIAL_STAGE_PARTICIPATIONS.find((s) => s.id === a.stageParticipationId);
            if (spMatch?.questionId) {
              qId = spMatch.questionId;
            }
          }
          if (!qId && a.participantId) {
            const partMatch = INITIAL_PARTICIPANTS.find((p) => p.id === a.participantId);
            if (partMatch?.questionId && (!partMatch.stageName || partMatch.stageName === stage)) {
              qId = partMatch.questionId;
            }
          }
        }

        return {
          ...a,
          tenantId: a.tenantId || 'tenant-jabar',
          stageName: stage,
          questionId: qId
        };
      });
    } catch {
      return INITIAL_ASSESSMENTS;
    }
  });

  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'logs');
      const rawLogs: ActivityLogItem[] = saved ? JSON.parse(saved) : INITIAL_ACTIVITY_LOGS;
      const seenIds = new Set<string>();
      const sanitized: ActivityLogItem[] = [];

      rawLogs.forEach((item, idx) => {
        let uniqueId = item.id;
        if (!uniqueId || seenIds.has(uniqueId)) {
          uniqueId = `act-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
        }
        seenIds.add(uniqueId);
        sanitized.push({ ...item, id: uniqueId });
      });

      return sanitized;
    } catch {
      return INITIAL_ACTIVITY_LOGS;
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'audit_logs');
      const rawLogs: AuditLogItem[] = saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
      const seenIds = new Set<string>();
      const sanitized: AuditLogItem[] = [];

      rawLogs.forEach((item, idx) => {
        let uniqueId = item.id;
        if (!uniqueId || seenIds.has(uniqueId)) {
          uniqueId = `aud-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
        }
        seenIds.add(uniqueId);
        sanitized.push({ ...item, id: uniqueId });
      });

      return sanitized;
    } catch {
      return INITIAL_AUDIT_LOGS;
    }
  });

  const [stages, setStages] = useState<CompetitionStage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'stages');
      return saved ? JSON.parse(saved) : INITIAL_STAGES;
    } catch {
      return INITIAL_STAGES;
    }
  });

  const [judgeAssignments, setJudgeAssignments] = useState<JudgeAssignment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'judge_assignments');
      return saved ? JSON.parse(saved) : INITIAL_JUDGE_ASSIGNMENTS;
    } catch {
      return INITIAL_JUDGE_ASSIGNMENTS;
    }
  });

  // Master Data: Jenjang & Cabang (Persisted)
  const [jenjangList, setJenjangList] = useState<GenericMasterItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'jenjang_list');
      return saved ? JSON.parse(saved) : INITIAL_JENJANG;
    } catch {
      return INITIAL_JENJANG;
    }
  });

  const [cabangList, setCabangList] = useState<GenericMasterItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'cabang_list');
      return saved ? JSON.parse(saved) : INITIAL_CABANG;
    } catch {
      return INITIAL_CABANG;
    }
  });

  // Dynamic Competition Rules & Rubric Versions (P0)
  const [rubricVersions, setRubricVersions] = useState<RubricVersion[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'rubric_versions');
      return saved ? JSON.parse(saved) : INITIAL_RUBRIC_VERSIONS;
    } catch {
      return INITIAL_RUBRIC_VERSIONS;
    }
  });

  const [competitionRules, setCompetitionRules] = useState<CompetitionRuleConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'competition_rules');
      if (saved) return JSON.parse(saved);
      return Object.values(DEFAULT_COMPETITION_RULES).map((r) => ({
        ...r,
        tenantId: 'tenant-jabar',
        status: 'Aktif' as const
      }));
    } catch {
      return Object.values(DEFAULT_COMPETITION_RULES).map((r) => ({
        ...r,
        tenantId: 'tenant-jabar',
        status: 'Aktif' as const
      }));
    }
  });

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('part-04');
  const [selectedStageName, setSelectedStageName] = useState<string>('Penyisihan');
  const [monitoringJudgeId, setMonitoringJudgeId] = useState<string>('judge-1');
  const [connectionInfo, setConnectionInfo] = useState<SupabaseConnectionInfo>(() =>
    supabaseDataService.getConnectionStatus()
  );
  const [authenticatedProfile, setAuthenticatedProfile] = useState<AuthenticatedSupabaseProfile | null>(null);
  const [isOfflineDemoSimulation, setIsOfflineDemoSimulation] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mtq_offline_demo_simulation_v4') === 'true';
    } catch {
      return false;
    }
  });
  const [dataSourceMode, setDataSourceMode] = useState<'demo_local' | 'supabase_live' | 'supabase_error'>(() =>
    supabaseDataService.isLive() && localStorage.getItem('mtq_offline_demo_simulation_v4') !== 'true'
      ? 'supabase_live'
      : 'demo_local'
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>(() =>
    supabaseDataService.isLive()
      ? supabaseDataService.getConnectionStatus().statusLabel
      : 'Mode Lokal (Tersimpan di Browser)'
  );
  const [lastSyncTime, setLastSyncTime] = useState<string>('13:14:18 WIB');
  const [isDemoAccountModalOpen, setIsDemoAccountModalOpen] = useState<boolean>(false);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.location?.hash) {
        return window.location.hash.includes('type=recovery');
      }
      return false;
    } catch {
      return false;
    }
  });

  // Fail-closed default: produksi maupun pengembangan wajib mode live kecuali simulasi demo lokal diaktifkan eksplisit
  const isLiveSupabaseMode = !isOfflineDemoSimulation;
  const isLiveDbActive =
    isLiveSupabaseMode && connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated;

  // Sync to localStorage ONLY when in demo_local / offline simulation mode (Isolasi Cache dari Live Mode)
  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'tenants', JSON.stringify(tenants));
    } catch (e) {
      console.warn('Storage error: tenants', e);
    }
  }, [tenants, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'tenant_id', currentTenantId);
    } catch {}
  }, [currentTenantId, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'users', JSON.stringify(users));
    } catch {}
  }, [users, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'user_id', currentUserId);
    } catch {}
  }, [currentUserId, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'kafilahs', JSON.stringify(kafilahs));
    } catch {}
  }, [kafilahs, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'participants', JSON.stringify(participants));
    } catch {}
  }, [participants, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'stage_participations', JSON.stringify(stageParticipations));
    } catch {}
  }, [stageParticipations, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'questions', JSON.stringify(questions));
    } catch {}
  }, [questions, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'categories', JSON.stringify(errorCategories));
    } catch {}
  }, [errorCategories, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'assessments', JSON.stringify(assessments));
    } catch {}
  }, [assessments, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'logs', JSON.stringify(activityLogs));
    } catch {}
  }, [activityLogs, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'audit_logs', JSON.stringify(auditLogs));
    } catch {}
  }, [auditLogs, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'stages', JSON.stringify(stages));
    } catch {}
  }, [stages, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'judge_assignments', JSON.stringify(judgeAssignments));
    } catch {}
  }, [judgeAssignments, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'jenjang_list', JSON.stringify(jenjangList));
    } catch {}
  }, [jenjangList, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'rubric_versions', JSON.stringify(rubricVersions));
    } catch {}
  }, [rubricVersions, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'competition_rules', JSON.stringify(competitionRules));
    } catch {}
  }, [competitionRules, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'cabang_list', JSON.stringify(cabangList));
    } catch {}
  }, [cabangList, isLiveSupabaseMode]);

  const [stageSnapshots, setStageSnapshots] = useState<StageResultSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'stage_snapshots');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'stage_snapshots', JSON.stringify(stageSnapshots));
    } catch {}
  }, [stageSnapshots, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'rubric_versions', JSON.stringify(rubricVersions));
    } catch (e) {
      console.warn('Storage error: rubric_versions', e);
    }
  }, [rubricVersions, isLiveSupabaseMode]);

  useEffect(() => {
    if (isLiveSupabaseMode) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + 'competition_rules', JSON.stringify(competitionRules));
    } catch (e) {
      console.warn('Storage error: competition_rules', e);
    }
  }, [competitionRules, isLiveSupabaseMode]);

  const accessGateDecision = evaluateWorkspaceAccessGate({
    isOfflineDemoSimulation,
    connectionInfo,
    authenticatedProfile,
    dataSourceMode,
    workspaceError
  });

  const accessGateReason: AccessGateReason = accessGateDecision.reason;
  const isLiveAccessAuthorized: boolean = accessGateDecision.isAuthorized;

  const currentTenant = tenants.find((t) => t.id === currentTenantId) || tenants[0];

  // Dalam mode live Supabase, currentUser wajib berasal dari profil terautentikasi & membership aktif,
  // tidak pernah dari persona demo localStorage.
  const currentUser: User = (() => {
    if (isLiveSupabaseMode) {
      if (authenticatedProfile && isLiveAccessAuthorized) {
        const matchedMembership =
          authenticatedProfile.memberships.find((m) => m.tenantId === currentTenantId) ||
          authenticatedProfile.memberships[0];
        const verifiedRole =
          authenticatedProfile.globalRole === 'superadmin'
            ? 'superadmin'
            : matchedMembership?.role || authenticatedProfile.globalRole;
        return {
          id: authenticatedProfile.authUserId,
          tenantId:
            matchedMembership?.tenantId ||
            (verifiedRole === 'superadmin' ? 'platform' : currentTenantId),
          username: authenticatedProfile.username,
          email: authenticatedProfile.email,
          name: authenticatedProfile.name,
          role: verifiedRole,
          status: 'Aktif',
          provisioningStatus: 'Aktif',
          judgeCategory: matchedMembership?.judgeCategory,
          judgeField: matchedMembership?.judgeField
        };
      }
      return {
        id: authenticatedProfile?.authUserId || 'unauthenticated-session',
        tenantId: currentTenantId,
        username: authenticatedProfile?.username || 'unauthenticated',
        email: authenticatedProfile?.email || '',
        name: authenticatedProfile?.name || 'Sesi Belum Terautentikasi',
        role: 'judge',
        status: 'Nonaktif',
        provisioningStatus: 'Nonaktif'
      };
    }
    return users.find((u) => u.id === currentUserId) || users[0];
  })();

  const setSafeCurrentUserId = (id: string) => {
    // Blokir pergantian persona palsu saat mode live Supabase aktif
    if (isLiveSupabaseMode) {
      console.warn('Pergantian akun simulasi dinonaktifkan pada mode produksi Supabase.');
      return;
    }
    setCurrentUserId(id);
  };

  const enterOfflineDemoSimulation = () => {
    try {
      localStorage.setItem('mtq_offline_demo_simulation_v4', 'true');
    } catch {}
    setIsOfflineDemoSimulation(true);
    setDataSourceMode('demo_local');
    setWorkspaceError(null);
    setTenants(INITIAL_TENANTS);
    setUsers(INITIAL_USERS);
    setCurrentTenantId('tenant-jabar');
    setCurrentUserId('user-admin-rh');
    setCabangList(INITIAL_CABANG);
    setJenjangList(INITIAL_JENJANG);
    setKafilahs(INITIAL_KAFILAHS);
    setStages(INITIAL_STAGES);
    setQuestions(INITIAL_QUESTIONS);
    setParticipants(INITIAL_PARTICIPANTS);
    setStageParticipations(INITIAL_STAGE_PARTICIPATIONS);
    setErrorCategories(INITIAL_ERROR_CATEGORIES);
    setRubricVersions(INITIAL_RUBRIC_VERSIONS);
    setCompetitionRules(
      Object.values(DEFAULT_COMPETITION_RULES).map((r) => ({
        ...r,
        tenantId: 'tenant-jabar',
        status: 'Aktif' as const
      }))
    );
    setJudgeAssignments(INITIAL_JUDGE_ASSIGNMENTS);
    setAssessments(INITIAL_ASSESSMENTS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setSyncStatus('Mode Simulasi Demo Lokal (Terisolasi dari Database Produksi)');
  };

  const exitOfflineDemoSimulation = async (): Promise<void> => {
    try {
      localStorage.removeItem('mtq_offline_demo_simulation_v4');
    } catch {}
    setIsOfflineDemoSimulation(false);
    setDataSourceMode(supabaseDataService.isLive() ? 'supabase_live' : 'supabase_error');
    await refreshSupabaseConnection();
  };

  const getWibTime = () =>
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

  // Superadmin Workspace Mode Flag
  const isSuperadminWorkspaceMode =
    currentUser.role === 'superadmin' && currentTenantId !== 'platform';

  const enterTenantWorkspace = (tenantId: string) => {
    setCurrentTenantId(tenantId);
    setCurrentView('dashboard');
  };

  const exitTenantWorkspace = () => {
    setCurrentTenantId('platform');
    setCurrentView('superadmin_dashboard');
  };

  // Reset prototype storage helper
  const resetPrototypeData = () => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('mtq_platform_data_') || key.startsWith('mtq_offline_demo_')) {
          localStorage.removeItem(key);
        }
      });
      window.location.reload();
    } catch (e) {
      console.warn('Reset error', e);
    }
  };

  /**
   * Pemeriksaan koneksi nyata ke Supabase, sinkronisasi profil Auth, dan hidrasi data workspace.
   * Memastikan tenant aktif pasca-login digunakan untuk query dan tidak mempertahankan data demo
   * ketika database nyata gagal atau mengembalikan tabel kosong.
   */
  const refreshSupabaseConnection = async (): Promise<SupabaseConnectionInfo> => {
    const info = await supabaseDataService.verifyDatabaseConnection();
    setConnectionInfo(info);
    setSyncStatus(info.statusLabel);

    if (info.isDatabaseReady) {
      const profile = await supabaseDataService.fetchAuthenticatedUserProfile();
      setAuthenticatedProfile(profile);

      if (!profile) {
        // Sesi belum login di mode live: bersihkan state operasional agar data demo tidak bocor
        setDataSourceMode('supabase_live');
        setWorkspaceError(null);
        setUsers([]);
        setKafilahs([]);
        setStages([]);
        setQuestions([]);
        setParticipants([]);
        setStageParticipations([]);
        setJudgeAssignments([]);
        setAssessments([]);
        setStageSnapshots([]);
        setAuditLogs([]);
        return info;
      }

      let targetTenantId = currentTenantId;
      const primaryMembership = profile.memberships[0];
      const effectiveRole =
        profile.globalRole === 'superadmin'
          ? 'superadmin'
          : primaryMembership?.role || profile.globalRole;
      const effectiveTenantId =
        primaryMembership?.tenantId ||
        (effectiveRole === 'superadmin' ? 'platform' : currentTenantId);

      if (
        primaryMembership?.tenantId &&
        (!isValidUuid(currentTenantId) || !profile.memberships.some((m) => m.tenantId === currentTenantId)) &&
        !(effectiveRole === 'superadmin' && currentTenantId === 'platform')
      ) {
        targetTenantId = primaryMembership.tenantId;
        setCurrentTenantId(primaryMembership.tenantId);
      } else if (primaryMembership?.tenantId && isValidUuid(currentTenantId)) {
        targetTenantId = currentTenantId;
      } else if (effectiveRole === 'superadmin' && !isValidUuid(currentTenantId)) {
        targetTenantId = 'platform';
        if (currentTenantId !== 'platform') {
          setCurrentTenantId('platform');
        }
      }

      const mappedUser: User = {
        id: profile.authUserId,
        tenantId: effectiveTenantId,
        username: profile.username,
        email: profile.email,
        name: profile.name,
        role: effectiveRole,
        status: 'Aktif',
        provisioningStatus: 'Aktif',
        judgeCategory: primaryMembership?.judgeCategory,
        judgeField: primaryMembership?.judgeField
      };

      setCurrentUserId(profile.authUserId);

      // Pastikan tampilan awal sesuai dengan peran yang terautentikasi
      if (effectiveRole === 'superadmin' && targetTenantId === 'platform') {
        setCurrentView((prev) => (prev === 'dashboard' || !prev.startsWith('superadmin_') ? 'superadmin_dashboard' : prev));
      } else if (effectiveRole === 'judge') {
        setCurrentView((prev) => (prev === 'dashboard' || prev.startsWith('superadmin_') ? 'penilaian_hakim' : prev));
      } else if (effectiveRole === 'admin') {
        setCurrentView((prev) => (prev.startsWith('superadmin_') ? 'dashboard' : prev));
      }

      if (!profile.hasProfileRow || (profile.memberships.length === 0 && profile.globalRole !== 'superadmin')) {
        // Profil atau membership tidak memenuhi syarat: bersihkan workspace operasional
        setUsers([mappedUser]);
        setKafilahs([]);
        setStages([]);
        setQuestions([]);
        setParticipants([]);
        setStageParticipations([]);
        setJudgeAssignments([]);
        setAssessments([]);
        setStageSnapshots([]);
        setAuditLogs([]);
        return info;
      }

      const hydration = await supabaseDataService.fetchTenantWorkspaceResult(targetTenantId);
      if (hydration.success && hydration.payload) {
        const hydrated = hydration.payload;
        setDataSourceMode('supabase_live');
        setWorkspaceError(null);

        if (hydrated.tenants && hydrated.tenants.length > 0) {
          setTenants(hydrated.tenants);
        }
        // Selalu ganti daftar users dengan data riil dari tabel profiles & tenant_memberships Supabase
        // tanpa menyisakan akun tiruan (INITIAL_USERS) dari mockData
        const dbUsers = hydrated.users || [];
        const hasCurrentAuthUser = dbUsers.some((u) => u.id === profile.authUserId);
        setUsers(hasCurrentAuthUser ? dbUsers : [mappedUser, ...dbUsers]);

        // Replace tenant operational data unconditionally so demo/mock data is never retained in live mode
        setCabangList(hydrated.cabangList || []);
        setJenjangList(hydrated.jenjangList || []);
        setKafilahs(hydrated.kafilahs || []);
        setStages(hydrated.stages || []);
        setQuestions(hydrated.questions || []);
        setParticipants(hydrated.participants || []);
        setStageParticipations(hydrated.stageParticipations || []);
        setErrorCategories(hydrated.errorCategories || []);
        setCompetitionRules(hydrated.competitionRules || []);
        setJudgeAssignments(hydrated.judgeAssignments || []);
        setAssessments(hydrated.assessments || []);
        setStageSnapshots(hydrated.stageSnapshots || []);
        setAuditLogs(hydrated.auditLogs || []);
        if (hydrated.rubricVersions && hydrated.rubricVersions.length > 0) {
          setRubricVersions(hydrated.rubricVersions);
        }
      } else {
        setDataSourceMode('supabase_error');
        setWorkspaceError(hydration.error || 'Gagal memuat workspace database.');
        setSyncStatus('Gagal Memuat Workspace Database');
        setUsers([mappedUser]);
        setKafilahs([]);
        setStages([]);
        setQuestions([]);
        setParticipants([]);
        setStageParticipations([]);
        setJudgeAssignments([]);
        setAssessments([]);
        setStageSnapshots([]);
      }
    } else {
      setAuthenticatedProfile(null);
      if (!isOfflineDemoSimulation) {
        setDataSourceMode('supabase_error');
        setWorkspaceError(info.lastError || info.statusLabel);
        setUsers([]);
        setKafilahs([]);
        setStages([]);
        setQuestions([]);
        setParticipants([]);
        setStageParticipations([]);
        setJudgeAssignments([]);
        setAssessments([]);
        setStageSnapshots([]);
      } else {
        setDataSourceMode('demo_local');
        setWorkspaceError(null);
      }
    }

    return info;
  };

  const signInWithSupabase = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      localStorage.removeItem('mtq_offline_demo_simulation_v4');
    } catch {}
    setIsOfflineDemoSimulation(false);
    const res = await supabaseDataService.signInWithPassword(email, password);
    await refreshSupabaseConnection();
    return { success: res.success, message: res.message };
  };

  const signUpWithSupabase = async (params: {
    name: string;
    username: string;
    email: string;
    password: string;
  }): Promise<{ success: boolean; requiresEmailConfirmation?: boolean; message: string }> => {
    try {
      localStorage.removeItem('mtq_offline_demo_simulation_v4');
    } catch {}
    setIsOfflineDemoSimulation(false);
    const res = await supabaseDataService.signUpNewUser(params);
    if (res.success && !res.requiresEmailConfirmation) {
      await refreshSupabaseConnection();
    }
    return {
      success: res.success,
      requiresEmailConfirmation: res.requiresEmailConfirmation,
      message: res.message
    };
  };

  const signOutSupabase = async (): Promise<void> => {
    await supabaseDataService.signOut();
    setAuthenticatedProfile(null);
    setIsPasswordRecoveryMode(false);
    setUsers([]);
    setKafilahs([]);
    setStages([]);
    setQuestions([]);
    setParticipants([]);
    setStageParticipations([]);
    setJudgeAssignments([]);
    setAssessments([]);
    setStageSnapshots([]);
    setAuditLogs([]);
    await refreshSupabaseConnection();
  };

  const requestPasswordReset = async (
    email: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await supabaseDataService.requestPasswordReset(email);
    return { success: res.success, message: res.message };
  };

  const completePasswordReset = async (
    newPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await supabaseDataService.updatePasswordWithRecoverySession(newPassword);
    if (res.success) {
      setIsPasswordRecoveryMode(false);
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      await refreshSupabaseConnection();
    }
    return { success: res.success, message: res.message };
  };

  const bootstrapFirstSuperadmin = async (
    targetEmail: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await supabaseDataService.bootstrapFirstSuperadmin({
      targetEmail,
      initialTenantId: isValidUuid(currentTenantId) ? currentTenantId : undefined
    });
    if (res.success) {
      await refreshSupabaseConnection();
    }
    return { success: res.success, message: res.message };
  };

  useEffect(() => {
    if (!isOfflineDemoSimulation) {
      void refreshSupabaseConnection();
    }
    if (supabase && !isOfflineDemoSimulation) {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecoveryMode(true);
        }
        // Gunakan setTimeout(..., 0) agar tidak terjadi race condition / deadlock di dalam lock internal Supabase Auth
        setTimeout(() => {
          void refreshSupabaseConnection();
        }, 0);
      });
      return () => {
        sub.subscription.unsubscribe();
      };
    }
  }, [currentTenantId, isOfflineDemoSimulation]);

  // Supabase Realtime Subscription (judge_assessments, stage_participations, stages)
  useEffect(() => {
    if (!isLiveDbActive || !isLiveAccessAuthorized || !isValidUuid(currentTenantId)) {
      return;
    }

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = supabaseDataService.subscribeToTenantRealtime(
      currentTenantId,
      ({ table, eventType }) => {
        setSyncStatus(`Sinkronisasi Realtime (${table} • ${eventType})...`);
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          void refreshSupabaseConnection();
        }, 350);
      }
    );

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [isLiveDbActive, isLiveAccessAuthorized, currentTenantId]);

  /**
   * Helper to retrieve all questions assigned to a participant on a specific stage.
   * Primary source of truth is StageParticipation for targetStage.
   * STRICT: Never leaks questions from other stages!
   */
  const getParticipantStageQuestions = (
    participantId: string,
    stageName?: string
  ): AssignedMaqraItem[] => {
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return [];
    const targetStage = stageName || part.stageName || selectedStageName;

    // 1. Check StageParticipation for targetStage
    const sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        item.stageName === targetStage
    );

    if (sp?.assignedQuestions && sp.assignedQuestions.length > 0) {
      const stageSpecific = sp.assignedQuestions.filter(
        (aq) => !aq.stageName || aq.stageName === targetStage
      );
      if (stageSpecific.length > 0) return stageSpecific;
    }

    // 2. Check Participant assignedQuestions strictly matching targetStage
    if (part.assignedQuestions && part.assignedQuestions.length > 0) {
      const stageSpecific = part.assignedQuestions.filter(
        (aq) => aq.stageName === targetStage
      );
      if (stageSpecific.length > 0) return stageSpecific;
    }

    // 3. Fallback for legacy single-question data ONLY IF stage matches
    if (sp?.questionId && sp.questionId.trim() !== '') {
      const qObj = questions.find((q) => q.id === sp.questionId);
      return [
        {
          questionId: sp.questionId,
          code: qObj?.code || 'MQ-01',
          title: sp.assignedMaqra || qObj?.title || 'Maqra Tilawah',
          surahName: qObj?.surahName,
          surahNumber: qObj?.surahNumber,
          startAyah: qObj?.startAyah,
          endAyah: qObj?.endAyah,
          pageNumber: sp.pageNumber || qObj?.pageNumber || 305,
          pageStart: qObj?.pageStart || sp.pageNumber || 305,
          pageEnd: qObj?.pageEnd || sp.pageNumber || 305,
          stageName: targetStage
        }
      ];
    }

    if (part.questionId && part.questionId.trim() !== '' && part.stageName === targetStage) {
      const qObj = questions.find((q) => q.id === part.questionId);
      return [
        {
          questionId: part.questionId,
          code: qObj?.code || 'MQ-01',
          title: part.assignedMaqra || qObj?.title || 'Maqra Tilawah',
          surahName: qObj?.surahName,
          surahNumber: qObj?.surahNumber,
          startAyah: qObj?.startAyah,
          endAyah: qObj?.endAyah,
          pageNumber: part.pageNumber || qObj?.pageNumber || 305,
          pageStart: qObj?.pageStart || part.pageNumber || 305,
          pageEnd: qObj?.pageEnd || part.pageNumber || 305,
          stageName: targetStage
        }
      ];
    }

    return [];
  };

  /**
   * Helper to retrieve assessment matching participant, judge, stage, and questionId strictly.
   * Identity: tenantId + participantId + judgeId + stageName + questionId
   */
  const getJudgeAssessment = (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ): JudgeAssessment | undefined => {
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    const targetStage = stageName || part?.stageName || selectedStageName;

    return assessments.find((a) => {
      if (a.tenantId !== currentTenantId) return false;
      if (a.participantId !== participantId) return false;
      if (a.judgeId !== judgeId) return false;
      // Strict stage match
      if (a.stageName !== targetStage) return false;
      // Strict questionId match
      if (questionId) {
        return a.questionId === questionId;
      }
      return true;
    });
  };

  /**
   * Helper to retrieve stage participation for a participant and stage
   */
  const getStageParticipation = (
    participantId: string,
    stageName?: string
  ): StageParticipation | undefined => {
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    const targetStage = stageName || part?.stageName || selectedStageName;
    return stageParticipations.find(
      (sp) =>
        sp.tenantId === currentTenantId &&
        sp.participantId === participantId &&
        sp.stageName === targetStage
    );
  };

  /**
   * Derive overall participant status for a stage based on ALL required judge assignments AND ALL assigned maqras.
   * P0: Status "Lengkap" ONLY when ALL required judges have finalized ALL assigned questions for that stage.
   * If no maqras assigned on this stage, returns "Maqra Belum Ditetapkan".
   */
  const getParticipantProgress = (
    participantId: string,
    stageName?: string
  ): ParticipantProgressStatus => {
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return 'Belum Dimulai';
    const targetStage = stageName || part.stageName || selectedStageName;

    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    if (stageQuestions.length === 0) {
      return 'Maqra Belum Ditetapkan';
    }

    const sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        item.stageName === targetStage
    );

    // Find required judge assignments in current tenant for this stage and branch
    // STRICT: Never fallback to all judges in tenant if no official judgeAssignments exist!
    const requiredAssignments = judgeAssignments.filter((ja) => {
      if (ja.tenantId !== currentTenantId) return false;
      const matchesStage = sp?.stageId && ja.stageId
        ? ja.stageId === sp.stageId
        : ja.stageName === targetStage;
      if (!matchesStage) return false;
      if (part.branchId && ja.branchId) {
        return ja.branchId === part.branchId;
      }
      if (ja.branchName && part.branchName) {
        return ja.branchName === part.branchName;
      }
      return true;
    });

    const requiredJudgeIds = Array.from(new Set(requiredAssignments.map((ja) => ja.judgeId)));
    if (requiredJudgeIds.length === 0) {
      return 'Belum Dimulai';
    }

    const totalRequiredUnits = requiredJudgeIds.length * stageQuestions.length;
    let finalizedUnits = 0;
    let inProgressUnits = 0;

    for (const q of stageQuestions) {
      for (const jId of requiredJudgeIds) {
        const asm = assessments.find(
          (a) =>
            a.tenantId === currentTenantId &&
            a.participantId === participantId &&
            a.judgeId === jId &&
            (sp?.id && a.stageParticipationId
              ? a.stageParticipationId === sp.id
              : sp?.stageId && a.stageId
              ? a.stageId === sp.stageId
              : a.stageName === targetStage) &&
            a.questionId === q.questionId
        );
        if (asm?.status === 'finalized') {
          finalizedUnits++;
        } else if (asm?.status === 'in_progress') {
          inProgressUnits++;
        }
      }
    }

    if (finalizedUnits === totalRequiredUnits && totalRequiredUnits > 0) {
      return 'Lengkap';
    }
    if (finalizedUnits > 0) {
      return 'Menunggu Hakim Lain';
    }
    if (inProgressUnits > 0) {
      return 'Berlangsung';
    }
    return 'Belum Dimulai';
  };

  // Dynamic Rubric & Competition Rule Resolvers (P0 Dynamic Architecture)
  const getBranchRuleConfigByBranch = (branchName: string, branchId?: string): CompetitionRuleConfig => {
    return getBranchRuleConfig(branchName, currentTenantId, competitionRules, branchId);
  };

  const getActiveRubricForBranch = (branchName: string, branchId?: string): RubricVersion | null => {
    const res = resolveActiveRubricForBranch({
      branchName,
      branchId,
      tenantId: currentTenantId,
      competitionRules,
      rubricVersions
    });
    return res.rubric;
  };

  const addRubricVersion = (rubricData: Omit<RubricVersion, 'id' | 'tenantId' | 'createdAt'>) => {
    const newRubric: RubricVersion = {
      ...rubricData,
      id: generateUuid(),
      tenantId: currentTenantId,
      createdAt: new Date().toISOString()
    };
    setRubricVersions((prev) => [...prev, newRubric]);
    if (isLiveDbActive) {
      setSyncStatus('Menyimpan versi rubrik ke database...');
      void supabaseDataService
        .upsertRubricVersionWithFields(toDeterministicUuid(currentTenantId), {
          ...newRubric,
          id: toDeterministicUuid(newRubric.id),
          tenantId: toDeterministicUuid(currentTenantId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal menyimpan rubrik: ${res.message}`);
            setRubricVersions((prev) => prev.filter((r) => r.id !== newRubric.id));
          } else {
            setSyncStatus('Rubrik Tersimpan di Database');
          }
        });
    }
  };

  const updateRubricVersion = (
    id: string,
    updated: Partial<RubricVersion>
  ): { success: boolean; message: string } => {
    const target = rubricVersions.find((r) => r.id === id);
    if (!target) {
      return { success: false, message: 'Versi rubrik tidak ditemukan.' };
    }

    // Historical Immutability Protection:
    // If this rubric version is already used in any finalized assessment or stage snapshot,
    // block in-place structural mutations (fields, startingScore, branchCode).
    const isUsedInFinalizedAssessments = assessments.some(
      (a) =>
        a.status === 'finalized' &&
        (a.rubricVersionId === id || a.rubricVersion === target.code)
    );
    const isUsedInSnapshots = stageSnapshots.some((s) => s.rubricVersionId === id);

    const isMutatingStructure =
      updated.fields !== undefined ||
      updated.startingScore !== undefined ||
      updated.branchCode !== undefined;

    if ((isUsedInFinalizedAssessments || isUsedInSnapshots) && isMutatingStructure) {
      return {
        success: false,
        message: `Perubahan struktur rubrik "${target.name}" (${target.version}) ditolak karena versi ini telah digunakan pada lembar penilaian final atau snapshot babak. Buat versi rubrik baru agar rekaman historis tetap utuh.`
      };
    }

    const mergedRubric: RubricVersion = { ...target, ...updated };
    setRubricVersions((prev) =>
      prev.map((r) => (r.id === id ? mergedRubric : r))
    );

    if (isLiveDbActive) {
      setSyncStatus('Memperbarui rubrik di database...');
      void supabaseDataService
        .upsertRubricVersionWithFields(toDeterministicUuid(currentTenantId), {
          ...mergedRubric,
          id: toDeterministicUuid(mergedRubric.id),
          tenantId: toDeterministicUuid(
            mergedRubric.tenantId === 'system'
              ? '00000000-0000-0000-0000-000000000000'
              : mergedRubric.tenantId || currentTenantId
          )
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal memperbarui rubrik: ${res.message}`);
            setRubricVersions((prev) => prev.map((r) => (r.id === id ? target : r)));
          } else {
            setSyncStatus('Rubrik Diperbarui di Database');
          }
        });
    }

    return {
      success: true,
      message: `Versi rubrik "${target.name}" berhasil diperbarui.`
    };
  };

  const activateRubricVersion = (id: string): { success: boolean; message: string } => {
    const target = rubricVersions.find((r) => r.id === id);
    if (!target) return { success: false, message: 'Rubrik tidak ditemukan.' };

    const activeFields = getActiveRubricFields(target);
    const totalMax = activeFields.reduce((sum, f) => sum + Number(f.maxScore || 0), 0);
    if (activeFields.length === 0 || totalMax <= 0) {
      return { success: false, message: 'Rubrik harus memiliki minimal 1 bidang aktif dengan batas skor valid.' };
    }
    if (Math.abs(totalMax - Number(target.startingScore || 100)) > 0.001) {
      return {
        success: false,
        message: `Total maxScore bidang aktif (${totalMax}) harus sama dengan skor awal rubrik (${target.startingScore}).`
      };
    }

    const prevRubrics = rubricVersions;
    setRubricVersions((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          return { ...r, status: 'Aktif' as const };
        }
        if (r.branchCode === target.branchCode && r.status === 'Aktif') {
          return { ...r, status: 'Arsip' as const };
        }
        return r;
      })
    );

    if (isLiveDbActive) {
      const targetTenantUuid = toDeterministicUuid(
        target.tenantId === 'system'
          ? '00000000-0000-0000-0000-000000000000'
          : target.tenantId || currentTenantId
      );
      void supabaseDataService
        .updateRubricVersionStatus(targetTenantUuid, toDeterministicUuid(id), 'Aktif')
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal mengaktifkan rubrik: ${res.message}`);
            setRubricVersions(prevRubrics);
          } else {
            setSyncStatus('Status Rubrik Aktif Tersimpan di Database');
          }
        });
    }

    return { success: true, message: `Versi rubrik "${target.name}" (${target.version}) berhasil diaktifkan.` };
  };

  const archiveRubricVersion = (id: string) => {
    const target = rubricVersions.find((r) => r.id === id);
    setRubricVersions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Arsip' as const } : r))
    );
    if (isLiveDbActive && target) {
      const targetTenantUuid = toDeterministicUuid(
        target.tenantId === 'system'
          ? '00000000-0000-0000-0000-000000000000'
          : target.tenantId || currentTenantId
      );
      void supabaseDataService
        .updateRubricVersionStatus(targetTenantUuid, toDeterministicUuid(id), 'Arsip')
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal mengarsipkan rubrik: ${res.message}`);
            setRubricVersions((prev) => prev.map((r) => (r.id === id ? target : r)));
          }
        });
    }
  };

  const deleteRubricVersion = (id: string): { success: boolean; message: string } => {
    const target = rubricVersions.find((r) => r.id === id);
    if (!target) {
      return { success: false, message: 'Versi rubrik tidak ditemukan.' };
    }

    const isUsedInFinalizedAssessments = assessments.some(
      (a) =>
        a.status === 'finalized' &&
        (a.rubricVersionId === id || a.rubricVersion === target.code)
    );
    const isUsedInSnapshots = stageSnapshots.some((s) => s.rubricVersionId === id);

    if (isUsedInFinalizedAssessments || isUsedInSnapshots) {
      return {
        success: false,
        message: `Versi rubrik "${target.name}" (${target.version}) tidak dapat dihapus karena telah digunakan pada lembar penilaian final atau snapshot babak. Gunakan fitur Arsip.`
      };
    }

    setRubricVersions((prev) => prev.filter((r) => r.id !== id));

    if (isLiveDbActive) {
      const targetTenantUuid = toDeterministicUuid(
        target.tenantId === 'system'
          ? '00000000-0000-0000-0000-000000000000'
          : target.tenantId || currentTenantId
      );
      void supabaseDataService
        .deleteRubricVersion(targetTenantUuid, toDeterministicUuid(id))
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal menghapus rubrik: ${res.message}`);
            setRubricVersions((prev) => [...prev, target]);
          } else {
            setSyncStatus('Versi Rubrik Dihapus dari Database');
          }
        });
    }

    return {
      success: true,
      message: `Versi rubrik "${target.name}" (${target.version}) berhasil dihapus.`
    };
  };

  const addCompetitionRule = (ruleData: Omit<CompetitionRuleConfig, 'id' | 'tenantId'>) => {
    const newRule: CompetitionRuleConfig = {
      ...ruleData,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setCompetitionRules((prev) => [...prev, newRule]);
    if (isLiveDbActive && newRule.branchId && newRule.rubricVersionId) {
      void supabaseDataService
        .upsertCompetitionRuleConfig({
          ...newRule,
          id: toDeterministicUuid(newRule.id),
          tenantId: toDeterministicUuid(currentTenantId),
          branchId: toDeterministicUuid(newRule.branchId),
          rubricVersionId: toDeterministicUuid(newRule.rubricVersionId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal menyimpan aturan kompetisi: ${res.message}`);
            setCompetitionRules((prev) => prev.filter((r) => r.id !== newRule.id));
          }
        });
    }
  };

  const updateCompetitionRule = (id: string, updated: Partial<CompetitionRuleConfig>) => {
    const existing = competitionRules.find((r) => r.id === id);
    setCompetitionRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
    );
    if (isLiveDbActive && existing) {
      const merged: CompetitionRuleConfig = { ...existing, ...updated };
      if (merged.branchId && merged.rubricVersionId) {
        void supabaseDataService
          .upsertCompetitionRuleConfig({
            ...merged,
            id: toDeterministicUuid(merged.id),
            tenantId: toDeterministicUuid(currentTenantId),
            branchId: toDeterministicUuid(merged.branchId),
            rubricVersionId: toDeterministicUuid(merged.rubricVersionId)
          })
          .then((res) => {
            if (!res.success) {
              setSyncStatus(`Gagal memperbarui aturan kompetisi: ${res.message}`);
              setCompetitionRules((prev) => prev.map((r) => (r.id === id ? existing : r)));
            }
          });
      }
    }
  };

  const deleteCompetitionRule = (id: string): { success: boolean; message: string } => {
    const existing = competitionRules.find((r) => r.id === id);
    if (!existing) {
      return { success: false, message: 'Konfigurasi aturan cabang tidak ditemukan.' };
    }

    setCompetitionRules((prev) => prev.filter((r) => r.id !== id));

    if (isLiveDbActive) {
      const targetTenantUuid = toDeterministicUuid(
        existing.tenantId === 'system'
          ? '00000000-0000-0000-0000-000000000000'
          : existing.tenantId || currentTenantId
      );
      void supabaseDataService
        .deleteCompetitionRuleConfig(targetTenantUuid, toDeterministicUuid(id))
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal menghapus aturan kompetisi: ${res.message}`);
            setCompetitionRules((prev) => [...prev, existing]);
          } else {
            setSyncStatus('Aturan Kompetisi Dihapus dari Database');
          }
        });
    }

    return {
      success: true,
      message: `Konfigurasi aturan untuk "${existing.branchName}" berhasil dihapus.`
    };
  };

  /**
   * Helper internal untuk memvalidasi apakah hakim memiliki penugasan resmi (judge_assignments)
   * pada babak dan cabang peserta terkait.
   */
  const getStageBranchJudgeAssignments = (
    targetStage: string,
    stageId: string | undefined,
    part: Participant
  ): JudgeAssignment[] => {
    return judgeAssignments.filter((ja) => {
      if (ja.tenantId !== currentTenantId) return false;
      const matchesStage = stageId && ja.stageId ? ja.stageId === stageId : ja.stageName === targetStage;
      if (!matchesStage) return false;
      if (part.branchId && ja.branchId) {
        return ja.branchId === part.branchId;
      }
      if (ja.branchName && part.branchName) {
        return ja.branchName === part.branchName;
      }
      return true;
    });
  };

  /**
   * Menginisialisasi / mengonfirmasi lembar penilaian (termasuk penampilan sempurna 0 kesalahan)
   * secara eksplisit sebelum difinalisasi oleh hakim yang ditugaskan.
   */
  const initializeAssessment = (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ): { success: boolean; message: string } => {
    if (currentUser.role !== 'judge' || currentUser.id !== judgeId) {
      return {
        success: false,
        message: 'Otorisasi ditolak: Hanya dewan hakim yang sedang bertugas yang dapat menginisialisasi lembar nilai.'
      };
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) {
      return { success: false, message: 'Peserta tidak ditemukan pada tenant aktif.' };
    }

    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;

    if (!targetQuestionId || !stageQuestions.some((q) => q.questionId === targetQuestionId)) {
      return {
        success: false,
        message: 'Inisialisasi ditolak: Peserta belum memiliki penetapan maqra yang sah pada babak ini.'
      };
    }

    const targetStageObj = stages.find(
      (s) =>
        s.tenantId === currentTenantId &&
        s.name === targetStage &&
        (!part.branchId || !s.branchId || s.branchId === part.branchId) &&
        (!part.branchName || !s.branchName || s.branchName === part.branchName)
    );
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    const stageBranchAssignments = getStageBranchJudgeAssignments(targetStage, targetStageObj?.id, part);
    if (
      stageBranchAssignments.length === 0 ||
      !stageBranchAssignments.some((ja) => ja.judgeId === judgeId)
    ) {
      return {
        success: false,
        message: 'Otorisasi ditolak: Anda tidak terdaftar secara resmi pada penugasan majelis hakim (judge_assignments) untuk cabang dan babak ini.'
      };
    }

    const activeRubric = getActiveRubricForBranch(part.branchName, part.branchId);
    if (!activeRubric) {
      return {
        success: false,
        message: `Inisialisasi ditolak: Cabang "${part.branchName}" belum memiliki rubrik aktif.`
      };
    }

    let sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        (targetStageObj?.id && item.stageId ? item.stageId === targetStageObj.id : item.stageName === targetStage)
    );

    if (!sp) {
      sp = {
        id: `sp-${participantId}-${stageId}-${Date.now()}`,
        tenantId: currentTenantId,
        participantId,
        stageId,
        stageName: targetStage,
        branchId: part.branchId,
        branchName: part.branchName,
        lotteryNumber: part.lotteryNumber,
        questionId: targetQuestionId,
        assignedMaqra: part.assignedMaqra,
        pageNumber: part.pageNumber,
        status: 'Berlangsung'
      };
      setStageParticipations((prev) => [...prev, sp!]);
    }

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        (sp?.id && a.stageParticipationId ? a.stageParticipationId === sp.id : a.stageName === targetStage) &&
        a.questionId === targetQuestionId
    );

    if (existing?.status === 'finalized') {
      return {
        success: false,
        message: 'Lembar penilaian ini sudah berstatus final.'
      };
    }

    const nowTime = getWibTime();
    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;
    const currentCounts = existing ? { ...existing.errorCounts } : {};
    const scoreResult = calculateAssessmentScore(
      currentCounts,
      errorCategories,
      activeRubric,
      activeRubric.startingScore
    );

    if (scoreResult.validationErrors.length > 0) {
      return {
        success: false,
        message: `Validasi rubrik gagal: ${scoreResult.validationErrors.join('; ')}`
      };
    }

    const initializedAsm: JudgeAssessment = existing
      ? {
          ...existing,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          status: 'in_progress',
          deductions: scoreResult.deductions,
          fieldScores: scoreResult.fieldScores,
          fieldDeductions: scoreResult.fieldDeductions,
          totalDeductions: scoreResult.totalDeductions,
          finalScore: scoreResult.finalScore,
          rubricVersion: activeRubric.code,
          rubricVersionId: activeRubric.id,
          lastUpdated: nowTime
        }
      : {
          id: toDeterministicUuid(`asm-${participantId}-${judgeId}-${stageId}-${targetQuestionId}`),
          tenantId: currentTenantId,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          participantId,
          judgeId,
          judgeName: targetJudge.name,
          judgeField: targetJudge.judgeField || 'Dewan Hakim',
          questionId: targetQuestionId,
          status: 'in_progress',
          errorCounts: {},
          deductions: scoreResult.deductions,
          fieldScores: scoreResult.fieldScores,
          fieldDeductions: scoreResult.fieldDeductions,
          totalDeductions: scoreResult.totalDeductions,
          finalScore: scoreResult.finalScore,
          rubricVersion: activeRubric.code,
          rubricVersionId: activeRubric.id,
          annotations: [],
          lastUpdated: nowTime
        };

    const prevAssessmentsSnapshot = assessments;
    const prevSpSnapshot = stageParticipations;

    setAssessments((prev) => {
      const others = prev.filter((a) => a.id !== initializedAsm.id);
      return [...others, initializedAsm];
    });

    setStageParticipations((prev) =>
      prev.map((item) =>
        item.id === sp!.id && item.status === 'Belum Dimulai'
          ? { ...item, status: 'Berlangsung' }
          : item
      )
    );

    if (connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      setSyncStatus('Menyimpan ke database...');
      const matchedMaqraItem = stageQuestions.find((q) => q.questionId === targetQuestionId);
      void supabaseDataService
        .syncAssessmentToRemote(
          {
            ...initializedAsm,
            id: toDeterministicUuid(initializedAsm.id),
            tenantId: toDeterministicUuid(currentTenantId),
            stageParticipationId: toDeterministicUuid(sp.id),
            judgeId: toDeterministicUuid(judgeId),
            rubricVersionId: toDeterministicUuid(activeRubric.id),
            questionId: toDeterministicUuid(targetQuestionId),
            assignedMaqraId: matchedMaqraItem?.id
          },
          matchedMaqraItem?.id,
          { stageParticipation: sp, participant: part }
        )
        .then((res) => {
          if (res.success) {
            setSyncStatus('Lembar Penilaian Tersimpan di Database');
            setLastSyncTime(getWibTime());
            if (res.data?.assignedMaqraId) {
              setAssessments((prev) =>
                prev.map((a) =>
                  a.id === initializedAsm.id ? { ...a, assignedMaqraId: res.data!.assignedMaqraId } : a
                )
              );
            }
          } else {
            setSyncStatus(`Gagal Menyimpan Lembar Nilai: ${res.message}`);
            setAssessments(prevAssessmentsSnapshot);
            setStageParticipations(prevSpSnapshot);
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Kesalahan jaringan';
          setSyncStatus(`Gagal Menyimpan Lembar Nilai: ${msg}`);
          setAssessments(prevAssessmentsSnapshot);
          setStageParticipations(prevSpSnapshot);
        });
    } else {
      setSyncStatus('Mode Simulasi Lokal (Tersimpan di Browser)');
      setLastSyncTime(nowTime);
    }

    return {
      success: true,
      message: 'Lembar penilaian siap dan terkonfirmasi.'
    };
  };

  /**
   * Update error count with centralized calculation helper and strict read-only lock for finalized
   * Identity: participantId + judgeId + targetStage + targetQuestionId
   */
  const updateErrorCount = (
    participantId: string,
    judgeId: string,
    categoryId: string,
    delta: number,
    stageName?: string,
    questionId?: string
  ) => {
    // Role & Identity check: Only the logged-in judge can modify their own error counts
    if (currentUser.role !== 'judge' || currentUser.id !== judgeId) {
      console.warn('Perubahan nilai ditolak: Hanya hakim pemilik lembar nilai yang berwenang mengubah skor.');
      return;
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return;
    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;

    if (!targetQuestionId || !stageQuestions.some((q) => q.questionId === targetQuestionId)) {
      console.warn('Penilaian ditolak: Peserta belum memiliki maqra yang ditetapkan pada babak ini.');
      return;
    }

    const targetStageObj = stages.find(
      (s) =>
        s.tenantId === currentTenantId &&
        s.name === targetStage &&
        (!part.branchId || !s.branchId || s.branchId === part.branchId) &&
        (!part.branchName || !s.branchName || s.branchName === part.branchName)
    );
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    // Mandatory official judge assignment check
    const stageBranchAssignments = getStageBranchJudgeAssignments(targetStage, targetStageObj?.id, part);
    if (
      stageBranchAssignments.length === 0 ||
      !stageBranchAssignments.some((ja) => ja.judgeId === judgeId)
    ) {
      console.warn('Penilaian ditolak: Hakim tidak memiliki penugasan resmi pada babak dan cabang ini.');
      return;
    }

    const prevAssessmentsSnapshot = assessments;
    const prevSpSnapshot = stageParticipations;
    const prevParticipantsSnapshot = participants;

    // Get or create stage participation
    let sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        (targetStageObj?.id && item.stageId ? item.stageId === targetStageObj.id : item.stageName === targetStage)
    );

    if (!sp) {
      sp = {
        id: `sp-${participantId}-${stageId}-${Date.now()}`,
        tenantId: currentTenantId,
        participantId,
        stageId,
        stageName: targetStage,
        branchId: part.branchId,
        branchName: part.branchName,
        lotteryNumber: part.lotteryNumber,
        questionId: targetQuestionId,
        assignedMaqra: part.assignedMaqra,
        pageNumber: part.pageNumber,
        status: 'Berlangsung'
      };
      setStageParticipations((prev) => [...prev, sp!]);
    }

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        (sp?.id && a.stageParticipationId ? a.stageParticipationId === sp.id : a.stageName === targetStage) &&
        a.questionId === targetQuestionId
    );

    if (existing?.status === 'finalized' || existing?.isLocked) {
      console.warn('Penilaian yang sudah final bersifat read-only dan tidak dapat diubah.');
      return;
    }

    const nowTime = getWibTime();

    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;
    const currentCounts = existing ? { ...existing.errorCounts } : {};
    const oldCount = currentCounts[categoryId] || 0;
    const newCount = Math.max(0, oldCount + delta);
    currentCounts[categoryId] = newCount;

    // Resolusi rubrik aktif dinamis sesuai cabang lomba peserta (P0)
    const activeRubric = getActiveRubricForBranch(part.branchName, part.branchId);
    if (!activeRubric) {
      console.warn(`Pembaruan nilai dibatalkan: Cabang "${part.branchName}" belum memiliki rubrik aktif yang valid.`);
      return;
    }

    const scoreResult = calculateAssessmentScore(
      currentCounts,
      errorCategories,
      activeRubric,
      activeRubric.startingScore
    );

    const updatedAssessment: JudgeAssessment = existing
      ? {
          ...existing,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          questionId: targetQuestionId,
          errorCounts: currentCounts,
          deductions: scoreResult.deductions,
          fieldScores: scoreResult.fieldScores,
          fieldDeductions: scoreResult.fieldDeductions,
          totalDeductions: scoreResult.totalDeductions,
          finalScore: scoreResult.finalScore,
          rubricVersion: activeRubric.code,
          rubricVersionId: activeRubric.id,
          status: 'in_progress',
          lastUpdated: nowTime
        }
      : {
          id: toDeterministicUuid(`asm-${participantId}-${judgeId}-${stageId}-${targetQuestionId}`),
          tenantId: currentTenantId,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          participantId,
          judgeId,
          judgeName: targetJudge.name,
          judgeField: targetJudge.judgeField || 'Dewan Hakim',
          questionId: targetQuestionId,
          status: 'in_progress',
          errorCounts: currentCounts,
          deductions: scoreResult.deductions,
          fieldScores: scoreResult.fieldScores,
          fieldDeductions: scoreResult.fieldDeductions,
          totalDeductions: scoreResult.totalDeductions,
          finalScore: scoreResult.finalScore,
          rubricVersion: activeRubric.code,
          rubricVersionId: activeRubric.id,
          annotations: [],
          lastUpdated: nowTime
        };

    setAssessments((prev) => {
      const others = prev.filter((a) => a.id !== updatedAssessment.id);
      return [...others, updatedAssessment];
    });

    // Update stage participation status to Berlangsung
    setStageParticipations((prev) =>
      prev.map((item) =>
        item.id === sp!.id && item.status === 'Belum Dimulai'
          ? { ...item, status: 'Berlangsung' }
          : item
      )
    );

    // Update participant status to Berlangsung
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === participantId && p.tenantId === currentTenantId && p.status === 'Menunggu'
          ? { ...p, status: 'Berlangsung' }
          : p
      )
    );

    // Activity log entry
    const cat = errorCategories.find((c) => c.id === categoryId);
    if (cat && delta !== 0) {
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      const newLog: ActivityLogItem = {
        id: generateUniqueLogId('act'),
        tenantId: currentTenantId,
        type: 'autosave',
        title: 'Koreksi Nilai',
        description: `Koreksi kesalahan ${cat.name} (${sign}) peserta ${part.participantId} ${part.name} oleh ${targetJudge.name}.`,
        timestamp: nowTime,
        actorName: targetJudge.name
      };
      setActivityLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id).slice(0, 20)]);
    }

    if (connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      setSyncStatus('Menyimpan ke database...');
      const matchedMaqraItem = stageQuestions.find((q) => q.questionId === targetQuestionId);
      void supabaseDataService
        .syncAssessmentToRemote(
          {
            ...updatedAssessment,
            id: toDeterministicUuid(updatedAssessment.id),
            tenantId: toDeterministicUuid(currentTenantId),
            stageParticipationId: toDeterministicUuid(sp.id),
            judgeId: toDeterministicUuid(judgeId),
            rubricVersionId: toDeterministicUuid(activeRubric.id),
            questionId: toDeterministicUuid(targetQuestionId),
            assignedMaqraId: matchedMaqraItem?.id
          },
          matchedMaqraItem?.id,
          { stageParticipation: sp, participant: part }
        )
        .then((res) => {
          if (res.success) {
            setSyncStatus('Tersimpan di Database');
            setLastSyncTime(getWibTime());
            if (res.data?.assignedMaqraId) {
              setAssessments((prev) =>
                prev.map((a) =>
                  a.id === updatedAssessment.id ? { ...a, assignedMaqraId: res.data!.assignedMaqraId } : a
                )
              );
            }
          } else {
            setSyncStatus(`Gagal Menyimpan ke Database: ${res.message}`);
            setAssessments(prevAssessmentsSnapshot);
            setStageParticipations(prevSpSnapshot);
            setParticipants(prevParticipantsSnapshot);
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Kesalahan jaringan';
          setSyncStatus(`Gagal Menyimpan ke Database: ${msg}`);
          setAssessments(prevAssessmentsSnapshot);
          setStageParticipations(prevSpSnapshot);
          setParticipants(prevParticipantsSnapshot);
        });
    } else {
      setSyncStatus('Mode Simulasi Lokal (Tersimpan di Browser)');
      setLastSyncTime(nowTime);
    }
  };

  /**
   * Save annotations independently without needing error counts first
   * Strictly scoped by participantId, judgeId, targetStage, and targetQuestionId
   */
  const saveAnnotations = (
    participantId: string,
    judgeId: string,
    annotations: CanvasStroke[],
    stageName?: string,
    questionId?: string
  ) => {
    // Role check: Admin cannot mutate annotations
    if (currentUser.role !== 'judge' || currentUser.id !== judgeId) {
      return;
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return;
    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;
    if (!targetQuestionId) return;

    const targetStageObj = stages.find(
      (s) =>
        s.tenantId === currentTenantId &&
        s.name === targetStage &&
        (!part.branchId || !s.branchId || s.branchId === part.branchId) &&
        (!part.branchName || !s.branchName || s.branchName === part.branchName)
    );
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    const stageBranchAssignments = getStageBranchJudgeAssignments(targetStage, targetStageObj?.id, part);
    if (
      stageBranchAssignments.length === 0 ||
      !stageBranchAssignments.some((ja) => ja.judgeId === judgeId)
    ) {
      return;
    }

    const prevAssessmentsSnapshot = assessments;
    const prevSpSnapshot = stageParticipations;

    let sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        (targetStageObj?.id && item.stageId ? item.stageId === targetStageObj.id : item.stageName === targetStage)
    );

    if (!sp) {
      sp = {
        id: `sp-${participantId}-${stageId}-${Date.now()}`,
        tenantId: currentTenantId,
        participantId,
        stageId,
        stageName: targetStage,
        branchId: part.branchId,
        branchName: part.branchName,
        lotteryNumber: part.lotteryNumber,
        questionId: targetQuestionId,
        assignedMaqra: part.assignedMaqra,
        pageNumber: part.pageNumber,
        status: 'Berlangsung'
      };
      setStageParticipations((prev) => [...prev, sp!]);
    }

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        (sp?.id && a.stageParticipationId ? a.stageParticipationId === sp.id : a.stageName === targetStage) &&
        a.questionId === targetQuestionId
    );

    if (existing?.status === 'finalized' || existing?.isLocked) {
      return;
    }

    const nowTime = getWibTime();
    setSyncStatus('Menyimpan anotasi mushaf...');
    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;
    const activeRubric = getActiveRubricForBranch(part.branchName, part.branchId);

    const updatedSheet: JudgeAssessment = existing
      ? {
          ...existing,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          questionId: targetQuestionId,
          annotations,
          lastUpdated: nowTime
        }
      : {
          id: toDeterministicUuid(`asm-${participantId}-${judgeId}-${stageId}-${targetQuestionId}`),
          tenantId: currentTenantId,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          participantId,
          judgeId,
          judgeName: targetJudge.name,
          judgeField: targetJudge.judgeField || 'Dewan Hakim',
          questionId: targetQuestionId,
          rubricVersion: activeRubric?.code || 'RUBRIC-SENI-BACA-2025',
          rubricVersionId: activeRubric?.id,
          status: 'in_progress',
          errorCounts: {},
          deductions: {},
          totalDeductions: 0,
          finalScore: activeRubric?.startingScore || 100.0,
          annotations,
          lastUpdated: nowTime
        };

    setAssessments((prev) => {
      const others = prev.filter((a) => a.id !== updatedSheet.id);
      return [...others, updatedSheet];
    });

    if (connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated && activeRubric) {
      const matchedMaqraItem = stageQuestions.find((q) => q.questionId === targetQuestionId);
      void supabaseDataService
        .syncAssessmentToRemote(
          {
            ...updatedSheet,
            id: toDeterministicUuid(updatedSheet.id),
            tenantId: toDeterministicUuid(currentTenantId),
            stageParticipationId: toDeterministicUuid(sp.id),
            judgeId: toDeterministicUuid(judgeId),
            rubricVersionId: toDeterministicUuid(activeRubric.id),
            questionId: toDeterministicUuid(targetQuestionId),
            assignedMaqraId: matchedMaqraItem?.id || updatedSheet.assignedMaqraId
          },
          matchedMaqraItem?.id || updatedSheet.assignedMaqraId,
          { stageParticipation: sp, participant: part }
        )
        .then((res) => {
          if (res.success) {
            setSyncStatus('Anotasi & Nilai Tersimpan di Database');
            setLastSyncTime(getWibTime());
            if (res.data?.assignedMaqraId) {
              setAssessments((prev) =>
                prev.map((a) =>
                  a.id === updatedSheet.id ? { ...a, assignedMaqraId: res.data!.assignedMaqraId } : a
                )
              );
            }
          } else {
            setSyncStatus(`Gagal Menyimpan Anotasi: ${res.message}`);
            setAssessments(prevAssessmentsSnapshot);
            setStageParticipations(prevSpSnapshot);
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Kesalahan jaringan';
          setSyncStatus(`Gagal Menyimpan Anotasi: ${msg}`);
          setAssessments(prevAssessmentsSnapshot);
          setStageParticipations(prevSpSnapshot);
        });
    } else {
      setSyncStatus('Mode Simulasi Lokal (Tersimpan di Browser)');
      setLastSyncTime(nowTime);
    }
  };

  /**
   * Finalize individual judge assessment scoped strictly to question, stage, and official judge assignment.
   * Rejects unassigned judges and rejects empty/uninitialized assessment sheets.
   * When connected to live database, waits for sync + RPC finalization before mutating local state to finalized.
   */
  const finalizeAssessment = async (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ): Promise<{ success: boolean; message: string }> => {
    // 1. Role check: Admin cannot finalize on behalf of judge
    if (currentUser.role !== 'judge') {
      return {
        success: false,
        message: 'Otorisasi ditolak: Hanya dewan hakim yang berwenang memfinalisasi lembar penilaian.'
      };
    }

    // 2. Judge identity check
    if (currentUser.id !== judgeId) {
      return {
        success: false,
        message: 'Otorisasi ditolak: Identitas hakim tidak sesuai dengan pengguna yang sedang login.'
      };
    }

    // 3. Participant check
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) {
      return {
        success: false,
        message: 'Peserta tidak ditemukan pada tenant aktif.'
      };
    }

    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;

    // 4. Maqra check: Must exist and belong to this participant's stage questions
    if (!targetQuestionId || !stageQuestions.some((q) => q.questionId === targetQuestionId)) {
      return {
        success: false,
        message: 'Finalisasi ditolak: Peserta belum memiliki penetapan maqra yang sah pada babak ini.'
      };
    }

    const targetStageObj = stages.find(
      (s) =>
        s.tenantId === currentTenantId &&
        s.name === targetStage &&
        (!part.branchId || !s.branchId || s.branchId === part.branchId) &&
        (!part.branchName || !s.branchName || s.branchName === part.branchName)
    );
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    // 5. Mandatory Official Judge Assignment check (NO FALLBACK when stageAssignments is empty!)
    const stageBranchAssignments = getStageBranchJudgeAssignments(targetStage, targetStageObj?.id, part);
    if (stageBranchAssignments.length === 0) {
      return {
        success: false,
        message: 'Finalisasi ditolak: Belum ada penugasan majelis hakim resmi (judge_assignments) untuk babak dan cabang ini.'
      };
    }

    const isJudgeAssigned = stageBranchAssignments.some((ja) => ja.judgeId === judgeId);
    if (!isJudgeAssigned) {
      return {
        success: false,
        message: 'Finalisasi ditolak: Anda tidak terdaftar secara resmi sebagai hakim penilai untuk cabang dan babak ini.'
      };
    }

    // 6. Active Rubric check (without silent fallback to Seni Baca)
    const activeRubric = getActiveRubricForBranch(part.branchName, part.branchId);
    if (!activeRubric || activeRubric.status !== 'Aktif') {
      return {
        success: false,
        message: `Finalisasi ditolak: Aturan/rubrik penilaian belum terkonfigurasi atau tidak berstatus Aktif untuk cabang "${part.branchName}".`
      };
    }

    const sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        (targetStageObj?.id && item.stageId ? item.stageId === targetStageObj.id : item.stageName === targetStage)
    );

    if (!sp) {
      return {
        success: false,
        message: 'Finalisasi ditolak: Data partisipasi babak (StageParticipation) peserta tidak ditemukan.'
      };
    }

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        (a.stageParticipationId ? a.stageParticipationId === sp.id : a.stageName === targetStage) &&
        a.questionId === targetQuestionId
    );

    // 7. Reject Empty / Non-Existent Assessment Bypass!
    if (!existing || existing.status === 'not_started') {
      return {
        success: false,
        message: 'Finalisasi ditolak: Lembar penilaian belum diinisialisasi atau belum pernah diisi. Silakan mulai lembar penilaian atau konfirmasi penampilan tanpa kesalahan terlebih dahulu.'
      };
    }

    // 8. Reject re-finalization of already finalized assessment
    if (existing.status === 'finalized' || existing.isLocked) {
      return {
        success: false,
        message: 'Lembar penilaian ini sudah dalam status terfinalisasi.'
      };
    }

    // 9. Calculate score and validate rubric fields
    const currentCounts = existing.errorCounts || {};
    const scoreResult = calculateAssessmentScore(
      currentCounts,
      errorCategories,
      activeRubric,
      activeRubric.startingScore
    );

    if (scoreResult.validationErrors.length > 0) {
      return {
        success: false,
        message: `Finalisasi diblokir karena validasi rubrik gagal: ${scoreResult.validationErrors.join('; ')}`
      };
    }

    const matchedMaqraItem = stageQuestions.find((q) => q.questionId === targetQuestionId);
    let resolvedAssignedMaqraId = existing.assignedMaqraId || matchedMaqraItem?.id;

    // 10. Database Transaction First when in live database mode!
    if (supabaseDataService.isLive() && connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      setSyncStatus('Memproses finalisasi di server...');
      const asmUuid = toDeterministicUuid(existing.id);

      const syncRes = await supabaseDataService.syncAssessmentToRemote(
        {
          ...existing,
          id: asmUuid,
          tenantId: toDeterministicUuid(currentTenantId),
          stageParticipationId: toDeterministicUuid(sp.id),
          judgeId: toDeterministicUuid(judgeId),
          rubricVersionId: toDeterministicUuid(activeRubric.id),
          questionId: toDeterministicUuid(targetQuestionId),
          assignedMaqraId: resolvedAssignedMaqraId,
          status: 'in_progress',
          isLocked: false,
          deductions: scoreResult.deductions,
          fieldScores: scoreResult.fieldScores,
          totalDeductions: scoreResult.totalDeductions,
          finalScore: scoreResult.finalScore
        },
        resolvedAssignedMaqraId,
        { stageParticipation: sp, participant: part }
      );

      if (!syncRes.success) {
        setSyncStatus('Gagal Menyimpan Draf ke Database');
        return {
          success: false,
          message: `Gagal menyimpan draf penilaian ke database sebelum finalisasi: ${syncRes.message}`
        };
      }

      const persistedAssessmentId = syncRes.data?.assessmentId || asmUuid;
      resolvedAssignedMaqraId = syncRes.data?.assignedMaqraId || resolvedAssignedMaqraId;

      const rpcRes = await supabaseDataService.finalizeJudgeAssessmentRpc(persistedAssessmentId);
      if (!rpcRes.success) {
        setSyncStatus('Gagal Memfinalisasi di Database');
        return {
          success: false,
          message: `Finalisasi database ditolak: ${rpcRes.message}`
        };
      }
    }

    const nowTime = getWibTime();
    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;
    const finalizedScore = scoreResult.finalScore;

    const updatedAssessments: JudgeAssessment[] = assessments.map((a) =>
      a.id === existing.id
        ? {
            ...a,
            stageParticipationId: sp.id,
            stageId,
            stageName: targetStage,
            assignedMaqraId: resolvedAssignedMaqraId,
            status: 'finalized',
            isLocked: true,
            deductions: scoreResult.deductions,
            fieldScores: scoreResult.fieldScores,
            fieldDeductions: scoreResult.fieldDeductions,
            totalDeductions: scoreResult.totalDeductions,
            finalScore: scoreResult.finalScore,
            rubricVersion: activeRubric.code,
            rubricVersionId: activeRubric.id,
            finalizedAt: nowTime,
            lastUpdated: nowTime
          }
        : a
    );
    setAssessments(updatedAssessments);

    // 11. Check required judges strictly from official assignments (NO fallback to all tenant judges)
    const requiredJudgeIds = Array.from(new Set(stageBranchAssignments.map((ja) => ja.judgeId)));
    const totalRequiredUnits = requiredJudgeIds.length * stageQuestions.length;
    let finalizedUnits = 0;

    for (const q of stageQuestions) {
      for (const jId of requiredJudgeIds) {
        const isCurrent = jId === judgeId && q.questionId === targetQuestionId;
        const asm = updatedAssessments.find(
          (a) =>
            a.tenantId === currentTenantId &&
            a.judgeId === jId &&
            a.participantId === participantId &&
            (a.stageParticipationId ? a.stageParticipationId === sp.id : a.stageName === targetStage) &&
            a.questionId === q.questionId
        );
        if (isCurrent || asm?.status === 'finalized') {
          finalizedUnits++;
        }
      }
    }

    const allFinalized = finalizedUnits === totalRequiredUnits && totalRequiredUnits > 0;
    const updatedStatus: ParticipantProgressStatus = allFinalized
      ? 'Lengkap'
      : finalizedUnits > 0
      ? 'Menunggu Hakim Lain'
      : 'Berlangsung';

    setStageParticipations((prev) =>
      prev.map((item) =>
        item.id === sp.id
          ? {
              ...item,
              status: updatedStatus,
              finalizedAt: allFinalized ? nowTime : item.finalizedAt
            }
          : item
      )
    );

    if (part.status === 'Menunggu') {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId && p.tenantId === currentTenantId
            ? { ...p, status: 'Berlangsung' }
            : p
        )
      );
    }

    const currentQObj = stageQuestions.find((q) => q.questionId === targetQuestionId);
    const qLabel = currentQObj?.code || 'Maqra';
    const auditFinalized: AuditLogItem = {
      id: generateUniqueLogId('aud'),
      timestamp: nowTime,
      actor: `${currentUser.name} (${currentUser.role})`,
      action: 'ASSESSMENT_FINALIZED',
      target: `Peserta ${part.participantId} (${part.name}) - ${targetJudge.name}`,
      tenantName: currentTenant.name,
      summary: `Finalisasi lembar nilai ${targetJudge.judgeField || 'Dewan Hakim'} untuk ${qLabel} pada Babak ${targetStage} dengan nilai ${finalizedScore.toFixed(2)}.`,
      outcome: 'Success'
    };
    setAuditLogs((prev) => [auditFinalized, ...prev]);

    const newLog: ActivityLogItem = {
      id: generateUniqueLogId('act'),
      tenantId: currentTenantId,
      type: 'finalized',
      title: 'Penilaian Hakim Terkunci',
      description: `Penilaian ${qLabel} peserta ${part.participantId} ${part.name} berhasil dikunci oleh ${targetJudge.name} (Skor: ${finalizedScore.toFixed(2)}).`,
      timestamp: nowTime,
      actorName: targetJudge.name
    };
    setActivityLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id).slice(0, 20)]);

    setSyncStatus(
      supabaseDataService.isLive()
        ? supabaseDataService.getConnectionStatus().statusLabel
        : 'Mode Lokal (Tersimpan di Browser)'
    );
    setLastSyncTime(nowTime);

    return {
      success: true,
      message: `Penilaian ${qLabel} untuk peserta ${part.name} (Skor: ${finalizedScore.toFixed(2)}) berhasil dikunci dan difinalisasi.`
    };
  };

  /**
   * Pembukaan kembali lembar penilaian final (Correction & Reopen Policy)
   * Hanya dapat dilakukan oleh Administrator / Superadmin dengan mencantumkan alasan wajib.
   * Menunggu transaksi RPC server sebelum membuka kunci di state lokal.
   */
  const reopenAssessment = async (
    participantId: string,
    judgeId: string,
    reason: string,
    stageName?: string,
    questionId?: string
  ): Promise<{ success: boolean; message: string }> => {
    if (currentUser.role === 'judge') {
      return {
        success: false,
        message: 'Otorisasi ditolak: Hanya Administrator yang berwenang membuka kembali penilaian yang sudah final.'
      };
    }

    if (!reason || reason.trim().length < 5) {
      return {
        success: false,
        message: 'Alasan pembukaan kembali lembar nilai wajib diisi minimal 5 karakter untuk rekaman audit trail.'
      };
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) {
      return { success: false, message: 'Peserta tidak ditemukan pada tenant ini.' };
    }

    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        a.stageName === targetStage &&
        (!targetQuestionId || a.questionId === targetQuestionId)
    );

    if (!existing) {
      return { success: false, message: 'Lembar penilaian tidak ditemukan.' };
    }

    if (existing.status !== 'finalized') {
      return { success: false, message: 'Lembar penilaian belum berstatus final.' };
    }

    // Execute server RPC FIRST when connected to live database
    if (supabaseDataService.isLive() && connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      setSyncStatus('Membuka kunci penilaian di server...');
      const rpcRes = await supabaseDataService.reopenJudgeAssessmentRpc(
        toDeterministicUuid(existing.id),
        reason
      );
      if (!rpcRes.success) {
        setSyncStatus('Gagal Membuka Kunci di Database');
        return {
          success: false,
          message: `Pembukaan kembali penilaian di database ditolak: ${rpcRes.message}`
        };
      }
    }

    const nowTime = getWibTime();
    const targetJudge = users.find((u) => u.id === judgeId);

    // Buka kunci lembar penilaian kembali ke status in_progress
    setAssessments((prev) =>
      prev.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              status: 'in_progress',
              isLocked: false,
              reopenedAt: nowTime,
              reopenedBy: `${currentUser.name} (${currentUser.role})`,
              reopenReason: reason,
              lastUpdated: nowTime
            }
          : a
      )
    );

    // Kembalikan status kemajuan babak peserta
    setStageParticipations((prev) =>
      prev.map((sp) =>
        sp.tenantId === currentTenantId &&
        sp.participantId === participantId &&
        sp.stageName === targetStage &&
        sp.status === 'Lengkap'
          ? { ...sp, status: 'Berlangsung' }
          : sp
      )
    );

    // Kembalikan status peserta jika sebelumnya 'Final'
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === participantId && p.tenantId === currentTenantId && p.status === 'Final'
          ? { ...p, status: 'Berlangsung' }
          : p
      )
    );

    // Catat Audit Log Permanen
    const reopenAudit: AuditLogItem = {
      id: generateUniqueLogId('aud'),
      timestamp: nowTime,
      actor: `${currentUser.name} (${currentUser.role})`,
      action: 'ASSESSMENT_REOPENED',
      target: `Peserta ${part.participantId} (${part.name}) - Hakim ${targetJudge?.name || judgeId}`,
      tenantName: currentTenant.name,
      summary: `Pembukaan kembali lembar penilaian final (Skor sebelum koreksi: ${existing.finalScore.toFixed(2)}) pada Babak ${targetStage}.`,
      reason,
      outcome: 'Success'
    };
    setAuditLogs((prev) => [reopenAudit, ...prev]);

    const reopenActivity: ActivityLogItem = {
      id: generateUniqueLogId('act'),
      tenantId: currentTenantId,
      type: 'config',
      title: 'Penilaian Dibuka Kembali',
      description: `Lembar penilaian ${part.name} oleh ${targetJudge?.name || 'Hakim'} dibuka kembali oleh ${currentUser.name}. Alasan: ${reason}`,
      timestamp: nowTime,
      actorName: currentUser.name
    };
    setActivityLogs((prev) => [reopenActivity, ...prev.filter((l) => l.id !== reopenActivity.id).slice(0, 20)]);

    setSyncStatus(
      supabaseDataService.isLive()
        ? supabaseDataService.getConnectionStatus().statusLabel
        : 'Mode Lokal (Tersimpan di Browser)'
    );
    setLastSyncTime(nowTime);

    return {
      success: true,
      message: `Lembar penilaian berhasil dibuka kembali untuk koreksi. Hakim terkait sekarang dapat mengedit nilai.`
    };
  };

  // Kafilah Actions (Tenant Scoped)
  const addKafilah = (data: Omit<Kafilah, 'id' | 'tenantId'>) => {
    const newKafilah: Kafilah = {
      ...data,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setKafilahs((prev) => [...prev, newKafilah]);
    if (isLiveDbActive) {
      setSyncStatus('Menyimpan kafilah ke database...');
      void supabaseDataService
        .upsertKafilah({
          ...newKafilah,
          tenantId: toDeterministicUuid(currentTenantId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Kafilah: ${res.message}`);
            setKafilahs((prev) => prev.filter((k) => k.id !== newKafilah.id));
          } else {
            setSyncStatus('Kafilah Tersimpan di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  const updateKafilah = (id: string, updated: Partial<Kafilah>) => {
    const existing = kafilahs.find((k) => k.id === id && k.tenantId === currentTenantId);
    if (!existing) return;
    const merged: Kafilah = { ...existing, ...updated };

    setKafilahs((prev) =>
      prev.map((k) => (k.id === id && k.tenantId === currentTenantId ? merged : k))
    );
    if (updated.name) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.kafilahId === id && p.tenantId === currentTenantId
            ? { ...p, kafilahName: updated.name! }
            : p
        )
      );
    }

    if (isLiveDbActive) {
      setSyncStatus('Memperbarui kafilah di database...');
      void supabaseDataService
        .upsertKafilah({
          ...merged,
          id: toDeterministicUuid(merged.id),
          tenantId: toDeterministicUuid(currentTenantId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Kafilah: ${res.message}`);
            setKafilahs((prev) =>
              prev.map((k) => (k.id === id && k.tenantId === currentTenantId ? existing : k))
            );
          } else {
            setSyncStatus('Kafilah Diperbarui di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  // Participant Actions (Tenant Scoped)
  const addParticipant = (data: Omit<Participant, 'id' | 'tenantId'>): { success: boolean; message: string } => {
    const idTrimmed = (data.participantId || '').trim();
    if (idTrimmed) {
      const existingId = participants.find(
        (p) => p.tenantId === currentTenantId && p.participantId.trim().toLowerCase() === idTrimmed.toLowerCase()
      );
      if (existingId) {
        return {
          success: false,
          message: `ID Peserta "${data.participantId}" sudah terdaftar atas nama ${existingId.name}.`
        };
      }
    }

    const lotteryTrimmed = (data.lotteryNumber || '').trim();
    if (lotteryTrimmed) {
      const existingLottery = participants.find(
        (p) =>
          p.tenantId === currentTenantId &&
          p.branchName === data.branchName &&
          p.lotteryNumber.trim().toLowerCase() === lotteryTrimmed.toLowerCase()
      );
      if (existingLottery) {
        return {
          success: false,
          message: `Nomor undian "${data.lotteryNumber}" sudah digunakan oleh peserta ${existingLottery.name} pada cabang ${data.branchName}.`
        };
      }
    }

    const newPartId = generateUuid();
    const targetStage = data.stageName || 'Penyisihan';
    const targetStageObj = stages.find(
      (s) => s.tenantId === currentTenantId && s.name === targetStage
    );
    const stageId = targetStageObj?.id || toDeterministicUuid('stage-penyisihan');
    const matchedBranch = cabangList.find(
      (c) => c.name === data.branchName || data.branchName.includes(c.name)
    );
    const branchId = data.branchId || matchedBranch?.id || toDeterministicUuid(data.branchName);

    const hasQuestion = Boolean(data.questionId && data.questionId.trim() !== '');

    const newPart: Participant = {
      ...data,
      id: newPartId,
      tenantId: currentTenantId,
      branchId,
      questionId: hasQuestion ? data.questionId : '',
      assignedMaqra: hasQuestion ? data.assignedMaqra : 'Belum Ditetapkan',
      pageNumber: hasQuestion ? data.pageNumber : 1,
      assignedQuestions: data.assignedQuestions || [],
      questionIds: data.questionIds || (hasQuestion ? [data.questionId] : []),
      stageHistory: [
        {
          stageId,
          stageName: targetStage,
          status: 'Menunggu'
        }
      ]
    };

    const newParticipation: StageParticipation = {
      id: generateUuid(),
      tenantId: currentTenantId,
      participantId: newPartId,
      stageId,
      stageName: targetStage,
      branchId,
      branchName: data.branchName,
      lotteryNumber: data.lotteryNumber,
      questionId: hasQuestion ? data.questionId : '',
      assignedMaqra: hasQuestion ? data.assignedMaqra : 'Belum Ditetapkan',
      pageNumber: hasQuestion ? data.pageNumber : 1,
      assignedQuestions: data.assignedQuestions || [],
      status: hasQuestion ? 'Belum Dimulai' : 'Maqra Belum Ditetapkan'
    };

    setParticipants((prev) => [...prev, newPart]);
    setStageParticipations((prev) => [...prev, newParticipation]);

    if (isLiveDbActive) {
      setSyncStatus('Menyimpan peserta ke database...');
      const matchedLevel = jenjangList.find((j) => j.name === data.levelName);
      void supabaseDataService
        .upsertParticipantWithStage({
          participant: {
            ...newPart,
            tenantId: toDeterministicUuid(currentTenantId),
            kafilahId: toDeterministicUuid(newPart.kafilahId),
            branchId: toDeterministicUuid(branchId)
          },
          stageParticipation: {
            ...newParticipation,
            tenantId: toDeterministicUuid(currentTenantId),
            stageId: toDeterministicUuid(stageId)
          },
          levelId: matchedLevel?.id ? toDeterministicUuid(matchedLevel.id) : null
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Peserta: ${res.message}`);
            setParticipants((prev) => prev.filter((p) => p.id !== newPartId));
            setStageParticipations((prev) => prev.filter((sp) => sp.id !== newParticipation.id));
          } else {
            setSyncStatus('Peserta Tersimpan di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }

    setKafilahs((prev) =>
      prev.map((k) =>
        k.id === data.kafilahId && k.tenantId === currentTenantId
          ? { ...k, participantCount: k.participantCount + 1 }
          : k
      )
    );

    const newLog: ActivityLogItem = {
      id: generateUniqueLogId('act'),
      tenantId: currentTenantId,
      type: 'config',
      title: 'Pendaftaran Peserta',
      description: `Pendaftaran peserta ${newPart.participantId} (${newPart.name}) pada cabang ${newPart.branchName}.`,
      timestamp: getWibTime(),
      actorName: currentUser.name
    };
    setActivityLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id).slice(0, 20)]);

    return {
      success: true,
      message: `Peserta "${newPart.name}" (${newPart.participantId}) berhasil didaftarkan.`
    };
  };

  const updateParticipant = (id: string, updated: Partial<Participant>) => {
    const existing = participants.find((p) => p.id === id && p.tenantId === currentTenantId);
    if (!existing) return;
    const merged: Participant = { ...existing, ...updated };

    setParticipants((prev) =>
      prev.map((p) => (p.id === id && p.tenantId === currentTenantId ? merged : p))
    );

    // Sync to current stage participation if relevant fields changed
    if (updated.lotteryNumber || updated.branchName || updated.assignedMaqra || updated.pageNumber) {
      setStageParticipations((prev) =>
        prev.map((sp) => {
          if (sp.participantId === id && sp.tenantId === currentTenantId) {
            return {
              ...sp,
              lotteryNumber: updated.lotteryNumber || sp.lotteryNumber,
              branchName: updated.branchName || sp.branchName,
              assignedMaqra: updated.assignedMaqra || sp.assignedMaqra,
              pageNumber: updated.pageNumber || sp.pageNumber
            };
          }
          return sp;
        })
      );
    }

    if (isLiveDbActive) {
      setSyncStatus('Memperbarui peserta di database...');
      const matchedBranch = cabangList.find(
        (c) => c.name === merged.branchName || merged.branchName.includes(c.name)
      );
      const matchedLevel = jenjangList.find((j) => j.name === merged.levelName);
      const effectiveBranchId = merged.branchId || matchedBranch?.id || toDeterministicUuid(merged.branchName);
      void supabaseDataService
        .updateParticipantRecord(
          {
            ...merged,
            id: toDeterministicUuid(merged.id),
            tenantId: toDeterministicUuid(currentTenantId),
            kafilahId: toDeterministicUuid(merged.kafilahId),
            branchId: toDeterministicUuid(effectiveBranchId)
          },
          toDeterministicUuid(effectiveBranchId),
          matchedLevel?.id ? toDeterministicUuid(matchedLevel.id) : undefined
        )
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Peserta: ${res.message}`);
            setParticipants((prev) =>
              prev.map((p) => (p.id === id && p.tenantId === currentTenantId ? existing : p))
            );
          } else {
            setSyncStatus('Data Peserta Diperbarui di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  // Question & Maqra Actions (Tenant Scoped)
  const addQuestion = (data: Omit<Question, 'id' | 'tenantId'>) => {
    const newQ: Question = {
      ...data,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setQuestions((prev) => [...prev, newQ]);
    if (isLiveDbActive) {
      const matchedBranch = cabangList.find(
        (c) => data.branchAndLevel && (data.branchAndLevel.includes(c.name) || c.name.includes(data.branchAndLevel))
      );
      const matchedStage = stages.find(
        (s) => s.tenantId === currentTenantId && s.name === data.stageName
      );
      void supabaseDataService
        .upsertQuestion(
          {
            ...newQ,
            tenantId: toDeterministicUuid(currentTenantId)
          },
          matchedBranch?.id ? toDeterministicUuid(matchedBranch.id) : undefined,
          matchedStage?.id ? toDeterministicUuid(matchedStage.id) : undefined
        )
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Soal: ${res.message}`);
            setQuestions((prev) => prev.filter((q) => q.id !== newQ.id));
          } else {
            setSyncStatus('Soal Maqra Tersimpan di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  const updateQuestion = (id: string, updated: Partial<Question>) => {
    const existing = questions.find((q) => q.id === id && q.tenantId === currentTenantId);
    if (!existing) return;
    const merged: Question = { ...existing, ...updated };
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && q.tenantId === currentTenantId ? merged : q))
    );
    if (isLiveDbActive) {
      const matchedBranch = cabangList.find(
        (c) => merged.branchAndLevel && (merged.branchAndLevel.includes(c.name) || c.name.includes(merged.branchAndLevel))
      );
      const matchedStage = stages.find(
        (s) => s.tenantId === currentTenantId && s.name === merged.stageName
      );
      void supabaseDataService
        .upsertQuestion(
          {
            ...merged,
            id: toDeterministicUuid(merged.id),
            tenantId: toDeterministicUuid(currentTenantId)
          },
          matchedBranch?.id ? toDeterministicUuid(matchedBranch.id) : undefined,
          matchedStage?.id ? toDeterministicUuid(matchedStage.id) : undefined
        )
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Soal: ${res.message}`);
            setQuestions((prev) =>
              prev.map((q) => (q.id === id && q.tenantId === currentTenantId ? existing : q))
            );
          } else {
            setSyncStatus('Soal Maqra Diperbarui di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  const assignMaqraToParticipant = (
    participantId: string,
    questionId: string,
    stageName?: string
  ) => {
    addQuestionToParticipant(participantId, questionId, stageName);
  };

  const addQuestionToParticipant = (
    participantId: string,
    questionId: string,
    stageName?: string
  ): { success: boolean; message: string } => {
    const q = questions.find((item) => item.id === questionId && item.tenantId === currentTenantId);
    if (!q) {
      return { success: false, message: 'Soal tidak ditemukan pada tenant ini.' };
    }
    if (q.status !== 'Aktif') {
      return { success: false, message: `Soal ${q.code} sedang berstatus Nonaktif.` };
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) {
      return { success: false, message: 'Peserta tidak ditemukan pada tenant ini.' };
    }

    const targetStage = stageName || q.stageName || part.stageName || selectedStageName;

    // Validate stage compatibility: question's designated stage must match target stage
    if (q.stageName && targetStage && q.stageName !== targetStage) {
      return {
        success: false,
        message: `Ketidaksesuaian babak: Soal ${q.code} dialokasikan untuk Babak ${q.stageName}, sedangkan target adalah Babak ${targetStage}.`
      };
    }

    // Check if participant already has this question in this stage
    const currentStageQs = getParticipantStageQuestions(participantId, targetStage);
    if (currentStageQs.some((item) => item.questionId === q.id)) {
      return {
        success: false,
        message: `Peserta ${part.name} sudah memiliki soal ${q.code} pada Babak ${targetStage}.`
      };
    }

    const pageLabel = q.pageStart && q.pageEnd && q.pageStart !== q.pageEnd
      ? `Hal. ${q.pageStart} - ${q.pageEnd}`
      : `Hal. ${q.pageNumber}`;
    const assignedLabel = `${q.title} (${pageLabel})`;

    const maqraRecordId = generateUuid();
    const newMaqraItem: AssignedMaqraItem = {
      id: maqraRecordId,
      questionId: q.id,
      code: q.code,
      title: q.title,
      surahName: q.surahName,
      surahNumber: q.surahNumber,
      startAyah: q.startAyah,
      endAyah: q.endAyah,
      pageNumber: q.pageNumber,
      pageStart: q.pageStart || q.pageNumber,
      pageEnd: q.pageEnd || q.pageNumber,
      pageNumbers: q.pageNumbers || [q.pageNumber],
      assignedAt: getWibTime(),
      stageName: targetStage
    };

    const targetStageObj = stages.find(
      (s) => s.tenantId === currentTenantId && s.name === targetStage
    );
    const existingSp = stageParticipations.find(
      (sp) =>
        sp.tenantId === currentTenantId &&
        sp.participantId === participantId &&
        sp.stageName === targetStage
    );
    const resolvedSp: StageParticipation = existingSp
      ? {
          ...existingSp,
          questionId: q.id,
          assignedMaqra:
            ((existingSp.assignedQuestions || []).filter((item) => item.questionId !== '').length + 1) === 1
              ? assignedLabel
              : `${(existingSp.assignedQuestions || []).filter((item) => item.questionId !== '').length + 1} Maqra Ditetapkan`,
          pageNumber: q.pageNumber,
          assignedQuestions: [
            ...(existingSp.assignedQuestions || []).filter((item) => item.questionId !== ''),
            newMaqraItem
          ],
          status: existingSp.status === 'Maqra Belum Ditetapkan' ? 'Belum Dimulai' : existingSp.status
        }
      : {
          id: generateUuid(),
          tenantId: currentTenantId,
          participantId,
          stageId: targetStageObj?.id || toDeterministicUuid('stage-penyisihan'),
          stageName: targetStage,
          branchId: part.branchId,
          branchName: part.branchName,
          lotteryNumber: part.lotteryNumber,
          questionId: q.id,
          assignedMaqra: assignedLabel,
          pageNumber: q.pageNumber,
          assignedQuestions: [newMaqraItem],
          status: 'Belum Dimulai'
        };

    // Update participant
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === participantId && p.tenantId === currentTenantId) {
          const currentList = (p.assignedQuestions || []).filter(
            (item) => item.questionId !== ''
          );
          const updatedList = [...currentList, newMaqraItem];
          const updatedQIds = Array.from(new Set([...(p.questionIds || []), q.id]));

          return {
            ...p,
            questionId: q.id,
            assignedMaqra: updatedList.length === 1 ? assignedLabel : `${updatedList.length} Maqra Ditetapkan`,
            pageNumber: q.pageNumber,
            assignedQuestions: updatedList,
            questionIds: updatedQIds
          };
        }
        return p;
      })
    );

    // Update or create stage participation
    setStageParticipations((prev) => {
      if (existingSp) {
        return prev.map((sp) => (sp.id === existingSp.id ? resolvedSp : sp));
      }
      return [...prev, resolvedSp];
    });

    // Persist assigned_maqra in database and sync returned database row ID
    if (connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      void supabaseDataService
        .assignMaqraRecord({
          id: maqraRecordId,
          tenantId: toDeterministicUuid(currentTenantId),
          stageParticipationId: toDeterministicUuid(resolvedSp.id),
          questionId: toDeterministicUuid(q.id),
          method: 'manual',
          stageParticipation: resolvedSp,
          participant: part
        })
        .then((res) => {
          const dbMaqraId = res.data?.assignedMaqraId;
          if (res.success && dbMaqraId) {
            setStageParticipations((prev) =>
              prev.map((sp) =>
                sp.id === resolvedSp.id
                  ? {
                      ...sp,
                      assignedQuestions: (sp.assignedQuestions || []).map((aq) =>
                        aq.questionId === q.id ? { ...aq, id: dbMaqraId } : aq
                      )
                    }
                  : sp
              )
            );
            setParticipants((prev) =>
              prev.map((p) =>
                p.id === participantId
                  ? {
                      ...p,
                      assignedQuestions: (p.assignedQuestions || []).map((aq) =>
                        aq.questionId === q.id && aq.stageName === targetStage
                          ? { ...aq, id: dbMaqraId }
                          : aq
                      )
                    }
                  : p
              )
            );
          }
        });
    }

    // Update question assignment tag
    setQuestions((prev) =>
      prev.map((item) => {
        if (item.tenantId !== currentTenantId) return item;
        if (item.id === questionId) {
          const existingIds = item.assignedToParticipantIds || (item.assignedToParticipantId ? [item.assignedToParticipantId] : []);
          return {
            ...item,
            assignedToParticipantId: participantId,
            assignedToParticipantIds: Array.from(new Set([...existingIds, participantId]))
          };
        }
        return item;
      })
    );

    const newLog: ActivityLogItem = {
      id: generateUniqueLogId('act'),
      tenantId: currentTenantId,
      type: 'config',
      title: 'Penetapan Maqra',
      description: `Penetapan ${q.title} untuk peserta ${part.participantId} ${part.name} pada Babak ${targetStage}.`,
      timestamp: getWibTime(),
      actorName: currentUser.name
    };
    setActivityLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id).slice(0, 20)]);

    return {
      success: true,
      message: `Soal ${q.code} berhasil ditetapkan untuk peserta ${part.name} pada Babak ${targetStage}.`
    };
  };

  const removeQuestionFromParticipant = (
    participantId: string,
    questionId: string,
    stageName?: string
  ) => {
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return;
    const targetStage = stageName || part.stageName || selectedStageName;
    const targetSp = stageParticipations.find(
      (sp) =>
        sp.tenantId === currentTenantId &&
        sp.participantId === participantId &&
        sp.stageName === targetStage
    );

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === participantId && p.tenantId === currentTenantId) {
          // Only remove question that matches questionId AND stageName (if specified)
          const remaining = (p.assignedQuestions || []).filter(
            (item) => !(item.questionId === questionId && (!item.stageName || item.stageName === targetStage))
          );
          const remainingIds = remaining.map((r) => r.questionId);
          const fallback = remaining[0];
          return {
            ...p,
            questionId: fallback ? fallback.questionId : '',
            assignedMaqra: fallback ? fallback.title : 'Belum Ditetapkan',
            pageNumber: fallback ? fallback.pageNumber : 305,
            assignedQuestions: remaining,
            questionIds: remainingIds
          };
        }
        return p;
      })
    );

    setStageParticipations((prev) =>
      prev.map((sp) => {
        if (sp.tenantId === currentTenantId && sp.participantId === participantId && sp.stageName === targetStage) {
          const remaining = (sp.assignedQuestions || []).filter((item) => item.questionId !== questionId);
          const fallback = remaining[0];
          return {
            ...sp,
            questionId: fallback ? fallback.questionId : '',
            assignedMaqra: fallback ? fallback.title : 'Belum Ditetapkan',
            pageNumber: fallback ? fallback.pageNumber : 305,
            assignedQuestions: remaining,
            status: remaining.length === 0 ? ('Maqra Belum Ditetapkan' as ParticipantProgressStatus) : sp.status
          };
        }
        return sp;
      })
    );

    setQuestions((prev) =>
      prev.map((item) => {
        if (item.tenantId !== currentTenantId) return item;
        if (item.id === questionId) {
          const updatedIds = (item.assignedToParticipantIds || []).filter((pid) => pid !== participantId);
          return {
            ...item,
            assignedToParticipantId: updatedIds[0] || undefined,
            assignedToParticipantIds: updatedIds
          };
        }
        return item;
      })
    );

    if (isLiveDbActive && targetSp) {
      setSyncStatus('Melepas penetapan maqra di database...');
      void supabaseDataService
        .unassignMaqraRecord({
          tenantId: toDeterministicUuid(currentTenantId),
          stageParticipationId: toDeterministicUuid(targetSp.id),
          questionId: toDeterministicUuid(questionId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Melepas Maqra: ${res.message}`);
            void refreshSupabaseConnection();
          } else {
            setSyncStatus('Penetapan Maqra Dilepas di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  const commitLotteryDrawResults = (
    results: {
      participantId: string;
      participantName: string;
      questionIds: string[];
      questionTitles: string[];
    }[],
    stageName: string
  ): { success: boolean; message: string } => {
    if (!results || results.length === 0) {
      return { success: false, message: 'Tidak ada hasil undian untuk ditetapkan.' };
    }

    // 1. Validation across entire batch
    for (const r of results) {
      const part = participants.find((p) => p.id === r.participantId && p.tenantId === currentTenantId);
      if (!part) {
        return {
          success: false,
          message: `Transaksi dibatalkan: Peserta "${r.participantName}" tidak ditemukan di tenant aktif.`
        };
      }
      for (const qId of r.questionIds) {
        const q = questions.find((item) => item.id === qId && item.tenantId === currentTenantId);
        if (!q || q.status !== 'Aktif') {
          return {
            success: false,
            message: `Transaksi dibatalkan: Soal dengan ID "${qId}" tidak tersedia atau nonaktif.`
          };
        }
      }
    }

    const nowTime = getWibTime();
    const targetStageObj = stages.find((s) => s.tenantId === currentTenantId && s.name === stageName);
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    // Map of participantId -> AssignedMaqraItem[] to add
    const itemsByParticipant: Record<string, AssignedMaqraItem[]> = {};
    const questionToParticipantsMap: Record<string, string[]> = {};

    results.forEach((r) => {
      itemsByParticipant[r.participantId] = [];
      r.questionIds.forEach((qId) => {
        const q = questions.find((item) => item.id === qId && item.tenantId === currentTenantId)!;
        const pageLabel = q.pageStart && q.pageEnd && q.pageStart !== q.pageEnd
          ? `Hal. ${q.pageStart} - ${q.pageEnd}`
          : `Hal. ${q.pageNumber}`;
        const newMaqraItem: AssignedMaqraItem = {
          id: generateUuid(),
          questionId: q.id,
          code: q.code,
          title: q.title,
          surahName: q.surahName,
          surahNumber: q.surahNumber,
          startAyah: q.startAyah,
          endAyah: q.endAyah,
          pageNumber: q.pageNumber,
          pageStart: q.pageStart || q.pageNumber,
          pageEnd: q.pageEnd || q.pageNumber,
          pageNumbers: q.pageNumbers || [q.pageNumber],
          assignedAt: nowTime,
          stageName
        };
        itemsByParticipant[r.participantId].push(newMaqraItem);

        if (!questionToParticipantsMap[qId]) {
          questionToParticipantsMap[qId] = [];
        }
        questionToParticipantsMap[qId].push(r.participantId);
      });
    });

    // 2. Atomic Participants Update
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.tenantId === currentTenantId && itemsByParticipant[p.id]) {
          const newItems = itemsByParticipant[p.id];
          const existing = (p.assignedQuestions || []).filter((item) => item.questionId !== '');
          const combined = [...existing];
          newItems.forEach((item) => {
            if (!combined.some((c) => c.questionId === item.questionId)) {
              combined.push(item);
            }
          });
          const combinedQIds = Array.from(new Set([...(p.questionIds || []), ...newItems.map((n) => n.questionId)]));
          const lastItem = combined[combined.length - 1];
          return {
            ...p,
            questionId: lastItem ? lastItem.questionId : '',
            assignedMaqra: combined.length === 1 ? combined[0].title : `${combined.length} Maqra Ditetapkan`,
            pageNumber: lastItem ? lastItem.pageNumber : 1,
            assignedQuestions: combined,
            questionIds: combinedQIds
          };
        }
        return p;
      })
    );

    // 3. Atomic StageParticipations Update
    const resolvedSpByParticipant: Record<string, StageParticipation> = {};
    setStageParticipations((prev) => {
      const updated = prev.map((sp) => {
        if (sp.tenantId === currentTenantId && sp.stageName === stageName && itemsByParticipant[sp.participantId]) {
          const newItems = itemsByParticipant[sp.participantId];
          const existing = (sp.assignedQuestions || []).filter((item) => item.questionId !== '');
          const combined = [...existing];
          newItems.forEach((item) => {
            if (!combined.some((c) => c.questionId === item.questionId)) {
              combined.push(item);
            }
          });
          const lastItem = combined[combined.length - 1];
          const updatedSp: StageParticipation = {
            ...sp,
            questionId: lastItem ? lastItem.questionId : '',
            assignedMaqra: combined.length === 1 ? combined[0].title : `${combined.length} Maqra Ditetapkan`,
            pageNumber: lastItem ? lastItem.pageNumber : 1,
            assignedQuestions: combined,
            status: sp.status === 'Maqra Belum Ditetapkan' ? ('Belum Dimulai' as ParticipantProgressStatus) : sp.status
          };
          resolvedSpByParticipant[sp.participantId] = updatedSp;
          return updatedSp;
        }
        return sp;
      });

      // Ensure any participant without existing SP gets created
      results.forEach((r) => {
        const hasSp = updated.some(
          (sp) => sp.tenantId === currentTenantId && sp.stageName === stageName && sp.participantId === r.participantId
        );
        if (!hasSp) {
          const part = participants.find((p) => p.id === r.participantId && p.tenantId === currentTenantId);
          if (part) {
            const newItems = itemsByParticipant[r.participantId] || [];
            const lastItem = newItems[newItems.length - 1];
            const createdSp: StageParticipation = {
              id: generateUuid(),
              tenantId: currentTenantId,
              participantId: r.participantId,
              stageId,
              stageName,
              branchId: part.branchId,
              branchName: part.branchName,
              lotteryNumber: part.lotteryNumber,
              questionId: lastItem ? lastItem.questionId : '',
              assignedMaqra: newItems.length === 1 ? newItems[0].title : `${newItems.length} Maqra Ditetapkan`,
              pageNumber: lastItem ? lastItem.pageNumber : 1,
              assignedQuestions: newItems,
              status: 'Belum Dimulai'
            };
            resolvedSpByParticipant[r.participantId] = createdSp;
            updated.push(createdSp);
          }
        }
      });

      return updated;
    });

    // Persist assigned_maqras to live database if connected
    if (connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      results.forEach((r) => {
        const part = participants.find((p) => p.id === r.participantId && p.tenantId === currentTenantId);
        const sp =
          resolvedSpByParticipant[r.participantId] ||
          stageParticipations.find(
            (item) =>
              item.tenantId === currentTenantId &&
              item.stageName === stageName &&
              item.participantId === r.participantId
          );
        const newItems = itemsByParticipant[r.participantId] || [];
        if (part && sp) {
          newItems.forEach((maqraItem) => {
            void supabaseDataService
              .assignMaqraRecord({
                id: maqraItem.id || generateUuid(),
                tenantId: toDeterministicUuid(currentTenantId),
                stageParticipationId: toDeterministicUuid(sp.id),
                questionId: toDeterministicUuid(maqraItem.questionId),
                method: 'undian',
                stageParticipation: sp,
                participant: part
              })
              .then((res) => {
                const dbMaqraId = res.data?.assignedMaqraId;
                if (res.success && dbMaqraId) {
                  setStageParticipations((prev) =>
                    prev.map((item) =>
                      item.id === sp.id
                        ? {
                            ...item,
                            assignedQuestions: (item.assignedQuestions || []).map((aq) =>
                              aq.questionId === maqraItem.questionId ? { ...aq, id: dbMaqraId } : aq
                            )
                          }
                        : item
                    )
                  );
                }
              });
          });
        }
      });
    }

    // 4. Atomic Questions Update
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tenantId === currentTenantId && questionToParticipantsMap[q.id]) {
          const newPIds = questionToParticipantsMap[q.id];
          const existingIds = q.assignedToParticipantIds || (q.assignedToParticipantId ? [q.assignedToParticipantId] : []);
          const merged = Array.from(new Set([...existingIds, ...newPIds]));
          return {
            ...q,
            assignedToParticipantId: merged[0] || undefined,
            assignedToParticipantIds: merged
          };
        }
        return q;
      })
    );

    // 5. Single Consolidated Activity Log
    const newLog: ActivityLogItem = {
      id: generateUniqueLogId('act'),
      tenantId: currentTenantId,
      type: 'config',
      title: 'Penetapan Hasil Undian',
      description: `Penetapan hasil undian maqra untuk ${results.length} peserta pada Babak ${stageName} berhasil disimpan secara permanen.`,
      timestamp: nowTime,
      actorName: currentUser.name
    };
    setActivityLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id).slice(0, 20)]);

    return {
      success: true,
      message: `Berhasil menetapkan maqra untuk ${results.length} peserta pada Babak ${stageName}.`
    };
  };

  const conductLotteryDraw = (options: {
    stageName: string;
    branchName?: string;
    participantIds: string[];
    questionsPerParticipant: number;
    predefinedResults?: {
      participantId: string;
      participantName: string;
      questionIds: string[];
      questionTitles: string[];
    }[];
  }) => {
    const { stageName, branchName, participantIds, questionsPerParticipant, predefinedResults } = options;

    // If predefined results are provided, commit them directly without re-randomizing!
    if (predefinedResults && predefinedResults.length > 0) {
      return commitLotteryDrawResults(predefinedResults, stageName);
    }

    const targetParticipants = participants.filter((p) =>
      participantIds.includes(p.id) && p.tenantId === currentTenantId
    );

    if (targetParticipants.length === 0) {
      return {
        success: false,
        message: 'Tidak ada peserta yang dipilih untuk diundi.'
      };
    }

    // Validate per-participant eligibility and ensure sufficient active questions
    for (const part of targetParticipants) {
      const partEligibleQuestions = questions.filter((q) => {
        if (q.tenantId !== currentTenantId || q.status !== 'Aktif') return false;
        const matchesStage = !q.stageName || q.stageName === stageName || stageName === 'Semua Babak';
        const matchesBranch = !branchName || branchName === 'Semua Cabang'
          ? (!q.branchAndLevel || q.branchAndLevel.includes(part.branchName) || part.branchName.includes(q.branchAndLevel))
          : q.branchAndLevel.includes(branchName);
        return matchesStage && matchesBranch;
      });

      if (partEligibleQuestions.length < questionsPerParticipant) {
        return {
          success: false,
          message: `Soal aktif tidak mencukupi untuk peserta ${part.name} (${part.branchName}). Dibutuhkan ${questionsPerParticipant} soal unik, namun hanya tersedia ${partEligibleQuestions.length} soal aktif.`
        };
      }
    }

    const results: {
      participantId: string;
      participantName: string;
      questionIds: string[];
      questionTitles: string[];
    }[] = [];

    // Track assigned questions in this batch to prevent duplicates across participants if possible
    const batchUsedQuestionIds = new Set<string>();

    for (const part of targetParticipants) {
      const partEligibleQuestions = questions.filter((q) => {
        if (q.tenantId !== currentTenantId || q.status !== 'Aktif') return false;
        const matchesStage = !q.stageName || q.stageName === stageName || stageName === 'Semua Babak';
        const matchesBranch = !branchName || branchName === 'Semua Cabang'
          ? (!q.branchAndLevel || q.branchAndLevel.includes(part.branchName) || part.branchName.includes(q.branchAndLevel))
          : q.branchAndLevel.includes(branchName);
        return matchesStage && matchesBranch;
      });

      // Filter questions not yet picked for this participant
      const existingPartQIds = new Set(
        (part.assignedQuestions || [])
          .filter((aq) => !aq.stageName || aq.stageName === stageName)
          .map((aq) => aq.questionId)
      );

      // Prioritize questions not yet used in this batch
      let candidatePool = partEligibleQuestions.filter((q) => !existingPartQIds.has(q.id));
      if (candidatePool.length < questionsPerParticipant) {
        candidatePool = partEligibleQuestions;
      }

      const unusedInBatch = candidatePool.filter((q) => !batchUsedQuestionIds.has(q.id));
      const pool = unusedInBatch.length >= questionsPerParticipant ? unusedInBatch : candidatePool;

      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, questionsPerParticipant);

      picked.forEach((q) => batchUsedQuestionIds.add(q.id));

      const pickedIds = picked.map((q) => q.id);
      const pickedTitles = picked.map((q) => q.title);

      results.push({
        participantId: part.id,
        participantName: part.name,
        questionIds: pickedIds,
        questionTitles: pickedTitles
      });

      picked.forEach((q) => {
        addQuestionToParticipant(part.id, q.id, stageName);
      });
    }

    return {
      success: true,
      message: `Berhasil mengundi maqra untuk ${results.length} peserta secara acak.`,
      results
    };
  };

  // Jenjang & Cabang Actions (Tenant Scoped)
  const addJenjang = (item: Omit<GenericMasterItem, 'id' | 'tenantId'>) => {
    const newItem: GenericMasterItem = {
      ...item,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setJenjangList((prev) => [...prev, newItem]);
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertLevel(toDeterministicUuid(currentTenantId), {
          ...newItem,
          id: toDeterministicUuid(newItem.id)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Jenjang: ${res.message}`);
            setJenjangList((prev) => prev.filter((j) => j.id !== newItem.id));
          } else {
            setSyncStatus('Jenjang Tersimpan di Database');
          }
        });
    }
  };

  const updateJenjang = (id: string, updated: Partial<GenericMasterItem>) => {
    const existing = jenjangList.find((j) => j.id === id);
    if (!existing) return;
    const merged: GenericMasterItem = { ...existing, ...updated };
    setJenjangList((prev) =>
      prev.map((j) => (j.id === id ? merged : j))
    );
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertLevel(toDeterministicUuid(currentTenantId), {
          ...merged,
          id: toDeterministicUuid(merged.id)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Jenjang: ${res.message}`);
            setJenjangList((prev) => prev.map((j) => (j.id === id ? existing : j)));
          } else {
            setSyncStatus('Jenjang Diperbarui di Database');
          }
        });
    }
  };

  const deleteJenjang = (id: string): { success: boolean; message: string; activeCount?: number } => {
    const item = jenjangList.find((j) => j.id === id);
    if (!item) return { success: false, message: 'Jenjang tidak ditemukan.' };

    const usedByParticipants = participants.filter((p) =>
      p.tenantId === currentTenantId && (p.levelName === item.name || item.name.includes(p.levelName) || p.levelName.includes(item.code))
    ).length;

    const usedByQuestions = questions.filter((q) =>
      q.tenantId === currentTenantId && (q.branchAndLevel.includes(item.name) || q.branchAndLevel.includes(item.code))
    ).length;

    const totalActiveRefs = usedByParticipants + usedByQuestions;

    if (totalActiveRefs > 0) {
      return {
        success: false,
        activeCount: totalActiveRefs,
        message: `Jenjang "${item.name}" masih digunakan oleh ${usedByParticipants} peserta dan ${usedByQuestions} soal. Penghapusan langsung dicegah untuk melindungi integritas referensi data.`
      };
    }

    setJenjangList((prev) => prev.filter((j) => j.id !== id));
    if (isLiveDbActive) {
      void supabaseDataService
        .deleteLevel(toDeterministicUuid(currentTenantId), toDeterministicUuid(id))
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menghapus Jenjang: ${res.message}`);
            setJenjangList((prev) => [...prev, item]);
          } else {
            setSyncStatus('Jenjang Dihapus dari Database');
          }
        });
    }
    return { success: true, message: `Jenjang "${item.name}" berhasil dihapus.` };
  };

  const addCabang = (item: Omit<GenericMasterItem, 'id' | 'tenantId'>) => {
    const newItem: GenericMasterItem = {
      ...item,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setCabangList((prev) => [...prev, newItem]);
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertBranch(toDeterministicUuid(currentTenantId), {
          ...newItem,
          id: toDeterministicUuid(newItem.id)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Cabang: ${res.message}`);
            setCabangList((prev) => prev.filter((c) => c.id !== newItem.id));
          } else {
            setSyncStatus('Cabang Lomba Tersimpan di Database');
          }
        });
    }
  };

  const updateCabang = (id: string, updated: Partial<GenericMasterItem>) => {
    const existing = cabangList.find((c) => c.id === id);
    if (!existing) return;
    const merged: GenericMasterItem = { ...existing, ...updated };
    setCabangList((prev) =>
      prev.map((c) => (c.id === id ? merged : c))
    );
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertBranch(toDeterministicUuid(currentTenantId), {
          ...merged,
          id: toDeterministicUuid(merged.id)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Cabang: ${res.message}`);
            setCabangList((prev) => prev.map((c) => (c.id === id ? existing : c)));
          } else {
            setSyncStatus('Cabang Lomba Diperbarui di Database');
          }
        });
    }
  };

  const deleteCabang = (id: string): { success: boolean; message: string; activeCount?: number } => {
    const item = cabangList.find((c) => c.id === id);
    if (!item) return { success: false, message: 'Cabang tidak ditemukan.' };

    const usedByParticipants = participants.filter((p) =>
      p.tenantId === currentTenantId && (p.branchName === item.name || item.name.includes(p.branchName))
    ).length;

    const usedByStages = stages.filter((s) =>
      s.tenantId === currentTenantId && (s.branchName === item.name || item.name.includes(s.branchName))
    ).length;

    const usedByQuestions = questions.filter((q) =>
      q.tenantId === currentTenantId && (q.branchAndLevel.includes(item.name) || q.branchAndLevel.includes(item.code))
    ).length;

    const totalActiveRefs = usedByParticipants + usedByStages + usedByQuestions;

    if (totalActiveRefs > 0) {
      return {
        success: false,
        activeCount: totalActiveRefs,
        message: `Cabang "${item.name}" masih digunakan oleh ${usedByParticipants} peserta, ${usedByStages} babak, dan ${usedByQuestions} soal. Penghapusan langsung dicegah untuk melindungi integritas referensi data.`
      };
    }

    setCabangList((prev) => prev.filter((c) => c.id !== id));
    if (isLiveDbActive) {
      void supabaseDataService
        .deleteBranch(toDeterministicUuid(currentTenantId), toDeterministicUuid(id))
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menghapus Cabang: ${res.message}`);
            setCabangList((prev) => [...prev, item]);
          } else {
            setSyncStatus('Cabang Lomba Dihapus dari Database');
          }
        });
    }
    return { success: true, message: `Cabang "${item.name}" berhasil dihapus.` };
  };

  // Error Category Actions
  const updateCategoryDeduction = (categoryId: string, deduction: number) => {
    const existing = errorCategories.find((c) => c.id === categoryId && c.tenantId === currentTenantId);
    if (!existing) return;
    const merged: ErrorCategory = { ...existing, defaultDeduction: deduction };
    setErrorCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId && c.tenantId === currentTenantId ? merged : c
      )
    );
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertErrorCategory({
          ...merged,
          id: toDeterministicUuid(merged.id),
          tenantId: toDeterministicUuid(currentTenantId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Potongan Nilai: ${res.message}`);
            setErrorCategories((prev) =>
              prev.map((c) => (c.id === categoryId && c.tenantId === currentTenantId ? existing : c))
            );
          }
        });
    }
  };

  const addErrorCategory = (cat: Omit<ErrorCategory, 'id' | 'tenantId'>) => {
    const newCat: ErrorCategory = {
      ...cat,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setErrorCategories((prev) => [...prev, newCat]);
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertErrorCategory({
          ...newCat,
          id: toDeterministicUuid(newCat.id),
          tenantId: toDeterministicUuid(currentTenantId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Kategori Kesalahan: ${res.message}`);
            setErrorCategories((prev) => prev.filter((c) => c.id !== newCat.id));
          } else {
            setSyncStatus('Kategori Kesalahan Tersimpan di Database');
          }
        });
    }
  };

  const updateErrorCategory = (id: string, updated: Partial<ErrorCategory>) => {
    const existing = errorCategories.find((c) => c.id === id && c.tenantId === currentTenantId);
    if (!existing) return;
    const merged: ErrorCategory = { ...existing, ...updated };
    setErrorCategories((prev) =>
      prev.map((c) =>
        c.id === id && c.tenantId === currentTenantId ? merged : c
      )
    );
    if (isLiveDbActive) {
      void supabaseDataService
        .upsertErrorCategory({
          ...merged,
          id: toDeterministicUuid(merged.id),
          tenantId: toDeterministicUuid(currentTenantId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Kategori Kesalahan: ${res.message}`);
            setErrorCategories((prev) =>
              prev.map((c) => (c.id === id && c.tenantId === currentTenantId ? existing : c))
            );
          } else {
            setSyncStatus('Kategori Kesalahan Diperbarui di Database');
          }
        });
    }
  };

  // User & Judge Management
  const addUser = async (
    userData: Omit<User, 'id'> & { initialPassword?: string }
  ): Promise<{ success: boolean; message: string }> => {
    const { initialPassword, ...cleanUserData } = userData;
    const newUser: User = {
      ...cleanUserData,
      id: generateUuid(),
      provisioningStatus: isLiveDbActive ? 'Mengundang...' : 'Aktif'
    };
    setUsers((prev) => [...prev, newUser]);

    if (isLiveDbActive) {
      const rawTargetTenant =
        newUser.tenantId && newUser.tenantId !== 'platform' && newUser.tenantId !== 'unassigned'
          ? newUser.tenantId
          : isValidUuid(currentTenantId)
          ? currentTenantId
          : tenants[0]?.id || 'platform';
      const targetTenantUuid =
        rawTargetTenant === 'platform' ? 'platform' : toDeterministicUuid(rawTargetTenant);

      setSyncStatus(
        initialPassword
          ? 'Mendaftarkan akun Auth dengan kata sandi & memetakan profil di Supabase...'
          : 'Memetakan profil & mengundang pengguna di Supabase...'
      );
      const res = await supabaseDataService.upsertUserAndMembership({
        tenantId: targetTenantUuid,
        user: newUser,
        initialPassword
      });

      if (!res.success) {
        setSyncStatus(`Perlu Tindakan Admin: ${res.message}`);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === newUser.id
              ? {
                  ...u,
                  id: res.data?.profileId || u.id,
                  provisioningStatus: 'Gagal / Perlu Tindakan Admin',
                  provisioningMessage: res.message
                }
              : u
          )
        );
        return { success: false, message: res.message };
      }

      setSyncStatus(res.message || 'Keanggotaan Pengguna Tersimpan di Database');
      setLastSyncTime(getWibTime());
      setUsers((prev) =>
        prev.map((u) =>
          u.id === newUser.id
            ? {
                ...u,
                id: res.data?.profileId || u.id,
                provisioningStatus: res.data?.provisioningStatus || 'Aktif',
                provisioningMessage: res.message
              }
            : u
        )
      );
      return { success: true, message: res.message };
    }

    return {
      success: true,
      message: 'Pengguna berhasil ditambahkan pada mode simulasi lokal.'
    };
  };

  const updateUser = async (
    id: string,
    updated: Partial<User>
  ): Promise<{ success: boolean; message: string }> => {
    const existing = users.find((u) => u.id === id);
    if (!existing) {
      return { success: false, message: 'Pengguna tidak ditemukan.' };
    }
    const merged: User = {
      ...existing,
      ...updated,
      provisioningStatus: isLiveDbActive ? 'Mengundang...' : existing.provisioningStatus || 'Aktif'
    };
    setUsers((prev) => prev.map((u) => (u.id === id ? merged : u)));

    if (isLiveDbActive) {
      const targetTenantUuid = toDeterministicUuid(
        merged.tenantId && merged.tenantId !== 'platform' ? merged.tenantId : currentTenantId
      );
      setSyncStatus('Memperbarui keanggotaan pengguna di database...');
      const res = await supabaseDataService.upsertUserAndMembership({
        tenantId: targetTenantUuid,
        user: merged
      });

      if (!res.success) {
        setSyncStatus(`Gagal Memperbarui Pengguna: ${res.message}`);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id
              ? {
                  ...merged,
                  provisioningStatus: 'Gagal / Perlu Tindakan Admin',
                  provisioningMessage: res.message
                }
              : u
          )
        );
        return { success: false, message: res.message };
      }

      setSyncStatus('Profil & Keanggotaan Diperbarui di Database');
      setLastSyncTime(getWibTime());
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...merged,
                id: res.data?.profileId || merged.id,
                provisioningStatus: res.data?.provisioningStatus || 'Aktif',
                provisioningMessage: res.message
              }
            : u
        )
      );
      return { success: true, message: res.message };
    }

    return { success: true, message: 'Data pengguna diperbarui di mode simulasi lokal.' };
  };

  const retryUserProvisioning = async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    const existing = users.find((u) => u.id === id);
    if (!existing) {
      return { success: false, message: 'Pengguna tidak ditemukan.' };
    }
    return updateUser(id, { status: existing.status });
  };

  const toggleUserStatus = async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    const existing = users.find((u) => u.id === id);
    if (!existing) {
      return { success: false, message: 'Pengguna tidak ditemukan.' };
    }
    if (
      existing.status === 'Aktif' &&
      (currentUser.id === id || (authenticatedProfile && authenticatedProfile.authUserId === id))
    ) {
      return {
        success: false,
        message: 'Anda tidak dapat menonaktifkan akun yang sedang Anda gunakan sendiri.'
      };
    }
    const nextStatus = existing.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    const merged: User = { ...existing, status: nextStatus };

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? merged : u))
    );

    if (isLiveDbActive) {
      const targetTenantUuid = toDeterministicUuid(
        existing.tenantId && existing.tenantId !== 'platform' ? existing.tenantId : currentTenantId
      );
      setSyncStatus('Memperbarui status akun di database...');
      const res = await supabaseDataService.upsertUserAndMembership({
        tenantId: targetTenantUuid,
        user: merged
      });
      if (!res.success) {
        setSyncStatus(`Gagal Mengubah Status Akun: ${res.message}`);
        setUsers((prev) => prev.map((u) => (u.id === id ? existing : u)));
        return { success: false, message: res.message };
      }
      setSyncStatus(`Status Akun (${nextStatus}) Tersimpan di Database`);
      return { success: true, message: `Status akun "${existing.name}" berhasil diubah menjadi ${nextStatus}.` };
    }

    return { success: true, message: `Status akun "${existing.name}" berhasil diubah menjadi ${nextStatus}.` };
  };

  const deleteUser = async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    const existing = users.find((u) => u.id === id);
    if (!existing) {
      return { success: false, message: 'Pengguna tidak ditemukan.' };
    }

    // Protection: Cannot delete self
    if (currentUser.id === id || (authenticatedProfile && authenticatedProfile.authUserId === id)) {
      return {
        success: false,
        message: 'Anda tidak dapat menghapus akun yang sedang Anda gunakan saat ini.'
      };
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));

    if (isLiveDbActive) {
      setSyncStatus('Menghapus akun pengguna dari database...');
      const res = await supabaseDataService.deleteUser(id);
      if (!res.success) {
        setSyncStatus(`Gagal Menghapus Pengguna: ${res.message}`);
        setUsers((prev) => [...prev, existing]);
        return { success: false, message: res.message };
      }
      setSyncStatus('Akun Pengguna Berhasil Dihapus');
      return { success: true, message: `Akun "${existing.name}" berhasil dihapus dari platform.` };
    }

    return { success: true, message: `Akun "${existing.name}" berhasil dihapus.` };
  };

  // Tenant Actions (Superadmin)
  const addTenant = (tenantData: Omit<Tenant, 'id'>) => {
    const newTenant: Tenant = {
      ...tenantData,
      id: generateUuid()
    };
    setTenants((prev) => [...prev, newTenant]);
    if (isLiveDbActive) {
      setSyncStatus('Menyimpan tenant baru ke database...');
      void supabaseDataService.upsertTenant(newTenant).then((res) => {
        if (!res.success) {
          setSyncStatus(`Gagal Menyimpan Tenant: ${res.message}`);
          setTenants((prev) => prev.filter((t) => t.id !== newTenant.id));
        } else {
          setSyncStatus('Tenant Baru Tersimpan di Database');
        }
      });
    }
  };

  const updateTenant = (id: string, updated: Partial<Tenant>) => {
    const existing = tenants.find((t) => t.id === id);
    if (!existing) return;
    const merged: Tenant = { ...existing, ...updated };
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? merged : t))
    );
    if (isLiveDbActive) {
      setSyncStatus('Memperbarui tenant di database...');
      void supabaseDataService
        .upsertTenant({
          ...merged,
          id: toDeterministicUuid(merged.id)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Tenant: ${res.message}`);
            setTenants((prev) => prev.map((t) => (t.id === id ? existing : t)));
          } else {
            setSyncStatus('Tenant Diperbarui di Database');
          }
        });
    }
  };

  const toggleTenantStatus = async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    const existing = tenants.find((t) => t.id === id);
    if (!existing) {
      return { success: false, message: 'Penyelenggara MTQ tidak ditemukan.' };
    }
    const nextStatus: 'Aktif' | 'Nonaktif' = existing.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    const merged: Tenant = { ...existing, status: nextStatus };

    setTenants((prev) => prev.map((t) => (t.id === id ? merged : t)));

    if (isLiveDbActive) {
      setSyncStatus(`Memperbarui status MTQ (${nextStatus}) di database...`);
      const res = await supabaseDataService.upsertTenant({
        ...merged,
        id: toDeterministicUuid(merged.id)
      });
      if (!res.success) {
        setSyncStatus(`Gagal Mengubah Status MTQ: ${res.message}`);
        setTenants((prev) => prev.map((t) => (t.id === id ? existing : t)));
        return { success: false, message: res.message };
      }
      setSyncStatus(`Status MTQ (${nextStatus}) Tersimpan di Database`);
      return { success: true, message: `Status penyelenggara "${existing.name}" berhasil diubah menjadi ${nextStatus}.` };
    }

    return { success: true, message: `Status penyelenggara "${existing.name}" berhasil diubah menjadi ${nextStatus}.` };
  };

  const deleteTenant = async (
    id: string
  ): Promise<{ success: boolean; message: string }> => {
    const existing = tenants.find((t) => t.id === id);
    if (!existing) {
      return { success: false, message: 'Penyelenggara MTQ tidak ditemukan.' };
    }

    // Protection: Cannot delete system/platform tenant
    if (existing.id === 'platform' || existing.id === '00000000-0000-0000-0000-000000000000') {
      return { success: false, message: 'Penyelenggara MTQ platform/sistem utama tidak boleh dihapus.' };
    }

    if (currentTenantId === id) {
      setCurrentTenantId('platform');
      setCurrentView('superadmin_tenants');
    }

    setTenants((prev) => prev.filter((t) => t.id !== id));

    if (isLiveDbActive) {
      setSyncStatus('Menghapus penyelenggara MTQ dari database...');
      const res = await supabaseDataService.deleteTenant(toDeterministicUuid(id));
      if (!res.success) {
        setSyncStatus(`Gagal Menghapus MTQ: ${res.message}`);
        setTenants((prev) => [...prev, existing]);
        return { success: false, message: res.message };
      }
      setSyncStatus('Penyelenggara MTQ Berhasil Dihapus');
      return { success: true, message: `Penyelenggara MTQ "${existing.name}" berhasil dihapus dari sistem.` };
    }

    return { success: true, message: `Penyelenggara MTQ "${existing.name}" berhasil dihapus.` };
  };

  // Stage Management (Tenant Scoped)
  const addStage = (stageData: Omit<CompetitionStage, 'id' | 'tenantId'>) => {
    const matchedBranch = cabangList.find(
      (c) => stageData.branchName && (c.name === stageData.branchName || stageData.branchName.includes(c.name))
    );
    const newStage: CompetitionStage = {
      ...stageData,
      id: generateUuid(),
      tenantId: currentTenantId,
      branchId: stageData.branchId || matchedBranch?.id
    };
    setStages((prev) => [...prev, newStage]);
    if (isLiveDbActive) {
      setSyncStatus('Menyimpan babak baru ke database...');
      void supabaseDataService
        .upsertStage({
          ...newStage,
          id: toDeterministicUuid(newStage.id),
          tenantId: toDeterministicUuid(currentTenantId),
          branchId: newStage.branchId ? toDeterministicUuid(newStage.branchId) : undefined
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Babak: ${res.message}`);
            setStages((prev) => prev.filter((s) => s.id !== newStage.id));
          } else {
            setSyncStatus('Babak Tersimpan di Database');
          }
        });
    }
  };

  const updateStage = (id: string, updated: Partial<CompetitionStage>) => {
    const existing = stages.find((s) => s.id === id && s.tenantId === currentTenantId);
    if (!existing) return;
    // Jangan izinkan perubahan status ke Selesai / isFinalized melalui updateStage biasa
    if (existing.isFinalized) {
      setSyncStatus('Babak yang sudah disahkan bersifat terkunci dan tidak dapat diubah.');
      return;
    }
    const safeUpdated: Partial<CompetitionStage> = {
      ...updated,
      isFinalized: existing.isFinalized,
      status: updated.status === 'Selesai' ? existing.status : updated.status || existing.status
    };
    const merged: CompetitionStage = { ...existing, ...safeUpdated };

    setStages((prev) =>
      prev.map((s) =>
        s.id === id && s.tenantId === currentTenantId ? merged : s
      )
    );
    if (isLiveDbActive) {
      setSyncStatus('Memperbarui konfigurasi babak di database...');
      void supabaseDataService
        .upsertStage({
          ...merged,
          id: toDeterministicUuid(merged.id),
          tenantId: toDeterministicUuid(currentTenantId),
          branchId: merged.branchId ? toDeterministicUuid(merged.branchId) : undefined
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Memperbarui Babak: ${res.message}`);
            setStages((prev) =>
              prev.map((s) => (s.id === id && s.tenantId === currentTenantId ? existing : s))
            );
          } else {
            setSyncStatus('Konfigurasi Babak Diperbarui di Database');
          }
        });
    }
  };

  const deleteStage = (id: string): { success: boolean; message: string } => {
    const existing = stages.find((s) => s.id === id && s.tenantId === currentTenantId);
    if (!existing) {
      return { success: false, message: 'Babak musabaqah tidak ditemukan.' };
    }
    if (existing.isFinalized || existing.status === 'Selesai') {
      return {
        success: false,
        message: `Babak "${existing.name}" sudah disahkan/selesai dan tidak dapat dihapus demi menjaga integritas riwayat nilai.`
      };
    }

    const usedInFinalizedAssessments = assessments.some(
      (a) =>
        a.tenantId === currentTenantId &&
        a.status === 'finalized' &&
        (a.stageId === id || (a.stageName === existing.name && (!existing.branchName || true)))
    );
    if (usedInFinalizedAssessments) {
      return {
        success: false,
        message: `Babak "${existing.name}" memiliki lembar penilaian yang sudah difinalisasi dan tidak dapat dihapus.`
      };
    }

    setStages((prev) => prev.filter((s) => !(s.id === id && s.tenantId === currentTenantId)));

    if (isLiveDbActive) {
      setSyncStatus('Menghapus babak musabaqah dari database...');
      void supabaseDataService
        .deleteStage(toDeterministicUuid(currentTenantId), toDeterministicUuid(id))
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menghapus Babak: ${res.message}`);
            setStages((prev) => [...prev, existing]);
          } else {
            setSyncStatus('Babak Musabaqah Dihapus dari Database');
          }
        });
    }

    return {
      success: true,
      message: `Babak "${existing.name}" (${existing.branchName || 'Semua Cabang'}) berhasil dihapus.`
    };
  };

  /**
   * P0: advanceQualifiers() with strict validation:
   * - Verifies all required assessments are complete and finalized
   * - Prevents duplicate stage participation
   * - Scoped strictly to currentTenantId
   * - Documents tie-break override reasons
   * - Supports final stage championship finalization (when nextStageName is empty)
   * - Records complete historical snapshots (score, rank, finalizedAt)
   */
  const advanceQualifiers = async (
    currentStageNameOrParams:
      | string
      | {
          currentStageId?: string;
          currentStageName: string;
          nextStageId?: string;
          nextStageName?: string;
          branchId?: string;
          branchName?: string;
          qualifiedParticipantIds: string[];
          overrideReasons?: Record<string, string>;
          manualOverrides?: Record<string, boolean>;
        },
    nextStageNameArg?: string,
    qualifiedParticipantIdsArg?: string[],
    overrideReasonsArg?: Record<string, string>
  ): Promise<{ success: boolean; message: string }> => {
    let currentStageName: string;
    let nextStageName: string = '';
    let qualifiedParticipantIds: string[] = [];
    let overrideReasons: Record<string, string> | undefined = undefined;
    let manualOverridesParam: Record<string, boolean> | undefined = undefined;
    let branchIdParam: string | undefined = undefined;
    let branchNameParam: string | undefined = undefined;
    let stageIdParam: string | undefined = undefined;

    let nextStageIdParam: string | undefined = undefined;

    if (typeof currentStageNameOrParams === 'object' && currentStageNameOrParams !== null) {
      currentStageName = currentStageNameOrParams.currentStageName;
      nextStageName = currentStageNameOrParams.nextStageName || '';
      nextStageIdParam = currentStageNameOrParams.nextStageId;
      qualifiedParticipantIds = currentStageNameOrParams.qualifiedParticipantIds || [];
      overrideReasons = currentStageNameOrParams.overrideReasons;
      manualOverridesParam = currentStageNameOrParams.manualOverrides;
      branchIdParam = currentStageNameOrParams.branchId;
      branchNameParam = currentStageNameOrParams.branchName;
      stageIdParam = currentStageNameOrParams.currentStageId;
    } else {
      currentStageName = currentStageNameOrParams;
      nextStageName = nextStageNameArg || '';
      qualifiedParticipantIds = qualifiedParticipantIdsArg || [];
      overrideReasons = overrideReasonsArg;
    }

    // 1. Role check: Only admin/superadmin can finalize stage and advance qualifiers
    if (currentUser.role === 'judge') {
      return {
        success: false,
        message: 'Otorisasi ditolak: Hanya Administrator yang berwenang mengesahkan hasil babak dan meloloskan peserta.'
      };
    }

    // 2. Strict ID-first resolution for currentStg (NO OR-widening when stageIdParam is provided!)
    const currentStg = stages.find((s) => {
      if (s.tenantId !== currentTenantId) return false;
      if (stageIdParam) {
        return s.id === stageIdParam;
      }
      if (s.name !== currentStageName) return false;
      if (branchIdParam && s.branchId) return s.branchId === branchIdParam;
      if (branchNameParam && s.branchName) return s.branchName === branchNameParam;
      return true;
    });

    if (!currentStg) {
      return {
        success: false,
        message: `Babak "${currentStageName}" tidak ditemukan pada tenant ini.`
      };
    }
    if (currentStg.isFinalized) {
      return {
        success: false,
        message: `Babak "${currentStageName}" sudah pernah difinalisasi sebelumnya.`
      };
    }

    const effectiveBranchId = branchIdParam || currentStg.branchId;
    const effectiveBranchName = branchNameParam || currentStg.branchName;

    const isFinalChampionship =
      (!nextStageName || nextStageName.trim() === '') && !nextStageIdParam;

    const nextStg = isFinalChampionship
      ? null
      : stages.find((s) => {
          if (s.tenantId !== currentTenantId) return false;
          if (nextStageIdParam) return s.id === nextStageIdParam;
          if (s.name !== nextStageName) return false;
          if (effectiveBranchId && s.branchId) return s.branchId === effectiveBranchId;
          if (effectiveBranchName && s.branchName) return s.branchName === effectiveBranchName;
          return true;
        });

    if (!isFinalChampionship && !nextStg) {
      return {
        success: false,
        message: `Babak lanjutan "${nextStageName}" tidak ditemukan pada cabang/tenant ini.`
      };
    }

    if (
      nextStg &&
      effectiveBranchId &&
      nextStg.branchId &&
      nextStg.branchId !== effectiveBranchId
    ) {
      return {
        success: false,
        message: `Ketidaksesuaian cabang: Babak lanjutan "${nextStg.name}" berada pada cabang lomba berbeda.`
      };
    }

    // 3. Find participations for currentStg strictly by stageId (when present) and branch
    const stageParts = stageParticipations.filter((sp) => {
      if (sp.tenantId !== currentTenantId) return false;
      const matchesStage =
        currentStg.id && sp.stageId
          ? sp.stageId === currentStg.id
          : sp.stageName === currentStageName;
      if (!matchesStage) return false;
      if (effectiveBranchId && sp.branchId) return sp.branchId === effectiveBranchId;
      if (effectiveBranchName && sp.branchName) return sp.branchName === effectiveBranchName;
      return true;
    });

    if (stageParts.length === 0) {
      return {
        success: false,
        message: `Tidak ada peserta aktif di Babak ${currentStageName}.`
      };
    }

    // 4. Validate that every participant in qualifiedParticipantIds belongs to this stage & branch
    const stageParticipantIdSet = new Set(stageParts.map((sp) => sp.participantId));
    for (const qPid of qualifiedParticipantIds) {
      if (!stageParticipantIdSet.has(qPid)) {
        return {
          success: false,
          message: `Finalisasi ditolak: Peserta dengan ID "${qPid}" tidak terdaftar pada Babak ${currentStageName} di cabang ini.`
        };
      }
    }

    // 5. Construct manualOverridesMap accurately across all participants in this stage
    const manualOverridesMap: Record<string, boolean> = manualOverridesParam
      ? { ...manualOverridesParam }
      : qualifiedParticipantIds.length > 0
      ? stageParts.reduce<Record<string, boolean>>((acc, sp) => {
          acc[sp.participantId] = qualifiedParticipantIds.includes(sp.participantId);
          return acc;
        }, {})
      : {};

    // 6. Evaluate stage participants via centralized RankingService (checks judgeAssignments, assessments, tie-break config, quota, overrides)
    const evalResult = RankingService.evaluateStageParticipants({
      tenantId: currentTenantId,
      stageId: currentStg.id,
      stageName: currentStageName,
      branchId: effectiveBranchId,
      branchName: effectiveBranchName,
      participations: stageParts,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter: getParticipantStageQuestions,
      quota: currentStg.qualificationQuota,
      manualOverrides: manualOverridesMap,
      overrideReasons,
      customRuleConfigs: competitionRules
    });

    if (!evalResult.canFinalize) {
      return {
        success: false,
        message: `Finalisasi Babak Ditolak: ${evalResult.blockingReason || 'Terdapat kondisi kompetisi yang belum memenuhi syarat pengesahan.'}`
      };
    }

    const finalQualifiedIds = evalResult.evaluatedParticipants
      .filter((item) => item.isQualified)
      .map((item) => item.participant.id);

    if (!isFinalChampionship) {
      const alreadyAdvanced = stageParticipations.some(
        (sp) =>
          sp.tenantId === currentTenantId &&
          (nextStg?.id && sp.stageId ? sp.stageId === nextStg.id : sp.stageName === nextStageName) &&
          finalQualifiedIds.includes(sp.participantId)
      );
      if (alreadyAdvanced) {
        return {
          success: false,
          message: `Sebagian peserta yang dipilih sudah terdaftar di Babak ${nextStageName}.`
        };
      }
    }

    const scoreMap: Record<string, { score: number; rank: number; tieBreakResolvedBy?: string; isQualified: boolean }> = {};
    evalResult.evaluatedParticipants.forEach((item) => {
      scoreMap[item.participant.id] = {
        score: item.displayScore || 0,
        rank: item.rank,
        tieBreakResolvedBy: item.tieBreakResolvedBy,
        isQualified: item.isQualified
      };
    });

    // Buat objek snapshot hasil babak (disimpan ke state HANYA setelah transaksi RPC berhasil)
    const stageSnapshot = RankingService.createStageResultSnapshot({
      tenantId: currentTenantId,
      stageId: currentStg.id,
      stageName: currentStageName,
      branchId: effectiveBranchId,
      branchName: effectiveBranchName || 'Cabang Terpadu',
      quota: currentStg.qualificationQuota,
      finalizedBy: `${currentUser.name} (${currentUser.role})`,
      evaluatedParticipants: evalResult.evaluatedParticipants,
      customRuleConfigs: competitionRules
    });

    // 7. Execute Server RPC Transaction FIRST (including final championship where nextStageId = null!)
    if (supabaseDataService.isLive() && connectionInfo.isDatabaseReady && connectionInfo.isAuthenticated) {
      setSyncStatus('Mengesahkan hasil babak di server...');
      const rpcRankingsSnapshot = stageSnapshot.rankings.map((entry) => ({
        ...entry,
        participant_id: toDeterministicUuid(entry.participantId),
        final_score: entry.totalScore,
        rank: entry.rank
      }));

      const rpcRes = await supabaseDataService.advanceStageQualifiersRpc({
        stageId: toDeterministicUuid(currentStg.id),
        nextStageId: isFinalChampionship ? null : nextStg ? toDeterministicUuid(nextStg.id) : null,
        qualifiedParticipantIds: finalQualifiedIds.map((id) => toDeterministicUuid(id)),
        overrideReasons: Object.fromEntries(
          Object.entries(overrideReasons || {}).map(([k, v]) => [toDeterministicUuid(k), v])
        ),
        rankingsSnapshot: rpcRankingsSnapshot
      });

      if (!rpcRes.success) {
        setSyncStatus('Gagal Mengesahkan Babak di Database');
        return {
          success: false,
          message: `Pengesahan babak di database ditolak: ${rpcRes.message}`
        };
      }
    }

    // 8. Commit local state AFTER server transaction succeeded
    setStageSnapshots((prev) => [...prev.filter((s) => s.id !== stageSnapshot.id), stageSnapshot]);

    const nowTime = getWibTime();
    const quota = currentStg.qualificationQuota;
    const stagePartIds = new Set(stageParts.map((sp) => sp.id));

    if (isFinalChampionship) {
      // FINAL STAGE CHAMPIONSHIP FINALIZATION FLOW
      setStages((prev) =>
        prev.map((s) => {
          if (s.id === currentStg.id && s.tenantId === currentTenantId) {
            return {
              ...s,
              isFinalized: true,
              status: 'Selesai',
              finalizedAt: nowTime,
              finalizedBy: currentUser.name
            };
          }
          return s;
        })
      );

      setStageParticipations((prev) =>
        prev.map((sp) => {
          if (stagePartIds.has(sp.id)) {
            const data = scoreMap[sp.participantId] || { score: 0, rank: 99, isQualified: false };
            const isWinner = data.isQualified;
            const championTitle =
              data.rank === 1
                ? 'Juara 1'
                : data.rank === 2
                ? 'Juara 2'
                : data.rank === 3
                ? 'Juara 3'
                : `Finalis (Peringkat ${data.rank})`;
            const reason = overrideReasons?.[sp.participantId] || championTitle;

            return {
              ...sp,
              finalScore: data.score,
              rank: data.rank,
              isQualified: isWinner,
              qualificationReason: reason,
              finalizedAt: nowTime,
              status: 'Lengkap' as ParticipantProgressStatus
            };
          }
          return sp;
        })
      );

      setParticipants((prev) =>
        prev.map((p) => {
          if (p.tenantId === currentTenantId && stageParticipantIdSet.has(p.id) && scoreMap[p.id]) {
            const data = scoreMap[p.id];
            const isWinner = data.isQualified;
            const championTitle =
              data.rank === 1
                ? 'Juara 1'
                : data.rank === 2
                ? 'Juara 2'
                : data.rank === 3
                ? 'Juara 3'
                : `Finalis (Peringkat ${data.rank})`;
            const reason = overrideReasons?.[p.id] || championTitle;

            const historyEntry = {
              stageId: currentStg.id,
              stageName: currentStageName,
              status: championTitle,
              score: data.score,
              rank: data.rank,
              qualified: isWinner,
              reason,
              finalizedAt: nowTime
            };

            return {
              ...p,
              status: 'Final' as const,
              stageHistory: [...(p.stageHistory || []), historyEntry]
            };
          }
          return p;
        })
      );

      const newAudit: AuditLogItem = {
        id: generateUniqueLogId('aud'),
        timestamp: nowTime,
        actor: `${currentUser.name} (${currentUser.role})`,
        action: 'CHAMPIONSHIP_FINALIZED',
        target: `Babak ${currentStageName} (Puncak Kejuaraan)`,
        tenantName: currentTenant.name,
        summary: `Pengesahan resmi pemenang dan kejuaraan Musabaqah Babak ${currentStageName}.`,
        reason:
          Object.keys(overrideReasons || {}).length > 0
            ? JSON.stringify(overrideReasons)
            : undefined,
        outcome: 'Success'
      };
      setAuditLogs((prev) => [newAudit, ...prev.filter((l) => l.id !== newAudit.id)]);

      const newLog: ActivityLogItem = {
        id: generateUniqueLogId('act'),
        tenantId: currentTenantId,
        type: 'stage',
        title: 'Musabaqah Selesai & Juara Disahkan',
        description: `Seluruh rangkaian penilaian Babak ${currentStageName} telah disahkan dan ditetapkan secara resmi.`,
        timestamp: nowTime,
        actorName: currentUser.name
      };
      setActivityLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id).slice(0, 20)]);

      setSyncStatus(
        supabaseDataService.isLive()
          ? supabaseDataService.getConnectionStatus().statusLabel
          : 'Mode Lokal (Tersimpan di Browser)'
      );
      setLastSyncTime(nowTime);

      return {
        success: true,
        message: `Hasil kejuaraan Babak ${currentStageName} berhasil disahkan secara resmi dan musabaqah dinyatakan selesai.`
      };
    }

    // STANDARD ADVANCEMENT TO NEXT STAGE
    // 1. Mark current stage as finalized and activate next stage
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === currentStg.id && s.tenantId === currentTenantId) {
          return {
            ...s,
            isFinalized: true,
            status: 'Selesai',
            finalizedAt: nowTime,
            finalizedBy: currentUser.name
          };
        }
        if (nextStg && s.id === nextStg.id && s.tenantId === currentTenantId) {
          return { ...s, status: 'Aktif' };
        }
        return s;
      })
    );

    // 2. Update existing stageParticipations strictly for stagePartIds and create new ones for nextStg
    const newParticipations: StageParticipation[] = [];

    setStageParticipations((prev) => {
      const updated = prev.map((sp) => {
        if (stagePartIds.has(sp.id)) {
          const data = scoreMap[sp.participantId] || { score: 0, rank: 99, isQualified: false };
          const isQual = data.isQualified;
          const reason =
            overrideReasons?.[sp.participantId] ||
            (isQual ? `Lolos kuota Top ${quota}` : 'Tidak memenuhi kuota kelulusan');
          return {
            ...sp,
            finalScore: data.score,
            rank: data.rank,
            isQualified: isQual,
            qualificationReason: reason,
            finalizedAt: nowTime
          };
        }
        return sp;
      });

      finalQualifiedIds.forEach((pId) => {
        const part = participants.find((p) => p.id === pId && p.tenantId === currentTenantId);
        if (part && nextStg) {
          newParticipations.push({
            id: generateUuid(),
            tenantId: currentTenantId,
            participantId: part.id,
            stageId: nextStg.id,
            stageName: nextStg.name,
            branchId: part.branchId || nextStg.branchId,
            branchName: part.branchName,
            lotteryNumber: part.lotteryNumber,
            questionId: '',
            assignedMaqra: 'Belum Ditetapkan',
            pageNumber: 1,
            assignedQuestions: [],
            status: 'Maqra Belum Ditetapkan'
          });
        }
      });

      return [...updated, ...newParticipations];
    });

    // 3. Update participants records strictly for stageParticipantIdSet
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.tenantId === currentTenantId && stageParticipantIdSet.has(p.id)) {
          const data = scoreMap[p.id];
          if (finalQualifiedIds.includes(p.id)) {
            const historyEntry = {
              stageId: currentStg.id,
              stageName: currentStageName,
              status: 'Lolos ke ' + nextStageName,
              score: data?.score,
              rank: data?.rank,
              qualified: true,
              reason: overrideReasons?.[p.id] || `Lolos kuota Top ${quota}`,
              finalizedAt: nowTime
            };
            return {
              ...p,
              stageName: nextStageName,
              status: 'Menunggu',
              stageHistory: [...(p.stageHistory || []), historyEntry],
              questionId: '',
              assignedMaqra: 'Belum Ditetapkan',
              assignedQuestions: [],
              questionIds: []
            };
          } else {
            const historyEntry = {
              stageId: currentStg.id,
              stageName: currentStageName,
              status: 'Gugur di ' + currentStageName,
              score: data?.score,
              rank: data?.rank,
              qualified: false,
              reason: overrideReasons?.[p.id] || 'Tidak memenuhi kuota kelulusan',
              finalizedAt: nowTime
            };
            return {
              ...p,
              status: 'Final',
              stageHistory: [...(p.stageHistory || []), historyEntry]
            };
          }
        }
        return p;
      })
    );

    // 4. Audit Log Entry
    const newAudit: AuditLogItem = {
      id: generateUniqueLogId('aud'),
      timestamp: nowTime,
      actor: `${currentUser.name} (${currentUser.role})`,
      action: 'STAGE_QUALIFICATION_ADVANCE',
      target: `Babak ${currentStageName} ➔ ${nextStageName}`,
      tenantName: currentTenant.name,
      summary: `Finalisasi Babak ${currentStageName} dan pelolosan resmi ${finalQualifiedIds.length} peserta ke Babak ${nextStageName}.`,
      reason:
        Object.keys(overrideReasons || {}).length > 0
          ? JSON.stringify(overrideReasons)
          : undefined,
      outcome: 'Success'
    };
    setAuditLogs((prev) => [newAudit, ...prev.filter((l) => l.id !== newAudit.id)]);

    setSyncStatus(
      supabaseDataService.isLive()
        ? supabaseDataService.getConnectionStatus().statusLabel
        : 'Mode Lokal (Tersimpan di Browser)'
    );
    setLastSyncTime(nowTime);

    return {
      success: true,
      message: `Berhasil memfinalisasi Babak ${currentStageName} dan meloloskan ${finalQualifiedIds.length} peserta ke Babak ${nextStageName}.`
    };
  };

  // Judge Assignment Actions (Tenant Scoped)
  const addJudgeAssignment = (asg: Omit<JudgeAssignment, 'id' | 'tenantId'>) => {
    const newAsg: JudgeAssignment = {
      ...asg,
      id: generateUuid(),
      tenantId: currentTenantId
    };
    setJudgeAssignments((prev) => [...prev, newAsg]);
    if (isLiveDbActive) {
      setSyncStatus('Menyimpan penugasan hakim ke database...');
      void supabaseDataService
        .upsertJudgeAssignment({
          ...newAsg,
          tenantId: toDeterministicUuid(currentTenantId),
          stageId: toDeterministicUuid(newAsg.stageId || 'stage-penyisihan'),
          judgeId: toDeterministicUuid(newAsg.judgeId)
        })
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menyimpan Penugasan Hakim: ${res.message}`);
            setJudgeAssignments((prev) => prev.filter((ja) => ja.id !== newAsg.id));
          } else {
            setSyncStatus('Penugasan Hakim Tersimpan di Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  const removeJudgeAssignment = (id: string) => {
    const existing = judgeAssignments.find((ja) => ja.id === id && ja.tenantId === currentTenantId);
    setJudgeAssignments((prev) =>
      prev.filter((ja) => ja.id !== id || ja.tenantId !== currentTenantId)
    );
    if (isLiveDbActive && existing) {
      setSyncStatus('Menghapus penugasan hakim dari database...');
      void supabaseDataService
        .deleteJudgeAssignment(toDeterministicUuid(currentTenantId), toDeterministicUuid(id))
        .then((res) => {
          if (!res.success) {
            setSyncStatus(`Gagal Menghapus Penugasan Hakim: ${res.message}`);
            setJudgeAssignments((prev) => [...prev, existing]);
          } else {
            setSyncStatus('Penugasan Hakim Dihapus dari Database');
            setLastSyncTime(getWibTime());
          }
        });
    }
  };

  return (
    <MtqContext.Provider
      value={{
        tenants,
        currentTenant,
        setTenantId: setCurrentTenantId,
        addTenant,
        updateTenant,
        toggleTenantStatus,
        deleteTenant,
        users,
        currentUser,
        setCurrentUserId: setSafeCurrentUserId,
        addUser,
        updateUser,
        retryUserProvisioning,
        toggleUserStatus,
        deleteUser,
        kafilahs: kafilahs.filter((k) => k.tenantId === currentTenantId),
        participants: participants.filter((p) => p.tenantId === currentTenantId),
        stageParticipations: stageParticipations.filter((sp) => sp.tenantId === currentTenantId),
        questions: questions.filter((q) => q.tenantId === currentTenantId),
        errorCategories: errorCategories.filter((c) => c.tenantId === currentTenantId),
        assessments: assessments.filter((a) => a.tenantId === currentTenantId),
        activityLogs: activityLogs.filter((l) => l.tenantId === currentTenantId),
        auditLogs,
        stages: stages.filter((s) => s.tenantId === currentTenantId),
        judgeAssignments: judgeAssignments.filter((ja) => ja.tenantId === currentTenantId),
        jenjangList: jenjangList.filter((j) => j.tenantId === currentTenantId || !j.tenantId),
        cabangList: cabangList.filter((c) => c.tenantId === currentTenantId || !c.tenantId),
        addJenjang,
        updateJenjang,
        deleteJenjang,
        addCabang,
        updateCabang,
        deleteCabang,
        rubricVersions: rubricVersions.filter((r) => r.tenantId === currentTenantId || r.tenantId === 'system'),
        competitionRules: competitionRules.filter((r) => r.tenantId === currentTenantId || r.tenantId === 'system'),
        addRubricVersion,
        updateRubricVersion,
        activateRubricVersion,
        archiveRubricVersion,
        deleteRubricVersion,
        addCompetitionRule,
        updateCompetitionRule,
        deleteCompetitionRule,
        getActiveRubricForBranch,
        getBranchRuleConfigByBranch,
        currentView,
        setCurrentView,
        isSidebarOpen,
        setIsSidebarOpen,
        toggleSidebar,
        selectedParticipantId,
        setSelectedParticipantId,
        selectedStageName,
        setSelectedStageName,
        monitoringJudgeId,
        setMonitoringJudgeId,
        syncStatus,
        lastSyncTime,
        initializeAssessment,
        updateErrorCount,
        saveAnnotations,
        finalizeAssessment,
        reopenAssessment,
        stageSnapshots,
        getJudgeAssessment,
        getParticipantProgress,
        getStageParticipation,
        getParticipantStageQuestions,
        addKafilah,
        updateKafilah,
        addParticipant,
        updateParticipant,
        addQuestion,
        updateQuestion,
        assignMaqraToParticipant,
        addQuestionToParticipant,
        removeQuestionFromParticipant,
        conductLotteryDraw,
        commitLotteryDrawResults,
        updateCategoryDeduction,
        addErrorCategory,
        updateErrorCategory,
        addStage,
        updateStage,
        deleteStage,
        advanceQualifiers,
        addJudgeAssignment,
        removeJudgeAssignment,
        isSuperadminWorkspaceMode,
        enterTenantWorkspace,
        exitTenantWorkspace,
        isDemoAccountModalOpen,
        setIsDemoAccountModalOpen,
        resetPrototypeData,
        connectionInfo,
        authenticatedProfile,
        dataSourceMode,
        workspaceError,
        isOfflineDemoSimulation,
        isLiveSupabaseMode,
        isLiveAccessAuthorized,
        accessGateReason,
        isPasswordRecoveryMode,
        setIsPasswordRecoveryMode,
        enterOfflineDemoSimulation,
        exitOfflineDemoSimulation,
        refreshSupabaseConnection,
        signInWithSupabase,
        signUpWithSupabase,
        signOutSupabase,
        requestPasswordReset,
        completePasswordReset,
        bootstrapFirstSuperadmin
      }}
    >
      {children}
    </MtqContext.Provider>
  );
};

export const useMtq = () => {
  const context = useContext(MtqContext);
  if (!context) {
    throw new Error('useMtq must be used within a MtqProvider');
  }
  return context;
};
