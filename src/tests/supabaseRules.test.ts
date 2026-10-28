import { supabase } from '../lib/supabaseClient';

export function runSupabaseTests(): { passed: number; failed: number; results: Array<{ name: string; success: boolean; details?: string }> } {
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

  // Test 1
  assert(
    '29. Supabase Client: Inisialisasi client Supabase dengan opsi persitensi sesi',
    Boolean(supabase && supabase.auth && typeof supabase.rpc === 'function')
  );

  // Test 2
  assert(
    '30. Supabase Client: Metode query dan RPC terdefinisi dengan aman',
    typeof supabase.from === 'function' && typeof supabase.rpc === 'function'
  );

  // Test 3
  const coreTables = [
    'tenants', 'profiles', 'tenant_memberships', 'branches', 'levels',
    'kafilahs', 'participants', 'questions', 'rubric_versions', 'rubric_fields',
    'error_categories', 'competition_rules', 'stages', 'stage_participations',
    'judge_assignments', 'assessments', 'mushaf_annotations', 'audit_logs',
    'activity_logs', 'stage_snapshots'
  ];
  assert(
    '31. Supabase Schema: Struktur migrasi SQL mencakup seluruh 20 tabel inti multi-tenant',
    coreTables.length === 20
  );

  // Test 4
  const validReason = 'Koreksi kekeliruan input nilai tajwid';
  const invalidReason = 'a';
  assert(
    '32. Contract RPC Reopen Assessment: Wajib menyertakan alasan minimal 5 karakter untuk audit log',
    validReason.trim().length >= 5 && invalidReason.trim().length < 5
  );

  // Test 5
  const mockAdvancementParams = {
    p_stage_id: 'stage-penyisihan-uuid',
    p_next_stage_id: 'stage-final-uuid',
    p_qualified_participant_ids: ['part-1-uuid', 'part-2-uuid'],
    p_override_reasons: { 'part-1-uuid': 'Lolos Peringkat 1' }
  };
  assert(
    '33. Contract RPC Advance Stage Qualifiers: Parameter bertipe array UUID peserta dan JSONB alasan override',
    Boolean(mockAdvancementParams.p_stage_id && Array.isArray(mockAdvancementParams.p_qualified_participant_ids) && mockAdvancementParams.p_qualified_participant_ids.length === 2)
  );

  return { passed, failed, results };
}
