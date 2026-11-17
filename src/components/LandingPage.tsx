import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Compass,
  FileSpreadsheet,
  Gamepad2,
  GraduationCap,
  Link2,
  Moon,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { EduverseWorldEngine } from '../game/EduverseWorldEngine.ts';
import { WORLD_ZONES } from '../utils/gameRules.ts';

interface LandingPageProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onLoginRole: (role: 'guru' | 'siswa') => void;
  onEnterDemoTeacher: () => void;
  onOpenJoinCode: (code: string) => void;
  onStartDemoWorld: () => void;
  authLoading: boolean;
  authError: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  darkMode,
  onToggleTheme,
  onLoginRole,
  onEnterDemoTeacher,
  onOpenJoinCode,
  onStartDemoWorld,
  authLoading,
  authError,
}) => {
  const heroCanvasRef = useRef<HTMLDivElement | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('EDU101');
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    const el = heroCanvasRef.current;
    if (!el) return;
    const engine = new EduverseWorldEngine(el, { mode: 'tour' });
    return () => engine.dispose();
  }, []);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCodeInput.trim().toUpperCase().replace(/^.*\/JOIN\//i, '');
    if (!cleaned || cleaned.length < 4) {
      setCodeError('Masukkan kode sesi minimal 4 karakter (contoh: EDU101).');
      return;
    }
    setCodeError('');
    onOpenJoinCode(cleaned);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#beranda"
            className="text-xl font-extrabold tracking-tight text-blue-600 dark:text-sky-400 whitespace-nowrap shrink-0 font-display"
          >
            EDUVERSE
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#dunia-3d"
              className="hover:text-blue-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap shrink-0"
            >
              Dunia 3D
            </a>
            <a
              href="#fitur-guru"
              className="hover:text-blue-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap shrink-0"
            >
              Fitur Guru
            </a>
            <a
              href="#cara-bermain"
              className="hover:text-blue-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap shrink-0"
            >
              Cara Bermain
            </a>
            <a
              href="#gabung-sesi"
              className="hover:text-blue-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap shrink-0"
            >
              Gabung Sesi
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onEnterDemoTeacher}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Dashboard Guru
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section with Live 3D World Tour */}
      <section id="beranda" className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-semibold tracking-wider text-blue-600 dark:text-sky-400">
              Platform Edukasi 3D · Kelas 10–12 SMA · Multiplayer & AI
            </p>
            <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight text-balance">
              Jelajahi Dunia Belajar 3D yang Seru dan Interaktif
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Eduverse mengubah latihan soal dan materi pelajaran menjadi petualangan dunia virtual 3D.
              Guru mengimpor soal Word (.docx) dan membagikan satu tautan sesi; siswa menjelajah, menjawab misi NPC,
              dan bersaing di papan peringkat realtime.
            </p>

            {authError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
              >
                {authError}
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onStartDemoWorld}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-colors whitespace-nowrap shrink-0"
              >
                <Gamepad2 className="w-4 h-4" />
                Jelajahi Dunia 3D
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => onLoginRole('guru')}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                <GraduationCap className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                Masuk sebagai Guru
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => onLoginRole('siswa')}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Masuk sebagai Siswa
              </button>
            </div>

            {/* Direct Join Code Form */}
            <form
              id="gabung-sesi"
              onSubmit={handleJoinSubmit}
              className="mt-7 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <label
                htmlFor="hero-join-code"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
              >
                Punya tautan atau kode sesi dari guru? Masukkan langsung di sini:
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="hero-join-code"
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  placeholder="Contoh: EDU101 atau FIS202"
                  className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm font-mono uppercase tracking-wider text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Gabung Sesi
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              {codeError && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{codeError}</p>
              )}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sesi aktif siap coba: <span className="font-mono font-semibold">EDU101</span> (Biologi Sel) ·{' '}
                <span className="font-mono font-semibold">FIS202</span> (Hukum Newton)
              </p>
            </form>
          </div>

          {/* Live 3D World Viewport */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="relative flex-1 min-h-[380px] lg:min-h-[480px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-sky-100 dark:bg-slate-900">
              <div
                ref={heroCanvasRef}
                data-testid="hero-3d-canvas"
                className="absolute inset-0 w-full h-full"
              />
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-between gap-4 rounded-xl bg-slate-900/85 px-4 py-3 text-white">
                <div>
                  <p className="text-xs text-sky-300 font-semibold">Pratinjau Live 3D Eduverse</p>
                  <p className="text-sm font-medium">6 Zona Eksplorasi · Avatar Interaktif · 6 NPC Pemberi Misi</p>
                </div>
                <button
                  type="button"
                  onClick={onStartDemoWorld}
                  className="pointer-events-auto px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                >
                  Masuk Dunia
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* World Zones & Visual Preview */}
      <section id="dunia-3d" className="mx-auto max-w-7xl px-6 py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-balance">
            Enam Zona Belajar dalam Satu Pulau Virtual
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Siswa bergerak bebas dengan tombol WASD atau sentuhan layar, berbicara dengan NPC, mengumpulkan kristal wawasan, dan membuka gerbang zona baru.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <img
              src="/src/assets/images/zone_virtual_academy_1794878701172.jpg"
              alt="Sekolah Virtual Eduverse"
              referrerPolicy="no-referrer"
              className="w-full h-48 object-cover"
            />
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Zona 01 & 02 · Terbuka Awal</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Sekolah Virtual & Taman Cendekia
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Gerbang utama akademi dengan menara jam, air mancur diskusi, dan misi pembuka dari Prof. Aksara serta Kak Flora.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <img
              src="/src/assets/images/zone_science_lab_1794878701074.jpg"
              alt="Laboratorium Sains dan Perpustakaan Digital"
              referrerPolicy="no-referrer"
              className="w-full h-48 object-cover"
            />
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Zona 03 & 04 · Terbuka via Kuis</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Laboratorium Sains & Perpustakaan
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Kubah eksperimen STEM dan ruang arsip logika. Gerbang energi terbuka otomatis saat siswa menuntaskan tantangan awal.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <img
              src="/src/assets/images/zone_knowledge_island_1794878701597.jpg"
              alt="Pulau Pengetahuan dan Arena Tantangan"
              referrerPolicy="no-referrer"
              className="w-full h-48 object-cover"
            />
            <div className="p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Zona 05 & 06 · Ujian Akhir</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Pulau Pengetahuan & Arena Boss
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Seberangi jembatan kayu menuju mercusuar ilmu dan hadapi Guardian Chronos di Arena Tantangan untuk meraih lencana tertinggi.
              </p>
            </div>
          </article>
        </div>

        {/* Compact list of all 6 zones */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {WORLD_ZONES.map((z) => (
            <div
              key={z.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5"
            >
              <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">{z.npcName}</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{z.name}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Syarat: {z.requiredCorrect} benar
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Teacher Capabilities Section */}
      <section
        id="fitur-guru"
        className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-balance">
              Alur Kerja Guru dari Dokumen Word hingga Laporan Nilai
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
              Dirancang agar guru SMA dapat menyiapkan game evaluasi 3D dalam hitungan menit tanpa perlu keahlian pemrograman.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <FileSpreadsheet className="w-6 h-6 text-blue-600 dark:text-sky-400" />
              <h3 className="mt-3 text-base font-bold">Import Word (.docx)</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Unggah berkas .docx, tinjau pratinjau soal, perbaiki kunci yang belum lengkap, lalu simpan ke bank soal terisolasi.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <Link2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h3 className="mt-3 text-base font-bold">Tautan Sesi Unik</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Bagikan tautan seperti /join/EDU101 ke WhatsApp atau Google Classroom. Tautan dapat diaktifkan, dibatasi waktu, atau ditutup kapan saja.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <Sparkles className="w-6 h-6 text-amber-500" />
              <h3 className="mt-3 text-base font-bold">Asisten AI Gemini</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Buat variasi soal draf, susun rencana misi 3D, berikan petunjuk Sokratis bagi siswa, dan ringkas rekomendasi remedial.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <Compass className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              <h3 className="mt-3 text-base font-bold">Pantau & Ekspor Excel/PDF</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Lihat progres siswa realtime di kelas, peringkat leaderboard, serta unduh rekap nilai resmi berformat .xlsx dan .pdf.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How to Play */}
      <section id="cara-bermain" className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          Cara Bermain di EDUVERSE
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            {
              step: '01. Buka Tautan Sesi',
              desc: 'Klik tautan dari guru atau masukkan kode sesi (mis. EDU101), lalu isi nama dan identitas kelas.',
            },
            {
              step: '02. Jelajahi Dunia 3D',
              desc: 'Gunakan WASD / Panah untuk berjalan, Shift untuk berlari, Spasi melompat, dan seret mouse untuk mengarahkan kamera.',
            },
            {
              step: '03. Selesaikan Misi NPC',
              desc: 'Dekati NPC di tiap zona dan tekan E untuk menjawab kuis, teka-teki, atau tantangan Boss Battle.',
            },
            {
              step: '04. Kumpulkan XP & Lencana',
              desc: 'Jawaban benar dikoreksi di server, membuka gerbang zona berikutnya, dan menaikkan peringkat kelas.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{item.step}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-400">
          <p>EDUVERSE – Interactive Learning World</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Ubah tema terang atau gelap"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              {darkMode ? 'Mode Terang' : 'Mode Gelap'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
