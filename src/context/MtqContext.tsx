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
  CanvasStroke
} from '../types/mtq';
import {
  INITIAL_TENANTS,
  INITIAL_USERS,
  INITIAL_KAFILAHS,
  INITIAL_QUESTIONS,
  INITIAL_ERROR_CATEGORIES,
  INITIAL_PARTICIPANTS,
  INITIAL_ASSESSMENTS,
  INITIAL_ACTIVITY_LOGS
} from '../data/mockData';

export type ViewType =
  | 'dashboard'
  | 'kafilah'
  | 'bank_soal'
  | 'master_data'
  | 'penilaian_hakim'
  | 'rekap_nilai'
  | 'penilaian_dual_panel';

interface MtqContextType {
  tenants: Tenant[];
  currentTenant: Tenant;
  setTenantId: (id: string) => void;
  users: User[];
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  kafilahs: Kafilah[];
  participants: Participant[];
  questions: Question[];
  errorCategories: ErrorCategory[];
  assessments: JudgeAssessment[];
  activityLogs: ActivityLogItem[];
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  selectedParticipantId: string;
  setSelectedParticipantId: (id: string) => void;
  syncStatus: string;
  lastSyncTime: string;
  updateErrorCount: (participantId: string, judgeId: string, categoryId: string, delta: number) => void;
  saveAnnotations: (participantId: string, judgeId: string, annotations: CanvasStroke[]) => void;
  finalizeAssessment: (participantId: string, judgeId: string) => void;
  addKafilah: (kafilah: Omit<Kafilah, 'id' | 'tenantId'>) => void;
  updateKafilah: (id: string, updated: Partial<Kafilah>) => void;
  addParticipant: (part: Omit<Participant, 'id' | 'tenantId'>) => void;
  updateParticipant: (id: string, updated: Partial<Participant>) => void;
  addQuestion: (q: Omit<Question, 'id' | 'tenantId'>) => void;
  updateCategoryDeduction: (categoryId: string, deduction: number) => void;
}

const MtqContext = createContext<MtqContextType | undefined>(undefined);

const STORAGE_PREFIX = 'mtq_platform_data_v1_';

