import test from 'node:test';
import assert from 'node:assert/strict';
import { serverStore } from './store.ts';

test('createQuestionBankWithQuestions sanitizes options >5, clamps correctIndex, defaults missing topic, and isolates answer keys', () => {
  const result = serverStore.createQuestionBankWithQuestions({
    teacherId: 'teacher_unit_test',
    title: 'Uji Bank Soal Unit',
    subject: 'Biologi',
    grade: '11',
    topic: '',
    difficulty: 'Sedang',
    items: [
      {
        prompt: 'Apa pusat energi sel?',
        options: ['Ribosom', 'Mitokondria', 'Vakuola', 'Lisosom', 'Nukleus', 'Ekstra 6'],
        correctIndex: 5,
        explanation: 'Mitokondria menghasilkan ATP.',
        points: 25,
      },
    ],
  });

  assert.equal(result.bank.topic, 'Uji Bank Soal Unit');
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].options.length, 5);
  assert.equal(result.answerKeys.length, 1);
  assert.equal(result.answerKeys[0].correctIndex, 4);
  assert.equal(result.answerKeys[0].correctLetter, 'E');
  assert.equal('correctIndex' in result.questions[0], false);
});

test('createQuestionBankWithQuestions rejects blank option text clearly', () => {
  assert.throws(
    () =>
      serverStore.createQuestionBankWithQuestions({
        teacherId: 'teacher_unit_test',
        title: 'Uji Invalid',
        subject: 'Fisika',
        grade: '10',
        items: [
          {
            prompt: 'Pertanyaan valid',
            options: ['Opsi A', '   '],
            correctIndex: 0,
          },
        ],
      }),
    /minimal 2 pilihan jawaban yang tidak kosong/i
  );
});
