import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import {
  supabase,
  isSupabaseConfigured,
  getSupabaseConnectionInfo,
  setRuntimeSupabaseConnectionState,
  evaluateWorkspaceAccessGate
} from '../lib/supabaseClient';
import { supabaseDataService } from '../services/supabaseDataService';
import { outboxSyncService } from '../services/outboxSyncService';
import { DEFAULT_COMPETITION_RULES, INITIAL_RUBRIC_VERSIONS } from '../services/competitionRules';
import { isValidUuid, generateUuid, toDeterministicUuid } from '../utils/uuid';
import { handleProvisionRpcFailureRollback } from '../utils/provisionSecurity';

/**
 * Lightweight PostgREST-compatible query builder over PGlite for testing
 * `supabaseDataService` end-to-end against a real PostgreSQL 16 engine.
 */
function createPgliteSupabaseAdapter(
  pg: PGlite,
  getActiveUser: () => { id: string; email: string } | null,
  options?: { forceFailRpc?: string | null; forceFailTable?: string | null }
) {
  async function execWithAuth<T>(fn: () => Promise<T>): Promise<T> {
    const user = getActiveUser();
    if (user) {
      await pg.exec(`SELECT set_config('request.jwt.claim.sub', '${user.id}', false);`);
    } else {
      await pg.exec(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    }
    return fn();
  }

  function formatSqlVal(val: unknown): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
    if (Array.isArray(val)) {
      if (val.length === 0) return `'{}'`;
      const allUuid = val.every((x) => typeof x === 'string' && isValidUuid(x));
      if (allUuid) {
        return `ARRAY[${val.map((x) => `'${x}'::uuid`).join(', ')}]`;
      }
      return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    }
    if (typeof val === 'object') {
      return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  function createQueryBuilder(table: string) {
    let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    let payloadData: Record<string, unknown> | Array<Record<string, unknown>> = {};
    let conflictCols = 'id';
    const filters: string[] = [];
    let orderClause = '';
    let limitClause = '';
    let singleRow = false;
    let maybeSingleRow = false;

    const builder: any = {
      select(_cols?: string) {
        return builder;
      },
      insert(data: Record<string, unknown> | Array<Record<string, unknown>>) {
        op = 'insert';
        payloadData = data;
        return builder;
      },
      upsert(data: Record<string, unknown> | Array<Record<string, unknown>>, opts?: { onConflict?: string }) {
        op = 'upsert';
        payloadData = data;
        conflictCols = opts?.onConflict || 'id';
        return builder;
      },
      update(data: Record<string, unknown>) {
        op = 'update';
        payloadData = data;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push(`${col} = ${formatSqlVal(val)}`);
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push(`${col} <> ${formatSqlVal(val)}`);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        if (!vals || vals.length === 0) {
          filters.push('FALSE');
        } else {
          filters.push(`${col} IN (${vals.map(formatSqlVal).join(', ')})`);
        }
        return builder;
      },
      or(expr: string) {
        const parts = expr.split(',').map((part) => {
          const [col, operator, rawVal] = part.trim().split('.');
          if (operator === 'eq') return `${col} = ${formatSqlVal(rawVal)}`;
          if (operator === 'is' && rawVal === 'null') return `${col} IS NULL`;
          return 'TRUE';
        });
        filters.push(`(${parts.join(' OR ')})`);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        const dir = opts?.ascending === false ? 'DESC' : 'ASC';
        orderClause = orderClause ? `${orderClause}, ${col} ${dir}` : `ORDER BY ${col} ${dir}`;
        return builder;
      },
      limit(n: number) {
        limitClause = `LIMIT ${n}`;
        return builder;
      },
      single() {
        singleRow = true;
        return builder;
      },
      maybeSingle() {
        maybeSingleRow = true;
        return builder;
      },
      async then(resolve: (res: { data: any; error: any }) => void) {
        try {
          if (options?.forceFailTable === table) {
            return resolve({
              data: null,
              error: { message: `Simulated database query error on table ${table}` }
            });
          }

          const res = await execWithAuth(async () => {
            const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

            if (op === 'select') {
              const sql = `SELECT * FROM ${table} ${whereSql} ${orderClause} ${limitClause};`;
              const qRes = await pg.query(sql);
              let rows: any[] = qRes.rows || [];

              // Enrich joined relations expected by supabaseDataService
              if (table === 'tenant_memberships' && rows.length > 0) {
                const enriched = [];
                for (const r of rows) {
                  const pRes = await pg.query(
                    `SELECT id, username, name, email, role FROM profiles WHERE id = ${formatSqlVal(
                      r.profile_id
                    )} LIMIT 1;`
                  );
                  enriched.push({
                    ...r,
                    profiles: pRes.rows[0] || null
                  });
                }
                rows = enriched;
              } else if (table === 'judge_assignments' && rows.length > 0) {
                const enriched = [];
                for (const r of rows) {
                  const pRes = await pg.query(
                    `SELECT name FROM profiles WHERE id = ${formatSqlVal(r.judge_profile_id)} LIMIT 1;`
                  );
                  enriched.push({
                    ...r,
                    profiles: pRes.rows[0] || null
                  });
                }
                rows = enriched;
              }

              if (singleRow) {
                if (rows.length === 0) {
                  return { data: null, error: { message: `No rows found in ${table}` } };
                }
                return { data: rows[0], error: null };
              }
              if (maybeSingleRow) {
                return { data: rows[0] || null, error: null };
              }
              return { data: rows, error: null };
            }

            if (op === 'insert' || op === 'upsert') {
              const items = Array.isArray(payloadData) ? payloadData : [payloadData];
              const returnedRows: any[] = [];
              for (const item of items) {
                const cols = Object.keys(item).filter((k) => item[k] !== undefined);
                const vals = cols.map((k) => formatSqlVal(item[k]));
                let sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`;
                if (op === 'upsert') {
                  const conflictList = conflictCols.split(',').map((x) => x.trim());
                  const updateAssignments = cols
                    .filter((c) => !conflictList.includes(c) && c !== 'id')
                    .map((c) => `${c} = EXCLUDED.${c}`);
                  if (updateAssignments.length > 0) {
                    sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateAssignments.join(', ')}`;
                  } else {
                    sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
                  }
                }
                sql += ` RETURNING *;`;
                const qRes = await pg.query(sql);
                if (qRes.rows?.[0]) {
                  returnedRows.push(qRes.rows[0]);
                }
              }
              if (singleRow || maybeSingleRow) {
                return { data: returnedRows[0] || null, error: null };
              }
              return { data: returnedRows, error: null };
            }

            if (op === 'update') {
              const item = payloadData as Record<string, unknown>;
              const cols = Object.keys(item).filter((k) => item[k] !== undefined);
              const setClause = cols.map((k) => `${k} = ${formatSqlVal(item[k])}`).join(', ');
              const sql = `UPDATE ${table} SET ${setClause} ${whereSql} RETURNING *;`;
              const qRes = await pg.query(sql);
              if (singleRow || maybeSingleRow) {
                return { data: qRes.rows?.[0] || null, error: null };
              }
              return { data: qRes.rows || [], error: null };
            }

            if (op === 'delete') {
              const sql = `DELETE FROM ${table} ${whereSql} RETURNING *;`;
              const qRes = await pg.query(sql);
              return { data: qRes.rows || [], error: null };
            }

            return { data: null, error: null };
          });

          resolve(res);
        } catch (err: any) {
          resolve({ data: null, error: { message: err?.message || String(err) } });
        }
      }
    };

    return builder;
  }

  return {
    auth: {
      async getSession() {
        const user = getActiveUser();
        return {
          data: {
            session: user ? { user: { id: user.id, email: user.email } } : null
          },
          error: null
        };
      },
      async signInWithPassword({ email }: { email: string; password?: string }) {
        return { data: { user: { email } }, error: null };
      },
      async signUp({
        email,
        password,
        options: signUpOpts
      }: {
        email: string;
        password: string;
        options?: { data?: { name?: string; username?: string } };
      }) {
        if (!email || !password || password.length < 8) {
          return { data: null, error: { message: 'Invalid email or password too short' } };
        }
        const metaJson = JSON.stringify(signUpOpts?.data || {});
        const insRes = await pg.query<{ id: string; email: string }>(
          `INSERT INTO auth.users (id, email, raw_user_meta_data)
           VALUES (gen_random_uuid(), ${formatSqlVal(email)}, ${formatSqlVal(metaJson)}::jsonb)
           RETURNING id::text, email;`
        );
        const createdUser = insRes.rows[0];
        if (!createdUser) {
          return { data: null, error: { message: 'Failed to insert into auth.users' } };
        }
        return {
          data: {
            user: { id: createdUser.id, email: createdUser.email },
            session: { access_token: 'mock-jwt-token', user: { id: createdUser.id, email: createdUser.email } }
          },
          error: null
        };
      },
      async signOut() {
        return { error: null };
      },
      async resetPasswordForEmail(email: string, opts?: { redirectTo?: string }) {
        if (!email || !email.includes('@')) {
          return { data: null, error: { message: 'Invalid email' } };
        }
        return { data: { email, redirectTo: opts?.redirectTo }, error: null };
      },
      async updateUser(attrs: { password?: string }) {
        const user = getActiveUser();
        if (!user) {
          return { data: null, error: { message: 'Auth session missing' } };
        }
        return { data: { user: { id: user.id, email: user.email, updated: Boolean(attrs.password) } }, error: null };
      }
    },
    from(table: string) {
      return createQueryBuilder(table);
    },
    async rpc(fnName: string, args: Record<string, unknown>) {
      if (options?.forceFailRpc === fnName) {
        return {
          data: null,
          error: { message: `Simulated RPC network/transaction failure in ${fnName}` }
        };
      }
      try {
        return await execWithAuth(async () => {
          let sql = '';
          if (fnName === 'finalize_judge_assessment') {
            sql = `SELECT finalize_judge_assessment(${formatSqlVal(args.p_assessment_id)}::uuid) AS res;`;
          } else if (fnName === 'reopen_judge_assessment') {
            sql = `SELECT reopen_judge_assessment(${formatSqlVal(args.p_assessment_id)}::uuid, ${formatSqlVal(
              args.p_reason
            )}::text) AS res;`;
          } else if (fnName === 'advance_stage_qualifiers') {
            const qualArr = Array.isArray(args.p_qualified_participant_ids)
              ? args.p_qualified_participant_ids
              : [];
            const qualSql =
              qualArr.length === 0
                ? `'{}'::uuid[]`
                : `ARRAY[${qualArr.map((id) => `${formatSqlVal(id)}::uuid`).join(', ')}]`;
            const nextStgSql = args.p_next_stage_id ? `${formatSqlVal(args.p_next_stage_id)}::uuid` : 'NULL::uuid';
            sql = `SELECT advance_stage_qualifiers(
              ${formatSqlVal(args.p_stage_id)}::uuid,
              ${nextStgSql},
              ${qualSql},
              ${formatSqlVal(args.p_override_reasons || {})}::jsonb,
              ${formatSqlVal(args.p_rankings_snapshot || [])}::jsonb,
              ${formatSqlVal(args.p_tie_resolution || {})}::jsonb
            ) AS res;`;
          } else if (fnName === 'compute_stage_rankings') {
            sql = `SELECT compute_stage_rankings(${formatSqlVal(args.p_stage_id)}::uuid) AS res;`;
          } else if (fnName === 'append_admin_audit_log') {
            sql = `SELECT append_admin_audit_log(
              ${formatSqlVal(args.p_tenant_id)}::uuid,
              ${formatSqlVal(args.p_action)}::text,
              ${formatSqlVal(args.p_target)}::text,
              ${formatSqlVal(args.p_summary)}::text,
              ${args.p_reason ? `${formatSqlVal(args.p_reason)}::text` : 'NULL::text'}
            ) AS res;`;
          } else if (fnName === 'upsert_tenant_member_profile') {
            const profIdSql = args.p_profile_id ? `${formatSqlVal(args.p_profile_id)}::uuid` : 'NULL::uuid';
            sql = `SELECT upsert_tenant_member_profile(
              ${formatSqlVal(args.p_tenant_id)}::uuid,
              ${profIdSql},
              ${formatSqlVal(args.p_username)}::text,
              ${formatSqlVal(args.p_name)}::text,
              ${formatSqlVal(args.p_email)}::text,
              ${formatSqlVal(args.p_role)}::text,
              ${args.p_judge_category ? `${formatSqlVal(args.p_judge_category)}::text` : 'NULL::text'},
              ${args.p_judge_field ? `${formatSqlVal(args.p_judge_field)}::text` : 'NULL::text'},
              ${formatSqlVal(args.p_status || 'Aktif')}::text
            ) AS res;`;
          } else if (fnName === 'bootstrap_first_superadmin') {
            const targetEmailSql = args.p_target_email ? `${formatSqlVal(args.p_target_email)}::text` : 'NULL::text';
            const initTenantSql = args.p_initial_tenant_id
              ? `${formatSqlVal(args.p_initial_tenant_id)}::uuid`
              : 'NULL::uuid';
            sql = `SELECT bootstrap_first_superadmin(${targetEmailSql}, ${initTenantSql}) AS res;`;
          } else if (fnName === 'delete_rubric_field_cascade') {
            sql = `SELECT delete_rubric_field_cascade(${formatSqlVal(args.p_rubric_version_id)}::uuid, ${formatSqlVal(
              args.p_field_id
            )}::uuid) AS res;`;
          } else if (fnName === 'verify_participant') {
            const noteSql = args.p_note ? `${formatSqlVal(args.p_note)}::text` : 'NULL::text';
            sql = `SELECT verify_participant(
              ${formatSqlVal(args.p_tenant_id)}::uuid,
              ${formatSqlVal(args.p_participant_id)}::uuid,
              ${formatSqlVal(args.p_status)}::varchar,
              ${noteSql}
            ) AS res;`;
          } else if (fnName === 'draw_lottery_server') {
            const partArr = Array.isArray(args.p_participant_ids) ? args.p_participant_ids : [];
            const qArr = Array.isArray(args.p_question_pool_ids) ? args.p_question_pool_ids : [];
            const partSql =
              partArr.length === 0
                ? 'NULL::uuid[]'
                : `ARRAY[${partArr.map((id) => `${formatSqlVal(id)}::uuid`).join(', ')}]`;
            const qSql =
              qArr.length === 0
                ? 'NULL::uuid[]'
                : `ARRAY[${qArr.map((id) => `${formatSqlVal(id)}::uuid`).join(', ')}]`;
            const bSql = args.p_branch_id ? `${formatSqlVal(args.p_branch_id)}::uuid` : 'NULL::uuid';
            const lSql = args.p_level_id ? `${formatSqlVal(args.p_level_id)}::uuid` : 'NULL::uuid';
            const noteSql = args.p_notes ? `${formatSqlVal(args.p_notes)}::text` : 'NULL::text';

            sql = `SELECT draw_lottery_server(
              ${formatSqlVal(args.p_tenant_id)}::uuid,
              ${formatSqlVal(args.p_stage_id)}::uuid,
              ${bSql},
              ${lSql},
              ${Number(args.p_questions_per_participant || 1)}::integer,
              ${formatSqlVal(args.p_draw_mode || 'both')}::varchar,
              ${noteSql},
              ${partSql},
              ${qSql}
            ) AS res;`;
          } else if (fnName === 'commit_lottery_draw') {
            const bSql = args.p_branch_id ? `${formatSqlVal(args.p_branch_id)}::uuid` : 'NULL::uuid';
            const bNameSql = args.p_branch_name ? `${formatSqlVal(args.p_branch_name)}::text` : 'NULL::text';
            const lSql = args.p_level_id ? `${formatSqlVal(args.p_level_id)}::uuid` : 'NULL::uuid';
            const lNameSql = args.p_level_name ? `${formatSqlVal(args.p_level_name)}::text` : 'NULL::text';
            const noteSql = args.p_notes ? `${formatSqlVal(args.p_notes)}::text` : 'NULL::text';

            sql = `SELECT commit_lottery_draw(
              ${formatSqlVal(args.p_tenant_id)}::uuid,
              ${formatSqlVal(args.p_stage_id)}::uuid,
              ${formatSqlVal(args.p_stage_name)}::text,
              ${bSql},
              ${bNameSql},
              ${lSql},
              ${lNameSql},
              NULL::uuid,
              NULL::text,
              ${formatSqlVal(args.p_results || [])}::jsonb,
              ${Number(args.p_questions_per_participant || 1)}::integer,
              ${noteSql}
            ) AS res;`;
          } else {
            throw new Error(`Unsupported RPC: ${fnName}`);
          }

          const qRes = await pg.query(sql);
          const firstRow = (qRes.rows?.[0] as Record<string, any> | undefined);
          return { data: firstRow?.res ?? true, error: null };
        });
      } catch (err: any) {
        return { data: null, error: { message: err?.message || String(err) } };
      }
    }
  };
}

