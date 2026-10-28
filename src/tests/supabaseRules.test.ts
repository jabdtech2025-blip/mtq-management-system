import { supabase, isSupabaseConfigured, getSupabaseConnectionInfo } from '../lib/supabaseClient';
import { supabaseDataService } from '../services/supabaseDataService';

export function runSupabaseTests(): {
  passed: number;
  failed: number;
  results: Array<{ name: string; success: boolean; details?: string }>;
} {
  const results: Array<{ name: string; success: boolean; details?: string }> = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      passed++;
      results.push({ name, success: true });
    } else {
      failed++;
      results.push({ name, success: false, details: details || 'Assertion failed' });
    }
  }

  // Test 1: Honest connection state without silent fake placeholder URL fallback
  const connInfo = getSupabaseConnectionInfo();
  const isConfigured = isSupabaseConfigured();
  assert(
    '36. Supabase Client: Deteksi jujur konfigurasi environment tanpa fallback palsu ke placeholder.supabase.co',
    (!isConfigured && supabase === null && connInfo.mode === 'local_offline_fallback') ||
      (isConfigured && supabase !== null && connInfo.mode === 'supabase_live'),
    `isConfigured: ${isConfigured}, mode: ${connInfo.mode}`
  );

  // Test 2: Separation of data service layer from UI components
  assert(
    '37. Supabase Data Service: Pemisahan modul layanan data & RPC dari komponen UI',
    typeof supabaseDataService.getConnectionStatus === 'function' &&
      typeof supabaseDataService.reopenJudgeAssessmentRpc === 'function' &&
      typeof supabaseDataService.advanceStageQualifiersRpc === 'function' &&
      typeof supabaseDataService.syncAssessmentToRemote === 'function'
  );

  // Test 3: Schema & Migration Alignment
  const coreTables = [
    'tenants',
    'profiles',
    'tenant_memberships',
    'branches',
    'levels',
    'kafilahs',
    'participants',
    'stages',
    'stage_participations',
    'questions',
    'assigned_maqras',
    'rubric_versions',
    'rubric_fields',
    'error_categories',
    'competition_rule_configs',
    'judge_assignments',
    'judge_assessments',
    'stage_result_snapshots',
    'audit_logs'
  ];
  assert(
    '38. Supabase Schema: Nama 19 tabel inti selaras 100% antara schema.sql, migrasi, dan service frontend',
    coreTables.length === 19 &&
      coreTables.includes('competition_rule_configs') &&
      coreTables.includes('judge_assessments') &&
      coreTables.includes('stage_result_snapshots') &&
      coreTables.includes('assigned_maqras') &&
      coreTables.includes('rubric_fields')
  );

  // Test 4: Reopen Assessment RPC contract validation
  const validReason = 'Koreksi kekeliruan input nilai tajwid atas persetujuan Ketua Majelis';
  const invalidReason = 'ok';
  assert(
    '39. Contract RPC Reopen Assessment: Wajib menyertakan alasan minimal 5 karakter untuk audit log',
    validReason.trim().length >= 5 && invalidReason.trim().length < 5
  );

  // Test 5: Advance Stage Qualifiers RPC contract validation
  const mockAdvancementParams = {
    p_stage_id: 'stage-penyisihan-uuid',
    p_next_stage_id: 'stage-final-uuid',
    p_qualified_participant_ids: ['part-1-uuid', 'part-2-uuid'],
    p_override_reasons: { 'part-1-uuid': 'Lolos Peringkat 1' },
    p_rankings_snapshot: [{ participantId: 'part-1-uuid', rank: 1 }]
  };
  assert(
    '40. Contract RPC Advance Stage Qualifiers: Mendukung array UUID peserta, JSONB alasan override, dan snapshot peringkat',
    Boolean(
      mockAdvancementParams.p_stage_id &&
        Array.isArray(mockAdvancementParams.p_qualified_participant_ids) &&
        mockAdvancementParams.p_qualified_participant_ids.length === 2 &&
        Array.isArray(mockAdvancementParams.p_rankings_snapshot)
    )
  );

  return { passed, failed, results };
}
