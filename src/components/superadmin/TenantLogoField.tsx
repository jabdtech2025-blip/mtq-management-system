import React, { useRef, useState } from 'react';
import { ImageUp, Link2, Trash2 } from 'lucide-react';
import { resizeTenantLogoFile, safeTenantLogoUrl, validateTenantLogoLink } from '../../utils/tenantLogo';

type Mode = 'upload' | 'link';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Pesan galat validasi tautan (dikelola induk agar bisa memblokir simpan) */
  onLinkError: (message: string | null) => void;
  disabled?: boolean;
}

/**
 * Isian logo penyelenggara di form Superadmin → Manajemen Penyelenggara.
 * Logo bisa diunggah (diperkecil otomatis di peramban) atau diisi dengan tautan https://.
 */
export const TenantLogoField: React.FC<Props> = ({ value, onChange, onLinkError, disabled }) => {
  const isDataUri = value.startsWith('data:');
  const [mode, setMode] = useState<Mode>(value && !isDataUri ? 'link' : 'upload');
  const [linkText, setLinkText] = useState(isDataUri ? '' : value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = safeTenantLogoUrl(value);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    if (next === 'link') {
      onLinkError(validateTenantLogoLink(linkText));
    } else {
      onLinkError(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUri = await resizeTenantLogoFile(file);
      setPreviewBroken(false);
      onChange(dataUri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo gagal diproses.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLink = (text: string) => {
    setLinkText(text);
    setPreviewBroken(false);
    const message = validateTenantLogoLink(text);
    onLinkError(message);
    setError(message);
    onChange(message ? value : text.trim());
  };

  const clear = () => {
    setLinkText('');
    setError(null);
    setPreviewBroken(false);
    onLinkError(null);
    onChange('');
  };

  return (
    <div>
      <label className="font-bold text-slate-600 block mb-1">Logo Penyelenggara</label>
      <div className="flex gap-3 items-start">
        <div
          className="w-20 h-20 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden"
          data-testid="tenant-logo-preview"
        >
          {preview && !previewBroken ? (
            <img
              src={preview}
              alt="Pratinjau logo penyelenggara"
              className="w-full h-full object-contain"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <span className="text-[10px] text-slate-400 text-center px-1">
              {previewBroken ? 'Gambar tidak dapat dimuat' : 'Belum ada logo'}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" role="tablist">
            {(
              [
                ['upload', 'Unggah', ImageUp],
                ['link', 'Tautan', Link2]
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                disabled={disabled}
                onClick={() => switchMode(key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  mode === key ? 'bg-white shadow-sm text-purple-800' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'upload' ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                aria-label="Pilih berkas logo"
                data-testid="tenant-logo-file"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Memproses…' : 'Pilih Gambar'}
              </button>
              <span className="text-[11px] text-slate-500">PNG/JPG/WebP/SVG, maks. 5 MB. Diperkecil otomatis.</span>
            </div>
          ) : (
            <input
              type="url"
              value={linkText}
              disabled={disabled}
              onChange={(e) => handleLink(e.target.value)}
              placeholder="https://contoh.com/logo.png"
              aria-label="Tautan logo"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          )}

          {error && <p className="text-[11px] font-semibold text-rose-700">{error}</p>}

          {value && (
            <button
              type="button"
              disabled={disabled}
              onClick={clear}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Hapus logo
            </button>
          )}
          <p className="text-[11px] text-slate-500">Tampil di header layar Live publik. Disarankan logo persegi.</p>
        </div>
      </div>
    </div>
  );
};
