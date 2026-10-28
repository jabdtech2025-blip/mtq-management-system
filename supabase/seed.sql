-- ==============================================================================
-- MTQ MANAGEMENT SYSTEM — INITIAL REFERENCE & MASTER DATA SEED (OPTIONAL)
-- File: supabase/seed.sql
-- Urutan Eksekusi: Dijalankan SETELAH `supabase/schema.sql` pada database kosong
-- Seluruh ID menggunakan UUID v4 deterministik yang selaras dengan src/utils/uuid.ts
-- ==============================================================================

-- 1. TENANTS
INSERT INTO tenants (id, code, name, event_name, region, edition, period, status)
VALUES
    ('00000000-0000-0000-0000-000000000000', 'LPTQ-SYSTEM', 'Standar Nasional LPTQ (Template Sistem)', 'Pedoman Nasional MTQ 2025/2026', 'Nasional', 'Pedoman 2025', '2025 - 2026', 'Aktif'),
    ('11111111-1111-4111-8111-111111111101', 'LPTQ-JBR', 'LPTQ Provinsi Jawa Barat', 'MTQ Nasional Tingkat Provinsi Jawa Barat XXXI 2025', 'Jawa Barat', 'Edisi XXXI - 2025', '2025 - 2026', 'Aktif'),
    ('11111111-1111-4111-8111-111111111102', 'LPTQ-DKI', 'LPTQ Provinsi DKI Jakarta', 'MTQ Tingkat Provinsi DKI Jakarta XXX 2025', 'DKI Jakarta', 'Edisi XXX - 2025', '2025 - 2026', 'Aktif')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    event_name = EXCLUDED.event_name,
    updated_at = now();

-- 2. BRANCHES (CABANG LOMBA)
INSERT INTO branches (id, tenant_id, code, name, description, status)
VALUES
    ('55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111101', 'TLW-DWS-PA', 'Tilawah Dewasa Putra', 'Cabang Seni Baca Al-Qur''an Golongan Dewasa Putra', 'Aktif'),
    ('55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111101', 'TLW-DWS-PI', 'Tilawah Dewasa Putri', 'Cabang Seni Baca Al-Qur''an Golongan Dewasa Putri', 'Aktif'),
    ('55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111101', 'THF-10J-PA', 'Tahfizh 10 Juz Putra', 'Cabang Hafalan Al-Qur''an Golongan 10 Juz Putra', 'Aktif')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 3. LEVELS (JENJANG)
INSERT INTO levels (id, tenant_id, code, name, description, status)
VALUES
    ('66666666-6666-4666-8666-666666666601', '11111111-1111-4111-8111-111111111101', 'ULYA', 'Ulya (Dewasa)', 'Jenjang Dewasa / Umum', 'Aktif'),
    ('66666666-6666-4666-8666-666666666602', '11111111-1111-4111-8111-111111111101', 'WUSTHA', 'Wustha (Remaja)', 'Jenjang Remaja', 'Aktif'),
    ('66666666-6666-4666-8666-666666666603', '11111111-1111-4111-8111-111111111101', 'ULA', 'Ula (Anak-anak)', 'Jenjang Anak-anak', 'Aktif')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 4. RUBRIC VERSIONS, FIELDS, CRITERIA & DEDUCTION RULES
