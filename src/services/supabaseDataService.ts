import { supabase, isSupabaseConfigured, getSupabaseConnectionInfo, SupabaseConnectionInfo } from '../lib/supabaseClient';
import {
  JudgeAssessment,
  AuditLogItem,
  CompetitionRuleConfig,
  StageResultSnapshot
} from '../types/mtq';

export interface RpcServiceResult {
  success: boolean;
  message: string;
  mode: 'supabase_live' | 'local_offline_fallback';
  data?: unknown;
}

/**
 * Service Data Terpisah untuk Operasi Supabase & Pemeriksaan Koneksi.
 * Memisahkan logika akses database dan RPC dari komponen UI.
 * Tidak pernah menyertakan service_role key di sisi klien.
 */
export const supabaseDataService = {
  getConnectionStatus(): SupabaseConnectionInfo {
    return getSupabaseConnectionInfo();
  },

  isLive(): boolean {
    return isSupabaseConfigured() && supabase !== null;
  },

  async reopenJudgeAssessmentRpc(assessmentId: string, reason: string): Promise<RpcServiceResult> {
    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Supabase belum dikonfigurasi. Pembukaan kembali lembar nilai dieksekusi pada penyimpanan lokal.'
      };
    }

    const { data, error } = await supabase.rpc('reopen_judge_assessment', {
      p_assessment_id: assessmentId,
      p_reason: reason
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

  async advanceStageQualifiersRpc(params: {
    stageId: string;
    nextStageId: string | null;
    qualifiedParticipantIds: string[];
    overrideReasons: Record<string, string>;
    rankingsSnapshot?: unknown;
  }): Promise<RpcServiceResult> {
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

  async syncAssessmentToRemote(assessment: JudgeAssessment): Promise<RpcServiceResult> {
    if (!this.isLive() || !supabase) {
      return {
        success: false,
        mode: 'local_offline_fallback',
        message: 'Mode lokal aktif: perubahan lembar penilaian disimpan di penyimpanan lokal.'
      };
    }

    const { error } = await supabase
      .from('judge_assessments')
      .upsert({
        id: assessment.id,
        tenant_id: assessment.tenantId,
        stage_participation_id: assessment.stageParticipationId,
        assigned_maqra_id: assessment.questionId,
        judge_profile_id: assessment.judgeId,
        rubric_version_id: assessment.rubricVersionId,
        status: assessment.status,
        total_deductions: assessment.totalDeductions,
        final_score: assessment.finalScore,
        field_scores: assessment.fieldScores || {},
        error_counts: assessment.errorCounts || {},
        annotations: assessment.annotations || [],
        is_locked: assessment.isLocked ?? (assessment.status === 'finalized'),
        finalized_at: assessment.finalizedAt || null
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

  async fetchCompetitionRules(tenantId: string): Promise<CompetitionRuleConfig[] | null> {
    if (!this.isLive() || !supabase) return null;
    const { data, error } = await supabase
      .from('competition_rule_configs')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return null;
    return data as unknown as CompetitionRuleConfig[];
  },

  async fetchStageResultSnapshots(tenantId: string): Promise<StageResultSnapshot[] | null> {
    if (!this.isLive() || !supabase) return null;
    const { data, error } = await supabase
      .from('stage_result_snapshots')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return null;
    return data as unknown as StageResultSnapshot[];
  },

  async appendAuditLog(entry: AuditLogItem & { tenantId?: string; actorId?: string }): Promise<boolean> {
    if (!this.isLive() || !supabase) return false;
    const { error } = await supabase.from('audit_logs').insert({
      id: entry.id,
      tenant_id: entry.tenantId || null,
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
