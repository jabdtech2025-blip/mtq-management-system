import React, { useEffect, useState } from 'react';
import { Settings, CheckCircle2, AlertTriangle, RotateCcw, Save, Info, Share2, FileCode2 } from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from '../../types/mtq';
import { PageHeader, Card, Button, Input, Badge } from '../ui';
import { LANDING_SEO } from '../../content/seo';

/**
 * SEO dan Meta Situs.
 *
 * Halaman ini hanya menampilkan pengaturan yang BENAR-BENAR berlaku:
 * - Nama situs, template judul tab, judul bawaan, warna tema, dan favicon (diterapkan di aplikasi oleh useDocumentMeta).
 * - Pratinjau tautan landing page (og:title, og:description, og:image) bersifat STATIS di index.html,
 *   karena WhatsApp/Facebook/X/mesin pencari tidak menjalankan JavaScript. Ditampilkan hanya-baca di sini.
 * Kolom lain di tabel site_settings dibiarkan apa adanya (tidak dihapus) agar data lama tetap utuh.
 */
export const SuperadminSettingsView: React.FC = () => {
  const { siteSettings, updateSiteSettings, addNotification } = useMtq();

  const [form, setForm] = useState<SiteSettings>(() => ({ ...siteSettings }));
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    setForm({ ...siteSettings });
  }, [siteSettings]);

  const titleLen = form.defaultTitle.trim().length;
  const isThemeColorValid = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(form.themeColor.trim());
  const isFaviconValid = /^(\/[^\s]*|https:\/\/[^\s]+)$/i.test(form.faviconUrl.trim());

  const updateField = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setFormError(null);
    setFormSuccess(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!form.siteName.trim()) return setFormError('Nama situs wajib diisi.');
    if (!form.titleTemplate.includes('%s')) return setFormError('Template judul wajib memuat %s (tempat nama halaman).');
    if (!form.defaultTitle.trim()) return setFormError('Judul bawaan wajib diisi.');
    if (titleLen > 70) return setFormError('Judul bawaan maksimal 70 karakter.');
    if (!isThemeColorValid) return setFormError('Warna tema harus berupa kode heksadesimal, mis. #06201F.');
    if (!isFaviconValid) return setFormError('Favicon harus berupa path situs (mis. /favicon.svg) atau alamat https://.');

    setIsSaving(true);
    try {
      const res = await updateSiteSettings({
        ...form,
        siteName: form.siteName.trim(),
        titleTemplate: form.titleTemplate.trim(),
        defaultTitle: form.defaultTitle.trim(),
        themeColor: form.themeColor.trim(),
        faviconUrl: form.faviconUrl.trim()
      });
      if (!res.success) {
        setFormError(res.message);
        addNotification({ title: 'Gagal Menyimpan Pengaturan', message: res.message, type: 'error', module: 'Superadmin SEO' });
      } else {
        setFormSuccess('Pengaturan situs berhasil diperbarui.');
        addNotification({ title: 'Pengaturan Situs Diperbarui', message: res.message, type: 'success', module: 'Superadmin SEO' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setForm((prev) => ({
      ...prev,
      siteName: DEFAULT_SITE_SETTINGS.siteName,
      titleTemplate: DEFAULT_SITE_SETTINGS.titleTemplate,
      defaultTitle: DEFAULT_SITE_SETTINGS.defaultTitle,
      themeColor: DEFAULT_SITE_SETTINGS.themeColor,
      faviconUrl: DEFAULT_SITE_SETTINGS.faviconUrl
    }));
    setFormError(null);
    setFormSuccess('Nilai dikembalikan ke bawaan. Klik "Simpan Pengaturan" untuk menerapkan.');
  };

  const previewTabTitle = (form.titleTemplate.includes('%s') ? form.titleTemplate.replace('%s', 'Dashboard') : form.titleTemplate) ||
    form.defaultTitle;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <Badge variant="neutral" className="bg-purple-50 text-purple-800 border-purple-200">
            <Settings className="w-3.5 h-3.5" />
            Pengaturan Platform Global
          </Badge>
        }
        title="SEO dan Meta Situs"
        description="Atur nama situs, judul tab, warna tema, dan favicon aplikasi. Pratinjau tautan landing page (WhatsApp, Facebook, X, Google) bersifat statis dan ditampilkan di sebelah kanan."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" variant="secondary" size="md" onClick={handleResetDefaults} leftIcon={<RotateCcw className="w-4 h-4" />} data-testid="seo-reset-defaults-btn">
              Kembalikan Bawaan
            </Button>
            <Button type="submit" form="seo-settings-form" variant="primary" size="md" loading={isSaving} leftIcon={<Save className="w-4 h-4" />} data-testid="seo-save-btn">
              Simpan Pengaturan
            </Button>
          </div>
        }
      />

      {formError && (
        <div role="alert" data-testid="seo-form-error" className="p-3.5 rounded-md bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}
      {formSuccess && (
        <div role="status" data-testid="seo-form-success" className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{formSuccess}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom kiri: pengaturan yang berlaku di aplikasi */}
        <form id="seo-settings-form" onSubmit={handleSave} className="lg:col-span-7 space-y-6" noValidate>
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Identitas & Judul Tab Aplikasi</h2>
              <p className="text-xs text-slate-500 mt-0.5">Berlaku di seluruh halaman aplikasi (/app, /dashboard, /platform/…).</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nama Situs"
                value={form.siteName}
                onChange={(e) => updateField('siteName', e.target.value)}
                data-testid="seo-input-site-name"
              />
              <Input
                label="Template Judul Tab (%s = nama halaman)"
                value={form.titleTemplate}
                onChange={(e) => updateField('titleTemplate', e.target.value)}
                helperText="Contoh: %s — Manajemen MTQ"
                data-testid="seo-input-title-template"
              />
            </div>
            <div className="space-y-1">
              <Input
                label="Judul Bawaan"
                value={form.defaultTitle}
                onChange={(e) => updateField('defaultTitle', e.target.value)}
                helperText="Dipakai bila halaman tidak memiliki nama khusus."
                data-testid="seo-input-default-title"
              />
              <p data-testid="seo-title-counter" className={`text-xs ${titleLen > 70 ? 'text-rose-700' : 'text-slate-500'}`}>
                {titleLen} / 70 karakter
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <Input
                label="Warna Tema (bilah alamat ponsel)"
                value={form.themeColor}
                onChange={(e) => updateField('themeColor', e.target.value)}
                placeholder="#06201F"
                data-testid="seo-input-theme-color"
              />
              <div className="flex items-center gap-2 h-10">
                <span className="w-8 h-8 rounded-md border border-slate-200" style={{ backgroundColor: isThemeColorValid ? form.themeColor : '#ffffff' }} aria-hidden="true" />
                <span className="text-xs text-slate-500">{isThemeColorValid ? 'Pratinjau warna' : 'Kode warna belum valid'}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4" data-testid="seo-favicon-section">
            <div>
              <h2 className="text-base font-bold text-slate-900">Favicon (Ikon Tab Peramban)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Masukkan path situs (mis. <code className="font-mono">/favicon.svg</code>) atau alamat gambar https://. Unggah berkas tidak didukung.
              </p>
            </div>
            <Input
              label="URL Favicon"
              value={form.faviconUrl}
              onChange={(e) => updateField('faviconUrl', e.target.value)}
              placeholder="/favicon.svg"
              data-testid="seo-input-favicon"
            />
            <div className="p-3 rounded-md bg-slate-100/80 border border-slate-200">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Pratinjau tab peramban</p>
              <div className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-t-md bg-white border border-slate-200 text-xs">
                <img
                  src={isFaviconValid ? form.faviconUrl : '/favicon.svg'}
                  alt="Pratinjau favicon"
                  className="w-4 h-4 object-contain shrink-0"
                  data-testid="seo-favicon-preview-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/favicon.svg';
                  }}
                />
                <span className="font-semibold text-slate-800 truncate max-w-xs">{previewTabTitle}</span>
                <span className="text-slate-400 font-bold ml-1">×</span>
              </div>
            </div>
          </Card>
        </form>

        {/* Kolom kanan: pratinjau tautan landing page (statis) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 space-y-4" data-testid="seo-landing-preview">
            <div className="flex items-start gap-2.5">
              <Share2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Pratinjau Tautan Landing Page</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tampilan saat tautan {LANDING_SEO.domain} dibagikan di WhatsApp, Facebook, atau X.</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
              <img
                src={LANDING_SEO.ogImagePath}
                alt="Gambar pratinjau tautan"
                width={LANDING_SEO.ogImageWidth}
                height={LANDING_SEO.ogImageHeight}
                className="block w-full h-auto"
              />
              <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-0.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{LANDING_SEO.domain}</p>
                <p className="text-sm font-semibold text-slate-900">{LANDING_SEO.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{LANDING_SEO.description}</p>
              </div>
            </div>

            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed flex gap-2">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="m-0 font-semibold">Bagian ini statis dan tidak bisa diubah dari dashboard.</p>
                <p className="m-0">
                  WhatsApp, Facebook, X, dan mesin pencari hanya membaca HTML awal (tidak menjalankan aplikasi). Untuk mengubahnya, ubah{' '}
                  <code className="font-mono">index.html</code>, <code className="font-mono">src/content/seo.ts</code>, dan gambar{' '}
                  <code className="font-mono">public/og-image.jpg</code> (1200×630, &lt; 300 KB), lalu deploy ulang.
                </p>
                <p className="m-0">Tautan yang sudah pernah dibagikan bisa tetap menampilkan pratinjau lama untuk sementara waktu karena disimpan oleh aplikasi tersebut.</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1.5">
              <p className="m-0 font-semibold text-slate-800 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5" /> Uji pratinjau
              </p>
              <ul className="m-0 pl-4 list-disc space-y-1">
                <li>
                  Facebook:{' '}
                  <a className="text-emerald-800 underline" href="https://developers.facebook.com/tools/debug/" target="_blank" rel="noopener noreferrer">
                    Sharing Debugger
                  </a>{' '}
                  (juga memperbarui pratinjau yang tersimpan).
                </li>
                <li>
                  Google:{' '}
                  <a className="text-emerald-800 underline" href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">
                    Rich Results Test
                  </a>
                  .
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