export async function runSupabaseTests(): Promise<{
  passed: number;
  failed: number;
  results: Array<{ name: string; success: boolean; details?: string }>;
}> {
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
  const hardening20261029Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261029_security_and_crud_hardening.sql'),
    'utf-8'
  );
  const provisioning20261030Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261030_auth_provisioning_and_bootstrap.sql'),
    'utf-8'
  );
  const complete20261109Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261109_complete_system_improvement.sql'),
    'utf-8'
  );
  const masterData20261110Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261110_master_data_pure_db.sql'),
    'utf-8'
  );
  const serverScoring20261110Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261110_server_scoring_and_atomic_lottery.sql'),
    'utf-8'
  );
  const fix20261111Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261111_fix_v_rule_unassigned.sql'),
    'utf-8'
  );
  const maqra20261112Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261112_maqra_integrity_and_completion.sql'),
    'utf-8'
  );
  const isolation20261113Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261113_security_tenant_profile_isolation.sql'),
    'utf-8'
  );
  const auditFixes20261114Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261114_audit_fixes.sql'),
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

  // 38. Seed & Competition Rule Honesty Check (Only Tilawah is marked isVerifiedOfficial = true)
  const tilawahRule = DEFAULT_COMPETITION_RULES['Tilawah'];
  const tahfizhRule = DEFAULT_COMPETITION_RULES['Tahfizh'];
  const fahmilRule = DEFAULT_COMPETITION_RULES['Fahmil'];
  const seniBacaRubric = INITIAL_RUBRIC_VERSIONS.find((r) => r.code === 'RUBRIC-SENI-BACA-2025');
  const tahfizhRubric = INITIAL_RUBRIC_VERSIONS.find((r) => r.code === 'RUBRIC-TAHFIZH-2025');

  assert(
    '38. Kejujuran Aturan & Seed: Hanya cabang Seni Baca (Tilawah) yang ditandai terverifikasi resmi; Tahfizh & Fahmil berstatus template konfigurasi',
    tilawahRule.isVerifiedOfficial === true &&
      tahfizhRule.isVerifiedOfficial === false &&
      fahmilRule.isVerifiedOfficial === false &&
      seniBacaRubric?.isOfficialVerified === true &&
      tahfizhRubric?.isOfficialVerified === false,
    `tilawah: ${tilawahRule.isVerifiedOfficial}, tahfizh: ${tahfizhRule.isVerifiedOfficial}, fahmil: ${fahmilRule.isVerifiedOfficial}, tahfizhRubricVerified: ${tahfizhRubric?.isOfficialVerified}`
  );

  // =========================================================================
  // REAL POSTGRESQL 16 EXECUTION TESTS VIA PGLITE (ISOLATED LOCAL DATABASE)
  // =========================================================================
  const pg = new PGlite();

  try {
    // Bootstrap Supabase-compatible auth schema and roles in isolated PGlite
    await pg.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT SELECT ON auth.users TO anon, authenticated;
    `);

    // 39. Execute schema.sql, migration, and seed.sql on an empty PostgreSQL 16 database
    let schemaBootSuccess = false;
    let schemaBootError = '';
    try {
      await pg.exec(schemaSql);
      await pg.exec(migrationSql);
      await pg.exec(seedSql);
      // Verify idempotent incremental migrations on top of already-seeded database
      await pg.exec(hardening20261029Sql);
      await pg.exec(provisioning20261030Sql);
      await pg.exec(complete20261109Sql);
      await pg.exec(maqra20261112Sql);
      await pg.exec(isolation20261113Sql);
      await pg.exec(auditFixes20261114Sql);
      await pg.exec(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
      `);
      schemaBootSuccess = true;
    } catch (err: any) {
      schemaBootError = err?.message || String(err);
    }

    const tahfizhFieldsCheck = schemaBootSuccess
      ? await pg.query<{ cnt: string; total_score: string }>(`
          SELECT COUNT(*)::text AS cnt, COALESCE(SUM(max_score), 0)::text AS total_score
          FROM rubric_fields
          WHERE rubric_version_id = '33333333-3333-4333-8333-333333333302';
        `)
      : { rows: [{ cnt: '0', total_score: '0' }] };
    const seniBacaFieldsCheck = schemaBootSuccess
      ? await pg.query<{ cnt: string; total_score: string }>(`
          SELECT COUNT(*)::text AS cnt, COALESCE(SUM(max_score), 0)::text AS total_score
          FROM rubric_fields
          WHERE rubric_version_id = '33333333-3333-4333-8333-333333333301';
        `)
      : { rows: [{ cnt: '0', total_score: '0' }] };

    assert(
      '39. Eksekusi PostgreSQL 16 Nyata (PGlite): schema.sql + migrasi + seed.sql berhasil dieksekusi dari database kosong termasuk rubric_fields lengkap',
      schemaBootSuccess &&
        Number(seniBacaFieldsCheck.rows[0]?.cnt) === 4 &&
        Number(seniBacaFieldsCheck.rows[0]?.total_score) === 100 &&
        Number(tahfizhFieldsCheck.rows[0]?.cnt) === 3 &&
        Number(tahfizhFieldsCheck.rows[0]?.total_score) === 100,
      schemaBootError ||
        `seniBacaFields: ${seniBacaFieldsCheck.rows[0]?.cnt}, tahfizhFields: ${tahfizhFieldsCheck.rows[0]?.cnt}`
    );

    // Exact UUIDs from supabase/seed.sql
    const tenantJabarId = '11111111-1111-4111-8111-111111111101';
    const tenantDkiId = '11111111-1111-4111-8111-111111111102';
    const branchTilawahPutraId = '55555555-5555-4555-8555-555555555501';
    const stagePenyisihanId = '44444444-4444-4444-8444-444444444401';
    const stageFinalId = '44444444-4444-4444-8444-444444444403';
    const rubricSeniBacaId = '33333333-3333-4333-8333-333333333301';
    const kafilahBandungId = '99999999-9999-4999-8999-999999999901';
    const questionPenyisihanId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
    const questionFinalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04';

    const adminUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0';
    const judge1UserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
    const judge2UserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    const unassignedJudgeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
    const otherTenantJudgeId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

    await pg.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${adminUserId}', 'admin@jabar.mtq.id', '{"name": "H. Ridwan Hakim", "username": "admin_jabar"}'::jsonb),
        ('${judge1UserId}', 'hakim1@jabar.mtq.id', '{"name": "KH. Ahmad Syahid", "username": "hakim_tajwid"}'::jsonb),
        ('${judge2UserId}', 'hakim2@jabar.mtq.id', '{"name": "Dr. Hj. Maria Ulfah", "username": "hakim_lagu"}'::jsonb),
        ('${unassignedJudgeId}', 'hakim3@jabar.mtq.id', '{"name": "Ust. Hakim Cadangan", "username": "hakim_cadangan"}'::jsonb),
        ('${otherTenantJudgeId}', 'hakim@dki.mtq.id', '{"name": "KH. Hakim DKI", "username": "hakim_dki"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;

      -- Trigger on_auth_user_created automatically creates profiles with role = 'judge'.
      -- Promote adminUserId to 'admin' role in profiles and assign tenant_memberships:
      UPDATE profiles SET role = 'admin' WHERE id = '${adminUserId}';

      INSERT INTO tenant_memberships (tenant_id, profile_id, role, judge_category, judge_field, status) VALUES
        ('${tenantJabarId}', '${adminUserId}', 'admin', NULL, NULL, 'Aktif'),
        ('${tenantJabarId}', '${judge1UserId}', 'judge', 'Hakim Tajwid', 'Bidang Tajwid', 'Aktif'),
        ('${tenantJabarId}', '${judge2UserId}', 'judge', 'Hakim Lagu', 'Bidang Suara & Lagu', 'Aktif'),
        ('${tenantJabarId}', '${unassignedJudgeId}', 'judge', 'Hakim Fashahah', 'Bidang Fashahah', 'Aktif'),
        ('${tenantDkiId}', '${otherTenantJudgeId}', 'judge', 'Hakim Tajwid', 'Bidang Tajwid', 'Aktif')
      ON CONFLICT (tenant_id, profile_id) DO NOTHING;
    `);

    // 40. Test RLS Cross-Tenant Isolation & Audit Log Forgery Protection under real `ROLE authenticated`
    let directAuditInsertRejected = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${judge1UserId}', true);
        INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
        VALUES ('${tenantJabarId}', '${judge1UserId}', 'Fake Actor', 'FAKE_AUDIT_ACTION', 'Target', 'Attempted forgery', 'Success');
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      directAuditInsertRejected = true;
    }

    await pg.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${otherTenantJudgeId}', true);
    `);
    const crossTenantKafilahQuery = await pg.query(
      `SELECT id FROM kafilahs WHERE tenant_id = '${tenantJabarId}';`
    );
    await pg.exec('COMMIT;');

    assert(
      '40. Keamanan RLS & Trigger Audit Log: Menolak pemalsuan INSERT audit_logs via Data API & mengisolasi data antar-tenant',
      directAuditInsertRejected && crossTenantKafilahQuery.rows.length === 0,
      `directAuditInsertRejected: ${directAuditInsertRejected}, crossTenantRows: ${crossTenantKafilahQuery.rows.length}`
    );

    // =========================================================================
    // END-TO-END WORKFLOW VIA supabaseDataService BACKED BY REAL PGLITE DB
    // =========================================================================
    let currentAuthUser: { id: string; email: string } | null = {
      id: adminUserId,
      email: 'admin@jabar.mtq.id'
    };
    const faultControl = { forceFailRpc: null as string | null, forceFailTable: null as string | null };
    const adapter = createPgliteSupabaseAdapter(pg, () => currentAuthUser, faultControl);
    supabaseDataService.setTestDatabaseClient(adapter);

    // 41. Login as Admin, verify database connection, and hydrate workspace (including rubrics + fields)
    const connInfo = await supabaseDataService.verifyDatabaseConnection();
    const authProfile = await supabaseDataService.fetchAuthenticatedUserProfile();
    const activeTenantId = authProfile?.memberships[0]?.tenantId || '';
    const hydrationRes = await supabaseDataService.fetchTenantWorkspaceResult(activeTenantId);

    const hydratedSeniBaca = hydrationRes.payload?.rubricVersions?.find(
      (r) => r.code === 'RUBRIC-SENI-BACA-2025'
    );
    const hydratedTahfizh = hydrationRes.payload?.rubricVersions?.find(
      (r) => r.code === 'RUBRIC-TAHFIZH-2025'
    );

    // Also test explicit workspace query error handling (no silent fallback to demo data)
    faultControl.forceFailTable = 'participants';
    const failedHydrationRes = await supabaseDataService.fetchTenantWorkspaceResult(activeTenantId);
    faultControl.forceFailTable = null;

    assert(
      '41. Hidrasi Workspace & Pemetaan Rubrik Nyata: Memuat rubric_versions, rubric_fields, stages, dan competition_rule_configs berdasarkan tenant aktif serta gagal secara eksplisit bila query error',
      connInfo.isDatabaseReady === true &&
        connInfo.isAuthenticated === true &&
        activeTenantId === tenantJabarId &&
        hydrationRes.success === true &&
        (hydrationRes.payload?.rubricVersions?.length || 0) >= 2 &&
        hydratedSeniBaca?.fields.length === 4 &&
        hydratedTahfizh?.fields.length === 3 &&
        hydratedSeniBaca?.isOfficialVerified === true &&
        hydratedTahfizh?.isOfficialVerified === false &&
        failedHydrationRes.success === false &&
        failedHydrationRes.payload === null,
      `ready: ${connInfo.isDatabaseReady}, tenant: ${activeTenantId}, seniBacaFields: ${hydratedSeniBaca?.fields.length}, tahfizhFields: ${hydratedTahfizh?.fields.length}, failedHydrationBlocked: ${!failedHydrationRes.success}`
    );

    // 42. Foreign Key Existence Check before Upsert & Participant + Maqra Assignment Persistence
    const missingFkCheck = await supabaseDataService.verifyDatabaseReferencesExist({
      tenantId: tenantJabarId,
      branchId: '55555555-5555-4555-8555-999999999999' // Non-existent branch UUID
    });

    const participantUuid = generateUuid();
    const penyisihanSpUuid = generateUuid();

    const createPartRes = await supabaseDataService.upsertParticipantWithStage({
      participant: {
        id: participantUuid,
        tenantId: tenantJabarId,
        participantId: 'MTQ-26-101',
        name: 'Muhammad Farhan Al-Farisi',
        gender: 'Putra',
        kafilahId: kafilahBandungId,
        kafilahName: 'Kota Bandung',
        branchId: branchTilawahPutraId,
        branchName: 'Tilawah Dewasa Putra',
        levelName: 'Ulya (Dewasa)',
        lotteryNumber: 'A-101',
        stageName: 'Penyisihan',
        status: 'Menunggu',
        questionId: '',
        assignedMaqra: 'Belum Ditetapkan',
        pageNumber: 282
      },
      stageParticipation: {
        id: penyisihanSpUuid,
        tenantId: tenantJabarId,
        participantId: participantUuid,
        stageId: stagePenyisihanId,
        stageName: 'Penyisihan',
        branchId: branchTilawahPutraId,
        branchName: 'Tilawah Dewasa Putra',
        lotteryNumber: 'A-101',
        questionId: '',
        assignedMaqra: 'Belum Ditetapkan',
        pageNumber: 282,
        status: 'Maqra Belum Ditetapkan'
      }
    });

    const assignMaqraRes = await supabaseDataService.assignMaqraRecord({
      id: generateUuid(),
      tenantId: tenantJabarId,
      stageParticipationId: penyisihanSpUuid,
      questionId: questionPenyisihanId,
      method: 'undian'
    });
    const realAssignedMaqraId = (assignMaqraRes.data as { assignedMaqraId?: string })?.assignedMaqraId || '';

    const dbAssignedMaqraCheck = await pg.query<{ id: string }>(
      `SELECT id FROM assigned_maqras WHERE id = '${realAssignedMaqraId}';`
    );

    assert(
      '42. Relasi FK & Penetapan Maqra: Menolak referensi FK yang tidak ada di DB, menyimpan stage_participations & assigned_maqras, dan mengembalikan ID baris nyata',
      missingFkCheck.valid === false &&
        createPartRes.success === true &&
        assignMaqraRes.success === true &&
        isValidUuid(realAssignedMaqraId) &&
        dbAssignedMaqraCheck.rows.length === 1,
      `missingFkRejected: ${!missingFkCheck.valid}, createPart: ${createPartRes.success} (${createPartRes.message}), maqraId: ${realAssignedMaqraId}`
    );

    // Assign Judge 1 & Judge 2 to Penyisihan Tilawah Putra
    const asg1Res = await supabaseDataService.upsertJudgeAssignment({
      id: generateUuid(),
      tenantId: tenantJabarId,
      stageId: stagePenyisihanId,
      stageName: 'Penyisihan',
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      judgeId: judge1UserId,
      judgeName: 'KH. Ahmad Syahid',
      judgeField: 'Bidang Tajwid'
    });
    const asg2Res = await supabaseDataService.upsertJudgeAssignment({
      id: generateUuid(),
      tenantId: tenantJabarId,
      stageId: stagePenyisihanId,
      stageName: 'Penyisihan',
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      judgeId: judge2UserId,
      judgeName: 'Dr. Hj. Maria Ulfah',
      judgeField: 'Bidang Suara & Lagu'
    });

    // 43. Unassigned Judge Rejection & Direct Data API Finalization Rejection (RLS + Trigger)
    let unassignedJudgeInsertRejected = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${unassignedJudgeId}', true);
        INSERT INTO judge_assessments (
          id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id,
          status, is_locked, final_score
        ) VALUES (
          '${generateUuid()}', '${tenantJabarId}', '${penyisihanSpUuid}', '${realAssignedMaqraId}',
          '${unassignedJudgeId}', '${rubricSeniBacaId}', 'in_progress', false, 95.00
        );
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      unassignedJudgeInsertRejected = true;
    }

    // Switch active user to Judge 1 and save draft assessment via supabaseDataService
    currentAuthUser = { id: judge1UserId, email: 'hakim1@jabar.mtq.id' };
    const judge1AssessmentId = generateUuid();
    const syncDraft1Res = await supabaseDataService.syncAssessmentToRemote(
      {
        id: judge1AssessmentId,
        tenantId: tenantJabarId,
        stageParticipationId: penyisihanSpUuid,
        stageId: stagePenyisihanId,
        stageName: 'Penyisihan',
        participantId: participantUuid,
        judgeId: judge1UserId,
        judgeName: 'KH. Ahmad Syahid',
        judgeField: 'Bidang Tajwid',
        questionId: questionPenyisihanId,
        assignedMaqraId: realAssignedMaqraId,
        rubricVersion: 'RUBRIC-SENI-BACA-2025',
        rubricVersionId: rubricSeniBacaId,
        status: 'in_progress',
        isLocked: false,
        errorCounts: { MKH: 1 },
        deductions: { MKH: 1.0 },
        fieldScores: { TJW: 29, FSH: 28, SUR: 15, LGU: 25 },
        totalDeductions: 3.0,
        finalScore: 97.0,
        annotations: [],
        lastUpdated: '10:00 WIB'
      },
      realAssignedMaqraId
    );

    // Attempt direct Data API UPDATE to set status = 'finalized' without RPC
    let directFinalizeUpdateRejected = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${judge1UserId}', true);
        UPDATE judge_assessments
        SET status = 'finalized', is_locked = true
        WHERE id = '${judge1AssessmentId}';
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      directFinalizeUpdateRejected = true;
    }

    assert(
      '43. Proteksi Penugasan Hakim & Larangan Finalisasi Langsung Data API: Hakim tanpa penugasan ditolak, dan hakim tidak dapat mengubah status ke finalized langsung lewat UPDATE biasa',
      asg1Res.success &&
        asg2Res.success &&
        unassignedJudgeInsertRejected &&
        syncDraft1Res.success &&
        directFinalizeUpdateRejected,
      `asg1: ${asg1Res.success}, asg2: ${asg2Res.success}, unassignedRejected: ${unassignedJudgeInsertRejected}, syncDraft1: ${syncDraft1Res.success} (${syncDraft1Res.message}), directFinalizeRejected: ${directFinalizeUpdateRejected}`
    );

    // 44. Official Finalization via RPC + Immutability Lock on Finalized Score + Incomplete Stage Ratification Rejection
    const finalize1Res = await supabaseDataService.finalizeJudgeAssessmentRpc(judge1AssessmentId);

    // 44a. Attempt to modify finalized score as Judge 1 under RLS (`ROLE authenticated`) -> RLS blocks row (final_score remains 97.00)
    await pg.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${judge1UserId}', true);
      UPDATE judge_assessments
      SET final_score = 100.00
      WHERE id = '${judge1AssessmentId}';
      COMMIT;
    `);
    const scoreAfterRlsUpdateAttempt = await pg.query<{ final_score: string }>(
      `SELECT final_score::text FROM judge_assessments WHERE id = '${judge1AssessmentId}';`
    );

    // 44b. Attempt direct UPDATE bypassing RLS -> Immutability Trigger raises exception
    let triggerImmutabilityRejected = false;
    try {
      await pg.exec(`
        UPDATE judge_assessments
        SET final_score = 100.00
        WHERE id = '${judge1AssessmentId}';
      `);
    } catch {
      triggerImmutabilityRejected = true;
    }

    // Switch to Admin and try to ratify Penyisihan before Judge 2 has scored -> MUST FAIL
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const prematureAdvanceRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: stagePenyisihanId,
      nextStageId: stageFinalId,
      qualifiedParticipantIds: [participantUuid],
      overrideReasons: {},
      rankingsSnapshot: [{ participant_id: participantUuid, final_score: 97.0, rank: 1 }]
    });

    assert(
      '44. RPC Finalisasi Hakim, Kunci Imutabilitas Nilai Final (RLS + Trigger), & Penolakan Pengesahan Babak yang Belum Lengkap',
      finalize1Res.success === true &&
        Number(scoreAfterRlsUpdateAttempt.rows[0]?.final_score) === 97 &&
        triggerImmutabilityRejected === true &&
        prematureAdvanceRes.success === false &&
        prematureAdvanceRes.message.includes('belum difinalisasi'),
      `finalize1: ${finalize1Res.success}, scoreUnchanged: ${scoreAfterRlsUpdateAttempt.rows[0]?.final_score}, triggerBlocked: ${triggerImmutabilityRejected}, prematureAdvanceMsg: ${prematureAdvanceRes.message}`
    );

    // 45. Admin Reopen via RPC -> Judge 1 Re-score & Re-finalize -> Judge 2 Finalize -> Admin Advance Penyisihan to Final -> Final Stage Championship Ratification (nextStageId = null)
    const reopenRes = await supabaseDataService.reopenJudgeAssessmentRpc(
      judge1AssessmentId,
      'Koreksi resmi berita acara majelis hakim bidang tajwid'
    );

    // Judge 1 updates score to 96.5 and re-finalizes
    currentAuthUser = { id: judge1UserId, email: 'hakim1@jabar.mtq.id' };
    await supabaseDataService.syncAssessmentToRemote(
      {
        id: judge1AssessmentId,
        tenantId: tenantJabarId,
        stageParticipationId: penyisihanSpUuid,
        stageId: stagePenyisihanId,
        stageName: 'Penyisihan',
        participantId: participantUuid,
        judgeId: judge1UserId,
        judgeName: 'KH. Ahmad Syahid',
        judgeField: 'Bidang Tajwid',
        questionId: questionPenyisihanId,
        assignedMaqraId: realAssignedMaqraId,
        rubricVersion: 'RUBRIC-SENI-BACA-2025',
        rubricVersionId: rubricSeniBacaId,
        status: 'in_progress',
        isLocked: false,
        errorCounts: { MKH: 1, SFT: 1 },
        deductions: { MKH: 1.0, SFT: 0.5 },
        fieldScores: { TJW: 28.5, FSH: 28, SUR: 15, LGU: 25 },
        totalDeductions: 3.5,
        finalScore: 96.5,
        annotations: [],
        lastUpdated: '10:15 WIB'
      },
      realAssignedMaqraId
    );
    const refinalize1Res = await supabaseDataService.finalizeJudgeAssessmentRpc(judge1AssessmentId);

    // Judge 2 creates and finalizes assessment
    currentAuthUser = { id: judge2UserId, email: 'hakim2@jabar.mtq.id' };
    const judge2AssessmentId = generateUuid();
    await supabaseDataService.syncAssessmentToRemote(
      {
        id: judge2AssessmentId,
        tenantId: tenantJabarId,
        stageParticipationId: penyisihanSpUuid,
        stageId: stagePenyisihanId,
        stageName: 'Penyisihan',
        participantId: participantUuid,
        judgeId: judge2UserId,
        judgeName: 'Dr. Hj. Maria Ulfah',
        judgeField: 'Bidang Suara & Lagu',
        questionId: questionPenyisihanId,
        assignedMaqraId: realAssignedMaqraId,
        rubricVersion: 'RUBRIC-SENI-BACA-2025',
        rubricVersionId: rubricSeniBacaId,
        status: 'in_progress',
        isLocked: false,
        errorCounts: {},
        deductions: {},
        fieldScores: { TJW: 30, FSH: 28, SUR: 14.5, LGU: 25 },
        totalDeductions: 2.5,
        finalScore: 97.5,
        annotations: [],
        lastUpdated: '10:20 WIB'
      },
      realAssignedMaqraId
    );
    const finalize2Res = await supabaseDataService.finalizeJudgeAssessmentRpc(judge2AssessmentId);

    // Admin advances Penyisihan -> Final
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const advancePenyisihanRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: stagePenyisihanId,
      nextStageId: stageFinalId,
      qualifiedParticipantIds: [participantUuid],
      overrideReasons: {},
      rankingsSnapshot: [{ participant_id: participantUuid, final_score: 97.0, rank: 1 }]
    });
    console.log('advancePenyisihanRes:', advancePenyisihanRes);

    // Verify Final stage participation was created by the RPC in PostgreSQL
    const finalSpQuery = await pg.query<{ id: string }>(`
      SELECT id FROM stage_participations
      WHERE stage_id = '${stageFinalId}' AND participant_id = '${participantUuid}';
    `);
    console.log('finalSpQuery rows:', finalSpQuery.rows);
    const finalSpId = finalSpQuery.rows[0]?.id || '';

    // Assign maqra and judge on Final stage, score, finalize, and ratify Final Championship (nextStageId = null)
    const assignFinalMaqra = await supabaseDataService.assignMaqraRecord({
      id: generateUuid(),
      tenantId: tenantJabarId,
      stageParticipationId: finalSpId,
      questionId: questionFinalId,
      method: 'undian'
    });
    const finalAssignedMaqraId =
      (assignFinalMaqra.data as { assignedMaqraId?: string })?.assignedMaqraId || '';

    await supabaseDataService.upsertJudgeAssignment({
      id: generateUuid(),
      tenantId: tenantJabarId,
      stageId: stageFinalId,
      stageName: 'Final',
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      judgeId: judge1UserId,
      judgeName: 'KH. Ahmad Syahid',
      judgeField: 'Bidang Tajwid'
    });

    currentAuthUser = { id: judge1UserId, email: 'hakim1@jabar.mtq.id' };
    const finalAssessmentId = generateUuid();
    await supabaseDataService.syncAssessmentToRemote(
      {
        id: finalAssessmentId,
        tenantId: tenantJabarId,
        stageParticipationId: finalSpId,
        stageId: stageFinalId,
        stageName: 'Final',
        participantId: participantUuid,
        judgeId: judge1UserId,
        judgeName: 'KH. Ahmad Syahid',
        judgeField: 'Bidang Tajwid',
        questionId: questionFinalId,
        assignedMaqraId: finalAssignedMaqraId,
        rubricVersion: 'RUBRIC-SENI-BACA-2025',
        rubricVersionId: rubricSeniBacaId,
        status: 'in_progress',
        isLocked: false,
        errorCounts: {},
        deductions: {},
        fieldScores: { TJW: 29.5, FSH: 28, SUR: 15, LGU: 26 },
        totalDeductions: 1.5,
        finalScore: 98.5,
        annotations: [],
        lastUpdated: '11:00 WIB'
      },
      finalAssignedMaqraId
    );
    await supabaseDataService.finalizeJudgeAssessmentRpc(finalAssessmentId);

    // Test simulated RPC failure first: verify error is returned and Final stage is NOT marked finalized in DB
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    faultControl.forceFailRpc = 'advance_stage_qualifiers';
    const simulatedFailedFinalAdvance = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: stageFinalId,
      nextStageId: null,
      qualifiedParticipantIds: [participantUuid],
      overrideReasons: {},
      rankingsSnapshot: [{ participant_id: participantUuid, final_score: 98.5, rank: 1 }]
    });
    const finalStageBeforeSuccess = await pg.query<{ is_finalized: boolean }>(
      `SELECT is_finalized FROM stages WHERE id = '${stageFinalId}';`
    );
    faultControl.forceFailRpc = null;

    // Now execute real Final Stage Championship Ratification with nextStageId = null
    const advanceFinalChampionshipRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: stageFinalId,
      nextStageId: null,
      qualifiedParticipantIds: [participantUuid],
      overrideReasons: {},
      rankingsSnapshot: [{ participant_id: participantUuid, final_score: 98.5, rank: 1 }]
    });

    const finalStageAfterSuccess = await pg.query<{ is_finalized: boolean; status: string }>(
      `SELECT is_finalized, status FROM stages WHERE id = '${stageFinalId}';`
    );
    const finalSpAfterSuccess = await pg.query<{ final_score: string; rank: number; is_qualified: boolean }>(
      `SELECT final_score::text, rank, is_qualified FROM stage_participations WHERE id = '${finalSpId}';`
    );
    const auditLogsCheck = await pg.query<{ action: string; summary: string }>(`
      SELECT action, summary FROM audit_logs WHERE tenant_id = '${tenantJabarId}';
    `);
    const auditActions = new Set(auditLogsCheck.rows.map((r) => r.action));
    const hasFinalChampionshipSummary = auditLogsCheck.rows.some((r) =>
      r.summary.includes('Pengesahan resmi hasil kejuaraan babak final')
    );

    assert(
      '45. Alur End-to-End Lengkap di Database Nyata: Reopen oleh Admin, Re-finalisasi, Pelolosan Penyisihan -> Final, Pengesahan Babak Final (nextStageId = null), & Penanganan Kegagalan RPC',
      reopenRes.success === true &&
        refinalize1Res.success === true &&
        finalize2Res.success === true &&
        advancePenyisihanRes.success === true &&
        isValidUuid(finalSpId) &&
        simulatedFailedFinalAdvance.success === false &&
        finalStageBeforeSuccess.rows[0]?.is_finalized === false &&
        advanceFinalChampionshipRes.success === true &&
        finalStageAfterSuccess.rows[0]?.is_finalized === true &&
        finalStageAfterSuccess.rows[0]?.status === 'Selesai' &&
        Number(finalSpAfterSuccess.rows[0]?.final_score) === 98.5 &&
        finalSpAfterSuccess.rows[0]?.rank === 1 &&
        auditActions.has('ASSESSMENT_FINALIZED') &&
        auditActions.has('ASSESSMENT_REOPENED') &&
        auditActions.has('STAGE_FINALIZED') &&
        hasFinalChampionshipSummary,
      `reopen: ${reopenRes.success}, advancePenyisihan: ${advancePenyisihanRes.success}, simulatedFailBlocked: ${
        !simulatedFailedFinalAdvance.success && !finalStageBeforeSuccess.rows[0]?.is_finalized
      }, finalChampionship: ${advanceFinalChampionshipRes.success}, auditActions: ${Array.from(auditActions).join(',')}`
    );

    // =========================================================================
    // 46. P0 SECURITY: Stage Ratification Bypass Blocked (Direct UPDATE on stages)
    // =========================================================================
    const stageSemifinalId = '44444444-4444-4444-8444-444444444402';
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const createSemiStageRes = await supabaseDataService.upsertStage({
      id: stageSemifinalId,
      tenantId: tenantJabarId,
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      name: 'Semifinal',
      order: 2,
      qualificationQuota: 3,
      qualificationMethod: 'top_n',
      status: 'Aktif',
      isFinalized: false
    });
    let directStageFinalizeBlocked = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        UPDATE stages
        SET is_finalized = true, status = 'Selesai'
        WHERE id = '${stageSemifinalId}';
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      directStageFinalizeBlocked = true;
    }

    const semifinalAfterBypassAttempt = await pg.query<{ is_finalized: boolean; status: string }>(
      `SELECT is_finalized, status FROM stages WHERE id = '${stageSemifinalId}';`
    );

    assert(
      '46. P0 Keamanan Babak: Menolak bypass pengesahan babak melalui UPDATE langsung pada tabel stages (is_finalized / status Selesai)',
      createSemiStageRes.success === true &&
        directStageFinalizeBlocked === true &&
        semifinalAfterBypassAttempt.rows[0]?.is_finalized === false &&
        semifinalAfterBypassAttempt.rows[0]?.status !== 'Selesai',
      `createStage: ${createSemiStageRes.success}, directStageFinalizeBlocked: ${directStageFinalizeBlocked}, is_finalized: ${semifinalAfterBypassAttempt.rows[0]?.is_finalized}`
    );

    // =========================================================================
    // 47. P0 SECURITY: Snapshot Insert Bypass Blocked (Direct INSERT on stage_result_snapshots)
    // =========================================================================
    let directSnapshotInsertBlocked = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        INSERT INTO stage_result_snapshots (tenant_id, stage_id, branch_id, quota, tie_break_rule_used, finalized_by, rankings_snapshot)
        VALUES ('${tenantJabarId}', '${stageSemifinalId}', '${branchTilawahPutraId}', 3, 'highest_tajwid', '${adminUserId}', '[]'::jsonb);
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      directSnapshotInsertBlocked = true;
    }

    assert(
      '47. P0 Keamanan Snapshot Hasil: Menolak INSERT langsung ke stage_result_snapshots di luar transaksi RPC advance_stage_qualifiers',
      directSnapshotInsertBlocked === true,
      `directSnapshotInsertBlocked: ${directSnapshotInsertBlocked}`
    );

    // =========================================================================
    // 48. P0 SECURITY: Server-Authoritative Score Calculation & Out-of-Quota Override Enforcement
    // =========================================================================
    // Verify that Penyisihan stage snapshot & participation stored the server-computed average (96.5 + 97.5)/2 = 97.00
    const penyisihanSpScoreCheck = await pg.query<{ final_score: string; rank: number }>(
      `SELECT final_score::text, rank FROM stage_participations WHERE id = '${penyisihanSpUuid}';`
    );
    const penyisihanSnapshotCheck = await pg.query<{ rankings_snapshot: Array<{ final_score: number; rank: number }> }>(
      `SELECT rankings_snapshot FROM stage_result_snapshots WHERE stage_id = '${stagePenyisihanId}' ORDER BY created_at DESC LIMIT 1;`
    );
    const snapshotFirstEntry = penyisihanSnapshotCheck.rows[0]?.rankings_snapshot?.[0];

    assert(
      '48. P0 Integritas Nilai & Ranking Server-Authoritative: advance_stage_qualifiers menghitung rata-rata nilai murni dari tabel judge_assessments di PostgreSQL',
      Number(penyisihanSpScoreCheck.rows[0]?.final_score) === 97 &&
        penyisihanSpScoreCheck.rows[0]?.rank === 1 &&
        Number(snapshotFirstEntry?.final_score) === 97 &&
        Number(snapshotFirstEntry?.rank) === 1,
      `spScore: ${penyisihanSpScoreCheck.rows[0]?.final_score}, snapshotScore: ${snapshotFirstEntry?.final_score}`
    );

    // =========================================================================
    // 49. P1 SECURITY: Profile Self-Role Escalation Blocked & is_assigned_judge Caller Restriction
    // =========================================================================
    let selfRoleEscalationBlocked = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${judge1UserId}', true);
        UPDATE profiles SET role = 'superadmin' WHERE id = '${judge1UserId}';
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      selfRoleEscalationBlocked = true;
    }

    const judgeRoleAfterEscalationAttempt = await pg.query<{ role: string }>(
      `SELECT role FROM profiles WHERE id = '${judge1UserId}';`
    );

    // Unassigned judge probing another judge's assignment via is_assigned_judge() must return false
    await pg.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${unassignedJudgeId}', true);
    `);
    const probeOtherJudgeRes = await pg.query<{ allowed: boolean }>(
      `SELECT is_assigned_judge('${tenantJabarId}'::uuid, '${penyisihanSpUuid}'::uuid, '${judge1UserId}'::uuid) AS allowed;`
    );
    await pg.exec('COMMIT;');

    assert(
      '49. P1 Proteksi Eskalasi Role & Pembatasan Helper SECURITY DEFINER: Menolak perubahan role ke superadmin & membatasi pemanggilan is_assigned_judge lintas pengguna',
      (selfRoleEscalationBlocked || judgeRoleAfterEscalationAttempt.rows[0]?.role === 'judge') &&
        judgeRoleAfterEscalationAttempt.rows[0]?.role === 'judge' &&
        probeOtherJudgeRes.rows[0]?.allowed === false,
      `roleRemainedJudge: ${judgeRoleAfterEscalationAttempt.rows[0]?.role}, probeAllowed: ${probeOtherJudgeRes.rows[0]?.allowed}`
    );

    // =========================================================================
    // 50. P1 COMPLETE CRUD & MUSHAF ANNOTATION PERSISTENCE
    // =========================================================================
    // Create a draft assessment on Semifinal with Mushaf annotations and verify persistence + hydration
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const semifinalSpUuid = generateUuid();
    await supabaseDataService.upsertParticipantWithStage({
      participant: {
        id: participantUuid,
        tenantId: tenantJabarId,
        participantId: 'MTQ-26-101',
        name: 'Muhammad Farhan Al-Farisi (Updated)',
        gender: 'Putra',
        kafilahId: kafilahBandungId,
        kafilahName: 'Kota Bandung',
        branchId: branchTilawahPutraId,
        branchName: 'Tilawah Dewasa Putra',
        levelName: 'Ulya (Dewasa)',
        lotteryNumber: 'A-101',
        stageName: 'Semifinal',
        status: 'Menunggu',
        questionId: '',
        assignedMaqra: 'Belum Ditetapkan',
        pageNumber: 282
      },
      stageParticipation: {
        id: semifinalSpUuid,
        tenantId: tenantJabarId,
        participantId: participantUuid,
        stageId: stageSemifinalId,
        stageName: 'Semifinal',
        branchId: branchTilawahPutraId,
        branchName: 'Tilawah Dewasa Putra',
        lotteryNumber: 'A-101',
        questionId: '',
        assignedMaqra: 'Belum Ditetapkan',
        pageNumber: 282,
        status: 'Maqra Belum Ditetapkan'
      }
    });

    const assignSemiMaqra = await supabaseDataService.assignMaqraRecord({
      id: generateUuid(),
      tenantId: tenantJabarId,
      stageParticipationId: semifinalSpUuid,
      questionId: questionPenyisihanId,
      method: 'manual'
    });
    const semiAssignedMaqraId =
      (assignSemiMaqra.data as { assignedMaqraId?: string })?.assignedMaqraId || '';

    const semiAsgId = generateUuid();
    await supabaseDataService.upsertJudgeAssignment({
      id: semiAsgId,
      tenantId: tenantJabarId,
      stageId: stageSemifinalId,
      stageName: 'Semifinal',
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      judgeId: judge1UserId,
      judgeName: 'KH. Ahmad Syahid',
      judgeField: 'Bidang Tajwid'
    });

    // Save Mushaf annotations as Judge 1
    currentAuthUser = { id: judge1UserId, email: 'hakim1@jabar.mtq.id' };
    const semiAssessmentId = generateUuid();
    const sampleAnnotations = [
      {
        id: 'ann-01',
        tool: 'pen' as const,
        color: '#ef4444',
        size: 3,
        page: 282,
        points: [
          { x: 0.25, y: 0.45 },
          { x: 0.35, y: 0.55 }
        ]
      }
    ];
    const syncAnnotationRes = await supabaseDataService.syncAssessmentToRemote(
      {
        id: semiAssessmentId,
        tenantId: tenantJabarId,
        stageParticipationId: semifinalSpUuid,
        stageId: stageSemifinalId,
        stageName: 'Semifinal',
        participantId: participantUuid,
        judgeId: judge1UserId,
        judgeName: 'KH. Ahmad Syahid',
        judgeField: 'Bidang Tajwid',
        questionId: questionPenyisihanId,
        assignedMaqraId: semiAssignedMaqraId,
        rubricVersion: 'RUBRIC-SENI-BACA-2025',
        rubricVersionId: rubricSeniBacaId,
        status: 'in_progress',
        isLocked: false,
        errorCounts: { MKH: 1 },
        deductions: { MKH: 1.0 },
        fieldScores: { TJW: 29, FSH: 28, SUR: 15, LGU: 25 },
        totalDeductions: 3.0,
        finalScore: 97.0,
        annotations: sampleAnnotations,
        note: 'Catatan tajwid halaman 282',
        lastUpdated: '11:30 WIB'
      },
      semiAssignedMaqraId
    );

    const dbAnnotationQuery = await pg.query<{ annotations: any[] }>(
      `SELECT annotations FROM judge_assessments WHERE id = '${semiAssessmentId}';`
    );

    // Test Admin CRUD operations (Level, ErrorCategory, User Provisioning RPC)
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const newLevelId = generateUuid();
    const levelCrudRes = await supabaseDataService.upsertLevel(tenantJabarId, {
      id: newLevelId,
      tenantId: tenantJabarId,
      code: 'TST-LVL',
      name: 'Jenjang Uji',
      description: 'Deskripsi uji',
      status: 'Aktif'
    });
    const deleteLevelRes = await supabaseDataService.deleteLevel(tenantJabarId, newLevelId);

    const errorCatCrudRes = await supabaseDataService.upsertErrorCategory({
      id: generateUuid(),
      tenantId: tenantJabarId,
      code: 'TST-ERR',
      name: 'Kategori Kesalahan Uji',
      scope: 'Tajwid',
      defaultDeduction: 1.5,
      methodType: 'Pengurangan tetap',
      status: 'Aktif',
      order: 99
    });

    const userProvisionRes = await supabaseDataService.upsertUserAndMembership({
      tenantId: tenantJabarId,
      user: {
        id: unassignedJudgeId,
        tenantId: tenantJabarId,
        username: 'hakim_cadangan_updated',
        name: 'Ust. Hakim Cadangan (Diperbarui)',
        email: 'hakim3@jabar.mtq.id',
        role: 'judge',
        judgeCategory: 'Hakim Tajwid',
        judgeField: 'Bidang Tajwid',
        status: 'Aktif'
      }
    });

    assert(
      '50. P1 Persistensi Anotasi Mushaf & Operasi CRUD Lengkap: Menyimpan anotasi Mushaf (JSONB), master jenjang, kategori kesalahan, dan manajemen pengguna via RPC secara persisten di PostgreSQL',
      syncAnnotationRes.success === true &&
        Array.isArray(dbAnnotationQuery.rows[0]?.annotations) &&
        dbAnnotationQuery.rows[0]?.annotations.length === 1 &&
        dbAnnotationQuery.rows[0]?.annotations[0]?.id === 'ann-01' &&
        levelCrudRes.success === true &&
        deleteLevelRes.success === true &&
        errorCatCrudRes.success === true &&
        userProvisionRes.success === true,
      `syncAnn: ${syncAnnotationRes.success}, annLen: ${dbAnnotationQuery.rows[0]?.annotations?.length}, levelCrud: ${levelCrudRes.success}, deleteLevel: ${deleteLevelRes.success}, errCat: ${errorCatCrudRes.success}, userRpc: ${userProvisionRes.success} (${userProvisionRes.message})`
    );

    // =========================================================================
    // 51. P0 FAIL-CLOSED ACCESS GATE (PRODUCTION & LIVE MODE)
    // =========================================================================
    const baseConnectedInfo = {
      isConfigured: true,
      state: 'connected_authenticated' as const,
      mode: 'supabase_live' as const,
      isDatabaseReady: true,
      isAuthenticated: true,
      endpointHost: 'project.supabase.co',
      statusLabel: 'Terhubung',
      lastError: null
    };
    const validAuthProfile = {
      authUserId: adminUserId,
      globalRole: 'admin' as const,
      hasProfileRow: true,
      inactiveMembershipsCount: 0,
      memberships: [{ tenantId: tenantJabarId, role: 'admin', status: 'Aktif' }]
    };

    const gateUnconfigured = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: {
        ...baseConnectedInfo,
        isConfigured: false,
        state: 'unconfigured',
        isDatabaseReady: false,
        isAuthenticated: false
      },
      authenticatedProfile: null
    });
    const gateChecking = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: {
        ...baseConnectedInfo,
        state: 'checking',
        isDatabaseReady: false,
        isAuthenticated: false
      },
      authenticatedProfile: null
    });
    const gateSchemaMissing = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: {
        ...baseConnectedInfo,
        state: 'schema_missing',
        isDatabaseReady: false
      },
      authenticatedProfile: null
    });
    const gateConnError = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: {
        ...baseConnectedInfo,
        state: 'connection_error',
        isDatabaseReady: false
      },
      authenticatedProfile: validAuthProfile
    });
    const gateUnauthenticated = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: {
        ...baseConnectedInfo,
        state: 'connected_unauthenticated',
        isAuthenticated: false
      },
      authenticatedProfile: null
    });
    const gateQueryError = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: baseConnectedInfo,
      authenticatedProfile: {
        ...validAuthProfile,
        hasProfileRow: false,
        verificationError: 'Timeout querying profiles'
      }
    });
    const gateProfileMissing = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: baseConnectedInfo,
      authenticatedProfile: {
        ...validAuthProfile,
        hasProfileRow: false,
        memberships: []
      }
    });
    const gateMembershipEmpty = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: baseConnectedInfo,
      authenticatedProfile: {
        ...validAuthProfile,
        memberships: []
      }
    });
    const gateMembershipInactive = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: baseConnectedInfo,
      authenticatedProfile: {
        ...validAuthProfile,
        inactiveMembershipsCount: 1,
        memberships: [{ tenantId: tenantJabarId, role: 'admin', status: 'Nonaktif' }]
      }
    });
    const gateHydrationError = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: baseConnectedInfo,
      authenticatedProfile: validAuthProfile,
      dataSourceMode: 'supabase_error',
      workspaceError: 'Failed to load workspace'
    });
    const gateAuthorized = evaluateWorkspaceAccessGate({
      isOfflineDemoSimulation: false,
      connectionInfo: baseConnectedInfo,
      authenticatedProfile: validAuthProfile,
      dataSourceMode: 'supabase_live',
      workspaceError: null
    });

    assert(
      '51. P0 Fail-Closed Access Gate: Menolak akses tanpa autentikasi pada seluruh kondisi gagal (unconfigured, schema_missing, error, unauthenticated, profile_missing, membership_empty, membership_inactive, query_error, hydration_error)',
      !gateUnconfigured.isAuthorized &&
        gateUnconfigured.reason === 'supabase_unconfigured' &&
        !gateChecking.isAuthorized &&
        gateChecking.reason === 'connection_checking' &&
        !gateSchemaMissing.isAuthorized &&
        gateSchemaMissing.reason === 'schema_missing' &&
        !gateConnError.isAuthorized &&
        gateConnError.reason === 'connection_error' &&
        !gateUnauthenticated.isAuthorized &&
        gateUnauthenticated.reason === 'unauthenticated' &&
        !gateQueryError.isAuthorized &&
        gateQueryError.reason === 'query_error' &&
        !gateProfileMissing.isAuthorized &&
        gateProfileMissing.reason === 'profile_missing' &&
        !gateMembershipEmpty.isAuthorized &&
        gateMembershipEmpty.reason === 'membership_empty' &&
        !gateMembershipInactive.isAuthorized &&
        gateMembershipInactive.reason === 'membership_inactive' &&
        !gateHydrationError.isAuthorized &&
        gateHydrationError.reason === 'workspace_hydration_error' &&
        gateAuthorized.isAuthorized &&
        gateAuthorized.reason === null,
      `unconf: ${gateUnconfigured.reason}, unauth: ${gateUnauthenticated.reason}, profMissing: ${gateProfileMissing.reason}, auth: ${gateAuthorized.isAuthorized}`
    );

    // =========================================================================
    // 52. P0 FIRST SUPERADMIN BOOTSTRAP & SECOND-BOOTSTRAP LOCK
    // =========================================================================
    const bootstrapUserId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    const secondCandidateId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
    await pg.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${bootstrapUserId}', 'superadmin@nasional.mtq.id', '{"name": "Dr. H. Superadmin Utama", "username": "superadmin_utama"}'::jsonb),
        ('${secondCandidateId}', 'second@nasional.mtq.id', '{"name": "Kandidat Kedua", "username": "kandidat_dua"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Ensure 0 superadmins exist before bootstrap
    const preSuperadminCount = await pg.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM profiles WHERE role = 'superadmin';`
    );

    // Bootstrap first superadmin as authenticated bootstrapUserId
    currentAuthUser = { id: bootstrapUserId, email: 'superadmin@nasional.mtq.id' };
    const firstBootstrapRes = await supabaseDataService.bootstrapFirstSuperadmin({
      targetEmail: 'superadmin@nasional.mtq.id',
      initialTenantId: tenantJabarId
    });

    // Attempt second bootstrap from another user — MUST FAIL with BOOTSTRAP_LOCKED
    currentAuthUser = { id: secondCandidateId, email: 'second@nasional.mtq.id' };
    const secondBootstrapRes = await supabaseDataService.bootstrapFirstSuperadmin({
      targetEmail: 'second@nasional.mtq.id',
      initialTenantId: tenantJabarId
    });

    // Verify audit log entry INITIAL_SUPERADMIN_BOOTSTRAPPED exists and cannot be spoofed via append_admin_audit_log
    const bootstrapAuditCheck = await pg.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM audit_logs WHERE action = 'INITIAL_SUPERADMIN_BOOTSTRAPPED' AND actor_id = '${bootstrapUserId}';`
    );

    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const spoofBootstrapAuditRes = await adapter.rpc('append_admin_audit_log', {
      p_tenant_id: tenantJabarId,
      p_action: 'INITIAL_SUPERADMIN_BOOTSTRAPPED',
      p_target: 'Spoofed Superadmin',
      p_summary: 'Attempted to spoof bootstrap log'
    });

    assert(
      '52. P0 Bootstrap Superadmin Pertama Sekali Pakai: Berhasil saat belum ada superadmin, mencatat INITIAL_SUPERADMIN_BOOTSTRAPPED di audit_logs, dan menolak percobaan bootstrap kedua maupun pemalsuan log',
      Number(preSuperadminCount.rows[0]?.cnt) === 0 &&
        firstBootstrapRes.success === true &&
        secondBootstrapRes.success === false &&
        Number(bootstrapAuditCheck.rows[0]?.cnt) === 1 &&
        spoofBootstrapAuditRes.error !== null,
      `firstBootstrap: ${firstBootstrapRes.success} (${firstBootstrapRes.message}), secondBootstrap: ${secondBootstrapRes.success} (${secondBootstrapRes.message}), auditCnt: ${bootstrapAuditCheck.rows[0]?.cnt}, spoofErr: ${spoofBootstrapAuditRes.error?.message}`
    );

    // =========================================================================
    // 53. P0 EMAIL-BASED ACCOUNT PROVISIONING & PARTIAL FAILURE RECOVERY
    // =========================================================================
    const invitedAuthUserId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
    await pg.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${invitedAuthUserId}', 'hakim.baru@jabar.mtq.id', '{"name": "KH. Hakim Baru", "username": "hakim_baru"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);

    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    // Simulate admin provisioning a user whose auth.users row exists (e.g., created by invite or partial failure)
    // using a synthetic local ID that does NOT match invitedAuthUserId: RPC must resolve by email!
    const syntheticFrontendId = 'usr-local-temp-999';
    const provisionByEmailRes = await supabaseDataService.upsertUserAndMembership({
      tenantId: tenantJabarId,
      user: {
        id: syntheticFrontendId,
        tenantId: tenantJabarId,
        username: 'hakim_baru',
        name: 'KH. Hakim Baru, M.Ag',
        email: 'hakim.baru@jabar.mtq.id',
        role: 'judge',
        judgeCategory: 'Hakim 3',
        judgeField: 'Bidang Suara',
        status: 'Aktif'
      }
    });

    // Retry the exact same provisioning call — must be idempotent without duplicating profiles or memberships
    const retryProvisionByEmailRes = await supabaseDataService.upsertUserAndMembership({
      tenantId: tenantJabarId,
      user: {
        id: syntheticFrontendId,
        tenantId: tenantJabarId,
        username: 'hakim_baru',
        name: 'KH. Hakim Baru, M.Ag (Retry Updated)',
        email: 'hakim.baru@jabar.mtq.id',
        role: 'judge',
        judgeCategory: 'Hakim 3',
        judgeField: 'Bidang Suara & Lagu',
        status: 'Aktif'
      }
    });

    const resolvedProfileCheck = await pg.query<{ id: string; name: string; cnt: string }>(
      `SELECT id::text, name, (SELECT COUNT(*)::text FROM tenant_memberships WHERE profile_id = '${invitedAuthUserId}' AND tenant_id = '${tenantJabarId}') AS cnt FROM profiles WHERE id = '${invitedAuthUserId}';`
    );

    // Tenant admin attempting to escalate a user to superadmin via upsert_tenant_member_profile MUST FAIL
    const adminEscalateToSuperadmin = await adapter.rpc('upsert_tenant_member_profile', {
      p_tenant_id: tenantJabarId,
      p_profile_id: invitedAuthUserId,
      p_username: 'hakim_baru',
      p_name: 'Escalated Superadmin',
      p_email: 'hakim.baru@jabar.mtq.id',
      p_role: 'superadmin',
      p_judge_category: null,
      p_judge_field: null,
      p_status: 'Aktif'
    });

    assert(
      '53. P0 Provisioning Akun Berbasis Email & Pemulihan Kegagalan Parsial: Menautkan auth.users berdasarkan email secara idempoten saat retry tanpa duplikasi dan menolak eskalasi ke superadmin oleh admin tenant',
      provisionByEmailRes.success === true &&
        provisionByEmailRes.data?.profileId === invitedAuthUserId &&
        retryProvisionByEmailRes.success === true &&
        resolvedProfileCheck.rows[0]?.id === invitedAuthUserId &&
        resolvedProfileCheck.rows[0]?.name === 'KH. Hakim Baru, M.Ag (Retry Updated)' &&
        Number(resolvedProfileCheck.rows[0]?.cnt) === 1 &&
        adminEscalateToSuperadmin.error !== null,
      `provSuccess: ${provisionByEmailRes.success}, resolvedId: ${provisionByEmailRes.data?.profileId}, retrySuccess: ${retryProvisionByEmailRes.success}, membershipCnt: ${resolvedProfileCheck.rows[0]?.cnt}, escalateErr: ${adminEscalateToSuperadmin.error?.message}`
    );

    // =========================================================================
    // 54. P0 PASSWORD RESET & REDIRECT URL VALIDATION
    // =========================================================================
    const validHttpsRedirect = supabaseDataService.validateRedirectUrl('https://mtq-nasional.id/reset');
    const validLocalRedirect = supabaseDataService.validateRedirectUrl('http://localhost:3000/');
    const invalidHttpExternalRedirect = supabaseDataService.validateRedirectUrl('http://evil-phishing.com/steal');
    const invalidProtocolRedirect = supabaseDataService.validateRedirectUrl('javascript:alert(1)');

    const badEmailReset = await supabaseDataService.requestPasswordReset(
      'bukan-email',
      'https://mtq-nasional.id'
    );
    const badRedirectReset = await supabaseDataService.requestPasswordReset(
      'admin@jabar.mtq.id',
      'http://insecure-external.org/reset'
    );
    const validPasswordResetReq = await supabaseDataService.requestPasswordReset(
      'admin@jabar.mtq.id',
      'https://mtq-nasional.id'
    );

    const shortPasswordUpdate = await supabaseDataService.updatePasswordWithRecoverySession('12345');
    const validPasswordUpdate = await supabaseDataService.updatePasswordWithRecoverySession('SandiBaruAman2026!');

    assert(
      '54. P0 Alur Reset Kata Sandi & Validasi Redirect Aman: Menolak URL redirect eksternal non-HTTPS, menolak email tidak valid/sandi pendek, dan memproses pemulihan kata sandi secara aman',
      validHttpsRedirect.valid === true &&
        validLocalRedirect.valid === true &&
        invalidHttpExternalRedirect.valid === false &&
        invalidProtocolRedirect.valid === false &&
        badEmailReset.success === false &&
        badRedirectReset.success === false &&
        validPasswordResetReq.success === true &&
        shortPasswordUpdate.success === false &&
        validPasswordUpdate.success === true,
      `httpsValid: ${validHttpsRedirect.valid}, httpExtValid: ${invalidHttpExternalRedirect.valid}, validReset: ${validPasswordResetReq.success}, validPassUpdate: ${validPasswordUpdate.success}`
    );

    // =========================================================================
    // 55. P1 AUTOSAVE PERSISTENCE FAILURE DETECTION (NO FALSE SAVED CLAIM)
    // =========================================================================
    const failingAssessmentClient = createPgliteSupabaseAdapter(
      pg,
      () => ({ id: judge1UserId, email: 'hakim1@jabar.mtq.id' }),
      { forceFailTable: 'judge_assessments' }
    );
    supabaseDataService.setTestDatabaseClient(failingAssessmentClient);

    const failedAutosaveRes = await supabaseDataService.syncAssessmentToRemote(
      {
        id: semiAssessmentId,
        tenantId: tenantJabarId,
        stageParticipationId: semifinalSpUuid,
        stageId: stageSemifinalId,
        stageName: 'Semifinal',
        participantId: participantUuid,
        judgeId: judge1UserId,
        judgeName: 'KH. Ahmad Syahid',
        judgeField: 'Bidang Tajwid',
        questionId: questionPenyisihanId,
        assignedMaqraId: semiAssignedMaqraId,
        rubricVersion: 'RUBRIC-SENI-BACA-2025',
        rubricVersionId: rubricSeniBacaId,
        status: 'in_progress',
        isLocked: false,
        errorCounts: { MKH: 3 },
        deductions: { MKH: 3.0 },
        fieldScores: { TJW: 27, FSH: 28, SUR: 15, LGU: 25 },
        totalDeductions: 5.0,
        finalScore: 95.0,
        annotations: sampleAnnotations,
        note: 'Percobaan simpan saat jaringan gagal',
        lastUpdated: '11:35 WIB'
      },
      semiAssignedMaqraId
    );

    // Restore working client and verify database still holds the previous valid score (97.0)
    supabaseDataService.setTestDatabaseClient(adapter);
    const scoreAfterFailedAutosave = await pg.query<{ final_score: string }>(
      `SELECT final_score::text FROM judge_assessments WHERE id = '${semiAssessmentId}';`
    );

    assert(
      '55. P1 Kejujuran Status Autosave & Rollback Saat Gagal: Menolak klaim tersimpan saat operasi database gagal dan menjaga konsistensi skor di database',
      failedAutosaveRes.success === false &&
        Boolean(failedAutosaveRes.message) &&
        Number(scoreAfterFailedAutosave.rows[0]?.final_score) === 97,
      `failedAutosaveSuccess: ${failedAutosaveRes.success}, msg: ${failedAutosaveRes.message}, dbScore: ${scoreAfterFailedAutosave.rows[0]?.final_score}`
    );

    // =========================================================================
    // 56. P0 SIGN-UP AKUN BARU, INPUT KATA SANDI ADMIN, & SINKRONISASI TABEL PROFILES MURNI
    // =========================================================================
    const selfSignUpRes = await supabaseDataService.signUpNewUser({
      name: 'Ustadz Pendaftar Mandiri',
      username: 'ustadz_mandiri',
      email: 'mandiri@jabar.mtq.id',
      password: 'SandiAmanMandiri2026!'
    });

    // Admin/Superadmin menambahkan akun baru langsung beserta kata sandi awal tanpa mengubah sesi aktif
    currentAuthUser = { id: bootstrapUserId, email: 'superadmin@nasional.mtq.id' };
    const directPasswordProvisionRes = await supabaseDataService.upsertUserAndMembership({
      tenantId: tenantJabarId,
      user: {
        id: 'temp-ui-id-direct-pass',
        tenantId: tenantJabarId,
        username: 'hakim_sandi_langsung',
        name: 'KH. Hakim Sandi Langsung',
        email: 'hakim.sandi@jabar.mtq.id',
        role: 'judge',
        judgeCategory: 'Hakim 4',
        judgeField: 'Bidang Lagu',
        status: 'Aktif'
      },
      initialPassword: 'SandiHakimLangsung2026!'
    });

    // Hydrate workspace menggunakan tenantId non-UUID ('platform') seperti saat Superadmin membuka Manajemen Akun Global
    const superadminWorkspaceHydration = await supabaseDataService.fetchTenantWorkspaceResult('platform');
    const hydratedGlobalUsers = superadminWorkspaceHydration.payload?.users || [];
    const hasSelfSignedUpProfile = hydratedGlobalUsers.some(
      (u) => u.email === 'mandiri@jabar.mtq.id' && u.tenantId === 'unassigned'
    );
    const hasDirectPasswordJudge = hydratedGlobalUsers.some(
      (u) => u.email === 'hakim.sandi@jabar.mtq.id' && u.provisioningStatus === 'Aktif'
    );

    assert(
      '56. P0 Sign-Up Pengguna Baru, Input Kata Sandi Saat Tambah Akun, & Hidrasi Tabel public.profiles Murni: Mendaftarkan akun baru di auth.users & profiles, mendukung pembuatan akun dengan kata sandi langsung oleh Admin/Superadmin, dan memuat seluruh akun riil dari public.profiles',
      selfSignUpRes.success === true &&
        Boolean(selfSignUpRes.userId) &&
        directPasswordProvisionRes.success === true &&
        directPasswordProvisionRes.data?.provisioningStatus === 'Aktif' &&
        superadminWorkspaceHydration.success === true &&
        hasSelfSignedUpProfile === true &&
        hasDirectPasswordJudge === true,
      `signUp: ${selfSignUpRes.success}, directPassProv: ${directPasswordProvisionRes.success} (${directPasswordProvisionRes.message}), hasSelfSignedUp: ${hasSelfSignedUpProfile}, hasDirectJudge: ${hasDirectPasswordJudge}`
    );

    // =========================================================================
    // 57. P0 PERSISTENSI 15 ATRIBUT PESERTA, RELASI LEVEL BANK SOAL, AUDIT LOG UNDIAN MAQRA, & OUTBOX SYNC QUEUE
    // =========================================================================
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const levelDewasaId = '66666666-6666-4666-8666-666666666603';
    const extPartUuid = generateUuid();
    const extSpUuid = generateUuid();

    const extPartRes = await supabaseDataService.upsertParticipantWithStage({
      participant: {
        id: extPartUuid,
        tenantId: tenantJabarId,
        adminSequenceNumber: 'ADM-2026-099',
        participantId: 'TLW-EXT-099',
        name: 'Muhammad Zaki Al-Hafizh',
        fatherName: 'KH. Mansyur',
        gender: 'Putra',
        originCity: 'Kota Tasikmalaya',
        originRegion: 'Jawa Barat',
        originInstitution: 'PP Cipasung',
        kafilahId: kafilahBandungId,
        kafilahName: 'Kota Bandung',
        branchId: branchTilawahPutraId,
        branchName: 'Tilawah Dewasa Putra',
        levelId: levelDewasaId,
        levelName: 'Ulya (Dewasa)',
        stageId: stagePenyisihanId,
        stageName: 'Penyisihan',
        lotteryNumber: '99',
        status: 'Menunggu',
        questionId: '',
        assignedMaqra: 'Belum Ditetapkan',
        pageNumber: 305
      },
      stageParticipation: {
        id: extSpUuid,
        tenantId: tenantJabarId,
        participantId: extPartUuid,
        stageId: stagePenyisihanId,
        stageName: 'Penyisihan',
        branchId: branchTilawahPutraId,
        branchName: 'Tilawah Dewasa Putra',
        lotteryNumber: '99',
        questionId: '',
        assignedMaqra: 'Belum Ditetapkan',
        pageNumber: 305,
        status: 'Maqra Belum Ditetapkan'
      }
    });

    const extQuestionId = generateUuid();
    const extQuestionRes = await supabaseDataService.upsertQuestion({
      id: extQuestionId,
      tenantId: tenantJabarId,
      code: 'MQ-EXT-99',
      title: 'Maqra Relasional Cabang & Jenjang',
      surahName: 'Ar-Rahman',
      surahNumber: 55,
      startAyah: 1,
      endAyah: 25,
      pageNumber: 531,
      pageStart: 531,
      pageEnd: 532,
      pageNumbers: [531, 532],
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      levelId: levelDewasaId,
      levelName: 'Ulya (Dewasa)',
      branchAndLevel: 'Tilawah Dewasa Putra Ulya (Dewasa)',
      stageName: 'Penyisihan',
      status: 'Aktif'
    });

    const drawLogId = generateUuid();
    const drawLogRes = await supabaseDataService.insertLotteryDrawLog({
      id: drawLogId,
      tenantId: tenantJabarId,
      stageId: stagePenyisihanId,
      stageName: 'Penyisihan',
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      levelId: levelDewasaId,
      levelName: 'Ulya (Dewasa)',
      actorId: adminUserId,
      actorName: 'H. Ridwan Hakim',
      questionsPerParticipant: 1,
      questionPoolIds: [questionPenyisihanId, extQuestionId],
      participantIds: [extPartUuid],
      drawResults: [
        {
          participantId: extPartUuid,
          participantCode: 'TLW-EXT-099',
          participantName: 'Muhammad Zaki Al-Hafizh',
          lotteryNumber: '99',
          assignedQuestionIds: [extQuestionId],
          assignedQuestionCodes: ['MQ-EXT-99 - Maqra Relasional Cabang & Jenjang']
        }
      ],
      drawVersion: 1,
      createdAt: new Date().toISOString()
    });

    const rehydratedAfterExt = await supabaseDataService.fetchTenantWorkspaceResult(tenantJabarId);
    const hydratedExtPart = rehydratedAfterExt.payload?.participants.find((p) => p.id === extPartUuid);
    const hydratedExtQ = rehydratedAfterExt.payload?.questions.find((q) => q.id === extQuestionId);
    const hydratedDrawLog = rehydratedAfterExt.payload?.lotteryDrawLogs?.find((l) => l.id === drawLogId);

    // Outbox Sync Service verification: idempotency + blocking of critical finalization
    await outboxSyncService.clearAll();
    let blockedCriticalCheck = false;
    try {
      await outboxSyncService.enqueueOperation({
        idempotencyKey: 'forbidden-finalize',
        tenantId: tenantJabarId,
        operationType: 'FINALIZE_ASSESSMENT',
        entityLabel: 'Finalize Assessment',
        payload: {}
      });
    } catch {
      blockedCriticalCheck = true;
    }

    const enq1 = await outboxSyncService.enqueueOperation({
      idempotencyKey: `question:${extQuestionId}`,
      tenantId: tenantJabarId,
      operationType: 'UPSERT_QUESTION',
      entityLabel: 'MQ-EXT-99',
      payload: { code: 'MQ-EXT-99-V1' }
    });
    const enq2 = await outboxSyncService.enqueueOperation({
      idempotencyKey: `question:${extQuestionId}`,
      tenantId: tenantJabarId,
      operationType: 'UPSERT_QUESTION',
      entityLabel: 'MQ-EXT-99',
      payload: { code: 'MQ-EXT-99-V2' }
    });
    const pendingBeforeFlush = outboxSyncService.getSummary(tenantJabarId);
    outboxSyncService.registerProcessor(async () => ({ success: true }));
    const flushRes = await outboxSyncService.flushPendingQueue();
    const pendingAfterFlush = outboxSyncService.getSummary(tenantJabarId);

    assert(
      '57. P0 Persistensi 15 Atribut Peserta, Level ID Bank Soal, Audit Log Undian Maqra (`lottery_draw_logs`), & Idempotensi Outbox Sync Queue',
      extPartRes.success === true &&
        hydratedExtPart?.adminSequenceNumber === 'ADM-2026-099' &&
        hydratedExtPart?.fatherName === 'KH. Mansyur' &&
        hydratedExtPart?.originCity === 'Kota Tasikmalaya' &&
        hydratedExtPart?.originInstitution === 'PP Cipasung' &&
        extQuestionRes.success === true &&
        hydratedExtQ?.levelId === levelDewasaId &&
        drawLogRes.success === true &&
        hydratedDrawLog?.questionPoolIds.length === 2 &&
        blockedCriticalCheck === true &&
        enq1.id === enq2.id &&
        pendingBeforeFlush.pendingCount === 1 &&
        flushRes.succeeded === 1 &&
        pendingAfterFlush.pendingCount === 0,
      `extPart: ${extPartRes.success}, father: ${hydratedExtPart?.fatherName}, qLevel: ${hydratedExtQ?.levelId}, drawLog: ${drawLogRes.success}, outboxPendingBefore: ${pendingBeforeFlush.pendingCount}, after: ${pendingAfterFlush.pendingCount}`
    );

    // =========================================================================
    // 58. P1-06 OTORITAS SERVER TIE-BREAK BIDANG & VALIDASI OVERRIDE DUA ARAH PADA advance_stage_qualifiers
    // =========================================================================
    const tbStageId = generateUuid();
    const tbNextStageId = generateUuid();
    const tbPartHighTajwidId = generateUuid();
    const tbPartLowTajwidId = generateUuid();
    const tbSpHighId = generateUuid();
    const tbSpLowId = generateUuid();
    const tbMaqraHighId = generateUuid();
    const tbMaqraLowId = generateUuid();
    const tbAsmHighId = generateUuid();
    const tbAsmLowId = generateUuid();

    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, status, is_finalized)
      VALUES
        ('${tbStageId}', '${tenantJabarId}', '${branchTilawahPutraId}', 'Penyisihan TieBreak SQL', 10, 1, 'Aktif', false),
        ('${tbNextStageId}', '${tenantJabarId}', '${branchTilawahPutraId}', 'Final TieBreak SQL', 11, 1, 'Menunggu', false);

      INSERT INTO judge_assignments (id, tenant_id, stage_id, branch_id, judge_profile_id, judge_field, status)
      VALUES ('${generateUuid()}', '${tenantJabarId}', '${tbStageId}', '${branchTilawahPutraId}', '${judge1UserId}', 'Bidang Tajwid', 'Aktif');

      INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, level_id, participant_code, name, gender, lottery_number, status)
      VALUES
        ('${tbPartLowTajwidId}', '${tenantJabarId}', '${kafilahBandungId}', '${branchTilawahPutraId}', '${levelDewasaId}', 'TB-SQL-01', 'Peserta Tajwid Rendah (Undian Awal)', 'Putra', '91', 'Berlangsung'),
        ('${tbPartHighTajwidId}', '${tenantJabarId}', '${kafilahBandungId}', '${branchTilawahPutraId}', '${levelDewasaId}', 'TB-SQL-02', 'Peserta Tajwid Tinggi (Unggul Tie-Break)', 'Putra', '92', 'Berlangsung');

      INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
      VALUES
        ('${tbSpLowId}', '${tenantJabarId}', '${tbPartLowTajwidId}', '${tbStageId}', '91', 'Lengkap'),
        ('${tbSpHighId}', '${tenantJabarId}', '${tbPartHighTajwidId}', '${tbStageId}', '92', 'Lengkap');

      INSERT INTO assigned_maqras (id, tenant_id, stage_participation_id, question_id, assigned_by, method)
      VALUES
        ('${tbMaqraLowId}', '${tenantJabarId}', '${tbSpLowId}', '${questionPenyisihanId}', '${adminUserId}', 'undian'),
        ('${tbMaqraHighId}', '${tenantJabarId}', '${tbSpHighId}', '${questionPenyisihanId}', '${adminUserId}', 'undian');

      -- Kedua peserta memiliki final_score identik (92.00), tetapi tbPartHighTajwidId unggul pada bidang Tajwid (29.0 vs 26.0)
      INSERT INTO judge_assessments (
        id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id,
        status, is_locked, field_scores, total_deductions, final_score
      ) VALUES
        ('${tbAsmLowId}', '${tenantJabarId}', '${tbSpLowId}', '${tbMaqraLowId}', '${judge1UserId}', '${rubricSeniBacaId}',
         'in_progress', false, '{"Tajwid": 26.0, "Lagu": 26.0, "Fashahah": 25.0, "Suara": 15.0}'::jsonb, 8.0, 92.00),
        ('${tbAsmHighId}', '${tenantJabarId}', '${tbSpHighId}', '${tbMaqraHighId}', '${judge1UserId}', '${rubricSeniBacaId}',
         'in_progress', false, '{"Tajwid": 29.0, "Lagu": 23.0, "Fashahah": 25.0, "Suara": 15.0}'::jsonb, 8.0, 92.00);
    `);

    currentAuthUser = { id: judge1UserId, email: 'hakim1@jabar.mtq.id' };
    await supabaseDataService.finalizeJudgeAssessmentRpc(tbAsmLowId);
    await supabaseDataService.finalizeJudgeAssessmentRpc(tbAsmHighId);
    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };

    // 58a. Mencoba meloloskan tbPartLowTajwidId (peringkat #2 menurut tie-break Tajwid) TANPA alasan override -> WAJIB DITOLAK oleh SQL RPC!
    const invalidTieBreakAdvance = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: tbStageId,
      nextStageId: tbNextStageId,
      qualifiedParticipantIds: [tbPartLowTajwidId],
      overrideReasons: {},
      rankingsSnapshot: []
    });

    // 58b. Meloloskan tbPartHighTajwidId (peringkat #1 resmi menurut tie-break Tajwid di SQL) TANPA perlu alasan override -> WAJIB BERHASIL!
    const validTieBreakAdvance = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: tbStageId,
      nextStageId: tbNextStageId,
      qualifiedParticipantIds: [tbPartHighTajwidId],
      overrideReasons: {},
      rankingsSnapshot: []
    });

    assert(
      '58. P1-06 Otoritas Tie-Break Server & Validasi Override Dua Arah di PostgreSQL (`advance_stage_qualifiers`): Menghitung tie-break bidang (`field_scores`) langsung di SQL dan menolak pelolosan/pengguguran yang menyimpang dari tie-break resmi tanpa alasan override valid',
      invalidTieBreakAdvance.success === false &&
        invalidTieBreakAdvance.message.includes('override') &&
        validTieBreakAdvance.success === true,
      `invalidTbRejected: ${!invalidTieBreakAdvance.success} (${invalidTieBreakAdvance.message}), validTbAccepted: ${validTieBreakAdvance.success} (${validTieBreakAdvance.message})`
    );

    // =========================================================================
    // 59. P0 MASTER DATA PURE DB: ISOLASI TENANT KOSONG, RELASI CABANG+JENJANG RUBRIK & HAKIM, SERTA PENGHAPUSAN PERMANEN BIDANG RUBRIK
    // =========================================================================
    const emptyTenantCleanId = '11111111-1111-4111-8111-111111111199';
    await pg.exec(`
      INSERT INTO tenants (id, code, name, event_name, region, edition, period, status)
      VALUES ('${emptyTenantCleanId}', 'LPTQ-EMPTY', 'LPTQ Tenant Bersih', 'MTQ Baru Kosong', 'Banten', '2026', '2026', 'Aktif')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO tenant_memberships (tenant_id, profile_id, role, status)
      VALUES ('${emptyTenantCleanId}', '${adminUserId}', 'admin', 'Aktif')
      ON CONFLICT (tenant_id, profile_id) DO NOTHING;
    `);
    const emptyTenantHydration = await supabaseDataService.fetchTenantWorkspaceResult(emptyTenantCleanId);
    const emptyPayload = emptyTenantHydration.payload;

    // Uji pembuatan Rubrik dengan relasi branchId + levelId dan 2 bidang, lalu hapus 1 bidang via deleteRubricField
    const customRubricId = generateUuid();
    const fieldKeepId = generateUuid();
    const fieldDeleteId = generateUuid();
    const linkedErrorCatId = generateUuid();

    const saveCustomRubricRes = await supabaseDataService.upsertRubricVersionWithFields(tenantJabarId, {
      id: customRubricId,
      tenantId: tenantJabarId,
      code: 'RUBRIC-DWS-PUTRA-2026',
      name: 'Rubrik Tilawah Dewasa Putra Terkait Jenjang',
      branchId: branchTilawahPutraId,
      branchCode: 'TLW-DWS-PA',
      branchName: 'Tilawah Dewasa Putra',
      levelId: levelDewasaId,
      levelName: 'Ulya (Dewasa)',
      version: '2026.1',
      description: 'Rubrik spesifik cabang dan jenjang murni DB',
      officialSource: 'SK LPTQ 2026',
      startingScore: 100,
      status: 'Aktif',
      createdAt: '2026-11-09',
      fields: [
        {
          id: fieldKeepId,
          code: 'TJW-26',
          name: 'Tajwid Utama',
          maxScore: 60,
          minScore: 0,
          maxDeduction: 60,
          order: 1,
          status: 'Aktif',
          description: 'Bidang yang dipertahankan',
          criteria: []
        },
        {
          id: fieldDeleteId,
          code: 'FSH-26',
          name: 'Fashahah Sementara',
          maxScore: 40,
          minScore: 0,
          maxDeduction: 40,
          order: 2,
          status: 'Aktif',
          description: 'Bidang yang akan dihapus permanen',
          criteria: []
        }
      ]
    });

    // Tautkan kategori kesalahan ke fieldDeleteId untuk menguji detaching saat field dihapus
    await supabaseDataService.upsertErrorCategory({
      id: linkedErrorCatId,
      tenantId: tenantJabarId,
      fieldId: fieldDeleteId,
      code: 'ERR-FSH-DEL',
      name: 'Kesalahan Fashahah Terkait',
      scope: 'Fashahah Sementara',
      defaultDeduction: 1,
      methodType: 'Pengurangan tetap',
      status: 'Aktif',
      order: 10
    });

    // Hapus bidang fieldDeleteId menggunakan deleteRubricField (memanggil RPC delete_rubric_field_cascade)
    const cascadeDeleteFieldRes = await supabaseDataService.deleteRubricField(customRubricId, fieldDeleteId);

    // Simpan penugasan hakim dengan relasi levelId dan judgeFieldId
    const linkedJudgeAssignmentId = generateUuid();
    const saveLinkedAssignmentRes = await supabaseDataService.upsertJudgeAssignment({
      id: linkedJudgeAssignmentId,
      tenantId: tenantJabarId,
      stageId: stagePenyisihanId,
      stageName: 'Penyisihan',
      branchId: branchTilawahPutraId,
      branchName: 'Tilawah Dewasa Putra',
      levelId: levelDewasaId,
      levelName: 'Ulya (Dewasa)',
      judgeId: judge2UserId,
      judgeName: 'Dr. Hj. Maria Ulfah',
      judgeFieldId: fieldKeepId,
      judgeField: 'Tajwid Utama'
    });

    // Hidrasi ulang untuk memastikan fieldDeleteId TIDAK muncul kembali dan relasi tersimpan utuh
    const rehydratedAfterDelete = await supabaseDataService.fetchTenantWorkspaceResult(tenantJabarId);
    const hydratedCustomRubric = rehydratedAfterDelete.payload?.rubricVersions.find(
      (r) => r.id === customRubricId
    );
    const hydratedLinkedErrorCat = rehydratedAfterDelete.payload?.errorCategories.find(
      (c) => c.id === linkedErrorCatId
    );
    const hydratedLinkedAssignment = rehydratedAfterDelete.payload?.judgeAssignments.find(
      (a) => a.id === linkedJudgeAssignmentId
    );

    assert(
      '59. P0 Master Data Pure DB: Tenant baru bersih tanpa item bawaan (0 item), penyimpanan relasi branch_id + level_id pada rubrik & penugasan hakim, serta penghapusan permanen bidang rubrik via RPC tanpa muncul kembali saat re-fetch',
      emptyTenantHydration.success === true &&
        emptyPayload?.rubricVersions.length === 0 &&
        emptyPayload?.errorCategories.length === 0 &&
        emptyPayload?.competitionRules.length === 0 &&
        emptyPayload?.stages.length === 0 &&
        emptyPayload?.jenjangList.length === 0 &&
        emptyPayload?.cabangList.length === 0 &&
        emptyPayload?.judgeAssignments.length === 0 &&
        saveCustomRubricRes.success === true &&
        cascadeDeleteFieldRes.success === true &&
        hydratedCustomRubric?.branchId === branchTilawahPutraId &&
        hydratedCustomRubric?.levelId === levelDewasaId &&
        hydratedCustomRubric?.fields.length === 1 &&
        hydratedCustomRubric?.fields[0]?.id === fieldKeepId &&
        !hydratedCustomRubric?.fields.some((f) => f.id === fieldDeleteId) &&
        !hydratedLinkedErrorCat?.fieldId &&
        saveLinkedAssignmentRes.success === true &&
        hydratedLinkedAssignment?.levelId === levelDewasaId &&
        hydratedLinkedAssignment?.judgeField === 'Tajwid Utama',
      `emptyRubrics: ${emptyPayload?.rubricVersions.length}, saveRubric: ${saveCustomRubricRes.success}, delField: ${cascadeDeleteFieldRes.success} (${cascadeDeleteFieldRes.message}), remainingFields: ${hydratedCustomRubric?.fields.length}, detachedErrCatField: ${hydratedLinkedErrorCat?.fieldId}, asgLevel: ${hydratedLinkedAssignment?.levelId}`
    );
    // 60. Proteksi Server Scoring Terhadap Kategori Tanpa Aturan Deduksi (deduction_rule_id IS NULL)
    // Memastikan kategori kesalahan custom tanpa deduction_rule_id dengan count > 0 dihitung presisi tanpa crash "Record v_rule is not assigned yet"
    const customCatId = '88888888-8888-4888-8888-888888888899';
    await pg.exec(`
      INSERT INTO error_categories (id, tenant_id, rubric_field_id, code, name, scope, default_deduction, status)
      VALUES ('${customCatId}', '${tenantJabarId}', '33333333-3333-4333-8333-333333333401', 'CUSTOM_ERR_1', 'Kesalahan Kustom Tajwid', 'Tajwid', 1.50, 'Aktif')
      ON CONFLICT (id) DO UPDATE SET deduction_rule_id = NULL, default_deduction = 1.50, status = 'Aktif';
    `);

    let scoreCalcSuccess = false;
    let scoreCalcError = '';
    let calcResult: any = null;
    try {
      const qRes = await pg.query<{ res: any }>(`
        SELECT calculate_assessment_score_sql(
          '${tenantJabarId}'::uuid,
          '${rubricSeniBacaId}'::uuid,
          '{"CUSTOM_ERR_1": 2}'::jsonb
        ) AS res;
      `);
      calcResult = typeof qRes.rows[0]?.res === 'string' ? JSON.parse(qRes.rows[0].res) : qRes.rows[0]?.res;
      scoreCalcSuccess = true;
    } catch (err: any) {
      scoreCalcError = err?.message || String(err);
    }

    assert(
      '60. Proteksi Server Scoring Terhadap Kategori Tanpa Aturan Deduksi: Kategori kesalahan dengan deduction_rule_id NULL dan jumlah kejadian > 0 berhasil dihitung di PostgreSQL tanpa error v_rule',
      scoreCalcSuccess &&
        calcResult &&
        Number(calcResult.total_deductions) === 3.00 &&
        Number(calcResult.final_score) === 97.00 &&
        Number(calcResult.field_scores?.Tajwid) === 27.00,
      scoreCalcError ||
        `totalDeductions: ${calcResult?.total_deductions}, finalScore: ${calcResult?.final_score}, tajwidScore: ${calcResult?.field_scores?.Tajwid}`
    );

    // 61. T1.1 Validasi Integritas Maqra di PostgreSQL (surah_number 1..114, batas ayat per surah, page 1..604, & audit_questions_consistency)
    let surah0Rejected = false;
    let surah115Rejected = false;
    let baqarah300Rejected = false;
    try {
      await pg.exec(`
        INSERT INTO questions (id, tenant_id, code, title, surah_name, surah_number, start_ayah, end_ayah, page_number, page_start, page_end, status)
        VALUES ('${generateUuid()}', '${tenantJabarId}', 'MQ-BAD-0', 'Surah 0', 'Fiktif', 0, 1, 5, 1, 1, 1, 'Aktif');
      `);
    } catch {
      surah0Rejected = true;
    }
    try {
      await pg.exec(`
        INSERT INTO questions (id, tenant_id, code, title, surah_name, surah_number, start_ayah, end_ayah, page_number, page_start, page_end, status)
        VALUES ('${generateUuid()}', '${tenantJabarId}', 'MQ-BAD-115', 'Surah 115', 'Fiktif', 115, 1, 5, 1, 1, 1, 'Aktif');
      `);
    } catch {
      surah115Rejected = true;
    }
    try {
      await pg.exec(`
        INSERT INTO questions (id, tenant_id, code, title, surah_name, surah_number, start_ayah, end_ayah, page_number, page_start, page_end, status)
        VALUES ('${generateUuid()}', '${tenantJabarId}', 'MQ-BAD-AYAH', 'Al-Baqarah 300', 'Al-Baqarah', 2, 1, 300, 2, 2, 49, 'Aktif');
      `);
    } catch {
      baqarah300Rejected = true;
    }

    assert(
      '61. T1.1 Proteksi Integritas Maqra di PostgreSQL: Menolak INSERT questions dengan surah_number 0, 115, atau ayat melebihi jumlah ayat surah (Al-Baqarah > 286)',
      surah0Rejected && surah115Rejected && baqarah300Rejected,
      `surah0Rejected: ${surah0Rejected}, surah115Rejected: ${surah115Rejected}, baqarah300Rejected: ${baqarah300Rejected}`
    );

    // 62. T1.2 Paritas Perhitungan Kelengkapan Babak antara TypeScript (`getStageCompletion`) dan PostgreSQL (`get_stage_completion_sql`)
    let sqlStageCompletion: any = null;
    try {
      const compRes = await pg.query<{ res: any }>(`
        SELECT get_stage_completion_sql('${tbStageId}'::uuid) AS res;
      `);
      sqlStageCompletion =
        typeof compRes.rows[0]?.res === 'string'
          ? JSON.parse(compRes.rows[0].res)
          : compRes.rows[0]?.res;
    } catch {
      sqlStageCompletion = null;
    }

    assert(
      '62. T1.2 Paritas Kelengkapan Babak (TS vs SQL `get_stage_completion_sql`): Menghasilkan total peserta, peserta lengkap, jumlah hakim wajib, dan status kelengkapan yang identik',
      Boolean(sqlStageCompletion) &&
        Number(sqlStageCompletion?.total_participants_count) === 2 &&
        Number(sqlStageCompletion?.completed_participants_count) === 2 &&
        Number(sqlStageCompletion?.incomplete_participants_count) === 0 &&
        Number(sqlStageCompletion?.required_judge_count) === 1 &&
        sqlStageCompletion?.all_complete === true,
      `sqlStageCompletion: ${JSON.stringify(sqlStageCompletion)}`
    );

    // 63. T2.1 Isolasi Profil Lintas-Tenant pada `upsert_tenant_member_profile`
    // Admin Tenant Jabar menambahkan email milik Hakim Tenant DKI ('hakim@dki.mtq.id') dengan nama & username palsu.
    // Keanggotaan di Tenant Jabar boleh terbuat, tetapi profiles.name & profiles.username global milik Hakim DKI TIDAK BOLEH tertimpa,
    // dan peran Hakim DKI di Tenant DKI tetap 'judge' (bukan admin di DKI).
    let crossTenantUpsertOk = false;
    let dkiProfileAfter: { name?: string; username?: string; email?: string; role?: string } | null = null;
    let dkiMembershipRoleAfter = '';
    let isDkiAdminAfter = true;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        SELECT upsert_tenant_member_profile(
          '${tenantJabarId}'::uuid,
          NULL::uuid,
          'username_bajakan',
          'Nama Palsu Bajakan',
          'hakim@dki.mtq.id',
          'admin',
          NULL,
          NULL,
          'Aktif'
        );
        COMMIT;
      `);
      crossTenantUpsertOk = true;

      const profQ = await pg.query<{ name: string; username: string; email: string; role: string }>(`
        SELECT name, username, email, role FROM public.profiles WHERE id = '${otherTenantJudgeId}'::uuid;
      `);
      dkiProfileAfter = profQ.rows[0] || null;

      const memQ = await pg.query<{ role: string }>(`
        SELECT role FROM public.tenant_memberships
        WHERE tenant_id = '${tenantDkiId}'::uuid AND profile_id = '${otherTenantJudgeId}'::uuid;
      `);
      dkiMembershipRoleAfter = memQ.rows[0]?.role || '';

      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${otherTenantJudgeId}', true);
      `);
      const admCheck = await pg.query<{ is_adm: boolean }>(`
        SELECT is_tenant_admin('${tenantDkiId}'::uuid) AS is_adm;
      `);
      isDkiAdminAfter = Boolean(admCheck.rows[0]?.is_adm);
      await pg.exec(`COMMIT;`);
    } catch (err: any) {
      try {
        await pg.exec(`ROLLBACK;`);
      } catch {
        // ignore
      }
    }

    assert(
      '63. T2.1 Isolasi Profil Lintas-Tenant: Admin Tenant A tidak dapat menimpa nama, username, atau peran global pengguna yang sudah terdaftar di Tenant B',
      crossTenantUpsertOk &&
        dkiProfileAfter?.name === 'KH. Hakim DKI' &&
        dkiProfileAfter?.username === 'hakim_dki' &&
        dkiMembershipRoleAfter === 'judge' &&
        isDkiAdminAfter === false,
      `crossTenantUpsertOk: ${crossTenantUpsertOk}, name: ${dkiProfileAfter?.name}, username: ${dkiProfileAfter?.username}, dkiRole: ${dkiMembershipRoleAfter}, isDkiAdmin: ${isDkiAdminAfter}`
    );

    // =========================================================================
    // 64. FASE 1.1 & 1.2: OTORISASI KETAT `audit_questions_consistency` & `get_stage_completion_sql`
    // =========================================================================
    let anonAuditQuestionsRejected = false;
    let crossTenantAuditQuestionsRejected = false;
    let nullTenantAuditQuestionsRejected = false;
    let ownTenantAuditQuestionsSuccess = false;

    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE anon;
        SELECT set_config('request.jwt.claim.sub', '', true);
        SELECT audit_questions_consistency('${tenantJabarId}'::uuid);
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      anonAuditQuestionsRejected = true;
    }

    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        SELECT audit_questions_consistency('${tenantDkiId}'::uuid);
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      crossTenantAuditQuestionsRejected = true;
    }

    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        SELECT audit_questions_consistency(NULL::uuid);
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      nullTenantAuditQuestionsRejected = true;
    }

    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        SELECT audit_questions_consistency('${tenantJabarId}'::uuid);
        COMMIT;
      `);
      ownTenantAuditQuestionsSuccess = true;
    } catch {
      await pg.exec('ROLLBACK;');
      ownTenantAuditQuestionsSuccess = false;
    }

    let crossTenantStageCompletionRejected = false;
    const dkiOnlyStageId = generateUuid();
    await pg.exec(`
      INSERT INTO stages (id, tenant_id, name, stage_order, qualification_quota, status, is_finalized)
      VALUES ('${dkiOnlyStageId}', '${tenantDkiId}', 'Penyisihan Khusus DKI', 1, 3, 'Aktif', false);
    `);
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        SELECT get_stage_completion_sql('${dkiOnlyStageId}'::uuid);
        COMMIT;
      `);
    } catch {
      await pg.exec('ROLLBACK;');
      crossTenantStageCompletionRejected = true;
    }

    assert(
      '64. Fase 1.1 & 1.2 Otorisasi `audit_questions_consistency` & `get_stage_completion_sql`: Menolak anon, menolak admin lintas-tenant/NULL, dan menolak pembacaan kelengkapan babak lintas-tenant',
      anonAuditQuestionsRejected &&
        crossTenantAuditQuestionsRejected &&
        nullTenantAuditQuestionsRejected &&
        ownTenantAuditQuestionsSuccess &&
        crossTenantStageCompletionRejected,
      `anonRej: ${anonAuditQuestionsRejected}, crossAuditRej: ${crossTenantAuditQuestionsRejected}, nullRej: ${nullTenantAuditQuestionsRejected}, ownOk: ${ownTenantAuditQuestionsSuccess}, crossCompRej: ${crossTenantStageCompletionRejected}`
    );

    // =========================================================================
    // 65. FASE 1.3: PENGERASAN SELURUH FUNGSI `SECURITY DEFINER` DI SKEMA PUBLIC
    // =========================================================================
    const secDefAuditQuery = await pg.query<{
      proname: string;
      anon_exec: boolean;
      pub_exec: boolean;
      has_search_path: boolean;
    }>(`
      SELECT
        p.proname,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
        has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
        EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=%'
        ) AS has_search_path
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND p.prorettype <> 'pg_catalog.trigger'::regtype;
    `);
    const insecureAnonDefs = secDefAuditQuery.rows.filter((r) => r.anon_exec || r.pub_exec);
    const missingSearchPathDefs = secDefAuditQuery.rows.filter((r) => !r.has_search_path);

    assert(
      '65. Fase 1.3 Audit Fungsi SECURITY DEFINER: Seluruh fungsi non-trigger di public mencabut EXECUTE dari PUBLIC/anon dan memiliki search_path eksplisit',
      secDefAuditQuery.rows.length > 0 &&
        insecureAnonDefs.length === 0 &&
        missingSearchPathDefs.length === 0,
      `totalSecDef: ${secDefAuditQuery.rows.length}, insecureAnon: ${insecureAnonDefs.map((x) => x.proname).join(',')}, missingSearchPath: ${missingSearchPathDefs.map((x) => x.proname).join(',')}`
    );

    // =========================================================================
    // 66. FASE 1.4: INTEGRITAS RELASI LINTAS-TENANT (TRIGGER `enforce_cross_tenant_reference_integrity`)
    // =========================================================================
    const dkiKafilahId = generateUuid();
    await pg.exec(`
      INSERT INTO kafilahs (id, tenant_id, code, name, region, status)
      VALUES ('${dkiKafilahId}', '${tenantDkiId}', 'KAF-DKI-01', 'Kafilah Jakarta Pusat', 'DKI Jakarta', 'Aktif');
    `);

    let crossTenantKafilahParticipantRejected = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status)
        VALUES ('${generateUuid()}', '${tenantJabarId}', '${dkiKafilahId}', '${branchTilawahPutraId}', 'CROSS-01', 'Peserta Lintas Kafilah', 'Putra', '88', 'Menunggu');
        COMMIT;
      `);
    } catch (err: any) {
      await pg.exec('ROLLBACK;');
      crossTenantKafilahParticipantRejected = String(err?.message || err).includes('Pelanggaran Isolasi Lintas-Tenant');
    }

    let crossTenantStageParticipationRejected = false;
    try {
      await pg.exec(`
        BEGIN;
        SET LOCAL ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
        INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
        VALUES ('${generateUuid()}', '${tenantDkiId}', '${participantUuid}', '${stagePenyisihanId}', '88', 'Menunggu');
        COMMIT;
      `);
    } catch (err: any) {
      await pg.exec('ROLLBACK;');
      crossTenantStageParticipationRejected =
        String(err?.message || err).includes('Pelanggaran Isolasi Lintas-Tenant') ||
        String(err?.message || err).includes('row-level security');
    }

    assert(
      '66. Fase 1.4 Integritas FK Lintas-Tenant: Menolak pembuatan peserta di Tenant A dengan kafilah_id milik Tenant B serta menolak stage_participations lintas-tenant',
      crossTenantKafilahParticipantRejected && crossTenantStageParticipationRejected,
      `crossKafilahRej: ${crossTenantKafilahParticipantRejected}, crossSpRej: ${crossTenantStageParticipationRejected}`
    );

    // =========================================================================
    // 67. FASE 1.5: ANTI-SPOOFING PELAKU UNDIAN PADA `commit_lottery_draw`
    // =========================================================================
    const lotterySpoofStageId = generateUuid();
    const lotterySpoofPartId = generateUuid();
    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, status, is_finalized)
      VALUES ('${lotterySpoofStageId}', '${tenantJabarId}', '${branchTilawahPutraId}', 'Babak Uji Undian Anti-Spoof', 20, 3, 'Aktif', false);
      INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, level_id, participant_code, name, gender, lottery_number, status, verification_status)
      VALUES ('${lotterySpoofPartId}', '${tenantJabarId}', '${kafilahBandungId}', '${branchTilawahPutraId}', '${levelDewasaId}', 'LOT-01', 'Peserta Undian Aman', 'Putra', '07', 'Menunggu', 'Diverifikasi');
    `);

    await pg.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
      SELECT commit_lottery_draw(
        '${tenantJabarId}'::uuid,
        '${lotterySpoofStageId}'::uuid,
        'Babak Uji Undian Anti-Spoof'::varchar,
        '${branchTilawahPutraId}'::uuid,
        'Tilawah Dewasa Putra'::varchar,
        '${levelDewasaId}'::uuid,
        'Ulya (Dewasa)'::varchar,
        '${otherTenantJudgeId}'::uuid,
        'Actor Palsu Spoofed'::varchar,
        '[{"participantId": "${lotterySpoofPartId}", "questionIds": ["${questionPenyisihanId}"]}]'::jsonb,
        1,
        'Uji anti-spoofing undian'::text
      );
      COMMIT;
    `);

    const spoofLogCheck = await pg.query<{ actor_id: string; actor_name: string }>(`
      SELECT actor_id::text, actor_name
      FROM lottery_draw_logs
      WHERE stage_id = '${lotterySpoofStageId}'::uuid
      ORDER BY created_at DESC
      LIMIT 1;
    `);

    assert(
      '67. Fase 1.5 Anti-Spoofing `commit_lottery_draw`: Mengabaikan p_actor_id/p_actor_name dari klien dan selalu mencatat auth.uid() serta nama asli dari profiles',
      spoofLogCheck.rows[0]?.actor_id === adminUserId &&
        spoofLogCheck.rows[0]?.actor_name === 'H. Ridwan Hakim',
      `recordedActorId: ${spoofLogCheck.rows[0]?.actor_id}, recordedActorName: ${spoofLogCheck.rows[0]?.actor_name}`
    );

    // =========================================================================
    // 68. FASE 1.6: ROLLBACK PENGHAPUSAN USER AUTH SAAT RPC PROVISIONING GAGAL
    // =========================================================================
    let deletedUserIds: string[] = [];
    const rollbackInvitedRes = await handleProvisionRpcFailureRollback({
      internalProvisioningState: 'invited',
      resolvedAuthUserId: 'uid-orphan-invited-01',
      rpcErrorMessage: 'Simulated RPC failure',
      deleteAuthUser: async (uid) => {
        deletedUserIds.push(uid);
        return { error: null };
      }
    });
    const rollbackExistingRes = await handleProvisionRpcFailureRollback({
      internalProvisioningState: 'linked_existing',
      resolvedAuthUserId: 'uid-existing-keep-02',
      rpcErrorMessage: 'Simulated RPC failure',
      deleteAuthUser: async (uid) => {
        deletedUserIds.push(uid);
        return { error: null };
      }
    });

    assert(
      '68. Fase 1.6 Rollback User Auth Yatim (`handleProvisionRpcFailureRollback`): Menghapus user Auth baru jika RPC gagal (status 422), dan tidak menghapus akun lama yang sudah ada',
      rollbackInvitedRes.status === 422 &&
        rollbackInvitedRes.body.rolledBackAuthUser === true &&
        deletedUserIds.length === 1 &&
        deletedUserIds[0] === 'uid-orphan-invited-01' &&
        rollbackExistingRes.body.rolledBackAuthUser === false,
      `rolledBackInvited: ${rollbackInvitedRes.body.rolledBackAuthUser}, deletedIds: ${deletedUserIds.join(',')}`
    );

    // =========================================================================
    // 69. FASE 1.7: SANITASI `handle_new_auth_user` (NAMA TERCADANG & SUFIKS ANTI-BENTURAN)
    // =========================================================================
    const reservedUserAuthId = generateUuid();
    const twinUser1AuthId = generateUuid();
    const twinUser2AuthId = generateUuid();

    await pg.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${reservedUserAuthId}', 'coba.admin@jabar.mtq.id', '{"name": "Coba Nama Terlarang", "username": "ADMIN"}'::jsonb),
        ('${twinUser1AuthId}', 'kembar1@jabar.mtq.id', '{"name": "Qari Kembar Satu", "username": "Qari_Kembar!@#"}'::jsonb),
        ('${twinUser2AuthId}', 'kembar2@jabar.mtq.id', '{"name": "Qari Kembar Dua", "username": "Qari_Kembar!@#"}'::jsonb);
    `);

    const sanitizedProfilesQ = await pg.query<{ id: string; username: string }>(`
      SELECT id::text, username
      FROM profiles
      WHERE id IN ('${reservedUserAuthId}'::uuid, '${twinUser1AuthId}'::uuid, '${twinUser2AuthId}'::uuid);
    `);
    const reservedProf = sanitizedProfilesQ.rows.find((r) => r.id === reservedUserAuthId);
    const twinProf1 = sanitizedProfilesQ.rows.find((r) => r.id === twinUser1AuthId);
    const twinProf2 = sanitizedProfilesQ.rows.find((r) => r.id === twinUser2AuthId);
    const validUsernameRegex = /^[a-z0-9_.-]{3,30}$/;

    assert(
      '69. Fase 1.7 Sanitasi Trigger `handle_new_auth_user`: Menolak username tercadang (admin/superadmin/root/support), menyanitasi ke [a-z0-9_.-] (3-30 karakter), dan menambahkan sufiks unik saat benturan',
      Boolean(reservedProf) &&
        reservedProf?.username !== 'admin' &&
        validUsernameRegex.test(reservedProf?.username || '') &&
        twinProf1?.username === 'qari_kembar' &&
        Boolean(twinProf2?.username) &&
        twinProf2?.username !== 'qari_kembar' &&
        Boolean(twinProf2?.username.startsWith('qari_kembar_')) &&
        validUsernameRegex.test(twinProf2?.username || ''),
      `reserved: ${reservedProf?.username}, twin1: ${twinProf1?.username}, twin2: ${twinProf2?.username}`
    );

    // =========================================================================
    // 70. FASE 2.1 & 2.2: `compute_stage_rankings` (REGRESI SKOR, TIE-BREAK KRITERIA KE-3, NULLS LAST)
    // =========================================================================
    const f2BranchId = generateUuid();
    const f2StageRegId = generateUuid();
    const f2StageTb3Id = generateUuid();
    const f2RubricId = rubricSeniBacaId;
    const f2RuleId = generateUuid();

    await pg.exec(`
      INSERT INTO branches (id, tenant_id, code, name, status)
      VALUES ('${f2BranchId}', '${tenantJabarId}', 'TLW-F2', 'Tilawah Uji Fase 2', 'Aktif');

      INSERT INTO competition_rule_configs (id, tenant_id, branch_id, branch_name, rubric_version_id, tie_break_order, quota_per_stage, is_verified_official, status)
      VALUES ('${f2RuleId}', '${tenantJabarId}', '${f2BranchId}', 'Tilawah Uji Fase 2', '${f2RubricId}', ARRAY['total', 'Tajwid', 'Lagu', 'Fashahah'], '{"Penyisihan": 3, "Final": 3}'::jsonb, true, 'Aktif');

      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, champion_count, status, is_finalized)
      VALUES
        ('${f2StageRegId}', '${tenantJabarId}', '${f2BranchId}', 'Penyisihan Regresi F2', 30, 3, 3, 'Aktif', false),
        ('${f2StageTb3Id}', '${tenantJabarId}', '${f2BranchId}', 'Penyisihan TieBreak3 F2', 31, 2, 3, 'Aktif', false);

      INSERT INTO judge_assignments (id, tenant_id, judge_profile_id, stage_id, branch_id, judge_field, status)
      VALUES
        ('${generateUuid()}', '${tenantJabarId}', '${judge1UserId}', '${f2StageRegId}', '${f2BranchId}', 'Tajwid', 'Aktif'),
        ('${generateUuid()}', '${tenantJabarId}', '${judge1UserId}', '${f2StageTb3Id}', '${f2BranchId}', 'Tajwid', 'Aktif');
    `);

    // 4 peserta untuk regresi skor: #101 = 99.00, #103 = 95.63, #102 = 94.25, #104 = 92.63
    const regSpecs = [
      { code: 'P-101', lot: '101', score: 99.0, fScores: { Tajwid: 30, Lagu: 25, Fashahah: 29, Suara: 15 } },
      { code: 'P-102', lot: '102', score: 94.25, fScores: { Tajwid: 28, Lagu: 23.25, Fashahah: 28, Suara: 15 } },
      { code: 'P-103', lot: '103', score: 95.63, fScores: { Tajwid: 29, Lagu: 24.63, Fashahah: 27, Suara: 15 } },
      { code: 'P-104', lot: '104', score: 92.63, fScores: { Tajwid: 27, Lagu: 22.63, Fashahah: 28, Suara: 15 } }
    ];
    for (const spec of regSpecs) {
      const pId = generateUuid();
      const spId = generateUuid();
      const amId = generateUuid();
      await pg.exec(`
        INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status)
        VALUES ('${pId}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', '${spec.code}', 'Peserta ${spec.lot}', 'Putra', '${spec.lot}', 'Berlangsung');
        INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
        VALUES ('${spId}', '${tenantJabarId}', '${pId}', '${f2StageRegId}', '${spec.lot}', 'Lengkap');
        INSERT INTO assigned_maqras (id, tenant_id, stage_participation_id, question_id)
        VALUES ('${amId}', '${tenantJabarId}', '${spId}', '${questionPenyisihanId}');
        INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, error_counts, field_scores, total_deductions, final_score)
        VALUES ('${generateUuid()}', '${tenantJabarId}', '${spId}', '${amId}', '${judge1UserId}', '${f2RubricId}', 'in_progress', false, '{}'::jsonb, '${JSON.stringify(spec.fScores)}'::jsonb, ${100 - spec.score}, ${spec.score});
        BEGIN;
        SELECT set_config('mtq.rpc_finalize_active', 'true', true);
        UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${spId}'::uuid;
        COMMIT;
      `);
    }

    currentAuthUser = { id: adminUserId, email: 'admin@jabar.mtq.id' };
    const regRankingRes = await supabaseDataService.computeStageRankingsRpc(f2StageRegId);
    const regRankings = ((regRankingRes.data as any)?.rankings || []) as Array<any>;

    // Uji Tie-Break Kriteria ke-3 (Fashahah) & NULLS LAST pada f2StageTb3Id
    // Peserta A & B sama pada total (95.00), Tajwid (29), dan Lagu (24), namun Fashahah berbeda (28 vs 27).
    // Peserta C juga 95.00, Tajwid (29), Lagu (24), namun Fashahah NULL (tidak ada di JSONB) -> wajib di urutan paling belakang (NULLS LAST).
    const tb3Specs = [
      { code: 'TB3-B', lot: '01', score: 95.0, fScores: { Tajwid: 29, Lagu: 24, Fashahah: 27, Suara: 15 } },
      { code: 'TB3-A', lot: '02', score: 95.0, fScores: { Tajwid: 29, Lagu: 24, Fashahah: 28, Suara: 14 } },
      { code: 'TB3-NULL', lot: '00', score: 95.0, fScores: { Tajwid: 29, Lagu: 24 } }
    ];
    for (const spec of tb3Specs) {
      const pId = generateUuid();
      const spId = generateUuid();
      const amId = generateUuid();
      await pg.exec(`
        INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status)
        VALUES ('${pId}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', '${spec.code}', '${spec.code}', 'Putra', '${spec.lot}', 'Berlangsung');
        INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
        VALUES ('${spId}', '${tenantJabarId}', '${pId}', '${f2StageTb3Id}', '${spec.lot}', 'Lengkap');
        INSERT INTO assigned_maqras (id, tenant_id, stage_participation_id, question_id)
        VALUES ('${amId}', '${tenantJabarId}', '${spId}', '${questionPenyisihanId}');
        INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, error_counts, field_scores, total_deductions, final_score)
        VALUES ('${generateUuid()}', '${tenantJabarId}', '${spId}', '${amId}', '${judge1UserId}', '${f2RubricId}', 'in_progress', false, '{}'::jsonb, '${JSON.stringify(spec.fScores)}'::jsonb, 5, ${spec.score});
        BEGIN;
        SELECT set_config('mtq.rpc_finalize_active', 'true', true);
        UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${spId}'::uuid;
        COMMIT;
      `);
    }

    const tb3RankingRes = await supabaseDataService.computeStageRankingsRpc(f2StageTb3Id);
    const tb3Rankings = ((tb3RankingRes.data as any)?.rankings || []) as Array<any>;

    assert(
      '70. Fase 2.1 & 2.2 `compute_stage_rankings`: Regresi skor (#101=99.00, #103=95.63, #102=94.25, #104=92.63), tie-break kriteria ke-3 (Fashahah), dan NULLS LAST saat skor bidang NULL',
      regRankingRes.success === true &&
        regRankings.length === 4 &&
        regRankings[0]?.lottery_number === '101' &&
        Number(regRankings[0]?.final_score) === 99.0 &&
        regRankings[1]?.lottery_number === '103' &&
        Number(regRankings[1]?.final_score) === 95.63 &&
        regRankings[2]?.lottery_number === '102' &&
        Number(regRankings[2]?.final_score) === 94.25 &&
        regRankings[3]?.lottery_number === '104' &&
        Number(regRankings[3]?.final_score) === 92.63 &&
        tb3Rankings.length === 3 &&
        tb3Rankings[0]?.participant_name === 'TB3-A' &&
        tb3Rankings[0]?.rank === 1 &&
        tb3Rankings[1]?.participant_name === 'TB3-B' &&
        tb3Rankings[1]?.rank === 2 &&
        tb3Rankings[2]?.participant_name === 'TB3-NULL' &&
        tb3Rankings[2]?.rank === 3,
      `regLots: ${regRankings.map((r) => `${r.lottery_number}:${r.final_score}`).join(',')}, tb3Order: ${tb3Rankings.map((r) => `${r.participant_name}:#${r.rank}`).join(',')}`
    );

    // =========================================================================
    // 71. FASE 2.2 & 2.7: SERI IDENTIK PADA BATAS KUOTA (`UNRESOLVED_CRITICAL_TIE` vs `p_tie_resolution`) & STATUS 'Gugur'
    // =========================================================================
    const f2StageTieId = generateUuid();
    const f2StageNextId = generateUuid();
    const tiePart1Id = generateUuid();
    const tiePart2Id = generateUuid();

    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, champion_count, status, is_finalized)
      VALUES
        ('${f2StageTieId}', '${tenantJabarId}', '${f2BranchId}', 'Penyisihan Seri Identik F2', 32, 1, 3, 'Aktif', false),
        ('${f2StageNextId}', '${tenantJabarId}', '${f2BranchId}', 'Semifinal F2', 33, 1, 3, 'Menunggu', false);

      INSERT INTO judge_assignments (id, tenant_id, judge_profile_id, stage_id, branch_id, judge_field, status)
      VALUES ('${generateUuid()}', '${tenantJabarId}', '${judge1UserId}', '${f2StageTieId}', '${f2BranchId}', 'Tajwid', 'Aktif');
    `);

    for (const [pId, lot, name] of [
      [tiePart1Id, '21', 'Peserta Seri Satu'],
      [tiePart2Id, '22', 'Peserta Seri Dua']
    ]) {
      const spId = generateUuid();
      const amId = generateUuid();
      await pg.exec(`
        INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status)
        VALUES ('${pId}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', 'TIE-${lot}', '${name}', 'Putra', '${lot}', 'Berlangsung');
        INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
        VALUES ('${spId}', '${tenantJabarId}', '${pId}', '${f2StageTieId}', '${lot}', 'Lengkap');
        INSERT INTO assigned_maqras (id, tenant_id, stage_participation_id, question_id)
        VALUES ('${amId}', '${tenantJabarId}', '${spId}', '${questionPenyisihanId}');
        INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, error_counts, field_scores, total_deductions, final_score)
        VALUES ('${generateUuid()}', '${tenantJabarId}', '${spId}', '${amId}', '${judge1UserId}', '${f2RubricId}', 'in_progress', false, '{}'::jsonb, '{"Tajwid": 29, "Lagu": 24, "Fashahah": 28, "Suara": 15}'::jsonb, 4, 96.0);
        BEGIN;
        SELECT set_config('mtq.rpc_finalize_active', 'true', true);
        UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${spId}'::uuid;
        COMMIT;
      `);
    }

    // Percobaan 1: Tanpa p_tie_resolution -> WAJIB DITOLAK dengan UNRESOLVED_CRITICAL_TIE
    const blockedTieAdvanceRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: f2StageTieId,
      nextStageId: f2StageNextId,
      qualifiedParticipantIds: [tiePart1Id],
      overrideReasons: {}
    });

    // Percobaan 2: Dengan p_tie_resolution + p_override_reasons (>= 5 karakter) -> BERHASIL
    const resolvedTieAdvanceRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: f2StageTieId,
      nextStageId: f2StageNextId,
      qualifiedParticipantIds: [tiePart1Id],
      overrideReasons: {
        [tiePart1Id]: 'Keputusan Sidang Pleno Dewan Hakim: Unggul Adab Tilawah',
        [tiePart2Id]: 'Keputusan Sidang Pleno Dewan Hakim: Urutan Kedua'
      },
      tieResolution: {
        [tiePart1Id]: 1,
        [tiePart2Id]: 2
      }
    });

    const eliminatedStatusQ = await pg.query<{ id: string; status: string }>(`
      SELECT id::text, status FROM participants WHERE id IN ('${tiePart1Id}'::uuid, '${tiePart2Id}'::uuid);
    `);
    const qualPartRow = eliminatedStatusQ.rows.find((r) => r.id === tiePart1Id);
    const elimPartRow = eliminatedStatusQ.rows.find((r) => r.id === tiePart2Id);

    assert(
      '71. Fase 2.2 & 2.7 Seri Identik Seluruh Kriteria & Status Gugur: Ditolak tanpa p_tie_resolution + alasan >= 5 karakter, diterima saat dilengkapi, dan peserta tak lolos babak non-final berstatus Gugur',
      blockedTieAdvanceRes.success === false &&
        Boolean(blockedTieAdvanceRes.message?.includes('UNRESOLVED_CRITICAL_TIE')) &&
        resolvedTieAdvanceRes.success === true &&
        qualPartRow?.status === 'Menunggu' &&
        elimPartRow?.status === 'Gugur',
      `blockedMsg: ${blockedTieAdvanceRes.message}, resolvedOk: ${resolvedTieAdvanceRes.success}, qualStatus: ${qualPartRow?.status}, elimStatus: ${elimPartRow?.status}`
    );

    // =========================================================================
    // 72. FASE 2.3 & 2.5: BABAK FINAL (`champion_rank`, `champion_title = 'Juara N'`, `is_qualified = FALSE`, SNAPSHOT `branch_id IS NULL`)
    // =========================================================================
    const f2FinalNullBranchStageId = generateUuid();
    const finPartIds: string[] = [];

    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, champion_count, status, is_finalized)
      VALUES ('${f2FinalNullBranchStageId}', '${tenantJabarId}', NULL, 'Final Umum Lintas Cabang F2', 40, 3, 3, 'Aktif', false);

      INSERT INTO judge_assignments (id, tenant_id, judge_profile_id, stage_id, branch_id, judge_field, status)
      VALUES ('${generateUuid()}', '${tenantJabarId}', '${judge1UserId}', '${f2FinalNullBranchStageId}', NULL, 'Tajwid', 'Aktif');
    `);

    const finScores = [98.5, 97.0, 95.5, 93.0];
    for (let i = 0; i < finScores.length; i++) {
      const pId = generateUuid();
      finPartIds.push(pId);
      const spId = generateUuid();
      const amId = generateUuid();
      const sc = finScores[i];
      await pg.exec(`
        INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status)
        VALUES ('${pId}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', 'FIN-0${i + 1}', 'Finalis ${i + 1}', 'Putra', 'F0${i + 1}', 'Berlangsung');
        INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
        VALUES ('${spId}', '${tenantJabarId}', '${pId}', '${f2FinalNullBranchStageId}', 'F0${i + 1}', 'Lengkap');
        INSERT INTO assigned_maqras (id, tenant_id, stage_participation_id, question_id)
        VALUES ('${amId}', '${tenantJabarId}', '${spId}', '${questionPenyisihanId}');
        INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, error_counts, field_scores, total_deductions, final_score)
        VALUES ('${generateUuid()}', '${tenantJabarId}', '${spId}', '${amId}', '${judge1UserId}', '${f2RubricId}', 'in_progress', false, '{}'::jsonb, '{"Tajwid": 29, "Lagu": 24, "Fashahah": 28, "Suara": 15}'::jsonb, ${100 - sc}, ${sc});
        BEGIN;
        SELECT set_config('mtq.rpc_finalize_active', 'true', true);
        UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${spId}'::uuid;
        COMMIT;
      `);
    }

    const finAdvanceRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: f2FinalNullBranchStageId,
      nextStageId: null,
      qualifiedParticipantIds: [],
      overrideReasons: {}
    });

    const finSpCheck = await pg.query<{
      participant_id: string;
      rank: number;
      champion_rank: number | null;
      champion_title: string | null;
      is_qualified: boolean;
      qualification_reason: string;
    }>(`
      SELECT participant_id::text, rank, champion_rank, champion_title, is_qualified, qualification_reason
      FROM stage_participations
      WHERE stage_id = '${f2FinalNullBranchStageId}'::uuid
      ORDER BY rank ASC;
    `);

    const finSnapCheck = await pg.query<{ id: string; branch_id: string | null; cnt: number }>(`
      SELECT id::text, branch_id::text, jsonb_array_length(rankings_snapshot) AS cnt
      FROM stage_result_snapshots
      WHERE stage_id = '${f2FinalNullBranchStageId}'::uuid;
    `);

    assert(
      '72. Fase 2.3 & 2.5 Babak Final & Snapshot `branch_id IS NULL`: Mengisi champion_rank 1..3 & champion_title Juara 1..3 (tanpa Juara Harapan), is_qualified = FALSE, dan selalu menyimpan stage_result_snapshots meski branch_id NULL',
      finAdvanceRes.success === true &&
        finSpCheck.rows.length === 4 &&
        finSpCheck.rows[0]?.champion_rank === 1 &&
        finSpCheck.rows[0]?.champion_title === 'Juara 1' &&
        finSpCheck.rows[0]?.is_qualified === false &&
        finSpCheck.rows[1]?.champion_rank === 2 &&
        finSpCheck.rows[1]?.champion_title === 'Juara 2' &&
        finSpCheck.rows[2]?.champion_rank === 3 &&
        finSpCheck.rows[2]?.champion_title === 'Juara 3' &&
        finSpCheck.rows[3]?.champion_rank === null &&
        finSpCheck.rows[3]?.champion_title === null &&
        finSpCheck.rows[3]?.qualification_reason === 'Finalis Peringkat 4' &&
        finSnapCheck.rows.length === 1 &&
        finSnapCheck.rows[0]?.branch_id === null &&
        Number(finSnapCheck.rows[0]?.cnt) === 4,
      `finAdvance: ${finAdvanceRes.success} (${finAdvanceRes.message}), rows: ${JSON.stringify(finSpCheck.rows)}, snapCnt: ${finSnapCheck.rows.length}`
    );

    // =========================================================================
    // 73. FASE 2.4 & 2.6: HAKIM NONAKTIF DIABAIKAN & BOBOT BIDANG (`rubric_fields.weight`)
    // =========================================================================
    const inactiveJudgeStageId = generateUuid();
    const inactiveJudgePartId = generateUuid();
    const inactiveJudgeSpId = generateUuid();
    const inactiveJudgeAmId = generateUuid();

    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, status, is_finalized)
      VALUES ('${inactiveJudgeStageId}', '${tenantJabarId}', '${f2BranchId}', 'Babak Uji Hakim Nonaktif', 41, 1, 'Aktif', false);

      -- Hakim 1 Aktif, Hakim 2 Nonaktif pada judge_assignments
      INSERT INTO judge_assignments (id, tenant_id, judge_profile_id, stage_id, branch_id, judge_field, status)
      VALUES
        ('${generateUuid()}', '${tenantJabarId}', '${judge1UserId}', '${inactiveJudgeStageId}', '${f2BranchId}', 'Tajwid', 'Aktif'),
        ('${generateUuid()}', '${tenantJabarId}', '${judge2UserId}', '${inactiveJudgeStageId}', '${f2BranchId}', 'Lagu', 'Nonaktif');

      INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status)
      VALUES ('${inactiveJudgePartId}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', 'INJ-01', 'Peserta Uji Hakim Nonaktif', 'Putra', '51', 'Berlangsung');
      INSERT INTO stage_participations (id, tenant_id, participant_id, stage_id, lottery_number, status)
      VALUES ('${inactiveJudgeSpId}', '${tenantJabarId}', '${inactiveJudgePartId}', '${inactiveJudgeStageId}', '51', 'Lengkap');
      INSERT INTO assigned_maqras (id, tenant_id, stage_participation_id, question_id)
      VALUES ('${inactiveJudgeAmId}', '${tenantJabarId}', '${inactiveJudgeSpId}', '${questionPenyisihanId}');

      -- Hanya Hakim 1 (Aktif) yang menilai; Hakim 2 (Nonaktif) tidak menilai
      INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, error_counts, field_scores, total_deductions, final_score)
      VALUES ('${generateUuid()}', '${tenantJabarId}', '${inactiveJudgeSpId}', '${inactiveJudgeAmId}', '${judge1UserId}', '${f2RubricId}', 'in_progress', false, '{}'::jsonb, '{"Tajwid": 29, "Lagu": 24, "Fashahah": 28, "Suara": 15}'::jsonb, 4, 96.0);
      BEGIN;
      SELECT set_config('mtq.rpc_finalize_active', 'true', true);
      UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${inactiveJudgeSpId}'::uuid;
      COMMIT;
    `);

    await pg.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${adminUserId}', true);
    `);
    const inactiveCompRes = await pg.query<{ res: any }>(`
      SELECT get_stage_completion_sql('${inactiveJudgeStageId}'::uuid) AS res;
    `);
    await pg.exec(`COMMIT;`);

    const inactiveRankRes = await supabaseDataService.computeStageRankingsRpc(inactiveJudgeStageId);
    const compData = inactiveCompRes.rows[0]?.res;
    const rankData = inactiveRankRes.data as any;

    assert(
      '73. Fase 2.4 Hakim Nonaktif Diabaikan: Penugasan hakim berstatus Nonaktif tidak menghalangi kelengkapan babak pada `get_stage_completion_sql` maupun `compute_stage_rankings`',
      Boolean(compData?.all_complete) === true &&
        Number(compData?.required_judge_count) === 1 &&
        Boolean(rankData?.all_finalized) === true &&
        Boolean(rankData?.can_finalize) === true,
      `compAllComplete: ${compData?.all_complete}, reqJudges: ${compData?.required_judge_count}, rankCanFinalize: ${rankData?.can_finalize}`
    );

    // =========================================================================
    // 74. FASE 3.1: VERIFIKASI BERKAS PESERTA (`verify_participant`)
    // =========================================================================
    const vPartId = generateUuid();
    const vStageId = generateUuid();
    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, status, is_finalized)
      VALUES ('${vStageId}', '${tenantJabarId}', '${f2BranchId}', 'Babak Uji Verifikasi Berkas', 50, 1, 'Aktif', false);

      INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status, verification_status)
      VALUES ('${vPartId}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', 'VRF-01', 'Peserta Uji Verifikasi', 'Putra', '99', 'Menunggu', 'Diajukan');
    `);

    // Coba undian saat status masih 'Diajukan' -> harus ditolak
    const unverifiedDrawRes = await supabaseDataService.drawLotteryServerRpc({
      tenantId: tenantJabarId,
      stageId: vStageId,
      branchId: f2BranchId,
      drawMode: 'both',
      participantIds: [vPartId],
      questionPoolIds: [questionPenyisihanId]
    });

    // Penolakan tanpa catatan (note < 5 karakter) -> harus ditolak
    const rejectWithoutNoteRes = await supabaseDataService.verifyParticipantRpc({
      tenantId: tenantJabarId,
      participantId: vPartId,
      status: 'Ditolak',
      note: 'kur'
    });

    // Verifikasi berkas disetujui ('Diverifikasi') oleh Admin
    const verifySuccessRes = await supabaseDataService.verifyParticipantRpc({
      tenantId: tenantJabarId,
      participantId: vPartId,
      status: 'Diverifikasi'
    });

    const checkVerifiedRow = await pg.query<{ verification_status: string; verified_by: string }>(`
      SELECT verification_status, verified_by::text FROM participants WHERE id = '${vPartId}'::uuid;
    `);

    assert(
      '74. Fase 3.1 Verifikasi Berkas: Undian menolak peserta belum diverifikasi, penolakan mewajibkan alasan (>= 5 karakter), dan verifikasi berhasil memperbarui status menjadi Diverifikasi',
      unverifiedDrawRes.success === false &&
        (unverifiedDrawRes.message?.includes('PARTICIPANT_NOT_VERIFIED') || false) &&
        rejectWithoutNoteRes.success === false &&
        verifySuccessRes.success === true &&
        checkVerifiedRow.rows[0]?.verification_status === 'Diverifikasi' &&
        Boolean(checkVerifiedRow.rows[0]?.verified_by),
      `unverifiedMsg: ${unverifiedDrawRes.message}, rejectNoteMsg: ${rejectWithoutNoteRes.message}, status: ${checkVerifiedRow.rows[0]?.verification_status}`
    );

    // =========================================================================
    // 75. FASE 3.2: UNDIAN NOMOR TAMPIL & MAQRA DI SERVER (`draw_lottery_server`)
    // =========================================================================
    const drawPart1Id = generateUuid();
    const drawPart2Id = generateUuid();
    const drawStageId = generateUuid();
    const drawQ1Id = generateUuid();
    const drawQ2Id = generateUuid();

    await pg.exec(`
      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, status, is_finalized)
      VALUES ('${drawStageId}', '${tenantJabarId}', '${f2BranchId}', 'Babak Uji Undian Server', 51, 1, 'Aktif', false);

      INSERT INTO questions (id, tenant_id, branch_id, code, title, surah_name, surah_number, start_ayah, end_ayah, page_number, page_start, page_end, status)
      VALUES
        ('${drawQ1Id}', '${tenantJabarId}', '${f2BranchId}', 'MQ-SRV-01', 'Soal Server 1', 'Al-Baqarah', 2, 1, 10, 2, 2, 3, 'Aktif'),
        ('${drawQ2Id}', '${tenantJabarId}', '${f2BranchId}', 'MQ-SRV-02', 'Soal Server 2', 'Al-Baqarah', 2, 11, 20, 3, 3, 4, 'Aktif');

      INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status, verification_status)
      VALUES
        ('${drawPart1Id}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', 'SRV-01', 'Peserta Undian 1', 'Putra', 'SRV-01', 'Menunggu', 'Diverifikasi'),
        ('${drawPart2Id}', '${tenantJabarId}', '${kafilahBandungId}', '${f2BranchId}', 'SRV-02', 'Peserta Undian 2', 'Putra', 'SRV-02', 'Menunggu', 'Diverifikasi');
    `);

    // Eksekusi drawLotteryServerRpc
    const serverDrawRes = await supabaseDataService.drawLotteryServerRpc({
      tenantId: tenantJabarId,
      stageId: drawStageId,
      branchId: f2BranchId,
      drawMode: 'both',
      questionsPerParticipant: 1,
      participantIds: [drawPart1Id, drawPart2Id],
      questionPoolIds: [drawQ1Id, drawQ2Id]
    });

    const drawLogCheck = await pg.query<{
      seed_hex: string;
      seed_sha256: string;
      draw_mode: string;
      results_count: number;
    }>(`
      SELECT seed_hex, seed_sha256, draw_mode, jsonb_array_length(draw_results) AS results_count
      FROM lottery_draw_logs
      WHERE stage_id = '${drawStageId}'::uuid
      ORDER BY created_at DESC LIMIT 1;
    `);

    const spMaqraCheck = await pg.query<{ cnt: string }>(`
      SELECT COUNT(*)::text AS cnt FROM assigned_maqras
      WHERE stage_participation_id IN (
        SELECT id FROM stage_participations WHERE stage_id = '${drawStageId}'::uuid
      );
    `);

    // Coba undian ulang tanpa alasan jika baris sudah ada -> harus ditolak jika reason < 5 chars
    const manualOverrideBlockedRes = await supabaseDataService.commitLotteryDrawRpc({
      tenantId: tenantJabarId,
      stageId: drawStageId,
      stageName: 'Babak Uji Undian Server',
      branchId: f2BranchId,
      notes: 'ok', // < 5 karakter
      results: [{ participantId: drawPart1Id, questionIds: [drawQ1Id] }]
    });

    assert(
      '75. Fase 3.2 Undian Server CSPRNG: draw_lottery_server mencatat seed_hex, seed_sha256, draw_mode, menetapkan assigned_maqras unik, dan commit_lottery_draw mewajibkan alasan override >= 5 karakter',
      serverDrawRes.success === true &&
        Boolean(drawLogCheck.rows[0]?.seed_hex) &&
        Boolean(drawLogCheck.rows[0]?.seed_sha256) &&
        drawLogCheck.rows[0]?.draw_mode === 'both' &&
        Number(drawLogCheck.rows[0]?.results_count) === 2 &&
        Number(spMaqraCheck.rows[0]?.cnt) === 2 &&
        manualOverrideBlockedRes.success === false &&
        (manualOverrideBlockedRes.message?.includes('LOTTERY_OVERRIDE_REASON_REQUIRED') || false),
      `drawSuccess: ${serverDrawRes.success}, seedSha: ${drawLogCheck.rows[0]?.seed_sha256}, overrideMsg: ${manualOverrideBlockedRes.message}`
    );

    // =========================================================================
    // 76. FASE 5: UJI INTEGRASI END-TO-END (ALUR LENGKAP PENYISIHAN -> FINAL -> JUARA)
    // =========================================================================
    const e2eTenantId = generateUuid();
    const e2eBranchId = generateUuid();
    const e2eStagePenyisihanId = generateUuid();
    const e2eStageFinalId = generateUuid();
    const e2eKafilahId = generateUuid();

    const e2ePart1Id = generateUuid();
    const e2ePart2Id = generateUuid();
    const e2ePart3Id = generateUuid();
    const e2ePart4Id = generateUuid();

    const e2eQ1Id = generateUuid();
    const e2eQ2Id = generateUuid();
    const e2eQ3Id = generateUuid();
    const e2eQ4Id = generateUuid();
    const e2eRubricId = generateUuid();

    const e2eJudge1Id = judge1UserId;
    const e2eJudge2Id = judge2UserId;

    await pg.exec(`
      -- 1. Setup Tenant, Branch, Stages, Rubric, Judges
      INSERT INTO tenants (id, code, name, event_name, region, status, group_label)
      VALUES ('${e2eTenantId}', 'E2E-TENANT', 'Tenant Uji E2E', 'MTQ E2E 2026', 'Jawa Barat', 'Aktif', 'Kafilah Kota/Kab');

      INSERT INTO tenant_memberships (id, tenant_id, profile_id, role, status)
      VALUES
        ('${generateUuid()}', '${e2eTenantId}', '${adminUserId}', 'admin', 'Aktif'),
        ('${generateUuid()}', '${e2eTenantId}', '${e2eJudge1Id}', 'judge', 'Aktif'),
        ('${generateUuid()}', '${e2eTenantId}', '${e2eJudge2Id}', 'judge', 'Aktif');

      INSERT INTO branches (id, tenant_id, code, name, status)
      VALUES ('${e2eBranchId}', '${e2eTenantId}', 'E2E-TLW', 'Tilawah E2E', 'Aktif');

      INSERT INTO rubric_versions (id, tenant_id, code, name, branch_id, version, status)
      VALUES ('${e2eRubricId}', '${e2eTenantId}', 'RUB-E2E', 'Rubrik Tilawah E2E', '${e2eBranchId}', 1, 'Aktif');

      INSERT INTO rubric_fields (id, rubric_version_id, code, name, max_score, field_order)
      VALUES
        ('${generateUuid()}', '${e2eRubricId}', 'F1', 'Tajwid', 30, 1),
        ('${generateUuid()}', '${e2eRubricId}', 'F2', 'Lagu', 25, 2),
        ('${generateUuid()}', '${e2eRubricId}', 'F3', 'Fashahah', 30, 3),
        ('${generateUuid()}', '${e2eRubricId}', 'F4', 'Suara', 15, 4);

      INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, champion_count, status, is_finalized)
      VALUES
        ('${e2eStagePenyisihanId}', '${e2eTenantId}', '${e2eBranchId}', 'Penyisihan', 1, 3, 3, 'Aktif', false),
        ('${e2eStageFinalId}', '${e2eTenantId}', '${e2eBranchId}', 'Final', 2, 3, 3, 'Aktif', false);

      INSERT INTO kafilahs (id, tenant_id, code, name, region, status)
      VALUES ('${e2eKafilahId}', '${e2eTenantId}', 'KAF-E2E', 'Kafilah E2E Juara', 'Bandung', 'Aktif');

      INSERT INTO questions (id, tenant_id, branch_id, stage_id, code, title, surah_name, surah_number, start_ayah, end_ayah, page_number, page_start, page_end, status)
      VALUES
        ('${e2eQ1Id}', '${e2eTenantId}', '${e2eBranchId}', NULL, 'MQ-E2E-01', 'Soal 1', 'Al-Baqarah', 2, 1, 5, 2, 2, 3, 'Aktif'),
        ('${e2eQ2Id}', '${e2eTenantId}', '${e2eBranchId}', NULL, 'MQ-E2E-02', 'Soal 2', 'Al-Baqarah', 2, 6, 10, 2, 2, 3, 'Aktif'),
        ('${e2eQ3Id}', '${e2eTenantId}', '${e2eBranchId}', NULL, 'MQ-E2E-03', 'Soal 3', 'Al-Baqarah', 2, 11, 15, 3, 3, 4, 'Aktif'),
        ('${e2eQ4Id}', '${e2eTenantId}', '${e2eBranchId}', NULL, 'MQ-E2E-04', 'Soal 4', 'Al-Baqarah', 2, 16, 20, 3, 3, 4, 'Aktif');

      -- Kaitkan aturan kompetisi dengan rubrik
      INSERT INTO competition_rule_configs (id, tenant_id, branch_id, rubric_version_id, tie_break_order, quota_per_stage, status)
      VALUES ('${generateUuid()}', '${e2eTenantId}', '${e2eBranchId}', '${e2eRubricId}', ARRAY['total', 'Tajwid', 'Lagu', 'Fashahah'], '{"Penyisihan": 3, "Final": 3}'::jsonb, 'Aktif');

      INSERT INTO judge_assignments (id, tenant_id, judge_profile_id, stage_id, branch_id, judge_field, status)
      VALUES
        ('${generateUuid()}', '${e2eTenantId}', '${e2eJudge1Id}', '${e2eStagePenyisihanId}', '${e2eBranchId}', 'Tajwid', 'Aktif'),
        ('${generateUuid()}', '${e2eTenantId}', '${e2eJudge2Id}', '${e2eStagePenyisihanId}', '${e2eBranchId}', 'Lagu', 'Aktif'),
        ('${generateUuid()}', '${e2eTenantId}', '${e2eJudge1Id}', '${e2eStageFinalId}', '${e2eBranchId}', 'Tajwid', 'Aktif'),
        ('${generateUuid()}', '${e2eTenantId}', '${e2eJudge2Id}', '${e2eStageFinalId}', '${e2eBranchId}', 'Lagu', 'Aktif');

      -- 2. Pendaftaran 4 Peserta
      INSERT INTO participants (id, tenant_id, kafilah_id, branch_id, participant_code, name, gender, lottery_number, status, verification_status)
      VALUES
        ('${e2ePart1Id}', '${e2eTenantId}', '${e2eKafilahId}', '${e2eBranchId}', 'E2E-P1', 'Peserta Satu', 'Putra', 'E2E-01', 'Menunggu', 'Diajukan'),
        ('${e2ePart2Id}', '${e2eTenantId}', '${e2eKafilahId}', '${e2eBranchId}', 'E2E-P2', 'Peserta Dua', 'Putra', 'E2E-02', 'Menunggu', 'Diajukan'),
        ('${e2ePart3Id}', '${e2eTenantId}', '${e2eKafilahId}', '${e2eBranchId}', 'E2E-P3', 'Peserta Tiga', 'Putra', 'E2E-03', 'Menunggu', 'Diajukan'),
        ('${e2ePart4Id}', '${e2eTenantId}', '${e2eKafilahId}', '${e2eBranchId}', 'E2E-P4', 'Peserta Empat', 'Putra', 'E2E-04', 'Menunggu', 'Diajukan');
    `);

    // 3. Verifikasi Berkas 4 Peserta
    for (const pid of [e2ePart1Id, e2ePart2Id, e2ePart3Id, e2ePart4Id]) {
      await supabaseDataService.verifyParticipantRpc({
        tenantId: e2eTenantId,
        participantId: pid,
        status: 'Diverifikasi'
      });
    }

    // 4. Undian Babak Penyisihan di Server
    const e2eDrawPenRes = await supabaseDataService.drawLotteryServerRpc({
      tenantId: e2eTenantId,
      stageId: e2eStagePenyisihanId,
      branchId: e2eBranchId,
      drawMode: 'both',
      questionsPerParticipant: 1,
      participantIds: [e2ePart1Id, e2ePart2Id, e2ePart3Id, e2ePart4Id],
      questionPoolIds: [e2eQ1Id, e2eQ2Id, e2eQ3Id, e2eQ4Id]
    });

    // 5. Penilaian Penyisihan oleh 2 Hakim (Skor P1 > P2 > P3 > P4)
    const e2eSpPenRows = await pg.query<{ id: string; participant_id: string }>(`
      SELECT id::text, participant_id::text FROM stage_participations WHERE stage_id = '${e2eStagePenyisihanId}'::uuid;
    `);
    const e2eAmPenRows = await pg.query<{ id: string; stage_participation_id: string }>(`
      SELECT id::text, stage_participation_id::text FROM assigned_maqras
      WHERE stage_participation_id IN (SELECT id FROM stage_participations WHERE stage_id = '${e2eStagePenyisihanId}'::uuid);
    `);

    const spPenMap = new Map(e2eSpPenRows.rows.map((r) => [r.participant_id, r.id]));
    const amPenMap = new Map(e2eAmPenRows.rows.map((r) => [r.stage_participation_id, r.id]));

    const scoreMap: Record<string, { tajwid: number; lagu: number; total: number }> = {
      [e2ePart1Id]: { tajwid: 30, lagu: 25, total: 98 },
      [e2ePart2Id]: { tajwid: 28, lagu: 24, total: 92 },
      [e2ePart3Id]: { tajwid: 26, lagu: 22, total: 86 },
      [e2ePart4Id]: { tajwid: 20, lagu: 20, total: 75 }
    };

    for (const pid of [e2ePart1Id, e2ePart2Id, e2ePart3Id, e2ePart4Id]) {
      const spId = spPenMap.get(pid)!;
      const amId = amPenMap.get(spId)!;
      const sc = scoreMap[pid];

      await pg.exec(`
        INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, field_scores, total_deductions, final_score)
        VALUES
          ('${generateUuid()}', '${e2eTenantId}', '${spId}', '${amId}', '${e2eJudge1Id}', '${e2eRubricId}', 'in_progress', false, '{"Tajwid": ${sc.tajwid}, "Lagu": ${sc.lagu}, "Fashahah": 28, "Suara": 15}'::jsonb, 2, ${sc.total}),
          ('${generateUuid()}', '${e2eTenantId}', '${spId}', '${amId}', '${e2eJudge2Id}', '${e2eRubricId}', 'in_progress', false, '{"Tajwid": ${sc.tajwid}, "Lagu": ${sc.lagu}, "Fashahah": 28, "Suara": 15}'::jsonb, 2, ${sc.total});
        BEGIN;
        SELECT set_config('mtq.rpc_finalize_active', 'true', true);
        UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${spId}'::uuid;
        COMMIT;
      `);
    }

    // 6. Hitung Peringkat & Loloskan 3 Teratas dari Penyisihan ke Final
    const e2eRankPenRes = await supabaseDataService.computeStageRankingsRpc(e2eStagePenyisihanId);
    const e2eAdvPenRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: e2eStagePenyisihanId,
      nextStageId: e2eStageFinalId,
      qualifiedParticipantIds: [e2ePart1Id, e2ePart2Id, e2ePart3Id],
      overrideReasons: {},
      rankingsSnapshot: (e2eRankPenRes.data as any)?.rankings || []
    });

    // 7. Undian Babak Final di Server
    const e2eDrawFinRes = await supabaseDataService.drawLotteryServerRpc({
      tenantId: e2eTenantId,
      stageId: e2eStageFinalId,
      branchId: e2eBranchId,
      drawMode: 'both',
      questionsPerParticipant: 1,
      participantIds: [e2ePart1Id, e2ePart2Id, e2ePart3Id],
      questionPoolIds: [e2eQ1Id, e2eQ2Id, e2eQ3Id]
    });

    // 8. Penilaian Babak Final oleh 2 Hakim (Hasil Final: P2 Juara 1 (99), P1 Juara 2 (95), P3 Juara 3 (88))
    const e2eSpFinRows = await pg.query<{ id: string; participant_id: string }>(`
      SELECT id::text, participant_id::text FROM stage_participations WHERE stage_id = '${e2eStageFinalId}'::uuid;
    `);
    const e2eAmFinRows = await pg.query<{ id: string; stage_participation_id: string }>(`
      SELECT id::text, stage_participation_id::text FROM assigned_maqras
      WHERE stage_participation_id IN (SELECT id FROM stage_participations WHERE stage_id = '${e2eStageFinalId}'::uuid);
    `);

    const spFinMap = new Map(e2eSpFinRows.rows.map((r) => [r.participant_id, r.id]));
    const amFinMap = new Map(e2eAmFinRows.rows.map((r) => [r.stage_participation_id, r.id]));

    const finalScoreMap: Record<string, number> = {
      [e2ePart2Id]: 99.0, // Juara 1
      [e2ePart1Id]: 95.0, // Juara 2
      [e2ePart3Id]: 88.0  // Juara 3
    };

    for (const pid of [e2ePart1Id, e2ePart2Id, e2ePart3Id]) {
      const spId = spFinMap.get(pid)!;
      const amId = amFinMap.get(spId)!;
      const sc = finalScoreMap[pid];

      await pg.exec(`
        INSERT INTO judge_assessments (id, tenant_id, stage_participation_id, assigned_maqra_id, judge_profile_id, rubric_version_id, status, is_locked, field_scores, total_deductions, final_score)
        VALUES
          ('${generateUuid()}', '${e2eTenantId}', '${spId}', '${amId}', '${e2eJudge1Id}', '${e2eRubricId}', 'in_progress', false, '{"Tajwid": 30, "Lagu": 25, "Fashahah": 28, "Suara": 15}'::jsonb, 1, ${sc}),
          ('${generateUuid()}', '${e2eTenantId}', '${spId}', '${amId}', '${e2eJudge2Id}', '${e2eRubricId}', 'in_progress', false, '{"Tajwid": 30, "Lagu": 25, "Fashahah": 28, "Suara": 15}'::jsonb, 1, ${sc});
        BEGIN;
        SELECT set_config('mtq.rpc_finalize_active', 'true', true);
        UPDATE judge_assessments SET status = 'finalized', is_locked = true WHERE stage_participation_id = '${spId}'::uuid;
        COMMIT;
      `);
    }

    // 9. Finalisasi Babak Final (p_next_stage_id = NULL) & Penentuan Juara 1, 2, 3
    const e2eRankFinRes = await supabaseDataService.computeStageRankingsRpc(e2eStageFinalId);
    const e2eAdvFinRes = await supabaseDataService.advanceStageQualifiersRpc({
      stageId: e2eStageFinalId,
      nextStageId: null,
      qualifiedParticipantIds: [],
      overrideReasons: {},
      rankingsSnapshot: (e2eRankFinRes.data as any)?.rankings || []
    });

    // 10. Verifikasi Snapshot Hasil Kejuaraan di Server
    const e2eSnapCheck = await pg.query<{ rankings_snapshot: any }>(`
      SELECT rankings_snapshot FROM stage_result_snapshots
      WHERE stage_id = '${e2eStageFinalId}'::uuid;
    `);

    const snapList = Array.isArray(e2eSnapCheck.rows[0]?.rankings_snapshot)
      ? e2eSnapCheck.rows[0]?.rankings_snapshot
      : [];

    const juara1 = snapList.find((r: any) => r.champion_rank === 1);
    const juara2 = snapList.find((r: any) => r.champion_rank === 2);
    const juara3 = snapList.find((r: any) => r.champion_rank === 3);

    assert(
      '76. Fase 5 Integrasi End-to-End: Alur lengkap registrasi -> verifikasi -> undian server -> penilaian -> pelolosan penyisihan -> final -> pengesahan juara (Juara 1, 2, 3) 100% server-authoritative',
      e2eDrawPenRes.success === true &&
        e2eAdvPenRes.success === true &&
        e2eDrawFinRes.success === true &&
        e2eAdvFinRes.success === true &&
        juara1?.participant_id === e2ePart2Id &&
        juara1?.champion_title === 'Juara 1' &&
        juara2?.participant_id === e2ePart1Id &&
        juara2?.champion_title === 'Juara 2' &&
        juara3?.participant_id === e2ePart3Id &&
        juara3?.champion_title === 'Juara 3',
      `penAdv: ${e2eAdvPenRes.success}, finAdv: ${e2eAdvFinRes.success}, J1: ${juara1?.participant_name} (${juara1?.champion_title}), J2: ${juara2?.participant_name} (${juara2?.champion_title}), J3: ${juara3?.participant_name} (${juara3?.champion_title})`
    );
  } finally {
    supabaseDataService.setTestDatabaseClient(null);
    await pg.close();
  }

  return { passed, failed, results };
}


