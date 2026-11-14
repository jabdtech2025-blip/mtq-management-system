import React from 'react';

/**
 * Pengubah Markdown sederhana dan AMAN (tanpa dangerouslySetInnerHTML) untuk halaman publik.
 * Didukung: ## / ### judul, paragraf, daftar (- atau 1.), kutipan (>), garis (---),
 * **tebal**, *miring*, `kode`, dan [tautan](https://… atau /…).
 * HTML mentah tidak diproses; teks selalu tampil sebagai teks.
 */

const SAFE_LINK = /^(https:\/\/|http:\/\/|mailto:|\/(?!\/)|#)/i;

let keySeq = 0;
const k = () => `md-${keySeq++}`;

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Urutan: tautan, kode, tebal, miring
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      if (SAFE_LINK.test(href)) {
        const external = /^https?:\/\//i.test(href);
        out.push(
          <a
            key={k()}
            href={href}
            className="font-semibold text-[#0E6F6B] underline underline-offset-2 hover:text-[#09403E]"
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {m[1]}
          </a>
        );
      } else {
        out.push(m[1]);
      }
    } else if (m[3] !== undefined) {
      out.push(
        <code key={k()} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em]">
          {m[3]}
        </code>
      );
    } else if (m[4] !== undefined) {
      out.push(
        <strong key={k()} className="font-semibold text-[#111827]">
          {m[4]}
        </strong>
      );
    } else if (m[5] !== undefined) {
      out.push(<em key={k()}>{m[5]}</em>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownView({ source, className = '' }: { source: string; className?: string }) {
  const lines = (source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      blocks.push(<hr key={k()} className="my-8 border-[#E5E7EB]" />);
      i += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      if (level <= 2) {
        blocks.push(
          <h2 key={k()} className="mt-10 mb-3 text-[22px] font-bold leading-snug text-[#09403E] first:mt-0">
            {content}
          </h2>
        );
      } else {
        blocks.push(
          <h3 key={k()} className="mt-7 mb-2 text-lg font-bold text-[#111827]">
            {content}
          </h3>
        );
      }
      i += 1;
      continue;
    }
    if (trimmed.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={k()}
          className="my-5 rounded-r-lg border-l-4 border-[#E9A23B] bg-[#FFF8EC] px-4 py-3 text-[15px] leading-relaxed text-[#4B5563]"
        >
          {renderInline(quote.join(' '))}
        </blockquote>
      );
      continue;
    }
    if (/^([-*])\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (ordered ? /^\d+[.)]\s+/.test(t) : /^([-*])\s+/.test(t)) {
          items.push(t.replace(ordered ? /^\d+[.)]\s+/ : /^([-*])\s+/, ''));
          i += 1;
        } else if (t && !/^#{1,4}\s/.test(t) && !t.startsWith('>') && items.length > 0 && /^\s{2,}/.test(lines[i])) {
          items[items.length - 1] += ` ${t}`; // lanjutan baris yang diindentasi
          i += 1;
        } else {
          break;
        }
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={k()}
          className={`my-4 space-y-2 pl-6 text-[15px] leading-relaxed text-[#374151] ${ordered ? 'list-decimal' : 'list-disc'} marker:text-[#159893]`}
        >
          {items.map((item) => (
            <li key={k()}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
      continue;
    }
    // Paragraf: gabungkan baris berurutan sampai baris kosong / blok lain
    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || /^#{1,4}\s/.test(t) || t.startsWith('>') || /^([-*])\s+/.test(t) || /^\d+[.)]\s+/.test(t) || /^---+$/.test(t)) break;
      para.push(t);
      i += 1;
    }
    blocks.push(
      <p key={k()} className="my-4 text-[15px] leading-[1.75] text-[#374151]">
        {renderInline(para.join(' '))}
      </p>
    );
  }

  return <div className={className}>{blocks}</div>;
}
