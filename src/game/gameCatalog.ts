import type { ArenaThemeId, CharacterSkinId, WorldZoneId } from '../types/eduverse.ts';

export interface ArenaThemeConfig {
  id: ArenaThemeId;
  name: string;
  tagline: string;
  description: string;
  badgeColor: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  skyBottom: string;
  fogHex: number;
  fogDensity: number;
  groundPrimary: string;
  groundSecondary: string;
  groundAccent: string;
  pathBase: string;
  pathLine: string;
  waterBase: string;
  waterWave: string;
  cliffHex: number;
  peakHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  keyLightHex: number;
  rimLightHex: number;
  trimHex: number;
  hazardAccentHex: number;
  hazardSpeedMultiplier: number;
  bonusCrystalMultiplier: number;
  isSpaceArena?: boolean;
}

export const DEFAULT_ARENA_ID: ArenaThemeId = 'akademi_langit';

export const ARENA_THEMES: ArenaThemeConfig[] = [
  {
    id: 'akademi_langit',
    name: 'Akademi Langit',
    tagline: 'Pulau Kampus Hijau & Menara Jam',
    description: 'Arena klasik cerah di pulau terapung hijau dengan lautan biru, taman diskusi, dan menara jam akademi.',
    badgeColor: '#2563EB',
    skyTop: '#0F172A',
    skyMid: '#1D4ED8',
    skyHorizon: '#BAE6FD',
    skyBottom: '#0284C7',
    fogHex: 0xbae6fd,
    fogDensity: 0.0036,
    groundPrimary: '#22C55E',
    groundSecondary: '#16A34A',
    groundAccent: '#4ADE80',
    pathBase: '#E7E5E4',
    pathLine: '#A8A29E',
    waterBase: '#0284C7',
    waterWave: 'rgba(186, 230, 253, 0.30)',
    cliffHex: 0x78716c,
    peakHex: 0x334155,
    hemiSkyHex: 0xe0f2fe,
    hemiGroundHex: 0x166534,
    keyLightHex: 0xfff4d6,
    rimLightHex: 0x93c5fd,
    trimHex: 0x38bdf8,
    hazardAccentHex: 0xef4444,
    hazardSpeedMultiplier: 1.0,
    bonusCrystalMultiplier: 1.0,
  },
  {
    id: 'cyber_lab',
    name: 'Cyber Neon Grid',
    tagline: 'Arena Futuristik Siber & Laser',
    description: 'Platform teknologi bergrid neon sian-violet di bawah langit senja digital dengan kecepatan drone lebih menantang.',
    badgeColor: '#06B6D4',
    skyTop: '#020617',
    skyMid: '#1E1B4B',
    skyHorizon: '#312E81',
    skyBottom: '#0891B2',
    fogHex: 0x1e1b4b,
    fogDensity: 0.0044,
    groundPrimary: '#0F172A',
    groundSecondary: '#1E293B',
    groundAccent: '#06B6D4',
    pathBase: '#1E293B',
    pathLine: '#22D3EE',
    waterBase: '#083344',
    waterWave: 'rgba(34, 211, 238, 0.35)',
    cliffHex: 0x0f172a,
    peakHex: 0x312e81,
    hemiSkyHex: 0x67e8f9,
    hemiGroundHex: 0x312e81,
    keyLightHex: 0xe0f2fe,
    rimLightHex: 0xc084fc,
    trimHex: 0x22d3ee,
    hazardAccentHex: 0xf43f5e,
    hazardSpeedMultiplier: 1.15,
    bonusCrystalMultiplier: 1.2,
  },
  {
    id: 'lembah_vulcano',
    name: 'Lembah Magma',
    tagline: 'Kawah Basalt & Jembatan Bara',
    description: 'Dataran tinggi vulkanik dikelilingi lahar menyala. Ideal untuk mode Boss Battle & tantangan skor tinggi.',
    badgeColor: '#EA580C',
    skyTop: '#1C1917',
    skyMid: '#7C2D12',
    skyHorizon: '#FB923C',
    skyBottom: '#9A3412',
    fogHex: 0x7c2d12,
    fogDensity: 0.0041,
    groundPrimary: '#44403C',
    groundSecondary: '#292524',
    groundAccent: '#F97316',
    pathBase: '#57534E',
    pathLine: '#F59E0B',
    waterBase: '#DC2626',
    waterWave: 'rgba(253, 224, 71, 0.42)',
    cliffHex: 0x1c1917,
    peakHex: 0x451a03,
    hemiSkyHex: 0xfdba74,
    hemiGroundHex: 0x451a03,
    keyLightHex: 0xffedd5,
    rimLightHex: 0xf97316,
    trimHex: 0xf97316,
    hazardAccentHex: 0xfacc15,
    hazardSpeedMultiplier: 1.25,
    bonusCrystalMultiplier: 1.3,
  },
  {
    id: 'stasiun_kosmik',
    name: 'Stasiun Kosmik',
    tagline: 'Platform Orbit Bintang & Aurora',
    description: 'Stasiun riset antariksa di tengah gugusan bintang aurora dengan dek titanium dan cincin energi orbit.',
    badgeColor: '#8B5CF6',
    skyTop: '#030712',
    skyMid: '#1E1B4B',
    skyHorizon: '#4C1D95',
    skyBottom: '#0F172A',
    fogHex: 0x0f172a,
    fogDensity: 0.0032,
    groundPrimary: '#334155',
    groundSecondary: '#1E293B',
    groundAccent: '#A78BFA',
    pathBase: '#CBD5E1',
    pathLine: '#818CF8',
    waterBase: '#090D1F',
    waterWave: 'rgba(167, 139, 250, 0.34)',
    cliffHex: 0x1e293b,
    peakHex: 0x4c1d95,
    hemiSkyHex: 0xddd6fe,
    hemiGroundHex: 0x0f172a,
    keyLightHex: 0xf8fafc,
    rimLightHex: 0xa78bfa,
    trimHex: 0xa78bfa,
    hazardAccentHex: 0xec4899,
    hazardSpeedMultiplier: 1.2,
    bonusCrystalMultiplier: 1.25,
    isSpaceArena: true,
  },
];

