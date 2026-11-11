import React, { useState, useEffect } from 'react';
import {
  Settings,
  Globe,
  Share2,
  Search,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Save,
  Image as ImageIcon,
  ExternalLink,
  Info,
  Upload,
  Sparkles
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from '../../types/mtq';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  ConfirmDialog
} from '../ui';

interface OgImageCheckState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  width: number;
  height: number;
  ratio: number;
  isWidthOk: boolean;
  isRatioOk: boolean;
}

export const SuperadminSettingsView: React.FC = () => {
  const { siteSettings, updateSiteSettings, addNotification } = useMtq();

  const [form, setForm] = useState<SiteSettings>(() => ({ ...siteSettings }));
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [showNoIndexConfirm, setShowNoIndexConfirm] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'google' | 'social' | 'twitter'>('google');

  const [ogImageCheck, setOgImageCheck] = useState<OgImageCheckState>({
    status: 'idle',
    width: 0,
    height: 0,
    ratio: 0,
    isWidthOk: false,
    isRatioOk: false
  });

  useEffect(() => {
    setForm({ ...siteSettings });
  }, [siteSettings]);

  // Periksa dimensi asli gambar Open Graph secara otomatis ketika URL berubah
  useEffect(() => {
    const url = form.ogImageUrl.trim();
    if (!url || !/^https:\/\//.test(url)) {
      setOgImageCheck({
        status: 'idle',
        width: 0,
        height: 0,
        ratio: 0,
        isWidthOk: false,
        isRatioOk: false
      });
      return;
    }

    let cancelled = false;
    setOgImageCheck((prev) => ({ ...prev, status: 'loading' }));

    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      const r = h > 0 ? Number((w / h).toFixed(2)) : 0;
      const isWidthOk = w >= 1200;
      const isRatioOk = Math.abs(r - 1.91) <= 0.08;
      setOgImageCheck({
        status: 'loaded',
        width: w,
        height: h,
        ratio: r,
        isWidthOk,
        isRatioOk
      });
    };
    img.onerror = () => {
      if (cancelled) return;
      try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/icons/') || parsed.pathname.endsWith('.svg') || parsed.pathname.endsWith('.png')) {
          const fallbackImg = new window.Image();
          fallbackImg.onload = () => {
            if (cancelled) return;
            const w = fallbackImg.naturalWidth || 512;
            const h = fallbackImg.naturalHeight || 512;
            const r = h > 0 ? Number((w / h).toFixed(2)) : 1;
            setOgImageCheck({
              status: 'loaded',
              width: w,
              height: h,
              ratio: r,
              isWidthOk: w >= 1200,
              isRatioOk: Math.abs(r - 1.91) <= 0.08
            });
          };
          fallbackImg.onerror = () => {
            if (cancelled) return;
            setOgImageCheck({
              status: 'error',
              width: 0,
              height: 0,
              ratio: 0,
              isWidthOk: false,
              isRatioOk: false
            });
          };
          fallbackImg.src = parsed.pathname;
          return;
        }
      } catch {
        // Ignore URL parse error
      }
      setOgImageCheck({
        status: 'error',
        width: 0,
        height: 0,
        ratio: 0,
        isWidthOk: false,
        isRatioOk: false
      });
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [form.ogImageUrl]);

  const titleLen = form.defaultTitle.trim().length;
  const descLen = form.metaDescription.trim().length;

  const isTitleIdeal = titleLen > 0 && titleLen <= 60;
  const isTitleWarning = titleLen > 60 && titleLen <= 70;
  const isTitleError = titleLen > 70;

  const isDescIdeal = descLen >= 120 && descLen <= 160;
  const isDescWarning = (descLen > 0 && descLen < 120) || (descLen > 160 && descLen <= 200);
  const isDescError = descLen > 200;

  const isCanonicalValid = /^https:\/\//.test(form.canonicalUrl.trim());
  const isOgImageHttpsValid = /^https:\/\//.test(form.ogImageUrl.trim());

  const updateField = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setFormError(null);
    setFormSuccess(null);
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const executeSave = async () => {
    setShowNoIndexConfirm(false);
    setFormError(null);
    setFormSuccess(null);

    if (!form.defaultTitle.trim()) {
      setFormError('Judul Bawaan (Default Title) wajib diisi.');
      return;
    }
    if (titleLen > 70) {
      setFormError('Judul Bawaan maksimal 70 karakter (batas validasi database).');
      return;
    }
    if (!form.metaDescription.trim()) {
      setFormError('Deskripsi Meta wajib diisi.');
      return;
    }
    if (descLen > 200) {
      setFormError('Deskripsi Meta maksimal 200 karakter (batas validasi database).');
      return;
    }
    if (!isCanonicalValid) {
      setFormError('Canonical URL wajib diawali dengan protokol aman https://');
      return;
    }
    if (!isOgImageHttpsValid) {
      setFormError('URL Gambar Open Graph wajib diawali dengan protokol aman https://');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateSiteSettings(form);
      if (!res.success) {
        setFormError(res.message);
        addNotification({
          title: 'Gagal Menyimpan Pengaturan SEO',
          message: res.message,
          type: 'error',
          module: 'Superadmin SEO'
        });
      } else {
        setFormSuccess(res.message);
        addNotification({
          title: 'Pengaturan SEO & Meta Diperbarui',
          message: res.message,
          type: 'success',
          module: 'Superadmin SEO'
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.robots === 'noindex,nofollow') {
      setShowNoIndexConfirm(true);
      return;
    }
    void executeSave();
  };

  const handleResetDefaults = () => {
    setForm({ ...DEFAULT_SITE_SETTINGS });
    setFormError(null);
    setFormSuccess('Nilai formulir dikembalikan ke bawaan. Klik "Simpan Pengaturan" untuk menerapkan.');
  };

  const resolvedDomain = (() => {
    try {
      return new URL(form.canonicalUrl.trim()).hostname;
    } catch {
      return 'mtq.id';
    }
  })();

  const resolvedPreviewImageSrc = (() => {
    try {
      const u = new URL(form.ogImageUrl.trim());
      if (u.hostname === 'mtq.id' && u.pathname.startsWith('/icons/')) {
        return u.pathname;
      }
      return form.ogImageUrl.trim();
    } catch {
      return '/icons/icon-512x512.png';
    }
  })();

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
        description="Kelola favicon, judul situs, meta deskripsi, kartu pratinjau tautan (Open Graph & X/Twitter), serta verifikasi Google Search Console. Setiap perubahan tersinkronisasi dan tercatat di Audit Log Platform."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleResetDefaults}
              data-testid="seo-reset-defaults-btn"
            >
              <RotateCcw className="w-4 h-4" />
              Kembalikan Bawaan
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSaveClick}
              loading={isSaving}
              className="bg-purple-700 hover:bg-purple-800 border-purple-700"
              data-testid="seo-save-btn"
            >
              <Save className="w-4 h-4" />
              Simpan Pengaturan
            </Button>
          </div>
        }
      />

      {formError && (
        <div
          role="alert"
          data-testid="seo-form-error"
          className="p-4 rounded-[var(--radius-md)] bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Validasi Pengaturan SEO Gagal</p>
            <p className="mt-0.5 text-xs text-rose-700">{formError}</p>
          </div>
        </div>
      )}

      {formSuccess && (
        <div
          role="status"
          data-testid="seo-form-success"
          className="p-4 rounded-[var(--radius-md)] bg-purple-50 border border-purple-200 text-purple-900 text-sm flex items-start gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Berhasil</p>
            <p className="mt-0.5 text-xs text-purple-800">{formSuccess}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSaveClick} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Formulir Terkelompok (7 kolom) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Seksi Umum */}
          <Card className="space-y-4 border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">1. Pengaturan Umum & Mesin Pencari</h2>
                  <p className="text-xs text-slate-500">
                    Judul utama, template per halaman, deskripsi pencarian, dan direktif indeksasi.
                  </p>
                </div>
              </div>
              <Badge variant={form.robots === 'index,follow' ? 'success' : 'warning'}>
                {form.robots}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nama Situs (Site Name)"
                value={form.siteName}
                onChange={(e) => updateField('siteName', e.target.value)}
                placeholder="Manajemen MTQ"
                data-testid="seo-input-site-name"
              />
              <Input
                label="Template Judul Halaman (%s = nama halaman)"
                value={form.titleTemplate}
                onChange={(e) => updateField('titleTemplate', e.target.value)}
                placeholder="%s — Manajemen MTQ"
                helperText="Dipakai otomatis saat berpindah halaman di dalam aplikasi."
                data-testid="seo-input-title-template"
              />
            </div>

            {/* Default Title + Penghitung Karakter */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="seo-default-title" className="text-xs font-bold text-slate-700">
                  Judul Bawaan (Default Title)
                </label>
                <span
                  data-testid="seo-title-counter"
                  className={`text-xs font-mono tabular-nums font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] ${
                    isTitleError
                      ? 'bg-rose-100 text-rose-700'
                      : isTitleWarning
                      ? 'bg-amber-100 text-amber-800'
                      : isTitleIdeal
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {titleLen} / 70 karakter {isTitleIdeal ? '(Ideal ≤ 60)' : isTitleWarning ? '(Melebihi ideal 60)' : ''}
                </span>
              </div>
              <Input
                id="seo-default-title"
                value={form.defaultTitle}
                onChange={(e) => updateField('defaultTitle', e.target.value)}
                placeholder="Manajemen MTQ — Musabaqah Digital"
                data-testid="seo-input-default-title"
              />
              {isTitleWarning && (
                <p data-testid="seo-title-warning" className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Judul melebihi 60 karakter dan berpotensi terpotong pada tampilan hasil Google.
                </p>
              )}
              {isTitleError && (
                <p className="text-xs text-rose-600 font-medium">
                  Judul tidak boleh melebihi 70 karakter (dibatasi oleh database).
                </p>
              )}
            </div>

            {/* Meta Description + Penghitung Karakter */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="seo-meta-description" className="text-xs font-bold text-slate-700">
                  Deskripsi Meta (Meta Description)
                </label>
                <span
                  data-testid="seo-description-counter"
                  className={`text-xs font-mono tabular-nums font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] ${
                    isDescError
                      ? 'bg-rose-100 text-rose-700'
                      : isDescIdeal
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {descLen} / 200 karakter {isDescIdeal ? '(Ideal 120–160)' : '(Ideal: 120–160)'}
                </span>
              </div>
              <Textarea
                id="seo-meta-description"
                rows={3}
                value={form.metaDescription}
                onChange={(e) => updateField('metaDescription', e.target.value)}
                placeholder="Ringkasan singkat manfaat dan fungsi platform Manajemen MTQ..."
                data-testid="seo-input-meta-description"
              />
              {isDescWarning && (
                <p data-testid="seo-description-warning" className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {descLen < 120
                    ? 'Deskripsi kurang dari 120 karakter. Tambahkan informasi agar cuplikan Google lebih informatif.'
                    : 'Deskripsi melebihi 160 karakter dan dapat terpotong di hasil pencarian.'}
                </p>
              )}
              {isDescError && (
                <p className="text-xs text-rose-600 font-medium">
                  Deskripsi tidak boleh melebihi 200 karakter (dibatasi oleh database).
                </p>
              )}
            </div>

            <Input
              label="Kata Kunci (Meta Keywords)"
              value={form.metaKeywords}
              onChange={(e) => updateField('metaKeywords', e.target.value)}
              placeholder="MTQ, STQ, LPTQ, Musabaqah Tilawatil Quran, E-Scoring MTQ"
              helperText="Pisahkan setiap kata kunci dengan tanda koma."
              data-testid="seo-input-keywords"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Canonical URL (Wajib https://)"
                value={form.canonicalUrl}
                onChange={(e) => updateField('canonicalUrl', e.target.value)}
                placeholder="https://mtq.id"
                error={form.canonicalUrl && !isCanonicalValid ? 'Wajib diawali https://' : undefined}
                containerClassName="sm:col-span-1"
                data-testid="seo-input-canonical"
              />
              <Select
                label="Direktif Robots (Halaman Publik /)"
                value={form.robots}
                onChange={(e) =>
                  updateField('robots', e.target.value as 'index,follow' | 'noindex,nofollow')
                }
                containerClassName="sm:col-span-1"
                data-testid="seo-select-robots"
              >
                <option value="index,follow">index,follow (Izinkan Indeks)</option>
                <option value="noindex,nofollow">noindex,nofollow (Blokir Indeks)</option>
              </Select>
              <Input
                label="Warna Tema (Theme Color)"
                value={form.themeColor}
                onChange={(e) => updateField('themeColor', e.target.value)}
                placeholder="#065f46"
                containerClassName="sm:col-span-1"
                data-testid="seo-input-theme-color"
              />
            </div>

            {/* Pengaturan Favicon Situs (URL & File Upload) */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Favicon & Ikon Tab Peramban
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ikon yang tampil di tab browser, bookmark, dan daftar pintasan. Masukkan URL gambar atau unggah file ikon (.ico, .png, .svg).
                  </p>
                </div>
                <Badge variant="neutral" className="bg-purple-50 text-purple-800 border-purple-200">
                  Ikon Tab Browser
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-8">
                  <Input
                    label="URL Favicon atau Data URI"
                    value={form.faviconUrl}
                    onChange={(e) => updateField('faviconUrl', e.target.value)}
                    placeholder="/icon.svg atau https://..."
                    helperText="Mendukung path lokal (mis. /icon.svg), tautan https://, atau file gambar langsung."
                    data-testid="seo-input-favicon"
                  />
                </div>

                <div className="sm:col-span-4 flex flex-col justify-end pt-5 sm:pt-0">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Unggah File Ikon
                  </label>
                  <label
                    className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-md border border-dashed border-purple-300 bg-purple-50/50 hover:bg-purple-100/70 text-purple-800 text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                    title="Pilih file ikon (.ico, .png, .svg) dari komputer Anda"
                  >
                    <Upload className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>Pilih Berkas Ikon</span>
                    <input
                      type="file"
                      accept=".ico,.png,.svg,image/x-icon,image/png,image/svg+xml"
                      className="hidden"
                      data-testid="seo-favicon-file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 512 * 1024) {
                          setFormError('Ukuran file favicon maksimal 512 KB.');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const result = event.target?.result as string;
                          if (result) {
                            updateField('faviconUrl', result);
                            setFormSuccess('File favicon berhasil diunggah dan siap disimpan.');
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Pratinjau Tab Browser Mini untuk Favicon */}
              <div className="p-3 rounded-md bg-slate-100/80 border border-slate-200 space-y-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Pratinjau Tab Peramban (Browser Tab Preview)
                </p>
                <div className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-t-md bg-white border border-slate-200 shadow-xs text-xs">
                  <div className="w-4 h-4 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={form.faviconUrl || '/icon.svg'}
                      alt="Favicon Preview"
                      className="w-4 h-4 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/icon.svg';
                      }}
                    />
                  </div>
                  <span className="font-semibold text-slate-800 truncate max-w-xs sm:max-w-md">
                    {form.defaultTitle || 'Manajemen MTQ — Musabaqah Digital'}
                  </span>
                  <span className="text-slate-400 text-xs ml-1 font-bold">×</span>
                </div>
              </div>
            </div>
          </Card>

          {/* 2. Seksi Open Graph */}
          <Card className="space-y-4 border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    2. Open Graph (WhatsApp, Facebook, Telegram)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Mengatur tampilan kartu saat tautan situs dibagikan di aplikasi pesan dan media sosial.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateField('ogTitle', form.defaultTitle);
                  updateField('ogDescription', form.metaDescription);
                }}
              >
                Salin dari Umum
              </Button>
            </div>

            <Input
              label="Judul Open Graph (og:title)"
              value={form.ogTitle}
              onChange={(e) => updateField('ogTitle', e.target.value)}
              placeholder="Manajemen MTQ — Musabaqah Digital"
              data-testid="seo-input-og-title"
            />

            <Textarea
              label="Deskripsi Open Graph (og:description)"
              rows={2}
              value={form.ogDescription}
              onChange={(e) => updateField('ogDescription', e.target.value)}
              placeholder="Platform manajemen MTQ multi-tenant..."
              data-testid="seo-input-og-description"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="URL Gambar Open Graph (og:image — Wajib https://)"
                value={form.ogImageUrl}
                onChange={(e) => updateField('ogImageUrl', e.target.value)}
                placeholder="https://mtq.id/og-banner-1200x630.png"
                error={form.ogImageUrl && !isOgImageHttpsValid ? 'Wajib diawali https://' : undefined}
                data-testid="seo-input-og-image"
              />
              <Input
                label="Teks Alternatif Gambar (og:image:alt)"
                value={form.ogImageAlt}
                onChange={(e) => updateField('ogImageAlt', e.target.value)}
                placeholder="Logo dan Antarmuka Manajemen MTQ Digital"
                data-testid="seo-input-og-image-alt"
              />
            </div>

            {/* Panel Pemeriksaan Dimensi & Rasio Gambar OG */}
            <div
              data-testid="seo-og-image-check-box"
              className={`p-3.5 rounded-[var(--radius-md)] border text-xs space-y-1.5 ${
                ogImageCheck.status === 'loaded' && ogImageCheck.isWidthOk && ogImageCheck.isRatioOk
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  Pemeriksaan Ukuran & Rasio Gambar Open Graph (Rekomendasi: 1200×630px, Rasio ±1.91:1)
                </span>
                {ogImageCheck.status === 'loaded' && (
                  <span className="font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-white/80 border border-current/20">
                    {ogImageCheck.width} × {ogImageCheck.height} px ({ogImageCheck.ratio}:1)
                  </span>
                )}
              </div>

              {ogImageCheck.status === 'loading' && (
                <p className="text-slate-600">Memeriksa dimensi asli gambar...</p>
              )}

              {ogImageCheck.status === 'loaded' && (
                <div className="space-y-1">
                  {(!ogImageCheck.isWidthOk || !ogImageCheck.isRatioOk) ? (
                    <p data-testid="seo-og-image-warning" className="flex items-start gap-1.5 text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <span>
                        Peringatan Gambar OG:{' '}
                        {!ogImageCheck.isWidthOk &&
                          `Lebar gambar (${ogImageCheck.width}px) di bawah standar 1200px. `}
                        {!ogImageCheck.isRatioOk &&
                          `Rasio aspek (${ogImageCheck.ratio}:1) bukan ±1.91:1 (standar 1200×630) sehingga gambar berisiko terpotong pada kartu WhatsApp/Facebook.`}
                      </span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-emerald-800 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      Ukuran dan rasio gambar OG memenuhi standar optimal 1200×630px (±1.91:1).
                    </p>
                  )}
                </div>
              )}

              {ogImageCheck.status === 'error' && (
                <p data-testid="seo-og-image-warning" className="flex items-start gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Gambar belum dapat dimuat langsung oleh peramban dari URL tersebut. Pastikan URL dapat diakses publik oleh crawler WhatsApp/Facebook dan berukuran minimal 1200×630px (rasio 1.91:1).
                  </span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Tipe Open Graph (og:type)"
                value={form.ogType}
                onChange={(e) => updateField('ogType', e.target.value)}
                placeholder="website"
                data-testid="seo-input-og-type"
              />
              <Input
                label="Lokalisasi (og:locale)"
                value={form.ogLocale}
                onChange={(e) => updateField('ogLocale', e.target.value)}
                placeholder="id_ID"
                data-testid="seo-input-og-locale"
              />
            </div>
          </Card>

          {/* 3. Seksi Twitter / X & 4. Verifikasi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="space-y-4 border-slate-200">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">3. Kartu Twitter / X</h2>
                  <p className="text-xs text-slate-500">Format tampilan tautan di X.</p>
                </div>
              </div>

              <Select
                label="Tipe Kartu (twitter:card)"
                value={form.twitterCard}
                onChange={(e) =>
                  updateField('twitterCard', e.target.value as 'summary_large_image' | 'summary')
                }
                data-testid="seo-select-twitter-card"
              >
                <option value="summary_large_image">summary_large_image (Gambar Besar)</option>
                <option value="summary">summary (Gambar Kecil Persegi)</option>
              </Select>

              <Input
                label="Akun Situs (twitter:site)"
                value={form.twitterSite}
                onChange={(e) => updateField('twitterSite', e.target.value)}
                placeholder="@lptq_id"
                data-testid="seo-input-twitter-site"
              />
            </Card>

            <Card className="space-y-4 border-slate-200">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-purple-100 text-purple-700 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">4. Verifikasi Pencarian</h2>
                  <p className="text-xs text-slate-500">Kepemilikan Google Search Console.</p>
                </div>
              </div>

              <Input
                label="Kode Verifikasi Google (google-site-verification)"
                value={form.googleSiteVerification}
                onChange={(e) => updateField('googleSiteVerification', e.target.value)}
                placeholder="Masukkan token content verifikasi..."
                helperText="Kosongkan bila verifikasi dilakukan melalui DNS TXT."
                data-testid="seo-input-google-verification"
              />

              <div className="p-3 rounded-[var(--radius-sm)] bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Terakhir Diperbarui:</p>
                <p className="font-mono tabular-nums">{form.updatedAt}</p>
              </div>
            </Card>
          </div>
        </div>

        {/* Kolom Kanan: Pratinjau Langsung (5 kolom) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-20">
          <Card className="space-y-4 border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Pratinjau Langsung (Live Preview)</h2>
                <p className="text-xs text-slate-500">
                  Simulasi real-time di Google, WhatsApp/Facebook, dan X.
                </p>
              </div>
              <Badge variant="neutral" className="bg-purple-50 text-purple-800 border-purple-200">
                Real-Time
              </Badge>
            </div>

            {/* Pemilih Tab Pratinjau */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-[var(--radius-md)]">
              <button
                type="button"
                onClick={() => setActivePreviewTab('google')}
                data-testid="seo-preview-tab-google"
                className={`py-2 px-3 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
                  activePreviewTab === 'google'
                    ? 'bg-white text-purple-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hasil Google
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewTab('social')}
                data-testid="seo-preview-tab-social"
                className={`py-2 px-3 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
                  activePreviewTab === 'social'
                    ? 'bg-white text-purple-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                WhatsApp / FB
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewTab('twitter')}
                data-testid="seo-preview-tab-twitter"
                className={`py-2 px-3 rounded-[var(--radius-sm)] text-xs font-semibold transition-colors ${
                  activePreviewTab === 'twitter'
                    ? 'bg-white text-purple-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kartu X
              </button>
            </div>

            {/* 1. Kartu Pratinjau Google Search */}
            <div
              data-testid="seo-preview-google-card"
              className={`p-4 rounded-[var(--radius-md)] bg-white border border-slate-200 space-y-1.5 ${
                activePreviewTab === 'google' ? 'ring-2 ring-purple-500/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pratinjau Pencarian Google
                </span>
                {form.robots === 'noindex,nofollow' && (
                  <Badge variant="danger">
                    Tidak Diindeks (noindex)
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div className="w-6 h-6 rounded-full bg-emerald-800 text-amber-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                  M
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">
                    {form.siteName || 'Manajemen MTQ'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {form.canonicalUrl || 'https://mtq.id'}
                  </p>
                </div>
              </div>
              <p className="text-base font-medium text-[#1a0dab] leading-snug line-clamp-1 pt-0.5">
                {form.defaultTitle || 'Manajemen MTQ — Musabaqah Digital'}
              </p>
              <p className="text-xs text-[#4d5156] leading-relaxed line-clamp-2">
                {form.metaDescription ||
                  'Platform manajemen MTQ multi-tenant dengan penilaian digital dewan hakim.'}
              </p>
            </div>

            {/* 2. Kartu Pratinjau WhatsApp / Facebook (1200x630 / 1.91:1) */}
            <div
              data-testid="seo-preview-social-card"
              className={`rounded-[var(--radius-md)] overflow-hidden bg-slate-50 border border-slate-200 ${
                activePreviewTab === 'social' ? 'ring-2 ring-purple-500/20' : ''
              }`}
            >
              <div className="px-3.5 py-2 bg-white border-b border-slate-200 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pratinjau WhatsApp & Facebook (1200×630)
                </span>
                <span className="text-[11px] font-mono text-slate-500">1.91:1</span>
              </div>
              <div className="aspect-[1.91/1] w-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 relative overflow-hidden flex items-center justify-center">
                <img
                  src={resolvedPreviewImageSrc}
                  alt={form.ogImageAlt || 'Pratinjau Gambar Open Graph'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono">
                  1200 × 630
                </div>
              </div>
              <div className="p-3.5 space-y-1 bg-[#f0f2f5]">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 truncate">
                  {resolvedDomain}
                </p>
                <p className="text-sm font-bold text-slate-900 line-clamp-1">
                  {form.ogTitle || form.defaultTitle || 'Manajemen MTQ — Musabaqah Digital'}
                </p>
                <p className="text-xs text-slate-600 line-clamp-2">
                  {form.ogDescription || form.metaDescription}
                </p>
              </div>
            </div>

            {/* 3. Kartu Pratinjau X (Twitter) */}
            <div
              data-testid="seo-preview-twitter-card"
              className={`p-3.5 rounded-[var(--radius-md)] bg-white border border-slate-200 space-y-2.5 ${
                activePreviewTab === 'twitter' ? 'ring-2 ring-purple-500/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pratinjau Kartu X ({form.twitterCard})
                </span>
                <span className="text-xs font-mono text-slate-500">{form.twitterSite || '@lptq_id'}</span>
              </div>

              {form.twitterCard === 'summary_large_image' ? (
                <div className="rounded-[var(--radius-sm)] overflow-hidden border border-slate-200">
                  <div className="aspect-[1.91/1] bg-emerald-900 relative flex items-center justify-center overflow-hidden">
                    <img
                      src={resolvedPreviewImageSrc}
                      alt={form.ogImageAlt || 'Pratinjau Kartu X'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-white text-[11px] font-medium">
                      {resolvedDomain}
                    </div>
                  </div>
                  <div className="p-3 bg-white space-y-0.5">
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">
                      {form.ogTitle || form.defaultTitle}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {form.ogDescription || form.metaDescription}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-stretch rounded-[var(--radius-sm)] overflow-hidden border border-slate-200">
                  <div className="w-24 bg-emerald-900 shrink-0 flex items-center justify-center overflow-hidden">
                    <img
                      src={resolvedPreviewImageSrc}
                      alt={form.ogImageAlt || 'Pratinjau Kartu X'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 bg-white min-w-0 flex-1 space-y-0.5">
                    <p className="text-[11px] text-slate-400 truncate">{resolvedDomain}</p>
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">
                      {form.ogTitle || form.defaultTitle}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {form.ogDescription || form.metaDescription}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Panduan Pengujian Crawler Eksternal */}
            <div className="p-3.5 rounded-[var(--radius-md)] bg-purple-50/70 border border-purple-200 text-xs text-purple-950 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-purple-900">
                <Info className="w-4 h-4 shrink-0 text-purple-700" />
                Arsitektur SEO & Sinkronisasi Metadata
              </p>
              <p className="text-purple-800 leading-relaxed">
                Pengaturan SEO, favicon, dan tag Open Graph disinkronisasikan secara dinamis pada aplikasi SPA melalui{' '}
                <code className="font-mono">useDocumentMeta</code> hook serta tersimpan secara permanen pada database Supabase tabel{' '}
                <code className="font-mono">public.site_settings</code>.
              </p>
              <div className="pt-1 flex flex-wrap gap-3 text-[11px] font-semibold text-purple-700">
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Facebook Sharing Debugger
                </span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Pratinjau Tautan WhatsApp
                </span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Google Rich Results Test
                </span>
              </div>
            </div>
          </Card>
        </div>
      </form>

      {/* Dialog Konfirmasi ketika memilih noindex,nofollow */}
      <ConfirmDialog
        isOpen={showNoIndexConfirm}
        onClose={() => setShowNoIndexConfirm(false)}
        onConfirm={() => void executeSave()}
        title="Konfirmasi Menonaktifkan Indeksasi Mesin Pencari (noindex)"
        description="Anda memilih direktif 'noindex,nofollow'. Halaman utama publik (/) tidak akan diindeks oleh Google maupun mesin pencari lainnya hingga Anda mengembalikannya ke 'index,follow'. Apakah Anda yakin ingin menyimpan pengaturan ini?"
        confirmLabel="Ya, Simpan dengan noindex"
        cancelLabel="Batal"
        variant="warning"
        isLoading={isSaving}
      />
    </div>
  );
};
