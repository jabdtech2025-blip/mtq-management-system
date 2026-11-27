import React, { useEffect, useRef, useState } from 'react';
import { detectLocalMushaf, getKnownLocalMushafAvailability, getMushafPageSources } from '../services/mushafSource';
import { LiveDisplay, formatLiveMaqra, liveMushafPages } from '../services/liveScoring';

/** Satu halaman mushaf dengan sumber cadangan (lokal → pihak ketiga). */
const MushafPageImage: React.FC<{ page: number; hasLocal: boolean }> = ({ page, hasLocal }) => {
  const sources = getMushafPageSources(page, hasLocal);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [page, hasLocal]);
  const src = sources[index];
  return src ? (
    <img
      src={src}
      alt={`Mushaf halaman ${page}`}
      loading="eager"
      decoding="async"
      onError={() => setIndex((i) => i + 1)}
      className="block w-full h-auto rounded-xl bg-[#fdfbf3]"
    />
  ) : (
    <div className="w-full aspect-[3/4] rounded-xl bg-white/10 flex items-center justify-center text-sm text-emerald-100">
      Gambar halaman {page} tidak tersedia
    </div>
  );
};

/** Panel mushaf tanpa bingkai: halaman bertumpuk, digulir vertikal, bisa diperbesar layar penuh. */
const MushafPanel: React.FC<{ pages: number[]; compact: boolean }> = ({ pages, compact }) => {
  const [hasLocal, setHasLocal] = useState<boolean | null>(() => getKnownLocalMushafAvailability());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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
    setScrolled(false);
  }, [pagesKey]);

  const toggleFullscreen = () => {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.();
  };

  return (
    <div className={`relative min-w-0 ${compact ? '' : 'h-[70vh] lg:h-full lg:min-h-0'}`}>
      <div
        ref={panelRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 40)}
        className={`overflow-y-auto rounded-xl ${
          isFullscreen ? 'h-screen w-screen p-4 bg-[#022c22]' : compact ? 'max-h-[320px]' : 'h-full'
        }`}
        data-testid="live-mushaf"
      >
        <div className={`flex flex-col gap-3 mx-auto ${isFullscreen ? 'max-w-[900px]' : ''}`}>
          {hasLocal !== null &&
            pages.map((page) => <MushafPageImage key={page} page={page} hasLocal={hasLocal} />)}
        </div>
        {isFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="fixed top-4 right-4 px-3 py-1.5 rounded-lg bg-emerald-200 text-emerald-950 text-xs font-bold shadow cursor-pointer"
          >
            Tutup layar penuh
          </button>
        )}
      </div>
      {!isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-emerald-200 hover:bg-emerald-100 text-emerald-950 text-[11px] font-bold shadow cursor-pointer"
          data-testid="live-mushaf-fullscreen"
        >
          ⤢ Perbesar
        </button>
      )}
      {!isFullscreen && !scrolled && pages.length > 1 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-950 text-[11px] font-bold shadow">
          Gulir untuk halaman {pages[1]} ↓
        </div>
      )}
    </div>
  );
};

const withPrefix = (prefix: string, value: string) =>
  value.toLowerCase().startsWith(prefix.toLowerCase()) ? value : `${prefix} ${value}`;

const sizes = (compact: boolean) =>
  compact
    ? {
        sub: 'text-sm',
        label: 'text-[10px] tracking-[2px]',
        lot: 'text-3xl',
        name: 'text-xl',
        father: 'text-sm',
        origin: 'text-sm',
        maqra: 'text-sm',
        pages: 'text-xs',
        gap: 'gap-3'
      }
    : {
        sub: 'text-base sm:text-xl lg:text-[clamp(16px,min(2.4vh,1.35vw),36px)]',
        label: 'text-[11px] sm:text-xs lg:text-[clamp(11px,min(1.4vh,0.79vw),20px)] tracking-[3px]',
        lot: 'text-4xl lg:text-[clamp(36px,min(5.6vh,3.15vw),84px)]',
        name: 'text-2xl sm:text-3xl lg:text-[clamp(28px,min(4.6vh,2.59vw),72px)]',
        father: 'text-base sm:text-lg lg:text-[clamp(15px,min(2.1vh,1.18vw),32px)]',
        origin: 'text-base sm:text-lg lg:text-[clamp(16px,min(2.3vh,1.29vw),34px)]',
        maqra: 'text-lg sm:text-xl lg:text-[clamp(18px,min(2.5vh,1.41vw),38px)]',
        pages: 'text-sm sm:text-base lg:text-[clamp(14px,min(1.8vh,1.01vw),26px)]',
        gap: 'gap-3.5 lg:gap-[2vh]'
      };

