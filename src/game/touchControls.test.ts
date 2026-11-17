import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePinchZoomDistance,
  computeVirtualJoystickVector,
  shouldAutoEnableTouchControls,
} from './touchControls.ts';

test('computeVirtualJoystickVector filters small thumb jitter within deadzone', () => {
  const res = computeVirtualJoystickVector(3, -4, 52, 0.14);
  assert.equal(res.x, 0);
  assert.equal(res.y, 0);
  assert.equal(res.magnitude, 0);
  assert.equal(res.isSprinting, false);
});

test('computeVirtualJoystickVector maps screen-up to forward (+y) and clamps outer sprint ring', () => {
  // Dragging straight up far past radius
  const up = computeVirtualJoystickVector(0, -90, 52, 0.14, 0.82);
  assert.equal(up.x, 0);
  assert.equal(up.y, 1);
  assert.equal(up.magnitude, 1);
  assert.equal(up.isSprinting, true);
  assert.equal(up.knobX, 0);
  assert.equal(up.knobY, -52);

  // Gentle push right (~50% radius -> walk without sprint)
  const rightWalk = computeVirtualJoystickVector(26, 0, 52, 0.14, 0.82);
  assert.ok(rightWalk.x > 0.3 && rightWalk.x < 0.6);
  assert.equal(rightWalk.y, 0);
  assert.equal(rightWalk.isSprinting, false);
});

test('shouldAutoEnableTouchControls detects smartphones and tablets accurately', () => {
  assert.equal(
    shouldAutoEnableTouchControls({ hasCoarsePointer: true, maxTouchPoints: 5, viewportWidth: 390 }),
    true
  );
  assert.equal(
    shouldAutoEnableTouchControls({ hasCoarsePointer: false, maxTouchPoints: 5, viewportWidth: 1024 }),
    true
  );
  assert.equal(
    shouldAutoEnableTouchControls({ hasCoarsePointer: false, maxTouchPoints: 0, viewportWidth: 1440 }),
    false
  );
});

test('computePinchZoomDistance clamps distance between min and max bounds', () => {
  assert.equal(computePinchZoomDistance(10, 100, 180, 6, 20), 7.2);
  assert.equal(computePinchZoomDistance(6.5, 100, 300, 6, 20), 6);
  assert.equal(computePinchZoomDistance(19.5, 200, 80, 6, 20), 20);
});
