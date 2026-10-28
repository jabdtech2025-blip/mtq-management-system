import {
  supabase,
  isSupabaseConfigured,
  getSupabaseConnectionInfo,
  setRuntimeSupabaseConnectionState,
  SupabaseConnectionInfo
} from '../lib/supabaseClient';
import {
  Tenant,
  User,
  Kafilah,
  Participant,
  StageParticipation,
  Question,
  ErrorCategory,
  JudgeAssessment,
  CompetitionStage,
  JudgeAssignment,
  AuditLogItem,
  GenericMasterItem,
  CompetitionRuleConfig,
  StageResultSnapshot,
  RubricVersion
} from '../types/mtq';
import { isValidUuid, toDeterministicUuid, validateDatabaseUuids } from '../utils/uuid';

export interface RpcServiceResult {
  success: boolean;
  message: string;
  mode: 'supabase_live' | 'local_offline_fallback';
  data?: unknown;
  validationErrors?: string[];
}

export interface AuthenticatedSupabaseProfile {
  authUserId: string;
  email: string;
  name: string;
  username: string;
  globalRole: 'superadmin' | 'admin' | 'judge';
  memberships: Array<{
    tenantId: string;
    role: 'superadmin' | 'admin' | 'judge';
    judgeCategory?: string;
    judgeField?: string;
    status: string;
  }>;
}

export interface HydratedWorkspacePayload {
  tenants?: Tenant[];
  users?: User[];
  cabangList?: GenericMasterItem[];
  jenjangList?: GenericMasterItem[];
  kafilahs?: Kafilah[];
  participants?: Participant[];
  stages?: CompetitionStage[];
  stageParticipations?: StageParticipation[];
  questions?: Question[];
  errorCategories?: ErrorCategory[];
  rubricVersions?: RubricVersion[];
  competitionRules?: CompetitionRuleConfig[];
  judgeAssignments?: JudgeAssignment[];
  assessments?: JudgeAssessment[];
  stageSnapshots?: StageResultSnapshot[];
  auditLogs?: AuditLogItem[];
}

/**
 * Service Data Terpusat untuk Operasi Database Supabase, Validasi UUID, Autentikasi, & RPC.
 * - Tidak pernah menggunakan service_role key di frontend.
 * - Menolak operasi upsert/RPC apabila ID referensi bukan UUID yang valid atau sesi tidak sah.
 * - Melakukan pemeriksaan koneksi nyata terhadap skema tabel di Supabase.
 */
