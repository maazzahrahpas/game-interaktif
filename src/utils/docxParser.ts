import mammoth from 'mammoth';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { DifficultyLevel, ParsedWordQuestion } from '../types/eduverse.ts';

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export interface DocxParseResult {
  questions: ParsedWordQuestion[];
  warnings: string[];
  rawLineCount: number;
}

/**
 * Pure parser for extracted Word (.docx) text.
 * Supports flexible formats:
 * - "SOAL 1", "Soal 1:", "1.", "1)", "Pertanyaan 1"
 * - Options: "A. ...", "A) ...", "(A) ...", "a. ..."
 * - Keys: "Kunci Jawaban: B", "Kunci: B", "Jawaban: B", "Answer: B"
 * - Explanations: "Pembahasan: ...", "Penjelasan: ..."
 * - Points: "Bobot: 20", "Bobot Nilai: 20", "Poin: 20", "Nilai: 20"
 * - Difficulty: "Tingkat: Sulit" / "Kesulitan: Sedang"
 */
export function parseQuestionsFromText(rawText: string): DocxParseResult {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const questions: ParsedWordQuestion[] = [];
  const globalWarnings: string[] = [];

  let current: {
    promptLines: string[];
    options: { letter: string; text: string }[];
    correctLetter: 'A' | 'B' | 'C' | 'D' | 'E' | '';
    explanation: string;
    points: number;
    difficulty: DifficultyLevel;
  } | null = null;

  let activeSection: 'prompt' | 'option' | 'explanation' = 'prompt';

  const flushCurrent = () => {
    if (!current) return;
    const prompt = current.promptLines.join(' ').trim();
    if (!prompt) {
      current = null;
      return;
    }

    const sortedOptions = current.options.map((o) => o.text.trim()).filter(Boolean);
    const warnings: string[] = [];

    if (sortedOptions.length < 2) {
      warnings.push('Pilihan jawaban kurang dari 2 opsi.');
    }

    let correctLetter = current.correctLetter;
    let correctIndex = LETTERS.indexOf(correctLetter as (typeof LETTERS)[number]);

    if (!correctLetter || correctIndex < 0 || correctIndex >= sortedOptions.length) {
      if (correctLetter && correctIndex >= sortedOptions.length) {
        warnings.push(`Kunci jawaban "${correctLetter}" melebihi jumlah opsi (${sortedOptions.length}).`);
      } else {
        warnings.push('Kunci jawaban tidak ditemukan. Silakan pilih kunci secara manual.');
      }
      correctLetter = '';
      correctIndex = -1;
    }

    questions.push({
      tempId: `word_q_${questions.length + 1}`,
      orderIndex: questions.length,
      prompt,
      options: sortedOptions.length >= 2 ? sortedOptions.slice(0, 5) : ['Opsi A', 'Opsi B'],
      correctLetter,
      correctIndex,
      explanation: current.explanation.trim(),
      points: current.points > 0 ? current.points : 20,
      difficulty: current.difficulty,
      missingAnswerKey: correctIndex < 0,
      warnings,
    });

    current = null;
  };

  for (const line of lines) {
    // Check explicit question header: "SOAL 1", "SOAL 1.", "Pertanyaan 2:"
    const soalHeaderMatch = line.match(/^(?:SOAL|PERTANYAAN|NO\.?)\s*\d+\s*[:.\-]?\s*(.*)$/i);
    // Or numbered line starting a new question: "1. Apa fungsi..." or "1) Apa..."
    // Only treat "N." as new question if we are NOT inside an unstarted block OR if previous question already has options/key
    const numberedMatch = line.match(/^(\d{1,3})[.)]\s+(.+)$/);

    const isNewNumberedQuestion =
      numberedMatch !== null &&
      (!current || current.options.length >= 2 || current.correctLetter !== '');

    if (soalHeaderMatch || isNewNumberedQuestion) {
      flushCurrent();
      const initialPrompt = soalHeaderMatch
        ? soalHeaderMatch[1].trim()
        : numberedMatch![2].trim();
      current = {
        promptLines: initialPrompt ? [initialPrompt] : [],
        options: [],
        correctLetter: '',
        explanation: '',
        points: 20,
        difficulty: 'Sedang',
      };
      activeSection = 'prompt';
      continue;
    }

    if (!current) {
      // Ignore document title/intro headers until first question starts, unless line looks like a question with '?'
      if (line.endsWith('?') || line.endsWith('...')) {
        current = {
          promptLines: [line],
          options: [],
          correctLetter: '',
          explanation: '',
          points: 20,
          difficulty: 'Sedang',
        };
        activeSection = 'prompt';
      }
      continue;
    }

    // Check Answer Key line
    const keyMatch = line.match(
      /^(?:Kunci\s*Jawaban|Kunci|Jawaban\s*Benar|Jawaban|Answer(?:\s*Key)?)\s*[:=\-]\s*\(?([A-Ea-e])\)?/i
    );
    if (keyMatch) {
      current.correctLetter = keyMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
      activeSection = 'prompt';
      continue;
    }

    // Check Explanation line
    const expMatch = line.match(/^(?:Pembahasan|Penjelasan|Solusi|Explanation)\s*[:=\-]\s*(.+)$/i);
    if (expMatch) {
      current.explanation = expMatch[1].trim();
      activeSection = 'explanation';
      continue;
    }

    // Check Points / Weight line
    const pointsMatch = line.match(/^(?:Bobot(?:\s*Nilai)?|Poin|Nilai|Skor|Points?)\s*[:=\-]\s*(\d+)/i);
    if (pointsMatch) {
      current.points = Math.min(1000, Math.max(1, parseInt(pointsMatch[1], 10)));
      continue;
    }

    // Check Difficulty line
    const diffMatch = line.match(/^(?:Tingkat(?:\s*Kesulitan)?|Kesulitan|Difficulty)\s*[:=\-]\s*(Mudah|Sedang|Sulit)/i);
    if (diffMatch) {
      const normalized = diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase();
      if (normalized === 'Mudah' || normalized === 'Sedang' || normalized === 'Sulit') {
        current.difficulty = normalized;
      }
      continue;
    }

    // Check Option line: "A. text", "A) text", "(A) text", or multiple options on one line?
    const optMatch = line.match(/^\(?([A-Ea-e])[.)]\s+(.+)$/);
    if (optMatch) {
      current.options.push({
        letter: optMatch[1].toUpperCase(),
        text: optMatch[2].trim(),
      });
      activeSection = 'option';
      continue;
    }

    // Continuation line
    if (activeSection === 'explanation') {
      current.explanation = `${current.explanation} ${line}`.trim();
    } else if (activeSection === 'option' && current.options.length > 0) {
      const last = current.options[current.options.length - 1];
      last.text = `${last.text} ${line}`.trim();
    } else {
      current.promptLines.push(line);
    }
  }

  flushCurrent();

  if (questions.length === 0) {
    globalWarnings.push(
      'Tidak ada soal yang terdeteksi. Pastikan format mengikuti pola "SOAL 1" atau "1. Pertanyaan", diikuti pilihan A–E dan "Kunci Jawaban: X".'
    );
  }

  const missingCount = questions.filter((q) => q.missingAnswerKey).length;
  if (missingCount > 0) {
    globalWarnings.push(
      `${missingCount} soal belum memiliki kunci jawaban yang valid. Lengkapi sebelum menyimpan.`
    );
  }

  return {
    questions,
    warnings: globalWarnings,
    rawLineCount: lines.length,
  };
}

