import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  LayoutTemplate,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  ExternalLink,
  History,
  Eye,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { supabaseDataService } from '../../services/supabaseDataService';
import { mapSitePageRow } from '../../services/publicContent';
import {
  LANDING_IMAGE_KEYS,
  LANDING_LOCKED_KEYS,
  LandingContent,
  isSafeImageUrl,
  landingContent as DEFAULT_LANDING,
  mergeLandingContent
} from '../../content/landing';
import { SitePage, SitePageCategory, findDefaultPage, mergeWithDefaultPages, pageHref } from '../../content/defaultPages';
import { MarkdownView } from '../../lib/markdown';
import { PageHeader, Card, Button, Input, Select, Textarea, Badge, Tabs, ConfirmDialog } from '../ui';

/* ================================================================== */
/*  Label & bantuan untuk setiap field konten landing page             */
/* ================================================================== */

const LABELS: Record<string, string> = {
  brand: 'Identitas',
  name: 'Nama',
  tagline: 'Tagline',
  hero: 'Bagian Utama (Hero)',
  chip: 'Label kecil',
  title: 'Judul',
  subtitle: 'Subjudul',
  primaryCta: 'Teks tombol utama',
  secondaryCta: 'Teks tombol kedua',
  highlights: 'Poin centang (satu per baris)',
  backgroundImage: 'Gambar latar',
  background: 'Latar Belakang',
  body: 'Teks',
  cards: 'Kartu',
  image: 'Gambar',
  imageAlt: 'Teks alternatif gambar (untuk pembaca layar)',
  imagePosition: 'Posisi gambar (CSS, mis. 50% 50%)',
  roles: 'Pengguna',
  backdrop: 'Gambar latar',
  items: 'Daftar',
  steps: 'Tahapan',
  features: 'Fitur',
  integrity: 'Integritas',
  points: 'Poin (satu per baris)',
  logImage: 'Gambar log aktivitas',
  logImageAlt: 'Teks alternatif gambar log',
  logWindowTitle: 'Judul jendela log',
  lockBadgeTitle: 'Judul lencana terkunci',
  lockBadgeBody: 'Keterangan lencana terkunci',
  faq: 'Tanya Jawab',
  question: 'Pertanyaan',
  answer: 'Jawaban',
  contactPrompt: 'Ajakan kontak',
  cta: 'Ajakan Akhir',
  primary: 'Teks tombol utama',
  secondary: 'Teks tombol kedua',
  footer: 'Footer',
  about: 'Tentang',
  copyright: 'Teks hak cipta',
  contact: 'Kontak',
  address: 'Alamat',
  email: 'Email',
  whatsappNumber: 'Nomor WhatsApp (format 62…, tanpa +)',
  whatsappDisplay: 'Nomor WhatsApp yang ditampilkan',
  whatsappMessage: 'Pesan pembuka WhatsApp'
};

const LONG_TEXT_KEYS = new Set(['subtitle', 'body', 'answer', 'about', 'whatsappMessage']);
const label = (key: string) => LABELS[key] || key;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Path = Array<string | number>;

const isObj = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

const getAt = (obj: unknown, path: Path): unknown => path.reduce<unknown>((acc, key) => (acc as any)?.[key as any], obj);

function setAt<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[head as number] = setAt(copy[head as number], rest, value);
    return copy as unknown as T;
  }
  const base = (isObj(obj) ? obj : {}) as Record<string, unknown>;
  return { ...base, [head]: setAt(base[head as string], rest, value) } as T;
}

/** Salinan isi untuk diedit: gambar yang tidak diatur Superadmin dikosongkan (artinya: pakai bawaan). */
function buildEditableDraft(override: Record<string, unknown>): LandingContent {
  const merged = mergeLandingContent(override);
  const walk = (node: unknown, ov: unknown): unknown => {
    if (Array.isArray(node)) return node.map((item, i) => walk(item, Array.isArray(ov) ? ov[i] : undefined));
    if (isObj(node)) {
      const out: Record<string, unknown> = {};
      Object.keys(node).forEach((key) => {
        const ovVal = isObj(ov) ? (ov as Record<string, unknown>)[key] : undefined;
        out[key] = LANDING_IMAGE_KEYS.has(key) ? (isSafeImageUrl(ovVal) ? ovVal : '') : walk(node[key], ovVal);
      });
      return out;
    }
    return node;
  };
  return walk(merged, override) as LandingContent;
}

