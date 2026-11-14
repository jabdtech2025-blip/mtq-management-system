import React, { useEffect, useMemo, useState } from 'react';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import { useMtq } from '../../context/MtqContext';
import { LogoTile } from '../brand/Logo';
import { landingContent, whatsappLink } from '../../content/landing';

/**
 * Halaman masuk (gerbang akses) aplikasi.
 * Status yang ditangani: masuk, galat, lupa kata sandi, tautan terkirim, atur kata sandi baru (mode pemulihan),
 * diagnosis akses (akun sudah login tetapi belum punya profil / keanggotaan), dan Mode Demo.
 */

type AuthStep = 'login' | 'forgot' | 'sent';

const RESEND_SECONDS = 45;
const HERO_IMAGE = '/landing/hero-podium.webp';
const TAGLINE = 'Penilaian yang tertib, hasil yang dapat dipertanggungjawabkan.';

/** Ubah pesan galat teknis dari layanan autentikasi menjadi kalimat yang mudah dipahami. */
export function friendlyAuthMessage(raw: string): string {
  const text = raw || '';
  if (/invalid login credentials|invalid_credentials|invalid email or password/i.test(text)) {
    return 'Email atau kata sandi salah. Periksa kembali, atau atur ulang kata sandi Anda.';
  }
  if (/email not confirmed/i.test(text)) {
    return 'Email belum dikonfirmasi. Buka tautan konfirmasi yang dikirim ke email Anda.';
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(text)) {
    return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
  }
  if (/failed to fetch|network/i.test(text)) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.';
  }
  return text.replace(/^Autentikasi gagal:\s*/i, '');
}

/** Skor kekuatan kata sandi 0–4 beserta daftar syarat. */
export function evaluatePasswordStrength(pw: string) {
  const rules = {
    length: pw.length >= 8,
    lettersAndDigits: /[A-Za-z]/.test(pw) && /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw)
  };
  let score = 0;
  if (rules.length) score += 1;
  if (rules.lettersAndDigits) score += 1;
  if (rules.symbol) score += 1;
  if (pw.length >= 12 && score === 3) score += 1;
  const labels = ['Terlalu lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];
  return { score, label: pw ? labels[score] : '', rules };
}

