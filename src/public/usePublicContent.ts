import { useEffect, useState } from 'react';
import { LandingContent, mergeLandingContent } from '../content/landing';
import { DEFAULT_SITE_PAGES, SitePage, mergeWithDefaultPages } from '../content/defaultPages';
import {
  fetchLandingOverride,
  fetchPublishedPages,
  getCachedLandingOverride,
  getCachedPublishedPages
} from '../services/publicContent';

/** Isi landing page: bawaan langsung tampil, lalu diganti isi dari Superadmin (CMS) bila ada. */
export function useLandingContent(): LandingContent {
  const [content, setContent] = useState<LandingContent>(() => mergeLandingContent(getCachedLandingOverride()));
  useEffect(() => {
    let cancelled = false;
    void fetchLandingOverride().then((override) => {
      if (!cancelled && override) setContent(mergeLandingContent(override));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return content;
}

/** Daftar halaman publik terbit (bawaan + dari database), tanpa isi. */
export function usePublishedPages(): SitePage[] {
  const [pages, setPages] = useState<SitePage[]>(() =>
    mergeWithDefaultPages(getCachedPublishedPages() || []).filter((p) => p.status === 'published')
  );
  useEffect(() => {
    let cancelled = false;
    void fetchPublishedPages().then((dbPages) => {
      if (!cancelled && dbPages) setPages(mergeWithDefaultPages(dbPages).filter((p) => p.status === 'published'));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return pages;
}

/** Tautan tetap di footer (selalu ada karena tersedia isi bawaannya). */
export const CORE_FOOTER_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Panduan Penggunaan', href: '/panduan' },
  { label: 'Kebijakan Privasi', href: '/privasi' },
  { label: 'Ketentuan Penggunaan', href: '/ketentuan' }
];

/** Halaman tambahan dari Superadmin yang ditandai "tampil di footer" (selain tautan tetap). */
export const extraFooterPages = (pages: SitePage[]): SitePage[] => {
  const core = new Set(['privasi', 'ketentuan']);
  return pages.filter((p) => p.showInFooter && !core.has(p.slug) && !DEFAULT_SITE_PAGES.some((d) => d.slug === p.slug && !p.id));
};
