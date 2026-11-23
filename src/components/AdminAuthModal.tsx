import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, GraduationCap, KeyRound, Loader2, Lock, ShieldCheck, X } from 'lucide-react';

interface AdminAuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string) => void;
  onGoogleGuruLogin?: () => void;
  googleLoading?: boolean;
}

interface AdminStatusResponse {
  ok: boolean;
  configured: boolean;
  needsSetup: boolean;
  source: 'env' | 'stored' | 'unconfigured';
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  open,
  onClose,
  onAuthenticated,
  onGoogleGuruLogin,
  googleLoading = false,
}) => {
  const [statusLoading, setStatusLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    setStatusLoading(true);

    fetch('/api/admin/status')
      .then((res) => res.json() as Promise<AdminStatusResponse>)
      .then((data) => {
        if (!active) return;
        setNeedsSetup(Boolean(data.needsSetup));
      })
      .catch(() => {
        if (!active) return;
        setErrorMsg('Gagal memeriksa status autentikasi admin di server.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg('Password admin minimal 6 karakter.');
      return;
    }
    if (needsSetup && password !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/admin/setup' : '/api/admin/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token) {
        if (data?.needsSetup) {
          setNeedsSetup(true);
        }
        setErrorMsg(data?.error || 'Password admin tidak valid.');
        return;
      }
      setPassword('');
      setConfirmPassword('');
      onAuthenticated(data.token);
    } catch {
      setErrorMsg('Koneksi ke server autentikasi admin gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/80 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-auth-title"
        className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-sky-500/15 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              {needsSetup ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 id="admin-auth-title" className="text-lg font-extrabold">
                {needsSetup ? 'Aktivasi Password Admin Website' : 'Login Admin & Dashboard Guru'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {needsSetup
                  ? 'Atur password admin website untuk mengunci akses Dashboard Guru.'
                  : 'Masukkan password admin website terverifikasi server.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup dialog admin"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusLoading ? (
          <div className="py-10 flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
            <p className="mt-2 text-xs font-medium">Memeriksa keamanan server...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="admin-password-input" className="block text-xs font-semibold mb-1.5">
                {needsSetup ? 'Password Admin Baru' : 'Password Admin Website'}
              </label>
              <div className="relative">
                <input
                  id="admin-password-input"
                  data-testid="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password admin..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {needsSetup && (
              <div>
                <label htmlFor="admin-password-confirm" className="block text-xs font-semibold mb-1.5">
                  Konfirmasi Password Admin
                </label>
                <input
                  id="admin-password-confirm"
                  data-testid="admin-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi password admin..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              data-testid="admin-submit-btn"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {needsSetup ? 'Aktifkan & Masuk Dashboard Admin' : 'Verifikasi & Masuk Dashboard'}
            </button>

            {onGoogleGuruLogin && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={onGoogleGuruLogin}
                  className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-2"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GraduationCap className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                  )}
                  Atau Masuk dengan Akun Google Guru
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
