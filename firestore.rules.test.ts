import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

test('firestore.rules enforces global default-deny catch-all at top', () => {
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules isolates answerKeys from students', () => {
  const answerKeyBlock = rulesText.match(/match \/answerKeys\/\{questionId\}[\s\S]*?match \/gameSessions/);
  assert.ok(answerKeyBlock, 'answerKeys block must exist');
  assert.match(answerKeyBlock[0], /existing\(\)\.teacherId == request\.auth\.uid \|\| isAdmin\(\)/);
  assert.doesNotMatch(answerKeyBlock[0], /allow get:\s*if\s*isSignedIn\(\);/);
});

test('firestore.rules prevents self-role escalation on users update', () => {
  const usersBlock = rulesText.match(/match \/users\/\{userId\}[\s\S]*?match \/classes/);
  assert.ok(usersBlock, 'users block must exist');
  assert.match(usersBlock[0], /incoming\(\)\.role == existing\(\)\.role/);
  assert.match(usersBlock[0], /incoming\(\)\.role in \['siswa', 'guru'\]/);
});

test('firestore.rules checks email_verified and hasOnly on every collection', () => {
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly/);
  assert.match(rulesText, /isValidId\(/);
});

test('firestore.rules contains no get() or exists() inside allow list blocks', () => {
  const listRules = [...rulesText.matchAll(/allow list:[^;]+;/g)].map((m) => m[0]);
  assert.ok(listRules.length >= 13, 'All collections should define explicit list rules');
  for (const rule of listRules) {
    assert.doesNotMatch(rule, /\b(get|exists)\(/, `List rule must not invoke get/exists: ${rule}`);
  }
});

test('firestore.rules allows playerStates on built-in sessions and validates skinId enum', () => {
  const playerStatesBlock = rulesText.match(/match \/playerStates\/\{stateId\}[\s\S]*?match \/auditLogs/);
  assert.ok(playerStatesBlock, 'playerStates block must exist');
  assert.match(playerStatesBlock[0], /sess_edu101/);
  assert.match(playerStatesBlock[0], /sess_fis202/);
  assert.match(playerStatesBlock[0], /'skinId'/);
  assert.match(rulesText, /'cyber_knight'/);
  assert.match(playerStatesBlock[0], /incoming\(\)\.studentId == request\.auth\.uid/);
});

