import React, { useRef } from 'react';
import { ArrowUp, Camera, MessageCircle, Compass, Zap } from 'lucide-react';
import type { WORLD_ZONES } from '../utils/gameRules.ts';

interface MobileActionPadProps {
  dashStamina: number;
  nearNpcZone: (typeof WORLD_ZONES)[number] | null;
  onJumpStart: () => void;
  onJumpEnd: () => void;
  onDash: () => void;
  onInteractOrMission: () => void;
  onResetCamera: () => void;
}

export const MobileActionPad: React.FC<MobileActionPadProps> = ({
  dashStamina,
  nearNpcZone,
  onJumpStart,
  onJumpEnd,
  onDash,
  onInteractOrMission,
  onResetCamera,
}) => {
  const jumpPointerRef = useRef<number | null>(null);
  const dashReady = dashStamina >= 99;
  const ringRadius = 24;
  const ringCirc = 2 * Math.PI * ringRadius;
  const dashOffset = ringCirc * (1 - Math.max(0, Math.min(100, dashStamina)) / 100);

  return (
    <div
      data-testid="mobile-action-pad"
      className="pointer-events-auto relative w-40 h-36 sm:w-48 sm:h-44 touch-none select-none shrink-0"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Reset Camera Align (Compact Top-Left of Cluster) */}
      <button
        type="button"
        aria-label="Luruskan Kamera di Belakang Karakter"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onResetCamera();
        }}
        className="absolute left-0 bottom-16 sm:bottom-20 w-11 h-11 rounded-full bg-slate-900/80 active:scale-95 text-slate-100 border border-slate-500/70 shadow-md flex items-center justify-center touch-none"
      >
        <Camera className="w-4 h-4 text-sky-300" />
      </button>

      {/* Dash Button (Curved Left-Arc from Jump) */}
      <button
        type="button"
        aria-label="Dash Cepat"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDash();
        }}
        className={`absolute left-7 sm:left-10 bottom-2 sm:bottom-3 w-14 h-14 rounded-full active:scale-95 border-2 shadow-lg flex flex-col items-center justify-center touch-none transition-transform ${
          dashReady
            ? 'bg-cyan-600/95 border-cyan-200 text-white'
            : 'bg-slate-900/85 border-slate-600 text-slate-300'
        }`}
      >
        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          aria-hidden="true"
          className="absolute inset-0 -rotate-90 pointer-events-none"
        >
          <circle
            cx="28"
            cy="28"
            r={ringRadius}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth="3"
          />
          <circle
            cx="28"
            cy="28"
            r={ringRadius}
            fill="none"
            stroke={dashReady ? '#67E8F9' : '#06B6D4'}
            strokeWidth="3"
            strokeDasharray={ringCirc}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <Zap className="w-4 h-4 relative z-10" />
        <span className="text-[10px] font-bold leading-none mt-0.5 relative z-10">Dash</span>
      </button>

      {/* Interact NPC / Quick Zone Mission Button (Curved Top-Arc above Jump) */}
      {nearNpcZone && (
        <div className="pointer-events-none absolute right-0 bottom-[148px] sm:bottom-[160px] rounded-lg bg-slate-900/90 border border-amber-400/70 px-2 py-0.5 text-[10px] font-bold text-amber-300 whitespace-nowrap shadow">
          {nearNpcZone.npcName}
        </div>
      )}
      <button
        type="button"
        aria-label={nearNpcZone ? `Bicara dengan ${nearNpcZone.npcName}` : 'Buka Misi Zona'}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onInteractOrMission();
        }}
        className={`absolute right-2 sm:right-3 bottom-20 sm:bottom-24 w-14 h-14 rounded-full active:scale-95 border-2 shadow-lg flex flex-col items-center justify-center touch-none transition-transform ${
          nearNpcZone
            ? 'bg-amber-500 border-amber-100 text-slate-950'
            : 'bg-blue-600/95 border-sky-200 text-white'
        }`}
      >
        {nearNpcZone ? (
          <>
            <MessageCircle className="w-5 h-5" />
            <span className="text-[10px] font-extrabold leading-none mt-0.5">Bicara</span>
          </>
        ) : (
          <>
            <Compass className="w-5 h-5" />
            <span className="text-[10px] font-bold leading-none mt-0.5">Misi</span>
          </>
        )}
      </button>

      {/* Primary Large Jump Thumb Button (Bottom-Right Natural Anchor) */}
      <button
        type="button"
        aria-label="Lompat"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          jumpPointerRef.current = e.pointerId;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignore
          }
          onJumpStart();
        }}
        onPointerUp={(e) => {
          if (jumpPointerRef.current === e.pointerId) {
            e.stopPropagation();
            jumpPointerRef.current = null;
            onJumpEnd();
          }
        }}
        onPointerCancel={(e) => {
          if (jumpPointerRef.current === e.pointerId) {
            e.stopPropagation();
            jumpPointerRef.current = null;
            onJumpEnd();
          }
        }}
        className="absolute right-0 bottom-0 w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-emerald-600/95 active:scale-95 border-2 border-emerald-200 text-white shadow-xl flex flex-col items-center justify-center touch-none transition-transform"
      >
        <ArrowUp className="w-6 h-6 stroke-[2.75]" />
        <span className="text-[11px] font-extrabold leading-none mt-0.5">Lompat</span>
      </button>
    </div>
  );
};