export async function extractDocxArrayBuffer(arrayBuffer: ArrayBuffer): Promise<DocxParseResult> {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return parseQuestionsFromText(result.value || '');
}

export async function extractDocxFile(file: File): Promise<DocxParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  return extractDocxArrayBuffer(arrayBuffer);
}

export async function generateWordTemplateBlob(): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'TEMPLATE BANK SOAL EDUVERSE (.DOCX)',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Petunjuk: Gunakan format SOAL 1, pilihan A–D/E, Kunci Jawaban, Pembahasan (opsional), dan Bobot Nilai (opsional).',
                italics: true,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'SOAL 1' }),
          new Paragraph({ text: 'Apa fungsi utama organel mitokondria pada sel eukariotik?' }),
          new Paragraph({ text: 'A. Sintesis protein seluler' }),
          new Paragraph({ text: 'B. Menghasilkan energi ATP melalui respirasi seluler' }),
          new Paragraph({ text: 'C. Mengatur keluar masuknya zat pada membran' }),
          new Paragraph({ text: 'D. Menyimpan materi genetik DNA inti' }),
          new Paragraph({ text: 'Kunci Jawaban: B' }),
          new Paragraph({ text: 'Pembahasan: Mitokondria merupakan pusat pembangkit energi (ATP) melalui proses fosforilasi oksidatif.' }),
          new Paragraph({ text: 'Bobot Nilai: 25' }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: 'SOAL 2' }),
          new Paragraph({ text: 'Organel sel yang berperan langsung dalam proses sintesis protein adalah...' }),
          new Paragraph({ text: 'A. Ribosom' }),
          new Paragraph({ text: 'B. Lisosom' }),
          new Paragraph({ text: 'C. Vakuola' }),
          new Paragraph({ text: 'D. Kloroplas' }),
          new Paragraph({ text: 'Kunci Jawaban: A' }),
          new Paragraph({ text: 'Pembahasan: Ribosom menerjemahkan mRNA menjadi rantai polipeptida/protein.' }),
          new Paragraph({ text: 'Bobot Nilai: 25' }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
