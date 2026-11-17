import React, { useEffect, useRef, useState } from 'react';
import {
  computeVirtualJoystickVector,
  VIRTUAL_JOYSTICK_DEFAULTS,
} from '../game/touchControls.ts';

interface VirtualJoystickProps {
  onMove: (dx: number, dy: number, isSprinting: boolean) => void;
  disabled?: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove, disabled = false }) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const [isActive, setIsActive] = useState(false);
  const [isSprinting, setIsSprinting] = useState(false);

  const resetStick = () => {
    activePointerIdRef.current = null;
    setIsActive(false);
    setIsSprinting(false);
    if (ringRef.current) {
      ringRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    onMoveRef.current(0, 0, false);
  };

  useEffect(() => {
    if (disabled) {
      resetStick();
    }
  }, [disabled]);

  useEffect(() => {
    return () => {
      onMoveRef.current(0, 0, false);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || activePointerIdRef.current !== null) return;
    e.stopPropagation();
    e.preventDefault();

    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Adaptive thumb origin: allow ring to shift slightly toward initial thumb touch (max 20px)
    const offsetX = Math.max(-20, Math.min(20, e.clientX - centerX));
    const offsetY = Math.max(-20, Math.min(20, e.clientY - centerY));

    originRef.current = {
      x: centerX + offsetX,
      y: centerY + offsetY,
    };

    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic pointer cannot be captured
    }

    setIsActive(true);
    if (ringRef.current) {
      ringRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    onMoveRef.current(0, 0, false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || activePointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();

    const dx = e.clientX - originRef.current.x;
    const dy = e.clientY - originRef.current.y;
    const vec = computeVirtualJoystickVector(
      dx,
      dy,
      VIRTUAL_JOYSTICK_DEFAULTS.maxRadius,
      VIRTUAL_JOYSTICK_DEFAULTS.deadzone,
      VIRTUAL_JOYSTICK_DEFAULTS.sprintThreshold
    );

    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${vec.knobX}px, ${vec.knobY}px, 0)`;
    }
    setIsSprinting((prev) => (prev !== vec.isSprinting ? vec.isSprinting : prev));
    onMoveRef.current(vec.x, vec.y, vec.isSprinting);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    resetStick();
  };

  return (
    <div
      ref={padRef}
      data-testid="virtual-joystick"
      role="application"
      aria-label="Analog Gerak 360 Derajat"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onLostPointerCapture={() => {
        if (activePointerIdRef.current !== null) {
          resetStick();
        }
      }}
      className="pointer-events-auto relative w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center touch-none select-none shrink-0"
    >
      {/* Base Ring */}
      <div
        ref={ringRef}
        className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 transition-colors flex items-center justify-center ${
          isSprinting
            ? 'bg-slate-900/75 border-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.22)]'
            : isActive
            ? 'bg-slate-900/75 border-sky-400/90 shadow-lg'
            : 'bg-slate-900/55 border-white/25 shadow-md'
        }`}
      >
        {/* Subtle Directional Crosshair Guides */}
        <svg
          width="88"
          height="88"
          viewBox="0 0 88 88"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none opacity-45"
        >
          <circle cx="44" cy="44" r="34" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-slate-300" />
          <path d="M44 10L47 16H41L44 10Z" fill="#E2E8F0" />
          <path d="M44 78L47 72H41L44 78Z" fill="#94A3B8" />
          <path d="M10 44L16 41V47L10 44Z" fill="#94A3B8" />
          <path d="M78 44L72 41V47L78 44Z" fill="#94A3B8" />
        </svg>

        {/* Thumb Knob */}
        <div
          ref={knobRef}
          className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 shadow-lg flex items-center justify-center pointer-events-none transition-colors ${
            isSprinting
              ? 'bg-amber-400 border-amber-100 text-slate-950'
              : isActive
              ? 'bg-sky-400 border-white text-slate-950'
              : 'bg-slate-100/90 border-white text-slate-800'
          }`}
        >
          <span className="text-[10px] font-extrabold tracking-tight">
            {isSprinting ? 'LARI' : 'GERAK'}
          </span>
        </div>
      </div>
    </div>
  );
};