/* ---------- Ikon kecil (SVG sebaris, tanpa pustaka tambahan) ---------- */
const Svg: React.FC<{ size?: number; className?: string; stroke?: string; strokeWidth?: number; children: React.ReactNode }> = ({
  size = 18,
  className,
  stroke = 'currentColor',
  strokeWidth = 2,
  children
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);
const IconCheck: React.FC<{ color?: string; size?: number }> = ({ color = '#E9A23B', size = 16 }) => (
  <Svg size={size} stroke={color} strokeWidth={2.6}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const IconArrowRight = () => (
  <Svg>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
const IconArrowLeft = () => (
  <Svg size={16}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
const IconEye: React.FC<{ off?: boolean }> = ({ off }) => (
  <Svg>
    {off ? (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </Svg>
);
const Spinner = () => (
  <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ---------- Komponen bentuk ---------- */
const inputBase =
  'h-12 w-full rounded-[10px] border bg-white px-3.5 text-[15px] text-[#111827] placeholder:text-[#9CA3AF] outline-none transition-shadow focus:border-[#159893] focus:shadow-[0_0_0_3px_rgba(21,152,147,0.18)] disabled:bg-[#F9FAFB]';

const Field: React.FC<{ id: string; label: string; aside?: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }> = ({
  id,
  label,
  aside,
  hint,
  children
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-semibold text-[#111827]">
        {label}
      </label>
      {aside}
    </div>
    {children}
    {hint}
  </div>
);

const PasswordInput: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}> = ({ id, value, onChange, placeholder, autoComplete, invalid, describedBy }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${inputBase} pr-12 ${invalid ? 'border-[#DC2626]' : 'border-[#D1D5DB]'}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        aria-pressed={visible}
        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#159893]"
      >
        <IconEye off={visible} />
      </button>
    </div>
  );
};

const PrimaryButton: React.FC<{ loading?: boolean; disabled?: boolean; children: React.ReactNode; type?: 'submit' | 'button'; onClick?: () => void }> = ({
  loading,
  disabled,
  children,
  type = 'submit',
  onClick
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#09403E] text-base font-bold text-white transition-colors hover:bg-[#06302E] disabled:cursor-not-allowed disabled:bg-[#9CA3AF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#159893]"
  >
    {loading && <Spinner />}
    {children}
  </button>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded text-sm font-semibold text-[#0E6F6B] hover:text-[#09403E] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#159893] ${className}`}
  >
    {children}
  </button>
);

const Alert: React.FC<{ tone: 'error' | 'success' | 'info'; title?: string; children: React.ReactNode }> = ({ tone, title, children }) => {
  const styles = {
    error: 'border-[#FECACA] bg-[#FEF2F2] text-[#7F1D1D]',
    success: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#064E3B]',
    info: 'border-[#E5E7EB] bg-[#F9FAFB] text-[#374151]'
  }[tone];
  const iconColor = { error: '#DC2626', success: '#059669', info: '#0E6F6B' }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-relaxed ${styles}`}>
      <span className="mt-0.5 shrink-0">
        {tone === 'success' ? (
          <IconCheck color={iconColor} size={18} />
        ) : (
          <Svg size={18} stroke={iconColor}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </Svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="m-0 font-bold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
};

const IconBadge: React.FC<{ tone?: 'teal' | 'green'; children: React.ReactNode }> = ({ tone = 'teal', children }) => (
  <span
    className={`flex h-12 w-12 items-center justify-center rounded-xl ${
      tone === 'green' ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[rgba(21,152,147,0.12)] text-[#0E6F6B]'
    }`}
  >
    {children}
  </span>
);

const Heading: React.FC<{ title: string; body?: React.ReactNode }> = ({ title, body }) => (
  <div className="flex flex-col gap-2">
    <h1 className="m-0 text-[28px] font-bold leading-tight text-[#09403E] sm:text-[30px]">{title}</h1>
    {body && <p className="m-0 text-[15px] leading-relaxed text-[#4B5563]">{body}</p>}
  </div>
);

/* ---------- Halaman ---------- */
export const AuthenticationGateView: React.FC = () => {
  const {
    connectionInfo,
    authenticatedProfile,
    accessGateReason,
    workspaceError,
    isPasswordRecoveryMode,
    setIsPasswordRecoveryMode,
    refreshSupabaseConnection,
    signInWithSupabase,
    signOutSupabase,
    requestPasswordReset,
    completePasswordReset,
    bootstrapFirstSuperadmin,
    enterOfflineDemoSimulation
  } = useMtq();

  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const wa = whatsappLink(landingContent.contact);
  const year = new Date().getFullYear();
  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === newPassword;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const goTo = (next: AuthStep) => {
    setStep(next);
    setError(null);
    setNotice(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await signInWithSupabase(email.trim(), password);
      if (res.success) {
        setPassword('');
        setNotice(res.message);
      } else {
        setError(friendlyAuthMessage(res.message));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendResetLink = async () => {
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res.success) {
        setStep('sent');
        setResendIn(RESEND_SECONDS);
      } else {
        setError(friendlyAuthMessage(res.message));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendResetLink();
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Kata sandi baru wajib minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await completePasswordReset(newPassword);
      if (res.success) {
        setNewPassword('');
        setConfirmPassword('');
        setNotice(res.message);
      } else {
        setError(friendlyAuthMessage(res.message));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBootstrap = async () => {
    if (!authenticatedProfile?.email) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await bootstrapFirstSuperadmin(authenticatedProfile.email);
      if (res.success) setNotice(res.message);
      else setError(res.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await refreshSupabaseConnection();
    } finally {
      setIsSubmitting(false);
    }
  };

  const showDiagnostic =
    !isPasswordRecoveryMode &&
    !!authenticatedProfile &&
    accessGateReason !== 'unauthenticated' &&
    accessGateReason !== 'supabase_unconfigured' &&
    accessGateReason !== 'connection_checking';

  /* ----- Diagnosis akses: sudah login tetapi belum punya hak akses ----- */
  const renderDiagnostic = () => {
    if (!authenticatedProfile) return null;
    let title = 'Akses ke workspace belum aktif';
    let description =
      authenticatedProfile.verificationError ||
      workspaceError ||
      'Akun Anda belum memiliki hak akses aktif ke penyelenggara MTQ mana pun.';

    if (accessGateReason === 'profile_missing') {
      title = 'Profil pengguna belum terdaftar';
      description =
        authenticatedProfile.verificationError ||
        `Akun ${authenticatedProfile.email} berhasil masuk, tetapi profilnya belum tercatat. Bila ini akun pengelola platform pertama, gunakan tombol "Bootstrap Superadmin Pertama" di bawah.`;
    } else if (accessGateReason === 'membership_empty') {
      title = 'Belum ditugaskan ke penyelenggara';
      description = `Akun ${authenticatedProfile.email} belum ditugaskan ke penyelenggara MTQ mana pun. Bila ini akun pengelola platform pertama, gunakan tombol "Bootstrap Superadmin Pertama". Bila Anda admin atau dewan hakim, hubungi pengelola untuk penugasan.`;
    } else if (accessGateReason === 'membership_inactive') {
      title = 'Keanggotaan nonaktif';
      description =
        authenticatedProfile.verificationError ||
        `Seluruh keanggotaan penyelenggara untuk akun ${authenticatedProfile.email} sedang nonaktif. Hubungi pengelola.`;
    } else if (accessGateReason === 'query_error') {
      title = 'Gagal memeriksa hak akses';
      description =
        authenticatedProfile.verificationError || 'Terjadi kesalahan saat membaca profil dan keanggotaan Anda. Coba periksa ulang.';
    } else if (accessGateReason === 'workspace_hydration_error') {
      title = 'Gagal memuat data penyelenggara';
      description = workspaceError || 'Anda sudah masuk, tetapi sebagian data penyelenggara gagal dimuat. Coba periksa ulang.';
    }

    return (
      <>
        <Heading title={title} body="Anda sudah masuk, tetapi akun ini belum dapat membuka aplikasi." />
        <Alert tone="error">
          <p className="m-0">{description}</p>
          <p className="m-0 mt-2 break-all font-mono text-xs opacity-80">
            {authenticatedProfile.email} · peran: {authenticatedProfile.globalRole}
          </p>
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <div className="flex flex-col gap-3">
          {(accessGateReason === 'profile_missing' || accessGateReason === 'membership_empty') && (
            <PrimaryButton type="button" onClick={() => void handleBootstrap()} loading={isSubmitting}>
              Bootstrap Superadmin Pertama
            </PrimaryButton>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-[10px] border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
            >
              Periksa Ulang Akses
            </button>
            <button
              type="button"
              onClick={() => void signOutSupabase()}
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-[10px] border border-[#FECACA] bg-white px-4 text-sm font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-60"
            >
              Keluar dari Sesi Ini
            </button>
          </div>
        </div>
      </>
    );
  };

  /* ----- Atur kata sandi baru (setelah membuka tautan email) ----- */
  const renderRecovery = () => (
    <>
      <IconBadge>
        <Svg size={22}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </Svg>
      </IconBadge>
      <Heading title="Atur kata sandi baru" body="Tautan Anda terverifikasi. Buat kata sandi baru untuk akun ini." />
      <form onSubmit={handleCompleteRecovery} className="flex flex-col gap-[18px]" noValidate>
        <Field
          id="sandi-baru"
          label="Kata sandi baru"
          hint={
            <div className="flex flex-col gap-2.5" id="sandi-baru-syarat">
              <div className="flex items-center gap-3">
                <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full ${
                        i < strength.score
                          ? strength.score <= 1
                            ? 'bg-[#DC2626]'
                            : strength.score === 2
                              ? 'bg-[#E9A23B]'
                              : 'bg-[#159893]'
                          : 'bg-[#E5E7EB]'
                      }`}
                    />
                  ))}
                </div>
                <span className="min-w-[84px] text-right text-xs font-semibold text-[#4B5563]" aria-live="polite">
                  {strength.label}
                </span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {[
                  { ok: strength.rules.length, text: 'Minimal 8 karakter' },
                  { ok: strength.rules.lettersAndDigits, text: 'Mengandung huruf dan angka' },
                  { ok: strength.rules.symbol, text: 'Simbol (disarankan)' }
                ].map((r) => (
                  <li key={r.text} className={`flex items-center gap-2 ${r.ok ? 'text-[#0E6F6B]' : 'text-[#6B7280]'}`}>
                    {r.ok ? (
                      <IconCheck color="#159893" size={14} />
                    ) : (
                      <span className="mx-[3px] h-2 w-2 rounded-full border border-[#9CA3AF]" aria-hidden="true" />
                    )}
                    <span>
                      {r.text}
                      <span className="sr-only">{r.ok ? ' — terpenuhi' : ' — belum'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          }
        >
          <PasswordInput
            id="sandi-baru"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Minimal 8 karakter"
            autoComplete="new-password"
            describedBy="sandi-baru-syarat"
          />
        </Field>
        <Field
          id="sandi-konfirmasi"
          label="Ulangi kata sandi baru"
          hint={
            confirmPassword.length > 0 && (
              <p className={`m-0 flex items-center gap-1.5 text-[13px] font-semibold ${passwordsMatch ? 'text-[#0E6F6B]' : 'text-[#B91C1C]'}`}>
                {passwordsMatch ? <IconCheck color="#159893" size={14} /> : null}
                {passwordsMatch ? 'Kata sandi cocok' : 'Kata sandi belum cocok'}
              </p>
            )
          }
        >
          <PasswordInput
            id="sandi-konfirmasi"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Ketik ulang kata sandi baru"
            autoComplete="new-password"
            invalid={confirmPassword.length > 0 && !passwordsMatch}
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <PrimaryButton loading={isSubmitting} disabled={!strength.rules.length || !passwordsMatch}>
          {isSubmitting ? 'Menyimpan…' : 'Simpan kata sandi'}
        </PrimaryButton>
      </form>
      <LinkButton
        className="self-center"
        onClick={() => {
          setIsPasswordRecoveryMode(false);
          setError(null);
          setNotice(null);
        }}
      >
        <IconArrowLeft />
        Batal dan kembali ke halaman masuk
      </LinkButton>
    </>
  );

  /* ----- Masuk ----- */
  const renderLogin = () => (
    <>
      <Heading
        title="Masuk ke sistem"
        body="Untuk panitia, dewan hakim, dan pengelola yang telah diundang. Pendaftaran mandiri tidak tersedia."
      />
      {connectionInfo.isConfigured ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-[18px]">
          {error && (
            <Alert tone="error" title="Gagal masuk">
              <p className="m-0">{error}</p>
              <LinkButton className="mt-1" onClick={() => goTo('forgot')}>
                Atur ulang kata sandi
              </LinkButton>
            </Alert>
          )}
          {notice && <Alert tone="success">{notice}</Alert>}
          <Field id="masuk-email" label="Email">
            <input
              id="masuk-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@instansi.id"
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={error ? true : undefined}
              className={`${inputBase} ${error ? 'border-[#DC2626]' : 'border-[#D1D5DB]'}`}
            />
          </Field>
          <Field
            id="masuk-sandi"
            label="Kata sandi"
            aside={<LinkButton onClick={() => goTo('forgot')}>Lupa kata sandi?</LinkButton>}
          >
            <PasswordInput
              id="masuk-sandi"
              value={password}
              onChange={setPassword}
              placeholder="Masukkan kata sandi"
              autoComplete="current-password"
              invalid={!!error}
            />
          </Field>
          <PrimaryButton loading={isSubmitting}>
            {isSubmitting ? 'Memeriksa…' : 'Masuk'}
            {!isSubmitting && <IconArrowRight />}
          </PrimaryButton>
        </form>
      ) : (
        <Alert tone="info" title="Masuk dengan akun belum tersedia">
          Layanan akun belum diaktifkan pada alamat ini. Anda tetap dapat mencoba aplikasi melalui Mode Demo.
        </Alert>
      )}

      <div className="flex items-center gap-3 text-[13px] text-[#6B7280]" aria-hidden="true">
        <span className="h-px flex-1 bg-[#E5E7EB]" />
        atau
        <span className="h-px flex-1 bg-[#E5E7EB]" />
      </div>

      <button
        type="button"
        onClick={enterOfflineDemoSimulation}
        aria-label="Coba Mode Demo — jelajahi aplikasi dengan data contoh, tanpa menyimpan data"
        className="flex w-full items-center gap-3.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3.5 text-left text-[#111827] transition-colors hover:border-[#159893]/50 hover:bg-[#F0FAF9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#159893]"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[rgba(21,152,147,0.12)] text-[#0E6F6B]">
          <Svg size={20}>
            <path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3" />
            <path d="M7 15h10" />
          </Svg>
        </span>
        <span className="flex flex-1 flex-col leading-snug">
          <span className="text-[15px] font-bold">Coba Mode Demo</span>
          <span className="text-[13px] text-[#4B5563]">Jelajahi aplikasi dengan data contoh, tanpa menyimpan data</span>
        </span>
        <Svg stroke="#6B7280">
          <path d="M9 6l6 6-6 6" />
        </Svg>
      </button>

      <p className="m-0 text-[13px] leading-relaxed text-[#6B7280]">
        Belum punya akun? Hubungi panitia penyelenggara atau pengelola di{' '}
        <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0E6F6B] no-underline hover:text-[#09403E] hover:underline">
          WhatsApp
        </a>
        .
      </p>
    </>
  );

  /* ----- Lupa kata sandi ----- */
  const renderForgot = () => (
    <>
      <LinkButton className="self-start text-[#4B5563]" onClick={() => goTo('login')}>
        <IconArrowLeft />
        Kembali ke halaman masuk
      </LinkButton>
      <IconBadge>
        <Svg size={22}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </Svg>
      </IconBadge>
      <Heading
        title="Lupa kata sandi?"
        body="Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat kata sandi baru."
      />
      <form onSubmit={handleForgot} className="flex flex-col gap-[18px]">
        <Field id="lupa-email" label="Email terdaftar">
          <input
            id="lupa-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@instansi.id"
            autoComplete="email"
            inputMode="email"
            required
            className={`${inputBase} ${error ? 'border-[#DC2626]' : 'border-[#D1D5DB]'}`}
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <PrimaryButton loading={isSubmitting}>
          {isSubmitting ? 'Mengirim…' : 'Kirim tautan'}
        </PrimaryButton>
      </form>
      <p className="m-0 text-[13px] leading-relaxed text-[#6B7280]">
        Tidak menerima email dalam beberapa menit? Periksa folder spam, atau hubungi panitia penyelenggara.
      </p>
    </>
  );

  /* ----- Tautan terkirim ----- */
  const renderSent = () => (
    <>
      <IconBadge tone="green">
        <IconCheck color="#059669" size={24} />
      </IconBadge>
      <Heading
        title="Periksa email Anda"
        body={
          <>
            Bila <strong className="font-semibold text-[#111827] break-all">{email.trim()}</strong> terdaftar, tautan untuk membuat
            kata sandi baru sudah dikirim ke alamat tersebut.
          </>
        }
      />
      <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm text-[#374151]">
        {['Buka email dari Manajemen MTQ.', 'Klik tautan "Atur ulang kata sandi".', 'Buat kata sandi baru, lalu masuk kembali.'].map((t, i) => (
          <li key={t} className="flex items-center gap-3">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#F3F4F6] text-[13px] font-bold text-[#09403E]">
              {i + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
      {error && <Alert tone="error">{error}</Alert>}
      <button
        type="button"
        onClick={() => void sendResetLink()}
        disabled={resendIn > 0 || isSubmitting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-[#D1D5DB] bg-white text-[15px] font-semibold text-[#111827] hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:text-[#9CA3AF]"
      >
        {isSubmitting && <Spinner />}
        {resendIn > 0 ? `Kirim ulang dalam 0:${String(resendIn).padStart(2, '0')}` : 'Kirim ulang tautan'}
      </button>
      <LinkButton className="self-center" onClick={() => goTo('login')}>
        <IconArrowLeft />
        Kembali ke halaman masuk
      </LinkButton>
    </>
  );

  const content = isPasswordRecoveryMode
    ? renderRecovery()
    : showDiagnostic
      ? renderDiagnostic()
      : step === 'forgot'
        ? renderForgot()
        : step === 'sent'
          ? renderSent()
          : renderLogin();

  return (
    <div className="flex min-h-screen bg-white font-['IBM_Plex_Sans',system-ui,sans-serif] text-[#111827] antialiased">
      {/* Panel kiri (desktop) */}
      <aside className="relative hidden min-h-screen flex-[1_1_52%] flex-col justify-between overflow-hidden bg-[#06201F] px-14 py-10 text-white lg:flex">
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden="true"
          width={2400}
          height={1400}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover [object-position:62%_50%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(6,32,31,0.92) 0%, rgba(6,32,31,0.35) 38%, rgba(6,32,31,0.45) 60%, #06201F 100%)'
          }}
        />
        <a href="/" className="relative flex items-center gap-3 text-white no-underline">
          <LogoTile size={40} />
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-[0.02em]">MANAJEMEN MTQ</span>
            <span className="text-xs text-[#A7C4C2]">E-Scoring Musabaqah</span>
          </span>
        </a>
        <div className="relative flex max-w-[520px] flex-col gap-[18px]">
          <p className="m-0 text-[34px] font-bold leading-[1.25]">{TAGLINE}</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] text-[#D7E3E2]">
            {['Nilai dan peringkat dihitung server', 'Setiap tindakan tercatat di log audit', 'Hasil terkunci setelah disahkan'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <IconCheck />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Panel isi */}
      <main className="flex min-w-0 flex-[1_1_48%] flex-col bg-white">
        {/* Kepala ponsel */}
        <div className="relative overflow-hidden bg-[#06201F] px-5 pb-7 pt-5 text-white lg:hidden">
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden="true"
            width={2400}
            height={1400}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-55 [object-position:62%_50%]"
          />
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,32,31,0.7), #06201F)' }} />
          <div className="relative flex items-center justify-between gap-3">
            <a href="/" className="flex items-center gap-2.5 text-white no-underline">
              <LogoTile size={36} />
              <span className="text-[15px] font-bold tracking-[0.02em]">MANAJEMEN MTQ</span>
            </a>
            <a href="/" className="text-[13px] font-semibold text-[#D7E3E2] no-underline hover:text-white">
              Beranda
            </a>
          </div>
          <p className="relative m-0 mt-10 text-xl font-bold leading-snug">{TAGLINE}</p>
        </div>

        <div className="hidden justify-end px-8 pt-6 lg:flex">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4B5563] no-underline hover:text-[#09403E]">
            <IconArrowLeft />
            Kembali ke beranda
          </a>
        </div>

        <div className="flex flex-1 items-start justify-center px-5 pb-10 pt-7 lg:items-center lg:px-12 lg:pb-12 lg:pt-8">
          <div className="flex w-full max-w-[400px] flex-col gap-7">{content}</div>
        </div>

        <div className="flex flex-wrap justify-between gap-2 px-5 pb-6 text-[13px] text-[#6B7280] lg:px-8">
          <span>© {year} Manajemen MTQ</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="/panduan" className="text-[#6B7280] no-underline hover:text-[#09403E]">
              Panduan
            </a>
            <a href="/privasi" className="text-[#6B7280] no-underline hover:text-[#09403E]">
              Privasi
            </a>
            <a href="/ketentuan" className="text-[#6B7280] no-underline hover:text-[#09403E]">
              Ketentuan
            </a>
            <a href={`mailto:${landingContent.contact.email}`} className="text-[#6B7280] no-underline hover:text-[#09403E]">
              {landingContent.contact.email}
            </a>
          </span>
        </div>
      </main>
    </div>
  );
};

export default AuthenticationGateView;
