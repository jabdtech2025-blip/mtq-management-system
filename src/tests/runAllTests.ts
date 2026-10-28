import { runDomainTests } from './domainRules.test';
import { runSupabaseTests } from './supabaseRules.test';

async function main() {
  console.log('===========================================================');
  console.log('   MTQ MANAGEMENT SYSTEM — DOMAIN & SUPABASE INTEGRATION   ');
  console.log('   Standar: Pedoman Musabaqah 2025 & Juknis Nasional 2026  ');
  console.log('===========================================================\n');

  const startTime = Date.now();
  const domainRes = runDomainTests();
  const supabaseRes = await runSupabaseTests();
  const duration = Date.now() - startTime;

  const allResults = [...domainRes.results, ...supabaseRes.results];
  const totalPassed = domainRes.passed + supabaseRes.passed;
  const totalFailed = domainRes.failed + supabaseRes.failed;

  allResults.forEach((res) => {
    if (res.success) {
      console.log(`[PASS] ${res.name}`);
    } else {
      console.error(`[FAIL] ${res.name}: ${res.details}`);
    }
  });

  console.log('\n-----------------------------------------------------------');
  console.log(`Total Pengujian : ${allResults.length}`);
  console.log(`Lulus (Passed)  : ${totalPassed}`);
  console.log(`Gagal (Failed)  : ${totalFailed}`);
  console.log(`Durasi Eksekusi : ${duration}ms`);
  console.log('-----------------------------------------------------------');

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    console.log('SEMUA PENGUJIAN DOMAIN, ATURAN BISNIS, DAN DATABASE BERHASIL 100%!\n');
    process.exit(0);
  }
}

void main();
