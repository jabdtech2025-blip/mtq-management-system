import React, { useState } from 'react';
import { safeTenantLogoUrl } from '../utils/tenantLogo';

/** Pola bintang samar di latar layar Live (SVG sebaris, tanpa berkas tambahan). */
const STAR_PATTERN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><g fill='none' stroke='#a7f3d0' stroke-opacity='0.06' stroke-width='1.3'><rect x='38' y='38' width='44' height='44'/><rect x='38' y='38' width='44' height='44' transform='rotate(45 60 60)'/><circle cx='60' cy='60' r='9'/></g></svg>"
)}")`;

/** Logo aplikasi (buku + titik emas) — sama dengan LogoGlyph, disalin agar bundel /live tetap ringan. */
const AppGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M24 15c-4-3-9-4-14-3.2v21.5c5-.8 10 .2 14 3.2" />
    <path d="M24 15c4-3 9-4 14-3.2v21.5c-5-.8-10 .2-14 3.2" />
    <path d="M24 15v21.5" />
    <circle cx="24" cy="8.4" r="2.3" fill="#E9A23B" stroke="none" />
  </svg>
);

/** Logo penyelenggara dalam kotak putih; tidak tampil bila kosong atau gagal dimuat. */
const OrganizerLogo: React.FC<{ url?: string; compact: boolean }> = ({ url, compact }) => {
  const safe = safeTenantLogoUrl(url);
  const [broken, setBroken] = useState(false);
  if (!safe || broken) return null;
  return (
    <div
      className={`shrink-0 overflow-hidden bg-white flex items-center justify-center shadow-md shadow-black/20 ${
        compact ? 'w-9 h-9 rounded-md p-1' : 'w-11 h-11 sm:w-12 sm:h-12 lg:w-[clamp(44px,min(6.2vh,3.49vw),80px)] lg:h-[clamp(44px,min(6.2vh,3.49vw),80px)] rounded-lg p-1 lg:p-[0.6vh]'
      }`}
    >
      <img
        src={safe}
        alt=""
        className="block w-full h-full object-contain rounded-[4px]"
        onError={() => setBroken(true)}
        data-testid="live-organizer-logo"
      />
    </div>
  );
};

/**
 * Bingkai layar Live publik (preset "Kaca Bermotif"): latar hijau zamrud bermotif,
 * header kaca berisi logo + nama penyelenggara, area isi, dan atribusi aplikasi di kanan bawah.
 * Dipakai halaman /live/<KODE> (layar penuh) dan pratinjau admin (`compact`).
 */
export const LiveFrame: React.FC<{
  organizerName?: string;
  organizerLogoUrl?: string;
  compact?: boolean;
  /** Elemen tambahan di sisi kanan header (mis. pilihan sesi) */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ organizerName, organizerLogoUrl, compact = false, headerExtra, children }) => (
  <div
    className={`relative flex flex-col text-white font-sans overflow-hidden ${
      compact ? 'rounded-2xl shadow-xl' : 'min-h-screen lg:h-screen'
    }`}
    style={{ background: 'linear-gradient(135deg,#065f46 0%,#064e3b 48%,#022c22 100%)' }}
    data-testid="live-frame"
  >
    <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: STAR_PATTERN }} aria-hidden />

    <header
      className={`relative flex items-center bg-white/[0.08] border-b border-emerald-200/35 backdrop-blur ${
        compact ? 'gap-2.5 px-4 py-2.5' : 'gap-3 sm:gap-4 px-4 py-2.5 sm:px-6 lg:px-[2.5vw] lg:py-[1.3vh] lg:gap-[1.2vw]'
      }`}
    >
      <OrganizerLogo key={organizerLogoUrl || "none"} url={organizerLogoUrl} compact={compact} />
      <h1
        className={`min-w-0 font-extrabold tracking-tight leading-tight ${
          compact ? 'text-sm' : 'text-lg sm:text-2xl lg:text-[clamp(22px,min(3.6vh,2.02vw),52px)]'
        }`}
        data-testid="live-organizer"
      >
        {organizerName || 'Live Musabaqah'}
      </h1>
      {headerExtra && <div className="ml-auto pl-2 shrink-0">{headerExtra}</div>}
    </header>

    <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>

    <footer
      className={`relative flex items-center gap-2 font-semibold text-emerald-100/75 ${
        compact
          ? 'justify-end px-4 pb-2.5 text-[10px]'
          : 'justify-center px-4 pb-4 text-xs lg:absolute lg:right-[2.5vw] lg:bottom-[1.8vh] lg:p-0 lg:text-[clamp(11px,min(1.4vh,0.79vw),18px)]'
      }`}
      data-testid="live-attribution"
    >
      <span>Didukung oleh</span>
      <span
        className={`inline-flex items-center justify-center rounded-md bg-emerald-800 border border-emerald-200/35 ${
          compact ? 'w-4 h-4' : 'w-[22px] h-[22px]'
        }`}
      >
        <AppGlyph className={compact ? 'w-3 h-3' : 'w-[15px] h-[15px]'} />
      </span>
      <b className="font-extrabold text-white">Manajemen MTQ</b>
      <span className="opacity-50">·</span>
      <span>mtqsystem.web.id</span>
    </footer>
  </div>
);

export default LiveFrame;
