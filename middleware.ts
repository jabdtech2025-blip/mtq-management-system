/**
 * Vercel Edge Middleware untuk injeksi Meta Tag SEO & Open Graph dari Supabase (site_settings)
 * Hanya berjalan untuk permintaan HTML ke halaman publik `/` atau `/app`.
 * Crawler pratinjau tautan (WhatsApp, Facebook, X, Telegram) menerima HTML yang sudah
 * berisi nilai `site_settings` langsung dari server dengan cache 5 menit.
 */

export const config = {
  matcher: ['/', '/app']
};

interface SiteSettingsRow {
  site_name?: string;
  title_template?: string;
  default_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  canonical_url?: string;
  robots?: string;
  og_title?: string;
  og_description?: string;
  og_image_url?: string;
  og_image_alt?: string;
  og_type?: string;
  og_locale?: string;
  twitter_card?: string;
  twitter_site?: string;
  theme_color?: string;
  google_site_verification?: string;
}

function escapeHtmlAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildInjectedHeadTags(row: SiteSettingsRow, pathname: string): string {
  const siteName = escapeHtmlAttr(row.site_name || 'Manajemen MTQ');
  const title = escapeHtmlAttr(row.default_title || 'Manajemen MTQ — Musabaqah Digital');
  const desc = escapeHtmlAttr(
    row.meta_description ||
      'Platform manajemen MTQ multi-tenant dengan penilaian digital dewan hakim, mushaf kanvas, dan rekapitulasi nilai real-time.'
  );
  const keywords = escapeHtmlAttr(
    row.meta_keywords || 'MTQ, STQ, LPTQ, Musabaqah Tilawatil Quran, E-Scoring MTQ'
  );
  const canonical = escapeHtmlAttr(row.canonical_url || 'https://mtq.id');
  const robots =
    pathname === '/app'
      ? 'noindex,nofollow'
      : escapeHtmlAttr(row.robots === 'noindex,nofollow' ? 'noindex,nofollow' : 'index,follow');
  const ogTitle = escapeHtmlAttr(row.og_title || row.default_title || 'Manajemen MTQ — Musabaqah Digital');
  const ogDesc = escapeHtmlAttr(row.og_description || row.meta_description || '');
  const ogImage = escapeHtmlAttr(row.og_image_url || 'https://mtq.id/icons/icon-512x512.png');
  const ogImageAlt = escapeHtmlAttr(row.og_image_alt || 'Logo dan Antarmuka Manajemen MTQ Digital');
  const ogType = escapeHtmlAttr(row.og_type || 'website');
  const ogLocale = escapeHtmlAttr(row.og_locale || 'id_ID');
  const twitterCard = escapeHtmlAttr(
    row.twitter_card === 'summary' ? 'summary' : 'summary_large_image'
  );
  const twitterSite = escapeHtmlAttr(row.twitter_site || '@lptq_id');
  const themeColor = escapeHtmlAttr(row.theme_color || '#065f46');
  const googleVerification = escapeHtmlAttr(row.google_site_verification || '');

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<meta name="keywords" content="${keywords}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta name="theme-color" content="${themeColor}" />`,
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:title" content="${ogTitle}" />`,
    `<meta property="og:description" content="${ogDesc}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:locale" content="${ogLocale}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:alt" content="${ogImageAlt}" />`,
    `<meta name="twitter:card" content="${twitterCard}" />`,
    `<meta name="twitter:site" content="${twitterSite}" />`,
    `<meta name="twitter:title" content="${ogTitle}" />`,
    `<meta name="twitter:description" content="${ogDesc}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    `<meta name="twitter:image:alt" content="${ogImageAlt}" />`,
    googleVerification
      ? `<meta name="google-site-verification" content="${googleVerification}" />`
      : ''
  ]
    .filter(Boolean)
    .join('\n    ');
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('text/html')) {
    return undefined;
  }

  const url = new URL(request.url);
  if (url.pathname !== '/' && url.pathname !== '/app') {
    return undefined;
  }

  const envObj =
    typeof process !== 'undefined' && process.env ? process.env : ({} as Record<string, string | undefined>);
  const supabaseUrl = envObj.SUPABASE_URL || envObj.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = envObj.SUPABASE_ANON_KEY || envObj.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    // Bila env Supabase belum dikonfigurasi, teruskan HTML bawaan apa adanya
    return undefined;
  }

  try {
    const originResponse = await fetch(request);
    const contentType = originResponse.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return originResponse;
    }

    const restEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/site_settings?id=eq.global&select=*&limit=1`;
    const settingsRes = await fetch(restEndpoint, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: 'application/json'
      }
    });

    if (!settingsRes.ok) {
      return originResponse;
    }

    const rows = (await settingsRes.json()) as SiteSettingsRow[];
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return originResponse;
    }

    let html = await originResponse.text();
    const injectedBlock = buildInjectedHeadTags(row, url.pathname);

    // Hapus tag bawaan yang digantikan lalu sisipkan blok terbaru tepat sebelum </head>
    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+name="(description|keywords|robots|theme-color|twitter:[^"]+|google-site-verification)"[^>]*>/gi, '')
      .replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, '')
      .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
      .replace('</head>', `    ${injectedBlock}\n  </head>`);

    const headers = new Headers(originResponse.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return new Response(html, {
      status: originResponse.status,
      headers
    });
  } catch {
    // Bila Supabase gagal dihubungi, kirim HTML bawaan tanpa gagal
    return undefined;
  }
}