-- Catatan Verifikasi:
-- - RUBRIC-SENI-BACA-2025 terverifikasi langsung dari Buku Pedoman Musabaqah Al-Qur'an dan Al-Hadits 2025 hal. 42-45.
-- - RUBRIC-TAHFIZH-2025 disediakan sebagai template konfigurasi penyelenggara (is_verified_official = false pada competition_rule_configs).
INSERT INTO rubric_versions (id, tenant_id, code, name, branch_code, branch_name, version, description, official_source, starting_score, status)
VALUES
    (
        '33333333-3333-4333-8333-333333333301',
        '00000000-0000-0000-0000-000000000000',
        'RUBRIC-SENI-BACA-2025',
        'Rubrik Resmi Seni Baca Al-Qur''an (Pedoman MTQ 2025)',
        'TLW',
        'Tilawah',
        '2025.1',
        'Rubrik resmi LPTQ/Kemenag untuk Cabang Seni Baca Al-Qur''an (Tajwid 30, Fashahah 30, Lagu 25, Suara 15).',
        'Buku Pedoman Musabaqah Al-Qur''an dan Al-Hadits 2025 hal. 42-45',
        100.00,
        'Aktif'
    ),
    (
        '33333333-3333-4333-8333-333333333302',
        '00000000-0000-0000-0000-000000000000',
        'RUBRIC-TAHFIZH-2025',
        'Template Rubrik Tahfizh Al-Qur''an (Konfigurasi Penyelenggara)',
        'THF',
        'Tahfizh',
        '2025.1',
        'Template konfigurasi rubrik Cabang Tahfizh Al-Qur''an (Tahfizh 50, Tajwid 25, Fashahah 25) — disesuaikan dengan Juknis penyelenggara.',
        'Template Konfigurasi Penyelenggara (Wajib Diverifikasi Sesuai Juknis Penyelenggara)',
        100.00,
        'Aktif'
    )
ON CONFLICT (tenant_id, code, version) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    official_source = EXCLUDED.official_source;

-- Rubric Fields untuk RUBRIC-SENI-BACA-2025 (33333333-3333-4333-8333-333333333301)
-- DAN RUBRIC-TAHFIZH-2025 (33333333-3333-4333-8333-333333333302)
INSERT INTO rubric_fields (id, rubric_version_id, code, name, max_score, min_score, max_deduction, field_order, status, description)
VALUES
    -- Bidang Rubrik Seni Baca Al-Qur'an (Total = 100)
    ('33333333-3333-4333-8333-333333333401', '33333333-3333-4333-8333-333333333301', 'TJW', 'Tajwid', 30.00, 0.00, 30.00, 1, 'Aktif', 'Makharijul huruf, shifatul huruf, ahkamul madd wal qashr'),
    ('33333333-3333-4333-8333-333333333402', '33333333-3333-4333-8333-333333333301', 'FSH', 'Fashahah', 30.00, 0.00, 30.00, 2, 'Aktif', 'Muraatul huruf wal harakat, ahkamul waqf wal ibtida'),
    ('33333333-3333-4333-8333-333333333403', '33333333-3333-4333-8333-333333333301', 'LAG', 'Lagu', 25.00, 0.00, 25.00, 3, 'Aktif', 'Lagu pertama, jumlah lagu, variasi, peralihan dan keutuhan'),
    ('33333333-3333-4333-8333-333333333404', '33333333-3333-4333-8333-333333333301', 'SUA', 'Suara', 15.00, 0.00, 15.00, 4, 'Aktif', 'Kejernihan, kehalusan, kenyaringan, pengaturan nafas'),
    -- Bidang Rubrik Tahfizh Al-Qur'an (Total = 100)
    ('33333333-3333-4333-8333-333333333405', '33333333-3333-4333-8333-333333333302', 'THF', 'Tahfizh', 50.00, 0.00, 50.00, 1, 'Aktif', 'Kelancaran hafalan, tawaqquf, tarkul ayat, terbalik ayat, dan pengulangan'),
    ('33333333-3333-4333-8333-333333333406', '33333333-3333-4333-8333-333333333302', 'TJW', 'Tajwid', 25.00, 0.00, 25.00, 2, 'Aktif', 'Makharijul huruf, shifatul huruf, ahkamul mad wal waqf'),
    ('33333333-3333-4333-8333-333333333407', '33333333-3333-4333-8333-333333333302', 'FSH', 'Fashahah', 25.00, 0.00, 25.00, 3, 'Aktif', 'Fashahah kalimah, waqaf dan ibtida, suara dan adab')
ON CONFLICT (rubric_version_id, code) DO UPDATE
SET name = EXCLUDED.name,
    max_score = EXCLUDED.max_score,
    max_deduction = EXCLUDED.max_deduction,
    field_order = EXCLUDED.field_order,
    description = EXCLUDED.description;

