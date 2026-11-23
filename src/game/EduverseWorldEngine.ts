import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  AnimState,
  ArenaThemeId,
  CharacterSkinId,
  PlayerAvatarState,
  WorldZoneId,
} from '../types/eduverse.ts';
import { WORLD_ZONES } from '../utils/gameRules.ts';
import { audioSynth } from './audioSynth.ts';
import {
  DEFAULT_ARENA_ID,
  DEFAULT_SKIN_ID,
  getArenaTheme,
  type RadarBlipTarget,
} from './gameCatalog.ts';
import { computePinchZoomDistance } from './touchControls.ts';
import {
  buildAcademyLandmark,
  buildChallengeArenaLandmark,
  buildCompositeAvatar,
  buildFloatingPlatform,
  buildJumpPad,
  buildKnowledgeIslandLandmark,
  buildLampPost,
  buildLaserPylon,
  buildLibraryLandmark,
  buildScienceLabLandmark,
  buildSentinelDrone,
  createCanvasTexture,
  createNameplateSprite,
  createSkyDomeTexture,
  type AvatarRig,
  type SentinelDroneRig,
} from './worldGeometry.ts';

// Zero-GC pre-allocated scratch helpers at module scope
const _moveDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _tempColor = new THREE.Color();
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();

const PARTICLE_POOL_SIZE = 96;

export interface WorldCallbacks {
  onZoneChange?: (zoneId: WorldZoneId) => void;
  onNearNpcChange?: (npcZone: (typeof WORLD_ZONES)[number] | null) => void;
  onInteractNpc?: (zone: (typeof WORLD_ZONES)[number]) => void;
  onCollectCrystal?: (crystalId: string, xpBonus: number, timeBonusSeconds: number, isGolden: boolean) => void;
  onHazardHit?: (reason: string) => void;
  onNearHazardChange?: (near: boolean) => void;
  onDashStaminaChange?: (percent: number) => void;
  onRadarUpdate?: (blips: RadarBlipTarget[]) => void;
  onLocalMoveBroadcast?: (state: {
    x: number;
    y: number;
    z: number;
    rotY: number;
    animState: AnimState;
    currentZone: WorldZoneId;
  }) => void;
}

interface ObstacleCircle {
  x: number;
  z: number;
  r: number;
}

interface GateMesh {
  zoneId: WorldZoneId;
  mesh: THREE.Mesh;
  lockedY: number;
  unlocked: boolean;
}

interface CrystalItem {
  id: string;
  mesh: THREE.Mesh;
  x: number;
  baseY: number;
  z: number;
  collected: boolean;
  isGolden: boolean;
}

interface PlatformBox {
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfD: number;
}

interface JumpPadEntry {
  x: number;
  z: number;
  ring: THREE.Mesh;
  cooldown: number;
}

interface SentinelDroneEntry {
  rig: SentinelDroneRig;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
  x: number;
  z: number;
  chargeTimer: number;
  cooldownTimer: number;
  warned: boolean;
}

interface LaserPylonEntry {
  rotator: THREE.Group;
  x: number;
  z: number;
  beamLength: number;
  angle: number;
  speed: number;
}

interface RemoteAvatarEntry {
  rig: AvatarRig;
  targetPos: THREE.Vector3;
  targetRotY: number;
  animState: AnimState;
  walkPhase: number;
  avatarColor: string;
  skinId: CharacterSkinId;
  displayName: string;
}

