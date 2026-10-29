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
import { DEFAULT_COMPETITION_RULES, INITIAL_RUBRIC_VERSIONS } from '../services/competitionRules';
import { isValidUuid, generateUuid, toDeterministicUuid } from '../utils/uuid';

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
              ${formatSqlVal(args.p_rankings_snapshot || [])}::jsonb
            ) AS res;`;
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
        errorCounts: { MKH: 1, IDG: 1 },
        deductions: { MKH: 1.0, IDG: 0.5 },
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

    // Verify Final stage participation was created by the RPC in PostgreSQL
    const finalSpQuery = await pg.query<{ id: string }>(`
      SELECT id FROM stage_participations
      WHERE stage_id = '${stageFinalId}' AND participant_id = '${participantUuid}';
    `);
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
  } finally {
    supabaseDataService.setTestDatabaseClient(null);
    await pg.close();
  }

  return { passed, failed, results };
}