export interface CharacterSkinConfig {
  id: CharacterSkinId;
  name: string;
  roleTitle: string;
  description: string;
  defaultPrimary: string;
  accentColor: string;
  visorColor: string;
  headgearStyle: 'cap' | 'cyber_helm' | 'goggles' | 'wizard_hat' | 'astro_helm' | 'headband';
}

export const DEFAULT_SKIN_ID: CharacterSkinId = 'explorer';

export const CHARACTER_SKINS: CharacterSkinConfig[] = [
  {
    id: 'explorer',
    name: 'Penjelajah Akademi',
    roleTitle: 'Petualang Serba Bisa',
    description: 'Topi eksplorasi klasik dengan ransel energi ringan.',
    defaultPrimary: '#2563EB',
    accentColor: '#F59E0B',
    visorColor: '#38BDF8',
    headgearStyle: 'cap',
  },
  {
    id: 'cyber_knight',
    name: 'Ksatria Siber',
    roleTitle: 'Penjaga Grid Digital',
    description: 'Helm visor neon sian dengan pelindung bahu futuristik.',
    defaultPrimary: '#0891B2',
    accentColor: '#22D3EE',
    visorColor: '#67E8F9',
    headgearStyle: 'cyber_helm',
  },
  {
    id: 'bio_scientist',
    name: 'Ilmuwan Bio-Lab',
    roleTitle: 'Peneliti Eksperimen',
    description: 'Kacamata laboratorium bersinar & tangki reaktor punggung.',
    defaultPrimary: '#10B981',
    accentColor: '#FDE047',
    visorColor: '#34D399',
    headgearStyle: 'goggles',
  },
  {
    id: 'arcane_scholar',
    name: 'Cendekiawan Arkana',
    roleTitle: 'Ahli Logika & Strategi',
    description: 'Topi runcing akademi dengan kristal fokus melayang.',
    defaultPrimary: '#7C3AED',
    accentColor: '#FBBF24',
    visorColor: '#C084FC',
    headgearStyle: 'wizard_hat',
  },
  {
    id: 'astro_pilot',
    name: 'Pilot Kosmik',
    roleTitle: 'Navigator Orbit',
    description: 'Helm astronot bervisor emas dan jetpack kembar.',
    defaultPrimary: '#EA580C',
    accentColor: '#FACC15',
    visorColor: '#FDBA74',
    headgearStyle: 'astro_helm',
  },
  {
    id: 'ninja_logic',
    name: 'Shinobi Logika',
    roleTitle: 'Pelari Dash Tercepat',
    description: 'Ikat kepala taktis dengan syal merah menyala.',
    defaultPrimary: '#1E293B',
    accentColor: '#F43F5E',
    visorColor: '#FB7185',
    headgearStyle: 'headband',
  },
];

export const AVATAR_COLOR_SWATCHES = [
  { label: 'Biru Akademi', hex: '#2563EB' },
  { label: 'Zamrud', hex: '#10B981' },
  { label: 'Sian Sains', hex: '#0891B2' },
  { label: 'Oranye Energi', hex: '#EA580C' },
  { label: 'Ungu Kosmik', hex: '#7C3AED' },
  { label: 'Merah Crimson', hex: '#E11D48' },
] as const;

export function getArenaTheme(arenaId?: string | null): ArenaThemeConfig {
  const found = ARENA_THEMES.find((a) => a.id === arenaId);
  return found ?? ARENA_THEMES[0];
}

export function getCharacterSkin(skinId?: string | null): CharacterSkinConfig {
  const found = CHARACTER_SKINS.find((s) => s.id === skinId);
  return found ?? CHARACTER_SKINS[0];
}

export function arenaIdToWorldId(arenaId?: ArenaThemeId | string): string {
  const valid = ARENA_THEMES.find((a) => a.id === arenaId);
  if (!valid || valid.id === 'akademi_langit') return 'world_eduverse_utama';
  return `arena_${valid.id}`;
}

export function resolveArenaIdFromSession(session?: { arenaId?: ArenaThemeId; worldId?: string } | null): ArenaThemeId {
  if (session?.arenaId && ARENA_THEMES.some((a) => a.id === session.arenaId)) {
    return session.arenaId;
  }
  const worldId = session?.worldId || '';
  if (worldId.startsWith('arena_')) {
    const candidate = worldId.slice('arena_'.length);
    const match = ARENA_THEMES.find((a) => a.id === candidate);
    if (match) return match.id;
  }
  return DEFAULT_ARENA_ID;
}

export interface RadarBlipTarget {
  zoneId: WorldZoneId;
  label: string;
  angleRad: number;
  distanceMeters: number;
  type: 'npc' | 'crystal';
}