/** Template item baru untuk sebuah daftar: struktur sama dengan item bawaan pertama, nilainya kosong. */
function emptyLike(sample: unknown): unknown {
  if (typeof sample === 'string') return '';
  if (Array.isArray(sample)) return [];
  if (isObj(sample)) {
    const out: Record<string, unknown> = {};
    Object.keys(sample).forEach((k) => (out[k] = emptyLike(sample[k])));
    return out;
  }
  return sample;
}

/** Nilai bawaan pada path yang sama (dipakai untuk placeholder & pratinjau gambar bawaan). */
const defaultAt = (path: Path): unknown => {
  const exact = getAt(DEFAULT_LANDING, path);
  if (exact !== undefined) return exact;
  // Item baru di luar jumlah bawaan: pakai item pertama sebagai acuan
  const idx = path.findIndex((p) => typeof p === 'number');
  if (idx >= 0) return getAt(DEFAULT_LANDING, [...path.slice(0, idx), 0, ...path.slice(idx + 1)]);
  return undefined;
};

function collectErrors(node: unknown, path: Path, errors: string[]) {
  if (Array.isArray(node)) node.forEach((item, i) => collectErrors(item, [...path, i], errors));
  else if (isObj(node)) {
    Object.keys(node).forEach((key) => {
      const v = node[key];
      if (LANDING_IMAGE_KEYS.has(key) && typeof v === 'string' && v.trim() && !isSafeImageUrl(v)) {
        errors.push(`${path.map(String).join(' › ')} › ${label(key)}: URL gambar harus diawali https:// atau / (path situs).`);
      }
      collectErrors(v, [...path, key], errors);
    });
  }
}

/* ================================================================== */
/*  Editor konten landing page                                         */
/* ================================================================== */

