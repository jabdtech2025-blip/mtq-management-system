import React, { useEffect, useState } from 'react';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import { whatsappLink } from '../content/landing';
import { CORE_FOOTER_LINKS, extraFooterPages, useLandingContent, usePublishedPages } from '../public/usePublicContent';
import { LogoTile } from '../components/brand/Logo';

const APP_PATH = '/app';

const Chip: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <span
    className={`inline-flex h-[30px] items-center rounded-full px-3.5 text-sm font-medium ${
      dark ? 'bg-[#159893]/25 text-[#9EE6E1]' : 'bg-[#159893]/10 text-[#0E6F6B]'
    }`}
  >
    {children}
  </span>
);

const ArrowRight: React.FC<{ className?: string }> = ({ className = 'h-[18px] w-[18px]' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const Check: React.FC = () => (
  <svg className="mt-[3px] h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#159893" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const GoldCheck: React.FC = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#E9A23B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const LandingPage: React.FC = () => {
  // Isi bawaan langsung tampil; isi dari Superadmin (CMS) menggantikannya setelah termuat
  const c = useLandingContent();
  const footerPages = extraFooterPages(usePublishedPages());
  const [menuOpen, setMenuOpen] = useState(false);
  const wa = whatsappLink(c.contact);
  const year = new Date().getFullYear();

  useEffect(() => {
    document.title = 'Manajemen MTQ — Sistem Penilaian Digital MTQ & STQ';
  }, []);

  return (
    <div className="min-h-screen bg-white font-['IBM_Plex_Sans',system-ui,sans-serif] text-[#111827] antialiased">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-[#09403E]"
      >
        Lewati ke konten
      </a>

      {/* HERO */}
      <section id="beranda" className="relative overflow-hidden bg-[#06201F] pb-[120px] text-white">
        <img
          src={c.hero.backgroundImage}
          alt=""
          aria-hidden="true"
          width={2400}
          height={1400}
          fetchPriority="high"
          decoding="async"
          className="absolute right-0 top-0 h-full w-full object-cover [object-position:64%_30%] lg:w-[72%] lg:[object-position:58%_45%]"
        />
        <div aria-hidden="true" className="landing-hero-shade absolute inset-0" />
        <header className="relative z-10 border-b border-white/10">
          <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
            <a href="#beranda" className="flex items-center gap-3 text-white no-underline">
              <LogoTile size={36} />
              <span className="flex flex-col leading-tight">
                <span className="whitespace-nowrap text-[15px] font-bold tracking-[0.02em] sm:text-base">{c.brand.name.toUpperCase()}</span>
                <span className="hidden text-xs text-[#A7C4C2] sm:block">{c.brand.tagline}</span>
              </span>
            </a>
            <nav aria-label="Navigasi utama" className="hidden items-center gap-8 text-sm font-semibold lg:flex">
              {c.nav.map((item, i) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`py-1 no-underline transition-colors ${
                    i === 0 ? 'border-b-2 border-[#E9A23B] text-white' : 'text-[#D7E3E2] hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <a
                href={APP_PATH}
                className="inline-flex h-10 items-center gap-2 rounded-lg border-[1.5px] border-white/70 px-4 text-sm font-semibold text-white no-underline transition-colors hover:bg-white/10"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                </svg>
                Masuk
              </a>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:hidden"
                aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
                aria-expanded={menuOpen}
                aria-controls="menu-ponsel"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            </div>
          </div>
          {menuOpen && (
            <nav id="menu-ponsel" aria-label="Navigasi ponsel" className="border-t border-white/10 px-5 pb-4 lg:hidden">
              <ul className="flex flex-col">
                {c.nav.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="block border-b border-white/[0.06] py-3 text-[15px] font-semibold text-[#D7E3E2] no-underline hover:text-white"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </header>

        <div className="relative z-[1] mx-auto max-w-[1240px] px-5 pb-16 pt-20 sm:px-8 sm:pt-28">
          <div className="flex max-w-[700px] flex-col gap-7">
            <span className="inline-flex h-8 items-center gap-2 self-start rounded-full border border-white/[0.16] bg-white/[0.08] px-3.5 text-sm font-medium text-[#D7E3E2]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E9A23B]" aria-hidden="true" />
              {c.hero.chip}
            </span>
            <h1 className="m-0 text-[clamp(28px,4.4vw,56px)] font-bold leading-[1.18]">{c.hero.title}</h1>
            <p className="m-0 max-w-[560px] text-lg leading-[1.7] text-[#D7E3E2]">{c.hero.subtitle}</p>
            <div className="flex flex-wrap gap-3.5">
              <a
                href={APP_PATH}
                className="inline-flex h-[52px] items-center gap-2.5 rounded-lg bg-white px-6 text-base font-bold text-[#09403E] no-underline transition-colors hover:bg-[#E6F2F1]"
              >
                {c.hero.primaryCta}
                <ArrowRight />
              </a>
              <a
                href="#tahapan"
                className="inline-flex h-[52px] items-center rounded-lg border-2 border-white/85 px-[22px] text-base font-bold text-white no-underline transition-colors hover:bg-white/10"
              >
                {c.hero.secondaryCta}
              </a>
            </div>
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-6 gap-y-2.5 p-0 text-sm text-[#D7E3E2]">
              {c.hero.highlights.map((h) => (
                <li key={h} className="flex items-center gap-2">
                  <GoldCheck />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <main id="konten">
        {/* LATAR BELAKANG — lembar terang menumpuk ke hero */}
        <section className="relative z-[2] -mt-16 rounded-t-[40px] bg-[#F9FAFB] px-5 py-20 sm:rounded-t-[48px] sm:px-8 sm:py-[88px]">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-12">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col items-start gap-[18px]">
              <Chip>{c.background.chip}</Chip>
              <h2 className="m-0 text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.3] text-[#09403E]">{c.background.title}</h2>
              <p className="m-0 text-base leading-[1.75] text-[#4B5563]">{c.background.body}</p>
            </div>
            <div className="grid min-w-0 flex-[2.2_1_640px] grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
              {c.background.cards.map((card) => (
                <article key={card.title} className="flex flex-col gap-3.5">
                  <div className="aspect-[4/3] overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white">
                    <img
                      src={card.image}
                      alt={card.imageAlt}
                      width={1920}
                      height={1200}
                      loading="lazy"
                      decoding="async"
                      className="block h-full w-full object-cover"
                      style={{ objectPosition: card.imagePosition }}
                    />
                  </div>
                  <h3 className="m-0 text-xl font-bold text-[#111827]">{card.title}</h3>
                  <p className="m-0 text-[15px] leading-[1.65] text-[#4B5563]">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PENGGUNA — blok gelap dengan kartu kaca */}
        <section className="bg-[#F9FAFB] px-5 pb-24 sm:px-8">
          <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[28px] bg-[#06201F] p-8 text-white sm:p-12 lg:p-[72px]">
            <img
              src={c.roles.backdrop}
              alt=""
              aria-hidden="true"
              width={1920}
              height={1200}
              loading="lazy"
              decoding="async"
              className="absolute right-[-8%] top-[12%] hidden w-[70%] rounded-2xl opacity-35 md:block"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, #06201F 30%, rgba(6,32,31,0.55) 70%, rgba(6,32,31,0.25) 100%)' }}
            />
            <div className="relative flex max-w-[560px] flex-col gap-8">
              <div className="flex flex-col items-start gap-4">
                <Chip dark>{c.roles.chip}</Chip>
                <h2 className="m-0 text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.3]">{c.roles.title}</h2>
              </div>
              <div className="flex flex-col gap-3.5">
                {c.roles.items.map((item) => (
                  <div
                    key={item.title}
                    className="flex flex-col gap-1.5 rounded-[14px] border border-white/[0.12] bg-white/[0.08] px-[22px] py-5 backdrop-blur-md"
                  >
                    <h3 className="m-0 text-lg font-bold">{item.title}</h3>
                    <p className="m-0 text-[15px] leading-[1.6] text-[#D7E3E2]">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* TAHAPAN — linimasa */}
        <section id="tahapan" className="scroll-mt-4 bg-gradient-to-b from-white to-[#FFF8EC] px-5 py-24 sm:px-8">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-14">
            <div className="flex flex-col items-center gap-4 text-center">
              <Chip>{c.steps.chip}</Chip>
              <h2 className="m-0 text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.3] text-[#09403E]">{c.steps.title}</h2>
              <p className="m-0 max-w-[620px] text-base leading-[1.75] text-[#4B5563]">{c.steps.body}</p>
            </div>
            <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-y-10 p-0">
              {c.steps.items.map((step, i) => {
                const last = i === c.steps.items.length - 1;
                return (
                  <li key={step.title} className="flex flex-col items-center gap-3 px-2.5 text-center">
                    <span className={`text-[15px] font-bold ${last ? 'text-[#09403E]' : 'text-[#111827]'}`}>
                      <span className="sr-only">Tahap {i + 1}: </span>
                      {step.title}
                    </span>
                    <span className="relative flex h-4 w-full items-center justify-center" aria-hidden="true">
                      <span className="absolute inset-x-0 top-[7px] h-0.5 bg-[#E9A23B]" />
                      <span
                        className={`relative h-4 w-4 rounded-full ${
                          last ? 'bg-[#09403E] shadow-[0_0_0_4px_#D5ECEA]' : 'bg-[#E9A23B] shadow-[0_0_0_4px_#FFF1DA]'
                        }`}
                      />
                    </span>
                    <span className="text-sm leading-[1.6] text-[#4B5563]">{step.body}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* FITUR — kartu gambar */}
        <section id="fitur" className="scroll-mt-4 bg-white px-5 py-24 sm:px-8">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex max-w-[640px] flex-col items-start gap-4">
                <Chip>{c.features.chip}</Chip>
                <h2 className="m-0 text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.3] text-[#111827]">{c.features.title}</h2>
              </div>
              <p className="m-0 max-w-[420px] text-base leading-[1.75] text-[#4B5563]">{c.features.body}</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
              {c.features.cards.map((card) => (
                <article key={card.title} className="group relative aspect-[4/5] overflow-hidden rounded-[18px] bg-[#0B2E2C] text-white ring-1 ring-black/5">
                  <img
                    src={card.image}
                    alt={card.imageAlt}
                    width={1920}
                    height={1200}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                    style={{ objectPosition: card.imagePosition }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, rgba(6,32,31,0) 25%, rgba(6,32,31,0.88) 60%, rgba(6,32,31,0.97) 100%)' }}
                  />
                  <div className="absolute inset-x-[22px] bottom-[22px] flex flex-col gap-1.5">
                    <h3 className="m-0 text-xl font-bold">{card.title}</h3>
                    <p className="m-0 text-sm leading-[1.55] text-[#D7E3E2]">{card.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* INTEGRITAS — tampilan log audit asli + lencana terkunci */}
        <section id="integritas" className="scroll-mt-4 bg-white px-5 pb-24 sm:px-8">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-stretch overflow-hidden rounded-3xl border border-[#E5E7EB] shadow-[0_12px_32px_-20px_rgba(9,64,62,0.25)]">
            <div className="relative flex min-h-[340px] min-w-0 flex-[1.1_1_480px] items-center overflow-hidden bg-[#06201F] py-10 pl-6 sm:min-h-[420px] sm:pl-10">
              <svg aria-hidden="true" className="absolute inset-0 h-full w-full">
                <defs>
                  <pattern id="pola-int" width="64" height="64" patternUnits="userSpaceOnUse">
                    <g fill="none" stroke="rgba(110,231,214,0.10)" strokeWidth="1">
                      <rect x="18" y="18" width="28" height="28" />
                      <rect x="18" y="18" width="28" height="28" transform="rotate(45 32 32)" />
                    </g>
                  </pattern>
                  <radialGradient id="glow-int" cx="30%" cy="40%" r="70%">
                    <stop offset="0" stopColor="#159893" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#159893" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#pola-int)" />
                <rect width="100%" height="100%" fill="url(#glow-int)" />
              </svg>
              <div className="relative w-[118%] shrink-0 rounded-l-[14px] bg-white py-2 pl-2 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)]">
                <div className="flex items-center gap-1.5 px-2 pb-2.5 pt-1.5" aria-hidden="true">
                  <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
                  <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
                  <span className="h-[9px] w-[9px] rounded-full bg-[#E5E7EB]" />
                  <span className="ml-2 text-xs font-semibold text-[#4B5563]">{c.integrity.logWindowTitle}</span>
                </div>
                <img
                  src={c.integrity.logImage}
                  alt={c.integrity.logImageAlt}
                  width={1600}
                  height={514}
                  loading="lazy"
                  decoding="async"
                  className="block w-full rounded-l-lg"
                />
              </div>
              <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-[14px] bg-white py-3 pl-3 pr-4 shadow-[0_16px_32px_-12px_rgba(0,0,0,0.45)] sm:bottom-7 sm:left-7">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#09403E]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="#E9A23B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <span className="flex flex-col leading-[1.3]">
                  <span className="text-sm font-bold text-[#111827]">{c.integrity.lockBadgeTitle}</span>
                  <span className="text-xs text-[#4B5563]">{c.integrity.lockBadgeBody}</span>
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-[1_1_440px] flex-col justify-center gap-[18px] p-7 sm:p-[52px]">
              <span className="self-start">
                <Chip>{c.integrity.chip}</Chip>
              </span>
              <h2 className="m-0 text-[clamp(26px,3vw,38px)] font-bold leading-[1.3] text-[#09403E]">{c.integrity.title}</h2>
              <p className="m-0 text-base leading-[1.75] text-[#4B5563]">{c.integrity.body}</p>
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-3 p-0 text-[15px] leading-[1.55] text-[#374151]">
                {c.integrity.points.map((point) => (
                  <li key={point} className="flex gap-2.5">
                    <Check />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* TANYA JAWAB */}
        <section id="tanya-jawab" className="scroll-mt-4 bg-[#F9FAFB] px-5 py-24 sm:px-8">
          <div className="mx-auto flex max-w-[960px] flex-col gap-9">
            <h2 className="m-0 text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.3] text-[#09403E]">{c.faq.title}</h2>
            <div className="flex flex-col">
              {c.faq.items.map((item) => (
                <details key={item.question} className="group border-b border-[#E5E7EB]">
                  <summary className="flex min-h-[68px] cursor-pointer list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-3.5 text-[17px] font-bold text-[#111827]">
                      <span className="h-[22px] w-1 shrink-0 rounded-sm bg-[#159893]" aria-hidden="true" />
                      {item.question}
                    </span>
                    <svg
                      className="h-5 w-5 shrink-0 text-[#4B5563] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <p className="m-0 mb-[22px] ml-[18px] text-[15px] leading-[1.75] text-[#4B5563]">{item.answer}</p>
                </details>
              ))}
            </div>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 self-center text-center text-[15px] font-bold text-[#0E6F6B] no-underline hover:text-[#09403E]"
            >
              {c.faq.contactPrompt}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      {/* CTA + FOOTER */}
      <footer className="bg-[#06201F] text-[#D7E3E2]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-14 px-5 pb-12 pt-20 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-7 border-b border-white/10 pb-12">
            <div className="flex max-w-[620px] flex-col gap-2.5">
              <h2 className="m-0 text-[clamp(26px,3vw,38px)] font-bold leading-[1.3] text-white">{c.cta.title}</h2>
              <p className="m-0 text-base leading-[1.7]">{c.cta.body}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={APP_PATH}
                className="inline-flex h-[50px] items-center rounded-lg bg-white px-[22px] text-[15px] font-bold text-[#09403E] no-underline transition-colors hover:bg-[#E6F2F1]"
              >
                {c.cta.primary}
              </a>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-[50px] items-center rounded-lg border-2 border-white/80 px-5 text-[15px] font-bold text-white no-underline transition-colors hover:bg-white/10"
              >
                {c.cta.secondary}
              </a>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-8 text-sm leading-[1.7]">
            <div className="flex max-w-[340px] flex-col gap-3">
              <span className="flex items-center gap-2.5 font-bold tracking-[0.02em] text-white">
                <LogoTile size={28} />
                {c.brand.name.toUpperCase()}
              </span>
              <span>{c.footer.about}</span>
            </div>
            <nav aria-label="Tautan footer" className="flex flex-col gap-1.5">
              <span className="font-bold text-white">Tautan</span>
              <a href="#fitur" className="text-[#D7E3E2] no-underline hover:text-white">Fitur</a>
              <a href="#tahapan" className="text-[#D7E3E2] no-underline hover:text-white">Tahapan</a>
              <a href="#tanya-jawab" className="text-[#D7E3E2] no-underline hover:text-white">Tanya Jawab</a>
              <a href={APP_PATH} className="text-[#D7E3E2] no-underline hover:text-white">Masuk Sistem</a>
            </nav>
            <nav aria-label="Informasi" className="flex flex-col gap-1.5">
              <span className="font-bold text-white">Informasi</span>
              {CORE_FOOTER_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="text-[#D7E3E2] no-underline hover:text-white">
                  {l.label}
                </a>
              ))}
              {footerPages.map((p) => (
                <a key={p.slug} href={`/${p.slug}`} className="text-[#D7E3E2] no-underline hover:text-white">
                  {p.title}
                </a>
              ))}
            </nav>
            <address className="flex flex-col gap-1.5 not-italic">
              <span className="font-bold text-white">Kontak</span>
              <span>{c.contact.address}</span>
              <a href={`mailto:${c.contact.email}`} className="text-[#D7E3E2] no-underline hover:text-white">
                {c.contact.email}
              </a>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[#D7E3E2] no-underline hover:text-white">
                WhatsApp {c.contact.whatsappDisplay}
              </a>
            </address>
          </div>
          <div className="flex flex-wrap justify-between gap-3 text-[13px] text-[#A7C4C2]">
            <span>
              © {year} {c.footer.copyright}
            </span>
            <a href={APP_PATH} className="text-[#A7C4C2] no-underline hover:text-white">
              Masuk Sistem
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
