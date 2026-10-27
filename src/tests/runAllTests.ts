import { runDomainTests } from './domainRules.test';

console.log('===========================================================');
console.log('   MTQ MANAGEMENT SYSTEM — DOMAIN & BUSINESS RULE TESTS    ');
console.log('   Standar: Pedoman Musabaqah 2025 & Juknis Nasional 2026  ');
console.log('===========================================================\n');

const startTime = Date.now();
const { passed, failed, results } = runDomainTests();
const duration = Date.now() - startTime;

results.forEach((res, index) => {
  if (res.success) {
    console.log(`[PASS] ${res.name}`);
  } else {
    console.error(`[FAIL] ${res.name}: ${res.details}`);
  }
});

console.log('\n-----------------------------------------------------------');
console.log(`Total Pengujian : ${results.length}`);
console.log(`Lulus (Passed)  : ${passed}`);
console.log(`Gagal (Failed)  : ${failed}`);
console.log(`Durasi Eksekusi : ${duration}ms`);
console.log('-----------------------------------------------------------');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('SEMUA PENGUJIAN DOMAIN DAN ATURAN BISNIS MTQ BERHASIL 100%!\n');
  process.exit(0);
}
