import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { slugFromPath } from './content/publicRoutes';
import { liveCodeFromPath } from './services/liveScoring';

// Landing page di "/" dan aplikasi di "/app" (serta rute aplikasi lain seperti /dashboard)
// dimuat terpisah, sehingga pengunjung landing tidak ikut mengunduh kode aplikasi.
const LandingPage = React.lazy(() => import('./landing/LandingPage'));
const App = React.lazy(() => import('./App.tsx'));
// Halaman publik: Panduan, Kebijakan Privasi, Ketentuan Penggunaan, dan halaman lain dari Superadmin (CMS)
const PublicPage = React.lazy(() => import('./public/PublicPage'));
// Layar publik Live Scoring per penyelenggara: /live/<KODE>
const LiveScoringPage = React.lazy(() => import('./live/LiveScoringPage'));

const APP_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Scheherazade+New:wght@400;700&display=swap';

function isLandingRoute(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/' && path !== '/index.html') return false;
  // Tautan dari email Supabase (undangan, reset kata sandi) bisa mendarat di "/"
  // dengan token di hash/query; tautan itu harus diproses oleh aplikasi, bukan landing.
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isAuthCallback =
    /access_token=|refresh_token=|type=(recovery|invite|signup|magiclink)|error_description=/.test(hash) ||
    /[?&](code|token_hash)=/.test(search);
  return !isAuthCallback;
}

function prepareAppDocument(): void {
  // Halaman aplikasi tidak perlu diindeks mesin pencari.
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.appendChild(robots);
  // Font aplikasi (termasuk huruf Arab) hanya dimuat untuk aplikasi, tidak untuk landing.
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = APP_FONTS_HREF;
  document.head.appendChild(fonts);
}

const liveCode = liveCodeFromPath(window.location.pathname);
const publicSlug = liveCode ? null : slugFromPath(window.location.pathname);
const landing = !liveCode && !publicSlug && isLandingRoute();
if (!landing && !publicSlug && !liveCode) prepareAppDocument();
if (liveCode) {
  // Layar Live: hanya huruf latin aplikasi (tanpa huruf Arab) agar ringan
  const liveFonts = document.createElement('link');
  liveFonts.rel = 'stylesheet';
  liveFonts.href =
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap';
  document.head.appendChild(liveFonts);
}

const Fallback = () => (
  <div
    role="status"
    aria-label="Memuat"
    style={{ minHeight: '100vh', background: liveCode ? '#022c22' : landing ? '#06201F' : publicSlug ? '#FFFFFF' : '#F8FAFC' }}
  />
);

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<Fallback />}>
    {liveCode ? (
      <LiveScoringPage tenantCode={liveCode} />
    ) : publicSlug ? (
      <PublicPage slug={publicSlug} />
    ) : landing ? (
      <LandingPage />
    ) : (
      <App />
    )}
  </Suspense>
);
