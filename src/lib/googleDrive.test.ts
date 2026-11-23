import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDriveDocxQuery,
  DRIVE_DOCX_MIME,
  DRIVE_GDOC_MIME,
  formatDriveFileSize,
  isDriveUpdateAvailable,
} from './googleDrive.ts';

test('buildDriveDocxQuery includes DOCX & Google Docs mime filters and escapes single quotes', () => {
  const baseQuery = buildDriveDocxQuery();
  assert.match(baseQuery, /trashed = false/);
  assert.ok(baseQuery.includes(DRIVE_DOCX_MIME));
  assert.ok(baseQuery.includes(DRIVE_GDOC_MIME));

  const searchQuery = buildDriveDocxQuery("Soal Biologi 'XI'\\Bab 1");
  assert.ok(searchQuery.includes("name contains 'Soal Biologi \\'XI\\'\\\\Bab 1'"));
});

test('isDriveUpdateAvailable detects newer modifiedTime timestamps accurately', () => {
  assert.equal(isDriveUpdateAvailable('2026-01-01T10:00:00.000Z', '2026-01-01T12:00:00.000Z'), true);
  assert.equal(isDriveUpdateAvailable('2026-01-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z'), false);
  assert.equal(isDriveUpdateAvailable('2026-01-01T12:00:00.000Z', '2026-01-01T10:00:00.000Z'), false);
  assert.equal(isDriveUpdateAvailable(undefined, '2026-01-01T12:00:00.000Z'), true);
  assert.equal(isDriveUpdateAvailable('2026-01-01T12:00:00.000Z', undefined), false);
});

test('formatDriveFileSize formats bytes, KB, MB, and Google Docs cleanly', () => {
  assert.equal(formatDriveFileSize(undefined), 'Google Docs');
  assert.equal(formatDriveFileSize('0'), 'Google Docs');
  assert.equal(formatDriveFileSize('512'), '512 B');
  assert.equal(formatDriveFileSize('24576'), '24 KB');
  assert.equal(formatDriveFileSize(String(2 * 1024 * 1024)), '2.0 MB');
});
