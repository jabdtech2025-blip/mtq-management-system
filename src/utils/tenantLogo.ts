/**
 * Logo penyelenggara (tenant): validasi tautan dan pengecilan gambar unggahan.
 *
 * Logo disimpan di kolom tenants.logo_url (migrasi 20261129) dalam salah satu bentuk:
 * - tautan https:// ke gambar;
 * - gambar terunggah yang diperkecil di peramban lalu disimpan sebagai data URI.
 * Batas di database: 200.000 karakter.
 */

export const TENANT_LOGO_MAX_LENGTH = 200_000;
/** Sisi terpanjang logo hasil unggahan (px) */
export const TENANT_LOGO_SIZE = 256;
/** Batas ukuran berkas asli yang boleh dipilih */
export const TENANT_LOGO_MAX_FILE_BYTES = 5 * 1024 * 1024;

const HTTPS_RE = /^https:\/\/[^\s"'<>]+$/i;
const DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** Kembalikan logo bila aman dipakai sebagai src gambar; selain itu string kosong. */
export function safeTenantLogoUrl(value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || v.length > TENANT_LOGO_MAX_LENGTH) return '';
  return HTTPS_RE.test(v) || DATA_RE.test(v) ? v : '';
}

/** Pesan galat untuk isian tautan logo; null = valid (kosong juga valid). */
export function validateTenantLogoLink(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^https:\/\//i.test(v)) return 'Tautan logo harus diawali https://';
  if (!HTTPS_RE.test(v)) return 'Tautan logo tidak valid (tidak boleh berisi spasi atau tanda kutip).';
  if (v.length > 2000) return 'Tautan logo terlalu panjang.';
  return null;
}

/**
 * Perkecil berkas gambar menjadi persegi maks. TENANT_LOGO_SIZE px berlatar putih,
 * lalu kembalikan data URI (WebP bila didukung, PNG bila tidak).
 */
export async function resizeTenantLogoFile(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
    throw new Error('Format logo harus PNG, JPG, WebP, GIF, atau SVG.');
  }
  if (file.size > TENANT_LOGO_MAX_FILE_BYTES) {
    throw new Error('Ukuran berkas logo maksimal 5 MB.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Berkas logo tidak dapat dibaca sebagai gambar.'));
      el.src = url;
    });
    const w = img.naturalWidth || TENANT_LOGO_SIZE;
    const h = img.naturalHeight || TENANT_LOGO_SIZE;
    const scale = Math.min(1, TENANT_LOGO_SIZE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Peramban tidak mendukung pengolahan gambar.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    let out = canvas.toDataURL('image/webp', 0.9);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
    if (out.length > TENANT_LOGO_MAX_LENGTH) out = canvas.toDataURL('image/jpeg', 0.85);
    if (out.length > TENANT_LOGO_MAX_LENGTH) throw new Error('Logo terlalu besar setelah diperkecil. Gunakan gambar yang lebih sederhana.');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
