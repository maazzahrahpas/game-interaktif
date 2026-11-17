import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Gamepad2,
  Link2,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AnswerKey,
  AuditLogEntry,
  Classroom,
  DifficultyLevel,
  EduverseUser,
  GameMode,
  GameSession,
  GradeLevel,
  ParsedWordQuestion,
  QuestionBank,
  StudentProgress,
  StudentQuestion,
  SubmissionRecord,
} from '../types/eduverse.ts';
import { extractDocxFile, generateWordTemplateBlob } from '../utils/docxParser.ts';
import { computeSessionAnalytics } from '../utils/gameRules.ts';
import { exportSessionResultsToExcel, exportSessionResultsToPDF } from '../utils/exportReports.ts';
import {
  syncBankToFirestore,
  syncClassToFirestore,
  syncSessionToFirestore,
} from '../lib/firebase.ts';

interface TeacherDashboardProps {
  user: EduverseUser;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLaunchSessionWorld: (joinCode: string) => void;
  onLogout: () => void;
}

type TeacherTab = 'overview' | 'sessions' | 'word-import' | 'monitor' | 'security';

const GAME_MODES: GameMode[] = [
  'Quiz Adventure',
  'Mission Challenge',
  'Treasure Hunt',
  'Puzzle Room',
  'Boss Battle',
  'Speed Quiz',
  'Exploration Learning',
];

