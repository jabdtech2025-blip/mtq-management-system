import React, { useEffect, useRef, useState } from 'react';
import { detectLocalMushaf, getKnownLocalMushafAvailability, getMushafPageSources } from '../services/mushafSource';
import { LiveDisplay, formatLiveMaqra, liveMushafPages } from '../services/liveScoring';

/** Satu halaman mushaf dengan sumber cadangan (lokal → pihak ketiga). */
const MushafPageImage: React.FC<{ page: number; hasLocal: boolean }> = ({ page, hasLocal }) => {
  const sources = getMushafPageSources(page, hasLocal);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [page, hasLocal]);
  const src = sources[index];
  return (
    <figure className="flex flex-col items-center gap-1">
      {src ? (
        <img
          src={src}
          alt={`Mushaf halaman ${page}`}
          loading="eager"
          decoding="async"
          onError={() => setIndex((i) => i + 1)}
          className="w-full h-auto rounded-md bg-[#fdfbf3] shadow"
        />
      ) : (
        <div className="w-full aspect-[3/4] rounded-md bg-white/10 flex items-center justify-center text-sm text-emerald-100">
          Gambar halaman {page} tidak tersedia
        </div>
      )}
      <figcaption className="text-[11px] font-semibold text-emerald-200">Halaman {page}</figcaption>
    </figure>
  );
};

/** Panel mushaf tunggal: halaman bertumpuk, digulir vertikal, bisa diperbesar layar penuh. */
const MushafPanel: React.FC<{ pages: number[]; compact: boolean }> = ({ pages, compact }) => {
  const [hasLocal, setHasLocal] = useState<boolean | null>(() => getKnownLocalMushafAvailability());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasLocal !== null) return;
    let cancelled = false;
    void detectLocalMushaf().then((v) => {
      if (!cancelled) setHasLocal(v);
    });
    return () => {
      cancelled = true;
    };
  }, [hasLocal]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Maqra berganti: kembali ke halaman pertama
  const pagesKey = pages.join(',');
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [pagesKey]);

  const toggleFullscreen = () => {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="relative min-w-0">
      <div
        ref={panelRef}
        className={`overflow-y-auto rounded-xl bg-emerald-950/60 ${
          isFullscreen ? 'h-screen w-screen p-4 bg-slate-950' : compact ? 'max-h-[360px] p-2' : 'h-[75vh] p-3'
        }`}
        data-testid="live-mushaf"
      >
        <div className={`flex flex-col gap-4 mx-auto ${isFullscreen ? 'max-w-[900px]' : ''}`}>
          {hasLocal !== null &&
            pages.map((page) => <MushafPageImage key={page} page={page} hasLocal={hasLocal} />)}
        </div>
        {isFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="fixed top-4 right-4 px-3 py-1.5 rounded-lg bg-white/90 text-slate-900 text-xs font-bold shadow cursor-pointer"
          >
            Tutup layar penuh
          </button>
        )}
      </div>
      {!isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-slate-950/70 hover:bg-slate-950/90 text-white text-[11px] font-semibold cursor-pointer"
          data-testid="live-mushaf-fullscreen"
        >
          Perbesar
        </button>
      )}
    </div>
  );
};

const withPrefix = (prefix: string, value: string) =>
  value.toLowerCase().startsWith(prefix.toLowerCase()) ? value : `${prefix} ${value}`;

/**
 * Tampilan layar publik peserta yang sedang tampil. Dipakai halaman /live/<KODE> dan pratinjau admin.
 * TIDAK menampilkan nilai apa pun. Maqra dan mushaf hanya muncul bila admin menampilkannya.
 */
export const LiveDisplayCard: React.FC<{
  display: LiveDisplay;
  /** Nama penyelenggara (baris pertama) */
  organizerName?: string;
  compact?: boolean;
  showMushaf?: boolean;
}> = ({ display, organizerName, compact = false, showMushaf = true }) => {
  const p = display.participant;
  const pages = p?.maqra ? liveMushafPages([p.maqra], 4) : [];
  const withMushaf = showMushaf && pages.length > 0;

  const info = (
    <div className={`min-w-0 ${compact ? 'space-y-2' : 'space-y-3 sm:space-y-4'}`}>
      <div className="space-y-0.5">
        {organizerName && (
          <div className={`font-bold text-emerald-200 ${compact ? 'text-xs' : 'text-sm sm:text-base'}`} data-testid="live-organizer">
            {organizerName}
          </div>
        )}
        <div className={`font-semibold text-emerald-100 ${compact ? 'text-xs' : 'text-sm sm:text-base'}`}>{display.branchName}</div>
        <div className={`font-semibold text-emerald-100 ${compact ? 'text-xs' : 'text-sm sm:text-base'}`}>
          {withPrefix('Babak', display.stageName)}
        </div>
      </div>

      {!p ? (
        <div className={`text-emerald-100 ${compact ? 'py-4 text-sm' : 'py-8 text-lg'}`}>Menunggu peserta berikutnya…</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">No. Undian</span>
            <span
              className={`font-black font-mono tabular-nums text-amber-300 leading-none ${compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}
              data-testid="live-lottery"
            >
              {p.lotteryNumber}
            </span>
          </div>
          <div className="space-y-1">
            <div className={`font-extrabold break-words leading-tight ${compact ? 'text-xl' : 'text-3xl sm:text-4xl'}`} data-testid="live-name">
              {p.name ?? <span className="italic text-emerald-200/80">Nama disembunyikan</span>}
            </div>
            {p.fatherName && (
              <div className={`text-emerald-100 ${compact ? 'text-sm' : 'text-lg sm:text-xl'}`} data-testid="live-father">
                Nama Ayah: <span className="font-semibold">{p.fatherName}</span>
              </div>
            )}
          </div>
          <div className={`font-bold text-emerald-50 ${compact ? 'text-sm' : 'text-lg sm:text-xl'}`} data-testid="live-origin">
            {p.origin}
          </div>
          {p.maqra && (
            <div data-testid="live-maqra">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                Maqra{p.maqraCount > 1 ? ` ${p.maqra.index}` : ''}
              </div>
              <div className={`font-semibold text-white ${compact ? 'text-sm' : 'text-lg sm:text-xl'}`}>
                {formatLiveMaqra(p.maqra)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 text-white shadow-xl border border-emerald-700/50 ${
        compact ? 'p-4' : 'p-5 sm:p-8'
      }`}
      data-testid="live-display-card"
    >
      {withMushaf ? (
        <div className={`grid gap-5 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 items-start'}`}>
          {/* Layar lebar: mushaf di kiri; layar kecil: identitas lebih dulu */}
          <div className={compact ? 'order-2' : 'order-2 lg:order-1'}>
            <MushafPanel pages={pages} compact={compact} />
          </div>
          <div className={compact ? 'order-1' : 'order-1 lg:order-2'}>{info}</div>
        </div>
      ) : (
        info
      )}
    </div>
  );
};

export default LiveDisplayCard;
