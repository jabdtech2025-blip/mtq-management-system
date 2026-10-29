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
  RubricVersion,
  RubricField,
  RubricCriterion,
  DeductionRule
} from '../types/mtq';
import { generateUuid, isValidUuid, toDeterministicUuid, validateDatabaseUuids } from '../utils/uuid';

export interface RpcServiceResult<T = Record<string, any>> {
  success: boolean;
  message: string;
  mode: 'supabase_live' | 'local_offline_fallback';
  data?: T;
  validationErrors?: string[];
}

export interface AuthenticatedSupabaseProfile {
  authUserId: string;
  email: string;
  name: string;
  username: string;
  globalRole: 'superadmin' | 'admin' | 'judge';
  hasProfileRow: boolean;
  inactiveMembershipsCount: number;
  verificationError?: string;
  memberships: Array<{
    tenantId: string;
    role: 'superadmin' | 'admin' | 'judge';
    judgeCategory?: string;
    judgeField?: string;
    status: string;
  }>;
}

export interface HydratedWorkspacePayload {
  tenants: Tenant[];
  users: User[];
  cabangList: GenericMasterItem[];
  jenjangList: GenericMasterItem[];
  kafilahs: Kafilah[];
  participants: Participant[];
  stages: CompetitionStage[];
  stageParticipations: StageParticipation[];
  questions: Question[];
  errorCategories: ErrorCategory[];
  rubricVersions: RubricVersion[];
  competitionRules: CompetitionRuleConfig[];
  judgeAssignments: JudgeAssignment[];
  assessments: JudgeAssessment[];
  stageSnapshots: StageResultSnapshot[];
  auditLogs: AuditLogItem[];
}

export interface WorkspaceHydrationResult {
  success: boolean;
  tenantId: string;
  mode: 'supabase_live' | 'demo_local';
  error?: string;
  failedQueries?: string[];
  payload: HydratedWorkspacePayload | null;
}

export interface DatabaseReferenceCheckInput {
  tenantId?: string | null;
  branchId?: string | null;
  stageId?: string | null;
  kafilahId?: string | null;
  participantId?: string | null;
  stageParticipationId?: string | null;
  assignedMaqraId?: string | null;
  judgeProfileId?: string | null;
  rubricVersionId?: string | null;
  questionId?: string | null;
}

// Memungkinkan injeksi client database lokal (PGlite adapter) pada pengujian otomatis
// tanpa menyentuh proyek Supabase remote milik pengguna.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let injectedDatabaseClient: any = null;

function getActiveClient() {
  return injectedDatabaseClient || supabase;
}

const SYSTEM_TENANT_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Service Data Terpusat untuk Operasi Database Supabase, Validasi UUID & Keberadaan FK, Autentikasi, & RPC.
 * - Tidak pernah menggunakan service_role key di frontend.
 * - Memastikan seluruh foreign key benar-benar ada di database sebelum upsert/RPC.
 * - Menggunakan ID baris nyata dari database untuk assigned_maqras dan stage_participations.
 * - Memeriksa error setiap query pada hidrasi workspace dan tidak mencampur data demo saat mode database aktif.
 */