export class EduverseWorldEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private mode: 'tour' | 'playing';
  private callbacks: WorldCallbacks;

  private frameId = 0;
  private disposed = false;
  private paused = false;
  private lastTime = performance.now();
  private elapsed = 0;

  private arenaId: ArenaThemeId;
  private skinId: CharacterSkinId;
  private avatarColor: string;
  private playerName: string;
  private envGroup: THREE.Group;
  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private orbitalRingMesh: THREE.Mesh | null = null;

  private waterTex: THREE.CanvasTexture | null = null;
  private playerRig: AvatarRig;
  private playerPos = new THREE.Vector3(0, 0, 14);
  private playerVelY = 0;
  private knockbackVel = new THREE.Vector3();
  private playerRotY = Math.PI;
  private grounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private walkPhase = 0;
  private squashX = 1;
  private squashY = 1;
  private interactTimer = 0;

  // Dash, Shield i-frames & Game Feel Juice
  private dashTimer = 0;
  private dashCooldown = 0;
  private lastStaminaReported = 100;
  private invulnTimer = 0;
  private hitstopTimer = 0;
  private trauma = 0;

  private camYaw = 0;
  private camPitch = 0.34;
  private camDistance = 10.5;
  private cameraSensitivity = 1.0;
  private autoFollowCamera = false;
  private activeCanvasPointers = new Map<number, { x: number; y: number }>();
  private lastPinchSpan = 0;

  private keys = new Set<string>();
  private virtualMove = { x: 0, y: 0 };
  private virtualSprint = false;
  private gamepadJumpLatch = false;
  private gamepadInteractLatch = false;
  private gamepadDashLatch = false;

  private obstacles: ObstacleCircle[] = [];
  private platforms: PlatformBox[] = [];
  private jumpPads: JumpPadEntry[] = [];
  private drones: SentinelDroneEntry[] = [];
  private lasers: LaserPylonEntry[] = [];
  private npcEntries: Array<{
    zone: (typeof WORLD_ZONES)[number];
    rig: AvatarRig;
    halo: THREE.Mesh;
  }> = [];
  private gates: GateMesh[] = [];
  private crystals: CrystalItem[] = [];
  private collectedCrystalIds = new Set<string>();
  private remoteAvatars = new Map<string, RemoteAvatarEntry>();

  // Zero-GC Pooled Particle System
  private particleMesh!: THREE.InstancedMesh;
  private pActive = new Uint8Array(PARTICLE_POOL_SIZE);
  private pLife = new Float32Array(PARTICLE_POOL_SIZE);
  private pMaxLife = new Float32Array(PARTICLE_POOL_SIZE);
  private px = new Float32Array(PARTICLE_POOL_SIZE);
  private py = new Float32Array(PARTICLE_POOL_SIZE);
  private pz = new Float32Array(PARTICLE_POOL_SIZE);
  private pvx = new Float32Array(PARTICLE_POOL_SIZE);
  private pvy = new Float32Array(PARTICLE_POOL_SIZE);
  private pvz = new Float32Array(PARTICLE_POOL_SIZE);
  private pCursor = 0;

  private activeZone: WorldZoneId = 'sekolah';
  private nearestNpc: (typeof WORLD_ZONES)[number] | null = null;
  private nearHazard = false;
  private unlockedZones = new Set<WorldZoneId>(['sekolah', 'taman']);
  private completedZones = new Set<WorldZoneId>();
  private lastBroadcastTime = 0;
  private lastRadarTime = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    options: {
      mode: 'tour' | 'playing';
      playerName?: string;
      avatarColor?: string;
      skinId?: CharacterSkinId;
      arenaId?: ArenaThemeId;
      cameraSensitivity?: number;
      autoFollowCamera?: boolean;
      callbacks?: WorldCallbacks;
    }
  ) {
    this.container = container;
    this.mode = options.mode;
    this.arenaId = options.arenaId || DEFAULT_ARENA_ID;
    this.skinId = options.skinId || DEFAULT_SKIN_ID;
    this.avatarColor = options.avatarColor || '#2563EB';
    this.playerName = options.playerName || 'Kamu';
    this.cameraSensitivity = options.cameraSensitivity ?? 1.0;
    this.autoFollowCamera = options.autoFollowCamera ?? false;
    this.callbacks = options.callbacks || {};

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const initTheme = getArenaTheme(this.arenaId);
    this.scene.background = new THREE.Color(initTheme.fogHex);
    this.scene.fog = new THREE.FogExp2(initTheme.fogHex, initTheme.fogDensity);
    this.envGroup = new THREE.Group();
    this.scene.add(this.envGroup);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 320);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.setupLighting();
    this.buildWorldEnvironment();
    this.initParticlePool();

    this.playerRig = buildCompositeAvatar(this.avatarColor, '#F59E0B', false, this.skinId);
    const nameplate = createNameplateSprite(this.playerName, '#38BDF8');
    nameplate.position.y = 2.58;
    nameplate.scale.set(2.8, 0.6, 1);
    this.playerRig.root.add(nameplate);
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    this.playerRig.root.visible = this.mode === 'playing';
    this.scene.add(this.playerRig.root);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.updateCamera(1);
    this.startLoop();
  }

  private setupLighting() {
    const theme = getArenaTheme(this.arenaId);
    this.hemiLight = new THREE.HemisphereLight(theme.hemiSkyHex, theme.hemiGroundHex, 0.72);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(theme.keyLightHex, 1.5);
    this.keyLight.position.set(36, 48, 32);
    if (!this.isSoftwareGl) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.left = -52;
      this.keyLight.shadow.camera.right = 52;
      this.keyLight.shadow.camera.top = 52;
      this.keyLight.shadow.camera.bottom = -52;
      this.keyLight.shadow.camera.near = 5;
      this.keyLight.shadow.camera.far = 140;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(theme.rimLightHex, 0.55);
    this.rimLight.position.set(-30, 22, -35);
    this.scene.add(this.rimLight);
  }

  private disposeGroupResources(group: THREE.Object3D) {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          std.map?.dispose();
          m.dispose();
        });
      } else if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
  }

  private initParticlePool() {
    const geo = new THREE.OctahedronGeometry(0.18, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, PARTICLE_POOL_SIZE);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      _dummyPos.set(0, -100, 0);
      _dummyQuat.identity();
      _dummyScale.set(0, 0, 0);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.particleMesh.setMatrixAt(i, _dummyMatrix);
      _tempColor.setHex(0x38bdf8);
      this.particleMesh.setColorAt(i, _tempColor);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);
  }

  private spawnParticleBurst(x: number, y: number, z: number, count: number, hexColor: number, speed = 5.5) {
    _tempColor.setHex(hexColor);
    for (let i = 0; i < count; i++) {
      const idx = this.pCursor;
      this.pCursor = (this.pCursor + 1) % PARTICLE_POOL_SIZE;
      this.pActive[idx] = 1;
      const life = 0.35 + Math.random() * 0.35;
      this.pLife[idx] = life;
      this.pMaxLife[idx] = life;
      this.px[idx] = x + (Math.random() - 0.5) * 0.4;
      this.py[idx] = y + Math.random() * 0.4;
      this.pz[idx] = z + (Math.random() - 0.5) * 0.4;
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.45 + Math.random() * 0.75);
      this.pvx[idx] = Math.cos(ang) * spd;
      this.pvy[idx] = speed * (0.55 + Math.random() * 0.85);
      this.pvz[idx] = Math.sin(ang) * spd;
      this.particleMesh.setColorAt(idx, _tempColor);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private buildWorldEnvironment() {
    const theme = getArenaTheme(this.arenaId);
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Sync scene atmosphere & lights
    this.scene.background = new THREE.Color(theme.fogHex);
    this.scene.fog = new THREE.FogExp2(theme.fogHex, theme.fogDensity);
    this.hemiLight.color.setHex(theme.hemiSkyHex);
    this.hemiLight.groundColor.setHex(theme.hemiGroundHex);
    this.keyLight.color.setHex(theme.keyLightHex);
    this.rimLight.color.setHex(theme.rimLightHex);
    this.orbitalRingMesh = null;

    // Gradient Atmospheric Sky Dome
    const skyTex = createSkyDomeTexture(theme);
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(205, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    );
    this.envGroup.add(skyDome);

    const groundTex = createCanvasTexture(
      (ctx, s) => {
        ctx.fillStyle = theme.groundPrimary;
        ctx.fillRect(0, 0, s, s);
        if (theme.id === 'cyber_lab') {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
          ctx.lineWidth = 2;
          for (let g = 0; g < s; g += 32) {
            ctx.beginPath();
            ctx.moveTo(g, 0);
            ctx.lineTo(g, s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, g);
            ctx.lineTo(s, g);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(192, 132, 252, 0.25)';
          for (let i = 0; i < 64; i += 32) {
            ctx.fillRect(i * 4, (i * 2) % s, 6, 6);
          }
        } else if (theme.id === 'lembah_vulcano') {
          for (let i = 0; i < 420; i++) {
            ctx.fillStyle = i % 5 === 0 ? theme.groundAccent : theme.groundSecondary;
            ctx.fillRect((i * 41) % s, (i * 61) % s, i % 5 === 0 ? 5 : 9, i % 5 === 0 ? 3 : 9);
          }
        } else if (theme.id === 'stasiun_kosmik') {
          ctx.strokeStyle = 'rgba(167, 139, 250, 0.3)';
          ctx.lineWidth = 3;
          for (let g = 0; g < s; g += 64) {
            ctx.strokeRect(g + 2, 2, 60, 60);
            ctx.strokeRect(g + 2, 66, 60, 60);
            ctx.strokeRect(g + 2, 130, 60, 60);
            ctx.strokeRect(g + 2, 194, 60, 60);
          }
        } else {
          for (let i = 0; i < 600; i++) {
            ctx.fillStyle = i % 3 === 0 ? theme.groundSecondary : i % 3 === 1 ? '#15803d' : theme.groundAccent;
            ctx.fillRect((i * 37) % s, (i * 53) % s, 8, 8);
          }
        }
      },
      256,
      true,
      18,
      maxAniso
    );

    const stoneTex = createCanvasTexture(
      (ctx, s) => {
        ctx.fillStyle = theme.pathBase;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = theme.pathLine;
        ctx.lineWidth = 4;
        for (let y = 0; y < s; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(s, y);
          ctx.stroke();
        }
        for (let x = 0; x < s; x += 48) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, s);
          ctx.stroke();
        }
      },
      256,
      true,
      5,
      maxAniso
    );

    this.waterTex = createCanvasTexture(
      (ctx, s) => {
        ctx.fillStyle = theme.waterBase;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = theme.waterWave;
        ctx.lineWidth = 3;
        for (let y = 16; y < s; y += 32) {
          ctx.beginPath();
          for (let x = 0; x <= s; x += 32) {
            ctx.quadraticCurveTo(x + 8, y - 6, x + 16, y);
            ctx.quadraticCurveTo(x + 24, y + 6, x + 32, y);
          }
          ctx.stroke();
        }
      },
      256,
      true,
      16,
      maxAniso
    );

    // Shimmering Ocean / Magma / Cyber Grid / Void Perimeter
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.waterTex,
        emissive: theme.id === 'lembah_vulcano' ? 0x7c2d12 : 0x000000,
        emissiveIntensity: theme.id === 'lembah_vulcano' ? 0.55 : 0,
        roughness: 0.2,
        metalness: 0.25,
        envMapIntensity: 0.55,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.75;
    this.envGroup.add(water);

    // Distant Horizon Archipelago Silhouette Peaks (InstancedMesh)
    const peakGeo =
      theme.id === 'cyber_lab'
        ? new THREE.BoxGeometry(14, 34, 14)
        : new THREE.ConeGeometry(16, 26, theme.isSpaceArena ? 4 : 6);
    const peakMat = new THREE.MeshStandardMaterial({
      color: theme.peakHex,
      emissive: theme.id === 'cyber_lab' ? 0x312e81 : theme.id === 'lembah_vulcano' ? 0x451a03 : 0x000000,
      emissiveIntensity: 0.35,
      roughness: 0.85,
      envMapIntensity: 0.15,
    });
    const peaks = new THREE.InstancedMesh(peakGeo, peakMat, 12);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + 0.2;
      const dist = 110 + (i % 3) * 14;
      const sc = 0.8 + (i % 4) * 0.35;
      _dummyPos.set(Math.cos(ang) * dist, 10 * sc - 2, Math.sin(ang) * dist);
      _dummyQuat.setFromAxisAngle(_camForward.set(0, 1, 0), i * 0.7);
      _dummyScale.set(sc * 1.2, sc, sc * 1.1);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      peaks.setMatrixAt(i, _dummyMatrix);
    }
    peaks.computeBoundingSphere();
    this.envGroup.add(peaks);

    // Orbital Halo Ring for Space & Cyber Arenas
    if (theme.isSpaceArena || theme.id === 'cyber_lab') {
      const haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(62, 0.45, 10, 64),
        new THREE.MeshStandardMaterial({
          color: theme.trimHex,
          emissive: theme.trimHex,
          emissiveIntensity: 0.9,
          roughness: 0.2,
        })
      );
      haloRing.position.set(0, 24, -8);
      haloRing.rotation.x = Math.PI * 0.42;
      haloRing.rotation.y = 0.25;
      this.envGroup.add(haloRing);
      this.orbitalRingMesh = haloRing;
    }

    // Main Eduverse Continent
    const continentBase = new THREE.Mesh(
      new THREE.CylinderGeometry(44, 48, 1.4, 36),
      new THREE.MeshStandardMaterial({ color: theme.cliffHex, roughness: 0.88, envMapIntensity: 0.15 })
    );
    continentBase.position.y = -0.75;
    this.envGroup.add(continentBase);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(43.5, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: groundTex,
        roughness: theme.id === 'cyber_lab' || theme.isSpaceArena ? 0.52 : 0.88,
        metalness: theme.isSpaceArena ? 0.22 : 0.04,
        envMapIntensity: 0.15,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.envGroup.add(ground);

    // Central Stone/Metal Plaza & Pathways
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stoneTex,
      roughness: 0.78,
      envMapIntensity: 0.18,
    });
    const centralPlaza = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.2, 0.1, 24), pathMat);
    centralPlaza.position.set(0, 0.04, 10);
    centralPlaza.receiveShadow = true;
    this.envGroup.add(centralPlaza);

    const pathSegments: Array<[number, number, number, number, number]> = [
      [0, 12, 3.6, 22, 0],
      [-10, 12, 22, 3.2, 0.1],
      [12, 4, 24, 3.2, -0.55],
      [-12, -2, 24, 3.2, 0.75],
      [13, 16, 24, 3.2, 0.35],
    ];
    pathSegments.forEach(([x, z, w, d, rot]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), pathMat);
      p.position.set(x, 0.03, z);
      p.rotation.y = rot;
      p.receiveShadow = true;
      this.envGroup.add(p);
    });

    // Cyber-Academic Lamp Posts framing the outer plaza rim & avenues
    const lampCoords: Array<[number, number, number]> = [
      [-6.5, 13.5, 0],
      [6.5, 13.5, Math.PI],
      [-6.5, 6.5, 0],
      [6.5, 6.5, Math.PI],
      [-13, 10, 0.3],
      [13, 10, Math.PI - 0.3],
    ];
    lampCoords.forEach(([lx, lz, rot]) => {
      const lamp = buildLampPost(theme.trimHex);
      lamp.position.set(lx, 0, lz);
      lamp.rotation.y = rot;
      this.envGroup.add(lamp);
    });

    // Bridge to Knowledge Island
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: theme.id === 'akademi_langit' ? 0x92400e : theme.cliffHex,
      roughness: 0.7,
    });
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 16), bridgeMat);
    bridgeDeck.position.set(0, 0.16, -22);
    bridgeDeck.receiveShadow = true;
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 16), bridgeMat);
    railL.position.set(-2.1, 0.75, -22);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 16), bridgeMat);
    railR.position.set(2.1, 0.75, -22);
    this.envGroup.add(bridgeDeck, railL, railR);

    // 6 Iconic Landmarks
    const academy = buildAcademyLandmark(stoneTex);
    academy.position.set(0, 0, -2);
    this.envGroup.add(academy);
    this.obstacles.push({ x: 0, z: -2, r: 7.5 });

    const lab = buildScienceLabLandmark();
    lab.position.set(26, 0, -10);
    this.envGroup.add(lab);
    this.obstacles.push({ x: 26, z: -10, r: 6.2 });

    const library = buildLibraryLandmark();
    library.position.set(-26, 0, -16);
    this.envGroup.add(library);
    this.obstacles.push({ x: -26, z: -16, r: 5.5 });

    const island = buildKnowledgeIslandLandmark();
    island.position.set(0, 0, -37);
    this.envGroup.add(island);
    this.obstacles.push({ x: 3.5, z: -39, r: 2.5 });

    const arena = buildChallengeArenaLandmark();
    arena.position.set(28, 0, 22);
    this.envGroup.add(arena);

    const fountainBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.6, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 })
    );
    fountainBase.position.set(-22, 0.35, 16);
    const fountainWater = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 0.75, 16),
      new THREE.MeshStandardMaterial({
        color: theme.trimHex,
        emissive: theme.trimHex,
        emissiveIntensity: theme.id === 'akademi_langit' ? 0.1 : 0.45,
        roughness: 0.15,
        metalness: 0.2,
      })
    );
    fountainWater.position.set(-22, 0.38, 16);
    const fountainSpire = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: theme.hazardAccentHex, roughness: 0.35 })
    );
    fountainSpire.position.set(-22, 1.6, 16);
    this.envGroup.add(fountainBase, fountainWater, fountainSpire);
    this.obstacles.push({ x: -22, z: 16, r: 3.4 });

    // Instanced Flora / Energy Pylons (24 entries tailored by Arena theme)
    const treePositions: Array<[number, number]> = [
      [-32, 6], [-35, 18], [-28, 28], [-16, 32], [-12, 20], [-29, -4],
      [34, 6], [36, -18], [16, 34], [14, -14], [-14, -12], [-34, -26],
      [-20, -28], [18, -26], [35, 14], [12, 28], [-8, 35], [8, 36],
      [-37, -10], [38, -2], [-25, 24], [24, -24], [-6, -42], [6, -42],
    ];
    const trunkGeo =
      theme.id === 'akademi_langit'
        ? new THREE.CylinderGeometry(0.35, 0.5, 2.4, 8)
        : new THREE.CylinderGeometry(0.28, 0.42, 2.8, 6);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: theme.id === 'akademi_langit' ? 0x78350f : 0x1e293b,
      roughness: 0.75,
    });
    const canopyGeo =
      theme.id === 'akademi_langit'
        ? new THREE.DodecahedronGeometry(1.9, 0)
        : theme.id === 'lembah_vulcano'
        ? new THREE.ConeGeometry(1.4, 3.2, 5)
        : new THREE.OctahedronGeometry(1.5, 0);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: theme.id === 'akademi_langit' ? 0x000000 : theme.trimHex,
      emissiveIntensity: theme.id === 'akademi_langit' ? 0 : 0.25,
      roughness: 0.58,
    });

    const trunksInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const canopiesInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
    trunksInst.castShadow = !this.isSoftwareGl;
    canopiesInst.castShadow = !this.isSoftwareGl;

    const paletteMap: Record<ArenaThemeId, number[]> = {
      akademi_langit: [0x16a34a, 0x22c55e, 0x15803d, 0x10b981],
      cyber_lab: [0x06b6d4, 0x3b82f6, 0x8b5cf6, 0x22d3ee],
      lembah_vulcano: [0xea580c, 0xf97316, 0xdc2626, 0xf59e0b],
      stasiun_kosmik: [0x8b5cf6, 0x6366f1, 0x38bdf8, 0xa855f7],
    };
    const treePalette = paletteMap[theme.id];

    treePositions.forEach(([tx, tz], i) => {
      const s = 0.85 + ((i * 19) % 30) / 100;
      _dummyPos.set(tx, 1.2 * s, tz);
      _dummyQuat.identity();
      _dummyScale.set(s, s, s);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      trunksInst.setMatrixAt(i, _dummyMatrix);

      _dummyPos.set(tx, 3.2 * s, tz);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      canopiesInst.setMatrixAt(i, _dummyMatrix);
      _tempColor.setHex(treePalette[i % treePalette.length]);
      canopiesInst.setColorAt(i, _tempColor);
    });
    trunksInst.computeBoundingSphere();
    canopiesInst.computeBoundingSphere();
    this.envGroup.add(trunksInst, canopiesInst);

    // Interactive NPCs at each of the 6 zones
    WORLD_ZONES.forEach((zone) => {
      const rig = buildCompositeAvatar(zone.color, '#FDE047', true, 'explorer');
      rig.root.position.set(zone.position[0], 0, zone.position[2]);
      const label = createNameplateSprite(zone.npcName, zone.color, zone.name);
      label.position.y = 3.15;
      rig.root.add(label);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.08, 8, 20),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xeab308,
          emissiveIntensity: 0.8,
        })
      );
      halo.position.y = 3.95;
      rig.root.add(halo);
      this.envGroup.add(rig.root);
      this.npcEntries.push({ zone, rig, halo });
    });

    // Interactive Zone Energy Gates
    const gateConfigs: Array<{ zoneId: WorldZoneId; x: number; z: number; rotY: number; color: number }> = [
      { zoneId: 'lab', x: 18, z: -6, rotY: 0.9, color: 0x06b6d4 },
      { zoneId: 'perpustakaan', x: -18, z: -10, rotY: -0.9, color: 0xf59e0b },
      { zoneId: 'pulau', x: 0, z: -28, rotY: 0, color: 0x8b5cf6 },
      { zoneId: 'arena', x: 20, z: 17, rotY: -0.7, color: 0xef4444 },
    ];
    gateConfigs.forEach((g) => {
      const unlocked = this.unlockedZones.has(g.zoneId);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 3.6, 0.45),
        new THREE.MeshStandardMaterial({
          color: g.color,
          emissive: g.color,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.72,
          roughness: 0.2,
        })
      );
      mesh.position.set(g.x, unlocked ? -2.8 : 1.8, g.z);
      mesh.visible = !unlocked;
      mesh.rotation.y = g.rotY;
      this.envGroup.add(mesh);
      this.gates.push({ zoneId: g.zoneId, mesh, lockedY: 1.8, unlocked });
    });

    // 5 Energy Jump Pads + Elevated Parkour Platforms holding Golden Chrono Crystals
    const jumpPadData: Array<{ padX: number; padZ: number; platX: number; platY: number; platZ: number; color: number }> = [
      { padX: -9, padZ: 15, platX: -12, platY: 3.4, platZ: 19, color: 0x10b981 },
      { padX: 9, padZ: 9, platX: 13, platY: 3.6, platZ: 5, color: 0x06b6d4 },
      { padX: -11, padZ: -5, platX: -15, platY: 3.8, platZ: -9, color: 0xf59e0b },
      { padX: 0, padZ: -17, platX: 0, platY: 4.0, platZ: -22, color: 0x8b5cf6 },
      { padX: 17, padZ: 21, platX: 21, platY: 4.2, platZ: 25, color: 0xf43f5e },
    ];

    const goldenCrystalGeo = new THREE.OctahedronGeometry(0.68, 0);
    const goldenCrystalMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.0,
      roughness: 0.12,
      metalness: 0.7,
    });

    jumpPadData.forEach((jp, idx) => {
      const pad = buildJumpPad(jp.color);
      pad.root.position.set(jp.padX, 0, jp.padZ);
      this.envGroup.add(pad.root);
      this.jumpPads.push({ x: jp.padX, z: jp.padZ, ring: pad.ring, cooldown: 0 });

      const plat = buildFloatingPlatform(4.6, 4.6, jp.color);
      plat.position.set(jp.platX, jp.platY, jp.platZ);
      this.envGroup.add(plat);
      this.platforms.push({ x: jp.platX, y: jp.platY + 0.22, z: jp.platZ, halfW: 2.35, halfD: 2.35 });

      const crystalId = `golden_chrono_${idx + 1}`;
      const isCollected = this.collectedCrystalIds.has(crystalId);
      const goldMesh = new THREE.Mesh(goldenCrystalGeo, goldenCrystalMat);
      goldMesh.position.set(jp.platX, jp.platY + 1.4, jp.platZ);
      goldMesh.visible = !isCollected;
      this.envGroup.add(goldMesh);
      this.crystals.push({
        id: crystalId,
        mesh: goldMesh,
        x: jp.platX,
        baseY: jp.platY + 1.4,
        z: jp.platZ,
        collected: isCollected,
        isGolden: true,
      });
    });

    // Standard Ground Knowledge Crystals
    const crystalCoords: Array<[number, number]> = [
      [5, 16], [-6, 15], [-14, 14], [12, 4], [-13, -4],
      [18, -14], [-18, -18], [0, -18], [16, 14], [24, 14],
    ];
    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: theme.trimHex,
      emissive: theme.trimHex,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.5,
    });
    crystalCoords.forEach(([cx, cz], idx) => {
      const crystalId = `crystal_${idx + 1}`;
      const isCollected = this.collectedCrystalIds.has(crystalId);
      const mesh = new THREE.Mesh(crystalGeo, crystalMat);
      mesh.position.set(cx, 1.15, cz);
      mesh.visible = !isCollected;
      this.envGroup.add(mesh);
      this.crystals.push({
        id: crystalId,
        mesh,
        x: cx,
        baseY: 1.15,
        z: cz,
        collected: isCollected,
        isGolden: false,
      });
    });

    // 4 Patrolling Sentinel Drones (speed tuned per Arena challenge)
    const droneConfigs = [
      { cx: -14, cz: 10, rx: 4.5, rz: 3.5, speed: 0.95, phase: 0, color: 0xf97316 },
      { cx: 14, cz: -3, rx: 4.5, rz: 4.0, speed: 1.1, phase: 1.7, color: 0xef4444 },
      { cx: -14, cz: -14, rx: 4.0, rz: 4.5, speed: 1.05, phase: 3.2, color: 0xf97316 },
      { cx: 25, cz: 19, rx: 4.8, rz: 4.8, speed: 1.3, phase: 4.6, color: 0xf43f5e },
    ];
    droneConfigs.forEach((dc) => {
      const rig = buildSentinelDrone(dc.color);
      rig.root.position.set(dc.cx, 0, dc.cz);
      this.envGroup.add(rig.root);
      this.drones.push({
        rig,
        centerX: dc.cx,
        centerZ: dc.cz,
        radiusX: dc.rx,
        radiusZ: dc.rz,
        speed: dc.speed * theme.hazardSpeedMultiplier,
        phase: dc.phase,
        x: dc.cx,
        z: dc.cz,
        chargeTimer: 0,
        cooldownTimer: 0,
        warned: false,
      });
    });

    // 2 Rotating Energy Laser Pylons
    const laserConfigs = [
      { x: 0, z: -22, beamLength: 4.2, speed: 1.25 },
      { x: 28, z: 22, beamLength: 5.5, speed: 1.55 },
    ];
    laserConfigs.forEach((lc) => {
      const pylon = buildLaserPylon(lc.beamLength);
      pylon.root.position.set(lc.x, 0, lc.z);
      this.envGroup.add(pylon.root);
      this.lasers.push({
        rotator: pylon.rotator,
        x: lc.x,
        z: lc.z,
        beamLength: lc.beamLength,
        angle: 0,
        speed: lc.speed * theme.hazardSpeedMultiplier,
      });
    });
  }

  private getGroundHeightAt(x: number, z: number): number {
    let maxH = 0;
    for (const p of this.platforms) {
      if (Math.abs(x - p.x) <= p.halfW && Math.abs(z - p.z) <= p.halfD) {
        if (this.playerPos.y >= p.y - 0.55) {
          maxH = Math.max(maxH, p.y);
        }
      }
    }
    return maxH;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'playing' || this.paused) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      this.jumpBufferTimer = 0.14;
    }
    if (e.code === 'KeyQ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.triggerDash();
    }
    if (e.code === 'KeyE' && this.nearestNpc) {
      this.triggerInteract();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'Space' && this.playerVelY > 0) {
      this.playerVelY *= 0.45;
    }
  };

  private handleBlur = () => {
    this.keys.clear();
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
    this.virtualSprint = false;
    this.activeCanvasPointers.clear();
    this.lastPinchSpan = 0;
  };

  private getPinchSpan(): number {
    if (this.activeCanvasPointers.size < 2) return 0;
    const pts = Array.from(this.activeCanvasPointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.mode !== 'playing') return;
    this.activeCanvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activeCanvasPointers.size === 2) {
      this.lastPinchSpan = this.getPinchSpan();
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.mode !== 'playing') return;
    const prev = this.activeCanvasPointers.get(e.pointerId);
    if (!prev) return;

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.activeCanvasPointers.size >= 2) {
      const nextSpan = this.getPinchSpan();
      if (this.lastPinchSpan > 1 && nextSpan > 1) {
        this.camDistance = computePinchZoomDistance(
          this.camDistance,
          this.lastPinchSpan,
          nextSpan,
          6,
          20
        );
      }
      this.lastPinchSpan = nextSpan;
      return;
    }

    const baseSens = e.pointerType === 'touch' ? 0.0075 : 0.0065;
    const sens = baseSens * this.cameraSensitivity;
    this.camYaw -= dx * sens;
    this.camPitch = THREE.MathUtils.clamp(
      this.camPitch + dy * 0.0048 * this.cameraSensitivity,
      0.12,
      1.05
    );
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.activeCanvasPointers.has(e.pointerId)) return;
    this.activeCanvasPointers.delete(e.pointerId);
    if (this.activeCanvasPointers.size < 2) {
      this.lastPinchSpan = 0;
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.mode !== 'playing') return;
    this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.008, 6, 20);
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.paused = true;
  };

  private handleContextRestored = () => {
    this.paused = false;
    this.lastTime = performance.now();
  };

  private bindEvents() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    dom.addEventListener('wheel', this.handleWheel, { passive: true });
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    dom.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  public setMode(mode: 'tour' | 'playing') {
    this.mode = mode;
    this.playerRig.root.visible = mode === 'playing';
    if (mode === 'playing') {
      this.keys.clear();
      this.updateCamera(1);
    }
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.keys.clear();
      this.virtualMove.x = 0;
      this.virtualMove.y = 0;
      this.virtualSprint = false;
      this.activeCanvasPointers.clear();
      this.lastPinchSpan = 0;
    } else {
      this.lastTime = performance.now();
    }
  }

  public respawnAtPlaza() {
    this.playerPos.set(0, 0, 14);
    this.playerVelY = 0;
    this.knockbackVel.set(0, 0, 0);
    this.grounded = true;
    this.invulnTimer = 2.0;
    this.dashCooldown = 0;
    this.activeZone = 'sekolah';
    this.callbacks.onZoneChange?.('sekolah');
    this.callbacks.onDashStaminaChange?.(100);
  }

  public setUnlockedZones(zones: WorldZoneId[], completedQuestionZoneIds: WorldZoneId[] = []) {
    const prevCount = this.unlockedZones.size;
    this.unlockedZones = new Set(zones);
    this.completedZones = new Set(completedQuestionZoneIds);
    if (this.unlockedZones.size > prevCount) {
      audioSynth.playUnlock();
      this.spawnParticleBurst(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z, 18, 0x38bdf8, 6.5);
    }
    this.gates.forEach((g) => {
      g.unlocked = this.unlockedZones.has(g.zoneId);
    });
  }

  public setVirtualInput(dx: number, dy: number, sprint = false) {
    this.virtualMove.x = THREE.MathUtils.clamp(dx, -1, 1);
    this.virtualMove.y = THREE.MathUtils.clamp(dy, -1, 1);
    this.virtualSprint = sprint;
  }

  public triggerJump() {
    if (this.paused) return;
    this.jumpBufferTimer = 0.14;
  }

  public releaseJump() {
    if (this.playerVelY > 0) {
      this.playerVelY *= 0.45;
    }
  }

  public resetCameraBehindPlayer() {
    this.camYaw = this.playerRotY + Math.PI;
    this.camPitch = 0.34;
  }

  public triggerDash() {
    if (this.paused || this.mode !== 'playing') return;
    if (this.dashCooldown > 0 || this.dashTimer > 0) return;
    this.dashTimer = 0.22;
    this.dashCooldown = 1.45;
    this.squashX = 0.8;
    this.squashY = 1.2;
    audioSynth.playDash();
    this.spawnParticleBurst(this.playerPos.x, this.playerPos.y + 0.9, this.playerPos.z, 14, 0x38bdf8, 5);
  }

  public triggerInteract() {
    if (!this.nearestNpc || this.paused) return;
    this.interactTimer = 0.45;
    this.callbacks.onInteractNpc?.(this.nearestNpc);
  }

  public teleportToZone(zoneId: WorldZoneId) {
    const z = WORLD_ZONES.find((item) => item.id === zoneId);
    if (!z) return;
    this.playerPos.set(z.position[0], 0, z.position[2] + 4);
    this.playerVelY = 0;
    this.knockbackVel.set(0, 0, 0);
    this.grounded = true;
    this.invulnTimer = 1.0;
    this.activeZone = zoneId;
    this.callbacks.onZoneChange?.(zoneId);
  }

  public setPlayerAppearance(
    skinId: CharacterSkinId,
    avatarColor: string,
    playerName?: string
  ) {
    if (
      this.skinId === skinId &&
      this.avatarColor === avatarColor &&
      (!playerName || this.playerName === playerName)
    ) {
      return;
    }
    this.skinId = skinId;
    this.avatarColor = avatarColor;
    if (playerName) this.playerName = playerName;

    this.scene.remove(this.playerRig.root);
    this.disposeGroupResources(this.playerRig.root);

    this.playerRig = buildCompositeAvatar(this.avatarColor, '#F59E0B', false, this.skinId);
    const nameplate = createNameplateSprite(this.playerName, '#38BDF8');
    nameplate.position.y = 2.58;
    nameplate.scale.set(2.8, 0.6, 1);
    this.playerRig.root.add(nameplate);
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    this.playerRig.root.visible = this.mode === 'playing';
    this.scene.add(this.playerRig.root);
    this.spawnParticleBurst(this.playerPos.x, this.playerPos.y + 1.2, this.playerPos.z, 16, 0x38bdf8, 5.2);
  }

  public setArenaTheme(nextArenaId: ArenaThemeId) {
    if (this.arenaId === nextArenaId) return;
    this.arenaId = nextArenaId;

    this.disposeGroupResources(this.envGroup);
    this.envGroup.clear();
    this.obstacles = [];
    this.platforms = [];
    this.jumpPads = [];
    this.drones = [];
    this.lasers = [];
    this.npcEntries = [];
    this.gates = [];
    this.crystals = [];

    this.buildWorldEnvironment();
    this.spawnParticleBurst(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z, 22, 0xfacc15, 6.5);
  }

  public setCameraOptions(opts: { sensitivity?: number; autoFollow?: boolean }) {
    if (typeof opts.sensitivity === 'number') {
      this.cameraSensitivity = THREE.MathUtils.clamp(opts.sensitivity, 0.4, 2.2);
    }
    if (typeof opts.autoFollow === 'boolean') {
      this.autoFollowCamera = opts.autoFollow;
    }
  }

  public syncRemotePlayers(players: PlayerAvatarState[], localStudentId: string) {
    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.studentId === localStudentId) continue;
      activeIds.add(p.studentId);
      const nextSkin = p.skinId || 'explorer';
      const nextColor = p.avatarColor || '#10B981';
      let entry = this.remoteAvatars.get(p.studentId);

      if (
        entry &&
        (entry.skinId !== nextSkin ||
          entry.avatarColor !== nextColor ||
          entry.displayName !== p.displayName)
      ) {
        this.scene.remove(entry.rig.root);
        this.disposeGroupResources(entry.rig.root);
        this.remoteAvatars.delete(p.studentId);
        entry = undefined;
      }

      if (!entry) {
        const rig = buildCompositeAvatar(nextColor, '#F59E0B', false, nextSkin);
        const tag = createNameplateSprite(p.displayName, nextColor);
        tag.position.y = 2.65;
        rig.root.add(tag);
        rig.root.position.set(p.x, p.y, p.z);
        this.scene.add(rig.root);
        entry = {
          rig,
          targetPos: new THREE.Vector3(p.x, p.y, p.z),
          targetRotY: p.rotY,
          animState: p.animState,
          walkPhase: 0,
          avatarColor: nextColor,
          skinId: nextSkin,
          displayName: p.displayName,
        };
        this.remoteAvatars.set(p.studentId, entry);
      } else {
        entry.targetPos.set(p.x, p.y, p.z);
        entry.targetRotY = p.rotY;
        entry.animState = p.animState;
      }
    }

    for (const [id, entry] of this.remoteAvatars.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.rig.root);
        this.disposeGroupResources(entry.rig.root);
        this.remoteAvatars.delete(id);
      }
    }
  }

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(rawDt, this.isSoftwareGl ? 0.14 : 0.05);

      if (!this.paused) {
        this.elapsed += dt;
        if (dt > 0.05) {
          this.updateSimulation(dt * 0.5, now);
          this.updateSimulation(dt * 0.5, now);
        } else {
          this.updateSimulation(dt, now);
        }
      }
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private applyHazardDamage(sourceX: number, sourceZ: number, reason: string) {
    if (this.dashTimer > 0 || this.invulnTimer > 0) return;

    this.invulnTimer = 1.45;
    this.hitstopTimer = 0.055;
    this.trauma = Math.min(1, this.trauma + 0.68);
    this.squashX = 1.3;
    this.squashY = 0.72;

    const dx = this.playerPos.x - sourceX;
    const dz = this.playerPos.z - sourceZ;
    const len = Math.hypot(dx, dz) || 1;
    this.knockbackVel.set((dx / len) * 14, 0, (dz / len) * 14);
    this.playerVelY = Math.max(this.playerVelY, 5.5);
    this.grounded = false;

    audioSynth.playHurt();
    this.spawnParticleBurst(this.playerPos.x, this.playerPos.y + 1.0, this.playerPos.z, 18, 0xf43f5e, 7.2);
    this.callbacks.onHazardHit?.(reason);
  }

  private updateParticles(dt: number) {
    let dirty = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      if (!this.pActive[i]) continue;
      dirty = true;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        this.pActive[i] = 0;
        _dummyPos.set(0, -100, 0);
        _dummyScale.set(0, 0, 0);
        _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
        this.particleMesh.setMatrixAt(i, _dummyMatrix);
        continue;
      }
      this.pvy[i] -= 14 * dt;
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      this.pz[i] += this.pvz[i] * dt;

      const ratio = this.pLife[i] / this.pMaxLife[i];
      _dummyPos.set(this.px[i], this.py[i], this.pz[i]);
      _dummyQuat.setFromEuler(_lookTarget.set(ratio * 4, ratio * 6, 0) as unknown as THREE.Euler);
      _dummyScale.setScalar(0.5 + ratio * 0.9);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      this.particleMesh.setMatrixAt(i, _dummyMatrix);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateSimulation(dt: number, nowMs: number) {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.trauma = Math.max(0, this.trauma - dt * 1.1);
      this.updateCamera(dt);
      return;
    }

    if (this.waterTex) {
      this.waterTex.offset.x = (this.elapsed * 0.018) % 1;
      this.waterTex.offset.y = (this.elapsed * 0.012) % 1;
    }

    // Animate NPCs, Halos, Crystals, Gates, Jump Pads
    for (const npc of this.npcEntries) {
      const done = this.completedZones.has(npc.zone.id);
      npc.halo.rotation.y += dt * 2.2;
      npc.halo.position.y = 3.95 + Math.sin(this.elapsed * 3) * 0.12;
      (npc.halo.material as THREE.MeshStandardMaterial).color.setHex(done ? 0x22c55e : 0xfacc15);
      npc.rig.head.rotation.y = Math.sin(this.elapsed * 1.4 + npc.zone.position[0]) * 0.25;
    }

    for (const gate of this.gates) {
      const targetY = gate.unlocked ? -2.8 : gate.lockedY;
      gate.mesh.position.y = THREE.MathUtils.damp(gate.mesh.position.y, targetY, 6, dt);
      gate.mesh.visible = gate.mesh.position.y > -2.3;
    }

    for (const crystal of this.crystals) {
      if (crystal.collected) continue;
      crystal.mesh.rotation.y += dt * (crystal.isGolden ? 3.2 : 2.1);
      crystal.mesh.position.y = crystal.baseY + Math.sin(this.elapsed * 3.2 + crystal.x) * 0.18;
    }

    for (const pad of this.jumpPads) {
      pad.cooldown = Math.max(0, pad.cooldown - dt);
      pad.ring.position.y = 0.55 + Math.sin(this.elapsed * 4.5 + pad.x) * 0.18;
      pad.ring.rotation.z += dt * 1.5;
    }

    // Animate Sentinel Drones & Rotating Lasers
    for (const d of this.drones) {
      const t = this.elapsed * d.speed + d.phase;
      d.x = d.centerX + Math.cos(t) * d.radiusX;
      d.z = d.centerZ + Math.sin(t) * d.radiusZ;
      d.rig.root.position.set(d.x, 0, d.z);
      d.rig.body.position.y = 1.65 + Math.sin(this.elapsed * 4.2 + d.phase) * 0.18;
      d.rig.scannerRing.rotation.z += dt * 3.0;
      d.rig.body.rotation.y = -t;
      d.cooldownTimer = Math.max(0, d.cooldownTimer - dt);
    }

    for (const l of this.lasers) {
      l.angle = (l.angle + l.speed * dt) % (Math.PI * 2);
      l.rotator.rotation.y = l.angle;
    }

    if (this.orbitalRingMesh) {
      this.orbitalRingMesh.rotation.z += dt * 0.12;
    }

    // Interpolate Remote Players
    for (const remote of this.remoteAvatars.values()) {
      remote.rig.root.position.x = THREE.MathUtils.damp(remote.rig.root.position.x, remote.targetPos.x, 10, dt);
      remote.rig.root.position.y = THREE.MathUtils.damp(remote.rig.root.position.y, remote.targetPos.y, 10, dt);
      remote.rig.root.position.z = THREE.MathUtils.damp(remote.rig.root.position.z, remote.targetPos.z, 10, dt);
      remote.rig.root.rotation.y = THREE.MathUtils.damp(remote.rig.root.rotation.y, remote.targetRotY, 10, dt);
      if (remote.animState === 'walk' || remote.animState === 'run') {
        remote.walkPhase += dt * (remote.animState === 'run' ? 14 : 9);
        const swing = Math.sin(remote.walkPhase) * 0.6;
        remote.rig.leftLeg.rotation.x = swing;
        remote.rig.rightLeg.rotation.x = -swing;
        remote.rig.leftArm.rotation.x = -swing * 0.8;
        remote.rig.rightArm.rotation.x = swing * 0.8;
      } else {
        remote.rig.leftLeg.rotation.x = THREE.MathUtils.damp(remote.rig.leftLeg.rotation.x, 0, 12, dt);
        remote.rig.rightLeg.rotation.x = THREE.MathUtils.damp(remote.rig.rightLeg.rotation.x, 0, 12, dt);
      }
    }

    this.updateParticles(dt);

    if (this.mode === 'tour') {
      const tourAngle = this.elapsed * 0.16;
      this.camera.position.set(
        Math.sin(tourAngle) * 34,
        18 + Math.sin(this.elapsed * 0.4) * 2.5,
        Math.cos(tourAngle) * 34
      );
      this.camera.lookAt(0, 5, -6);
      return;
    }

    // Playing Mode: Dash cooldown & Invulnerability blink
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.45);

    const staminaPct = Math.round(Math.max(0, Math.min(100, (1 - this.dashCooldown / 1.45) * 100)));
    if (Math.abs(staminaPct - this.lastStaminaReported) >= 5 || staminaPct === 100) {
      this.lastStaminaReported = staminaPct;
      this.callbacks.onDashStaminaChange?.(staminaPct);
    }

    // Input & Camera-Relative Movement (Keyboard + Touch Joystick + Optional Gamepad)
    let moveForward = 0;
    let moveRight = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    moveForward += this.virtualMove.y;
    moveRight += this.virtualMove.x;

    let gamepadSprint = false;
    try {
      const pads = navigator.getGamepads?.();
      const gp = pads?.[0];
      if (gp && gp.connected) {
        const lx = Math.abs(gp.axes[0] || 0) > 0.18 ? gp.axes[0] : 0;
        const ly = Math.abs(gp.axes[1] || 0) > 0.18 ? gp.axes[1] : 0;
        moveRight += lx;
        moveForward -= ly;
        const rx = Math.abs(gp.axes[2] || 0) > 0.2 ? gp.axes[2] : 0;
        const ry = Math.abs(gp.axes[3] || 0) > 0.2 ? gp.axes[3] : 0;
        if (rx !== 0) this.camYaw -= rx * 2.2 * this.cameraSensitivity * dt;
        if (ry !== 0) this.camPitch = THREE.MathUtils.clamp(this.camPitch + ry * 1.4 * dt, 0.12, 1.05);

        const jumpDown = Boolean(gp.buttons[0]?.pressed);
        if (jumpDown && !this.gamepadJumpLatch) this.jumpBufferTimer = 0.14;
        this.gamepadJumpLatch = jumpDown;

        const dashDown = Boolean(gp.buttons[2]?.pressed || gp.buttons[5]?.pressed);
        if (dashDown && !this.gamepadDashLatch) this.triggerDash();
        this.gamepadDashLatch = dashDown;
        gamepadSprint = Boolean(gp.buttons[4]?.pressed || gp.buttons[7]?.pressed);

        const interactDown = Boolean(gp.buttons[3]?.pressed);
        if (interactDown && !this.gamepadInteractLatch && this.nearestNpc) this.triggerInteract();
        this.gamepadInteractLatch = interactDown;
      }
    } catch {
      // Ignore Gamepad API restrictions
    }

    _camForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    _camRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();

    _moveDir.set(0, 0, 0);
    _moveDir.addScaledVector(_camForward, moveForward);
    _moveDir.addScaledVector(_camRight, moveRight);

    const rawMag = _moveDir.length();
    const isMoving = rawMag > 0.02;
    const analogScale = isMoving ? Math.min(1, rawMag) : 0;
    const isDashing = this.dashTimer > 0;
    const isSprinting =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.virtualSprint || gamepadSprint;
    const baseSpeed = isDashing ? 23.5 : isSprinting ? 14.5 : 9.4;
    const speed = isDashing ? baseSpeed : baseSpeed * analogScale;

    if (this.autoFollowCamera && isMoving && this.activeCanvasPointers.size === 0) {
      const targetYaw = this.playerRotY + Math.PI;
      let yawDiff = targetYaw - this.camYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.camYaw += yawDiff * (1 - Math.exp(-2.8 * dt));
    }

    if (isDashing && !isMoving) {
      // Dash in facing direction even if stationary
      this.playerPos.x += Math.sin(this.playerRotY) * baseSpeed * dt;
      this.playerPos.z += Math.cos(this.playerRotY) * baseSpeed * dt;
    } else if (isMoving) {
      _moveDir.divideScalar(rawMag);
      this.playerPos.x += _moveDir.x * speed * dt;
      this.playerPos.z += _moveDir.z * speed * dt;
      const targetRot = Math.atan2(_moveDir.x, _moveDir.z);
      let diff = targetRot - this.playerRotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerRotY += diff * (1 - Math.exp(-14 * dt));
      this.walkPhase += speed * dt * 1.15;
    }

    // Apply decaying knockback
    if (this.knockbackVel.lengthSq() > 0.04) {
      this.playerPos.x += this.knockbackVel.x * dt;
      this.playerPos.z += this.knockbackVel.z * dt;
      this.knockbackVel.multiplyScalar(Math.exp(-8 * dt));
    }

    // Keep player on continent / bridge / island
    const onIslandBridge = Math.abs(this.playerPos.x) < 2.2 && this.playerPos.z < -13 && this.playerPos.z > -48;
    const distFromIslandCenter = Math.hypot(this.playerPos.x, this.playerPos.z + 37);
    const distFromMainCenter = Math.hypot(this.playerPos.x, this.playerPos.z);

    if (!onIslandBridge && distFromIslandCenter > 10.5 && distFromMainCenter > 41.5) {
      const scale = 41.5 / distFromMainCenter;
      this.playerPos.x *= scale;
      this.playerPos.z *= scale;
    }

    // Obstacle collision pushout
    for (const obs of this.obstacles) {
      const dx = this.playerPos.x - obs.x;
      const dz = this.playerPos.z - obs.z;
      const dist = Math.hypot(dx, dz);
      const minR = obs.r + 0.6;
      if (dist < minR && dist > 0.001) {
        const push = (minR - dist) / dist;
        this.playerPos.x += dx * push;
        this.playerPos.z += dz * push;
      }
    }

    // Locked Zone Gate blocking
    for (const gate of this.gates) {
      if (gate.unlocked) continue;
      const dx = this.playerPos.x - gate.mesh.position.x;
      const dz = this.playerPos.z - gate.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.4 && dist > 0.001) {
        const push = (2.4 - dist) / dist;
        this.playerPos.x += dx * push;
        this.playerPos.z += dz * push;
      }
    }

    // Jump Pad activation
    for (const pad of this.jumpPads) {
      if (pad.cooldown <= 0 && this.playerPos.y < 1.2) {
        if (Math.hypot(this.playerPos.x - pad.x, this.playerPos.z - pad.z) < 1.55) {
          pad.cooldown = 0.65;
          this.playerVelY = 17.6;
          this.grounded = false;
          this.squashX = 0.76;
          this.squashY = 1.28;
          audioSynth.playJumpPad();
          this.spawnParticleBurst(pad.x, 0.5, pad.z, 16, 0x10b981, 6.2);
        }
      }
    }

    // Jump & Gravity with Coyote Time & Elevated Platform Grounding
    if (this.grounded) {
      this.coyoteTimer = 0.1;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.playerVelY = 11.0;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.squashX = 0.84;
      this.squashY = 1.18;
      audioSynth.playJump();
      this.spawnParticleBurst(this.playerPos.x, this.playerPos.y + 0.1, this.playerPos.z, 6, 0xe2e8f0, 2.5);
    }

    this.playerVelY -= 26 * dt;
    this.playerPos.y += this.playerVelY * dt;
    const floorY = this.getGroundHeightAt(this.playerPos.x, this.playerPos.z);

    if (this.playerPos.y <= floorY && this.playerVelY <= 0) {
      if (!this.grounded && this.playerVelY < -4) {
        this.squashX = 1.2;
        this.squashY = 0.8;
      }
      this.playerPos.y = floorY;
      this.playerVelY = 0;
      this.grounded = true;
    } else if (this.playerPos.y > floorY + 0.05) {
      this.grounded = false;
    }

    this.squashX = THREE.MathUtils.damp(this.squashX, 1, 14, dt);
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);
    this.interactTimer = Math.max(0, this.interactTimer - dt);

    // Sentinel Drone Telegraph & Shockwave Checks
    let playerNearHazard = false;
    for (const d of this.drones) {
      const dist = Math.hypot(this.playerPos.x - d.x, this.playerPos.z - d.z);
      if (dist < 6.2) {
        playerNearHazard = true;
      }
      if (dist < 4.7 && d.cooldownTimer <= 0 && this.playerPos.y < 2.8) {
        if (!d.warned) {
          d.warned = true;
          audioSynth.playWarningBeep();
        }
        d.chargeTimer += dt;
        const pulse = Math.min(1, d.chargeTimer / 0.65);
        d.rig.warningMat.opacity = 0.25 + pulse * 0.65;
        d.rig.warningDisc.scale.setScalar(1 + pulse * 0.35);
        d.rig.eyeMat.emissiveIntensity = 1.2 + pulse * 2.2;

        if (d.chargeTimer >= 0.65) {
          d.chargeTimer = 0;
          d.cooldownTimer = 1.5;
          d.warned = false;
          d.rig.warningDisc.scale.setScalar(1);
          this.spawnParticleBurst(d.x, 1.0, d.z, 14, 0xef4444, 6.0);
          if (dist < 3.1 && this.playerPos.y < 2.3) {
            this.applyHazardDamage(d.x, d.z, 'Terkena gelombang kejut Drone Penjaga!');
          }
        }
      } else {
        d.chargeTimer = Math.max(0, d.chargeTimer - dt * 1.5);
        d.warned = false;
        d.rig.warningMat.opacity = 0.2;
        d.rig.warningDisc.scale.setScalar(1);
        d.rig.eyeMat.emissiveIntensity = 1.25;
      }
    }

    // Rotating Laser Pylon Hit Checks (can jump over y >= 1.45 or dash through)
    for (const l of this.lasers) {
      const distCenter = Math.hypot(this.playerPos.x - l.x, this.playerPos.z - l.z);
      if (distCenter < l.beamLength + 3.0) {
        playerNearHazard = true;
      }
      if (distCenter <= l.beamLength + 0.35 && distCenter > 0.6 && this.playerPos.y < 1.35) {
        const dirX = Math.cos(-l.angle);
        const dirZ = Math.sin(-l.angle);
        const relX = this.playerPos.x - l.x;
        const relZ = this.playerPos.z - l.z;
        const proj = relX * dirX + relZ * dirZ;
        if (proj >= 0 && proj <= l.beamLength) {
          const perp = Math.abs(relX * -dirZ + relZ * dirX);
          if (perp < 0.52) {
            this.applyHazardDamage(l.x, l.z, 'Terkena sapuan Laser Energi! Lompat atau Dash untuk menghindar.');
          }
        }
      }
    }

    if (playerNearHazard !== this.nearHazard) {
      this.nearHazard = playerNearHazard;
      this.callbacks.onNearHazardChange?.(playerNearHazard);
    }

    // Apply transforms & articulated limb animation + i-frame blink
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    this.playerRig.bodyGroup.scale.set(this.squashX, this.squashY, this.squashX);
    this.playerRig.bodyGroup.visible =
      this.invulnTimer <= 0 || Math.floor(this.invulnTimer * 16) % 2 === 0;
    this.playerRig.shadowDisc.position.y = floorY - this.playerPos.y + 0.02;
    const shadowFade = Math.max(0.12, 0.36 - (this.playerPos.y - floorY) * 0.05);
    (this.playerRig.shadowDisc.material as THREE.MeshBasicMaterial).opacity = shadowFade;

    let animState: AnimState = 'idle';
    if (this.interactTimer > 0) {
      animState = 'interact';
      this.playerRig.rightArm.rotation.x = -2.2;
    } else if (!this.grounded) {
      animState = 'jump';
      this.playerRig.leftArm.rotation.x = -0.8;
      this.playerRig.rightArm.rotation.x = -0.8;
    } else if (isMoving || isDashing) {
      animState = isSprinting || isDashing ? 'run' : 'walk';
      const swing = Math.sin(this.walkPhase) * (isSprinting || isDashing ? 0.85 : 0.58);
      this.playerRig.leftLeg.rotation.x = swing;
      this.playerRig.rightLeg.rotation.x = -swing;
      this.playerRig.leftArm.rotation.x = -swing * 0.75;
      this.playerRig.rightArm.rotation.x = swing * 0.75;
    } else {
      this.playerRig.leftLeg.rotation.x = THREE.MathUtils.damp(this.playerRig.leftLeg.rotation.x, 0, 12, dt);
      this.playerRig.rightLeg.rotation.x = THREE.MathUtils.damp(this.playerRig.rightLeg.rotation.x, 0, 12, dt);
      this.playerRig.leftArm.rotation.x = THREE.MathUtils.damp(this.playerRig.leftArm.rotation.x, 0, 12, dt);
      this.playerRig.rightArm.rotation.x = THREE.MathUtils.damp(this.playerRig.rightArm.rotation.x, 0, 12, dt);
    }

    // Collectible crystals pickup check (3D distance check so sky platform crystals require jumping up!)
    for (const c of this.crystals) {
      if (c.collected) continue;
      const dx = this.playerPos.x - c.x;
      const dy = this.playerPos.y + 1.0 - c.baseY;
      const dz = this.playerPos.z - c.z;
      if (dx * dx + dy * dy + dz * dz < 3.8) {
        c.collected = true;
        this.collectedCrystalIds.add(c.id);
        c.mesh.visible = false;
        audioSynth.playPickup(c.isGolden);
        this.spawnParticleBurst(
          c.x,
          c.baseY,
          c.z,
          c.isGolden ? 20 : 10,
          c.isGolden ? 0xfacc15 : 0x38bdf8,
          c.isGolden ? 6.5 : 4.2
        );
        this.callbacks.onCollectCrystal?.(
          c.id,
          c.isGolden ? 40 : 15,
          c.isGolden ? 15 : 0,
          c.isGolden
        );
      }
    }

    // Nearest NPC & Active Zone detection
    let closestZone = WORLD_ZONES[0];
    let minZoneDist = Infinity;
    let foundInteractNpc: (typeof WORLD_ZONES)[number] | null = null;
    for (const npc of this.npcEntries) {
      const d = Math.hypot(
        this.playerPos.x - npc.zone.position[0],
        this.playerPos.z - npc.zone.position[2]
      );
      if (d < minZoneDist) {
        minZoneDist = d;
        closestZone = npc.zone;
      }
      if (d < 4.5 && this.playerPos.y < 3.0) {
        foundInteractNpc = npc.zone;
      }
    }

    if (closestZone.id !== this.activeZone) {
      this.activeZone = closestZone.id;
      this.callbacks.onZoneChange?.(closestZone.id);
    }
    if ((foundInteractNpc?.id || null) !== (this.nearestNpc?.id || null)) {
      this.nearestNpc = foundInteractNpc;
      this.callbacks.onNearNpcChange?.(foundInteractNpc);
    }

    // Throttled Radar / Compass Target Telemetry (~4.5Hz)
    if (this.callbacks.onRadarUpdate && nowMs - this.lastRadarTime > 220) {
      this.lastRadarTime = nowMs;
      const blips: RadarBlipTarget[] = [];

      let targetNpcZone = WORLD_ZONES.find(
        (z) => this.unlockedZones.has(z.id) && !this.completedZones.has(z.id)
      );
      if (!targetNpcZone) {
        targetNpcZone = WORLD_ZONES.find((z) => this.unlockedZones.has(z.id)) || WORLD_ZONES[0];
      }
      if (targetNpcZone) {
        const dx = targetNpcZone.position[0] - this.playerPos.x;
        const dz = targetNpcZone.position[2] - this.playerPos.z;
        const fwdDot = dx * _camForward.x + dz * _camForward.z;
        const rightDot = dx * _camRight.x + dz * _camRight.z;
        blips.push({
          zoneId: targetNpcZone.id,
          label: targetNpcZone.npcName,
          angleRad: Math.atan2(rightDot, fwdDot),
          distanceMeters: Math.round(Math.hypot(dx, dz)),
          type: 'npc',
        });
      }

      let nearestGolden: CrystalItem | null = null;
      let minGoldDist = Infinity;
      for (const c of this.crystals) {
        if (c.collected || !c.isGolden) continue;
        const dist = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
        if (dist < minGoldDist) {
          minGoldDist = dist;
          nearestGolden = c;
        }
      }
      if (nearestGolden) {
        const dx = nearestGolden.x - this.playerPos.x;
        const dz = nearestGolden.z - this.playerPos.z;
        const fwdDot = dx * _camForward.x + dz * _camForward.z;
        const rightDot = dx * _camRight.x + dz * _camRight.z;
        blips.push({
          zoneId: this.activeZone,
          label: 'Kristal Emas',
          angleRad: Math.atan2(rightDot, fwdDot),
          distanceMeters: Math.round(minGoldDist),
          type: 'crystal',
        });
      }
      this.callbacks.onRadarUpdate(blips);
    }

    // Throttled multiplayer broadcast (~10Hz max)
    if (nowMs - this.lastBroadcastTime > 120) {
      this.lastBroadcastTime = nowMs;
      this.callbacks.onLocalMoveBroadcast?.({
        x: Number(this.playerPos.x.toFixed(2)),
        y: Number(this.playerPos.y.toFixed(2)),
        z: Number(this.playerPos.z.toFixed(2)),
        rotY: Number(this.playerRotY.toFixed(2)),
        animState,
        currentZone: this.activeZone,
      });
    }

    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    const camDist = this.camDistance;
    const horizDist = Math.cos(this.camPitch) * camDist;
    const vertOffset = Math.sin(this.camPitch) * camDist + 1.8;

    const shake = this.trauma * this.trauma * 0.48;
    const shakeX = shake > 0.001 ? Math.sin(this.elapsed * 57) * shake : 0;
    const shakeY = shake > 0.001 ? Math.cos(this.elapsed * 63) * shake : 0;

    _desiredCamPos.set(
      this.playerPos.x + Math.sin(this.camYaw) * horizDist + shakeX,
      this.playerPos.y + vertOffset + shakeY,
      this.playerPos.z + Math.cos(this.camYaw) * horizDist
    );

    const k = dt >= 1 ? 100 : 12;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredCamPos.x, k, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredCamPos.y, k, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredCamPos.z, k, dt);

    // Dynamic FOV kick during Dash
    const targetFov = this.dashTimer > 0 ? 66 : 58;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    _lookTarget.set(this.playerPos.x, this.playerPos.y + 1.5, this.playerPos.z);
    this.camera.lookAt(_lookTarget);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('wheel', this.handleWheel);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    dom.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
