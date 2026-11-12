import React from 'react';

/**
 * Logo Manajemen MTQ (opsi 1 "Mushaf Terbuka"): mushaf terbuka dengan titik emas.
 * Satu sumber untuk landing page, sidebar, layar login, favicon, dan ikon aplikasi.
 */

export const BRAND_COLORS = {
  emerald: '#065F46',
  deep: '#09403E',
  night: '#06201F',
  teal: '#159893',
  gold: '#E9A23B'
} as const;

interface LogoGlyphProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  dotColor?: string;
  title?: string;
}

/** Gambar buku + titik emas tanpa latar. Warna garis mengikuti `currentColor`. */
export const LogoGlyph: React.FC<LogoGlyphProps> = ({
  size = 24,
  strokeWidth = 2.4,
  className,
  dotColor = BRAND_COLORS.gold,
  title
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path d="M24 15c-4-3-9-4-14-3.2v21.5c5-.8 10 .2 14 3.2" />
    <path d="M24 15c4-3 9-4 14-3.2v21.5c-5-.8-10 .2-14 3.2" />
    <path d="M24 15v21.5" />
    <circle cx="24" cy="8.4" r="2.3" fill={dotColor} stroke="none" />
  </svg>
);

interface LogoTileProps {
  size?: number;
  className?: string;
}

/** Logo dalam kotak emerald (ikon aplikasi). */
export const LogoTile: React.FC<LogoTileProps> = ({ size = 36, className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center text-white ${className}`}
    style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.25),
      backgroundColor: BRAND_COLORS.emerald
    }}
  >
    <LogoGlyph size={Math.round(size * 0.66)} strokeWidth={size <= 24 ? 3.2 : size <= 36 ? 2.8 : 2.4} />
  </span>
);
