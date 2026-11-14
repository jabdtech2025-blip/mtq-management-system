/** Rute halaman publik (dipisah agar main.tsx tidak ikut memuat isi halaman bawaan). */
/** Alamat publik sebuah halaman. Panduan & kebijakan memakai alamat pendek; halaman lain di bawah /halaman/. */
export function pageHref(slug: string): string {
  if (slug === 'privasi' || slug === 'ketentuan' || slug.startsWith('panduan/')) return `/${slug}`;
  return `/halaman/${slug}`;
}

/** Ubah path URL menjadi slug halaman publik (atau 'panduan' untuk daftar panduan). null = bukan halaman publik. */
export function slugFromPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/panduan') return 'panduan';
  if (path === '/privasi' || path === '/ketentuan') return path.slice(1);
  if (path.startsWith('/panduan/')) return path.slice(1);
  if (path.startsWith('/halaman/')) return path.slice('/halaman/'.length);
  return null;
}
