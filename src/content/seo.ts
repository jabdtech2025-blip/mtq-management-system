/**
 * Meta pratinjau tautan (Open Graph / Twitter) untuk landing page.
 *
 * WhatsApp, Facebook, X, dan mesin pencari membaca nilai ini dari HTML STATIS di `index.html`
 * (mereka tidak menjalankan JavaScript), sehingga nilai ini TIDAK dapat diubah dari dashboard.
 * Untuk mengubahnya: ubah `index.html` DAN file ini bersamaan. Tes otomatis memastikan keduanya sama.
 */
export const LANDING_SEO = {
  siteUrl: 'https://mtqsystem.web.id/',
  domain: 'mtqsystem.web.id',
  title: 'Manajemen MTQ — Sistem Penilaian Digital MTQ & STQ',
  description:
    'Penilaian yang tertib, hasil yang dapat dipertanggungjawabkan. Dari pendaftaran peserta sampai pengesahan juara.',
  ogImagePath: '/og-image.jpg',
  ogImageWidth: 1200,
  ogImageHeight: 630
} as const;