export const supabaseDataService = {
  getConnectionStatus(): SupabaseConnectionInfo {
    return getSupabaseConnectionInfo();
  },

  isLive(): boolean {
    return isSupabaseConfigured() && supabase !== null;
  },

  /**
   * Memastikan bahwa seluruh referensi ID merupakan UUID PostgreSQL yang valid
   * sebelum melakukan operasi jaringan ke Supabase.
   */
  validateReferences(refs: Record<string, string | undefined | null>): {
    valid: boolean;
    message?: string;
    invalidFields: string[];
  } {
    const check = validateDatabaseUuids(refs);
    if (!check.valid) {
      return {
        valid: false,
        invalidFields: check.invalidFields,
        message: `Operasi database dibatalkan: ID referensi belum berupa UUID database yang sah (${check.invalidFields.join(', ')}).`
      };
    }
    return { valid: true, invalidFields: [] };
  },

  /**
   * Melakukan pemeriksaan nyata terhadap koneksi database Supabase, keberadaan skema tabel,
   * dan status sesi autentikasi pengguna saat ini.
   */
  async verifyDatabaseConnection(): Promise<SupabaseConnectionInfo> {
    if (!isSupabaseConfigured() || !supabase) {
      setRuntimeSupabaseConnectionState({
        state: 'unconfigured',
        isDatabaseReady: false,
        isAuthenticated: false,
        lastError: null
      });
      return getSupabaseConnectionInfo();
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const hasSession = Boolean(sessionData?.session?.user?.id);

      // Uji query nyata ke tabel inti `tenants`
      const { error } = await supabase.from('tenants').select('id').limit(1);

      if (error) {
        const msg = (error.message || '').toLowerCase();
        const code = (error.code || '').toUpperCase();
        const isSchemaMissing =
          code === '42P01' ||
          code === 'PGRST205' ||
          msg.includes('does not exist') ||
          msg.includes('could not find the table') ||
          msg.includes('schema cache');

        if (isSchemaMissing) {
          setRuntimeSupabaseConnectionState({
            state: 'schema_missing',
            isDatabaseReady: false,
            isAuthenticated: hasSession,
            lastError: 'Tabel database belum ditemukan. Jalankan supabase/schema.sql pada SQL Editor Supabase Anda.'
          });
          return getSupabaseConnectionInfo();
        }

        setRuntimeSupabaseConnectionState({
          state: 'connection_error',
          isDatabaseReady: false,
          isAuthenticated: hasSession,
          lastError: error.message
        });
        return getSupabaseConnectionInfo();
      }

      setRuntimeSupabaseConnectionState({
        state: hasSession ? 'connected_authenticated' : 'connected_unauthenticated',
        isDatabaseReady: true,
        isAuthenticated: hasSession,
        lastError: null
      });
      return getSupabaseConnectionInfo();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kegagalan jaringan saat menghubungi Supabase.';
      setRuntimeSupabaseConnectionState({
        state: 'connection_error',
        isDatabaseReady: false,
        isAuthenticated: false,
        lastError: message
      });
      return getSupabaseConnectionInfo();
    }
  },

  /**
   * Mengambil profil pengguna yang sedang terautentikasi di Supabase Auth beserta keanggotaan tenant-nya.
   */
  async fetchAuthenticatedUserProfile(): Promise<AuthenticatedSupabaseProfile | null> {
    if (!this.isLive() || !supabase) return null;

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const authUser = sessionData?.session?.user;
    if (sessionErr || !authUser || !isValidUuid(authUser.id)) {
      return null;
    }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('id, username, name, email, role')
      .eq('id', authUser.id)
      .maybeSingle();

    const { data: membershipRows } = await supabase
      .from('tenant_memberships')
      .select('tenant_id, role, judge_category, judge_field, status')
      .eq('profile_id', authUser.id)
      .eq('status', 'Aktif');

    const memberships = (membershipRows || []).map((m: Record<string, unknown>) => ({
      tenantId: String(m.tenant_id || ''),
      role: (m.role as 'superadmin' | 'admin' | 'judge') || 'judge',
      judgeCategory: m.judge_category ? String(m.judge_category) : undefined,
      judgeField: m.judge_field ? String(m.judge_field) : undefined,
      status: String(m.status || 'Aktif')
    }));

    return {
      authUserId: authUser.id,
      email: String(profileRow?.email || authUser.email || ''),
      name: String(
        profileRow?.name ||
          authUser.user_metadata?.name ||
          authUser.email?.split('@')[0] ||
          'Pengguna Terautentikasi'
      ),
      username: String(
        profileRow?.username ||
          authUser.user_metadata?.username ||
          authUser.email?.split('@')[0] ||
          'user'
      ),
      globalRole: ((profileRow?.role as string) || 'judge') as 'superadmin' | 'admin' | 'judge',
      memberships
    };
  },

  async signInWithPassword(email: string, password: string): Promise<{
    success: boolean;
    message: string;
    profile?: AuthenticatedSupabaseProfile | null;
  }> {
    if (!this.isLive() || !supabase) {
      return {
        success: false,
        message: 'Kredensial Supabase (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY) belum dikonfigurasi.'
      };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      return {
        success: false,
        message: `Autentikasi gagal: ${error.message}`
      };
    }

    await this.verifyDatabaseConnection();
    const profile = await this.fetchAuthenticatedUserProfile();
    return {
      success: true,
      message: `Berhasil login sebagai ${profile?.name || email}.`,
      profile
    };
  },

  async signOut(): Promise<void> {
    if (!this.isLive() || !supabase) return;
    await supabase.auth.signOut();
    await this.verifyDatabaseConnection();
  },

  /**
   * Mengambil seluruh data operasional & master untuk tenant aktif dari Supabase.
   */
  async fetchTenantWorkspaceData(rawTenantId: string): Promise<HydratedWorkspacePayload | null> {
    if (!this.isLive() || !supabase) return null;
    const conn = await this.verifyDatabaseConnection();
    if (!conn.isDatabaseReady) return null;

    const tenantUuid = isValidUuid(rawTenantId) ? rawTenantId : toDeterministicUuid(rawTenantId);

    const [
      tenantsRes,
      branchesRes,
      levelsRes,
      kafilahsRes,
      stagesRes,
      questionsRes,
      participantsRes,
      spRes,
      assignedMaqrasRes,
      errorCatsRes,
      rulesRes,
      judgeAsgRes,
      assessmentsRes,
      snapshotsRes,
      auditRes
    ] = await Promise.all([
      supabase.from('tenants').select('*').neq('id', '00000000-0000-0000-0000-000000000000'),
      supabase.from('branches').select('*').eq('tenant_id', tenantUuid),
      supabase.from('levels').select('*').eq('tenant_id', tenantUuid),
      supabase.from('kafilahs').select('*').eq('tenant_id', tenantUuid),
      supabase.from('stages').select('*').eq('tenant_id', tenantUuid).order('stage_order', { ascending: true }),
      supabase.from('questions').select('*').eq('tenant_id', tenantUuid),
      supabase.from('participants').select('*').eq('tenant_id', tenantUuid),
      supabase.from('stage_participations').select('*').eq('tenant_id', tenantUuid),
      supabase.from('assigned_maqras').select('*').eq('tenant_id', tenantUuid),
      supabase.from('error_categories').select('*').eq('tenant_id', tenantUuid).order('sort_order', { ascending: true }),
      supabase.from('competition_rule_configs').select('*').eq('tenant_id', tenantUuid),
      supabase.from('judge_assignments').select('*, profiles(name)').eq('tenant_id', tenantUuid),
      supabase.from('judge_assessments').select('*').eq('tenant_id', tenantUuid),
      supabase.from('stage_result_snapshots').select('*').eq('tenant_id', tenantUuid),
      supabase.from('audit_logs').select('*').eq('tenant_id', tenantUuid).order('created_at', { ascending: false }).limit(50)
    ]);

    const payload: HydratedWorkspacePayload = {};

    if (tenantsRes.data && tenantsRes.data.length > 0) {
      payload.tenants = tenantsRes.data.map((t: Record<string, unknown>) => ({
        id: String(t.id),
        code: String(t.code || ''),
        name: String(t.name || ''),
        eventName: String(t.event_name || ''),
        region: String(t.region || ''),
        edition: String(t.edition || '2025'),
        period: String(t.period || '2025 - 2026'),
        primaryAdminId: '',
        status: (t.status as 'Aktif' | 'Nonaktif') || 'Aktif',
        userCount: 1
      }));
    }

    const branchMap = new Map<string, string>();
    if (branchesRes.data && branchesRes.data.length > 0) {
      payload.cabangList = branchesRes.data.map((b: Record<string, unknown>) => {
        const id = String(b.id);
        const name = String(b.name || '');
        branchMap.set(id, name);
        return {
          id,
          tenantId: String(b.tenant_id),
          code: String(b.code || ''),
          name,
          description: String(b.description || ''),
          status: (b.status as 'Aktif' | 'Nonaktif') || 'Aktif'
        };
      });
    }

    const levelMap = new Map<string, string>();
    if (levelsRes.data && levelsRes.data.length > 0) {
      payload.jenjangList = levelsRes.data.map((l: Record<string, unknown>) => {
        const id = String(l.id);
        const name = String(l.name || '');
        levelMap.set(id, name);
        return {
          id,
          tenantId: String(l.tenant_id),
          code: String(l.code || ''),
          name,
          description: String(l.description || ''),
          status: (l.status as 'Aktif' | 'Nonaktif') || 'Aktif'
        };
      });
    }

    const kafilahMap = new Map<string, string>();
    if (kafilahsRes.data && kafilahsRes.data.length > 0) {
      payload.kafilahs = kafilahsRes.data.map((k: Record<string, unknown>) => {
        const id = String(k.id);
        const name = String(k.name || '');
        kafilahMap.set(id, name);
        return {
          id,
          tenantId: String(k.tenant_id),
          code: String(k.code || ''),
          name,
          region: String(k.region || ''),
          contactPerson: String(k.contact_person || k.leader_name || '-'),
          contactPhone: String(k.contact_phone || '-'),
          participantCount: 0,
          status: (k.status as 'Aktif' | 'Nonaktif') || 'Aktif'
        };
      });
    }

    const stageMap = new Map<string, { name: string; branchId?: string; branchName: string }>();
    if (stagesRes.data && stagesRes.data.length > 0) {
      payload.stages = stagesRes.data.map((s: Record<string, unknown>) => {
        const id = String(s.id);
        const name = String(s.name || '');
        const bId = s.branch_id ? String(s.branch_id) : undefined;
        const bName = (bId && branchMap.get(bId)) || 'Semua Cabang';
        stageMap.set(id, { name, branchId: bId, branchName: bName });
        return {
          id,
          tenantId: String(s.tenant_id),
          name,
          order: Number(s.stage_order || 1),
          branchId: bId,
          branchName: bName,
          status: (s.status as 'Menunggu' | 'Aktif' | 'Selesai') || 'Menunggu',
          qualificationQuota: Number(s.qualification_quota || 3),
          qualificationMethod: (s.qualification_method as 'top_n' | 'manual') || 'top_n',
          isFinalized: Boolean(s.is_finalized),
          finalizedAt: s.finalized_at ? String(s.finalized_at) : undefined
        };
      });
    }

    const questionMap = new Map<string, Question>();
    if (questionsRes.data && questionsRes.data.length > 0) {
      payload.questions = questionsRes.data.map((q: Record<string, unknown>) => {
        const id = String(q.id);
        const bId = q.branch_id ? String(q.branch_id) : undefined;
        const sId = q.stage_id ? String(q.stage_id) : undefined;
        const item: Question = {
          id,
          tenantId: String(q.tenant_id),
          code: String(q.code || ''),
          title: String(q.title || ''),
          surahName: String(q.surah_name || ''),
          surahNumber: Number(q.surah_number || 1),
          startAyah: Number(q.start_ayah || 1),
          endAyah: Number(q.end_ayah || 1),
          pageNumber: Number(q.page_number || 1),
          pageStart: Number(q.page_start || q.page_number || 1),
          pageEnd: Number(q.page_end || q.page_number || 1),
          branchAndLevel: (bId && branchMap.get(bId)) || 'Tilawah Dewasa Putra',
          stageName: (sId && stageMap.get(sId)?.name) || 'Penyisihan',
          status: (q.status as 'Aktif' | 'Nonaktif') || 'Aktif',
          description: q.description ? String(q.description) : undefined
        };
        questionMap.set(id, item);
        return item;
      });
    }

    const assignedMaqraBySp = new Map<string, Array<{ id: string; questionId: string; assignedAt: string }>>();
    const assignedMaqraIdToQuestionId = new Map<string, string>();
    if (assignedMaqrasRes.data) {
      assignedMaqrasRes.data.forEach((am: Record<string, unknown>) => {
        const amId = String(am.id);
        const spId = String(am.stage_participation_id);
        const qId = String(am.question_id);
        assignedMaqraIdToQuestionId.set(amId, qId);
        const list = assignedMaqraBySp.get(spId) || [];
        list.push({ id: amId, questionId: qId, assignedAt: String(am.assigned_at || '') });
        assignedMaqraBySp.set(spId, list);
      });
    }

    if (spRes.data && spRes.data.length > 0) {
      payload.stageParticipations = spRes.data.map((sp: Record<string, unknown>) => {
        const spId = String(sp.id);
        const stgId = String(sp.stage_id);
        const stgInfo = stageMap.get(stgId);
        const maqras = assignedMaqraBySp.get(spId) || [];
        const assignedQuestions = maqras.map((m) => {
          const qObj = questionMap.get(m.questionId);
          return {
            questionId: m.questionId,
            code: qObj?.code,
            title: qObj?.title || 'Maqra',
            surahName: qObj?.surahName,
            surahNumber: qObj?.surahNumber,
            startAyah: qObj?.startAyah,
            endAyah: qObj?.endAyah,
            pageNumber: qObj?.pageNumber || 1,
            pageStart: qObj?.pageStart || 1,
            pageEnd: qObj?.pageEnd || 1,
            assignedAt: m.assignedAt,
            stageName: stgInfo?.name || 'Penyisihan'
          };
        });
        const firstQ = assignedQuestions[0];
        return {
          id: spId,
          tenantId: String(sp.tenant_id),
          participantId: String(sp.participant_id),
          stageId: stgId,
          stageName: stgInfo?.name || 'Penyisihan',
          branchId: stgInfo?.branchId,
          branchName: stgInfo?.branchName || 'Tilawah Dewasa Putra',
          lotteryNumber: String(sp.lottery_number || ''),
          questionId: firstQ ? firstQ.questionId : '',
          assignedMaqra:
            assignedQuestions.length === 0
              ? 'Belum Ditetapkan'
              : assignedQuestions.length === 1
              ? firstQ.title
              : `${assignedQuestions.length} Maqra Ditetapkan`,
          pageNumber: firstQ ? firstQ.pageNumber : 1,
          assignedQuestions,
          status: (sp.status as StageParticipation['status']) || 'Maqra Belum Ditetapkan',
          provisionalScore: sp.provisional_score !== null ? Number(sp.provisional_score) : undefined,
          finalScore: sp.final_score !== null ? Number(sp.final_score) : undefined,
          rank: sp.rank !== null ? Number(sp.rank) : undefined,
          isQualified: Boolean(sp.is_qualified),
          qualificationReason: sp.qualification_reason ? String(sp.qualification_reason) : undefined,
          finalizedAt: sp.finalized_at ? String(sp.finalized_at) : undefined
        };
      });
    }

    if (participantsRes.data && participantsRes.data.length > 0) {
      payload.participants = participantsRes.data.map((p: Record<string, unknown>) => {
        const id = String(p.id);
        const bId = String(p.branch_id || '');
        const kId = String(p.kafilah_id || '');
        const lId = p.level_id ? String(p.level_id) : '';
        const matchingSps = (payload.stageParticipations || []).filter((sp) => sp.participantId === id);
        const latestSp = matchingSps[matchingSps.length - 1];
        return {
          id,
          tenantId: String(p.tenant_id),
          participantId: String(p.participant_code || ''),
          lotteryNumber: String(p.lottery_number || ''),
          name: String(p.name || ''),
          gender: (p.gender as 'Putra' | 'Putri') || 'Putra',
          kafilahId: kId,
          kafilahName: kafilahMap.get(kId) || 'Kafilah',
          branchId: bId,
          branchName: branchMap.get(bId) || 'Tilawah Dewasa Putra',
          levelName: levelMap.get(lId) || 'Ulya',
          stageName: latestSp?.stageName || 'Penyisihan',
          questionId: latestSp?.questionId || '',
          assignedMaqra: latestSp?.assignedMaqra || 'Belum Ditetapkan',
          pageNumber: latestSp?.pageNumber || 1,
          assignedQuestions: latestSp?.assignedQuestions || [],
          questionIds: (latestSp?.assignedQuestions || []).map((q) => q.questionId),
          status:
            p.status === 'Lolos' || p.status === 'Menunggu'
              ? 'Menunggu'
              : p.status === 'Berlangsung'
              ? 'Berlangsung'
              : 'Final'
        };
      });
    }

    if (errorCatsRes.data && errorCatsRes.data.length > 0) {
      payload.errorCategories = errorCatsRes.data.map((c: Record<string, unknown>) => ({
        id: String(c.id),
        tenantId: String(c.tenant_id),
        fieldId: c.rubric_field_id ? String(c.rubric_field_id) : undefined,
        criterionId: c.criterion_id ? String(c.criterion_id) : undefined,
        deductionRuleId: c.deduction_rule_id ? String(c.deduction_rule_id) : undefined,
        code: String(c.code || ''),
        name: String(c.name || ''),
        scope: (c.scope as ErrorCategory['scope']) || 'Tajwid & Makhraj',
        defaultDeduction: Number(c.default_deduction || 0.5),
        maxDeduction: c.max_deduction !== null && c.max_deduction !== undefined ? Number(c.max_deduction) : undefined,
        methodType: (c.method_type as ErrorCategory['methodType']) || 'Pengurangan tetap',
        status: (c.status as 'Aktif' | 'Nonaktif') || 'Aktif',
        order: Number(c.sort_order || 1)
      }));
    }

    if (rulesRes.data && rulesRes.data.length > 0) {
      payload.competitionRules = rulesRes.data.map((r: Record<string, unknown>) => {
        const bId = r.branch_id ? String(r.branch_id) : undefined;
        return {
          id: String(r.id),
          tenantId: String(r.tenant_id),
          branchId: bId,
          branchName: String(r.branch_name || (bId && branchMap.get(bId)) || 'Tilawah Dewasa Putra'),
          rubricVersionId: String(r.rubric_version_id),
          tieBreakOrder: Array.isArray(r.tie_break_order)
            ? (r.tie_break_order as string[])
            : ['total', 'Tajwid', 'Lagu', 'Fashahah'],
          quotaPerStage: (r.quota_per_stage as Record<string, number>) || { Penyisihan: 3, Final: 3 },
          officialSource: r.official_source ? String(r.official_source) : undefined,
          isVerifiedOfficial: Boolean(r.is_verified_official),
          status: (r.status as CompetitionRuleConfig['status']) || 'Aktif'
        };
      });
    }

    if (judgeAsgRes.data && judgeAsgRes.data.length > 0) {
      payload.judgeAssignments = judgeAsgRes.data.map((ja: Record<string, unknown>) => {
        const stgId = String(ja.stage_id);
        const stgInfo = stageMap.get(stgId);
        const bId = ja.branch_id ? String(ja.branch_id) : stgInfo?.branchId;
        const prof = ja.profiles as { name?: string } | null;
        return {
          id: String(ja.id),
          tenantId: String(ja.tenant_id),
          judgeId: String(ja.judge_profile_id),
          judgeName: prof?.name || 'Dewan Hakim',
          stageId: stgId,
          stageName: stgInfo?.name || 'Penyisihan',
          branchId: bId,
          branchName: (bId && branchMap.get(bId)) || stgInfo?.branchName || 'Tilawah Dewasa Putra',
          judgeField: String(ja.judge_field || 'Bidang Penilaian'),
          rubricFieldId: ja.rubric_field_id ? String(ja.rubric_field_id) : undefined
        };
      });
    }

    if (assessmentsRes.data && assessmentsRes.data.length > 0) {
      const spLookup = new Map<string, StageParticipation>();
      (payload.stageParticipations || []).forEach((s) => spLookup.set(s.id, s));

      payload.assessments = assessmentsRes.data.map((a: Record<string, unknown>) => {
        const spId = String(a.stage_participation_id);
        const spObj = spLookup.get(spId);
        const amId = String(a.assigned_maqra_id);
        const resolvedQuestionId = assignedMaqraIdToQuestionId.get(amId) || amId;
        return {
          id: String(a.id),
          tenantId: String(a.tenant_id),
          stageParticipationId: spId,
          stageId: spObj?.stageId || '',
          stageName: spObj?.stageName || 'Penyisihan',
          participantId: spObj?.participantId || '',
          judgeId: String(a.judge_profile_id),
          judgeName: 'Dewan Hakim',
          judgeField: 'Dewan Hakim',
          questionId: resolvedQuestionId,
          status: (a.status as JudgeAssessment['status']) || 'in_progress',
          errorCounts: (a.error_counts as Record<string, number>) || {},
          deductions: {},
          fieldScores: (a.field_scores as Record<string, number>) || {},
          totalDeductions: Number(a.total_deductions || 0),
          finalScore: Number(a.final_score || 100),
          annotations: (a.annotations as JudgeAssessment['annotations']) || [],
          rubricVersionId: String(a.rubric_version_id),
          isLocked: Boolean(a.is_locked),
          reopenedAt: a.reopened_at ? String(a.reopened_at) : undefined,
          reopenedBy: a.reopened_by ? String(a.reopened_by) : undefined,
          reopenReason: a.reopen_reason ? String(a.reopen_reason) : undefined,
          finalizedAt: a.finalized_at ? String(a.finalized_at) : undefined,
          lastUpdated: String(a.updated_at || a.created_at || '')
        };
      });
    }

    if (snapshotsRes.data && snapshotsRes.data.length > 0) {
      payload.stageSnapshots = snapshotsRes.data.map((s: Record<string, unknown>) => {
        const stgId = String(s.stage_id);
        const bId = String(s.branch_id);
        return {
          id: String(s.id),
          tenantId: String(s.tenant_id),
          stageId: stgId,
          stageName: stageMap.get(stgId)?.name || 'Penyisihan',
          branchId: bId,
          branchName: branchMap.get(bId) || 'Tilawah Dewasa Putra',
          quota: Number(s.quota || 3),
          finalizedAt: String(s.created_at || ''),
          finalizedBy: String(s.finalized_by || ''),
          rubricVersionId: String(s.rubric_version_id || ''),
          tieBreakRuleUsed: String(s.tie_break_rule_used || ''),
          rankings: Array.isArray(s.rankings_snapshot)
            ? (s.rankings_snapshot as StageResultSnapshot['rankings'])
            : []
        };
      });
    }

    if (auditRes.data && auditRes.data.length > 0) {
      payload.auditLogs = auditRes.data.map((al: Record<string, unknown>) => ({
        id: String(al.id),
        timestamp: String(al.created_at || ''),
        actor: String(al.actor_name || ''),
        action: String(al.action || ''),
        target: String(al.target || ''),
        tenantName: 'Tenant Aktif',
        summary: String(al.summary || ''),
        reason: al.reason ? String(al.reason) : undefined,
        outcome: ((al.outcome as string) || 'Success') as 'Success' | 'Failed' | 'Warning'
      }));
    }

    return payload;
  },

  /**
   * RPC 1: Finalisasi & Penguncian Lembar Penilaian oleh Hakim Bertugas (Server-Side Atomic Lock).
   */
  async finalizeJudgeAssessmentRpc(assessmentId: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ p_assessment_id: assessmentId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Finalisasi lembar nilai dieksekusi pada penyimpanan lokal.'
      };
    }

    const { data, error } = await supabase.rpc('finalize_judge_assessment', {
      p_assessment_id: assessmentId
    });

    if (error) {
      return {
        success: false,
        mode: 'supabase_live',
        message: error.message || 'Gagal mengeksekusi RPC finalize_judge_assessment.'
      };
    }

    return {
      success: true,
      mode: 'supabase_live',
      message: (data as { message?: string })?.message || 'Lembar penilaian berhasil dikunci melalui RPC.',
      data
    };
  },

  /**
   * RPC 2: Pembukaan Kembali Lembar Penilaian Final oleh Administrator dengan Alasan Audit.
   */
  async reopenJudgeAssessmentRpc(assessmentId: string, reason: string): Promise<RpcServiceResult> {
    if (!reason || reason.trim().length < 5) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: 'Alasan pembukaan kembali lembar nilai wajib diisi minimal 5 karakter untuk rekaman audit trail.'
      };
    }

    const uuidCheck = this.validateReferences({ p_assessment_id: assessmentId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Pembukaan kembali lembar nilai dieksekusi pada penyimpanan lokal.'
      };
    }

    const { data, error } = await supabase.rpc('reopen_judge_assessment', {
      p_assessment_id: assessmentId,
      p_reason: reason.trim()
    });

    if (error) {
      return {
        success: false,
        mode: 'supabase_live',
        message: error.message || 'Gagal mengeksekusi RPC reopen_judge_assessment.'
      };
    }

    return {
      success: true,
      mode: 'supabase_live',
      message: (data as { message?: string })?.message || 'Lembar penilaian berhasil dibuka kembali melalui RPC.',
      data
    };
  },

  /**
   * RPC 3: Pengesahan Babak & Pelolosan Kualifikasi Atomik di Server.
   */
  async advanceStageQualifiersRpc(params: {
    stageId: string;
    nextStageId: string | null;
    qualifiedParticipantIds: string[];
    overrideReasons: Record<string, string>;
    rankingsSnapshot?: unknown;
  }): Promise<RpcServiceResult> {
    const refMap: Record<string, string | undefined | null> = {
      p_stage_id: params.stageId
    };
    if (params.nextStageId) {
      refMap.p_next_stage_id = params.nextStageId;
    }
    params.qualifiedParticipantIds.forEach((pid, idx) => {
      refMap[`qualified_participant_ids[${idx}]`] = pid;
    });

    const uuidCheck = this.validateReferences(refMap);
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    // Validasi panjang alasan override jika ada
    for (const [pid, r] of Object.entries(params.overrideReasons || {})) {
      if (!r || r.trim().length < 5) {
        return {
          success: false,
          mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
          message: `Alasan override manual untuk peserta ${pid} wajib minimal 5 karakter.`
        };
      }
    }

    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Pengesahan babak dieksekusi pada penyimpanan lokal.'
      };
    }

    const { data, error } = await supabase.rpc('advance_stage_qualifiers', {
      p_stage_id: params.stageId,
      p_next_stage_id: params.nextStageId,
      p_qualified_participant_ids: params.qualifiedParticipantIds,
      p_override_reasons: params.overrideReasons,
      p_rankings_snapshot: params.rankingsSnapshot ?? []
    });

    if (error) {
      return {
        success: false,
        mode: 'supabase_live',
        message: error.message || 'Gagal mengeksekusi RPC advance_stage_qualifiers.'
      };
    }

    return {
      success: true,
      mode: 'supabase_live',
      message: (data as { message?: string })?.message || 'Babak berhasil disahkan melalui RPC.',
      data
    };
  },

  /**
   * Menyimpan draf lembar penilaian yang belum terkunci ke tabel judge_assessments
   * hanya apabila seluruh ID referensi merupakan UUID database yang valid.
   */
  async syncAssessmentToRemote(
    assessment: JudgeAssessment,
    assignedMaqraRecordId?: string
  ): Promise<RpcServiceResult> {
    const effectiveMaqraId = assignedMaqraRecordId || assessment.questionId;
    const uuidCheck = this.validateReferences({
      id: assessment.id,
      tenant_id: assessment.tenantId,
      stage_participation_id: assessment.stageParticipationId,
      assigned_maqra_id: effectiveMaqraId,
      judge_profile_id: assessment.judgeId,
      rubric_version_id: assessment.rubricVersionId
    });

    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal aktif: perubahan lembar penilaian disimpan di penyimpanan lokal.'
      };
    }

    // Pastikan tidak melakukan upsert langsung untuk mengubah nilai yang sudah terkunci
    const { error } = await supabase
      .from('judge_assessments')
      .upsert({
        id: assessment.id,
        tenant_id: assessment.tenantId,
        stage_participation_id: assessment.stageParticipationId,
        assigned_maqra_id: effectiveMaqraId,
        judge_profile_id: assessment.judgeId,
        rubric_version_id: assessment.rubricVersionId,
        status: assessment.status === 'finalized' ? 'in_progress' : assessment.status,
        total_deductions: assessment.totalDeductions,
        final_score: assessment.finalScore,
        field_scores: assessment.fieldScores || {},
        error_counts: assessment.errorCounts || {},
        annotations: assessment.annotations || [],
        is_locked: false,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return {
        success: false,
        mode: 'supabase_live',
        message: error.message
      };
    }

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Lembar penilaian tersinkronisasi ke tabel judge_assessments.'
    };
  },

  /**
   * Menyimpan pendaftaran peserta beserta baris partisipasi babak awal ke Supabase
   * dengan validasi ketat UUID pada kafilah_id, branch_id, dan stage_id.
   */
  async upsertParticipantWithStage(params: {
    participant: Participant;
    stageParticipation: StageParticipation;
    levelId?: string | null;
  }): Promise<RpcServiceResult> {
    const { participant, stageParticipation, levelId } = params;
    const uuidCheck = this.validateReferences({
      participant_id: participant.id,
      tenant_id: participant.tenantId,
      kafilah_id: participant.kafilahId,
      branch_id: participant.branchId,
      stage_participation_id: stageParticipation.id,
      stage_id: stageParticipation.stageId
    });

    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal: peserta disimpan pada localStorage.'
      };
    }

    const { error: partErr } = await supabase.from('participants').upsert({
      id: participant.id,
      tenant_id: participant.tenantId,
      participant_code: participant.participantId,
      lottery_number: participant.lotteryNumber,
      name: participant.name,
      gender: participant.gender,
      kafilah_id: participant.kafilahId,
      branch_id: participant.branchId,
      level_id: levelId && isValidUuid(levelId) ? levelId : null,
      status: participant.status
    });

    if (partErr) {
      return { success: false, mode: 'supabase_live', message: partErr.message };
    }

    const { error: spErr } = await supabase.from('stage_participations').upsert({
      id: stageParticipation.id,
      tenant_id: stageParticipation.tenantId,
      participant_id: participant.id,
      stage_id: stageParticipation.stageId,
      lottery_number: stageParticipation.lotteryNumber,
      status: stageParticipation.status
    });

    if (spErr) {
      return { success: false, mode: 'supabase_live', message: spErr.message };
    }

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Peserta dan partisipasi babak awal tersimpan di Supabase.'
    };
  },

  /**
   * Mencatat penetapan maqra (assigned_maqras) pada Supabase dan memperbarui status stage_participations.
   */
  async assignMaqraRecord(params: {
    id: string;
    tenantId: string;
    stageParticipationId: string;
    questionId: string;
    method?: 'undian' | 'manual' | 'jadwal';
  }): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({
      id: params.id,
      tenant_id: params.tenantId,
      stage_participation_id: params.stageParticipationId,
      question_id: params.questionId
    });

    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal: penetapan maqra disimpan di penyimpanan lokal.'
      };
    }

    const { error } = await supabase.from('assigned_maqras').upsert(
      {
        id: params.id,
        tenant_id: params.tenantId,
        stage_participation_id: params.stageParticipationId,
        question_id: params.questionId,
        method: params.method || 'undian'
      },
      { onConflict: 'stage_participation_id,question_id' }
    );

    if (error) {
      return { success: false, mode: 'supabase_live', message: error.message };
    }

    await supabase
      .from('stage_participations')
      .update({ status: 'Belum Dimulai', updated_at: new Date().toISOString() })
      .eq('id', params.stageParticipationId)
      .eq('status', 'Maqra Belum Ditetapkan');

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Penetapan maqra berhasil disimpan ke tabel assigned_maqras.'
    };
  },

  async upsertKafilah(kafilah: Kafilah): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: kafilah.id, tenant_id: kafilah.tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }
    if (!this.isLive() || !supabase) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await supabase.from('kafilahs').upsert({
      id: kafilah.id,
      tenant_id: kafilah.tenantId,
      code: kafilah.code,
      name: kafilah.name,
      region: kafilah.region,
      leader_name: kafilah.contactPerson,
      contact_person: kafilah.contactPerson,
      contact_phone: kafilah.contactPhone,
      status: kafilah.status
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Kafilah tersimpan di Supabase.' };
  },

  async upsertQuestion(question: Question, branchId?: string, stageId?: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: question.id, tenant_id: question.tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }
    if (!this.isLive() || !supabase) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await supabase.from('questions').upsert({
      id: question.id,
      tenant_id: question.tenantId,
      code: question.code,
      title: question.title,
      surah_name: question.surahName,
      surah_number: question.surahNumber,
      start_ayah: question.startAyah,
      end_ayah: question.endAyah,
      page_number: question.pageNumber,
      page_start: question.pageStart || question.pageNumber,
      page_end: question.pageEnd || question.pageNumber,
      branch_id: branchId && isValidUuid(branchId) ? branchId : null,
      stage_id: stageId && isValidUuid(stageId) ? stageId : null,
      status: question.status,
      description: question.description || null
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Soal maqra tersimpan di Supabase.' };
  },

  async upsertJudgeAssignment(assignment: JudgeAssignment): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({
      id: assignment.id,
      tenant_id: assignment.tenantId,
      stage_id: assignment.stageId,
      judge_profile_id: assignment.judgeId
    });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }
    if (!this.isLive() || !supabase) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await supabase.from('judge_assignments').upsert({
      id: assignment.id,
      tenant_id: assignment.tenantId,
      stage_id: assignment.stageId,
      branch_id: assignment.branchId && isValidUuid(assignment.branchId) ? assignment.branchId : null,
      rubric_field_id: assignment.rubricFieldId && isValidUuid(assignment.rubricFieldId) ? assignment.rubricFieldId : null,
      judge_field: assignment.judgeField,
      judge_profile_id: assignment.judgeId,
      status: 'Aktif'
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Penugasan hakim tersimpan di Supabase.' };
  },

  async fetchCompetitionRules(tenantId: string): Promise<CompetitionRuleConfig[] | null> {
    if (!this.isLive() || !supabase || !isValidUuid(tenantId)) return null;
    const { data, error } = await supabase
      .from('competition_rule_configs')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return null;
    return data as unknown as CompetitionRuleConfig[];
  },

  async fetchStageResultSnapshots(tenantId: string): Promise<StageResultSnapshot[] | null> {
    if (!this.isLive() || !supabase || !isValidUuid(tenantId)) return null;
    const { data, error } = await supabase
      .from('stage_result_snapshots')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return null;
    return data as unknown as StageResultSnapshot[];
  },

  async appendAuditLog(entry: AuditLogItem & { tenantId?: string; actorId?: string }): Promise<boolean> {
    if (!this.isLive() || !supabase) return false;
    if (!entry.tenantId || !isValidUuid(entry.tenantId)) return false;
    if (entry.actorId && !isValidUuid(entry.actorId)) return false;

    const { error } = await supabase.from('audit_logs').insert({
      id: isValidUuid(entry.id) ? entry.id : undefined,
      tenant_id: entry.tenantId,
      actor_id: entry.actorId || null,
      actor_name: entry.actor,
      action: entry.action,
      target: entry.target,
      summary: entry.summary,
      reason: entry.reason || null,
      outcome: entry.outcome || 'Success'
    });
    return !error;
  }
};
