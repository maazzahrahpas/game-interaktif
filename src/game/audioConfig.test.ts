import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampVolume,
  computeEffectiveMasterGain,
  computeEffectiveMusicGain,
  computeEffectiveSfxGain,
  DEFAULT_AUDIO_PREFERENCES,
  sanitizeAudioPreferences,
} from './audioConfig.ts';

test('clampVolume clamps values cleanly into [0, 1]', () => {
  assert.equal(clampVolume(-0.5), 0);
  assert.equal(clampVolume(1.4), 1);
  assert.equal(clampVolume(0.678), 0.68);
  assert.equal(clampVolume(Number.NaN), 0);
});

test('sanitizeAudioPreferences restores defaults on malformed inputs and preserves valid flags', () => {
  assert.deepEqual(sanitizeAudioPreferences(null), DEFAULT_AUDIO_PREFERENCES);
  assert.deepEqual(sanitizeAudioPreferences('bad'), DEFAULT_AUDIO_PREFERENCES);

  const custom = sanitizeAudioPreferences({
    masterVolume: 0.75,
    musicVolume: 2.0,
    sfxVolume: -1,
    musicEnabled: false,
    sfxEnabled: true,
    muted: true,
  });
  assert.deepEqual(custom, {
    masterVolume: 0.75,
    musicVolume: 1,
    sfxVolume: 0,
    musicEnabled: false,
    sfxEnabled: true,
    muted: true,
  });
});

test('effective gain helpers respect mute, pause, and channel switches', () => {
  const active = { ...DEFAULT_AUDIO_PREFERENCES, masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.9 };
  assert.equal(computeEffectiveMasterGain(active), 0.8);
  assert.equal(computeEffectiveMusicGain(active, false), 0.325);
  assert.equal(computeEffectiveMusicGain(active, true), 0);
  assert.equal(computeEffectiveSfxGain(active), 0.9);

  const muted = { ...active, muted: true };
  assert.equal(computeEffectiveMasterGain(muted), 0);
  assert.equal(computeEffectiveMusicGain(muted, false), 0);
  assert.equal(computeEffectiveSfxGain(muted), 0);

  const sfxOff = { ...active, sfxEnabled: false };
  assert.equal(computeEffectiveSfxGain(sfxOff), 0);
});