/**
 * Isi layar publik peserta yang sedang tampil (preset "Kaca Bermotif"). Dibungkus LiveFrame.
 * TIDAK menampilkan nilai apa pun. Maqra dan mushaf hanya muncul bila admin menampilkannya.
 * - Maqra tampil: mushaf di kiri, identitas di kanan (HP: identitas dulu, mushaf di bawah).
 * - Maqra tersembunyi: identitas di tengah.
 */
export const LiveDisplayCard: React.FC<{
  display: LiveDisplay;
  compact?: boolean;
  showMushaf?: boolean;
}> = ({ display, compact = false, showMushaf = true }) => {
  const p = display.participant;
  const pages = p?.maqra ? liveMushafPages([p.maqra], 4) : [];
  const withMushaf = showMushaf && pages.length > 0;
  const centered = !withMushaf;
  const s = sizes(compact);
  const hr = (
    <hr className={`border-0 border-t-2 border-emerald-200/20 ${centered ? 'w-[min(440px,28vw)] min-w-[240px] max-w-full' : 'w-full'}`} />
  );
  const label = `font-mono font-bold uppercase text-emerald-300 ${s.label}`;

  const [maqraSurah, maqraPages] = p?.maqra ? formatLiveMaqra(p.maqra).split(' · ') : ['', ''];

  const info = (
    <div
      className={`w-full min-w-0 flex flex-col justify-center ${s.gap} ${centered ? 'items-center text-center' : ''}`}
      data-testid="live-info"
    >
      <div className={`font-extrabold ${s.sub}`}>
        {display.branchName} · <span className="text-emerald-300">{withPrefix('Babak', display.stageName)}</span>
      </div>
      {hr}
      {!p ? (
        <div className={`text-emerald-100 ${compact ? 'py-3 text-sm' : 'py-8 text-lg lg:text-[clamp(16px,min(2.4vh,1.35vw),36px)]'}`}>
          Menunggu peserta berikutnya…
        </div>
      ) : (
        <>
          <div>
            <div className={label}>Nomor Undian</div>
            <div
              className={`mt-1 font-extrabold tabular-nums leading-none text-emerald-300 ${s.lot}`}
              data-testid="live-lottery"
            >
              {p.lotteryNumber}
            </div>
          </div>
          <div>
            <div
              className={`font-extrabold tracking-tight leading-[1.06] break-words [text-wrap:balance] ${s.name}`}
              data-testid="live-name"
            >
              {p.name ?? <span className="italic text-emerald-200/80">Nama disembunyikan</span>}
            </div>
            {p.fatherName && (
              <div className={`mt-2 font-semibold text-emerald-200 ${s.father}`} data-testid="live-father">
                Nama Ayah: <b className="font-bold text-white">{p.fatherName}</b>
              </div>
            )}
            {p.age !== null && p.age !== undefined && (
              <div className={`mt-1 font-semibold text-emerald-200 ${s.father}`} data-testid="live-age">
                Usia: <b className="font-bold text-white">{p.age} tahun</b>
              </div>
            )}
          </div>
          <div className={`font-bold ${s.origin}`} data-testid="live-origin">
            {p.origin}
          </div>
          {p.maqra && (
            <>
              {hr}
              <div data-testid="live-maqra">
                <div className={`${label} mb-1.5`}>
                  Maqra{p.maqraCount > 1 ? ` ${p.maqra.index} dari ${p.maqraCount}` : ''}
                </div>
                <div className={`font-extrabold ${s.maqra}`}>{maqraSurah}</div>
                {maqraPages && <div className={`mt-1 font-semibold text-emerald-200 ${s.pages}`}>{maqraPages}</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <main
      className={`flex-1 min-h-0 ${
        compact ? 'p-4' : 'px-4 py-5 sm:px-6 lg:px-[2.5vw] lg:pt-[2.8vh] lg:pb-[2.4vh]'
      } ${withMushaf ? '' : 'flex items-center justify-center'}`}
      data-testid="live-display-card"
    >
      {withMushaf ? (
        <div
          className={`grid ${
            compact ? 'gap-4' : 'gap-6 lg:h-full lg:grid-cols-[44%_minmax(0,1fr)] lg:gap-[3.2vw]'
          }`}
        >
          {/* Layar lebar: mushaf di kiri; layar kecil: identitas lebih dulu */}
          <div className={compact ? 'order-2' : 'order-2 lg:order-1 lg:min-h-0'}>
            <MushafPanel pages={pages} compact={compact} />
          </div>
          <div className={compact ? 'order-1' : 'order-1 lg:order-2 flex lg:pb-[3.5vh]'}>{info}</div>
        </div>
      ) : (
        <div className="w-full max-w-5xl">{info}</div>
      )}
    </main>
  );
};

export default LiveDisplayCard;