-- Rubric Criteria untuk RUBRIC-SENI-BACA-2025
INSERT INTO rubric_criteria (id, rubric_field_id, code, name, description, max_deduction, sort_order)
VALUES
    ('33333333-3333-4333-8333-333333333501', '33333333-3333-4333-8333-333333333401', 'TJW-JALI', 'Kesalahan Jali (Nyata)', 'Perubahan huruf, harakat, atau struktur lafal yang merusak makna.', 30.00, 1),
    ('33333333-3333-4333-8333-333333333502', '33333333-3333-4333-8333-333333333401', 'TJW-KHAFI', 'Kesalahan Khafi (Samar)', 'Kekurangan pada ghunnah, mad, tarqiq/tafkhim yang tidak merusak harakat pokok.', 20.00, 2),
    ('33333333-3333-4333-8333-333333333503', '33333333-3333-4333-8333-333333333402', 'FSH-WQF', 'Kesalahan Waqaf dan Ibtida', 'Waqaf qabih, ibtida bil ma''na al-fasid, terputus nafas di tengah lafal.', 30.00, 1),
    ('33333333-3333-4333-8333-333333333504', '33333333-3333-4333-8333-333333333402', 'FSH-LNC', 'Kelancaran & Fashahah Kalimah', 'Tersendat, pengulangan tidak wajar, tempo terganggu.', 20.00, 2),
    ('33333333-3333-4333-8333-333333333505', '33333333-3333-4333-8333-333333333403', 'LAG-IRM', 'Kekurangan Variasi & Keindahan Maqam', 'Kurang dari 3 maqam, perpindahan lagu kaku, fashilah monoton.', 25.00, 1),
    ('33333333-3333-4333-8333-333333333506', '33333333-3333-4333-8333-333333333404', 'SUA-VKL', 'Kekurangan Kualitas Suara & Nafas', 'Suara serak/pecah, nafas terputus sebelum fashilah, ketidakstabilan nada.', 15.00, 1)
ON CONFLICT (id) DO NOTHING;

-- Deduction Rules untuk RUBRIC-SENI-BACA-2025
INSERT INTO deduction_rules (id, criterion_id, name, error_grade, deduction_points, max_deduction, method_type)
VALUES
    ('33333333-3333-4333-8333-333333333601', '33333333-3333-4333-8333-333333333501', 'Kesalahan Jali', 'Jali', 1.00, 30.00, 'Pengurangan tetap'),
    ('33333333-3333-4333-8333-333333333602', '33333333-3333-4333-8333-333333333502', 'Kesalahan Khafi', 'Khafi', 0.50, 20.00, 'Pengurangan tetap'),
    ('33333333-3333-4333-8333-333333333603', '33333333-3333-4333-8333-333333333503', 'Kesalahan Waqaf/Ibtida', 'Jali', 1.00, 30.00, 'Pengurangan tetap'),
    ('33333333-3333-4333-8333-333333333604', '33333333-3333-4333-8333-333333333504', 'Kekurangan Kelancaran', 'Khafi', 0.50, 20.00, 'Pengurangan tetap'),
    ('33333333-3333-4333-8333-333333333605', '33333333-3333-4333-8333-333333333505', 'Pengurangan Lagu', 'Sedang', 0.50, 25.00, 'Pengurangan tetap'),
    ('33333333-3333-4333-8333-333333333606', '33333333-3333-4333-8333-333333333506', 'Pengurangan Suara', 'Sedang', 0.50, 15.00, 'Pengurangan tetap')
ON CONFLICT (id) DO NOTHING;

