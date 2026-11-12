import { test, expect } from '@playwright/test';

const LIVE_ENABLED = process.env.E2E_LIVE_ENABLED === 'true';
const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL || '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD || '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const JUDGE_EMAIL = process.env.E2E_JUDGE_EMAIL || '';
const JUDGE_PASSWORD = process.env.E2E_JUDGE_PASSWORD || '';

test.describe('Live Supabase Role Audits (Superadmin, Admin, Judge)', () => {
  test.setTimeout(120000);

  test('1. Superadmin Live Login & Multi-Tenant Inspection', async ({ page }) => {
    test.skip(
      !LIVE_ENABLED || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
      'Skipped: E2E_LIVE_ENABLED, E2E_SUPERADMIN_EMAIL, and E2E_SUPERADMIN_PASSWORD must be provided via environment variables.'
    );

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(SUPERADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('aside')).toBeVisible({ timeout: 25000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('Super Admin');

    const navButtons = page.locator('aside nav button');
    const navCount = await navButtons.count();
    for (let i = 0; i < navCount; i++) {
      const btn = navButtons.nth(i);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    }

    const headerActionBtn = page.locator('header button[title*="Event"], header button:has-text("Event")').first();
    if (await headerActionBtn.isVisible()) {
      await headerActionBtn.click();
      await page.waitForTimeout(1000);
    }

    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('2. Admin Event Live Login & Full Operational Inspection', async ({ page }) => {
    test.skip(
      !LIVE_ENABLED || !ADMIN_EMAIL || !ADMIN_PASSWORD,
      'Skipped: E2E_LIVE_ENABLED, E2E_ADMIN_EMAIL, and E2E_ADMIN_PASSWORD must be provided via environment variables.'
    );

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('aside')).toBeVisible({ timeout: 25000 });

    const modules = [
      'Ringkasan Eksekutif',
      'Data Kafilah & Peserta',
      'Master Data & Konfigurasi',
      'Bank Soal (Maqra)',
      'Panel Penilaian Hakim',
      'Rekap Nilai & Klasemen',
      'Manajemen Pengguna'
    ];

    for (const modName of modules) {
      const btn = page.locator('aside nav button', { hasText: modName }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    }

    const masterBtn = page.locator('aside nav button', { hasText: 'Master Data' }).first();
    if (await masterBtn.isVisible()) {
      await masterBtn.click();
      await page.waitForTimeout(800);

      const masterTabs = ['Cabang Lomba', 'Golongan / Jenjang', 'Babak Musabaqah', 'Kategori Kesalahan', 'Aturan & Rubrik'];
      for (const tabName of masterTabs) {
        const tabBtn = page.locator('main button', { hasText: tabName }).first();
        if (await tabBtn.isVisible()) {
          await tabBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }

    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('3. Dewan Hakim (Judge) Live Login & Assessment Inspection', async ({ page }) => {
    test.skip(
      !LIVE_ENABLED || !JUDGE_EMAIL || !JUDGE_PASSWORD,
      'Skipped: E2E_LIVE_ENABLED, E2E_JUDGE_EMAIL, and E2E_JUDGE_PASSWORD must be provided via environment variables.'
    );

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 15000 });
    await emailInput.fill(JUDGE_EMAIL);
    await page.locator('input[type="password"]').fill(JUDGE_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('aside')).toBeVisible({ timeout: 25000 });

    const navButtons = page.locator('aside nav button');
    const navCount = await navButtons.count();
    for (let i = 0; i < navCount; i++) {
      const btn = navButtons.nth(i);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    }

    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });
});
