import type { DeviceProfile, TouchControlSize } from '../types/eduverse.ts';

export interface VirtualJoystickVector {
  x: number;
  y: number;
  magnitude: number;
  isSprinting: boolean;
  knobX: number;
  knobY: number;
}

export interface TouchDetectionInput {
  hasCoarsePointer: boolean;
  maxTouchPoints: number;
  viewportWidth: number;
}

export const VIRTUAL_JOYSTICK_DEFAULTS = {
  maxRadius: 52,
  deadzone: 0.14,
  sprintThreshold: 0.82,
} as const;

/**
 * Converts pointer displacement (dx, dy in CSS pixels from stick center)
 * into normalized camera-relative game input:
 * - +x = right, -x = left
 * - +y = forward (screen up, dy < 0), -y = backward (screen down, dy > 0)
 * - Outer ring (>= sprintThreshold) activates Sprint automatically for smartphone ergonomics.
 */
export function computeVirtualJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number = VIRTUAL_JOYSTICK_DEFAULTS.maxRadius,
  deadzone: number = VIRTUAL_JOYSTICK_DEFAULTS.deadzone,
  sprintThreshold: number = VIRTUAL_JOYSTICK_DEFAULTS.sprintThreshold
): VirtualJoystickVector {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || maxRadius <= 0) {
    return { x: 0, y: 0, magnitude: 0, isSprinting: false, knobX: 0, knobY: 0 };
  }

  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) {
    return { x: 0, y: 0, magnitude: 0, isSprinting: false, knobX: 0, knobY: 0 };
  }

  const clampedDist = Math.min(dist, maxRadius);
  const ux = dx / dist;
  const uy = dy / dist;

  const knobX = Math.round(ux * clampedDist * 100) / 100 || 0;
  const knobY = Math.round(uy * clampedDist * 100) / 100 || 0;

  const rawRatio = clampedDist / maxRadius;
  const safeDeadzone = Math.max(0, Math.min(0.8, deadzone));

  if (rawRatio <= safeDeadzone) {
    return {
      x: 0,
      y: 0,
      magnitude: 0,
      isSprinting: false,
      knobX,
      knobY,
    };
  }

  const magnitude = Math.min(1, Math.max(0, (rawRatio - safeDeadzone) / (1 - safeDeadzone)));
  const x = Math.round(ux * magnitude * 1000) / 1000 || 0;
  // Screen Y increases downward, while forward game movement is +Y
  const y = Math.round(-uy * magnitude * 1000) / 1000 || 0;

  return {
    x,
    y,
    magnitude: Math.round(magnitude * 1000) / 1000,
    isSprinting: rawRatio >= sprintThreshold,
    knobX,
    knobY,
  };
}

/**
 * Determines whether touchscreen virtual controls should be enabled automatically.
 */
export function shouldAutoEnableTouchControls(input: TouchDetectionInput): boolean {
  if (input.hasCoarsePointer) return true;
  if (input.viewportWidth <= 820) return true;
  if (input.maxTouchPoints > 0 && input.viewportWidth <= 1280) return true;
  return false;
}

/**
 * Classifies current viewport/device into phone, tablet, or desktop ergonomics profile.
 */
export function getDeviceProfile(input: TouchDetectionInput): DeviceProfile {
  if (input.viewportWidth < 768) {
    return 'phone';
  }
  if (input.viewportWidth <= 1279 || (input.hasCoarsePointer && input.viewportWidth <= 1366)) {
    return 'tablet';
  }
  return 'desktop';
}

export function getTouchControlScaleValue(size: TouchControlSize, profile: DeviceProfile): number {
  const base = profile === 'phone' ? 0.92 : profile === 'tablet' ? 1.08 : 1.0;
  if (size === 'compact') return Number((base * 0.86).toFixed(2));
  if (size === 'large') return Number((base * 1.16).toFixed(2));
  return Number(base.toFixed(2));
}

/**
 * Computes clamped camera distance during two-finger pinch zoom.
 */
export function computePinchZoomDistance(
  currentDistance: number,
  prevPinchSpan: number,
  nextPinchSpan: number,
  minDistance = 6,
  maxDistance = 20
): number {
  if (
    !Number.isFinite(currentDistance) ||
    !Number.isFinite(prevPinchSpan) ||
    !Number.isFinite(nextPinchSpan) ||
    prevPinchSpan <= 1 ||
    nextPinchSpan <= 1
  ) {
    return Math.min(maxDistance, Math.max(minDistance, currentDistance || 10.5));
  }

  const delta = (prevPinchSpan - nextPinchSpan) * 0.035;
  const next = Math.min(maxDistance, Math.max(minDistance, currentDistance + delta));
  return Math.round(next * 1000) / 1000;
}