async function readApiResponse<T>(res: Response): Promise<{ data: T | null; rawText: string }> {
  const rawText = await res.text();
  if (!rawText) return { data: null, rawText: '' };
  try {
    return { data: JSON.parse(rawText) as T, rawText };
  } catch {
    return { data: null, rawText };
  }
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  user,
  darkMode,
  onToggleTheme,
  onLaunchSessionWorld,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [progressList, setProgressList] = useState<StudentProgress[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Class Creation Form
  const [clsName, setClsName] = useState('');
  const [clsSubject, setClsSubject] = useState('Biologi');
  const [clsGrade, setClsGrade] = useState<GradeLevel>('11');
  const [clsDesc, setClsDesc] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  // Session Creation Form
  const [sessTitle, setSessTitle] = useState('');
  const [sessClassId, setSessClassId] = useState('');
  const [sessBankId, setSessBankId] = useState('');
  const [sessMode, setSessMode] = useState<GameMode>('Quiz Adventure');
  const [sessDifficulty, setSessDifficulty] = useState<DifficultyLevel>('Sedang');
  const [sessDuration, setSessDuration] = useState(40);
  const [sessAttempts, setSessAttempts] = useState(3);
  const [sessRequireId, setSessRequireId] = useState(true);
  const [sessStartsAt, setSessStartsAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [sessEndsAt, setSessEndsAt] = useState(
    () => new Date(Date.now() + 72 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [creatingSession, setCreatingSession] = useState(false);

  // DOCX Import & Preview State
  const [bankTitle, setBankTitle] = useState('');
  const [bankSubject, setBankSubject] = useState('Biologi');
  const [bankGrade, setBankGrade] = useState<GradeLevel>('11');
  const [bankTopic, setBankTopic] = useState('Respirasi & Sel');
  const [bankDifficulty, setBankDifficulty] = useState<DifficultyLevel>('Sedang');
  const [previewQuestions, setPreviewQuestions] = useState<ParsedWordQuestion[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsingWord, setParsingWord] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  // Gemini AI Teacher Tools
  const [aiTopicInput, setAiTopicInput] = useState('Fotosintesis & Kloroplas');
  const [aiCount, setAiCount] = useState(3);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [aiMissionPlan, setAiMissionPlan] = useState<string | null>(null);

  // Monitor selected session
  const [monitorSessionId, setMonitorSessionId] = useState<string>('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/teacher/overview?teacherId=${encodeURIComponent(user.uid)}`);
      const { data } = await readApiResponse<{
        ok: boolean;
        error?: string;
        classes?: Classroom[];
        questionBanks?: QuestionBank[];
        questions?: StudentQuestion[];
        answerKeys?: AnswerKey[];
        gameSessions?: GameSession[];
        studentProgress?: StudentProgress[];
        submissions?: SubmissionRecord[];
        auditLogs?: AuditLogEntry[];
      }>(res);
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || `Gagal memuat data dashboard guru (HTTP ${res.status}).`);
        return;
      }
      setClasses(data.classes || []);
      setBanks(data.questionBanks || []);
      setQuestions(data.questions || []);
      setAnswerKeys(data.answerKeys || []);
      setSessions(data.gameSessions || []);
      setProgressList(data.studentProgress || []);
      setSubmissions(data.submissions || []);
      setAuditLogs(data.auditLogs || []);

      if (data.classes?.length) {
        const firstClassId = data.classes[0].id;
        setSessClassId((prev) => prev || firstClassId);
      }
      if (data.questionBanks?.length) {
        const firstBankId = data.questionBanks[0].id;
        setSessBankId((prev) => prev || firstBankId);
      }
      if (data.gameSessions?.length) {
        const firstSessId = data.gameSessions[0].id;
        setMonitorSessionId((prev) => prev || firstSessId);
      }
    } catch {
      setErrorMsg('Kesalahan jaringan saat mengambil data dashboard guru.');
    } finally {
      setLoading(false);
    }
  }, [user.uid]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Real-time WebSocket monitor for selected session
  useEffect(() => {
    if (!monitorSessionId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join_room',
          sessionId: monitorSessionId,
          studentId: user.uid,
          displayName: user.displayName,
          role: 'guru',
        })
      );
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.type === 'progress_updated') {
          if (msg.progress) {
            setProgressList((prev) => {
              const filtered = prev.filter((p) => p.id !== msg.progress.id);
              return [msg.progress, ...filtered];
            });
          }
          if (msg.submission) {
            setSubmissions((prev) => [msg.submission, ...prev]);
          }
        }
      } catch {
        // Ignore invalid frames
      }
    };
    return () => ws.close();
  }, [monitorSessionId, user.uid, user.displayName]);

  const showNotice = (msg: string) => {
    setNoticeMsg(msg);
    window.setTimeout(() => setNoticeMsg(null), 4500);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clsName.trim().length < 2) {
      setErrorMsg('Nama kelas minimal 2 karakter.');
      return;
    }
    setCreatingClass(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: user.uid,
          name: clsName.trim(),
          grade: clsGrade,
          subject: clsSubject.trim(),
          description: clsDesc.trim(),
        }),
      });
      const { data } = await readApiResponse<{ ok: boolean; error?: string; classroom?: Classroom }>(res);
      if (!res.ok || !data?.ok || !data.classroom) {
        setErrorMsg(data?.error || `Gagal membuat kelas (HTTP ${res.status}).`);
        return;
      }
      await syncClassToFirestore(data.classroom).catch(() => undefined);
      setClasses((prev) => [data.classroom!, ...prev]);
      setSessClassId(data.classroom.id);
      setClsName('');
      setClsDesc('');
      showNotice(`Kelas "${data.classroom.name}" berhasil dibuat.`);
    } catch {
      setErrorMsg('Gagal terhubung ke server saat membuat kelas.');
    } finally {
      setCreatingClass(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sessTitle.trim().length < 2 || !sessClassId || !sessBankId) {
      setErrorMsg('Lengkapi judul sesi, kelas, dan bank soal.');
      return;
    }
    setCreatingSession(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/teacher/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: user.uid,
          classId: sessClassId,
          bankId: sessBankId,
          title: sessTitle.trim(),
          gameMode: sessMode,
          difficulty: sessDifficulty,
          durationMinutes: sessDuration,
          maxAttempts: sessAttempts,
          requireIdentity: sessRequireId,
          startsAt: new Date(sessStartsAt).toISOString(),
          endsAt: new Date(sessEndsAt).toISOString(),
        }),
      });
      const { data } = await readApiResponse<{ ok: boolean; error?: string; session?: GameSession }>(res);
      if (!res.ok || !data?.ok || !data.session) {
        setErrorMsg(data?.error || `Gagal membuat sesi permainan (HTTP ${res.status}).`);
        return;
      }
      await syncSessionToFirestore(data.session).catch(() => undefined);
      setSessions((prev) => [data.session!, ...prev]);
      setMonitorSessionId(data.session.id);
      setSessTitle('');
      showNotice(`Sesi "${data.session.title}" aktif dengan kode ${data.session.joinCode}!`);
    } catch {
      setErrorMsg('Gagal membuat sesi permainan.');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleToggleSessionLink = async (s: GameSession) => {
    try {
      const res = await fetch(`/api/teacher/sessions/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLinkActive: !s.isLinkActive }),
      });
      const { data } = await readApiResponse<{ ok: boolean; error?: string; session?: GameSession }>(res);
      if (res.ok && data?.ok && data.session) {
        setSessions((prev) => prev.map((item) => (item.id === s.id ? data.session! : item)));
        showNotice(`Tautan ${s.joinCode} ${data.session.isLinkActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      } else {
        setErrorMsg(data?.error || 'Gagal mengubah status tautan sesi.');
      }
    } catch {
      setErrorMsg('Gagal mengubah status tautan sesi.');
    }
  };

  const handleEndSession = async (s: GameSession) => {
    try {
      const res = await fetch(`/api/teacher/sessions/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended', isLinkActive: false }),
      });
      const { data } = await readApiResponse<{ ok: boolean; error?: string; session?: GameSession }>(res);
      if (res.ok && data?.ok && data.session) {
        setSessions((prev) => prev.map((item) => (item.id === s.id ? data.session! : item)));
        showNotice(`Sesi ${s.joinCode} telah diakhiri.`);
      } else {
        setErrorMsg(data?.error || 'Gagal mengakhiri sesi.');
      }
    } catch {
      setErrorMsg('Gagal mengakhiri sesi.');
    }
  };

  const handleWordFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setErrorMsg('Format berkas harus Microsoft Word (.docx).');
      e.target.value = '';
      return;
    }
    setParsingWord(true);
    setErrorMsg(null);
    try {
      const parsed = await extractDocxFile(file);
      setPreviewQuestions(parsed.questions);
      setParseWarnings(parsed.warnings);
      if (!bankTitle.trim()) {
        setBankTitle(file.name.replace(/\.docx$/i, '').trim() || 'Bank Soal Word');
      }
      showNotice(`Berhasil membaca ${parsed.questions.length} soal dari ${file.name}. Silakan tinjau sebelum menyimpan.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membaca dokumen .docx.');
    } finally {
      setParsingWord(false);
      e.target.value = '';
    }
  };

  const handleDownloadTemplate = async () => {
    const blob = await generateWordTemplateBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Template_Soal_EDUVERSE.docx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddManualQuestion = () => {
    setErrorMsg(null);
    setPreviewQuestions((prev) => [
      ...prev,
      {
        tempId: `manual_q_${Date.now()}_${prev.length}`,
        orderIndex: prev.length,
        prompt: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        correctLetter: 'A',
        explanation: '',
        points: 20,
        difficulty: bankDifficulty,
        missingAnswerKey: false,
        warnings: [],
      },
    ]);
  };

  const handleGenerateAiQuestions = async () => {
    setAiBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/teacher-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_questions',
          payload: {
            subject: bankSubject,
            grade: bankGrade,
            topic: aiTopicInput,
            difficulty: bankDifficulty,
            count: aiCount,
          },
        }),
      });
      const { data } = await readApiResponse<{
        ok: boolean;
        error?: string;
        items?: Array<{
          prompt: string;
          options: string[];
          correctIndex: number;
          explanation?: string;
          points?: number;
        }>;
      }>(res);
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || `Gagal membuat variasi soal AI (HTTP ${res.status}).`);
        return;
      }
      const letters = ['A', 'B', 'C', 'D', 'E'] as const;
      const drafts: ParsedWordQuestion[] = (data.items || []).map((item, idx) => {
        const cleanOpts = (Array.isArray(item.options) ? item.options : [])
          .map((o) => String(o ?? '').trim())
          .filter(Boolean)
          .slice(0, 5);
        const safeOptions = cleanOpts.length >= 2 ? cleanOpts : ['Opsi A', 'Opsi B'];
        const safeIdx = Math.min(Math.max(0, Math.trunc(Number(item.correctIndex) || 0)), safeOptions.length - 1);
        return {
          tempId: `ai_q_${Date.now()}_${idx}`,
          orderIndex: previewQuestions.length + idx,
          prompt: String(item.prompt || '').trim(),
          options: safeOptions,
          correctIndex: safeIdx,
          correctLetter: letters[safeIdx] || 'A',
          explanation: String(item.explanation || '').trim(),
          points: Math.min(1000, Math.max(1, Math.round(Number(item.points) || 20))),
          difficulty: bankDifficulty,
          missingAnswerKey: false,
          warnings: [],
        };
      });
      setPreviewQuestions((prev) => [...prev, ...drafts]);
      if (!bankTitle.trim()) setBankTitle(`Bank Soal AI: ${aiTopicInput}`);
      showNotice(`${drafts.length} draf soal AI ditambahkan ke pratinjau. Tinjau dan setujui sebelum disimpan.`);
    } catch {
      setErrorMsg('Gagal menghubungi layanan AI Gemini.');
    } finally {
      setAiBusy(false);
    }
  };

  const updatePreviewItem = (tempId: string, patch: Partial<ParsedWordQuestion>) => {
    setPreviewQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        const next = { ...q, ...patch };
        if (typeof patch.correctIndex === 'number') {
          const letters = ['A', 'B', 'C', 'D', 'E'] as const;
          next.correctLetter = letters[patch.correctIndex] || '';
          next.missingAnswerKey = patch.correctIndex < 0;
          next.warnings = next.missingAnswerKey ? ['Kunci jawaban belum dipilih.'] : [];
        }
        return next;
      })
    );
  };

  const handleSavePreviewToBank = async () => {
    if (previewQuestions.length === 0) {
      setErrorMsg('Belum ada soal di daftar pratinjau.');
      return;
    }
    const cleanTitle = bankTitle.trim();
    const cleanSubject = bankSubject.trim();
    const cleanTopic = bankTopic.trim() || cleanTitle;

    if (cleanTitle.length < 2) {
      setErrorMsg('Judul Bank Soal wajib diisi minimal 2 karakter.');
      return;
    }
    if (cleanSubject.length < 2) {
      setErrorMsg('Mata Pelajaran wajib diisi minimal 2 karakter.');
      return;
    }

    const sanitizedItems: Array<{
      prompt: string;
      options: string[];
      correctIndex: number;
      explanation: string;
      points: number;
      difficulty: DifficultyLevel;
    }> = [];

    for (let i = 0; i < previewQuestions.length; i++) {
      const q = previewQuestions[i];
      const prompt = String(q.prompt || '').trim();
      if (prompt.length < 2) {
        setErrorMsg(`Teks pertanyaan pada Soal #${i + 1} wajib diisi minimal 2 karakter.`);
        return;
      }
      const cleanOptions = (Array.isArray(q.options) ? q.options : [])
        .slice(0, 5)
        .map((opt) => String(opt || '').trim());
      if (cleanOptions.length < 2 || cleanOptions.some((opt) => opt.length === 0)) {
        setErrorMsg(`Semua pilihan jawaban pada Soal #${i + 1} wajib diisi (minimal 2 opsi).`);
        return;
      }
      if (q.missingAnswerKey || q.correctIndex < 0 || q.correctIndex >= cleanOptions.length) {
        setErrorMsg(`Kunci jawaban pada Soal #${i + 1} belum valid. Pilih opsi A–${String.fromCharCode(64 + cleanOptions.length)}.`);
        return;
      }
      sanitizedItems.push({
        prompt,
        options: cleanOptions,
        correctIndex: q.correctIndex,
        explanation: String(q.explanation || '').trim(),
        points: Math.min(1000, Math.max(1, Math.round(Number(q.points) || 20))),
        difficulty: q.difficulty || bankDifficulty,
      });
    }

    setSavingBank(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/teacher/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: user.uid,
          title: cleanTitle,
          subject: cleanSubject,
          grade: bankGrade,
          topic: cleanTopic,
          difficulty: bankDifficulty,
          items: sanitizedItems,
        }),
      });
      const { data, rawText } = await readApiResponse<{
        ok: boolean;
        error?: string;
        bank: QuestionBank;
        questions: StudentQuestion[];
        answerKeys: AnswerKey[];
      }>(res);
      if (!res.ok || !data?.ok || !data.bank) {
        setErrorMsg(
          data?.error ||
            `Gagal menyimpan bank soal (HTTP ${res.status}${rawText ? `: ${rawText.slice(0, 120)}` : ''}).`
        );
        return;
      }
      await syncBankToFirestore(data.bank, data.questions, data.answerKeys).catch((err) => {
        console.warn('Sinkronisasi Firestore bank soal dilewati/gagal:', err);
      });
      setBanks((prev) => [data.bank, ...prev]);
      setQuestions((prev) => [...prev, ...data.questions]);
      setAnswerKeys((prev) => [...prev, ...data.answerKeys]);
      setSessBankId(data.bank.id);
      setPreviewQuestions([]);
      setParseWarnings([]);
      setBankTitle('');
      showNotice(`Bank soal "${data.bank.title}" (${data.questions.length} soal) tersimpan dengan kunci jawaban terisolasi!`);
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setErrorMsg(`Gagal terhubung ke server saat menyimpan bank soal${detail}.`);
    } finally {
      setSavingBank(false);
    }
  };

  const selectedMonitorSession = useMemo(
    () => sessions.find((s) => s.id === monitorSessionId) || sessions[0] || null,
    [sessions, monitorSessionId]
  );

  const monitoredProgress = useMemo(
    () =>
      selectedMonitorSession
        ? progressList.filter((p) => p.sessionId === selectedMonitorSession.id)
        : [],
    [progressList, selectedMonitorSession]
  );

  const monitoredAnalytics = useMemo(
    () => computeSessionAnalytics(monitoredProgress),
    [monitoredProgress]
  );

  const handleAiSummarizeSession = async () => {
    if (!selectedMonitorSession) return;
    setAiBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/teacher-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize_results',
          payload: { joinCode: selectedMonitorSession.joinCode },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Gagal membuat ringkasan AI.');
      } else {
        setAiSummaryText(data.text);
      }
    } catch {
      setErrorMsg('Gagal terhubung ke Gemini AI.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleAiMissionPlan = async () => {
    setAiBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/teacher-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mission_plan',
          payload: {
            subject: bankSubject,
            grade: bankGrade,
            topic: aiTopicInput,
            gameMode: sessMode,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Gagal menyusun rencana misi AI.');
      } else {
        setAiMissionPlan(data.text);
      }
    } catch {
      setErrorMsg('Gagal terhubung ke Gemini AI.');
    } finally {
      setAiBusy(false);
    }
  };

  const copySessionLink = (joinCode: string) => {
    const url = `${window.location.origin}/join/${joinCode}`;
    void navigator.clipboard?.writeText(url);
    showNotice(`Tautan ${url} berhasil disalin!`);
  };

  const shareWhatsApp = (s: GameSession) => {
    const url = `${window.location.origin}/join/${s.joinCode}`;
    const text = `Ayo gabung misi 3D EDUVERSE "${s.title}" (${s.subject} Kelas ${s.grade})!\nKlik tautan: ${url}\nAtau masukkan kode: ${s.joinCode}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.navigator?.clipboard?.writeText(text);
    showNotice(`Teks undangan WhatsApp disalin! Anda juga dapat membuka: ${waUrl.slice(0, 48)}...`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-blue-600 dark:text-sky-400 font-display">
              EDUVERSE
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {user.role === 'super_admin' ? 'Super Admin' : 'Panel Guru'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {user.displayName}
          </p>

          <nav className="mt-6 space-y-1">
            {[
              { id: 'overview', label: 'Ringkasan', icon: BarChart3 },
              { id: 'sessions', label: 'Kelas & Tautan Sesi', icon: Link2 },
              { id: 'word-import', label: 'Import Word & Soal', icon: FileUp },
              { id: 'monitor', label: 'Pantau & Laporan', icon: Activity },
              { id: 'security', label: 'Keamanan & Audit', icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as TeacherTab)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            {darkMode ? 'Terang' : 'Gelap'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">
        {noticeMsg && (
          <div className="mb-5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{noticeMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-4 py-3 text-sm font-medium text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="mt-3 text-sm">Memuat data ruang belajar...</p>
          </div>
        ) : (
          <>
            {/* ==================== TAB 1: OVERVIEW ==================== */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-extrabold">Dashboard Guru EDUVERSE</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Kelola kelas, bank soal Word, tautan sesi 3D, dan pemantauan nilai realtime.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('word-import')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                    >
                      <FileUp className="w-4 h-4" />
                      Import Word (.docx)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('sessions')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
                    >
                      <Plus className="w-4 h-4" />
                      Buat Sesi
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Kelas', val: classes.length, icon: Users },
                    { label: 'Bank Soal', val: banks.length, icon: BookOpen },
                    { label: 'Sesi Aktif', val: sessions.filter((s) => s.status === 'active').length, icon: Link2 },
                    { label: 'Jawaban Tercatat', val: submissions.length, icon: Activity },
                  ].map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                      >
                        <Icon className="w-5 h-5 text-blue-600 dark:text-sky-400" />
                        <p className="mt-3 text-2xl font-extrabold font-mono">{stat.val}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <h2 className="text-lg font-bold">Sesi Permainan Siap Dibagikan</h2>
                  <div className="mt-4 space-y-3">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {s.subject} · Kelas {s.grade} · {s.gameMode} · Kode{' '}
                            <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                              {s.joinCode}
                            </span>
                          </p>
                          <p className="mt-0.5 font-bold">{s.title}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copySessionLink(s.joinCode)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Salin Tautan
                          </button>
                          <button
                            type="button"
                            onClick={() => onLaunchSessionWorld(s.joinCode)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            <Gamepad2 className="w-3.5 h-3.5" />
                            Uji Dunia 3D
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 2: CLASSES & SESSIONS ==================== */}
            {activeTab === 'sessions' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Create Class Form */}
                  <form
                    onSubmit={handleCreateClass}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                  >
                    <h2 className="text-lg font-bold">1. Buat Kelas Baru</h2>
                    <div>
                      <label htmlFor="cls-name" className="block text-xs font-semibold mb-1">
                        Nama Kelas
                      </label>
                      <input
                        id="cls-name"
                        type="text"
                        required
                        value={clsName}
                        onChange={(e) => setClsName(e.target.value)}
                        placeholder="Contoh: XII IPA 2 - Kimia Organik"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="cls-subject" className="block text-xs font-semibold mb-1">
                          Mata Pelajaran
                        </label>
                        <input
                          id="cls-subject"
                          type="text"
                          required
                          value={clsSubject}
                          onChange={(e) => setClsSubject(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="cls-grade" className="block text-xs font-semibold mb-1">
                          Tingkat Kelas
                        </label>
                        <select
                          id="cls-grade"
                          value={clsGrade}
                          onChange={(e) => setClsGrade(e.target.value as GradeLevel)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        >
                          <option value="10">Kelas 10</option>
                          <option value="11">Kelas 11</option>
                          <option value="12">Kelas 12</option>
                          <option value="Umum">Umum</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={creatingClass}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
                    >
                      {creatingClass ? 'Menyimpan...' : 'Simpan Kelas'}
                    </button>
                  </form>

                  {/* Create Game Session Form */}
                  <form
                    onSubmit={handleCreateSession}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
                  >
                    <h2 className="text-lg font-bold">2. Buat Sesi Game & Tautan Unik</h2>
                    <div>
                      <label htmlFor="sess-title" className="block text-xs font-semibold mb-1">
                        Judul Misi Permainan
                      </label>
                      <input
                        id="sess-title"
                        type="text"
                        required
                        value={sessTitle}
                        onChange={(e) => setSessTitle(e.target.value)}
                        placeholder="Contoh: Ekspedisi Genetika Kelas XI"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sess-class" className="block text-xs font-semibold mb-1">
                          Pilih Kelas
                        </label>
                        <select
                          id="sess-class"
                          value={sessClassId}
                          onChange={(e) => setSessClassId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="sess-bank" className="block text-xs font-semibold mb-1">
                          Pilih Bank Soal
                        </label>
                        <select
                          id="sess-bank"
                          value={sessBankId}
                          onChange={(e) => setSessBankId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        >
                          {banks.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title} ({b.questionCount} soal)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <label htmlFor="sess-mode" className="block text-xs font-semibold mb-1">
                          Mode Game
                        </label>
                        <select
                          id="sess-mode"
                          value={sessMode}
                          onChange={(e) => setSessMode(e.target.value as GameMode)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                        >
                          {GAME_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="sess-dur" className="block text-xs font-semibold mb-1">
                          Durasi (m)
                        </label>
                        <input
                          id="sess-dur"
                          type="number"
                          min={5}
                          max={240}
                          value={sessDuration}
                          onChange={(e) => setSessDuration(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label htmlFor="sess-att" className="block text-xs font-semibold mb-1">
                          Batas Coba
                        </label>
                        <input
                          id="sess-att"
                          type="number"
                          min={1}
                          max={10}
                          value={sessAttempts}
                          onChange={(e) => setSessAttempts(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sess-start" className="block text-xs font-semibold mb-1">
                          Waktu Mulai
                        </label>
                        <input
                          id="sess-start"
                          type="datetime-local"
                          value={sessStartsAt}
                          onChange={(e) => setSessStartsAt(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label htmlFor="sess-end" className="block text-xs font-semibold mb-1">
                          Waktu Berakhir
                        </label>
                        <input
                          id="sess-end"
                          type="datetime-local"
                          value={sessEndsAt}
                          onChange={(e) => setSessEndsAt(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={sessRequireId}
                        onChange={(e) => setSessRequireId(e.target.checked)}
                      />
                      Wajibkan siswa mengisi NIS / Identitas saat membuka tautan
                    </label>
                    <button
                      type="submit"
                      disabled={creatingSession}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
                    >
                      {creatingSession ? 'Membuat Sesi...' : 'Terbitkan Sesi & Tautan Undangan'}
                    </button>
                  </form>
                </div>

                {/* Active Sessions & Share Links */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <h2 className="text-lg font-bold">Daftar Sesi & Manajemen Tautan</h2>
                  <div className="mt-4 space-y-4">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                              /join/{s.joinCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{s.status === 'ended' ? 'Berakhir' : s.isLinkActive ? 'Tautan Aktif' : 'Tautan Nonaktif'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{s.questionCount} soal ({s.totalPoints} poin)</span>
                          </div>
                          <h3 className="mt-1 font-bold text-base">{s.title}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Berlaku s/d {new Date(s.endsAt).toLocaleString('id-ID')}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copySessionLink(s.joinCode)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Salin Link
                          </button>
                          <button
                            type="button"
                            onClick={() => shareWhatsApp(s)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                            WhatsApp / Classroom
                          </button>
                          {s.status !== 'ended' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleSessionLink(s)}
                                className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold"
                              >
                                {s.isLinkActive ? 'Tutup Tautan' : 'Aktifkan Tautan'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEndSession(s)}
                                className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                              >
                                Akhiri Sesi
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 3: WORD DOCX IMPORT & AI GENERATOR ==================== */}
            {activeTab === 'word-import' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-extrabold">Import Soal dari Microsoft Word (.docx)</h1>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Unggah berkas .docx berisi soal, opsi A–E, Kunci Jawaban, dan Pembahasan. Tinjau pratinjau sebelum menyimpan.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleAddManualQuestion}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-bold"
                      >
                        <Plus className="w-4 h-4" />
                        Tambah Soal Manual
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                      >
                        <Download className="w-4 h-4 text-blue-600" />
                        Unduh Template Word (.docx)
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* DOCX Upload Box */}
                    <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 flex flex-col items-center justify-center text-center">
                      <FileText className="w-10 h-10 text-blue-600" />
                      <p className="mt-2 text-sm font-bold">Pilih Berkas Microsoft Word (.docx)</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Mendukung pola SOAL 1 / 1. / A–E / Kunci Jawaban / Pembahasan / Bobot Nilai
                      </p>
                      <label className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer">
                        {parsingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                        <span>{parsingWord ? 'Membaca DOCX...' : 'Unggah File .docx'}</span>
                        <input
                          type="file"
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={handleWordFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Gemini AI Draft Generator */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span>Atau Buat Variasi Soal Draf dengan Gemini AI</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Draf AI masuk ke panel pratinjau agar guru memeriksa dan menyetujui kunci jawaban terlebih dahulu.
                      </p>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="col-span-2">
                          <label htmlFor="ai-topic" className="block text-xs font-semibold mb-1">
                            Topik Materi
                          </label>
                          <input
                            id="ai-topic"
                            type="text"
                            value={aiTopicInput}
                            onChange={(e) => setAiTopicInput(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <label htmlFor="ai-count" className="block text-xs font-semibold mb-1">
                            Jumlah
                          </label>
                          <input
                            id="ai-count"
                            type="number"
                            min={1}
                            max={10}
                            value={aiCount}
                            onChange={(e) => setAiCount(Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={aiBusy}
                          onClick={handleGenerateAiQuestions}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold disabled:opacity-60"
                        >
                          {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          Buat Variasi Soal AI
                        </button>
                        <button
                          type="button"
                          disabled={aiBusy}
                          onClick={handleAiMissionPlan}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                        >
                          Susun Rencana Misi 3D
                        </button>
                      </div>
                      {aiMissionPlan && (
                        <div className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 text-xs whitespace-pre-wrap">
                          {aiMissionPlan}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mandatory Teacher Preview & Edit Stage */}
                {previewQuestions.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold">
                          Pratinjau Soal ({previewQuestions.length} butir) — Wajib Persetujuan Guru
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Edit teks, opsi, bobot, atau kunci jawaban sebelum disimpan. Kunci jawaban akan disimpan terpisah dari akses siswa.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAddManualQuestion}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
                        >
                          <Plus className="w-4 h-4" />
                          Tambah Butir Soal
                        </button>
                        <button
                          type="button"
                          disabled={savingBank}
                          onClick={handleSavePreviewToBank}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
                        >
                          {savingBank && <Loader2 className="w-4 h-4 animate-spin" />}
                          Setujui & Simpan ke Bank Soal
                        </button>
                      </div>
                    </div>

                    {parseWarnings.length > 0 && (
                      <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                        {parseWarnings.map((w, i) => (
                          <p key={i} className="font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {w}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                      <div className="sm:col-span-2">
                        <label htmlFor="bank-title" className="block text-xs font-semibold mb-1">
                          Judul Bank Soal
                        </label>
                        <input
                          id="bank-title"
                          type="text"
                          value={bankTitle}
                          onChange={(e) => setBankTitle(e.target.value)}
                          placeholder="Contoh: Bank Soal Biologi Bab 2"
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="bank-subj" className="block text-xs font-semibold mb-1">
                          Mata Pelajaran
                        </label>
                        <input
                          id="bank-subj"
                          type="text"
                          value={bankSubject}
                          onChange={(e) => setBankSubject(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="bank-topic" className="block text-xs font-semibold mb-1">
                          Topik Materi
                        </label>
                        <input
                          id="bank-topic"
                          type="text"
                          value={bankTopic}
                          onChange={(e) => setBankTopic(e.target.value)}
                          placeholder="Contoh: Sel & Organel"
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="bank-grade" className="block text-xs font-semibold mb-1">
                          Kelas
                        </label>
                        <select
                          id="bank-grade"
                          value={bankGrade}
                          onChange={(e) => setBankGrade(e.target.value as GradeLevel)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        >
                          <option value="10">Kelas 10</option>
                          <option value="11">Kelas 11</option>
                          <option value="12">Kelas 12</option>
                          <option value="Umum">Umum</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="bank-diff" className="block text-xs font-semibold mb-1">
                          Kesulitan
                        </label>
                        <select
                          id="bank-diff"
                          value={bankDifficulty}
                          onChange={(e) => setBankDifficulty(e.target.value as DifficultyLevel)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm"
                        >
                          <option value="Mudah">Mudah</option>
                          <option value="Sedang">Sedang</option>
                          <option value="Sulit">Sulit</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {previewQuestions.map((q, idx) => (
                        <div
                          key={q.tempId}
                          className={`rounded-xl border p-4 space-y-3 ${
                            q.missingAnswerKey
                              ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-blue-600 dark:text-sky-400">
                              Soal #{idx + 1}
                              {q.missingAnswerKey && ' · PERINGATAN: Kunci jawaban belum ditemukan'}
                            </span>
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-semibold flex items-center gap-1.5">
                                Bobot:
                                <input
                                  type="number"
                                  min={1}
                                  max={1000}
                                  value={q.points}
                                  onChange={(e) =>
                                    updatePreviewItem(q.tempId, { points: Number(e.target.value) || 20 })
                                  }
                                  className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs font-mono"
                                />
                              </label>
                              <button
                                type="button"
                                aria-label={`Hapus soal ${idx + 1}`}
                                onClick={() =>
                                  setPreviewQuestions((prev) => prev.filter((item) => item.tempId !== q.tempId))
                                }
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <textarea
                            rows={2}
                            aria-label={`Teks pertanyaan soal ${idx + 1}`}
                            placeholder="Tulis teks pertanyaan di sini..."
                            value={q.prompt}
                            onChange={(e) => updatePreviewItem(q.tempId, { prompt: e.target.value })}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                          />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt, optIdx) => {
                              const letter = String.fromCharCode(65 + optIdx);
                              return (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <span className="w-6 text-xs font-mono font-bold">{letter}.</span>
                                  <input
                                    type="text"
                                    aria-label={`Opsi ${letter} soal ${idx + 1}`}
                                    placeholder={`Pilihan ${letter}`}
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...q.options];
                                      nextOpts[optIdx] = e.target.value;
                                      updatePreviewItem(q.tempId, { options: nextOpts });
                                    }}
                                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                                  />
                                </div>
                              );
                            })}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold mb-1">Kunci Jawaban</label>
                              <select
                                aria-label={`Kunci jawaban soal ${idx + 1}`}
                                value={q.correctIndex}
                                onChange={(e) =>
                                  updatePreviewItem(q.tempId, { correctIndex: Number(e.target.value) })
                                }
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-bold"
                              >
                                <option value={-1}>-- Pilih Kunci --</option>
                                {q.options.map((_, i) => (
                                  <option key={i} value={i}>
                                    Opsi {String.fromCharCode(65 + i)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-semibold mb-1">
                                Pembahasan (Opsional)
                              </label>
                              <input
                                type="text"
                                value={q.explanation}
                                onChange={(e) => updatePreviewItem(q.tempId, { explanation: e.target.value })}
                                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Existing Banks Summary */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <h2 className="text-lg font-bold">Bank Soal Tersimpan ({banks.length})</h2>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {banks.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-4"
                      >
                        <p className="text-xs text-slate-500">
                          {b.subject} · Kelas {b.grade} · {b.questionCount} soal
                        </p>
                        <p className="mt-1 font-bold">{b.title}</p>
                        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                          Kunci jawaban tersimpan terpisah ({answerKeys.filter((k) => k.bankId === b.id).length} kunci)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 4: REALTIME MONITOR & REPORTS ==================== */}
            {activeTab === 'monitor' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-extrabold">Pemantauan Realtime & Laporan Nilai</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Pantau jawaban siswa secara langsung, buat ringkasan AI Gemini, dan ekspor ke Excel atau PDF.
                    </p>
                  </div>
                  <select
                    aria-label="Pilih sesi untuk dipantau"
                    value={selectedMonitorSession?.id || ''}
                    onChange={(e) => setMonitorSessionId(e.target.value)}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.joinCode} · {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedMonitorSession && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                        <p className="text-xs text-slate-500">Peserta Bergabung</p>
                        <p className="mt-1 text-2xl font-extrabold font-mono">{monitoredAnalytics.totalStudents}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                        <p className="text-xs text-slate-500">Rata-rata Skor</p>
                        <p className="mt-1 text-2xl font-extrabold font-mono">{monitoredAnalytics.averageScore}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                        <p className="text-xs text-slate-500">Skor Tertinggi</p>
                        <p className="mt-1 text-2xl font-extrabold font-mono">{monitoredAnalytics.highestScore}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                        <p className="text-xs text-slate-500">Rata-rata Akurasi</p>
                        <p className="mt-1 text-2xl font-extrabold font-mono">{monitoredAnalytics.averageAccuracy}%</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => exportSessionResultsToExcel(selectedMonitorSession, monitoredProgress)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Unduh Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => exportSessionResultsToPDF(selectedMonitorSession, monitoredProgress)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                      >
                        <Download className="w-4 h-4" />
                        Unduh PDF (.pdf)
                      </button>
                      <button
                        type="button"
                        disabled={aiBusy}
                        onClick={handleAiSummarizeSession}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      >
                        {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                        Ringkasan & Remedial AI Gemini
                      </button>
                    </div>

                    {aiSummaryText && (
                      <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 p-5 text-sm whitespace-pre-wrap">
                        <p className="font-bold text-amber-900 dark:text-amber-300 mb-2">
                          Rekomendasi Pembelajaran AI Gemini
                        </p>
                        {aiSummaryText}
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                        <h2 className="font-bold">Daftar Progres & Nilai Siswa</h2>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
                            <tr>
                              <th className="px-5 py-3">Siswa</th>
                              <th className="px-5 py-3">Identitas</th>
                              <th className="px-5 py-3">Zona</th>
                              <th className="px-5 py-3 text-right">Benar/Total</th>
                              <th className="px-5 py-3 text-right">Skor</th>
                              <th className="px-5 py-3 text-right">XP</th>
                              <th className="px-5 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {monitoredProgress.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                                  Belum ada siswa yang bergabung ke sesi ini. Bagikan kode{' '}
                                  <span className="font-mono font-bold">{selectedMonitorSession.joinCode}</span>.
                                </td>
                              </tr>
                            ) : (
                              monitoredProgress.map((p) => (
                                <tr key={p.id}>
                                  <td className="px-5 py-3 font-semibold">{p.studentName}</td>
                                  <td className="px-5 py-3 font-mono text-xs">{p.studentIdentity || '-'}</td>
                                  <td className="px-5 py-3 text-xs capitalize">{p.currentZone}</td>
                                  <td className="px-5 py-3 text-right font-mono">
                                    {p.correctCount}/{p.totalAnswered}
                                  </td>
                                  <td className="px-5 py-3 text-right font-mono font-bold">{p.score}</td>
                                  <td className="px-5 py-3 text-right font-mono">{p.xpEarned}</td>
                                  <td className="px-5 py-3 text-xs">
                                    {p.status === 'completed' ? 'Selesai' : 'Aktif'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ==================== TAB 5: SECURITY & AUDIT LOGS ==================== */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <h1 className="text-xl font-extrabold flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Arsitektur Keamanan & Audit Log
                  </h1>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
                    <li>
                      <strong>Pemisahan Kunci Jawaban:</strong> Koleksi <code className="font-mono">answerKeys</code> diblokir oleh Firestore Security Rules bagi siswa dan tidak pernah dikirim ke browser siswa sebelum penilaian di backend.
                    </li>
                    <li>
                      <strong>Proteksi Role:</strong> Pengguna tidak dapat mengubah role miliknya sendiri; validasi dilakukan melalui aturan <code className="font-mono">firestore.rules</code> dan verifikasi backend.
                    </li>
                    <li>
                      <strong>PII Isolation:</strong> Email dan nomor identitas tersimpan pada subkoleksi terisolasi <code className="font-mono">users/{'{uid}'}/private/info</code>.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <h2 className="text-lg font-bold">Catatan Aktivitas Sistem (Audit Logs)</h2>
                  <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                            {log.action}
                          </span>{' '}
                          · <span>{log.summary}</span>
                        </div>
                        <span className="font-mono text-slate-500 shrink-0">
                          {new Date(log.createdAt).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
