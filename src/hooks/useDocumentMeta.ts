import { useEffect } from 'react';
import { SiteSettings } from '../types/mtq';
import { ViewType } from '../context/MtqContext';

const VIEW_PAGE_TITLES: Record<ViewType, string> = {
  dashboard: 'Dashboard',
  kafilah: 'Grup & Peserta MTQ',
  bank_soal: 'Bank Soal & Maqra',
  master_data: 'Master Data & Rubrik',
  user_management: 'Pengguna & Hakim',
  penilaian_hakim: 'Monitoring Penilaian Dewan Hakim',
  penilaian_dual_panel: 'Lembar Penilaian Hakim',
  rekap_nilai: 'Rekap Nilai',
  stage_management: 'Manajemen Babak & Penugasan Hakim',
  hasil_kelulusan: 'Hasil Babak & Kelulusan',
  log_aktivitas: 'Log Aktivitas',
  superadmin_dashboard: 'Dashboard Platform',
  superadmin_tenants: 'Penyelenggara MTQ',
  superadmin_users: 'Manajemen Akun',
  superadmin_health: 'Kesehatan Sistem (Health Check)',
  superadmin_audit: 'Audit Log Platform',
  superadmin_settings: 'SEO dan Meta Situs'
};

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attrName}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function useDocumentMeta(currentView: ViewType, siteSettings: SiteSettings, pageTitleOverride?: string) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const pageTitle = pageTitleOverride || VIEW_PAGE_TITLES[currentView] || siteSettings.defaultTitle;
    const template = (siteSettings.titleTemplate || '%s — Manajemen MTQ').trim();
    const formattedTitle = template.includes('%s')
      ? template.replace('%s', pageTitle)
      : `${pageTitle} — ${siteSettings.siteName || 'Manajemen MTQ'}`;

    document.title = formattedTitle;

    // Halaman kerja internal (/app, /dashboard, /platform/*) selalu diberi noindex,nofollow
    // sedangkan halaman landing publik (/) mengikuti siteSettings.robots
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/app';
    const isPublicRootLanding = pathname === '/' && false; // Workspace SPA internal selalu noindex
    const robotsDirective = isPublicRootLanding ? siteSettings.robots : 'noindex,nofollow';

    upsertMetaTag('name', 'robots', robotsDirective);

    if (siteSettings.themeColor) {
      upsertMetaTag('name', 'theme-color', siteSettings.themeColor);
    }

    if (siteSettings.faviconUrl) {
      let iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = siteSettings.faviconUrl;
      if (siteSettings.faviconUrl.startsWith('data:image/svg+xml') || siteSettings.faviconUrl.endsWith('.svg')) {
        iconLink.type = 'image/svg+xml';
      } else if (siteSettings.faviconUrl.endsWith('.png') || siteSettings.faviconUrl.startsWith('data:image/png')) {
        iconLink.type = 'image/png';
      } else {
        iconLink.type = 'image/x-icon';
      }
    }
  }, [currentView, siteSettings, pageTitleOverride]);
}