-- 5. COMPETITION RULE CONFIGS (KONSISTEN UNTUK SELURUH CABANG SEED)
INSERT INTO competition_rule_configs (id, tenant_id, branch_id, branch_name, rubric_version_id, tie_break_order, quota_per_stage, official_source, is_verified_official, status)
VALUES
    (
        '77777777-7777-4777-8777-777777777701',
        '11111111-1111-4111-8111-111111111101',
        '55555555-5555-4555-8555-555555555501',
        'Tilawah Dewasa Putra',
        '33333333-3333-4333-8333-333333333301',
        ARRAY['total', 'Tajwid', 'Lagu', 'Fashahah'],
        '{"Penyisihan": 3, "Final": 3}'::jsonb,
        'Buku Pedoman Musabaqah Al-Qur''an dan Al-Hadits 2025 hal. 42-45',
        true,
        'Aktif'
    ),
    (
        '77777777-7777-4777-8777-777777777702',
        '11111111-1111-4111-8111-111111111101',
        '55555555-5555-4555-8555-555555555502',
        'Tilawah Dewasa Putri',
        '33333333-3333-4333-8333-333333333301',
        ARRAY['total', 'Tajwid', 'Lagu', 'Fashahah'],
        '{"Penyisihan": 3, "Final": 3}'::jsonb,
        'Buku Pedoman Musabaqah Al-Qur''an dan Al-Hadits 2025 hal. 42-45',
        true,
        'Aktif'
    ),
    (
        '77777777-7777-4777-8777-777777777703',
        '11111111-1111-4111-8111-111111111101',
        '55555555-5555-4555-8555-555555555503',
        'Tahfizh 10 Juz Putra',
        '33333333-3333-4333-8333-333333333302',
        ARRAY['total', 'Tahfizh', 'Tajwid', 'Fashahah'],
        '{"Penyisihan": 3, "Final": 3}'::jsonb,
        'Template Konfigurasi Penyelenggara (Wajib Diverifikasi Sesuai Juknis Penyelenggara)',
        false,
        'Aktif'
    )
ON CONFLICT (tenant_id, branch_id) DO UPDATE
SET rubric_version_id = EXCLUDED.rubric_version_id,
    tie_break_order = EXCLUDED.tie_break_order,
    official_source = EXCLUDED.official_source,
    is_verified_official = EXCLUDED.is_verified_official;

-- 6. STAGES (BABAK KOMPETISI KONSISTEN UNTUK SELURUH CABANG SEED)
INSERT INTO stages (id, tenant_id, branch_id, name, stage_order, qualification_quota, qualification_method, status, is_finalized)
VALUES
    -- Tilawah Dewasa Putra
    ('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111101', '55555555-5555-4555-8555-555555555501', 'Penyisihan', 1, 3, 'top_n', 'Aktif', false),
    ('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111101', '55555555-5555-4555-8555-555555555501', 'Final', 2, 3, 'top_n', 'Menunggu', false),
    -- Tilawah Dewasa Putri
    ('44444444-4444-4444-8444-444444444411', '11111111-1111-4111-8111-111111111101', '55555555-5555-4555-8555-555555555502', 'Penyisihan', 1, 3, 'top_n', 'Aktif', false),
    ('44444444-4444-4444-8444-444444444412', '11111111-1111-4111-8111-111111111101', '55555555-5555-4555-8555-555555555502', 'Final', 2, 3, 'top_n', 'Menunggu', false),
    -- Tahfizh 10 Juz Putra
    ('44444444-4444-4444-8444-444444444421', '11111111-1111-4111-8111-111111111101', '55555555-5555-4555-8555-555555555503', 'Penyisihan', 1, 3, 'top_n', 'Aktif', false),
    ('44444444-4444-4444-8444-444444444422', '11111111-1111-4111-8111-111111111101', '55555555-5555-4555-8555-555555555503', 'Final', 2, 3, 'top_n', 'Menunggu', false)
ON CONFLICT (tenant_id, branch_id, name) DO NOTHING;

