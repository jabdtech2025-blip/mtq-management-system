# PETA KODE — Manajemen MTQ

> **Untuk AI (AI Studio / asisten kode):** baca bagian 1, 2, 9, dan 10 sebelum mengubah apa pun.
> Gunakan peta ini untuk menemukan **file dan fungsi yang tepat**, lalu ubah **hanya bagian itu**.
> Nama fungsi lebih tepat daripada nomor baris (nomor baris berubah). Cari dengan nama fungsinya.
>
> Kondisi kode: `main` aa30bc8 + paket Peringatan Pengesahan, Nilai Juara Gabungan, dan Live Scoring (migrasi s.d. 20261127).

---

## 1. Gambaran singkat

Aplikasi e-penilaian dan manajemen lomba MTQ (Musabaqah Tilawatil Qur'an), **multi-penyelenggara (multi-tenant)**.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS 4, PWA (vite-plugin-pwa). Ikon: `lucide-react`.
- **Backend:** Supabase (Postgres + RLS + RPC SECURITY DEFINER + Realtime + Auth). Satu Edge Function: `supabase/functions/admin-provision-user` (membuat akun pengguna).
- **Peran:** `superadmin` (pengelola platform), `admin` (penyelenggara), `judge` (dewan hakim).
- **Dua mode data:**
  - **Live**: data di Supabase, semua aturan penting ditegakkan server.
  - **Mode Demo** (`isOfflineDemoSimulation`): data contoh di `localStorage` browser (`src/data/mockData.ts`), tanpa database.
- **Sumber kebenaran = server.** Perhitungan di browser (peringkat, kelengkapan) hanya tampilan/perkiraan; pengesahan, kunci lembar, snapshot hasil, dan audit dikerjakan RPC di database.

### Struktur folder

```
src/
  main.tsx                  Titik masuk: memilih Landing / Halaman publik / Live / Aplikasi
  App.tsx                   Kerangka aplikasi (Sidebar, TopHeader) + switch halaman per currentView
  context/MtqContext.tsx    STATE GLOBAL + hampir semua aksi bisnis (file terbesar, ±8.700 baris)
  services/                 Logika bisnis murni & akses database
  components/<modul>/       Halaman (View) per modul
  components/ui/            Komponen dasar (Button, Card, Modal, Select, Badge, ConfirmDialog, ...)
  live/                     Halaman publik Live Scoring (dimuat terpisah, ringan)
  landing/, public/         Landing page & halaman publik (Panduan, Privasi, Ketentuan, CMS)
  content/                  Teks bawaan landing, halaman publik, SEO, rute publik
  utils/                    Fungsi bantu kecil yang bisa dites
  types/mtq.ts              Semua tipe data utama
  lib/supabaseClient.ts     Klien Supabase & status koneksi
  tests/                    Tes unit + tes database (PGlite)
supabase/
  migrations/               Migrasi SQL berurutan (sumber definisi database)
  schema.sql                Skema lengkap konsolidasi (±15.800 baris; jangan diedit AI)
  seed.sql                  Data awal
tests/e2e/                  Tes Playwright
```

---

## 2. Routing

### 2a. Pemilihan halaman tingkat atas — `src/main.tsx`

Urutan pengecekan `window.location.pathname`:

| Path | Yang dimuat | File |
|---|---|---|
| `/live/<KODE>` | Layar publik Live Scoring (tanpa login) | `src/live/LiveScoringPage.tsx` |
| `/panduan`, `/panduan/...`, `/privasi`, `/ketentuan`, `/halaman/<slug>` | Halaman publik | `src/public/PublicPage.tsx` (rute: `src/content/publicRoutes.ts`) |
| `/` (tanpa token auth di URL) | Landing page | `src/landing/LandingPage.tsx` |
| selain itu (`/app`, `/dashboard`, ...) | Aplikasi | `src/App.tsx` |

Semua dimuat dengan `React.lazy` agar bundel kecil. Tautan email Supabase (undangan / reset sandi) yang mendarat di `/` diarahkan ke aplikasi (`isLandingRoute`).

### 2b. Halaman di dalam aplikasi

Aplikasi **tidak memakai react-router**. Halaman aktif = state `currentView` (`ViewType`) di `MtqContext`. `setCurrentView(view)` mengganti state dan URL (`history.pushState`).

Menambah halaman baru wajib menyentuh **6 tempat**:
1. `ViewType` di `src/context/MtqContext.tsx`
2. `VIEW_TO_PATH` di `MtqContext.tsx` (path URL)
3. `case` di `renderCurrentView()` pada `src/App.tsx` (+ `React.lazy` import)
4. Menu di `src/components/layout/Sidebar.tsx` (`adminNavGroups` / menu hakim / superadmin)
5. Judul breadcrumb `viewRouteInfo` di `src/components/layout/TopHeader.tsx`
6. Judul tab `VIEW_PAGE_TITLES` di `src/hooks/useDocumentMeta.ts`

| ViewType | Path | Komponen | Peran |
|---|---|---|---|
| `dashboard` | `/dashboard` | `components/dashboard/DashboardView.tsx` | admin |
| `master_data` | `/master-data` | `components/masterData/MasterDataView.tsx` | admin |
| `user_management` | `/pengguna-hakim` | `components/users/UserManagementView.tsx` | admin |
| `bank_soal` | `/bank-soal` | `components/bankSoal/BankSoalView.tsx` | admin |
| `kafilah` | `/grup-peserta` | `components/kafilah/KafilahPesertaView.tsx` | admin |
| `stage_management` | `/manajemen-babak` | `components/stages/StageManagementView.tsx` | admin |
| `penilaian_hakim` | `/penilaian-hakim` | `components/penilaian/PenilaianHakimListView.tsx` | admin (monitoring) & hakim ("Peserta Saya") |
| `penilaian_dual_panel` | `/lembar-penilaian` | `components/penilaian/PenilaianDualPanelView.tsx` | hakim |
| `rekap_nilai` | `/rekap-nilai` | `components/rekap/RekapNilaiView.tsx` | admin & hakim |
| `live_scoring` | `/sesi-live` | `components/live/LiveScoringControlView.tsx` | admin |
| `hasil_kelulusan` | `/hasil-kelulusan` | `components/stages/HasilKelulusanView.tsx` | admin |
| `log_aktivitas` | `/log-aktivitas` | `components/activityLog/ActivityLogView.tsx` | admin |
| `superadmin_dashboard` | `/platform/dashboard` | `components/superadmin/SuperadminDashboardView.tsx` | superadmin |
| `superadmin_tenants` | `/platform/tenants` | `SuperadminTenantsView.tsx` | superadmin |
| `superadmin_users` | `/platform/users` | `SuperadminUsersView.tsx` | superadmin |
| `superadmin_health` | `/platform/health` | `SuperadminHealthView.tsx` | superadmin |
| `superadmin_audit` | `/platform/audit` | `SuperadminAuditView.tsx` | superadmin |
| `superadmin_settings` | `/platform/settings` | `SuperadminSettingsView.tsx` (SEO & meta) | superadmin |
| `superadmin_content` | `/platform/content` | `SuperadminContentView.tsx` (CMS landing & halaman) | superadmin |

Superadmin bisa membuka workspace penyelenggara (`enterTenantWorkspace` / `exitTenantWorkspace`, mode supervisi, tercatat di audit).

### 2c. Gerbang masuk

`App.tsx` → bila `!isLiveAccessAuthorized` atau mode pemulihan sandi, tampil `components/auth/AuthenticationGateView.tsx` (masuk, lupa sandi, sandi baru, diagnosis akses, tombol **Coba Mode Demo**). Keputusan akses: `evaluateWorkspaceAccessGate` di `src/lib/supabaseClient.ts`.

---

## 3. Alur data

```
Supabase (tabel + RLS)
   │  muat penuh: supabaseDataService.fetchTenantWorkspaceResult(tenantId)
   │  realtime  : supabaseDataService.subscribeToTenantRealtime (judge_assessments,
   │              stage_participations, stages)
   ▼
MtqContext (state React + localStorage cache 'mtq_platform_data_v3_*')
   │  useMtq() → data + aksi
   ▼
Halaman (components/*View.tsx)  ──aksi──►  MtqContext  ──►  supabaseDataService / RPC
```

- **Muat penuh** `refreshSupabaseConnection()` di `MtqContext`. Opsi `{ lightweight: true }` hanya memuat ulang workspace (dipakai realtime & muat berkala 30 menit). Hasil diterapkan oleh `applyHydratedWorkspace`.
- **Realtime:** `applyRealtimeAssessmentRow` (lembar hakim) dan `applyStageParticipationRealtimeUpdate` (`utils/realtimeRowApply.ts`, hanya status/nilai sementara diterapkan per baris; perubahan berat memicu muat ulang ringan).
- **Hemat egress:** muat penuh TIDAK membawa coretan mushaf (`ASSESSMENT_LIST_COLUMNS` + kolom `annotation_count`) dan TIDAK membawa daftar peringkat snapshot (`SNAPSHOT_LIST_COLUMNS`). Keduanya diunduh saat dibutuhkan: `loadAssessmentAnnotations`, `loadStageSnapshotRankings`.
- **Antrean offline (outbox):** `services/outboxSyncService.ts` (IndexedDB, cadangan localStorage). Simpan lembar hakim saat offline masuk antrean, dikirim ulang otomatis (`flushPendingQueue`). Masalah sinkron tampil di `components/layout/SyncIssuesModal.tsx`.
- **ID:** data lama/demo bisa ber-ID non-UUID. Selalu bandingkan/kirim ID ke database lewat `toDeterministicUuid()` (`utils/uuid.ts`).

---

## 4. MtqContext.tsx — peta bagian (cari nama fungsinya)

| Kelompok | Fungsi utama |
|---|---|
| Navigasi & notifikasi | `setCurrentView`, `addNotification`, `toggleSidebar` |
| Sesi, mode & koneksi | `refreshSupabaseConnection`, `signInWithSupabase`, `signOutSupabase`, `requestPasswordReset`, `completePasswordReset`, `bootstrapFirstSuperadmin`, `enterOfflineDemoSimulation`, `exitOfflineDemoSimulation`, `resetPrototypeData` |
| Supervisi superadmin | `enterTenantWorkspace`, `exitTenantWorkspace`, `fetchPlatformAuditLogs` |
| Outbox | `flushOutboxQueue`, `retryOutboxItem`, `discardOutboxItems`, `mergeUnsyncedLocalAssessments` |
| Pembaca turunan | `getParticipantStageQuestions` (maqra peserta per babak), `getStageParticipation`, `getJudgeAssessment`, `getFieldCoverageForStage`, `getParticipantProgress`, `getActiveRubricForBranch` |
| Rubrik & aturan | `addRubricVersion`, `updateRubricVersion`, `activateRubricVersion`, `archiveRubricVersion`, `deleteRubricVersion`, `deleteRubricField`, `addCompetitionRule`, `updateCompetitionRule`, `deleteCompetitionRule`, `recalculateAssessmentsForRubricOrRuleChange` |
| Penilaian hakim | `initializeAssessment`, `updateErrorCount` (+/− kesalahan), `saveAnnotations`, `loadAssessmentAnnotations`, `finalizeAssessment` (kunci lembar, RPC), `reopenAssessment` (buka kunci oleh admin, RPC) |
| Peserta & kafilah | `addKafilah`, `updateKafilah`, `deleteKafilah`, `addParticipant`, `updateParticipant`, `deleteParticipant`, `verifyParticipant`, `importParticipantsBatch`, `importKafilahsBatch` |
| Bank soal & maqra | `addQuestion`, `updateQuestion`, `deleteQuestion`, `importQuestionsBatch`, `addQuestionToParticipant`, `removeQuestionFromParticipant`, `assignMaqraToParticipant` |
| Undian | `conductLotteryDraw`, `commitLotteryDrawResults`, `drawLotteryServer` (RPC `draw_lottery_server`) |
| Master data | `addCabang`/`updateCabang`/`deleteCabang`, `addErrorCategory`/`updateErrorCategory`/`deleteErrorCategory`, `updateCategoryDeduction` (jenjang: sisa lama) |
| Pengguna & penyelenggara | `addUser`, `updateUser`, `toggleUserStatus`, `deleteUser`, `moveUserToTenant`, `retryUserProvisioning`, `addTenant`, `updateTenant`, `toggleTenantStatus`, `deleteTenant` |
| Babak | `validateStageInput`, `addStage`, `updateStage`, `deleteStage`, `stageHasAssessments` |
| Pengesahan | `advanceQualifiers` (lihat bagian 6) , `loadStageSnapshotRankings` |
| Penugasan hakim | `addJudgeAssignment`, `removeJudgeAssignment`, `getStageBranchJudgeAssignments` |
| Situs | `updateSiteSettings` |

Semua aksi di-ekspos lewat objek value provider (cari `loadStageSnapshotRankings,` di dekat akhir file) dan dipakai halaman dengan `const { ... } = useMtq()`.

---

## 5. Services & utils

| File | Isi |
|---|---|
| `services/supabaseDataService.ts` | Satu-satunya pintu ke Supabase dari aplikasi. Kelompok: koneksi & auth (`verifyDatabaseConnection`, `fetchAuthenticatedUserProfile`, `signInWithPassword`, ...), muat workspace (`fetchTenantWorkspaceResult`), RPC penilaian (`finalizeJudgeAssessmentRpc`, `reopenJudgeAssessmentRpc`, `syncAssessmentToRemote`, `upsertAssessmentRow`), peringkat & pengesahan (`computeStageRankingsRpc`, `advanceStageQualifiersRpc`, `fetchStageSnapshotRankings`), undian (`drawLotteryServerRpc`, `commitLotteryDrawRpc`), CRUD master data (`upsertStage`, `upsertBranch`, `upsertQuestion`, `upsertRubricVersionWithFields`, ...), pengguna (`upsertUserAndMembership`), audit (`appendAuditLog`), CMS & SEO (`saveSiteContent`, `saveSitePage`, `updateSiteSettings`), live scoring (`fetchLiveSessions`, `liveSessionControl`), realtime (`subscribeToTenantRealtime`), kesehatan (`getPlatformHealth`). |
| `services/scoringEngine.ts` | Hitung nilai lembar (`calculateAssessmentScore`), bidang rubrik aktif, cakupan bidang hakim (`resolveJudgeFieldScope`), bidang tanpa hakim (`findUncoveredRubricFields`), agregasi nilai peserta (`aggregateParticipantScores`), validasi maqra. |
| `services/rankingService.ts` | `RankingService.evaluateStageParticipants` (peringkat, tie-break, kuota, override, alasan blokir), `evaluateStageByBranches` (tampilan "Semua Cabang"), `createStageResultSnapshot` (snapshot Mode Demo). |
| `services/completion.ts` | Kelengkapan penilaian per peserta/babak, kode blokir (`StageBlockingCode`). |
| `services/competitionRules.ts` | Rubrik bawaan (Seni Baca, Tahfizh), aturan cabang (`getBranchRuleConfig`), rubrik aktif. |
| `services/stageResolver.ts` | Mencocokkan babak per cabang dan snapshot (`resolveStageForBranch`, `resolveSnapshotForStage`). |
| `services/outboxSyncService.ts` | Antrean offline (IndexedDB, cadangan localStorage), klasifikasi galat, pesan ramah. |
| `services/quranIndex.ts`, `quranApi.ts`, `mushafSource.ts` | Data surat/ayat/halaman, validasi maqra, sumber gambar halaman mushaf (lokal `/mushaf/` lalu pihak ketiga). |
| `services/publicContent.ts` | Konten publik (landing & halaman) lewat REST tanpa supabase-js. |
| `services/liveScoring.ts` | Live scoring: tipe, normalisasi data server, format maqra, urutan undian, bacaan publik (REST) dan realtime publik. |
| `utils/combinedScoring.ts` | Nilai juara gabungan (konfigurasi, babak sumber yang sah, rumus, hitung nilai). |
| `utils/unsavedSheets.ts` | Deteksi lembar dibuka hakim tetapi belum disimpan (peringatan pengesahan). |
| `utils/annotationCarryOver.ts` | Membawa coretan/peringkat snapshot yang sudah diunduh saat muat ulang. |
| `utils/realtimeRowApply.ts` | Aturan realtime per baris `stage_participations`. |
| `utils/excelHelper.ts` | Impor/ekspor Excel (peserta, soal, kafilah). |
| `utils/judgeAssignmentLabels.ts` | Label penugasan hakim & kolom Rekap. |
| `utils/participantSort.ts`, `viewFilterStorage.ts`, `dateTime.ts`, `uuid.ts`, `superadminGuard.ts`, `provisionSecurity.ts` | Bantu urut, simpan filter, waktu WIB, UUID deterministik, pembatasan superadmin, validasi pembuatan akun. |

---

## 6. Alur bisnis utama

### 6a. Persiapan (admin)
1. **Master Data & Rubrik** (`MasterDataView`): kategori kesalahan & bobot potongan, rubrik + bidang (Tajwid, Fashahah, Lagu, Suara, ...), aturan cabang & tie-break, babak per cabang (urutan, kuota lolos, jumlah juara, **Nilai Juara Gabungan**), cabang, penugasan hakim (per babak, per bidang).
2. **Pengguna & Hakim**: undang/ buat akun (Edge Function `admin-provision-user` + RPC `upsert_tenant_member_profile`).
3. **Bank Soal & Maqra**: soal = surat + ayat + halaman mushaf, terikat ke cabang & babak.
4. **Grup & Peserta**: kafilah, peserta, verifikasi (`verify_participant`; peserta **Ditolak** tidak diundi, tidak dinilai, tidak diperingkat).
5. **Undian** (`drawLotteryServer` → RPC `draw_lottery_server`): nomor undian + maqra per peserta per babak (`stage_participations`, `assigned_maqras`).

### 6b. Penilaian (hakim)
1. Hakim membuka **Penilaian Mushaf** (`PenilaianDualPanelView`): gambar mushaf + kanvas coretan + tombol +/− per kategori kesalahan.
2. `initializeAssessment` membuat lembar draf (`judge_assessments`, status `in_progress`).
3. `updateErrorCount` / `saveAnnotations` menyimpan draf (lewat outbox bila offline). Nilai = nilai awal rubrik − potongan, per bidang.
4. **Simpan Penilaian** = `finalizeAssessment` → RPC `finalize_judge_assessment`: lembar `finalized` + `is_locked`. **Hanya lembar final & terkunci yang dihitung resmi.** Tidak bisa finalisasi saat offline.
5. Admin dapat membuka kunci: `reopenAssessment` → RPC `reopen_judge_assessment` (tercatat audit).

### 6c. Kelengkapan & peringkat
- **Kelengkapan per bidang:** peserta lengkap bila setiap (maqra × bidang rubrik) punya minimal satu lembar final dari hakim aktif pemegang bidang itu (tidak harus semua hakim — mendukung dua tim juri).
- **Nilai peserta** = Σ (rata-rata nilai bidang dari hakim pemegang bidang × bobot bidang).
- **Peringkat:** nilai total, lalu urutan tie-break bidang dari aturan cabang. Seri penuh di batas kuota / posisi juara wajib diputus **sidang pleno** (urutan + alasan) di halaman Hasil.
- Server: RPC `compute_stage_rankings` (admin saja). Browser: `RankingService` (tampilan & Mode Demo).

### 6d. Nilai Juara Gabungan (babak setelah Penyisihan)
- Kolom `stages.combined_scoring` = `{ self_weight, sources: [{ stage_id, weight }] }`. Diatur di form babak (Master Data → Babak Musabaqah).
- Nilai gabungan = Σ(nilai babak × bobot) ÷ Σ bobot (skala 100). Nilai babak sebelumnya diambil dari **snapshot resmi** babak itu (`stage_score`, bukan nilai gabungannya).
- Tie-break: nilai gabungan → nilai babak ini → bidang. Babak sumber belum disahkan = babak ini tidak bisa disahkan (`COMBINED_SOURCE_NOT_RATIFIED`).
- Kode: `utils/combinedScoring.ts`, `RankingService` (param `combinedScoring`), SQL `compute_stage_rankings` (pembungkus `compute_stage_rankings_base`).

### 6e. Pengesahan babak (Hasil & Kelulusan)
1. `HasilKelulusanView` menampilkan peringkat, kelengkapan, panel seri pleno, override (wajib alasan ≥ 5 karakter).
2. **Peringatan lembar belum disimpan** (`collectUnsavedSheets`): teks merah + kotak centang wajib di jendela konfirmasi + audit `RATIFICATION_UNSAVED_SHEETS_ACKNOWLEDGED`.
3. `advanceQualifiers` (context) → RPC `advance_stage_qualifiers`: validasi ulang di server, set `final_score` & `rank`, kelulusan atau juara, pindahkan peserta lolos ke babak berikutnya, babak `is_finalized`, tulis **snapshot permanen** `stage_result_snapshots`, audit `STAGE_FINALIZED`.
4. Setelah disahkan: hasil, kuota, jumlah juara, dan konfigurasi nilai gabungan **terkunci** (trigger database).

### 6f. Live Scoring
- Admin: **Sesi Live Scoring** (`LiveScoringControlView`) → RPC `live_session_control(stage_id, action, stage_participation_id, hide_names, maqra_index)`; action: `start | stop | set | next | prev | options | refresh | show_maqra | hide_maqra`.
- Tabel `live_sessions` (satu baris per babak). Kolom `display` = salinan data layar publik **yang dibuat server**, dikosongkan saat sesi berhenti.
- **Maqra rahasia:** tersembunyi bawaan (`shown_maqra_index = NULL`); admin menampilkan satu maqra (Maqra 1, 2, ...), maqra baru menggantikan yang lama. Pindah peserta / mulai / berhenti menyembunyikan lagi. Maqra yang belum ditampilkan tidak pernah ada di `display` (hanya `maqra_count`). Layar publik menampilkan halaman mushaf maqra itu dalam satu kolom (halaman kedua di bawahnya).
- Publik: `/live/<KODE>` (`src/live/LiveScoringPage.tsx` + `LiveDisplayCard.tsx`) membaca RPC `get_live_sessions(kode)` (SECURITY INVOKER) lalu berlangganan realtime `live_sessions`. **Tidak ada nilai.**
- Tampilan (preset "Kaca Bermotif"): `LiveFrame.tsx` = latar + header (logo & nama penyelenggara) + atribusi Manajemen MTQ; `LiveDisplayCard.tsx` = isi (mushaf kiri/identitas kanan, atau identitas di tengah bila maqra tersembunyi). Pratinjau admin memakai keduanya dengan `compact`.
- Logo penyelenggara: kolom `tenants.logo_url` (migrasi 20261129, tautan https:// atau data URI gambar ≤200.000 karakter), diisi di Superadmin → Manajemen Penyelenggara → Edit (`TenantLogoField.tsx`, util `src/utils/tenantLogo.ts`). Disalin otomatis lewat trigger ke `live_sessions.tenant_logo_url` dan dikembalikan `get_live_sessions` sebagai `tenant_logo_url`.
- Mode Demo: admin hanya melihat pratinjau lokal (`buildLiveDisplay`).

---

## 7. Database: tabel & RPC penting

**Tabel inti:** `tenants`, `profiles`, `tenant_memberships`, `branches`, `stages`, `kafilahs`, `participants`, `stage_participations`, `questions`, `assigned_maqras`, `judge_assignments`, `judge_assessments`, `rubric_versions`, `rubric_fields`, `error_categories`, `competition_rule_configs`, `stage_result_snapshots`, `audit_logs`, `lottery_draw_logs`, `live_sessions`, `site_settings`, `site_content`, `site_pages`, `app_schema_versions`.

**RPC yang dipanggil aplikasi:**

| RPC | Fungsi | Siapa |
|---|---|---|
| `finalize_judge_assessment` | Kunci lembar hakim | hakim pemilik |
| `reopen_judge_assessment` | Buka kunci lembar | admin |
| `compute_stage_rankings` | Peringkat resmi (+ nilai gabungan) | admin |
| `advance_stage_qualifiers` | Pengesahan babak + snapshot | admin |
| `draw_lottery_server`, `commit_lottery_draw` | Undian | admin |
| `verify_participant` | Verifikasi peserta | admin |
| `delete_participant_safe`, `delete_rubric_field_cascade`, `delete_tenant_safe` | Hapus aman | admin / superadmin |
| `upsert_tenant_member_profile`, `move_member_to_tenant` | Akun & keanggotaan | admin / superadmin |
| `append_admin_audit_log` | Catat log aktivitas dari aplikasi | admin |
| `record_supervision_event` | Log supervisi | superadmin |
| `bootstrap_first_superadmin` | Superadmin pertama | sekali saja |
| `get_platform_health` | Kesehatan sistem | superadmin |
| `live_session_control` | Kendali sesi live | admin |
| `get_live_sessions` | Bacaan publik live | publik |

**Migrasi:** `supabase/migrations/YYYYMMDD_nama.sql`, berurutan, **idempotent** (aman dijalankan ulang). Migrasi baru mencatat versinya di `app_schema_versions`. Fungsi yang diganti ditulis ulang utuh dengan `CREATE OR REPLACE` di migrasi baru (jangan mengubah migrasi lama yang sudah dipasang).

---

## 8. Tes

- `npm run lint` — pemeriksaan TypeScript (`tsc --noEmit`).
- `npm test` — `src/tests/runAllTests.ts`: `domainRules.test.ts`, `multiBranch.test.ts`, `importParser.test.ts` (unit) dan `supabaseRules.test.ts` (menjalankan seluruh migrasi di PGlite lalu menguji RLS/RPC). Migrasi baru wajib didaftarkan di `supabaseRules.test.ts` (baca file, `pg.exec` awal, dan jalankan ulang di tes T7).
- `npm run test:e2e` — Playwright (`tests/e2e/`).
- `npm run build` — build produksi.

---

## 9. JANGAN DIUBAH (aturan yang menjaga keabsahan lomba)

**Penilaian & pengesahan**
1. Hanya lembar `status = 'finalized'` **dan** `is_locked = true` yang dihitung resmi. Jangan pernah mengirim status final / `is_locked` lewat upsert biasa; finalisasi hanya lewat RPC `finalize_judge_assessment`.
2. `stage_result_snapshots` dan `audit_logs` hanya boleh ditulis oleh RPC server. Jangan insert langsung dari aplikasi.
3. Pengesahan babak hanya lewat RPC `advance_stage_qualifiers`. Jangan menghapus pemeriksaan kelengkapan per bidang, bidang tanpa hakim (`FIELD_WITHOUT_JUDGE`), seri kritis (`UNRESOLVED_CRITICAL_TIE`), alasan override ≥ 5 karakter, atau `COMBINED_SOURCE_NOT_RATIFIED`.
4. Jangan hapus peringatan lembar belum disimpan (kotak centang wajib & `confirmDisabled`) di jendela pengesahan, dan jangan ikut menghitung lembar yang tidak pernah dibuka.
5. Nilai babak sumber untuk nilai gabungan harus dari snapshot resmi, bukan dihitung ulang dari lembar. Urutan tie-break: gabungan → nilai babak ini → bidang.
6. Babak yang sudah disahkan terkunci (kuota, juara, nilai gabungan). Nama/cabang/urutan babak terkunci setelah ada lembar penilaian.

**Hemat egress & keamanan coretan**
7. Jangan kembalikan `select('*')` untuk `judge_assessments` dan `stage_result_snapshots` di muat penuh (kecuali jalur cadangan yang sudah ada).
8. Jangan hapus syarat `annotationsLoaded === false` di upsert lembar dan di `saveAnnotations` (mencegah coretan terhapus). Jangan kirim kolom `annotation_count` (kolom GENERATED).
9. Jangan kembalikan muat ulang berkala ke 5 menit, dan jangan jadikan setiap event realtime `stage_participations` muat ulang penuh.

**Multi-tenant & privasi**
10. Setiap query/aksi wajib dibatasi `tenant_id` penyelenggara aktif. Jangan melonggarkan RLS.
11. Fungsi SECURITY DEFINER tidak boleh bisa dieksekusi `anon` (ada tes 65). `get_live_sessions` harus tetap SECURITY INVOKER dan hanya membaca `live_sessions`.
12. Layar live tidak boleh menampilkan nilai/peringkat. `display` dikosongkan saat sesi berhenti. Maqra hanya masuk `display` setelah `show_maqra`, dan direset saat pindah peserta — jangan kirim daftar semua maqra ke publik. Folder `src/live/` tidak boleh mengimpor `MtqContext` atau `supabaseDataService`.
13. Jangan simpan rahasia (service role key, kata sandi) di kode frontend.

---

## 10. Cara meminta perubahan (untuk pengguna & AI)

File besar (`MtqContext.tsx`, `supabaseDataService.ts`, `MasterDataView.tsx`, `BankSoalView.tsx`, `KafilahPesertaView.tsx`, `schema.sql`, file tes) **jangan ditulis ulang utuh**. Ubah hanya fungsi/bagian yang disebut.

**Perintah yang efektif**
- "Di `src/components/stages/HasilKelulusanView.tsx`, ubah judul kolom 'Nilai Akhir' menjadi 'Nilai'. Jangan ubah file lain."
- "Di `MtqContext.tsx`, fungsi `updateStage`, tambahkan validasi X. Ubah hanya fungsi itu."
- "Tambah halaman baru Y: ikuti 6 langkah di PETA-KODE.md bagian 2b."

**Perintah yang sebaiknya dihindari**
- "Perbaiki tampilan Hasil" (terlalu umum, AI akan menulis ulang banyak file).
- "Rapikan MtqContext" / "refactor semua" (melebihi batas tulis, memicu macet).
- Meminta AI mengedit `supabase/schema.sql` atau file tes — ganti dengan versi yang sudah diuji.
- Mengubah logika nilai/pengesahan hanya di browser tanpa mengubah RPC server (hasil resmi tetap dari server).

**Paket perubahan dari luar (zip):** ganti isi file apa adanya, jalankan SQL yang disertakan lebih dulu di Supabase, lalu mulai obrolan baru di AI Studio.

---

## 11. Versi pendek untuk instruksi sistem AI Studio

```
Proyek: Manajemen MTQ (React 19 + TS + Vite + Tailwind 4 + Supabase), multi-penyelenggara.
Baca PETA-KODE.md sebelum mengubah kode.
- Ubah HANYA file dan fungsi yang diminta. Jangan menulis ulang file besar utuh
  (MtqContext.tsx, supabaseDataService.ts, MasterDataView.tsx, schema.sql, file tes).
- Jangan edit supabase/schema.sql, file tes, atau migrasi SQL lama.
- Halaman aplikasi tanpa react-router: tambah halaman = 6 tempat (ViewType, VIEW_TO_PATH,
  App.tsx, Sidebar, TopHeader, useDocumentMeta).
- Server adalah sumber kebenaran: finalisasi lembar, peringkat resmi, pengesahan babak,
  snapshot, audit, dan sesi live hanya lewat RPC. Jangan pindahkan aturan itu ke browser.
- Hanya lembar finalized + is_locked yang dihitung. Jangan kirim status final lewat upsert.
- Jangan kembalikan select('*') untuk judge_assessments / stage_result_snapshots; jangan hapus
  pengaman annotationsLoaded; jangan kirim annotation_count.
- Selalu batasi data per tenant_id; pakai toDeterministicUuid() untuk ID ke database.
- Layar /live tidak menampilkan nilai; src/live/ tidak mengimpor MtqContext/supabaseDataService.
- Teks antarmuka berbahasa Indonesia.
```

## Nomor undian, tanggal lahir, ekspor/impor peserta (20261130)
- Dua nomor undian: `participants.lottery_number` = nomor pendaftaran (boleh kosong); `stage_participations.lottery_number` = hasil undian babak (draw_lottery_server). Tampilan Rekap, Monitoring, Penilaian, Dasbor memakai `applyStageLotteryNumbers` (src/utils/participantSort.ts) — hanya untuk tampilan, jangan dipakai untuk menyimpan peserta.
- Menyimpan peserta tidak boleh menimpa nomor hasil undian: `updateParticipantRecord` hanya mengisi babak yang nomornya kosong, dan trigger `trg_sp_keep_lottery` menolak pengosongan nomor.
- Tanggal lahir: `participants.birth_date` (YYYY-MM-DD), util `src/utils/birthDate.ts`. Layar Live hanya menerima `age` (dihitung server di `live_session_build_display`), tanggal lahir tidak dikirim ke publik.
- Ekspor Excel peserta: `exportParticipantsExcel` (excelHelper). Judul kolom sama dengan template impor sehingga bisa diimpor kembali; `Nomor_Undian_Babak`, `Usia`, `Verifikasi` diabaikan saat impor.
- Impor peserta memperbarui peserta lama: cocok lewat Kode Peserta, atau Nama + Grup + Cabang (harus tepat satu). Sel kosong tidak menghapus data; pratinjau menandai Baru / Diperbarui (kolom) / Tanpa perubahan.
