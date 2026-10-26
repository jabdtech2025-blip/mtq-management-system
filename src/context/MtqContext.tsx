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
  AssignedMaqraItem
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
  ) => void;
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

  // Master Data & Config (Tenant Scoped)
  addKafilah: (kafilah: Omit<Kafilah, 'id' | 'tenantId'>) => void;
  updateKafilah: (id: string, updated: Partial<Kafilah>) => void;
  addParticipant: (part: Omit<Participant, 'id' | 'tenantId'>) => void;
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
  ) => void;
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
    currentStageName: string,
    nextStageName: string,
    qualifiedParticipantIds: string[],
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
      return saved ? JSON.parse(saved) : INITIAL_STAGE_PARTICIPATIONS;
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
      return saved ? JSON.parse(saved) : INITIAL_ASSESSMENTS;
    } catch {
      return INITIAL_ASSESSMENTS;
    }
  });

  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'logs');
      return saved ? JSON.parse(saved) : INITIAL_ACTIVITY_LOGS;
    } catch {
      return INITIAL_ACTIVITY_LOGS;
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + 'audit_logs');
      return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
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
   * Helper to retrieve assessment matching participant, judge, stage, and questionId
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
      if (a.stageName && targetStage && a.stageName !== targetStage) return false;
      if (questionId) {
        if (a.questionId && a.questionId !== questionId) return false;
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
   * Derive overall participant status for a stage based on required judge assignments
   */
  const getParticipantProgress = (
    participantId: string,
    stageName?: string
  ): ParticipantProgressStatus => {
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return 'Belum Dimulai';
    const targetStage = stageName || part.stageName || selectedStageName;

    const sp = stageParticipations.find(
      (item) =>
        item.tenantId === currentTenantId &&
        item.participantId === participantId &&
        item.stageName === targetStage
    );

    // Find required judge assignments in current tenant for this stage and branch
    const requiredAssignments = judgeAssignments.filter(
      (ja) =>
        ja.tenantId === currentTenantId &&
        ja.stageName === targetStage &&
        ja.branchName === part.branchName
    );

    const requiredJudgeIds = requiredAssignments.map((ja) => ja.judgeId);

    // If no judge assigned yet, return Belum Dimulai
    if (requiredJudgeIds.length === 0) {
      return sp?.status || 'Belum Dimulai';
    }

    // Find assessments belonging to this stage participation or participant's stage
    const partAssessments = assessments.filter((a) => {
      if (a.tenantId !== currentTenantId) return false;
      if (sp && a.stageParticipationId) {
        return a.stageParticipationId === sp.id;
      }
      return a.participantId === participantId && (!a.stageName || a.stageName === targetStage);
    });

    const finalizedCount = requiredJudgeIds.filter((jId) =>
      partAssessments.some((a) => a.judgeId === jId && a.status === 'finalized')
    ).length;

    const inProgressCount = requiredJudgeIds.filter((jId) =>
      partAssessments.some((a) => a.judgeId === jId && a.status === 'in_progress')
    ).length;

    if (finalizedCount === requiredJudgeIds.length && requiredJudgeIds.length > 0) {
      return 'Lengkap';
    }
    if (finalizedCount > 0) {
      return 'Menunggu Hakim Lain';
    }
    if (inProgressCount > 0) {
      return 'Berlangsung';
    }
    return 'Belum Dimulai';
  };

  /**
   * Update error count with centralized calculation helper and strict read-only lock for finalized
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
    const targetQuestionId = questionId || part.questionId;

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
        (!a.stageName || a.stageName === targetStage) &&
        (!targetQuestionId || !a.questionId || a.questionId === targetQuestionId)
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

    const { deductions, totalDeductions, finalScore } = calculateScore(
      currentCounts,
      errorCategories,
      100.0
    );

    const updatedAssessment: JudgeAssessment = existing
      ? {
          ...existing,
          stageParticipationId: sp.id,
          stageId,
          stageName: targetStage,
          questionId: targetQuestionId || existing.questionId,
          errorCounts: currentCounts,
          deductions,
          totalDeductions,
          finalScore,
          status: 'in_progress',
          lastUpdated: nowTime
        }
      : {
          id: `asm-${participantId}-${judgeId}-${Date.now()}`,
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
          deductions,
          totalDeductions,
          finalScore,
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
        id: 'act-' + Date.now(),
        tenantId: currentTenantId,
        type: 'autosave',
        title: 'Koreksi Nilai',
        description: `Koreksi kesalahan ${cat.name} (${sign}) peserta ${part.participantId} ${part.name} oleh ${targetJudge.name}.`,
        timestamp: nowTime,
        actorName: targetJudge.name
      };
      setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);
    }

    setSyncStatus('Tersimpan di browser');
    setLastSyncTime(nowTime);
  };

  /**
   * Save annotations independently without needing error counts first
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
    const targetQuestionId = questionId || part.questionId;

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
        (!a.stageName || a.stageName === targetStage) &&
        (!targetQuestionId || !a.questionId || a.questionId === targetQuestionId)
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
        id: `asm-${participantId}-${judgeId}-${Date.now()}`,
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
   * Finalize individual judge assessment
   */
  const finalizeAssessment = (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ) => {
    // Role check: Admin cannot finalize on behalf of judge
    if (currentUser.role !== 'judge') {
      console.warn('Mode Pemantauan Admin: Hanya dewan hakim yang dapat mengunci dan memfinalisasi nilai.');
      return;
    }

    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!part) return;
    const targetStage = stageName || part.stageName || selectedStageName;
    const targetQuestionId = questionId || part.questionId;
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

    const existing = assessments.find(
      (a) =>
        a.tenantId === currentTenantId &&
        a.judgeId === judgeId &&
        a.participantId === participantId &&
        (!a.stageName || a.stageName === targetStage) &&
        (!targetQuestionId || !a.questionId || a.questionId === targetQuestionId)
    );

    const finalizedScore = existing ? existing.finalScore : 100.0;

    if (existing) {
      setAssessments((prev) =>
        prev.map((a) =>
          a.id === existing.id
            ? { ...a, status: 'finalized', finalizedAt: nowTime, lastUpdated: nowTime }
            : a
        )
      );
    } else {
      const newAsm: JudgeAssessment = {
        id: `asm-${participantId}-${judgeId}-${Date.now()}`,
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
        errorCounts: {},
        deductions: {},
        totalDeductions: 0,
        finalScore: 100.0,
        annotations: [],
        lastUpdated: nowTime,
        finalizedAt: nowTime
      };
      setAssessments((prev) => [...prev, newAsm]);
    }

    // Check required judges in this stage and branch
    const requiredJudges = judgeAssignments.filter(
      (ja) =>
        ja.tenantId === currentTenantId &&
        ja.stageName === targetStage &&
        ja.branchName === part.branchName
    );
    const requiredJudgeIds = requiredJudges.map((ja) => ja.judgeId);

    // Compute updated completion
    const allFinalized =
      requiredJudgeIds.length > 0 &&
      requiredJudgeIds.every(
        (jId) =>
          jId === judgeId ||
          assessments.some(
            (a) =>
              a.tenantId === currentTenantId &&
              a.judgeId === jId &&
              a.participantId === participantId &&
              a.stageName === targetStage &&
              a.status === 'finalized'
          )
      );

    // Update StageParticipation state
    setStageParticipations((prev) => {
      const existsInList = prev.some((item) => item.id === sp!.id);
      const updatedStatus: ParticipantProgressStatus = allFinalized
        ? 'Lengkap'
        : 'Menunggu Hakim Lain';

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

    if (allFinalized) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId && p.tenantId === currentTenantId
            ? { ...p, status: 'Final' }
            : p
        )
      );
    }

    // Activity Log
    const newLog: ActivityLogItem = {
      id: 'act-' + Date.now(),
      tenantId: currentTenantId,
      type: 'finalized',
      title: 'Penilaian Hakim Terkunci',
      description: `Penilaian peserta ${part.participantId} ${part.name} berhasil dikunci oleh ${targetJudge.name} (Skor: ${finalizedScore.toFixed(2)}).`,
      timestamp: nowTime,
      actorName: targetJudge.name
    };
    setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);

    setSyncStatus('Tersimpan di browser');
    setLastSyncTime(nowTime);
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
  const addParticipant = (data: Omit<Participant, 'id' | 'tenantId'>) => {
    const newPartId = 'part-' + Date.now();
    const targetStage = data.stageName || 'Penyisihan';
    const targetStageObj = stages.find(
      (s) => s.tenantId === currentTenantId && s.name === targetStage
    );
    const stageId = targetStageObj?.id || 'stage-penyisihan';

    const newPart: Participant = {
      ...data,
      id: newPartId,
      tenantId: currentTenantId,
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
      questionId: data.questionId,
      assignedMaqra: data.assignedMaqra,
      pageNumber: data.pageNumber,
      status: 'Belum Dimulai'
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
  ) => {
    const q = questions.find((item) => item.id === questionId && item.tenantId === currentTenantId);
    const part = participants.find((p) => p.id === participantId && p.tenantId === currentTenantId);
    if (!q || !part) return;

    const targetStage = stageName || part.stageName || selectedStageName;
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
          const currentList = p.assignedQuestions || (p.questionId ? [{
            questionId: p.questionId,
            title: p.assignedMaqra || 'Maqra Perlombaan',
            pageNumber: p.pageNumber || 305,
            stageName: p.stageName
          }] : []);

          if (currentList.some((item) => item.questionId === q.id)) {
            return p;
          }

          const updatedList = [...currentList, newMaqraItem];
          const updatedQIds = Array.from(new Set([...(p.questionIds || []), q.id]));

          return {
            ...p,
            questionId: q.id,
            assignedMaqra: assignedLabel,
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
            const currentList = sp.assignedQuestions || [{
              questionId: sp.questionId,
              title: sp.assignedMaqra || 'Maqra Perlombaan',
              pageNumber: sp.pageNumber || 305,
              stageName: sp.stageName
            }];
            if (currentList.some((item) => item.questionId === q.id)) return sp;
            return {
              ...sp,
              questionId: q.id,
              assignedMaqra: assignedLabel,
              pageNumber: q.pageNumber,
              assignedQuestions: [...currentList, newMaqraItem]
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
      id: 'act-' + Date.now(),
      tenantId: currentTenantId,
      type: 'config',
      title: 'Penetapan Maqra',
      description: `Penetapan ${q.title} untuk peserta ${part.participantId} ${part.name} pada Babak ${targetStage}.`,
      timestamp: getWibTime(),
      actorName: currentUser.name
    };
    setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);
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
            assignedQuestions: remaining
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
  ) => {
    if (!results || results.length === 0) {
      return { success: false, message: 'Tidak ada hasil undian untuk ditetapkan.' };
    }

    results.forEach((r) => {
      r.questionIds.forEach((qId) => {
        addQuestionToParticipant(r.participantId, qId, stageName);
      });
    });

    const newLog: ActivityLogItem = {
      id: 'act-' + Date.now(),
      tenantId: currentTenantId,
      type: 'config',
      title: 'Penetapan Hasil Undian',
      description: `Penetapan hasil undian maqra untuk ${results.length} peserta pada Babak ${stageName}.`,
      timestamp: getWibTime(),
      actorName: currentUser.name
    };
    setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);

    return {
      success: true,
      message: `Berhasil menetapkan maqra untuk ${results.length} peserta.`
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
   */
  const advanceQualifiers = (
    currentStageName: string,
    nextStageName: string,
    qualifiedParticipantIds: string[],
    overrideReasons?: Record<string, string>
  ): { success: boolean; message: string } => {
    const currentStg = stages.find(
      (s) => s.tenantId === currentTenantId && s.name === currentStageName
    );
    const nextStg = stages.find(
      (s) => s.tenantId === currentTenantId && s.name === nextStageName
    );

    if (!currentStg) {
      return {
        success: false,
        message: `Babak "${currentStageName}" tidak ditemukan pada tenant ini.`
      };
    }
    if (!nextStg) {
      return {
        success: false,
        message: `Babak lanjutan "${nextStageName}" tidak ditemukan pada tenant ini.`
      };
    }
    if (currentStg.isFinalized) {
      return {
        success: false,
        message: `Babak "${currentStageName}" sudah pernah difinalisasi sebelumnya.`
      };
    }

    // Find participations for currentStage in currentTenant
    const stageParts = stageParticipations.filter(
      (sp) => sp.tenantId === currentTenantId && sp.stageName === currentStageName
    );

    if (stageParts.length === 0) {
      return {
        success: false,
        message: `Tidak ada peserta aktif di Babak ${currentStageName}.`
      };
    }

    // VALIDATION: All participants in current stage must have all required judge assessments finalized!
    const incompleteParts = stageParts.filter((sp) => {
      const progress = getParticipantProgress(sp.participantId, currentStageName);
      return progress !== 'Lengkap';
    });

    if (incompleteParts.length > 0) {
      return {
        success: false,
        message: `Finalisasi belum dapat dilakukan. Masih terdapat ${incompleteParts.length} peserta dengan penilaian dewan hakim yang belum lengkap.`
      };
    }

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

    const nowTime = getWibTime();
    const quota = currentStg.qualificationQuota;

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
        if (s.id === nextStg.id && s.tenantId === currentTenantId) {
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
          const reason =
            overrideReasons?.[sp.participantId] ||
            (isQual ? `Lolos kuota Top ${quota}` : 'Tidak memenuhi kuota kelulusan');
          return {
            ...sp,
            isQualified: isQual,
            qualificationReason: reason
          };
        }
        return sp;
      });

      // Generate new distinct StageParticipation records for next stage
      qualifiedParticipantIds.forEach((pId) => {
        const part = participants.find((p) => p.id === pId && p.tenantId === currentTenantId);
        if (part) {
          newParticipations.push({
            id: `sp-${part.id}-${nextStg.id}-${Date.now()}`,
            tenantId: currentTenantId,
            participantId: part.id,
            stageId: nextStg.id,
            stageName: nextStg.name,
            branchName: part.branchName,
            lotteryNumber: part.lotteryNumber,
            questionId: '',
            assignedMaqra: 'Belum ditetapkan untuk Babak ' + nextStg.name,
            pageNumber: 1,
            status: 'Belum Dimulai'
          });
        }
      });

      return [...updated, ...newParticipations];
    });

    // 3. Update participants records: carry forward identity, update stageName and stageHistory
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.tenantId === currentTenantId) {
          if (qualifiedParticipantIds.includes(p.id)) {
            const sp = stageParts.find((item) => item.participantId === p.id);
            const historyEntry = {
              stageId: currentStg.id,
              stageName: currentStageName,
              status: 'Lolos ke ' + nextStageName,
              score: sp?.finalScore || sp?.provisionalScore,
              qualified: true,
              reason: overrideReasons?.[p.id]
            };
            return {
              ...p,
              stageName: nextStageName,
              status: 'Menunggu',
              stageHistory: [...(p.stageHistory || []), historyEntry],
              questionId: '',
              assignedMaqra: 'Belum ditetapkan untuk Babak ' + nextStageName
            };
          } else if (stageParts.some((item) => item.participantId === p.id)) {
            const sp = stageParts.find((item) => item.participantId === p.id);
            const historyEntry = {
              stageId: currentStg.id,
              stageName: currentStageName,
              status: 'Gugur di ' + currentStageName,
              score: sp?.finalScore || sp?.provisionalScore,
              qualified: false,
              reason: overrideReasons?.[p.id]
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
      id: 'aud-' + Date.now(),
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
    setAuditLogs((prev) => [newAudit, ...prev]);

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
        getJudgeAssessment,
        getParticipantProgress,
        getStageParticipation,
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
