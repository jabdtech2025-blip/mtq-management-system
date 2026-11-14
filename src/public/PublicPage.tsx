import React, { useEffect, useMemo, useState } from 'react';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import { LogoTile } from '../components/brand/Logo';
import { MarkdownView } from '../lib/markdown';
import { SitePage, findDefaultPage, pageHref } from '../content/defaultPages';
import { fetchPublishedPage, getCachedPage } from '../services/publicContent';
import { landingContent, whatsappLink } from '../content/landing';
import { CORE_FOOTER_LINKS, extraFooterPages, usePublishedPages } from './usePublicContent';

/**
 * Halaman publik: daftar Panduan (/panduan), satu halaman Panduan (/panduan/…), Kebijakan Privasi (/privasi),
 * Ketentuan Penggunaan (/ketentuan), dan halaman lain dari Superadmin (/halaman/…).
 * Isi diambil dari database (Konten Situs). Bila belum ada, isi bawaan dari repo yang ditampilkan.
 */

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

function setDocumentMeta(title: string, description: string) {
  document.title = `${title} — Manajemen MTQ`;
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.name = 'description';
    document.head.appendChild(el);
  }
  el.content = description;
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) canonical.href = `https://mtqsystem.web.id${window.location.pathname}`;
}

const Shell: React.FC<{ children: React.ReactNode; pages: SitePage[] }> = ({ children, pages }) => {
  const year = new Date().getFullYear();
  const wa = whatsappLink(landingContent.contact);
  return (
    <div className="flex min-h-screen flex-col bg-white font-['IBM_Plex_Sans',system-ui,sans-serif] text-[#111827] antialiased">
      <header className="bg-[#06201F] text-white">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-4 px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3 text-white no-underline">
            <LogoTile size={34} />
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-bold tracking-[0.02em]">MANAJEMEN MTQ</span>
              <span className="hidden text-xs text-[#A7C4C2] sm:block">E-Scoring Musabaqah</span>
            </span>
          </a>
          <nav aria-label="Navigasi" className="flex items-center gap-1 text-sm font-semibold sm:gap-5">
            <a href="/" className="hidden rounded px-2 py-1 text-[#D7E3E2] no-underline hover:text-white sm:inline">
              Beranda
            </a>
            <a href="/panduan" className="rounded px-2 py-1 text-[#D7E3E2] no-underline hover:text-white">
              Panduan
            </a>
            <a
              href="/app"
              className="ml-1 inline-flex h-9 items-center rounded-lg border-[1.5px] border-white/70 px-3.5 text-white no-underline hover:bg-white/10"
            >
              Masuk
            </a>
          </nav>
        </div>
      </header>

      <main id="konten" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-[#E5E7EB] bg-[#F9FAFB]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-start justify-between gap-6 px-5 py-8 text-sm text-[#4B5563] sm:px-8">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[#111827]">© {year} Manajemen MTQ</span>
            <a href={`mailto:${landingContent.contact.email}`} className="text-[#4B5563] no-underline hover:text-[#09403E]">
              {landingContent.contact.email}
            </a>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[#4B5563] no-underline hover:text-[#09403E]">
              WhatsApp {landingContent.contact.whatsappDisplay}
            </a>
          </div>
          <nav aria-label="Informasi" className="flex flex-wrap gap-x-5 gap-y-2">
            {CORE_FOOTER_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-[#0E6F6B] no-underline hover:text-[#09403E]">
                {l.label}
              </a>
            ))}
            {extraFooterPages(pages).map((p) => (
              <a key={p.slug} href={pageHref(p.slug)} className="text-[#0E6F6B] no-underline hover:text-[#09403E]">
                {p.title}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
};

const GuideIndex: React.FC<{ pages: SitePage[] }> = ({ pages }) => {
  const guides = pages.filter((p) => p.category === 'panduan');
  const others = pages.filter((p) => p.category !== 'panduan');
  useEffect(() => {
    setDocumentMeta('Panduan Penggunaan', 'Panduan penggunaan Manajemen MTQ untuk dewan hakim, admin, dan panitia penyelenggara.');
  }, []);
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 sm:py-16">
      <span className="inline-flex h-[30px] items-center rounded-full bg-[#159893]/10 px-3.5 text-sm font-medium text-[#0E6F6B]">Panduan</span>
      <h1 className="mb-2 mt-4 text-[clamp(28px,4vw,40px)] font-bold leading-tight text-[#09403E]">Panduan Penggunaan</h1>
      <p className="m-0 max-w-[640px] text-base leading-relaxed text-[#4B5563]">
        Langkah-langkah memakai Manajemen MTQ sesuai peran Anda.
      </p>
      <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {guides.map((p) => (
          <a
            key={p.slug}
            href={pageHref(p.slug)}
            className="group flex flex-col gap-2 rounded-xl border border-[#E5E7EB] p-5 text-[#111827] no-underline transition-colors hover:border-[#159893]/60 hover:bg-[#F0FAF9]"
          >
            <span className="text-lg font-bold text-[#09403E]">{p.title}</span>
            {p.summary && <span className="text-sm leading-relaxed text-[#4B5563]">{p.summary}</span>}
            <span className="mt-auto pt-2 text-sm font-semibold text-[#0E6F6B]">Baca panduan →</span>
          </a>
        ))}
      </div>
      {others.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-3 text-lg font-bold text-[#111827]">Informasi lainnya</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {others.map((p) => (
              <li key={p.slug}>
                <a href={pageHref(p.slug)} className="font-semibold text-[#0E6F6B] no-underline hover:text-[#09403E]">
                  {p.title}
                </a>
                {p.summary && <span className="text-sm text-[#4B5563]"> — {p.summary}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const PageView: React.FC<{ slug: string; pages: SitePage[] }> = ({ slug, pages }) => {
  const fallback = useMemo(() => findDefaultPage(slug) || null, [slug]);
  const [page, setPage] = useState<SitePage | null>(() => getCachedPage(slug) || fallback);
  const [loading, setLoading] = useState<boolean>(() => !getCachedPage(slug) && !fallback);

  useEffect(() => {
    let cancelled = false;
    void fetchPublishedPage(slug).then((res) => {
      if (cancelled) return;
      if (res && res !== 'error') setPage(res);
      else if (res === null) setPage(fallback);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, fallback]);

  useEffect(() => {
    if (page) setDocumentMeta(page.title, page.summary || page.title);
  }, [page]);

  if (!page) {
    return (
      <div className="mx-auto max-w-[760px] px-5 py-20 text-center sm:px-8">
        {loading ? (
          <p className="text-[#4B5563]" role="status">
            Memuat halaman…
          </p>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-[#09403E]">Halaman tidak ditemukan</h1>
            <p className="mt-2 text-[#4B5563]">Halaman yang Anda cari tidak tersedia atau belum diterbitkan.</p>
            <a href="/panduan" className="mt-6 inline-block font-semibold text-[#0E6F6B]">
              Lihat semua panduan →
            </a>
          </>
        )}
      </div>
    );
  }

  const siblings = page.category === 'panduan' ? pages.filter((p) => p.category === 'panduan' && p.slug !== page.slug) : [];
  const dateInfo = page.effectiveDate
    ? `Berlaku sejak ${formatDate(page.effectiveDate)}`
    : page.updatedAt
      ? `Diperbarui ${formatDate(page.updatedAt)}`
      : '';

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Jejak" className="mb-6 text-sm text-[#6B7280]">
        <a href="/" className="text-[#6B7280] no-underline hover:text-[#09403E]">
          Beranda
        </a>
        <span className="mx-2">/</span>
        {page.category === 'panduan' ? (
          <a href="/panduan" className="text-[#6B7280] no-underline hover:text-[#09403E]">
            Panduan
          </a>
        ) : (
          <span>Informasi</span>
        )}
      </nav>
      <div className="flex flex-wrap gap-10">
        <article className="min-w-0 flex-[1_1_560px]">
          <h1 className="m-0 text-[clamp(28px,4vw,40px)] font-bold leading-tight text-[#09403E]">{page.title}</h1>
          {(page.summary || dateInfo) && (
            <p className="mb-0 mt-3 text-base leading-relaxed text-[#4B5563]">
              {page.summary}
              {page.summary && dateInfo ? ' · ' : ''}
              {dateInfo && <span className="text-sm text-[#6B7280]">{dateInfo}</span>}
            </p>
          )}
          <div className="mt-8 border-t border-[#E5E7EB] pt-6">
            <MarkdownView source={page.bodyMd} />
          </div>
        </article>
        {siblings.length > 0 && (
          <aside className="flex-[0_1_260px]">
            <div className="sticky top-6 rounded-xl border border-[#E5E7EB] p-5">
              <p className="m-0 mb-3 text-sm font-bold text-[#111827]">Panduan lainnya</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {siblings.map((p) => (
                  <li key={p.slug}>
                    <a href={pageHref(p.slug)} className="font-semibold text-[#0E6F6B] no-underline hover:text-[#09403E]">
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

const PublicPage: React.FC<{ slug: string }> = ({ slug }) => {
  const pages = usePublishedPages();
  return <Shell pages={pages}>{slug === 'panduan' ? <GuideIndex pages={pages} /> : <PageView slug={slug} pages={pages} />}</Shell>;
};

export default PublicPage;
