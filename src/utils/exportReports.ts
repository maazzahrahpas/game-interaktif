import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GameSession, StudentProgress } from '../types/eduverse.ts';
import { calculateAccuracyPercent } from './gameRules.ts';

export function exportSessionResultsToExcel(session: GameSession, progressList: StudentProgress[]) {
  const rows = [...progressList]
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({
      Peringkat: idx + 1,
      'Nama Siswa': p.studentName,
      'Identitas (NIS/Kelas)': p.studentIdentity || '-',
      'Skor Akhir': p.score,
      'XP Diperoleh': p.xpEarned,
      'Jawaban Benar': p.correctCount,
      'Total Dijawab': p.totalAnswered,
      'Akurasi (%)': calculateAccuracyPercent(p.correctCount, p.totalAnswered),
      'Zona Terbuka': p.unlockedZones.length,
      Status: p.status === 'completed' ? 'Selesai' : 'Aktif',
      'Terakhir Aktif': new Date(p.updatedAt).toLocaleString('id-ID'),
    }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Nilai');

  const safeTitle = session.joinCode || 'SESI';
  XLSX.writeFile(workbook, `EDUVERSE_Nilai_${safeTitle}.xlsx`);
}

export function exportSessionResultsToPDF(session: GameSession, progressList: StudentProgress[]) {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text(`EDUVERSE - Laporan Hasil Belajar: ${session.title}`, 14, 18);
  doc.setFontSize(10);
  doc.text(
    `Mata Pelajaran: ${session.subject} | Kelas ${session.grade} | Mode: ${session.gameMode} | Kode: ${session.joinCode}`,
    14,
    26
  );

  const body = [...progressList]
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => [
      String(idx + 1),
      p.studentName,
      p.studentIdentity || '-',
      String(p.score),
      String(p.xpEarned),
      `${p.correctCount}/${p.totalAnswered}`,
      `${calculateAccuracyPercent(p.correctCount, p.totalAnswered)}%`,
      p.status === 'completed' ? 'Selesai' : 'Aktif',
    ]);

  autoTable(doc, {
    startY: 32,
    head: [['No', 'Nama Siswa', 'Identitas', 'Skor', 'XP', 'Benar/Total', 'Akurasi', 'Status']],
    body: body.length > 0 ? body : [['-', 'Belum ada peserta', '-', '-', '-', '-', '-', '-']],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  doc.save(`EDUVERSE_Laporan_${session.joinCode || 'SESI'}.pdf`);
}