export const MtqProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants] = useState<Tenant[]>(INITIAL_TENANTS);
  const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_PREFIX + 'tenant_id') || 'tenant-jabar';
  });

  const [users] = useState<User[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_PREFIX + 'user_id') || 'user-admin-rh';
  });

  const [kafilahs, setKafilahs] = useState<Kafilah[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'kafilahs');
    return saved ? JSON.parse(saved) : INITIAL_KAFILAHS;
  });

  const [participants, setParticipants] = useState<Participant[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'participants');
    return saved ? JSON.parse(saved) : INITIAL_PARTICIPANTS;
  });

  const [questions, setQuestions] = useState<Question[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'questions');
    return saved ? JSON.parse(saved) : INITIAL_QUESTIONS;
  });

  const [errorCategories, setErrorCategories] = useState<ErrorCategory[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'categories');
    return saved ? JSON.parse(saved) : INITIAL_ERROR_CATEGORIES;
  });

  const [assessments, setAssessments] = useState<JudgeAssessment[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'assessments');
    return saved ? JSON.parse(saved) : INITIAL_ASSESSMENTS;
  });

  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'logs');
    return saved ? JSON.parse(saved) : INITIAL_ACTIVITY_LOGS;
  });

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('part-04');
  const [syncStatus, setSyncStatus] = useState<string>('Tersinkronisasi');
  const [lastSyncTime, setLastSyncTime] = useState<string>('13:14:18 WIB');

  // Save to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'tenant_id', currentTenantId);
  }, [currentTenantId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'user_id', currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'kafilahs', JSON.stringify(kafilahs));
  }, [kafilahs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'participants', JSON.stringify(participants));
  }, [participants]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'questions', JSON.stringify(questions));
  }, [questions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'categories', JSON.stringify(errorCategories));
  }, [errorCategories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'assessments', JSON.stringify(assessments));
  }, [assessments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + 'logs', JSON.stringify(activityLogs));
  }, [activityLogs]);

  const currentTenant = tenants.find((t) => t.id === currentTenantId) || tenants[0];
  const currentUser = users.find((u) => u.id === currentUserId) || users[0];

  const updateErrorCount = (
    participantId: string,
    judgeId: string,
    categoryId: string,
    delta: number
  ) => {
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    setSyncStatus('Menyimpan...');

    setAssessments((prev) => {
      const existing = prev.find(
        (a) => a.participantId === participantId && a.judgeId === judgeId
      );

      const targetJudge = users.find((u) => u.id === judgeId) || currentUser;

      const currentCounts = existing ? { ...existing.errorCounts } : {};
      const oldCount = currentCounts[categoryId] || 0;
      const newCount = Math.max(0, oldCount + delta);
      currentCounts[categoryId] = newCount;

      // Calculate deductions based on current errorCategories
      const currentDeductions: Record<string, number> = {};
      let totalDeductions = 0;

      errorCategories.forEach((cat) => {
        const count = currentCounts[cat.id] || 0;
        const pts = count * cat.defaultDeduction;
        currentDeductions[cat.id] = pts;
        totalDeductions += pts;
      });

      // Base 100 deduction:
      const finalScore = Math.max(0, 100 - totalDeductions);

      const updatedAssessment: JudgeAssessment = existing
        ? {
            ...existing,
            errorCounts: currentCounts,
            deductions: currentDeductions,
            totalDeductions,
            finalScore,
            status: existing.status === 'finalized' ? 'finalized' : 'in_progress',
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
            deductions: currentDeductions,
            totalDeductions,
            finalScore,
            annotations: [],
            lastUpdated: nowTime
          };

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

    // Add activity log
    const cat = errorCategories.find((c) => c.id === categoryId);
    const part = participants.find((p) => p.id === participantId);
    if (cat && part && delta !== 0) {
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      const newLog: ActivityLogItem = {
        id: 'act-' + Date.now(),
        tenantId: currentTenantId,
        type: 'autosave',
        title: 'Simpan Otomatis (Autosave)',
        description: `Pembaruan jumlah kesalahan kategori ${cat.name} (${sign}) untuk peserta ${part.participantId} ${part.name}.`,
        timestamp: nowTime
      };
      setActivityLogs((prev) => [newLog, ...prev.slice(0, 15)]);
    }

    setTimeout(() => {
      setSyncStatus('Tersinkronisasi');
      setLastSyncTime(nowTime);
    }, 400);
  };

  const saveAnnotations = (participantId: string, judgeId: string, annotations: CanvasStroke[]) => {
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    setSyncStatus('Menyimpan anotasi...');

    setAssessments((prev) =>
      prev.map((a) => {
        if (a.participantId === participantId && a.judgeId === judgeId) {
          return { ...a, annotations, lastUpdated: nowTime };
        }
        return a;
      })
    );

    setTimeout(() => {
      setSyncStatus('Tersinkronisasi');
      setLastSyncTime(nowTime);
    }, 400);
  };

  const finalizeAssessment = (participantId: string, judgeId: string) => {
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
    setSyncStatus('Mengunci nilai...');

    setAssessments((prev) =>
      prev.map((a) => {
        if (a.participantId === participantId && a.judgeId === judgeId) {
          return {
            ...a,
            status: 'finalized',
            finalizedAt: nowTime,
            lastUpdated: nowTime
          };
        }
        return a;
      })
    );

    // Check if participant is now final
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === participantId) {
          return { ...p, status: 'Final' };
        }
        return p;
      })
    );

    const part = participants.find((p) => p.id === participantId);
    const judge = users.find((u) => u.id === judgeId) || currentUser;
    if (part) {
      const newLog: ActivityLogItem = {
        id: 'act-' + Date.now(),
        tenantId: currentTenantId,
        type: 'finalized',
        title: 'Penilaian Final Dikunci',
        description: `Penilaian peserta ${part.participantId} ${part.name} berhasil difinalisasi oleh ${judge.name}.`,
        timestamp: nowTime
      };
      setActivityLogs((prev) => [newLog, ...prev.slice(0, 15)]);
    }

    setTimeout(() => {
      setSyncStatus('Tersinkronisasi');
      setLastSyncTime(nowTime);
    }, 500);
  };

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

  const addParticipant = (data: Omit<Participant, 'id' | 'tenantId'>) => {
    const newPart: Participant = {
      ...data,
      id: 'part-' + Date.now(),
      tenantId: currentTenantId
    };
    setParticipants((prev) => [...prev, newPart]);
    // update kafilah count
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

  const addQuestion = (data: Omit<Question, 'id' | 'tenantId'>) => {
    const newQ: Question = {
      ...data,
      id: 'mq-' + Date.now(),
      tenantId: currentTenantId
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const updateCategoryDeduction = (categoryId: string, deduction: number) => {
    setErrorCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId ? { ...c, defaultDeduction: deduction } : c
      )
    );
  };

  return (
    <MtqContext.Provider
      value={{
        tenants,
        currentTenant,
        setTenantId: setCurrentTenantId,
        users,
        currentUser,
        setCurrentUserId,
        kafilahs: kafilahs.filter((k) => k.tenantId === currentTenantId),
        participants: participants.filter((p) => p.tenantId === currentTenantId),
        questions: questions.filter((q) => q.tenantId === currentTenantId),
        errorCategories: errorCategories.filter((c) => c.tenantId === currentTenantId),
        assessments: assessments.filter((a) => a.tenantId === currentTenantId),
        activityLogs: activityLogs.filter((l) => l.tenantId === currentTenantId),
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
        addKafilah,
        updateKafilah,
        addParticipant,
        updateParticipant,
        addQuestion,
        updateCategoryDeduction
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