const ImageField: React.FC<{ path: Path; value: string; onChange: (v: string) => void; fieldKey: string }> = ({
  path,
  value,
  onChange,
  fieldKey
}) => {
  const fallback = String(defaultAt(path) || '');
  const invalid = value.trim() !== '' && !isSafeImageUrl(value);
  const preview = value.trim() && !invalid ? value.trim() : fallback;
  return (
    <div className="space-y-2">
      <Input
        label={label(fieldKey)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Kosongkan untuk memakai bawaan: ${fallback}`}
        error={invalid ? 'URL harus diawali https:// atau / (path situs).' : undefined}
        helperText="Masukkan URL gambar (resolusi tinggi, sebaiknya WebP/JPG). Kosongkan untuk memakai gambar bawaan."
      />
      <div className="flex items-center gap-3">
        <img
          src={preview}
          alt=""
          className="h-16 w-28 rounded-md border border-slate-200 bg-slate-50 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
          }}
        />
        <span className="text-xs text-slate-500">{value.trim() && !invalid ? 'Gambar dari URL Anda' : 'Gambar bawaan'}</span>
      </div>
    </div>
  );
};

const FieldNode: React.FC<{
  node: unknown;
  path: Path;
  fieldKey: string;
  onChange: (path: Path, value: unknown) => void;
}> = ({ node, path, fieldKey, onChange }) => {
  if (LANDING_LOCKED_KEYS.has(fieldKey)) return null;

  if (LANDING_IMAGE_KEYS.has(fieldKey)) {
    return <ImageField path={path} fieldKey={fieldKey} value={String(node ?? '')} onChange={(v) => onChange(path, v)} />;
  }
  if (typeof node === 'string') {
    const placeholder = String(defaultAt(path) ?? '');
    return LONG_TEXT_KEYS.has(fieldKey) ? (
      <Textarea label={label(fieldKey)} value={node} rows={3} placeholder={placeholder} onChange={(e) => onChange(path, e.target.value)} />
    ) : (
      <Input label={label(fieldKey)} value={node} placeholder={placeholder} onChange={(e) => onChange(path, e.target.value)} />
    );
  }
  if (Array.isArray(node) && node.every((v) => typeof v === 'string')) {
    return (
      <Textarea
        label={label(fieldKey)}
        value={(node as string[]).join('\n')}
        rows={Math.max(3, node.length + 1)}
        onChange={(e) => onChange(path, e.target.value.split('\n'))}
        helperText="Satu poin per baris. Baris kosong diabaikan."
      />
    );
  }
  if (Array.isArray(node)) {
    const template = (getAt(DEFAULT_LANDING, path) as unknown[] | undefined)?.[0] ?? node[0];
    return (
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">{label(fieldKey)}</legend>
        {node.map((item, idx) => (
          <div key={idx} className="space-y-3 rounded-md border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">
                {label(fieldKey)} #{idx + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"
                  disabled={idx === 0}
                  aria-label="Pindah ke atas"
                  onClick={() => {
                    const copy = [...node];
                    [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                    onChange(path, copy);
                  }}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30"
                  disabled={idx === node.length - 1}
                  aria-label="Pindah ke bawah"
                  onClick={() => {
                    const copy = [...node];
                    [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
                    onChange(path, copy);
                  }}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus item"
                  onClick={() => onChange(path, node.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {isObj(item) &&
              Object.keys(item).map((k) => <FieldNode key={k} node={item[k]} path={[...path, idx, k]} fieldKey={k} onChange={onChange} />)}
          </div>
        ))}
        <Button type="button" size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange(path, [...node, emptyLike(template)])}>
          Tambah {label(fieldKey).toLowerCase()}
        </Button>
      </fieldset>
    );
  }
  if (isObj(node)) {
    return (
      <div className="space-y-3">
        {Object.keys(node).map((k) => (
          <FieldNode key={k} node={node[k]} path={[...path, k]} fieldKey={k} onChange={onChange} />
        ))}
      </div>
    );
  }
  return null;
};

const LandingEditor: React.FC<{ canSave: boolean }> = ({ canSave }) => {
  const { addNotification } = useMtq();
  const [draft, setDraft] = useState<LandingContent>(() => buildEditableDraft({}));
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [openSection, setOpenSection] = useState<string>('hero');

  useEffect(() => {
    let cancelled = false;
    void supabaseDataService.fetchSiteContentAdmin('landing').then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setDraft(buildEditableDraft(res.data.content));
        setUpdatedAt(res.data.updatedAt);
      } else {
        setMessage({ type: 'info', text: res.message });
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback((path: Path, value: unknown) => {
    setMessage(null);
    setDraft((prev) => setAt(prev, path, value));
  }, []);

  const save = async (content: Record<string, unknown>, successText: string) => {
    setSaving(true);
    try {
      const res = await supabaseDataService.saveSiteContent('landing', content);
      if (res.success) {
        setMessage({ type: 'success', text: successText });
        setUpdatedAt(new Date().toISOString());
        addNotification({ title: 'Konten Landing Diperbarui', message: successText, type: 'success', module: 'Konten Situs' });
      } else {
        setMessage({ type: 'error', text: res.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const errors: string[] = [];
    collectErrors(draft, [], errors);
    if (errors.length) {
      setMessage({ type: 'error', text: errors.slice(0, 3).join(' ') });
      return;
    }
    if (!/^\d{9,15}$/.test(draft.contact.whatsappNumber.trim())) {
      setMessage({ type: 'error', text: 'Nomor WhatsApp harus berupa angka 9–15 digit dengan format 62…, tanpa tanda +.' });
      return;
    }
    // Bersihkan baris kosong pada daftar teks sebelum disimpan
    const cleaned = JSON.parse(JSON.stringify(draft), (_k, v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.filter((x: string) => x.trim() !== '') : v));
    void save(cleaned, 'Konten landing page tersimpan. Perubahan tampil saat landing page dimuat ulang.');
  };

  const sections = Object.keys(DEFAULT_LANDING).filter((k) => !LANDING_LOCKED_KEYS.has(k)) as Array<keyof LandingContent>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-slate-600">
          Kolom yang dikosongkan memakai teks/gambar <strong>bawaan</strong>. Gambar hanya lewat URL (https:// atau path situs).
          {updatedAt && <span className="text-slate-400"> · Terakhir disimpan {new Date(updatedAt).toLocaleString('id-ID')}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ExternalLink className="h-4 w-4" /> Lihat landing page
          </a>
          <Button type="button" size="sm" variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} disabled={!canSave || saving} onClick={() => setConfirmReset(true)}>
            Kembalikan semua ke bawaan
          </Button>
          <Button type="button" size="sm" variant="primary" leftIcon={<Save className="h-4 w-4" />} loading={saving} disabled={!canSave || !loaded} onClick={handleSave} data-testid="cms-landing-save">
            Simpan konten
          </Button>
        </div>
      </div>

      {message && <StatusMessage type={message.type} text={message.text} />}

      <div className="space-y-3">
        {sections.map((key) => {
          const open = openSection === key;
          return (
            <Card key={key} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50"
                aria-expanded={open}
                onClick={() => setOpenSection(open ? '' : key)}
              >
                <span className="font-bold text-slate-900">{label(key)}</span>
                <span className="text-xs font-semibold text-emerald-800">{open ? 'Tutup' : 'Ubah'}</span>
              </button>
              {open && (
                <div className="border-t border-slate-100 p-5">
                  <FieldNode node={draft[key]} path={[key]} fieldKey={key} onChange={handleChange} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          setDraft(buildEditableDraft({}));
          void save({}, 'Konten landing page dikembalikan ke bawaan.');
        }}
        title="Kembalikan semua konten ke bawaan?"
        description="Seluruh teks dan gambar yang Anda ubah akan dihapus, dan landing page kembali memakai isi bawaan dari aplikasi."
        confirmLabel="Ya, kembalikan"
        variant="warning"
      />
    </div>
  );
};

/* ================================================================== */
/*  Editor halaman (Panduan, Privasi, Ketentuan, dll.)                 */
/* ================================================================== */

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;

const emptyPage = (): SitePage => ({
  slug: 'panduan/',
  title: '',
  summary: '',
  category: 'panduan',
  bodyMd: '',
  status: 'draft',
  sortOrder: 50,
  showInFooter: false
});

const PagesEditor: React.FC<{ canSave: boolean }> = ({ canSave }) => {
  const { addNotification } = useMtq();
  const [dbPages, setDbPages] = useState<SitePage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SitePage | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [versions, setVersions] = useState<Array<Record<string, unknown>> | null>(null);

  const load = useCallback(async () => {
    const res = await supabaseDataService.fetchSitePagesAdmin();
    if (res.success && res.data) {
      setDbPages(res.data.map(mapSitePageRow));
      setLoadError(null);
    } else {
      setLoadError(res.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allPages = useMemo(() => mergeWithDefaultPages(dbPages), [dbPages]);

  const startEdit = (page: SitePage) => {
    setEditing({ ...page });
    setShowPreview(false);
    setMessage(null);
    setVersions(null);
  };

  const update = <K extends keyof SitePage>(key: K, value: SitePage[K]) => {
    setMessage(null);
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!editing) return;
    const slug = editing.slug.trim().replace(/^\/+|\/+$/g, '');
    if (!SLUG_RE.test(slug)) {
      setMessage({ type: 'error', text: 'Alamat (slug) hanya boleh huruf kecil, angka, tanda hubung, dan satu garis miring. Contoh: panduan/pendaftaran' });
      return;
    }
    if (editing.title.trim().length < 3) {
      setMessage({ type: 'error', text: 'Judul minimal 3 karakter.' });
      return;
    }
    const conflict = dbPages.find((p) => p.slug === slug && p.id !== editing.id);
    if (conflict) {
      setMessage({ type: 'error', text: `Alamat "${slug}" sudah dipakai halaman "${conflict.title}".` });
      return;
    }
    setSaving(true);
    try {
      const res = await supabaseDataService.saveSitePage({
        id: editing.id,
        slug,
        title: editing.title.trim(),
        summary: editing.summary.trim(),
        category: editing.category,
        bodyMd: editing.bodyMd,
        status: editing.status,
        effectiveDate: editing.effectiveDate || undefined,
        sortOrder: Number(editing.sortOrder) || 0,
        showInFooter: editing.showInFooter
      });
      if (res.success) {
        setMessage({ type: 'success', text: editing.status === 'published' ? 'Halaman tersimpan dan sudah tampil di situs.' : 'Halaman tersimpan sebagai draf.' });
        addNotification({ title: 'Halaman Disimpan', message: `${editing.title} (${slug})`, type: 'success', module: 'Konten Situs' });
        setEditing((prev) => (prev ? { ...prev, id: res.data?.id || prev.id, slug, isDefault: false } : prev));
        await load();
      } else {
        setMessage({ type: 'error', text: res.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing?.id) return;
    setConfirmDelete(false);
    const res = await supabaseDataService.deleteSitePage(editing.id);
    if (res.success) {
      const def = findDefaultPage(editing.slug);
      addNotification({ title: 'Halaman Dihapus', message: editing.title, type: 'info', module: 'Konten Situs' });
      setEditing(def ? { ...def } : null);
      setMessage(def ? { type: 'info', text: 'Versi Anda dihapus. Halaman kini memakai isi bawaan.' } : null);
      await load();
    } else {
      setMessage({ type: 'error', text: res.message });
    }
  };

  const loadVersions = async () => {
    if (!editing?.id) return;
    const res = await supabaseDataService.fetchSitePageVersions(editing.id);
    setVersions(res.success && res.data ? res.data : []);
  };

  const statusBadge = (p: SitePage) =>
    !p.id ? (
      <Badge variant="neutral">Bawaan</Badge>
    ) : p.status === 'published' ? (
      <Badge variant="success">Terbit</Badge>
    ) : (
      <Badge variant="warning">Draf</Badge>
    );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="p-4 lg:col-span-4 self-start">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-base font-bold text-slate-900">Halaman</h2>
          <Button type="button" size="sm" variant="primary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => startEdit(emptyPage())}>
            Tambah
          </Button>
        </div>
        {loadError && <p className="mb-3 text-xs text-amber-800">{loadError} Menampilkan halaman bawaan.</p>}
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Daftar halaman">
          {allPages.map((p) => {
            const active = editing && editing.slug === p.slug && (editing.id || null) === (p.id || null);
            return (
              <li key={`${p.slug}-${p.id || 'bawaan'}`}>
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className={`flex w-full items-start justify-between gap-2 rounded-md border px-3 py-2.5 text-left ${active ? 'border-emerald-600 bg-emerald-50/70' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{p.title}</span>
                    <span className="block truncate font-mono text-xs text-slate-500">{pageHref(p.slug)}</span>
                  </span>
                  {statusBadge(p)}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="space-y-4 lg:col-span-8">
        {!editing ? (
          <Card className="p-8 text-center text-sm text-slate-500">Pilih halaman di sebelah kiri, atau klik Tambah untuk membuat halaman baru.</Card>
        ) : (
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-base font-bold text-slate-900">
                {editing.id ? 'Ubah halaman' : editing.isDefault ? 'Sesuaikan halaman bawaan' : 'Halaman baru'}
              </h2>
              <div className="flex flex-wrap gap-2">
                <a
                  href={pageHref(editing.slug.trim() || 'panduan')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Buka di situs
                </a>
                {editing.id && (
                  <Button type="button" size="sm" variant="secondary" leftIcon={<History className="h-3.5 w-3.5" />} onClick={() => void loadVersions()}>
                    Riwayat
                  </Button>
                )}
                {editing.id && (
                  <Button type="button" size="sm" variant="danger" leftIcon={<Trash2 className="h-3.5 w-3.5" />} disabled={!canSave} onClick={() => setConfirmDelete(true)}>
                    Hapus
                  </Button>
                )}
                <Button type="button" size="sm" variant="primary" leftIcon={<Save className="h-3.5 w-3.5" />} loading={saving} disabled={!canSave} onClick={() => void handleSave()} data-testid="cms-page-save">
                  Simpan
                </Button>
              </div>
            </div>

            {editing.isDefault && !editing.id && (
              <StatusMessage type="info" text="Ini isi bawaan dari aplikasi. Setelah Anda simpan, versi Anda yang tampil di situs." />
            )}
            {editing.id && findDefaultPage(editing.slug) && editing.status === 'draft' && (
              <StatusMessage type="info" text="Selama berstatus Draf, pengunjung tetap melihat isi bawaan halaman ini." />
            )}
            {message && <StatusMessage type={message.type} text={message.text} />}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Judul" value={editing.title} onChange={(e) => update('title', e.target.value)} />
              <Input
                label="Alamat (slug)"
                value={editing.slug}
                onChange={(e) => update('slug', e.target.value.toLowerCase())}
                helperText={`Tampil di ${pageHref(editing.slug.trim() || '…')}. Panduan diawali "panduan/".`}
                disabled={Boolean(editing.isDefault && !editing.id)}
              />
              <Select label="Kategori" value={editing.category} onChange={(e) => update('category', e.target.value as SitePageCategory)}>
                <option value="panduan">Panduan</option>
                <option value="kebijakan">Kebijakan (Privasi, Ketentuan)</option>
                <option value="lainnya">Lainnya</option>
              </Select>
              <Select label="Status" value={editing.status} onChange={(e) => update('status', e.target.value as SitePage['status'])}>
                <option value="draft">Draf (belum tampil)</option>
                <option value="published">Terbit (tampil di situs)</option>
              </Select>
              <Input label="Tanggal berlaku (opsional)" type="date" value={editing.effectiveDate || ''} onChange={(e) => update('effectiveDate', e.target.value || undefined)} />
              <Input label="Urutan tampil" type="number" value={String(editing.sortOrder)} onChange={(e) => update('sortOrder', Number(e.target.value))} />
            </div>
            <Input label="Ringkasan (opsional)" value={editing.summary} onChange={(e) => update('summary', e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editing.showInFooter} onChange={(e) => update('showInFooter', e.target.checked)} />
              Tampilkan tautan di footer situs
            </label>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Isi halaman</span>
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                <button type="button" className={`inline-flex items-center gap-1 rounded px-2.5 py-1 ${!showPreview ? 'bg-white shadow-sm' : 'text-slate-600'}`} onClick={() => setShowPreview(false)}>
                  <Pencil className="h-3 w-3" /> Tulis
                </button>
                <button type="button" className={`inline-flex items-center gap-1 rounded px-2.5 py-1 ${showPreview ? 'bg-white shadow-sm' : 'text-slate-600'}`} onClick={() => setShowPreview(true)}>
                  <Eye className="h-3 w-3" /> Pratinjau
                </button>
              </div>
            </div>
            {showPreview ? (
              <div className="min-h-[320px] rounded-md border border-slate-200 bg-white p-5">
                <MarkdownView source={editing.bodyMd} />
              </div>
            ) : (
              <Textarea
                value={editing.bodyMd}
                rows={18}
                className="font-mono text-sm"
                onChange={(e) => update('bodyMd', e.target.value)}
                helperText="Format: ## Judul bagian, ### Subjudul, - poin, 1. langkah, **tebal**, *miring*, > catatan, [teks tautan](https://…)."
              />
            )}

            {versions && (
              <div className="rounded-md border border-slate-200 p-3">
                <p className="m-0 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Riwayat versi</p>
                {versions.length === 0 ? (
                  <p className="m-0 text-sm text-slate-500">Belum ada riwayat.</p>
                ) : (
                  <ul className="m-0 flex max-h-64 list-none flex-col gap-1.5 overflow-y-auto p-0">
                    {versions.map((v) => (
                      <li key={String(v.id)} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2.5 py-1.5 text-xs">
                        <span>
                          {new Date(String(v.created_at)).toLocaleString('id-ID')} · {String(v.status) === 'published' ? 'Terbit' : 'Draf'}
                          {v.effective_date ? ` · berlaku ${String(v.effective_date)}` : ''}
                        </span>
                        <button
                          type="button"
                          className="font-semibold text-emerald-800 hover:underline"
                          onClick={() => {
                            setEditing((prev) => (prev ? { ...prev, title: String(v.title), bodyMd: String(v.body_md) } : prev));
                            setMessage({ type: 'info', text: 'Isi versi lama dimuat ke editor. Klik Simpan untuk memakainya.' });
                          }}
                        >
                          Pakai isi ini
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title="Hapus halaman ini?"
        description={
          editing && findDefaultPage(editing.slug)
            ? 'Versi Anda dihapus dan halaman kembali memakai isi bawaan. Riwayat versi ikut terhapus.'
            : 'Halaman dan riwayat versinya dihapus permanen dan tidak lagi tampil di situs.'
        }
        confirmLabel="Ya, hapus"
        variant="danger"
      />
    </div>
  );
};

/* ================================================================== */

const StatusMessage: React.FC<{ type: 'success' | 'error' | 'info'; text: string }> = ({ type, text }) => {
  const style =
    type === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : type === 'error'
        ? 'bg-rose-50 border-rose-200 text-rose-900'
        : 'bg-slate-50 border-slate-200 text-slate-700';
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertTriangle : Info;
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-md border p-3 text-sm ${style}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
};

export const SuperadminContentView: React.FC = () => {
  const { isLiveSupabaseMode } = useMtq();
  const [tab, setTab] = useState<'landing' | 'pages'>('landing');
  const canSave = isLiveSupabaseMode;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        badge={
          <Badge variant="neutral" className="border-purple-200 bg-purple-50 text-purple-800">
            <FileText className="h-3.5 w-3.5" />
            Pengaturan Platform Global
          </Badge>
        }
        title="Konten Situs"
        description="Ubah teks dan gambar landing page, serta kelola halaman Panduan, Kebijakan Privasi, dan Ketentuan Penggunaan."
      />

      {!canSave && (
        <StatusMessage type="info" text="Mode Demo: Anda dapat melihat editor, tetapi perubahan tidak disimpan ke database." />
      )}

      <Tabs
        items={[
          { id: 'landing', label: 'Landing Page', icon: <LayoutTemplate className="h-4 w-4" /> },
          { id: 'pages', label: 'Halaman', icon: <FileText className="h-4 w-4" /> }
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as 'landing' | 'pages')}
      />

      {tab === 'landing' ? <LandingEditor canSave={canSave} /> : <PagesEditor canSave={canSave} />}
    </div>
  );
};
