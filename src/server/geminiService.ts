import { GoogleGenAI, Type } from '@google/genai';
import type { GameSession, StudentProgress } from '../types/eduverse.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di server. Silakan atur di panel Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateQuestionVariations(params: {
  subject: string;
  grade: string;
  topic: string;
  difficulty: string;
  count: number;
  sourceMaterial?: string;
}) {
  const ai = getAiClient();
  const safeCount = Math.min(10, Math.max(1, params.count));

  const prompt = `Buatlah ${safeCount} variasi soal pilihan ganda berbahasa Indonesia untuk siswa SMA kelas ${params.grade}.
Mata pelajaran: ${params.subject}
Topik: ${params.topic}
Tingkat kesulitan: ${params.difficulty}
${params.sourceMaterial ? `Materi acuan guru:\n${params.sourceMaterial}\n` : ''}
Setiap soal harus memiliki 4 pilihan jawaban (A, B, C, D), 1 indeks jawaban benar (0-3), petunjuk singkat (hint) yang tidak membocorkan huruf jawaban, pembahasan jelas, dan bobot nilai (10-30).
Catatan penting: Soal ini berstatus draf untuk ditinjau dan disetujui guru.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Anda adalah asisten perancang kurikulum dan soal edukasi SMA Indonesia yang akurat secara ilmiah.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING, description: 'Teks pertanyaan yang jelas.' },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Tepat 4 pilihan jawaban tanpa prefix A/B/C/D.',
            },
            correctIndex: { type: Type.INTEGER, description: 'Indeks jawaban benar 0 sampai 3.' },
            hint: { type: Type.STRING, description: 'Petunjuk Sokratis singkat.' },
            explanation: { type: Type.STRING, description: 'Pembahasan lengkap.' },
            points: { type: Type.INTEGER, description: 'Bobot poin 10 sampai 30.' },
          },
          required: ['prompt', 'options', 'correctIndex', 'hint', 'explanation', 'points'],
        },
      },
    },
  });

  const text = (response.text ?? '[]').trim();
  return JSON.parse(text);
}

export async function generateMissionPlan(params: {
  subject: string;
  grade: string;
  topic: string;
  gameMode: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Rancang skenario misi pembelajaran 3D di dunia EDUVERSE untuk mata pelajaran ${params.subject} kelas ${params.grade} topik "${params.topic}" dengan mode "${params.gameMode}".
Petakan alur quest across 6 zona: Sekolah Virtual, Taman Cendekia, Laboratorium Sains, Perpustakaan Digital, Pulau Pengetahuan, dan Arena Tantangan. Gunakan Bahasa Indonesia yang ringkas, terstruktur, dan siap dipakai guru.`,
    config: {
      systemInstruction: 'Anda adalah desainer game edukasi 3D untuk siswa SMA Indonesia.',
    },
  });
  return response.text ?? '';
}

export async function summarizeLearningResults(params: {
  session: GameSession;
  progressList: StudentProgress[];
}) {
  const ai = getAiClient();
  const compactStats = params.progressList.map((p) => ({
    nama: p.studentName,
    skor: p.score,
    benar: p.correctCount,
    dijawab: p.totalAnswered,
    zona: p.unlockedZones.length,
    status: p.status,
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analisis hasil belajar siswa pada sesi "${params.session.title}" (${params.session.subject} Kelas ${params.session.grade}, Topik: ${params.session.topic}).
Data peserta: ${JSON.stringify(compactStats)}
Berikan:
1. Ringkasan performa kelas secara singkat.
2. Identifikasi siswa atau area yang perlu remedial.
3. Rekomendasi materi remedial konkret dan langkah tindak lanjut untuk guru.`,
    config: {
      systemInstruction: 'Anda adalah analis evaluasi pembelajaran SMA yang objektif dan suportif.',
    },
  });
  return response.text ?? '';
}

export async function getStudentHint(params: {
  questionPrompt: string;
  options: string[];
  subject: string;
  topic: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Siswa sedang mengerjakan soal ${params.subject} (${params.topic}):
Pertanyaan: "${params.questionPrompt}"
Pilihan: ${params.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join(' | ')}

Berikan 1 petunjuk singkat (maksimal 2 kalimat) dalam Bahasa Indonesia untuk membantu siswa bernalar. JANGAN sebutkan huruf atau teks jawaban yang benar secara langsung!`,
    config: {
      systemInstruction:
        'Anda adalah tutor AI Sokratis di Eduverse. Dilarang membocorkan kunci jawaban atau huruf opsi benar.',
    },
  });
  return response.text ?? '';
}

export async function explainAnswerConcept(params: {
  questionPrompt: string;
  selectedOption: string;
  correctOption: string;
  isCorrect: boolean;
  subject: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Mata pelajaran: ${params.subject}
Pertanyaan: "${params.questionPrompt}"
Jawaban siswa: "${params.selectedOption}" (${params.isCorrect ? 'BENAR' : 'BELUM TEPAT'})
Jawaban benar: "${params.correctOption}"

Jelaskan konsep di balik jawaban yang benar dalam 2–3 kalimat Bahasa Indonesia yang mudah dipahami siswa SMA, serta beri 1 rekomendasi topik lanjutan atau remedial jika belum tepat.`,
    config: {
      systemInstruction: 'Anda adalah guru pembimbing AI yang ramah, jelas, dan akurat.',
    },
  });
  return response.text ?? '';
}
