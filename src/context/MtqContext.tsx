import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Tenant,
  User,
  Kafilah,
  Participant,
  Question,
  ErrorCategory,
  JudgeAssessment,
  ActivityLogItem,
  CanvasStroke,
  CompetitionStage,
  JudgeAssignment,
  AuditLogItem,
  ParticipantProgressStatus
} from '../types/mtq';
import {
  INITIAL_TENANTS,
  INITIAL_USERS,
  INITIAL_KAFILAHS,
  INITIAL_QUESTIONS,
  INITIAL_ERROR_CATEGORIES,
  INITIAL_PARTICIPANTS,
  INITIAL_ASSESSMENTS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_STAGES,
  INITIAL_JUDGE_ASSIGNMENTS,
  INITIAL_AUDIT_LOGS,
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
  questions: Question[];
  errorCategories: ErrorCategory[];
  assessments: JudgeAssessment[];
  activityLogs: ActivityLogItem[];
  auditLogs: AuditLogItem[];
  stages: CompetitionStage[];
  judgeAssignments: JudgeAssignment[];

  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  selectedParticipantId: string;
  setSelectedParticipantId: (id: string) => void;

  syncStatus: string;
  lastSyncTime: string;

  // Assessments & Annotations
  updateErrorCount: (participantId: string, judgeId: string, categoryId: string, delta: number) => void;
  saveAnnotations: (participantId: string, judgeId: string, annotations: CanvasStroke[]) => void;
  finalizeAssessment: (participantId: string, judgeId: string) => void;
  getParticipantProgress: (participantId: string, stageName?: string) => ParticipantProgressStatus;

  // Master Data & Config
  addKafilah: (kafilah: Omit<Kafilah, 'id' | 'tenantId'>) => void;
  updateKafilah: (id: string, updated: Partial<Kafilah>) => void;
  addParticipant: (part: Omit<Participant, 'id' | 'tenantId'>) => void;
  updateParticipant: (id: string, updated: Partial<Participant>) => void;
  addQuestion: (q: Omit<Question, 'id' | 'tenantId'>) => void;
  updateQuestion: (id: string, updated: Partial<Question>) => void;
  assignMaqraToParticipant: (participantId: string, questionId: string) => void;
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
  ) => void;

  // Judge Assignments
  addJudgeAssignment: (asg: Omit<JudgeAssignment, 'id' | 'tenantId'>) => void;
  removeJudgeAssignment: (id: string) => void;

  // Demo Account Modal
  isDemoAccountModalOpen: boolean;
  setIsDemoAccountModalOpen: (open: boolean) => void;
}

const MtqContext = createContext<MtqContextType | undefined>(undefined);

