import React from 'react';
import { X, Check, ShieldCheck, UserCheck, Gavel, User, AlertCircle } from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const DemoAccountModal: React.FC = () => {
  const {
    users,
    currentUser,
    setCurrentUserId,
    isDemoAccountModalOpen,
    setIsDemoAccountModalOpen,
    setCurrentView,
    tenants,
    currentTenant,
    setTenantId
  } = useMtq();

  if (!isDemoAccountModalOpen) return null;

  const handleSelectUser = (uId: string) => {
    const selected = users.find((u) => u.id === uId);
    if (!selected) return;

    setCurrentUserId(uId);

    // If user belongs to a specific tenant, switch context for testing
    if (selected.tenantId && selected.tenantId !== 'platform') {
      setTenantId(selected.tenantId);
    }

    // Set initial view according to role
    if (selected.role === 'superadmin') {
      setCurrentView('superadmin_dashboard');
    } else if (selected.role === 'judge') {
      setCurrentView('penilaian_hakim');
    } else {
      setCurrentView('dashboard');
    }

    setIsDemoAccountModalOpen(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white text-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                Pilih Akun Simulasi Prototype
              </h3>
              <p className="text-[11px] text-slate-500">
                Khusus evaluasi antarmuka — bukan autentikasi produksi
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDemoAccountModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Pilih peran pengguna di bawah ini untuk menguji navigasi dan alur kerja masing-masing persona (Superadmin Platform, Admin MTQ, dan Dewan Hakim).
            </p>
          </div>

          {/* Group 1: Superadmin */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Persona: Superadmin Platform
            </p>
            <div className="space-y-1.5">
              {users
                .filter((u) => u.role === 'superadmin')
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUser(u.id)}
                    className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                      u.id === currentUser.id
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs shrink-0">
                        SA
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{u.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {u.email} · Akses Multi-Tenant & Audit
                        </p>
                      </div>
                    </div>
                    {u.id === currentUser.id && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" />
                        Aktif
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>

          {/* Group 2: Admin MTQ */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Persona: Administrator Event MTQ
            </p>
            <div className="space-y-1.5">
              {users
                .filter((u) => u.role === 'admin')
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUser(u.id)}
                    className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                      u.id === currentUser.id
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                        ADM
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{u.name}</p>
                        <p className="text-[11px] text-slate-500">
                          LPTQ Provinsi Jawa Barat · Pengelola Data, Babak & Kelulusan
                        </p>
                      </div>
                    </div>
                    {u.id === currentUser.id && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" />
                        Aktif
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>

          {/* Group 3: Dewan Hakim */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Persona: Dewan Hakim Penilai
            </p>
            <div className="space-y-1.5">
              {users
                .filter((u) => u.role === 'judge')
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUser(u.id)}
                    className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                      u.id === currentUser.id
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                        <Gavel className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{u.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {u.judgeCategory} · {u.judgeField}
                        </p>
                      </div>
                    </div>
                    {u.id === currentUser.id && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" />
                        Aktif
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={() => setIsDemoAccountModalOpen(false)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