-- 7. ERROR CATEGORIES
INSERT INTO error_categories (id, tenant_id, rubric_field_id, criterion_id, deduction_rule_id, code, name, scope, default_deduction, max_deduction, method_type, status, sort_order)
VALUES
    ('88888888-8888-4888-8888-888888888801', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333401', '33333333-3333-4333-8333-333333333501', '33333333-3333-4333-8333-333333333601', 'MKH', 'Makharijul Huruf', 'Tajwid & Makhraj', 1.00, 30.00, 'Pengurangan tetap', 'Aktif', 1),
    ('88888888-8888-4888-8888-888888888802', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333401', '33333333-3333-4333-8333-333333333502', '33333333-3333-4333-8333-333333333602', 'SFT', 'Shifatul Huruf', 'Tajwid & Makhraj', 0.50, 20.00, 'Pengurangan tetap', 'Aktif', 2),
    ('88888888-8888-4888-8888-888888888803', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333401', '33333333-3333-4333-8333-333333333502', '33333333-3333-4333-8333-333333333602', 'MAD', 'Ahkamul Madd wal Qashr', 'Tajwid & Makhraj', 0.50, 20.00, 'Pengurangan tetap', 'Aktif', 3),
    ('88888888-8888-4888-8888-888888888804', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333402', '33333333-3333-4333-8333-333333333503', '33333333-3333-4333-8333-333333333603', 'WQF', 'Ahkamul Waqf wal Ibtida', 'Fasahah & Waqf', 1.00, 30.00, 'Pengurangan tetap', 'Aktif', 4),
    ('88888888-8888-4888-8888-888888888805', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333402', '33333333-3333-4333-8333-333333333503', '33333333-3333-4333-8333-333333333603', 'FSH', 'Mura''atul Huruf wal Harakat', 'Fasahah & Waqf', 1.00, 30.00, 'Pengurangan tetap', 'Aktif', 5),
    ('88888888-8888-4888-8888-888888888806', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333403', '33333333-3333-4333-8333-333333333505', '33333333-3333-4333-8333-333333333605', 'LAG', 'Ketepatan Nagham / Lagu', 'Lagu & Suara', 1.00, 25.00, 'Pengurangan tetap', 'Aktif', 6),
    ('88888888-8888-4888-8888-888888888807', '11111111-1111-4111-8111-111111111101', '33333333-3333-4333-8333-333333333404', '33333333-3333-4333-8333-333333333506', '33333333-3333-4333-8333-333333333606', 'SUA', 'Kualitas Suara & Pernafasan', 'Lagu & Suara', 0.50, 15.00, 'Pengurangan tetap', 'Aktif', 7)
ON CONFLICT (tenant_id, code) DO UPDATE
SET rubric_field_id = EXCLUDED.rubric_field_id,
    criterion_id = EXCLUDED.criterion_id,
    deduction_rule_id = EXCLUDED.deduction_rule_id;

-- 8. KAFILAHS & QUESTIONS
INSERT INTO kafilahs (id, tenant_id, code, name, region, leader_name, contact_person, contact_phone, status)
VALUES
    ('99999999-9999-4999-8999-999999999901', '11111111-1111-4111-8111-111111111101', 'KF-BDG', 'Kota Bandung', 'Jawa Barat - Wilayah IV', 'Drs. H. Asep Syamsudin', 'Ust. Ridwan Kamil', '0812-2001-3344', 'Aktif'),
    ('99999999-9999-4999-8999-999999999902', '11111111-1111-4111-8111-111111111101', 'KF-BGR', 'Kabupaten Bogor', 'Jawa Barat - Wilayah I', 'KH. Zainul Muttaqin', 'H. Dedi Mulyadi', '0811-1122-4455', 'Aktif')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO questions (id, tenant_id, code, title, surah_name, surah_number, start_ayah, end_ayah, page_number, page_start, page_end, branch_id, stage_id, status, description)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '11111111-1111-4111-8111-111111111101', 'MQ-TLW-01', 'QS. Al-Isra: 1 - 11', 'Al-Isra', 17, 1, 11, 282, 282, 283, '55555555-5555-4555-8555-555555555501', '44444444-4444-4444-8444-444444444401', 'Aktif', 'Maqra Tilawah Dewasa Babak Penyisihan'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', '11111111-1111-4111-8111-111111111101', 'MQ-TLW-04', 'QS. Maryam: 1 - 15', 'Maryam', 19, 1, 15, 305, 305, 306, '55555555-5555-4555-8555-555555555501', '44444444-4444-4444-8444-444444444401', 'Aktif', 'Maqra Tilawah Dewasa Babak Penyisihan')
ON CONFLICT (tenant_id, code) DO NOTHING;