const STORAGE_PREFIX = 'mtq_platform_data_v2_';

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
      return saved ? JSON.parse(saved) : INITIAL_PARTICIPANTS;
    } catch {
      return INITIAL_PARTICIPANTS;
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

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('part-04');
  const [syncStatus, setSyncStatus] = useState<string>('Tersimpan di browser');
  const [lastSyncTime, setLastSyncTime] = useState<string>('13:14:18 WIB');
  const [isDemoAccountModalOpen, setIsDemoAccountModalOpen] = useState<boolean>(false);

  // Local Storage Synchronizations with safety check
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'tenants', JSON.stringify(tenants));
    } catch (e) {
      console.warn('LocalStorage save failed for tenants', e);
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

  const currentTenant = tenants.find((t) => t.id === currentTenantId) || tenants[0];
  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

  // Helper to get formatted current time in WIB
  const getWibTime = () =>
    new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

  /**
   * Derive overall participant status based on required judge assignments
   */
  const getParticipantProgress = (participantId: string, stageName?: string): ParticipantProgressStatus => {
    const part = participants.find((p) => p.id === participantId);
    if (!part) return 'Belum Dimulai';
    const targetStage = stageName || part.stageName;

    // Find required judge assignments for this stage and branch
    const requiredJudges = judgeAssignments.filter(
      (ja) => ja.tenantId === currentTenantId && ja.stageName === targetStage && ja.branchName === part.branchName
    );

    // If no specific assignment found, fallback to all active judges in this tenant
    const judgeIds = requiredJudges.length > 0
      ? requiredJudges.map((j) => j.judgeId)
      : users.filter((u) => u.tenantId === currentTenantId && u.role === 'judge').map((u) => u.id);

    if (judgeIds.length === 0) return 'Belum Dimulai';

    const partAssessments = assessments.filter(
      (a) => a.participantId === participantId && (!a.stageName || a.stageName === targetStage)
    );

    const finalizedCount = judgeIds.filter((jId) =>
      partAssessments.some((a) => a.judgeId === jId && a.status === 'finalized')
    ).length;

    const inProgressCount = judgeIds.filter((jId) =>
      partAssessments.some((a) => a.judgeId === jId && a.status === 'in_progress')
    ).length;

    if (finalizedCount === judgeIds.length) {
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
    delta: number
  ) => {
    const existing = assessments.find(
      (a) => a.participantId === participantId && a.judgeId === judgeId
    );

    if (existing?.status === 'finalized') {
      console.warn('Cannot update finalized assessment');
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
          errorCounts: currentCounts,
          deductions,
          totalDeductions,
          finalScore,
          status: 'in_progress',
          lastUpdated: nowTime
        }
      : {
          id: `asm-${participantId}-${judgeId}`,
          tenantId: currentTenantId,
          participantId,
          judgeId,
          judgeName: targetJudge.name,
          judgeField: targetJudge.judgeField || 'Dewan Hakim',
          status: 'in_progress',
          errorCounts: currentCounts,
          deductions,
          totalDeductions,
          finalScore,
          annotations: [],
          lastUpdated: nowTime
        };

    setAssessments((prev) => {
      const others = prev.filter(
        (a) => !(a.participantId === participantId && a.judgeId === judgeId)
      );
      return [...others, updatedAssessment];
    });

    // Update participant status to Berlangsung if not already final
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === participantId && p.status === 'Menunggu') {
          return { ...p, status: 'Berlangsung' };
        }
        return p;
      })
    );

    // Activity log entry
    const cat = errorCategories.find((c) => c.id === categoryId);
    const part = participants.find((p) => p.id === participantId);
    if (cat && part && delta !== 0) {
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      const newLog: ActivityLogItem = {
        id: 'act-' + Date.now(),
        tenantId: currentTenantId,
        type: 'autosave',
        title: 'Simpan Otomatis',
        description: `Koreksi kesalahan ${cat.name} (${sign}) peserta ${part.participantId} ${part.name} oleh ${targetJudge.name}.`,
        timestamp: nowTime,
        actorName: targetJudge.name
      };
      setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);
    }

    setTimeout(() => {
      setSyncStatus('Tersimpan di browser');
      setLastSyncTime(nowTime);
    }, 250);
  };

  /**
   * Save annotations independently.
   * If assessment does not exist yet, creates initial assessment record!
   */
  const saveAnnotations = (
    participantId: string,
    judgeId: string,
    annotations: CanvasStroke[]
  ) => {
    const existing = assessments.find(
      (a) => a.participantId === participantId && a.judgeId === judgeId
    );

    if (existing?.status === 'finalized') {
      return;
    }

    const nowTime = getWibTime();
    setSyncStatus('Menyimpan anotasi...');

    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;

    setAssessments((prev) => {
      const current = prev.find((a) => a.participantId === participantId && a.judgeId === judgeId);
      if (current) {
        return prev.map((a) =>
          a.participantId === participantId && a.judgeId === judgeId
            ? { ...a, annotations, lastUpdated: nowTime }
            : a
        );
      } else {
        // Initialize fresh assessment for this judge with base score 100
        const newAsm: JudgeAssessment = {
          id: `asm-${participantId}-${judgeId}`,
          tenantId: currentTenantId,
          participantId,
          judgeId,
          judgeName: targetJudge.name,
          judgeField: targetJudge.judgeField || 'Dewan Hakim',
          status: 'in_progress',
          errorCounts: {},
          deductions: {},
          totalDeductions: 0,
          finalScore: 100.0,
          annotations,
          lastUpdated: nowTime
        };
        return [...prev, newAsm];
      }
    });

    setTimeout(() => {
      setSyncStatus('Tersimpan di browser');
      setLastSyncTime(nowTime);
    }, 250);
  };

  /**
   * Finalize individual judge assessment
   */
  const finalizeAssessment = (participantId: string, judgeId: string) => {
    const nowTime = getWibTime();
    setSyncStatus('Mengunci penilaian...');

    const targetJudge = users.find((u) => u.id === judgeId) || currentUser;
    const part = participants.find((p) => p.id === participantId);

    setAssessments((prev) => {
      const existing = prev.find((a) => a.participantId === participantId && a.judgeId === judgeId);
      if (existing) {
        return prev.map((a) =>
          a.participantId === participantId && a.judgeId === judgeId
            ? { ...a, status: 'finalized', finalizedAt: nowTime, lastUpdated: nowTime }
            : a
        );
      } else {
        // Create as finalized with 100 score if was not started
        const newAsm: JudgeAssessment = {
          id: `asm-${participantId}-${judgeId}`,
          tenantId: currentTenantId,
          participantId,
          judgeId,
          judgeName: targetJudge.name,
          judgeField: targetJudge.judgeField || 'Dewan Hakim',
          status: 'finalized',
          errorCounts: {},
          deductions: {},
          totalDeductions: 0,
          finalScore: 100.0,
          annotations: [],
          lastUpdated: nowTime,
          finalizedAt: nowTime
        };
        return [...prev, newAsm];
      }
    });

    // Determine whether all required judges are now finalized
    const targetStage = part?.stageName || 'Penyisihan';
    const requiredJudges = judgeAssignments.filter(
      (ja) => ja.tenantId === currentTenantId && ja.stageName === targetStage && (!part || ja.branchName === part.branchName)
    );
    const judgeIds = requiredJudges.length > 0
      ? requiredJudges.map((j) => j.judgeId)
      : users.filter((u) => u.tenantId === currentTenantId && u.role === 'judge').map((u) => u.id);

    // Compute updated completion
    setTimeout(() => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === participantId) {
            const allFinalized = judgeIds.every((jId) =>
              jId === judgeId || assessments.some((a) => a.participantId === participantId && a.judgeId === jId && a.status === 'finalized')
            );
            return {
              ...p,
              status: allFinalized ? 'Final' : 'Berlangsung'
            };
          }
          return p;
        })
      );
    }, 100);

    if (part) {
      const newLog: ActivityLogItem = {
        id: 'act-' + Date.now(),
        tenantId: currentTenantId,
        type: 'finalized',
        title: 'Penilaian Hakim Difinalisasi',
        description: `Penilaian untuk peserta ${part.participantId} ${part.name} berhasil difinalisasi oleh ${targetJudge.name}.`,
        timestamp: nowTime,
        actorName: targetJudge.name
      };
      setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);
    }

    setTimeout(() => {
      setSyncStatus('Tersimpan di browser');
      setLastSyncTime(nowTime);
    }, 400);
  };

  // Kafilah Actions
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
      prev.map((k) => (k.id === id ? { ...k, ...updated } : k))
    );
    if (updated.name) {
      setParticipants((prev) =>
        prev.map((p) => (p.kafilahId === id ? { ...p, kafilahName: updated.name! } : p))
      );
    }
  };

  // Participant Actions
  const addParticipant = (data: Omit<Participant, 'id' | 'tenantId'>) => {
    const newPart: Participant = {
      ...data,
      id: 'part-' + Date.now(),
      tenantId: currentTenantId,
      stageHistory: [
        {
          stageName: data.stageName || 'Penyisihan',
          status: 'Menunggu'
        }
      ]
    };
    setParticipants((prev) => [...prev, newPart]);
    setKafilahs((prev) =>
      prev.map((k) =>
        k.id === data.kafilahId
          ? { ...k, participantCount: k.participantCount + 1 }
          : k
      )
    );
  };

  const updateParticipant = (id: string, updated: Partial<Participant>) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
    );
  };

  // Question & Maqra Actions
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
      prev.map((q) => (q.id === id ? { ...q, ...updated } : q))
    );
  };

  const assignMaqraToParticipant = (participantId: string, questionId: string) => {
    const q = questions.find((item) => item.id === questionId);
    if (!q) return;

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === participantId) {
          return {
            ...p,
            questionId: q.id,
            assignedMaqra: `${q.title} (Hal. ${q.pageNumber})`,
            pageNumber: q.pageNumber
          };
        }
        return p;
      })
    );

    setQuestions((prev) =>
      prev.map((item) =>
        item.id === questionId
          ? { ...item, assignedToParticipantId: participantId }
          : item.assignedToParticipantId === participantId
          ? { ...item, assignedToParticipantId: undefined }
          : item
      )
    );

    const part = participants.find((p) => p.id === participantId);
    if (part) {
      const newLog: ActivityLogItem = {
        id: 'act-' + Date.now(),
        tenantId: currentTenantId,
        type: 'config',
        title: 'Penetapan Maqra',
        description: `Penetapan ${q.title} untuk peserta ${part.participantId} ${part.name}.`,
        timestamp: getWibTime(),
        actorName: currentUser.name
      };
      setActivityLogs((prev) => [newLog, ...prev.slice(0, 20)]);
    }
  };

  // Error Categories Actions
  const updateCategoryDeduction = (categoryId: string, deduction: number) => {
    setErrorCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId ? { ...c, defaultDeduction: deduction } : c
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
      prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
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

  // Tenant Management (Superadmin)
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

  // Stage Management & Advancement
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
      prev.map((s) => (s.id === id ? { ...s, ...updated } : s))
    );
  };

  const advanceQualifiers = (
    currentStageName: string,
    nextStageName: string,
    qualifiedParticipantIds: string[],
    overrideReasons?: Record<string, string>
  ) => {
    const nowTime = getWibTime();

    // Mark current stage as finalized
    setStages((prev) =>
      prev.map((s) => {
        if (s.name === currentStageName && s.tenantId === currentTenantId) {
          return { ...s, isFinalized: true, status: 'Selesai' };
        }
        if (s.name === nextStageName && s.tenantId === currentTenantId) {
          return { ...s, status: 'Aktif' };
        }
        return s;
      })
    );

    // Update participant records: advance qualifiers to next round with clean status
    setParticipants((prev) =>
      prev.map((p) => {
        if (qualifiedParticipantIds.includes(p.id)) {
          const reason = overrideReasons?.[p.id];
          const updatedHistory = [
            ...(p.stageHistory || []),
            {
              stageName: currentStageName,
              status: 'Lolos ke ' + nextStageName,
              qualified: true
            }
          ];

          return {
            ...p,
            stageName: nextStageName,
            status: 'Menunggu',
            stageHistory: updatedHistory,
            questionId: '',
            assignedMaqra: 'Belum ditetapkan untuk ' + nextStageName
          };
        } else if (p.stageName === currentStageName) {
          return {
            ...p,
            stageHistory: [
              ...(p.stageHistory || []),
              {
                stageName: currentStageName,
                status: 'Gugur di ' + currentStageName,
                qualified: false
              }
            ]
          };
        }
        return p;
      })
    );

    // Record audit log
    const newAudit: AuditLogItem = {
      id: 'aud-' + Date.now(),
      timestamp: nowTime,
      actor: currentUser.name,
      action: 'STAGE_ADVANCEMENT',
      target: `Babak ${currentStageName} -> ${nextStageName}`,
      tenantName: currentTenant.name,
      summary: `Finalisasi babak ${currentStageName} dan pelolosan ${qualifiedParticipantIds.length} peserta ke ${nextStageName}.`,
      outcome: 'Success'
    };
    setAuditLogs((prev) => [newAudit, ...prev]);
  };

  // Judge Assignment Actions
  const addJudgeAssignment = (asg: Omit<JudgeAssignment, 'id' | 'tenantId'>) => {
    const newAsg: JudgeAssignment = {
      ...asg,
      id: 'asg-' + Date.now(),
      tenantId: currentTenantId
    };
    setJudgeAssignments((prev) => [...prev, newAsg]);
  };

  const removeJudgeAssignment = (id: string) => {
    setJudgeAssignments((prev) => prev.filter((ja) => ja.id !== id));
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
        questions: questions.filter((q) => q.tenantId === currentTenantId),
        errorCategories: errorCategories.filter((c) => c.tenantId === currentTenantId),
        assessments: assessments.filter((a) => a.tenantId === currentTenantId),
        activityLogs: activityLogs.filter((l) => l.tenantId === currentTenantId),
        auditLogs,
        stages: stages.filter((s) => s.tenantId === currentTenantId),
        judgeAssignments: judgeAssignments.filter((ja) => ja.tenantId === currentTenantId),
        currentView,
        setCurrentView,
        isSidebarOpen,
        setIsSidebarOpen,
        toggleSidebar,
        selectedParticipantId,
        setSelectedParticipantId,
        syncStatus,
        lastSyncTime,
        updateErrorCount,
        saveAnnotations,
        finalizeAssessment,
        getParticipantProgress,
        addKafilah,
        updateKafilah,
        addParticipant,
        updateParticipant,
        addQuestion,
        updateQuestion,
        assignMaqraToParticipant,
        updateCategoryDeduction,
        addErrorCategory,
        updateErrorCategory,
        addStage,
        updateStage,
        advanceQualifiers,
        addJudgeAssignment,
        removeJudgeAssignment,
        isDemoAccountModalOpen,
        setIsDemoAccountModalOpen
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
