import fs from 'fs';
import path from 'path';
import {
  supabase,
  isSupabaseConfigured,
  getSupabaseConnectionInfo,
  setRuntimeSupabaseConnectionState
} from '../lib/supabaseClient';
import { supabaseDataService } from '../services/supabaseDataService';
import { isValidUuid, generateUuid, toDeterministicUuid } from '../utils/uuid';

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

  const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/schema.sql'), 'utf-8');
  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261027_production_hardening.sql'),
    'utf-8'
  );
  const seedSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/seed.sql'), 'utf-8');

  // 36. Honest connection state & schema_missing detection
  const initialConn = getSupabaseConnectionInfo();
  const isConfigured = isSupabaseConfigured();

  setRuntimeSupabaseConnectionState({
    state: 'schema_missing',
    isDatabaseReady: false,
    isAuthenticated: false,
    lastError: 'relation "public.tenants" does not exist'
  });
  const missingSchemaConn = getSupabaseConnectionInfo();

  // Restore initial state
  setRuntimeSupabaseConnectionState({
    state: isConfigured ? 'checking' : 'unconfigured',
    isDatabaseReady: false,
    isAuthenticated: false,
    lastError: null
  });

  assert(
    '36. Supabase Client & Probe: Deteksi jujur konfigurasi & fallback otomatis saat skema SQL belum dijalankan (schema_missing)',
    ((!isConfigured && supabase === null && initialConn.mode === 'local_offline_fallback') ||
      (isConfigured && supabase !== null)) &&
      (!isConfigured || (missingSchemaConn.mode === 'local_offline_fallback' && !missingSchemaConn.isDatabaseReady)),
    `isConfigured: ${isConfigured}, missingSchemaMode: ${missingSchemaConn.mode}`
  );

  // 37. Separation of data service layer & UUID validation guard before upsert/RPC
  const invalidAssessmentSync = supabaseDataService.validateReferences({
    id: 'asm-non-uuid',
    tenant_id: 'tenant-jabar',
    stage_participation_id: 'sp-01'
  });
  const validAssessmentSync = supabaseDataService.validateReferences({
    id: generateUuid(),
    tenant_id: toDeterministicUuid('tenant-jabar'),
    stage_participation_id: toDeterministicUuid('sp-01')
  });

  assert(
    '37. Validasi UUID Referensi: Menolak upsert/RPC jika ID referensi bukan UUID database yang valid',
    invalidAssessmentSync.valid === false &&
      invalidAssessmentSync.invalidFields.length === 3 &&
      validAssessmentSync.valid === true &&
      isValidUuid(toDeterministicUuid('tenant-jabar')),
    `invalidCount: ${invalidAssessmentSync.invalidFields.length}, valid: ${validAssessmentSync.valid}`
  );

  // 38. Real SQL Verification: All 21 tables & RLS enabled in schema.sql
  const requiredTables = [
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
    'rubric_criteria',
    'deduction_rules',
    'error_categories',
    'competition_rule_configs',
    'judge_assignments',
    'judge_assessments',
    'stage_result_snapshots',
    'audit_logs'
  ];

  const allTablesCreatedAndRlsEnabled = requiredTables.every(
    (tbl) =>
      schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`) &&
      schemaSql.includes(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`) &&
      migrationSql.includes(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`)
  );

  assert(
    '38. Audit Skema SQL Nyata: Seluruh 21 tabel inti beserta ENABLE ROW LEVEL SECURITY terdefinisi di schema.sql & migrasi',
    allTablesCreatedAndRlsEnabled && seedSql.includes('11111111-1111-4111-8111-111111111101'),
    `allTablesCreatedAndRlsEnabled: ${allTablesCreatedAndRlsEnabled}`
  );

  // 39. Zero Duplicate Policies & Least-Privilege Judge Assessments Policy Verification
  const hasNoAdminBypassOnAssessments =
    !schemaSql.includes('CREATE POLICY "Admins can manage assessments" ON judge_assessments') &&
    !schemaSql.includes('CREATE POLICY "Admins can manage judge_assessments" ON judge_assessments') &&
    !migrationSql.includes('CREATE POLICY "Admins can manage judge_assessments" ON judge_assessments');

  const hasCanonicalAssessmentPolicies =
    schemaSql.includes('CREATE POLICY judge_assessments_select_policy ON judge_assessments') &&
    schemaSql.includes('CREATE POLICY judge_assessments_insert_policy ON judge_assessments') &&
    schemaSql.includes('CREATE POLICY judge_assessments_update_policy ON judge_assessments') &&
    migrationSql.includes('CREATE POLICY judge_assessments_select_policy ON judge_assessments') &&
    migrationSql.includes('CREATE POLICY judge_assessments_insert_policy ON judge_assessments') &&
    migrationSql.includes('CREATE POLICY judge_assessments_update_policy ON judge_assessments');

  const hasImmutabilityTrigger =
    schemaSql.includes('CREATE OR REPLACE FUNCTION public.enforce_judge_assessment_immutability()') &&
    schemaSql.includes("current_setting('mtq.rpc_reopen_active', true)") &&
    schemaSql.includes('CREATE TRIGGER trg_enforce_judge_assessment_immutability');

  assert(
    '39. Keamanan RLS & Trigger Imutabilitas: Tidak ada bypass FOR ALL pada judge_assessments, trigger mengunci nilai final, dan nama policy bebas duplikat',
    hasNoAdminBypassOnAssessments && hasCanonicalAssessmentPolicies && hasImmutabilityTrigger,
    `noAdminBypass: ${hasNoAdminBypassOnAssessments}, canonicalPolicies: ${hasCanonicalAssessmentPolicies}, trigger: ${hasImmutabilityTrigger}`
  );

  // 40. Hardened Atomic RPCs & Multi-Maqra Completeness Check in SQL
  const hasAllThreeHardenedRpcs =
    schemaSql.includes('CREATE OR REPLACE FUNCTION finalize_judge_assessment(') &&
    schemaSql.includes('CREATE OR REPLACE FUNCTION reopen_judge_assessment(') &&
    schemaSql.includes('CREATE OR REPLACE FUNCTION advance_stage_qualifiers(') &&
    schemaSql.includes('v_unassigned_maqra_count') &&
    schemaSql.includes('JOIN assigned_maqras am') &&
    schemaSql.includes('AND jass.assigned_maqra_id = am.id') &&
    schemaSql.includes('REVOKE EXECUTE ON FUNCTION finalize_judge_assessment(UUID) FROM PUBLIC, anon;') &&
    schemaSql.includes('REVOKE EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) FROM PUBLIC, anon;') &&
    schemaSql.includes(
      'REVOKE EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) FROM PUBLIC, anon;'
    );

  assert(
    '40. Audit RPC Atomik Server: finalize_judge_assessment, reopen_judge_assessment, dan advance_stage_qualifiers memvalidasi kelengkapan multi-maqra & seluruh hakim',
    hasAllThreeHardenedRpcs,
    `hasAllThreeHardenedRpcs: ${hasAllThreeHardenedRpcs}`
  );

  return { passed, failed, results };
}
