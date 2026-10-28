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
import { calculateAssessmentScore } from '../services/scoringEngine';
import { RankingService } from '../services/rankingService';
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

  users: User[];
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, updated: Partial<User>) => void;
  toggleUserStatus: (id: string) => void;

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
  updateRubricVersion: (id: string, updated: Partial<RubricVersion>) => void;
  activateRubricVersion: (id: string) => { success: boolean; message: string };
  archiveRubricVersion: (id: string) => void;
  addCompetitionRule: (rule: Omit<CompetitionRuleConfig, 'id' | 'tenantId'>) => void;
  updateCompetitionRule: (id: string, updated: Partial<CompetitionRuleConfig>) => void;
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
  ) => { success: boolean; message: string };
  reopenAssessment: (
    participantId: string,
    judgeId: string,
    reason: string,
    stageName?: string,
    questionId?: string
  ) => { success: boolean; message: string };
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
  ) => { success: boolean; message: string };

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
      const saved = localStorage.getItem(STORAGE_PREFIX + 'users');
      return saved ? JSON.parse(saved) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
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
  const [syncStatus, setSyncStatus] = useState<string>('Tersimpan di browser');
  const [lastSyncTime, setLastSyncTime] = useState<string>('13:14:18 WIB');
  const [isDemoAccountModalOpen, setIsDemoAccountModalOpen] = useState<boolean>(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'tenants', JSON.stringify(tenants));
    } catch (e) {
      console.warn('Storage error: tenants', e);
    }
  }, [tenants]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'tenant_id', currentTenantId);
    } catch {}
  }, [currentTenantId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'users', JSON.stringify(users));
    } catch {}
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'user_id', currentUserId);
    } catch {}
  }, [currentUserId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'kafilahs', JSON.stringify(kafilahs));
    } catch {}
  }, [kafilahs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'participants', JSON.stringify(participants));
    } catch {}
  }, [participants]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'stage_participations', JSON.stringify(stageParticipations));
    } catch {}
  }, [stageParticipations]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'questions', JSON.stringify(questions));
    } catch {}
  }, [questions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'categories', JSON.stringify(errorCategories));
    } catch {}
  }, [errorCategories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'assessments', JSON.stringify(assessments));
    } catch {}
  }, [assessments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'logs', JSON.stringify(activityLogs));
    } catch {}
  }, [activityLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'audit_logs', JSON.stringify(auditLogs));
    } catch {}
  }, [auditLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'stages', JSON.stringify(stages));
    } catch {}
  }, [stages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'judge_assignments', JSON.stringify(judgeAssignments));
    } catch {}
  }, [judgeAssignments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'jenjang_list', JSON.stringify(jenjangList));
    } catch {}
  }, [jenjangList]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'cabang_list', JSON.stringify(cabangList));
    } catch {}
  }, [cabangList]);

  const [stageSnapshots, setStageSnapshots] = useState<StageResultSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'stage_snapshots');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'stage_snapshots', JSON.stringify(stageSnapshots));
    } catch {}
  }, [stageSnapshots]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'rubric_versions', JSON.stringify(rubricVersions));
    } catch (e) {
      console.warn('Storage error: rubric_versions', e);
    }
  }, [rubricVersions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'competition_rules', JSON.stringify(competitionRules));
    } catch (e) {
      console.warn('Storage error: competition_rules', e);
    }
  }, [competitionRules]);

  const currentTenant = tenants.find((t) => t.id === currentTenantId) || tenants[0];
  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

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
        if (key.startsWith('mtq_platform_data_')) {
          localStorage.removeItem(key);
        }
      });
      window.location.reload();
    } catch (e) {
      console.warn('Reset error', e);
    }
  };

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

    // Find required judge assignments in current tenant for this stage and branch
    const requiredAssignments = judgeAssignments.filter(
      (ja) =>
        ja.tenantId === currentTenantId &&
        ja.stageName === targetStage &&
        (!ja.branchName || ja.branchName === part.branchName || part.branchName.includes(ja.branchName) || ja.branchName.includes(part.branchName))
    );

    let requiredJudgeIds = Array.from(new Set(requiredAssignments.map((ja) => ja.judgeId)));
    if (requiredJudgeIds.length === 0) {
      requiredJudgeIds = users
        .filter((u) => u.role === 'judge' && u.tenantId === currentTenantId)
        .map((u) => u.id);
    }
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
            a.stageName === targetStage &&
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
      id: 'rubric-' + Date.now(),
      tenantId: currentTenantId,
      createdAt: new Date().toISOString()
    };
    setRubricVersions((prev) => [...prev, newRubric]);
  };

  const updateRubricVersion = (id: string, updated: Partial<RubricVersion>) => {
    setRubricVersions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
    );
  };

  const activateRubricVersion = (id: string): { success: boolean; message: string } => {
    const target = rubricVersions.find((r) => r.id === id);
    if (!target) return { success: false, message: 'Rubrik tidak ditemukan.' };

    const totalMax = target.fields.reduce((sum, f) => sum + Number(f.maxScore || 0), 0);
    if (totalMax <= 0) {
      return { success: false, message: 'Rubrik harus memiliki minimal 1 bidang dengan batas skor valid.' };
    }

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
    return { success: true, message: `Versi rubrik "${target.name}" (${target.version}) berhasil diaktifkan.` };
  };

  const archiveRubricVersion = (id: string) => {
    setRubricVersions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'Arsip' as const } : r))
    );
  };

  const addCompetitionRule = (ruleData: Omit<CompetitionRuleConfig, 'id' | 'tenantId'>) => {
    const newRule: CompetitionRuleConfig = {
      ...ruleData,
      id: 'rule-' + Date.now(),
      tenantId: currentTenantId
    };
    setCompetitionRules((prev) => [...prev, newRule]);
  };

  const updateCompetitionRule = (id: string, updated: Partial<CompetitionRuleConfig>) => {
    setCompetitionRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
    );
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
    // Role check: Only judges can modify error counts (Admin mode is strictly read-only)
    if (currentUser.role !== 'judge') {
      console.warn('Mode Pemantauan Admin bersifat baca-saja. Perubahan nilai ditolak.');
      return;
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return;
    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;

    if (!targetQuestionId) {
      console.warn('Penilaian ditolak: Peserta belum memiliki maqra yang ditetapkan pada babak ini.');
      return;
    }

    // Get or create stage participation
    let sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        item.stageName === targetStage
    );

    const targetStageObj = stages.find((s) => s.tenantId === currentTenantId && s.name === targetStage);
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    if (!sp) {
      sp = {
        id: `sp-${participantId}-${stageId}-${Date.now()}`,
        tenantId: currentTenantId,
        participantId,
        stageId,
        stageName: targetStage,
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
        a.stageName === targetStage &&
        a.questionId === targetQuestionId
    );

    if (existing?.status === 'finalized') {
      console.warn('Penilaian yang sudah final bersifat read-only dan tidak dapat diubah.');
      return;
    }

    const nowTime = getWibTime();
    setSyncStatus('Menyimpan...');

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
          id: `asm-${participantId}-${judgeId}-${targetStage}-${targetQuestionId}`,
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

    setSyncStatus('Tersimpan di browser');
    setLastSyncTime(nowTime);
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
    if (currentUser.role !== 'judge') {
      return;
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return;
    const targetStage = stageName || part.stageName || selectedStageName;
    const stageQuestions = getParticipantStageQuestions(participantId, targetStage);
    const targetQuestionId = questionId || stageQuestions[0]?.questionId;
    if (!targetQuestionId) return;

    let sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        item.stageName === targetStage
    );

    const targetStageObj = stages.find((s) => s.tenantId === currentTenantId && s.name === targetStage);
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    if (!sp) {
      sp = {
        id: `sp-${participantId}-${stageId}-${Date.now()}`,
        tenantId: currentTenantId,
        participantId,
        stageId,
        stageName: targetStage,
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
        a.stageName === targetStage &&
        a.questionId === targetQuestionId
    );

    if (existing?.status === 'finalized') {
      return;
    }

    const nowTime = getWibTime();
    setSyncStatus('Menyimpan anotasi...');
    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;

    if (existing) {
      setAssessments((prev) =>
        prev.map((a) =>
          a.id === existing.id
            ? { ...a, annotations, lastUpdated: nowTime }
            : a
        )
      );
    } else {
      const newAsm: JudgeAssessment = {
        id: `asm-${participantId}-${judgeId}-${targetStage}-${targetQuestionId}`,
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
        deductions: {},
        totalDeductions: 0,
        finalScore: 100.0,
        annotations,
        lastUpdated: nowTime
      };
      setAssessments((prev) => [...prev, newAsm]);
    }

    setSyncStatus('Tersimpan di browser');
    setLastSyncTime(nowTime);
  };

  /**
   * Finalize individual judge assessment scoped strictly to question and stage.
   * Updates participant stage completion accurately across all assigned questions.
   */
  const finalizeAssessment = (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ): { success: boolean; message: string } => {
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

    // 4. Maqra check
    if (!targetQuestionId) {
      return {
        success: false,
        message: 'Finalisasi ditolak: Peserta belum memiliki penetapan maqra pada babak ini.'
      };
    }

    // 5. Official Judge Assignment check
    const stageAssignments = judgeAssignments.filter(
      (ja) => ja.tenantId === currentTenantId && ja.stageName === targetStage
    );
    if (stageAssignments.length > 0) {
      const isJudgeAssigned = stageAssignments.some(
        (ja) =>
          ja.judgeId === judgeId &&
          (!ja.branchName ||
            ja.branchName === part.branchName ||
            part.branchName.includes(ja.branchName) ||
            ja.branchName.includes(part.branchName))
      );
      if (!isJudgeAssigned) {
        return {
          success: false,
          message: 'Finalisasi ditolak: Anda tidak terdaftar secara resmi sebagai hakim penilai untuk cabang/babak ini.'
        };
      }
    }

    // 6. Active Rubric check (without silent fallback to Seni Baca)
    const activeRubric = getActiveRubricForBranch(part.branchName, part.branchId);
    if (!activeRubric) {
      return {
        success: false,
        message: `Finalisasi ditolak: Aturan/rubrik penilaian belum terkonfigurasi atau masih berstatus Draft untuk cabang "${part.branchName}".`
      };
    }

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        a.stageName === targetStage &&
        a.questionId === targetQuestionId
    );

    // 7. Reject re-finalization of already finalized assessment
    if (existing && existing.status === 'finalized') {
      return {
        success: false,
        message: 'Lembar penilaian ini sudah dalam status terfinalisasi.'
      };
    }

    // 8. Calculate score and validate rubric fields
    const currentCounts = existing ? existing.errorCounts : {};
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

    const nowTime = getWibTime();
    let sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        item.stageName === targetStage
    );

    const targetStageObj = stages.find((s) => s.tenantId === currentTenantId && s.name === targetStage);
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    if (!sp) {
      sp = {
        id: `sp-${participantId}-${stageId}-${Date.now()}`,
        tenantId: currentTenantId,
        participantId,
        stageId,
        stageName: targetStage,
        branchName: part.branchName,
        lotteryNumber: part.lotteryNumber,
        questionId: targetQuestionId,
        assignedMaqra: part.assignedMaqra,
        pageNumber: part.pageNumber,
        status: 'Berlangsung'
      };
      setStageParticipations((prev) => [...prev, sp!]);
    }

    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;
    const finalizedScore = scoreResult.finalScore;

    let updatedAssessments: JudgeAssessment[];
    if (existing) {
      updatedAssessments = assessments.map((a) =>
        a.id === existing.id
          ? {
              ...a,
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
    } else {
      const newAsm: JudgeAssessment = {
        id: `asm-${participantId}-${judgeId}-${targetStage}-${targetQuestionId}`,
        tenantId: currentTenantId,
        stageParticipationId: sp.id,
        stageId,
        stageName: targetStage,
        participantId,
        judgeId,
        judgeName: targetJudge.name,
        judgeField: targetJudge.judgeField || 'Dewan Hakim',
        questionId: targetQuestionId,
        status: 'finalized',
        isLocked: true,
        errorCounts: {},
        deductions: scoreResult.deductions,
        fieldScores: scoreResult.fieldScores,
        fieldDeductions: scoreResult.fieldDeductions,
        totalDeductions: 0,
        finalScore: scoreResult.finalScore,
        rubricVersion: activeRubric.code,
        rubricVersionId: activeRubric.id,
        annotations: [],
        lastUpdated: nowTime,
        finalizedAt: nowTime
      };
      updatedAssessments = [...assessments, newAsm];
    }
    setAssessments(updatedAssessments);

    // Check required judges in this stage and branch
    const requiredJudges = judgeAssignments.filter(
      (ja) =>
        ja.tenantId === currentTenantId &&
        ja.stageName === targetStage &&
        (!ja.branchName || ja.branchName === part.branchName || part.branchName.includes(ja.branchName) || ja.branchName.includes(part.branchName))
    );
    let requiredJudgeIds = Array.from(new Set(requiredJudges.map((ja) => ja.judgeId)));
    if (requiredJudgeIds.length === 0) {
      requiredJudgeIds = users
        .filter((u) => u.role === 'judge' && u.tenantId === currentTenantId)
        .map((u) => u.id);
    }

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
            a.stageName === targetStage &&
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

    setStageParticipations((prev) => {
      const existsInList = prev.some((item) => item.id === sp!.id);

      if (existsInList) {
        return prev.map((item) =>
          item.id === sp!.id
            ? {
                ...item,
                status: updatedStatus,
                finalizedAt: allFinalized ? nowTime : item.finalizedAt
              }
            : item
        );
      } else {
        return [
          ...prev,
          {
            ...sp!,
            status: updatedStatus,
            finalizedAt: allFinalized ? nowTime : undefined
          }
        ];
      }
    });

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

    setSyncStatus('Tersimpan di browser');
    setLastSyncTime(nowTime);

    return {
      success: true,
      message: `Penilaian ${qLabel} untuk peserta ${part.name} (Skor: ${finalizedScore.toFixed(2)}) berhasil dikunci dan difinalisasi.`
    };
  };

  /**
   * Pembukaan kembali lembar penilaian final (Correction & Reopen Policy)
   * Hanya dapat dilakukan oleh Administrator / Superadmin dengan mencantumkan alasan wajib.
   * Menghasilkan catatan Audit Log permanen demi integritas hasil kompetisi.
   */
  const reopenAssessment = (
    participantId: string,
    judgeId: string,
    reason: string,
    stageName?: string,
    questionId?: string
  ): { success: boolean; message: string } => {
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

    return {
      success: true,
      message: `Lembar penilaian berhasil dibuka kembali untuk koreksi. Hakim terkait sekarang dapat mengedit nilai.`
    };
  };

  // Kafilah Actions (Tenant Scoped)
  const addKafilah = (data: Omit<Kafilah, 'id' | 'tenantId'>) => {
    const newKafilah: Kafilah = {
      ...data,
      id: 'kf-' + Date.now(),
      tenantId: currentTenantId
    };
    setKafilahs((prev) => [...prev, newKafilah]);
  };

  const updateKafilah = (id: string, updated: Partial<Kafilah>) => {
    setKafilahs((prev) =>
      prev.map((k) => (k.id === id && k.tenantId === currentTenantId ? { ...k, ...updated } : k))
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

    const newPartId = 'part-' + Date.now();
    const targetStage = data.stageName || 'Penyisihan';
    const targetStageObj = stages.find(
      (s) => s.tenantId === currentTenantId && s.name === targetStage
    );
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    const hasQuestion = Boolean(data.questionId && data.questionId.trim() !== '');

    const newPart: Participant = {
      ...data,
      id: newPartId,
      tenantId: currentTenantId,
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
      id: `sp-${newPartId}-${stageId}-${Date.now()}`,
      tenantId: currentTenantId,
      participantId: newPartId,
      stageId,
      stageName: targetStage,
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
    setParticipants((prev) =>
      prev.map((p) => (p.id === id && p.tenantId === currentTenantId ? { ...p, ...updated } : p))
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
  };

  // Question & Maqra Actions (Tenant Scoped)
  const addQuestion = (data: Omit<Question, 'id' | 'tenantId'>) => {
    const newQ: Question = {
      ...data,
      id: 'mq-' + Date.now(),
      tenantId: currentTenantId
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const updateQuestion = (id: string, updated: Partial<Question>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && q.tenantId === currentTenantId ? { ...q, ...updated } : q))
    );
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

    const newMaqraItem: AssignedMaqraItem = {
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
      const exists = prev.some(
        (sp) =>
          sp.tenantId === currentTenantId &&
          sp.participantId === participantId &&
          sp.stageName === targetStage
      );

      if (exists) {
        return prev.map((sp) => {
          if (
            sp.tenantId === currentTenantId &&
            sp.participantId === participantId &&
            sp.stageName === targetStage
          ) {
            const currentList = (sp.assignedQuestions || []).filter((item) => item.questionId !== '');
            const updatedList = [...currentList, newMaqraItem];
            const nextStatus: ParticipantProgressStatus =
              sp.status === 'Maqra Belum Ditetapkan' ? 'Belum Dimulai' : sp.status;
            return {
              ...sp,
              questionId: q.id,
              assignedMaqra: updatedList.length === 1 ? assignedLabel : `${updatedList.length} Maqra Ditetapkan`,
              pageNumber: q.pageNumber,
              assignedQuestions: updatedList,
              status: nextStatus
            };
          }
          return sp;
        });
      } else {
        const targetStageObj = stages.find(
          (s) => s.tenantId === currentTenantId && s.name === targetStage
        );
        const newSp: StageParticipation = {
          id: `sp-${participantId}-${targetStageObj?.id || 'stage'}-${Date.now()}`,
          tenantId: currentTenantId,
          participantId,
          stageId: targetStageObj?.id || 'stage',
          stageName: targetStage,
          branchName: part.branchName,
          lotteryNumber: part.lotteryNumber,
          questionId: q.id,
          assignedMaqra: assignedLabel,
          pageNumber: q.pageNumber,
          assignedQuestions: [newMaqraItem],
          status: 'Belum Dimulai'
        };
        return [...prev, newSp];
      }
    });

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
          return {
            ...sp,
            questionId: lastItem ? lastItem.questionId : '',
            assignedMaqra: combined.length === 1 ? combined[0].title : `${combined.length} Maqra Ditetapkan`,
            pageNumber: lastItem ? lastItem.pageNumber : 1,
            assignedQuestions: combined,
            status: sp.status === 'Maqra Belum Ditetapkan' ? ('Belum Dimulai' as ParticipantProgressStatus) : sp.status
          };
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
            updated.push({
              id: `sp-${r.participantId}-${stageId}-${Date.now()}`,
              tenantId: currentTenantId,
              participantId: r.participantId,
              stageId,
              stageName,
              branchName: part.branchName,
              lotteryNumber: part.lotteryNumber,
              questionId: lastItem ? lastItem.questionId : '',
              assignedMaqra: newItems.length === 1 ? newItems[0].title : `${newItems.length} Maqra Ditetapkan`,
              pageNumber: lastItem ? lastItem.pageNumber : 1,
              assignedQuestions: newItems,
              status: 'Belum Dimulai'
            });
          }
        }
      });

      return updated;
    });

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
      id: 'j-' + Date.now(),
      tenantId: currentTenantId
    };
    setJenjangList((prev) => [...prev, newItem]);
  };

  const updateJenjang = (id: string, updated: Partial<GenericMasterItem>) => {
    setJenjangList((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...updated } : j))
    );
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
    return { success: true, message: `Jenjang "${item.name}" berhasil dihapus.` };
  };

  const addCabang = (item: Omit<GenericMasterItem, 'id' | 'tenantId'>) => {
    const newItem: GenericMasterItem = {
      ...item,
      id: 'cb-' + Date.now(),
      tenantId: currentTenantId
    };
    setCabangList((prev) => [...prev, newItem]);
  };

  const updateCabang = (id: string, updated: Partial<GenericMasterItem>) => {
    setCabangList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
    );
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
    return { success: true, message: `Cabang "${item.name}" berhasil dihapus.` };
  };

  // Error Category Actions
  const updateCategoryDeduction = (categoryId: string, deduction: number) => {
    setErrorCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId && c.tenantId === currentTenantId
          ? { ...c, defaultDeduction: deduction }
          : c
      )
    );
  };

  const addErrorCategory = (cat: Omit<ErrorCategory, 'id' | 'tenantId'>) => {
    const newCat: ErrorCategory = {
      ...cat,
      id: 'cat-' + Date.now(),
      tenantId: currentTenantId
    };
    setErrorCategories((prev) => [...prev, newCat]);
  };

  const updateErrorCategory = (id: string, updated: Partial<ErrorCategory>) => {
    setErrorCategories((prev) =>
      prev.map((c) =>
        c.id === id && c.tenantId === currentTenantId ? { ...c, ...updated } : c
      )
    );
  };

  // User & Judge Management
  const addUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = {
      ...userData,
      id: 'usr-' + Date.now()
    };
    setUsers((prev) => [...prev, newUser]);
  };

  const updateUser = (id: string, updated: Partial<User>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updated } : u))
    );
  };

  const toggleUserStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: u.status === 'Aktif' ? 'Nonaktif' : 'Aktif' } : u
      )
    );
  };

  // Tenant Actions (Superadmin)
  const addTenant = (tenantData: Omit<Tenant, 'id'>) => {
    const newTenant: Tenant = {
      ...tenantData,
      id: 'tenant-' + Date.now()
    };
    setTenants((prev) => [...prev, newTenant]);
  };

  const updateTenant = (id: string, updated: Partial<Tenant>) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updated } : t))
    );
  };

  // Stage Management (Tenant Scoped)
  const addStage = (stageData: Omit<CompetitionStage, 'id' | 'tenantId'>) => {
    const newStage: CompetitionStage = {
      ...stageData,
      id: 'stage-' + Date.now(),
      tenantId: currentTenantId
    };
    setStages((prev) => [...prev, newStage]);
  };

  const updateStage = (id: string, updated: Partial<CompetitionStage>) => {
    setStages((prev) =>
      prev.map((s) =>
        s.id === id && s.tenantId === currentTenantId ? { ...s, ...updated } : s
      )
    );
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
  const advanceQualifiers = (
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
  ): { success: boolean; message: string } => {
    let currentStageName: string;
    let nextStageName: string = '';
    let qualifiedParticipantIds: string[] = [];
    let overrideReasons: Record<string, string> | undefined = undefined;
    let manualOverridesParam: Record<string, boolean> | undefined = undefined;
    let branchIdParam: string | undefined = undefined;
    let branchNameParam: string | undefined = undefined;
    let stageIdParam: string | undefined = undefined;

    if (typeof currentStageNameOrParams === 'object' && currentStageNameOrParams !== null) {
      currentStageName = currentStageNameOrParams.currentStageName;
      nextStageName = currentStageNameOrParams.nextStageName || '';
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

    const currentStg = stages.find(
      (s) =>
        s.tenantId === currentTenantId &&
        ((stageIdParam && s.id === stageIdParam) || s.name === currentStageName) &&
        (!branchNameParam || !s.branchName || s.branchName === branchNameParam)
    );

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

    const isFinalChampionship = !nextStageName || nextStageName.trim() === '';
    const nextStg = isFinalChampionship
      ? null
      : stages.find((s) => s.tenantId === currentTenantId && s.name === nextStageName);

    if (!isFinalChampionship && !nextStg) {
      return {
        success: false,
        message: `Babak lanjutan "${nextStageName}" tidak ditemukan pada tenant ini.`
      };
    }

    // Find participations for currentStage in currentTenant
    const stageParts = stageParticipations.filter(
      (sp) =>
        sp.tenantId === currentTenantId &&
        ((stageIdParam && sp.stageId === stageIdParam) || sp.stageName === currentStageName) &&
        (!branchIdParam || !sp.branchId || sp.branchId === branchIdParam) &&
        (!branchNameParam || !sp.branchName || sp.branchName === branchNameParam)
    );

    if (stageParts.length === 0) {
      return {
        success: false,
        message: `Tidak ada peserta aktif di Babak ${currentStageName}.`
      };
    }

    // VALIDATION: All participants in current stage must have assigned questions and all required judge assessments finalized!
    for (const sp of stageParts) {
      const stageQuestions = getParticipantStageQuestions(sp.participantId, currentStageName);
      if (stageQuestions.length === 0) {
        const part = participants.find((p) => p.id === sp.participantId);
        return {
          success: false,
          message: `Finalisasi ditolak: Peserta "${part?.name || sp.participantId}" belum memiliki penetapan soal wajib untuk Babak ${currentStageName}.`
        };
      }

      const progress = getParticipantProgress(sp.participantId, currentStageName);
      if (progress !== 'Lengkap') {
        const part = participants.find((p) => p.id === sp.participantId);
        return {
          success: false,
          message: `Finalisasi ditolak: Penilaian peserta "${part?.name || sp.participantId}" di Babak ${currentStageName} belum lengkap dari seluruh dewan hakim yang diwajibkan (Status saat ini: ${progress}).`
        };
      }
    }

    // Gunakan RankingService terpusat dengan penegakan tie-break resmi dan isolasi cabang
    const manualOverridesMap: Record<string, boolean> =
      manualOverridesParam ||
      (qualifiedParticipantIds || []).reduce<Record<string, boolean>>((acc, pid) => {
        acc[pid] = true;
        return acc;
      }, {});

    const evalResult = RankingService.evaluateStageParticipants({
      tenantId: currentTenantId,
      stageId: currentStg.id,
      stageName: currentStageName,
      branchId: branchIdParam || currentStg.branchId,
      branchName: branchNameParam || currentStg.branchName,
      participations: stageParticipations,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter: getParticipantStageQuestions,
      quota: currentStg.qualificationQuota,
      manualOverrides: manualOverridesMap,
      overrideReasons,
      customRuleConfigs: competitionRules
    });

    // P0: Validasi integritas dan pencegahan finalisasi jika ada nilai seri tak terpecahkan
    if (!evalResult.canFinalize) {
      return {
        success: false,
        message: `Finalisasi Babak Ditolak: ${evalResult.blockingReason || 'Terdapat kondisi kompetisi yang belum memenuhi syarat pengesahan.'}`
      };
    }

    const scoreMap: Record<string, { score: number; rank: number; tieBreakResolvedBy?: string }> = {};
    evalResult.evaluatedParticipants.forEach((item) => {
      scoreMap[item.participant.id] = {
        score: item.displayScore || 0,
        rank: item.rank,
        tieBreakResolvedBy: item.tieBreakResolvedBy
      };
    });

    // Buat snapshot permanen hasil babak
    const stageSnapshot = RankingService.createStageResultSnapshot({
      tenantId: currentTenantId,
      stageId: currentStg.id,
      stageName: currentStageName,
      branchName: currentStg.branchName || 'Cabang Terpadu',
      quota: currentStg.qualificationQuota,
      finalizedBy: `${currentUser.name} (${currentUser.role})`,
      evaluatedParticipants: evalResult.evaluatedParticipants,
      customRuleConfigs: competitionRules
    });
    setStageSnapshots((prev) => [...prev.filter((s) => s.id !== stageSnapshot.id), stageSnapshot]);

    const nowTime = getWibTime();
    const quota = currentStg.qualificationQuota;

    if (isFinalChampionship) {
      // FINAL STAGE CHAMPIONSHIP FINALIZATION FLOW
      // 1. Mark current stage as finalized and completed
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

      // 2. Update stageParticipations with permanent snapshot
      setStageParticipations((prev) =>
        prev.map((sp) => {
          if (sp.tenantId === currentTenantId && sp.stageName === currentStageName) {
            const data = scoreMap[sp.participantId] || { score: 0, rank: 99 };
            const isWinner = qualifiedParticipantIds.includes(sp.participantId);
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

      // 3. Update participants records with permanent championship history
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.tenantId === currentTenantId && scoreMap[p.id]) {
            const data = scoreMap[p.id];
            const isWinner = qualifiedParticipantIds.includes(p.id);
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

      // 4. Audit Log Entry
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

      return {
        success: true,
        message: `Hasil kejuaraan Babak ${currentStageName} berhasil disahkan secara resmi dan musabaqah dinyatakan selesai.`
      };
    }

    // STANDARD ADVANCEMENT TO NEXT STAGE
    // VALIDATION: Prevent duplicate advancement if participants already exist in nextStage
    const alreadyAdvanced = stageParticipations.some(
      (sp) =>
        sp.tenantId === currentTenantId &&
        sp.stageName === nextStageName &&
        qualifiedParticipantIds.includes(sp.participantId)
    );
    if (alreadyAdvanced) {
      return {
        success: false,
        message: `Sebagian peserta yang dipilih sudah terdaftar di Babak ${nextStageName}.`
      };
    }

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

    // 2. Update existing stageParticipations for current stage and create new ones for nextStage
    const newParticipations: StageParticipation[] = [];

    setStageParticipations((prev) => {
      const updated = prev.map((sp) => {
        if (sp.tenantId === currentTenantId && sp.stageName === currentStageName) {
          const isQual = qualifiedParticipantIds.includes(sp.participantId);
          const data = scoreMap[sp.participantId] || { score: 0, rank: 99 };
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

      // Generate new distinct StageParticipation records for next stage with EMPTY questions
      qualifiedParticipantIds.forEach((pId) => {
        const part = participants.find((p) => p.id === pId && p.tenantId === currentTenantId);
        if (part && nextStg) {
          newParticipations.push({
            id: `sp-${part.id}-${nextStg.id}-${Date.now()}`,
            tenantId: currentTenantId,
            participantId: part.id,
            stageId: nextStg.id,
            stageName: nextStg.name,
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

    // 3. Update participants records: carry forward identity, update stageName and stageHistory, reset questions for new stage
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.tenantId === currentTenantId) {
          const data = scoreMap[p.id];
          if (qualifiedParticipantIds.includes(p.id)) {
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
          } else if (stageParts.some((item) => item.participantId === p.id)) {
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
      summary: `Finalisasi Babak ${currentStageName} dan pelolosan resmi ${qualifiedParticipantIds.length} peserta ke Babak ${nextStageName}.`,
      reason:
        Object.keys(overrideReasons || {}).length > 0
          ? JSON.stringify(overrideReasons)
          : undefined,
      outcome: 'Success'
    };
    setAuditLogs((prev) => [newAudit, ...prev.filter((l) => l.id !== newAudit.id)]);

    return {
      success: true,
      message: `Berhasil memfinalisasi Babak ${currentStageName} dan meloloskan ${qualifiedParticipantIds.length} peserta ke Babak ${nextStageName}.`
    };
  };

  // Judge Assignment Actions (Tenant Scoped)
  const addJudgeAssignment = (asg: Omit<JudgeAssignment, 'id' | 'tenantId'>) => {
    const newAsg: JudgeAssignment = {
      ...asg,
      id: 'asg-' + Date.now(),
      tenantId: currentTenantId
    };
    setJudgeAssignments((prev) => [...prev, newAsg]);
  };

  const removeJudgeAssignment = (id: string) => {
    setJudgeAssignments((prev) =>
      prev.filter((ja) => ja.id !== id || ja.tenantId !== currentTenantId)
    );
  };

  return (
    <MtqContext.Provider
      value={{
        tenants,
        currentTenant,
        setTenantId: setCurrentTenantId,
        addTenant,
        updateTenant,
        users,
        currentUser,
        setCurrentUserId,
        addUser,
        updateUser,
        toggleUserStatus,
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
        addCompetitionRule,
        updateCompetitionRule,
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
        advanceQualifiers,
        addJudgeAssignment,
        removeJudgeAssignment,
        isSuperadminWorkspaceMode,
        enterTenantWorkspace,
        exitTenantWorkspace,
        isDemoAccountModalOpen,
        setIsDemoAccountModalOpen,
        resetPrototypeData
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
