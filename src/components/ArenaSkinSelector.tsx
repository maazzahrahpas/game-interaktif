import React from 'react';
import { Check, MapPin, Shield, Sparkles, UserCheck } from 'lucide-react';
import type { ArenaThemeId, CharacterSkinId } from '../types/eduverse.ts';
import {
  ARENA_THEMES,
  AVATAR_COLOR_SWATCHES,
  CHARACTER_SKINS,
  type CharacterSkinConfig,
} from '../game/gameCatalog.ts';

interface ArenaSkinSelectorProps {
  selectedArenaId?: ArenaThemeId;
  onSelectArena?: (arenaId: ArenaThemeId) => void;
  selectedSkinId?: CharacterSkinId;
  onSelectSkin?: (skinId: CharacterSkinId) => void;
  avatarColor?: string;
  onSelectColor?: (hex: string) => void;
  compact?: boolean;
  hideArena?: boolean;
  hideSkin?: boolean;
}

const SkinEmblemSvg: React.FC<{ skin: CharacterSkinConfig; primaryColor: string }> = ({
  skin,
  primaryColor,
}) => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0" aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="12" fill="#0F172A" />
    {/* Shoulders / Torso */}
    <path d="M12 42C12 33 17 29 24 29C31 29 36 33 36 42" fill={primaryColor} />
    {/* Head */}
    <rect x="17" y="14" width="14" height="14" rx="4" fill="#FDE2C4" />
    {/* Unique Headgear per Skin */}
    {skin.headgearStyle === 'cap' && (
      <>
        <path d="M16 17C16 12 20 10 24 10C28 10 32 12 32 17H16Z" fill={primaryColor} />
        <rect x="16" y="16" width="20" height="3" rx="1.5" fill={skin.accentColor} />
      </>
    )}
    {skin.headgearStyle === 'cyber_helm' && (
      <>
        <rect x="15" y="11" width="18" height="16" rx="5" fill="#1E293B" stroke={skin.accentColor} strokeWidth="1.5" />
        <rect x="17" y="18" width="14" height="4" rx="2" fill={skin.visorColor} />
      </>
    )}
    {skin.headgearStyle === 'goggles' && (
      <>
        <circle cx="20" cy="20" r="3.4" fill={skin.visorColor} stroke="#1E293B" strokeWidth="1.5" />
        <circle cx="28" cy="20" r="3.4" fill={skin.visorColor} stroke="#1E293B" strokeWidth="1.5" />
        <rect x="16" y="12" width="16" height="4" rx="2" fill={primaryColor} />
      </>
    )}
    {skin.headgearStyle === 'wizard_hat' && (
      <>
        <path d="M24 5L32 16H16L24 5Z" fill={primaryColor} />
        <rect x="12" y="15" width="24" height="3" rx="1.5" fill={skin.accentColor} />
      </>
    )}
    {skin.headgearStyle === 'astro_helm' && (
      <>
        <rect x="14" y="11" width="20" height="18" rx="8" fill="#F8FAFC" />
        <rect x="17" y="16" width="14" height="7" rx="3" fill={skin.accentColor} />
      </>
    )}
    {skin.headgearStyle === 'headband' && (
      <>
        <rect x="16" y="13" width="16" height="4" rx="1.5" fill={skin.accentColor} />
        <circle cx="21" cy="21" r="1.3" fill="#0F172A" />
        <circle cx="27" cy="21" r="1.3" fill="#0F172A" />
      </>
    )}
  </svg>
);

export const ArenaSkinSelector: React.FC<ArenaSkinSelectorProps> = ({
  selectedArenaId,
  onSelectArena,
  selectedSkinId,
  onSelectSkin,
  avatarColor = '#2563EB',
  onSelectColor,
  compact = false,
  hideArena = false,
  hideSkin = false,
}) => {
  return (
    <div className="space-y-5">
      {!hideArena && selectedArenaId && onSelectArena && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
              <MapPin className="w-3.5 h-3.5" />
              Pilih Arena Dunia 3D
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {ARENA_THEMES.length} Arena Bervariasi
            </span>
          </div>
          <div className={`grid gap-2.5 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
            {ARENA_THEMES.map((arena) => {
              const active = selectedArenaId === arena.id;
              return (
                <button
                  key={arena.id}
                  type="button"
                  data-testid={`arena-option-${arena.id}`}
                  onClick={() => onSelectArena(arena.id)}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    active
                      ? 'border-blue-600 dark:border-sky-400 bg-blue-50/90 dark:bg-blue-950/50 shadow-sm ring-1 ring-blue-500/40'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div
                    className="h-2.5 w-full rounded-full mb-2.5"
                    style={{
                      background: `linear-gradient(90deg, ${arena.skyMid}, ${arena.groundAccent}, ${arena.badgeColor})`,
                    }}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{arena.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{arena.tagline}</p>
                    </div>
                    {active && <Check className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5" />}
                  </div>
                  {!compact && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {arena.description}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400">
                    Tantangan {arena.hazardSpeedMultiplier}x · Bonus Kristal {arena.bonusCrystalMultiplier}x
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!hideSkin && selectedSkinId && onSelectSkin && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-3.5 h-3.5" />
              Pilih Karakter / Skin 3D
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {CHARACTER_SKINS.length} Skin Unik
            </span>
          </div>
          <div className={`grid gap-2.5 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {CHARACTER_SKINS.map((skin) => {
              const active = selectedSkinId === skin.id;
              return (
                <button
                  key={skin.id}
                  type="button"
                  data-testid={`skin-option-${skin.id}`}
                  onClick={() => onSelectSkin(skin.id)}
                  className={`text-left rounded-xl border p-3 flex items-center gap-3 transition-all ${
                    active
                      ? 'border-emerald-600 dark:border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/45 shadow-sm ring-1 ring-emerald-500/40'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <SkinEmblemSvg
                    skin={skin}
                    primaryColor={active ? avatarColor : skin.defaultPrimary}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {skin.name}
                      </p>
                      {active && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                    </div>
                    <p className="text-[11px] font-medium text-blue-600 dark:text-sky-400 truncate">
                      {skin.roleTitle}
                    </p>
                    {!compact && (
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        {skin.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {onSelectColor && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Warna Kostum Utama
              </span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLOR_SWATCHES.map((c) => {
                  const active = avatarColor.toUpperCase() === c.hex.toUpperCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => onSelectColor(c.hex)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/40"
                        style={{ backgroundColor: c.hex }}
                        aria-hidden="true"
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!hideArena && !hideSkin && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
          <span>Arena & Skin karakter disinkronkan secara langsung ke Avatar 3D dan pemain lain di ruangan.</span>
        </div>
      )}
    </div>
  );
};