export const supabaseDataService = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTestDatabaseClient(client: any | null): void {
    injectedDatabaseClient = client;
  },

  getConnectionStatus(): SupabaseConnectionInfo {
    return getSupabaseConnectionInfo();
  },

  isLive(): boolean {
    if (injectedDatabaseClient) return true;
    return isSupabaseConfigured() && supabase !== null;
  },

  /**
   * Memastikan bahwa seluruh referensi ID merupakan sintaks UUID PostgreSQL yang valid.
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
   * Memverifikasi secara nyata ke database bahwa baris referensi foreign key
   * (tenant, branch, stage, participant, stage_participation, assigned_maqra, judge, rubric_version, question)
   * benar-benar ada di database sebelum melakukan upsert atau RPC.
   */
  async verifyDatabaseReferencesExist(refs: DatabaseReferenceCheckInput): Promise<{
    valid: boolean;
    message?: string;
    missingReferences: string[];
  }> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        valid: false,
        missingReferences: ['database_client'],
        message: 'Koneksi database aktif tidak tersedia.'
      };
    }

    const nonEmptyRefs: Record<string, string> = {};
    for (const [k, v] of Object.entries(refs)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        nonEmptyRefs[k] = String(v).trim();
      }
    }

    const syntaxCheck = this.validateReferences(nonEmptyRefs);
    if (!syntaxCheck.valid) {
      return {
        valid: false,
        missingReferences: syntaxCheck.invalidFields,
        message: syntaxCheck.message
      };
    }

    const missingReferences: string[] = [];

    const checkTableRow = async (table: string, idValue: string, label: string) => {
      const { data, error } = await client
        .from(table)
        .select('id')
        .eq('id', idValue)
        .maybeSingle();
      if (error || !data || !data.id) {
        missingReferences.push(`${label} (${table}.id = ${idValue})`);
      }
    };

    const checks: Promise<void>[] = [];
    if (nonEmptyRefs.tenantId) {
      checks.push(checkTableRow('tenants', nonEmptyRefs.tenantId, 'Tenant'));
    }
    if (nonEmptyRefs.branchId) {
      checks.push(checkTableRow('branches', nonEmptyRefs.branchId, 'Cabang Lomba'));
    }
    if (nonEmptyRefs.stageId) {
      checks.push(checkTableRow('stages', nonEmptyRefs.stageId, 'Babak Kompetisi'));
    }
    if (nonEmptyRefs.kafilahId) {
      checks.push(checkTableRow('kafilahs', nonEmptyRefs.kafilahId, 'Kafilah'));
    }
    if (nonEmptyRefs.participantId) {
      checks.push(checkTableRow('participants', nonEmptyRefs.participantId, 'Peserta'));
    }
    if (nonEmptyRefs.stageParticipationId) {
      checks.push(checkTableRow('stage_participations', nonEmptyRefs.stageParticipationId, 'Partisipasi Babak'));
    }
    if (nonEmptyRefs.assignedMaqraId) {
      checks.push(checkTableRow('assigned_maqras', nonEmptyRefs.assignedMaqraId, 'Penetapan Maqra'));
    }
    if (nonEmptyRefs.judgeProfileId) {
      checks.push(checkTableRow('profiles', nonEmptyRefs.judgeProfileId, 'Profil Hakim'));
    }
    if (nonEmptyRefs.rubricVersionId) {
      checks.push(checkTableRow('rubric_versions', nonEmptyRefs.rubricVersionId, 'Versi Rubrik'));
    }
    if (nonEmptyRefs.questionId) {
      checks.push(checkTableRow('questions', nonEmptyRefs.questionId, 'Soal Maqra'));
    }

    await Promise.all(checks);

    if (missingReferences.length > 0) {
      return {
        valid: false,
        missingReferences,
        message: `Integritas Foreign Key Ditolak: Referensi belum terdaftar di database (${missingReferences.join('; ')}).`
      };
    }

    return { valid: true, missingReferences: [] };
  },

  /**
   * Melakukan pemeriksaan nyata terhadap koneksi database Supabase, keberadaan skema tabel,
   * dan status sesi autentikasi pengguna saat ini.
   */
  async verifyDatabaseConnection(): Promise<SupabaseConnectionInfo> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      setRuntimeSupabaseConnectionState({
        state: 'unconfigured',
        isDatabaseReady: false,
        isAuthenticated: false,
        lastError: null
      });
      return getSupabaseConnectionInfo();
    }

    try {
      const { data: sessionData } = await client.auth.getSession();
      const hasSession = Boolean(sessionData?.session?.user?.id);

      const { error } = await client.from('tenants').select('id').limit(1);

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
    const client = getActiveClient();
    if (!this.isLive() || !client) return null;

    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    const authUser = sessionData?.session?.user;
    if (sessionErr || !authUser || !isValidUuid(authUser.id)) {
      return null;
    }

    const { data: profileRow, error: profileErr } = await client
      .from('profiles')
      .select('id, username, name, email, role')
      .eq('id', authUser.id)
      .maybeSingle();

    const { data: allMembershipRows, error: membershipErr } = await client
      .from('tenant_memberships')
      .select('tenant_id, role, judge_category, judge_field, status')
      .eq('profile_id', authUser.id);

    const activeRows = (allMembershipRows || []).filter(
      (m: Record<string, unknown>) => String(m.status || 'Aktif') === 'Aktif'
    );
    const inactiveCount = (allMembershipRows || []).filter(
      (m: Record<string, unknown>) => String(m.status || '') === 'Nonaktif'
    ).length;

    const memberships = activeRows.map((m: Record<string, unknown>) => ({
      tenantId: String(m.tenant_id || ''),
      role: (m.role as 'superadmin' | 'admin' | 'judge') || 'judge',
      judgeCategory: m.judge_category ? String(m.judge_category) : undefined,
      judgeField: m.judge_field ? String(m.judge_field) : undefined,
      status: String(m.status || 'Aktif')
    }));

    const verificationErrors: string[] = [];
    if (profileErr) verificationErrors.push(`profiles: ${profileErr.message}`);
    if (membershipErr) verificationErrors.push(`tenant_memberships: ${membershipErr.message}`);

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
      hasProfileRow: Boolean(profileRow && profileRow.id),
      inactiveMembershipsCount: inactiveCount,
      verificationError: verificationErrors.length > 0 ? verificationErrors.join('; ') : undefined,
      memberships
    };
  },

  async signInWithPassword(email: string, password: string): Promise<{
    success: boolean;
    message: string;
    profile?: AuthenticatedSupabaseProfile | null;
  }> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        message: 'Kredensial Supabase (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY) belum dikonfigurasi.'
      };
    }

    const { error } = await client.auth.signInWithPassword({
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
    const client = getActiveClient();
    if (!this.isLive() || !client) return;
    await client.auth.signOut();
    await this.verifyDatabaseConnection();
  },

  /**
   * Mengambil seluruh data operasional, rubrik, dan master untuk tenant aktif dari Supabase
   * dengan pemeriksaan error eksplisit untuk setiap tabel.
   */
  async fetchTenantWorkspaceResult(rawTenantId: string): Promise<WorkspaceHydrationResult> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        tenantId: rawTenantId,
        mode: 'demo_local',
        error: 'Supabase belum dikonfigurasi.',
        payload: null
      };
    }

    const conn = await this.verifyDatabaseConnection();
    if (!conn.isDatabaseReady) {
      return {
        success: false,
        tenantId: rawTenantId,
        mode: 'supabase_live',
        error: conn.lastError || 'Database Supabase belum siap.',
        payload: null
      };
    }

    const tenantUuid = isValidUuid(rawTenantId) ? rawTenantId : toDeterministicUuid(rawTenantId);
    if (!isValidUuid(tenantUuid)) {
      return {
        success: false,
        tenantId: rawTenantId,
        mode: 'supabase_live',
        error: `Tenant ID "${rawTenantId}" bukan UUID yang valid.`,
        payload: null
      };
    }

    const [
      tenantsRes,
      membershipsRes,
      branchesRes,
      levelsRes,
      kafilahsRes,
      stagesRes,
      questionsRes,
      participantsRes,
      spRes,
      assignedMaqrasRes,
      errorCatsRes,
      rubricVersionsRes,
      rubricFieldsRes,
      rubricCriteriaRes,
      deductionRulesRes,
      rulesRes,
      judgeAsgRes,
      assessmentsRes,
      snapshotsRes,
      auditRes
    ] = await Promise.all([
      client.from('tenants').select('*').neq('id', SYSTEM_TENANT_UUID),
      client.from('tenant_memberships').select('*, profiles(id, username, name, email, role)').eq('tenant_id', tenantUuid),
      client.from('branches').select('*').eq('tenant_id', tenantUuid),
      client.from('levels').select('*').eq('tenant_id', tenantUuid),
      client.from('kafilahs').select('*').eq('tenant_id', tenantUuid),
      client.from('stages').select('*').eq('tenant_id', tenantUuid).order('stage_order', { ascending: true }),
      client.from('questions').select('*').eq('tenant_id', tenantUuid),
      client.from('participants').select('*').eq('tenant_id', tenantUuid),
      client.from('stage_participations').select('*').eq('tenant_id', tenantUuid),
      client.from('assigned_maqras').select('*').eq('tenant_id', tenantUuid),
      client.from('error_categories').select('*').eq('tenant_id', tenantUuid).order('sort_order', { ascending: true }),
      client.from('rubric_versions').select('*').in('tenant_id', [tenantUuid, SYSTEM_TENANT_UUID]),
      client.from('rubric_fields').select('*').order('field_order', { ascending: true }),
      client.from('rubric_criteria').select('*').order('sort_order', { ascending: true }),
      client.from('deduction_rules').select('*'),
      client.from('competition_rule_configs').select('*').eq('tenant_id', tenantUuid),
      client.from('judge_assignments').select('*, profiles(name)').eq('tenant_id', tenantUuid),
      client.from('judge_assessments').select('*').eq('tenant_id', tenantUuid),
      client.from('stage_result_snapshots').select('*').eq('tenant_id', tenantUuid),
      client.from('audit_logs').select('*').eq('tenant_id', tenantUuid).order('created_at', { ascending: false }).limit(50)
    ]);

    const queryChecks: Array<{ name: string; error: { message?: string } | null }> = [
      { name: 'tenants', error: tenantsRes.error },
      { name: 'tenant_memberships', error: membershipsRes.error },
      { name: 'branches', error: branchesRes.error },
      { name: 'levels', error: levelsRes.error },
      { name: 'kafilahs', error: kafilahsRes.error },
      { name: 'stages', error: stagesRes.error },
      { name: 'questions', error: questionsRes.error },
      { name: 'participants', error: participantsRes.error },
      { name: 'stage_participations', error: spRes.error },
      { name: 'assigned_maqras', error: assignedMaqrasRes.error },
      { name: 'error_categories', error: errorCatsRes.error },
      { name: 'rubric_versions', error: rubricVersionsRes.error },
      { name: 'rubric_fields', error: rubricFieldsRes.error },
      { name: 'rubric_criteria', error: rubricCriteriaRes.error },
      { name: 'deduction_rules', error: deductionRulesRes.error },
      { name: 'competition_rule_configs', error: rulesRes.error },
      { name: 'judge_assignments', error: judgeAsgRes.error },
      { name: 'judge_assessments', error: assessmentsRes.error },
      { name: 'stage_result_snapshots', error: snapshotsRes.error },
      { name: 'audit_logs', error: auditRes.error }
    ];

    const failedQueries = queryChecks
      .filter((q) => q.error !== null && q.error !== undefined)
      .map((q) => `${q.name}: ${q.error?.message || 'Query error'}`);

    if (failedQueries.length > 0) {
      return {
        success: false,
        tenantId: tenantUuid,
        mode: 'supabase_live',
        error: `Gagal memuat sebagian data workspace dari Supabase (${failedQueries.join('; ')}).`,
        failedQueries,
        payload: null
      };
    }

    const tenants: Tenant[] = (tenantsRes.data || []).map((t: Record<string, unknown>) => ({
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

    const users: User[] = (membershipsRes.data || []).map((m: Record<string, unknown>) => {
      const prof = (m.profiles || {}) as Record<string, unknown>;
      const profileId = String(m.profile_id || prof.id || '');
      return {
        id: profileId,
        tenantId: String(m.tenant_id || tenantUuid),
        username: String(prof.username || prof.email || profileId),
        name: String(prof.name || 'Pengguna MTQ'),
        role: ((m.role as string) || (prof.role as string) || 'judge') as 'superadmin' | 'admin' | 'judge',
        judgeCategory: m.judge_category ? String(m.judge_category) : undefined,
        judgeField: m.judge_field ? String(m.judge_field) : undefined,
        status: ((m.status as string) || 'Aktif') as 'Aktif' | 'Nonaktif'
      };
    });

    const branchMap = new Map<string, string>();
    const cabangList: GenericMasterItem[] = (branchesRes.data || []).map((b: Record<string, unknown>) => {
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

    const levelMap = new Map<string, string>();
    const jenjangList: GenericMasterItem[] = (levelsRes.data || []).map((l: Record<string, unknown>) => {
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

    const kafilahMap = new Map<string, string>();
    const kafilahs: Kafilah[] = (kafilahsRes.data || []).map((k: Record<string, unknown>) => {
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

    const stageMap = new Map<string, { name: string; branchId?: string; branchName: string }>();
    const stages: CompetitionStage[] = (stagesRes.data || []).map((s: Record<string, unknown>) => {
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
        finalizedAt: s.finalized_at ? String(s.finalized_at) : undefined,
        finalizedBy: s.finalized_by ? String(s.finalized_by) : undefined
      };
    });

    const questionMap = new Map<string, Question>();
    const questions: Question[] = (questionsRes.data || []).map((q: Record<string, unknown>) => {
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

    const assignedMaqraBySp = new Map<string, Array<{ id: string; questionId: string; assignedAt: string }>>();
    const assignedMaqraIdToQuestionId = new Map<string, string>();
    (assignedMaqrasRes.data || []).forEach((am: Record<string, unknown>) => {
      const amId = String(am.id);
      const spId = String(am.stage_participation_id);
      const qId = String(am.question_id);
      assignedMaqraIdToQuestionId.set(amId, qId);
      const list = assignedMaqraBySp.get(spId) || [];
      list.push({ id: amId, questionId: qId, assignedAt: String(am.assigned_at || '') });
      assignedMaqraBySp.set(spId, list);
    });

    const stageParticipations: StageParticipation[] = (spRes.data || []).map((sp: Record<string, unknown>) => {
      const spId = String(sp.id);
      const stgId = String(sp.stage_id);
      const stgInfo = stageMap.get(stgId);
      const maqras = assignedMaqraBySp.get(spId) || [];
      const assignedQuestions = maqras.map((m) => {
        const qObj = questionMap.get(m.questionId);
        return {
          id: m.id, // Real database row ID from assigned_maqras.id
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
        provisionalScore: sp.provisional_score !== null && sp.provisional_score !== undefined ? Number(sp.provisional_score) : undefined,
        finalScore: sp.final_score !== null && sp.final_score !== undefined ? Number(sp.final_score) : undefined,
        rank: sp.rank !== null && sp.rank !== undefined ? Number(sp.rank) : undefined,
        isQualified: Boolean(sp.is_qualified),
        qualificationReason: sp.qualification_reason ? String(sp.qualification_reason) : undefined,
        finalizedAt: sp.finalized_at ? String(sp.finalized_at) : undefined
      };
    });

    const participants: Participant[] = (participantsRes.data || []).map((p: Record<string, unknown>) => {
      const id = String(p.id);
      const bId = String(p.branch_id || '');
      const kId = String(p.kafilah_id || '');
      const lId = p.level_id ? String(p.level_id) : '';
      const matchingSps = stageParticipations.filter((sp) => sp.participantId === id);
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

    // Update participantCount on kafilahs
    kafilahs.forEach((k) => {
      k.participantCount = participants.filter((p) => p.kafilahId === k.id).length;
    });

    const errorCategories: ErrorCategory[] = (errorCatsRes.data || []).map((c: Record<string, unknown>) => ({
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

    // Map deduction_rules -> rubric_criteria -> rubric_fields -> rubric_versions
    const deductionRulesByCriterionId = new Map<string, DeductionRule[]>();
    (deductionRulesRes.data || []).forEach((dr: Record<string, unknown>) => {
      const criterionId = String(dr.criterion_id || '');
      const perErr = Number(dr.deduction_points ?? dr.deduction_per_error ?? 0.5);
      const ruleName = String(dr.name || dr.label || '');
      const item: DeductionRule = {
        id: String(dr.id),
        criterionId,
        name: ruleName,
        label: ruleName,
        errorGrade: dr.error_grade ? (String(dr.error_grade) as DeductionRule['errorGrade']) : undefined,
        deductionPoints: perErr,
        deductionPerError: perErr,
        maxDeduction: dr.max_deduction !== null && dr.max_deduction !== undefined ? Number(dr.max_deduction) : undefined,
        methodType: (dr.method_type as DeductionRule['methodType']) || 'Pengurangan tetap'
      };
      const list = deductionRulesByCriterionId.get(criterionId) || [];
      list.push(item);
      deductionRulesByCriterionId.set(criterionId, list);
    });

    const criteriaByFieldId = new Map<string, RubricCriterion[]>();
    (rubricCriteriaRes.data || []).forEach((rc: Record<string, unknown>) => {
      const critId = String(rc.id);
      const fieldId = String(rc.rubric_field_id || '');
      const item: RubricCriterion = {
        id: critId,
        fieldId,
        code: rc.code ? String(rc.code) : undefined,
        name: String(rc.name || ''),
        description: rc.description ? String(rc.description) : undefined,
        maxDeduction: rc.max_deduction !== null && rc.max_deduction !== undefined ? Number(rc.max_deduction) : undefined,
        deductionRules: deductionRulesByCriterionId.get(critId) || []
      };
      const list = criteriaByFieldId.get(fieldId) || [];
      list.push(item);
      criteriaByFieldId.set(fieldId, list);
    });

    const fieldsByRubricVersionId = new Map<string, RubricField[]>();
    (rubricFieldsRes.data || []).forEach((rf: Record<string, unknown>) => {
      const fieldId = String(rf.id);
      const rvId = String(rf.rubric_version_id || '');
      const item: RubricField = {
        id: fieldId,
        code: String(rf.code || ''),
        name: String(rf.name || ''),
        maxScore: Number(rf.max_score ?? 0),
        minScore: Number(rf.min_score ?? 0),
        maxDeduction: rf.max_deduction !== null && rf.max_deduction !== undefined ? Number(rf.max_deduction) : undefined,
        maxAllowedErrors:
          rf.max_allowed_errors !== null && rf.max_allowed_errors !== undefined ? Number(rf.max_allowed_errors) : undefined,
        weight: rf.weight !== null && rf.weight !== undefined ? Number(rf.weight) : undefined,
        order: Number(rf.field_order || 1),
        description: rf.description ? String(rf.description) : undefined,
        status: (rf.status as RubricField['status']) || 'Aktif',
        criteria: criteriaByFieldId.get(fieldId) || []
      };
      const list = fieldsByRubricVersionId.get(rvId) || [];
      list.push(item);
      fieldsByRubricVersionId.set(rvId, list);
    });

    const rubricVersions: RubricVersion[] = (rubricVersionsRes.data || []).map((rv: Record<string, unknown>) => {
      const rvId = String(rv.id);
      const rawTenant = String(rv.tenant_id || SYSTEM_TENANT_UUID);
      const codeStr = String(rv.code || '');
      const sourceStr = rv.official_source ? String(rv.official_source) : undefined;
      const isOfficialVerified =
        codeStr === 'RUBRIC-SENI-BACA-2025' ||
        Boolean(sourceStr && sourceStr.includes('Buku Pedoman Musabaqah'));
      return {
        id: rvId,
        tenantId: rawTenant === SYSTEM_TENANT_UUID ? 'system' : rawTenant,
        code: codeStr,
        name: String(rv.name || ''),
        branchCode: String(rv.branch_code || ''),
        branchName: String(rv.branch_name || ''),
        version: String(rv.version || '2025.1'),
        description: String(rv.description || ''),
        officialSource: sourceStr,
        isOfficialVerified,
        status: (rv.status as RubricVersion['status']) || 'Aktif',
        startingScore: Number(rv.starting_score ?? 100),
        fields: fieldsByRubricVersionId.get(rvId) || [],
        createdAt: String(rv.created_at || new Date().toISOString())
      };
    });

    const competitionRules: CompetitionRuleConfig[] = (rulesRes.data || []).map((r: Record<string, unknown>) => {
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

    const judgeNameByProfileId = new Map<string, { name: string; field: string }>();
    const judgeAssignments: JudgeAssignment[] = (judgeAsgRes.data || []).map((ja: Record<string, unknown>) => {
      const stgId = String(ja.stage_id);
      const stgInfo = stageMap.get(stgId);
      const bId = ja.branch_id ? String(ja.branch_id) : stgInfo?.branchId;
      const prof = ja.profiles as { name?: string } | null;
      const judgeId = String(ja.judge_profile_id);
      const jName = prof?.name || 'Dewan Hakim';
      const jField = String(ja.judge_field || 'Bidang Penilaian');
      judgeNameByProfileId.set(judgeId, { name: jName, field: jField });
      return {
        id: String(ja.id),
        tenantId: String(ja.tenant_id),
        judgeId,
        judgeName: jName,
        stageId: stgId,
        stageName: stgInfo?.name || 'Penyisihan',
        branchId: bId,
        branchName: (bId && branchMap.get(bId)) || stgInfo?.branchName || 'Tilawah Dewasa Putra',
        judgeField: jField,
        rubricFieldId: ja.rubric_field_id ? String(ja.rubric_field_id) : undefined
      };
    });

    const spLookup = new Map<string, StageParticipation>();
    stageParticipations.forEach((s) => spLookup.set(s.id, s));

    const assessments: JudgeAssessment[] = (assessmentsRes.data || []).map((a: Record<string, unknown>) => {
      const spId = String(a.stage_participation_id);
      const spObj = spLookup.get(spId);
      const amId = String(a.assigned_maqra_id);
      const resolvedQuestionId = assignedMaqraIdToQuestionId.get(amId) || amId;
      const jId = String(a.judge_profile_id);
      const jInfo = judgeNameByProfileId.get(jId);
      return {
        id: String(a.id),
        tenantId: String(a.tenant_id),
        stageParticipationId: spId,
        assignedMaqraId: amId,
        stageId: spObj?.stageId || '',
        stageName: spObj?.stageName || 'Penyisihan',
        participantId: spObj?.participantId || '',
        judgeId: jId,
        judgeName: jInfo?.name || 'Dewan Hakim',
        judgeField: jInfo?.field || 'Dewan Hakim',
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

    const stageSnapshots: StageResultSnapshot[] = (snapshotsRes.data || []).map((s: Record<string, unknown>) => {
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

    const activeTenantObj = tenants.find((t) => t.id === tenantUuid);
    const auditLogs: AuditLogItem[] = (auditRes.data || []).map((al: Record<string, unknown>) => ({
      id: String(al.id),
      timestamp: String(al.created_at || ''),
      actor: String(al.actor_name || ''),
      action: String(al.action || ''),
      target: String(al.target || ''),
      tenantName: activeTenantObj?.name || 'Tenant Aktif',
      summary: String(al.summary || ''),
      reason: al.reason ? String(al.reason) : undefined,
      outcome: ((al.outcome as string) || 'Success') as 'Success' | 'Failed' | 'Warning'
    }));

    return {
      success: true,
      tenantId: tenantUuid,
      mode: 'supabase_live',
      payload: {
        tenants,
        users,
        cabangList,
        jenjangList,
        kafilahs,
        participants,
        stages,
        stageParticipations,
        questions,
        errorCategories,
        rubricVersions,
        competitionRules,
        judgeAssignments,
        assessments,
        stageSnapshots,
        auditLogs
      }
    };
  },

  /**
   * Wrapper kompatibel yang mengembalikan payload apabila seluruh query workspace berhasil,
   * atau null jika terjadi kegagalan koneksi/query.
   */
  async fetchTenantWorkspaceData(rawTenantId: string): Promise<HydratedWorkspacePayload | null> {
    const res = await this.fetchTenantWorkspaceResult(rawTenantId);
    if (!res.success || !res.payload) return null;
    return res.payload;
  },

  /**
   * Memastikan baris stage_participations benar-benar tersimpan di database,
   * dan mengembalikan ID baris nyata dari database.
   */
  async ensureStageParticipationPersisted(params: {
    stageParticipation: StageParticipation;
    participant?: Participant;
    levelId?: string | null;
  }): Promise<{ success: boolean; stageParticipationId?: string; message?: string }> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, message: 'Koneksi database tidak tersedia.' };
    }

    const { stageParticipation, participant, levelId } = params;
    const spId = isValidUuid(stageParticipation.id)
      ? stageParticipation.id
      : toDeterministicUuid(stageParticipation.id);
    const tenantId = isValidUuid(stageParticipation.tenantId)
      ? stageParticipation.tenantId
      : toDeterministicUuid(stageParticipation.tenantId);
    const participantId = isValidUuid(stageParticipation.participantId)
      ? stageParticipation.participantId
      : toDeterministicUuid(stageParticipation.participantId);
    const stageId = isValidUuid(stageParticipation.stageId)
      ? stageParticipation.stageId
      : toDeterministicUuid(stageParticipation.stageId);

    // 1. Cek apakah sudah ada baris di stage_participations
    const { data: existingById } = await client
      .from('stage_participations')
      .select('id')
      .eq('id', spId)
      .maybeSingle();

    if (existingById?.id) {
      return { success: true, stageParticipationId: String(existingById.id) };
    }

    const { data: existingByComposite } = await client
      .from('stage_participations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('stage_id', stageId)
      .eq('participant_id', participantId)
      .maybeSingle();

    if (existingByComposite?.id) {
      return { success: true, stageParticipationId: String(existingByComposite.id) };
    }

    // 2. Pastikan participant sudah ada di database; jika belum dan objek participant diberikan, simpan dulu
    const { data: existingParticipant } = await client
      .from('participants')
      .select('id')
      .eq('id', participantId)
      .maybeSingle();

    if (!existingParticipant?.id && participant) {
      const partRes = await this.upsertParticipantWithStage({
        participant: { ...participant, id: participantId, tenantId },
        stageParticipation: { ...stageParticipation, id: spId, tenantId, participantId, stageId },
        levelId
      });
      if (!partRes.success) {
        return { success: false, message: partRes.message };
      }
      const persistedId =
        (partRes.data as { stageParticipationId?: string })?.stageParticipationId || spId;
      return { success: true, stageParticipationId: persistedId };
    }

    // 3. Verifikasi FK tenant, stage, dan participant sebelum insert stage_participations
    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId,
      stageId,
      participantId
    });
    if (!fkCheck.valid) {
      return { success: false, message: fkCheck.message };
    }

    const { data: insertedSp, error: spErr } = await client
      .from('stage_participations')
      .upsert(
        {
          id: spId,
          tenant_id: tenantId,
          participant_id: participantId,
          stage_id: stageId,
          lottery_number: stageParticipation.lotteryNumber,
          status: stageParticipation.status
        },
        { onConflict: 'tenant_id,stage_id,participant_id' }
      )
      .select('id')
      .maybeSingle();

    if (spErr) {
      return { success: false, message: spErr.message };
    }

    if (insertedSp?.id) {
      return { success: true, stageParticipationId: String(insertedSp.id) };
    }

    const { data: recheckSp } = await client
      .from('stage_participations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('stage_id', stageId)
      .eq('participant_id', participantId)
      .maybeSingle();

    return {
      success: Boolean(recheckSp?.id),
      stageParticipationId: recheckSp?.id ? String(recheckSp.id) : spId
    };
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

    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Finalisasi lembar nilai dieksekusi pada penyimpanan lokal.'
      };
    }

    const { data, error } = await client.rpc('finalize_judge_assessment', {
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

    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Pembukaan kembali lembar nilai dieksekusi pada penyimpanan lokal.'
      };
    }

    const { data, error } = await client.rpc('reopen_judge_assessment', {
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
   * RPC 3: Pengesahan Babak & Pelolosan Kualifikasi Atomik di Server (Termasuk Babak Final dengan nextStageId = null).
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

    for (const [pid, r] of Object.entries(params.overrideReasons || {})) {
      if (!r || r.trim().length < 5) {
        return {
          success: false,
          mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
          message: `Alasan override manual untuk peserta ${pid} wajib minimal 5 karakter.`
        };
      }
    }

    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Pengesahan babak dieksekusi pada penyimpanan lokal.'
      };
    }

    // Verifikasi bahwa babak asal (dan babak tujuan jika ada) benar-benar ada di database
    const fkCheck = await this.verifyDatabaseReferencesExist({
      stageId: params.stageId
    });
    if (!fkCheck.valid) {
      return {
        success: false,
        mode: 'supabase_live',
        message: fkCheck.message!
      };
    }
    if (params.nextStageId) {
      const nextStageCheck = await this.verifyDatabaseReferencesExist({
        stageId: params.nextStageId
      });
      if (!nextStageCheck.valid) {
        return {
          success: false,
          mode: 'supabase_live',
          message: nextStageCheck.message!
        };
      }
    }

    const { data, error } = await client.rpc('advance_stage_qualifiers', {
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
   * Mencari atau menyimpan baris assigned_maqras yang nyata di database
   * dan mengembalikan ID primary key sebenarnya dari tabel assigned_maqras.
   */
  async resolveOrPersistAssignedMaqraId(params: {
    tenantId: string;
    stageParticipationId: string;
    questionId?: string;
    assignedMaqraRecordId?: string;
  }): Promise<{ success: boolean; assignedMaqraId?: string; message?: string }> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, message: 'Koneksi database tidak tersedia.' };
    }

    const { tenantId, stageParticipationId, questionId, assignedMaqraRecordId } = params;

    // 1. Jika ada assignedMaqraRecordId, cek apakah baris tersebut benar-benar merupakan assigned_maqras.id di DB
    if (assignedMaqraRecordId && isValidUuid(assignedMaqraRecordId)) {
      const { data: byId } = await client
        .from('assigned_maqras')
        .select('id, question_id')
        .eq('id', assignedMaqraRecordId)
        .eq('stage_participation_id', stageParticipationId)
        .maybeSingle();

      if (byId?.id) {
        return { success: true, assignedMaqraId: String(byId.id) };
      }
    }

    // 2. Cari berdasarkan kombinasi unik (stage_participation_id, question_id)
    const candidateQuestionId = questionId || assignedMaqraRecordId;
    if (candidateQuestionId && isValidUuid(candidateQuestionId)) {
      const { data: byPair } = await client
        .from('assigned_maqras')
        .select('id')
        .eq('stage_participation_id', stageParticipationId)
        .eq('question_id', candidateQuestionId)
        .maybeSingle();

      if (byPair?.id) {
        return { success: true, assignedMaqraId: String(byPair.id) };
      }

      // 3. Jika belum ada di assigned_maqras, pastikan question_id ada di tabel questions lalu buat melalui assignMaqraRecord
      const amRes = await this.assignMaqraRecord({
        id:
          assignedMaqraRecordId &&
          isValidUuid(assignedMaqraRecordId) &&
          assignedMaqraRecordId !== candidateQuestionId
            ? assignedMaqraRecordId
            : toDeterministicUuid(`am-${stageParticipationId}-${candidateQuestionId}`),
        tenantId,
        stageParticipationId,
        questionId: candidateQuestionId,
        method: 'undian'
      });

      if (amRes.success) {
        const persistedAmId = (amRes.data as { assignedMaqraId?: string })?.assignedMaqraId;
        if (persistedAmId) {
          return { success: true, assignedMaqraId: persistedAmId };
        }
      } else {
        return { success: false, message: amRes.message };
      }
    }

    // 4. Fallback: cek apakah ada minimal 1 baris assigned_maqras untuk stage_participation_id ini
    const { data: firstAm } = await client
      .from('assigned_maqras')
      .select('id')
      .eq('stage_participation_id', stageParticipationId)
      .limit(1)
      .maybeSingle();

    if (firstAm?.id) {
      return { success: true, assignedMaqraId: String(firstAm.id) };
    }

    return {
      success: false,
      message:
        'Penetapan maqra (assigned_maqras) belum ditemukan di database untuk peserta pada babak ini. Tetapkan maqra terlebih dahulu.'
    };
  },

  /**
   * Menyimpan draf lembar penilaian yang belum terkunci ke tabel judge_assessments
   * hanya apabila seluruh baris referensi foreign key terbukti ada di database,
   * serta menggunakan assigned_maqra_id nyata dari database.
   */
  async syncAssessmentToRemote(
    assessment: JudgeAssessment,
    assignedMaqraRecordId?: string,
    contextRecords?: {
      stageParticipation?: StageParticipation;
      participant?: Participant;
      levelId?: string | null;
    }
  ): Promise<RpcServiceResult> {
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal aktif: perubahan lembar penilaian disimpan di penyimpanan lokal.'
      };
    }

    let effectiveSpId = assessment.stageParticipationId;
    if (contextRecords?.stageParticipation) {
      const spEnsure = await this.ensureStageParticipationPersisted({
        stageParticipation: contextRecords.stageParticipation,
        participant: contextRecords.participant,
        levelId: contextRecords.levelId
      });
      if (!spEnsure.success || !spEnsure.stageParticipationId) {
        return {
          success: false,
          mode: 'supabase_live',
          message: spEnsure.message || 'Gagal memastikan data partisipasi babak di database.'
        };
      }
      effectiveSpId = spEnsure.stageParticipationId;
    }

    // Resolusi ID baris assigned_maqras yang benar-benar ada di database
    const amResolution = await this.resolveOrPersistAssignedMaqraId({
      tenantId: assessment.tenantId,
      stageParticipationId: effectiveSpId,
      questionId: assessment.questionId,
      assignedMaqraRecordId: assignedMaqraRecordId || assessment.assignedMaqraId
    });

    if (!amResolution.success || !amResolution.assignedMaqraId) {
      return {
        success: false,
        mode: 'supabase_live',
        message:
          amResolution.message ||
          'Gagal memverifikasi atau menyimpan baris assigned_maqras di database.'
      };
    }

    const realAssignedMaqraId = amResolution.assignedMaqraId;

    const uuidCheck = this.validateReferences({
      id: assessment.id,
      tenant_id: assessment.tenantId,
      stage_participation_id: effectiveSpId,
      assigned_maqra_id: realAssignedMaqraId,
      judge_profile_id: assessment.judgeId,
      rubric_version_id: assessment.rubricVersionId
    });

    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: 'supabase_live',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }

    // Verifikasi eksistensi nyata dari seluruh foreign key di database
    const fkExistCheck = await this.verifyDatabaseReferencesExist({
      tenantId: assessment.tenantId,
      stageParticipationId: effectiveSpId,
      assignedMaqraId: realAssignedMaqraId,
      judgeProfileId: assessment.judgeId,
      rubricVersionId: assessment.rubricVersionId
    });

    if (!fkExistCheck.valid) {
      return {
        success: false,
        mode: 'supabase_live',
        message: fkExistCheck.message!,
        validationErrors: fkExistCheck.missingReferences
      };
    }

    // Pastikan tidak pernah mengirim status 'finalized' atau is_locked = true lewat Data API
    const { data: upsertedRow, error } = await client
      .from('judge_assessments')
      .upsert(
        {
          id: assessment.id,
          tenant_id: assessment.tenantId,
          stage_participation_id: effectiveSpId,
          assigned_maqra_id: realAssignedMaqraId,
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
        },
        { onConflict: 'stage_participation_id,assigned_maqra_id,judge_profile_id' }
      )
      .select('id, stage_participation_id, assigned_maqra_id, status, is_locked')
      .maybeSingle();

    if (error) {
      return {
        success: false,
        mode: 'supabase_live',
        message: error.message
      };
    }

    const persistedAssessmentId = upsertedRow?.id ? String(upsertedRow.id) : assessment.id;

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Lembar penilaian draf tersinkronisasi ke tabel judge_assessments.',
      data: {
        assessmentId: persistedAssessmentId,
        stageParticipationId: effectiveSpId,
        assignedMaqraId: realAssignedMaqraId
      }
    };
  },

  /**
   * Menyimpan pendaftaran peserta beserta baris partisipasi babak awal ke Supabase
   * dengan verifikasi keberadaan nyata tenant, kafilah, branch, dan stage di database.
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

    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal: peserta disimpan pada localStorage.'
      };
    }

    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: participant.tenantId,
      kafilahId: participant.kafilahId,
      branchId: participant.branchId,
      stageId: stageParticipation.stageId
    });
    if (!fkCheck.valid) {
      return {
        success: false,
        mode: 'supabase_live',
        message: fkCheck.message!,
        validationErrors: fkCheck.missingReferences
      };
    }

    const { error: partErr } = await client.from('participants').upsert({
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

    const { data: spRow, error: spErr } = await client
      .from('stage_participations')
      .upsert(
        {
          id: stageParticipation.id,
          tenant_id: stageParticipation.tenantId,
          participant_id: participant.id,
          stage_id: stageParticipation.stageId,
          lottery_number: stageParticipation.lotteryNumber,
          status: stageParticipation.status
        },
        { onConflict: 'tenant_id,stage_id,participant_id' }
      )
      .select('id')
      .maybeSingle();

    if (spErr) {
      return { success: false, mode: 'supabase_live', message: spErr.message };
    }

    const realSpId = spRow?.id ? String(spRow.id) : stageParticipation.id;

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Peserta dan partisipasi babak awal tersimpan di Supabase.',
      data: {
        participantId: participant.id,
        stageParticipationId: realSpId
      }
    };
  },

  /**
   * Mencatat penetapan maqra (assigned_maqras) pada Supabase, memverifikasi keberadaan
   * stage_participations dan questions di database, memperbarui status stage_participations,
   * serta mengembalikan ID baris nyata (assigned_maqras.id) dari database.
   */
  async assignMaqraRecord(params: {
    id: string;
    tenantId: string;
    stageParticipationId: string;
    questionId: string;
    method?: 'undian' | 'manual' | 'jadwal';
    stageParticipation?: StageParticipation;
    participant?: Participant;
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

    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal: penetapan maqra disimpan di penyimpanan lokal.'
      };
    }

    let effectiveSpId = params.stageParticipationId;
    if (params.stageParticipation) {
      const spEnsure = await this.ensureStageParticipationPersisted({
        stageParticipation: params.stageParticipation,
        participant: params.participant
      });
      if (!spEnsure.success || !spEnsure.stageParticipationId) {
        return {
          success: false,
          mode: 'supabase_live',
          message: spEnsure.message || 'Gagal memastikan stage_participations di database sebelum penetapan maqra.'
        };
      }
      effectiveSpId = spEnsure.stageParticipationId;
    }

    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: params.tenantId,
      stageParticipationId: effectiveSpId,
      questionId: params.questionId
    });
    if (!fkCheck.valid) {
      return {
        success: false,
        mode: 'supabase_live',
        message: fkCheck.message!,
        validationErrors: fkCheck.missingReferences
      };
    }

    const normalizedMethod = String(params.method || 'undian').toLowerCase();
    const validMethod =
      normalizedMethod === 'manual' || normalizedMethod === 'jadwal' ? normalizedMethod : 'undian';

    const { data: upsertedRow, error } = await client
      .from('assigned_maqras')
      .upsert(
        {
          id: params.id || generateUuid(),
          tenant_id: params.tenantId,
          stage_participation_id: effectiveSpId,
          question_id: params.questionId,
          method: validMethod
        },
        { onConflict: 'stage_participation_id,question_id' }
      )
      .select('id, stage_participation_id, question_id, assigned_at, method')
      .maybeSingle();

    if (error) {
      return { success: false, mode: 'supabase_live', message: error.message };
    }

    let realAssignedMaqraId = upsertedRow?.id ? String(upsertedRow.id) : '';
    if (!realAssignedMaqraId) {
      const { data: fetchedRow, error: fetchErr } = await client
        .from('assigned_maqras')
        .select('id, stage_participation_id, question_id, assigned_at')
        .eq('stage_participation_id', effectiveSpId)
        .eq('question_id', params.questionId)
        .maybeSingle();

      if (fetchErr || !fetchedRow?.id) {
        return {
          success: false,
          mode: 'supabase_live',
          message: fetchErr?.message || 'Gagal membaca kembali ID baris assigned_maqras dari database.'
        };
      }
      realAssignedMaqraId = String(fetchedRow.id);
    }

    await client
      .from('stage_participations')
      .update({ status: 'Belum Dimulai', updated_at: new Date().toISOString() })
      .eq('id', effectiveSpId)
      .eq('status', 'Maqra Belum Ditetapkan');

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Penetapan maqra berhasil disimpan ke tabel assigned_maqras.',
      data: {
        assignedMaqraId: realAssignedMaqraId,
        stageParticipationId: effectiveSpId,
        questionId: params.questionId
      }
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
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const fkCheck = await this.verifyDatabaseReferencesExist({ tenantId: kafilah.tenantId });
    if (!fkCheck.valid) {
      return { success: false, mode: 'supabase_live', message: fkCheck.message! };
    }
    const { error } = await client.from('kafilahs').upsert({
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
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: question.tenantId,
      branchId: branchId && isValidUuid(branchId) ? branchId : undefined,
      stageId: stageId && isValidUuid(stageId) ? stageId : undefined
    });
    if (!fkCheck.valid) {
      return { success: false, mode: 'supabase_live', message: fkCheck.message! };
    }
    const { error } = await client.from('questions').upsert({
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
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: assignment.tenantId,
      stageId: assignment.stageId,
      judgeProfileId: assignment.judgeId,
      branchId: assignment.branchId && isValidUuid(assignment.branchId) ? assignment.branchId : undefined
    });
    if (!fkCheck.valid) {
      return { success: false, mode: 'supabase_live', message: fkCheck.message! };
    }
    const { error } = await client.from('judge_assignments').upsert({
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
    const client = getActiveClient();
    if (!this.isLive() || !client || !isValidUuid(tenantId)) return null;
    const { data, error } = await client
      .from('competition_rule_configs')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return null;
    return data as unknown as CompetitionRuleConfig[];
  },

  async fetchStageResultSnapshots(tenantId: string): Promise<StageResultSnapshot[] | null> {
    const client = getActiveClient();
    if (!this.isLive() || !client || !isValidUuid(tenantId)) return null;
    const { data, error } = await client
      .from('stage_result_snapshots')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return null;
    return data as unknown as StageResultSnapshot[];
  },

  /**
   * Mencatat log audit administrasi melalui RPC tepercaya `append_admin_audit_log`
   * (bukan INSERT langsung ke tabel audit_logs yang telah dikunci).
   */
  async appendAuditLog(entry: AuditLogItem & { tenantId?: string; actorId?: string }): Promise<boolean> {
    const client = getActiveClient();
    if (!this.isLive() || !client) return false;
    if (!entry.tenantId || !isValidUuid(entry.tenantId)) return false;

    const reservedActions = new Set([
      'ASSESSMENT_FINALIZED',
      'ASSESSMENT_REOPENED',
      'STAGE_FINALIZED',
      'CHAMPIONSHIP_FINALIZED'
    ]);
    if (reservedActions.has((entry.action || '').trim().toUpperCase())) {
      // Sudah dicatat secara atomik oleh RPC transaksi utamanya
      return true;
    }

    const { error } = await client.rpc('append_admin_audit_log', {
      p_tenant_id: entry.tenantId,
      p_action: entry.action,
      p_target: entry.target,
      p_summary: entry.summary,
      p_reason: entry.reason ?? null,
      p_outcome: entry.outcome || 'Success'
    });

    return !error;
  },

  async deleteKafilah(tenantId: string, kafilahId: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ tenant_id: tenantId, kafilah_id: kafilahId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client
      .from('kafilahs')
      .delete()
      .eq('id', kafilahId)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Kafilah berhasil dihapus dari database.' };
  },

  async updateParticipantRecord(
    participant: Participant,
    branchId?: string,
    levelId?: string
  ): Promise<RpcServiceResult> {
    const effectiveBranchId = branchId || participant.branchId;
    const uuidCheck = this.validateReferences({
      id: participant.id,
      tenant_id: participant.tenantId,
      kafilah_id: participant.kafilahId,
      branch_id: effectiveBranchId
    });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!,
        validationErrors: uuidCheck.invalidFields
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: participant.tenantId,
      kafilahId: participant.kafilahId,
      branchId: effectiveBranchId
    });
    if (!fkCheck.valid) {
      return { success: false, mode: 'supabase_live', message: fkCheck.message! };
    }

    const { error } = await client
      .from('participants')
      .update({
        kafilah_id: participant.kafilahId,
        branch_id: effectiveBranchId,
        level_id: levelId && isValidUuid(levelId) ? levelId : null,
        participant_number: participant.participantId,
        name: participant.name,
        gender: participant.gender,
        lottery_number: participant.lotteryNumber,
        status: participant.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', participant.id)
      .eq('tenant_id', participant.tenantId);

    if (error) return { success: false, mode: 'supabase_live', message: error.message };

    await client
      .from('stage_participations')
      .update({
        lottery_number: participant.lotteryNumber,
        updated_at: new Date().toISOString()
      })
      .eq('participant_id', participant.id)
      .eq('tenant_id', participant.tenantId);

    return { success: true, mode: 'supabase_live', message: 'Data peserta berhasil diperbarui di database.' };
  },

  async deleteQuestion(tenantId: string, questionId: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ tenant_id: tenantId, question_id: questionId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client
      .from('questions')
      .delete()
      .eq('id', questionId)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Paket soal dihapus dari database.' };
  },

  async unassignMaqraRecord(params: {
    tenantId: string;
    stageParticipationId: string;
    questionId?: string;
  }): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({
      tenant_id: params.tenantId,
      stage_participation_id: params.stageParticipationId,
      ...(params.questionId ? { question_id: params.questionId } : {})
    });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }

    let deleteQuery = client
      .from('assigned_maqras')
      .delete()
      .eq('tenant_id', params.tenantId)
      .eq('stage_participation_id', params.stageParticipationId);

    if (params.questionId && isValidUuid(params.questionId)) {
      deleteQuery = deleteQuery.eq('question_id', params.questionId);
    }

    const { error } = await deleteQuery;
    if (error) {
      return { success: false, mode: 'supabase_live', message: error.message };
    }

    const { data: remainingRows } = await client
      .from('assigned_maqras')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('stage_participation_id', params.stageParticipationId);

    if (!remainingRows || remainingRows.length === 0) {
      await client
        .from('stage_participations')
        .update({
          status: 'Maqra Belum Ditetapkan',
          updated_at: new Date().toISOString()
        })
        .eq('id', params.stageParticipationId)
        .eq('tenant_id', params.tenantId);
    }

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Penetapan maqra berhasil dilepaskan dari database.'
    };
  },

  async deleteJudgeAssignment(tenantId: string, assignmentId: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ tenant_id: tenantId, assignment_id: assignmentId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client
      .from('judge_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Penugasan hakim berhasil dihapus dari database.' };
  },

  async upsertTenant(tenant: Tenant): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: tenant.id });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client.from('tenants').upsert({
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      event_name: tenant.eventName,
      region: tenant.region,
      edition: tenant.edition || null,
      period: tenant.period || null,
      status: tenant.status,
      updated_at: new Date().toISOString()
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Tenant tersimpan di Supabase.' };
  },

  async upsertStage(stage: CompetitionStage): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({
      id: stage.id,
      tenant_id: stage.tenantId,
      ...(stage.branchId ? { branch_id: stage.branchId } : {})
    });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: stage.tenantId,
      branchId: stage.branchId && isValidUuid(stage.branchId) ? stage.branchId : undefined
    });
    if (!fkCheck.valid) {
      return { success: false, mode: 'supabase_live', message: fkCheck.message! };
    }

    const { error } = await client.from('stages').upsert({
      id: stage.id,
      tenant_id: stage.tenantId,
      branch_id: stage.branchId && isValidUuid(stage.branchId) ? stage.branchId : null,
      name: stage.name,
      stage_order: stage.order,
      qualification_quota: stage.qualificationQuota,
      qualification_method: stage.qualificationMethod || 'top_n',
      status: stage.status === 'Selesai' ? 'Aktif' : stage.status,
      is_finalized: false
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Konfigurasi babak tersimpan di Supabase.' };
  },

  async upsertBranch(tenantId: string, branch: GenericMasterItem): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: branch.id, tenant_id: tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client.from('branches').upsert({
      id: branch.id,
      tenant_id: tenantId,
      code: branch.code,
      name: branch.name,
      description: branch.description || null,
      status: branch.status
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Cabang lomba tersimpan di Supabase.' };
  },

  async deleteBranch(tenantId: string, branchId: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: branchId, tenant_id: tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client
      .from('branches')
      .delete()
      .eq('id', branchId)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Cabang lomba berhasil dihapus dari database.' };
  },

  async upsertLevel(tenantId: string, level: GenericMasterItem): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: level.id, tenant_id: tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client.from('levels').upsert({
      id: level.id,
      tenant_id: tenantId,
      code: level.code,
      name: level.name,
      description: level.description || null,
      status: level.status
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Jenjang berhasil disimpan di Supabase.' };
  },

  async deleteLevel(tenantId: string, levelId: string): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: levelId, tenant_id: tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client
      .from('levels')
      .delete()
      .eq('id', levelId)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Jenjang berhasil dihapus dari database.' };
  },

  async upsertErrorCategory(cat: ErrorCategory): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: cat.id, tenant_id: cat.tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client.from('error_categories').upsert({
      id: cat.id,
      tenant_id: cat.tenantId,
      rubric_field_id: cat.fieldId && isValidUuid(cat.fieldId) ? cat.fieldId : null,
      criterion_id: cat.criterionId && isValidUuid(cat.criterionId) ? cat.criterionId : null,
      deduction_rule_id: cat.deductionRuleId && isValidUuid(cat.deductionRuleId) ? cat.deductionRuleId : null,
      code: cat.code,
      name: cat.name,
      scope: cat.scope || null,
      default_deduction: cat.defaultDeduction,
      max_deduction: cat.maxDeduction ?? null,
      method_type: cat.methodType || 'Pengurangan tetap',
      status: cat.status || 'Aktif',
      sort_order: cat.order ?? 1
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Kategori kesalahan tersimpan di Supabase.' };
  },

  async upsertRubricVersionWithFields(tenantId: string, rubric: RubricVersion): Promise<RpcServiceResult> {
    const effectiveTenantId = rubric.tenantId && isValidUuid(rubric.tenantId) ? rubric.tenantId : tenantId;
    const uuidCheck = this.validateReferences({ id: rubric.id, tenant_id: effectiveTenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }

    const { error: rvError } = await client.from('rubric_versions').upsert({
      id: rubric.id,
      tenant_id: effectiveTenantId,
      code: rubric.code,
      name: rubric.name,
      branch_code: rubric.branchCode || null,
      branch_name: rubric.branchName || null,
      version: rubric.version,
      description: rubric.description || null,
      official_source: rubric.officialSource || null,
      starting_score: rubric.startingScore ?? 100,
      status: rubric.status
    });
    if (rvError) return { success: false, mode: 'supabase_live', message: rvError.message };

    for (let idx = 0; idx < (rubric.fields || []).length; idx++) {
      const f = rubric.fields[idx];
      const fieldId = isValidUuid(f.id) ? f.id : toDeterministicUuid(`${rubric.id}:field:${f.code}`);
      const { error: rfError } = await client.from('rubric_fields').upsert({
        id: fieldId,
        rubric_version_id: rubric.id,
        code: f.code,
        name: f.name,
        max_score: f.maxScore,
        min_score: f.minScore ?? 0,
        max_deduction: f.maxDeduction ?? null,
        field_order: f.order ?? idx + 1,
        status: f.status || 'Aktif',
        description: f.description || null
      });
      if (rfError) return { success: false, mode: 'supabase_live', message: rfError.message };
    }

    return { success: true, mode: 'supabase_live', message: 'Versi rubrik & struktur bidang tersimpan di Supabase.' };
  },

  async updateRubricVersionStatus(
    tenantId: string,
    rubricId: string,
    status: 'Draft' | 'Aktif' | 'Arsip'
  ): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({ id: rubricId, tenant_id: tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const { error } = await client
      .from('rubric_versions')
      .update({ status })
      .eq('id', rubricId)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: `Status rubrik diperbarui menjadi ${status}.` };
  },

  async upsertCompetitionRuleConfig(rule: CompetitionRuleConfig): Promise<RpcServiceResult> {
    const uuidCheck = this.validateReferences({
      id: rule.id,
      tenant_id: rule.tenantId,
      ...(rule.branchId ? { branch_id: rule.branchId } : {}),
      rubric_version_id: rule.rubricVersionId
    });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }
    const fkCheck = await this.verifyDatabaseReferencesExist({
      tenantId: rule.tenantId,
      branchId: rule.branchId && isValidUuid(rule.branchId) ? rule.branchId : undefined,
      rubricVersionId: rule.rubricVersionId
    });
    if (!fkCheck.valid) {
      return { success: false, mode: 'supabase_live', message: fkCheck.message! };
    }
    const { error } = await client.from('competition_rule_configs').upsert({
      id: rule.id,
      tenant_id: rule.tenantId,
      branch_id: rule.branchId && isValidUuid(rule.branchId) ? rule.branchId : null,
      branch_name: rule.branchName || null,
      rubric_version_id: rule.rubricVersionId,
      tie_break_order: rule.tieBreakOrder || ['total', 'Tajwid', 'Lagu', 'Fashahah'],
      quota_per_stage: rule.quotaPerStage || { Penyisihan: 3, Final: 3 },
      official_source: rule.officialSource || null,
      is_verified_official: Boolean(rule.isVerifiedOfficial),
      status: rule.status || 'Aktif'
    });
    if (error) return { success: false, mode: 'supabase_live', message: error.message };
    return { success: true, mode: 'supabase_live', message: 'Konfigurasi aturan kompetisi tersimpan di Supabase.' };
  },

  async upsertUserAndMembership(params: {
    tenantId: string;
    user: User;
  }): Promise<RpcServiceResult<{ profileId: string }>> {
    const uuidCheck = this.validateReferences({ tenant_id: params.tenantId });
    if (!uuidCheck.valid) {
      return {
        success: false,
        mode: this.isLive() ? 'supabase_live' : 'local_offline_fallback',
        message: uuidCheck.message!
      };
    }
    const client = getActiveClient();
    if (!this.isLive() || !client) {
      return { success: false, mode: 'local_offline_fallback', message: 'Mode lokal aktif.' };
    }

    const profileIdArg = isValidUuid(params.user.id) ? params.user.id : null;
    const { data, error } = await client.rpc('upsert_tenant_member_profile', {
      p_tenant_id: params.tenantId,
      p_profile_id: profileIdArg,
      p_username: params.user.username,
      p_name: params.user.name,
      p_email: params.user.email,
      p_role: params.user.role,
      p_judge_category: params.user.judgeCategory || null,
      p_judge_field: params.user.judgeField || null,
      p_status: params.user.status || 'Aktif'
    });

    if (error) {
      return { success: false, mode: 'supabase_live', message: error.message };
    }

    const realProfileId =
      (data && typeof data === 'object' && 'profile_id' in data && String(data.profile_id)) ||
      profileIdArg ||
      params.user.id;

    return {
      success: true,
      mode: 'supabase_live',
      message: 'Profil dan keanggotaan pengguna berhasil disimpan di database.',
      data: { profileId: realProfileId }
    };
  },

  subscribeToTenantRealtime(
    tenantId: string,
    onChange: (payload: { table: string; eventType: string }) => void
  ): () => void {
    const client = getActiveClient();
    if (!this.isLive() || !client || !isValidUuid(tenantId) || typeof client.channel !== 'function') {
      return () => {};
    }

    const channelName = `mtq-live-tenant-${tenantId}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'judge_assessments',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload: { eventType?: string }) => {
          onChange({ table: 'judge_assessments', eventType: payload?.eventType || 'UPDATE' });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stage_participations',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload: { eventType?: string }) => {
          onChange({ table: 'stage_participations', eventType: payload?.eventType || 'UPDATE' });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stages',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload: { eventType?: string }) => {
          onChange({ table: 'stages', eventType: payload?.eventType || 'UPDATE' });
        }
      )
      .subscribe();

    return () => {
      try {
        if (typeof client.removeChannel === 'function') {
          client.removeChannel(channel);
        } else if (channel && typeof channel.unsubscribe === 'function') {
          channel.unsubscribe();
        }
      } catch {
        // Ignore cleanup errors on unmount
      }
    };
  }
};
