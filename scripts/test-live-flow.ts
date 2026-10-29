import { createClient } from '@supabase/supabase-js';
import { supabaseDataService } from '../src/services/supabaseDataService';
import { evaluateWorkspaceAccessGate } from '../src/lib/supabaseClient';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ybqejffsyoshdwqycwkh.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const USERS = [
  { label: 'Super Admin', email: 'jabdtech2025@gmail.com', pass: 'password123' },
  { label: 'Admin MTQ', email: 'jabdrise@gmail.com', pass: 'password123' },
  { label: 'Hakim', email: 'assuddy005@gmail.com', pass: 'password123' },
];

async function testUserFlow(u: typeof USERS[0]) {
  console.log(`\n==================================================`);
  console.log(`TESTING USER: ${u.label} (${u.email})`);
  console.log(`==================================================`);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: u.email,
    password: u.pass
  });

  if (authErr) {
    console.error(`❌ Authentication failed:`, authErr.message);
    return;
  }

  console.log(`✅ Supabase Auth Login Succeeded. Auth UID: ${authData.user?.id}`);

  // Test with supabaseDataService using this client
  supabaseDataService.setTestDatabaseClient(client);

  const connInfo = await supabaseDataService.verifyDatabaseConnection();
  console.log(`ℹ️ Connection status: state=${connInfo.state}, isReady=${connInfo.isDatabaseReady}`);

  const profile = await supabaseDataService.fetchAuthenticatedUserProfile();
  console.log(`ℹ️ Profile details:`, {
    authUserId: profile?.authUserId,
    name: profile?.name,
    username: profile?.username,
    role: profile?.globalRole,
    hasProfileRow: profile?.hasProfileRow,
    membershipsCount: profile?.memberships?.length,
    memberships: profile?.memberships
  });

  const gateResult = evaluateWorkspaceAccessGate({
    isOfflineDemoSimulation: false,
    connectionInfo: connInfo,
    authenticatedProfile: profile,
    dataSourceMode: 'supabase_live'
  });
  console.log(`🚪 Access Gate Evaluation: isAuthorized=${gateResult.isAuthorized}, reason=${gateResult.reason}`);

  if (!gateResult.isAuthorized) {
    console.warn(`⚠️ Access gate rejected user: ${gateResult.reason}`);
  }

  // Determine target tenant
  const targetTenantId = profile?.memberships?.[0]?.tenantId || '11111111-1111-4111-8111-111111111101';
  console.log(`\n🔄 Hydrating workspace for tenant: ${targetTenantId}...`);
  const hydration = await supabaseDataService.fetchTenantWorkspaceResult(targetTenantId);
  console.log(`ℹ️ Hydration result: success=${hydration.success}, failedQueries=${hydration.failedQueries?.join(', ') || 'none'}`);

  if (hydration.payload) {
    console.log(`📊 Hydrated Data Summary:`);
    console.log(`   - Tenants: ${hydration.payload.tenants.length}`);
    console.log(`   - Users/Profiles: ${hydration.payload.users.length}`);
    console.log(`   - Categories (Cabang): ${hydration.payload.cabangList.length}`);
    console.log(`   - Stages: ${hydration.payload.stages.length}`);
    console.log(`   - Participants: ${hydration.payload.participants.length}`);
    console.log(`   - Stage Participations: ${hydration.payload.stageParticipations.length}`);
    console.log(`   - Questions/Maqra: ${hydration.payload.questions.length}`);
    console.log(`   - Rubrics: ${hydration.payload.rubricVersions.length}`);
    console.log(`   - Assessments: ${hydration.payload.assessments.length}`);
    console.log(`   - Judge Assignments: ${hydration.payload.judgeAssignments.length}`);
  }

  // Live operation tests depending on role
  if (u.label === 'Admin MTQ') {
    console.log(`\n🧪 Testing Admin MTQ CRUD & DB Operations in Live Mode...`);
    // Test inserting a test participant
    const testPartCode = `TEST-${Date.now().toString().slice(-4)}`;
    console.log(`Attempting to add live participant with code ${testPartCode}...`);
    
    // Check available kafilah
    const kafilahId = hydration.payload?.kafilahs?.[0]?.id || '99999999-9999-4999-8999-999999999901';
    const branchId = hydration.payload?.cabangList?.[0]?.id || '55555555-5555-4555-8555-555555555501';

    const insertRes = await client.from('participants').insert({
      tenant_id: targetTenantId,
      participant_code: testPartCode,
      lottery_number: '99',
      name: `Peserta Uji Live ${testPartCode}`,
      gender: 'Putra',
      kafilah_id: kafilahId,
      branch_id: branchId,
      status: 'Menunggu'
    }).select().single();

    if (insertRes.error) {
      console.error(`❌ Insert participant failed:`, insertRes.error.message);
    } else {
      console.log(`✅ Insert participant SUCCESS! ID: ${insertRes.data.id}`);
      
      // Clean up after test
      const delRes = await client.from('participants').delete().eq('id', insertRes.data.id);
      if (delRes.error) {
        console.warn(`⚠️ Delete cleanup error:`, delRes.error.message);
      } else {
        console.log(`✅ Cleanup participant SUCCESS (deleted test record).`);
      }
    }
  }

  if (u.label === 'Hakim') {
    console.log(`\n🧪 Testing Hakim Assessment Access in Live Mode...`);
    // Check if hakim can see his assigned assessment
    const { data: myAssessments, error: myErr } = await client
      .from('judge_assessments')
      .select('id, status, final_score, stage_participation_id')
      .eq('judge_profile_id', profile?.authUserId);

    if (myErr) {
      console.error(`❌ Query judge assessments error:`, myErr.message);
    } else {
      console.log(`✅ Hakim assessments found: count=${myAssessments?.length}`);
      myAssessments?.forEach(a => {
        console.log(`   - Assessment ID: ${a.id}, Status: ${a.status}, Score: ${a.final_score}`);
      });
    }

    // Security test: Attempt unauthorized direct update of finalized status (should be rejected by RLS/Trigger)
    if (myAssessments && myAssessments.length > 0) {
      const targetAssess = myAssessments[0];
      console.log(`🔒 Security check: verifying direct update protection on assessment ${targetAssess.id}...`);
      const { error: directUpdateErr } = await client
        .from('judge_assessments')
        .update({ final_score: 99.99 })
        .eq('id', targetAssess.id);

      if (directUpdateErr) {
        console.log(`🛡️ Direct update correctly BLOCKED by database policy: ${directUpdateErr.message}`);
      } else {
        console.log(`ℹ️ Update response: (check if assessment was locked)`);
      }
    }
  }
}

async function main() {
  for (const u of USERS) {
    await testUserFlow(u);
  }
  supabaseDataService.setTestDatabaseClient(null);
}

main().catch(console.error);
