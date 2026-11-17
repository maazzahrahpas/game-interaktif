import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { AnimState, PlayerAvatarState, WorldZoneId } from '../types/eduverse.ts';
import { WORLD_ZONES } from '../utils/gameRules.ts';
import { audioSynth } from './audioSynth.ts';
import {
  buildAcademyLandmark,
  buildChallengeArenaLandmark,
  buildCompositeAvatar,
  buildKnowledgeIslandLandmark,
  buildLibraryLandmark,
  buildScienceLabLandmark,
  createCanvasTexture,
  createNameplateSprite,
  type AvatarRig,
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

export interface WorldCallbacks {
  onZoneChange?: (zoneId: WorldZoneId) => void;
  onNearNpcChange?: (npcZone: (typeof WORLD_ZONES)[number] | null) => void;
  onInteractNpc?: (zone: (typeof WORLD_ZONES)[number]) => void;
  onCollectCrystal?: (crystalId: string, xpBonus: number) => void;
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
  z: number;
  collected: boolean;
}

interface RemoteAvatarEntry {
  rig: AvatarRig;
  targetPos: THREE.Vector3;
  targetRotY: number;
  animState: AnimState;
  walkPhase: number;
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
  private lastTime = performance.now();
  private elapsed = 0;

  private playerRig: AvatarRig;
  private playerPos = new THREE.Vector3(0, 0, 14);
  private playerVelY = 0;
  private playerRotY = Math.PI; // Facing north toward Academy landmark!
  private grounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private walkPhase = 0;
  private squashX = 1;
  private squashY = 1;
  private interactTimer = 0;

  private camYaw = 0;
  private camPitch = 0.34;
  private camDistance = 10.5;
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private keys = new Set<string>();
  private virtualMove = { x: 0, y: 0 };

  private obstacles: ObstacleCircle[] = [];
  private npcEntries: Array<{
    zone: (typeof WORLD_ZONES)[number];
    rig: AvatarRig;
    halo: THREE.Mesh;
  }> = [];
  private gates: GateMesh[] = [];
  private crystals: CrystalItem[] = [];
  private remoteAvatars = new Map<string, RemoteAvatarEntry>();

  private activeZone: WorldZoneId = 'sekolah';
  private nearestNpc: (typeof WORLD_ZONES)[number] | null = null;
  private unlockedZones = new Set<WorldZoneId>(['sekolah', 'taman']);
  private completedZones = new Set<WorldZoneId>();
  private lastBroadcastTime = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    options: {
      mode: 'tour' | 'playing';
      playerName?: string;
      avatarColor?: string;
      callbacks?: WorldCallbacks;
    }
  ) {
    this.container = container;
    this.mode = options.mode;
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
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x93c5fd);
    this.scene.fog = new THREE.FogExp2(0xbae6fd, 0.0045);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 260);

    // Mandatory studio environment map for PBR reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.setupLighting();
    this.buildWorldEnvironment();

    // Player Avatar
    this.playerRig = buildCompositeAvatar(options.avatarColor || '#2563EB', '#F59E0B', false);
    const nameplate = createNameplateSprite(options.playerName || 'Kamu', '#38BDF8');
    nameplate.position.y = 2.65;
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

    // Snap initial camera
    this.updateCamera(1);
    this.startLoop();
  }

  private setupLighting() {
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x166534, 0.65);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4d6, 1.45);
    keyLight.position.set(36, 48, 32);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -52;
      keyLight.shadow.camera.right = 52;
      keyLight.shadow.camera.top = 52;
      keyLight.shadow.camera.bottom = -52;
      keyLight.shadow.camera.near = 5;
      keyLight.shadow.camera.far = 140;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(-30, 22, -35);
    this.scene.add(rimLight);
  }

  private buildWorldEnvironment() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    const grassTex = createCanvasTexture(
      (ctx, s) => {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 600; i++) {
          ctx.fillStyle = i % 3 === 0 ? '#16a34a' : i % 3 === 1 ? '#15803d' : '#4ade80';
          ctx.fillRect((i * 37) % s, (i * 53) % s, 8, 8);
        }
      },
      256,
      true,
      18,
      maxAniso
    );

    const stoneTex = createCanvasTexture(
      (ctx, s) => {
        ctx.fillStyle = '#d6d3d1';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = '#a8a29e';
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

    // Extended ocean / water perimeter (no boxed indoor wall!)
    const waterGeo = new THREE.PlaneGeometry(420, 420);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.22,
      metalness: 0.2,
      envMapIntensity: 0.5,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.75;
    this.scene.add(water);

    // Main Eduverse Continent (natural circular campus island; top at y = -0.05 below grass y = 0)
    const continentBase = new THREE.Mesh(
      new THREE.CylinderGeometry(44, 48, 1.4, 36),
      new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9, envMapIntensity: 0.15 })
    );
    continentBase.position.y = -0.75;
    this.scene.add(continentBase);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(43.5, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: grassTex,
        roughness: 0.9,
        envMapIntensity: 0.12,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Central Stone Plaza & Pathways connecting all zones (+0.03 Y offset to avoid z-fighting)
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stoneTex,
      roughness: 0.85,
      envMapIntensity: 0.15,
    });
    const centralPlaza = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7.2, 0.1, 24), pathMat);
    centralPlaza.position.set(0, 0.04, 10);
    centralPlaza.receiveShadow = true;
    this.scene.add(centralPlaza);

    const pathSegments: Array<[number, number, number, number, number]> = [
      [0, 12, 3.6, 22, 0], // North-south spine
      [-10, 12, 22, 3.2, 0.1], // West to Taman
      [12, 4, 24, 3.2, -0.55], // East to Lab
      [-12, -2, 24, 3.2, 0.75], // NW to Library
      [13, 16, 24, 3.2, 0.35], // SE to Arena
    ];
    pathSegments.forEach(([x, z, w, d, rot]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), pathMat);
      p.position.set(x, 0.03, z);
      p.rotation.y = rot;
      p.receiveShadow = true;
      this.scene.add(p);
    });

    // Wooden Bridge to Knowledge Island (z = -18 to -24)
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.75 });
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 16), woodMat);
    bridgeDeck.position.set(0, 0.16, -22);
    bridgeDeck.receiveShadow = true;
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 16), woodMat);
    railL.position.set(-2.1, 0.75, -22);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 16), woodMat);
    railR.position.set(2.1, 0.75, -22);
    this.scene.add(bridgeDeck, railL, railR);

    // 1. Sekolah Virtual (Central Landmark at 0, 0, -2)
    const academy = buildAcademyLandmark(stoneTex);
    academy.position.set(0, 0, -2);
    this.scene.add(academy);
    this.obstacles.push({ x: 0, z: -2, r: 7.5 });

    // 2. Laboratorium Sains (26, 0, -10)
    const lab = buildScienceLabLandmark();
    lab.position.set(26, 0, -10);
    this.scene.add(lab);
    this.obstacles.push({ x: 26, z: -10, r: 6.2 });

    // 3. Perpustakaan Digital (-26, 0, -16)
    const library = buildLibraryLandmark();
    library.position.set(-26, 0, -16);
    this.scene.add(library);
    this.obstacles.push({ x: -26, z: -16, r: 5.5 });

    // 4. Pulau Pengetahuan (0, 0, -37)
    const island = buildKnowledgeIslandLandmark();
    island.position.set(0, 0, -37);
    this.scene.add(island);
    this.obstacles.push({ x: 3.5, z: -39, r: 2.5 });

    // 5. Arena Tantangan (28, 0, 22)
    const arena = buildChallengeArenaLandmark();
    arena.position.set(28, 0, 22);
    this.scene.add(arena);

    // 6. Taman Cendekia Fountain (-22, 0, 14)
    const fountainBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.6, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 })
    );
    fountainBase.position.set(-22, 0.35, 16);
    const fountainWater = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 0.75, 16),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.2 })
    );
    fountainWater.position.set(-22, 0.38, 16);
    const fountainSpire = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 })
    );
    fountainSpire.position.set(-22, 1.6, 16);
    this.scene.add(fountainBase, fountainWater, fountainSpire);
    this.obstacles.push({ x: -22, z: 16, r: 3.4 });

    // Instanced Trees (>24 trees around perimeter & park with tint variation)
    const treePositions: Array<[number, number]> = [
      [-32, 6], [-35, 18], [-28, 28], [-16, 32], [-12, 20], [-29, -4],
      [34, 6], [36, -18], [16, 34], [14, -14], [-14, -12], [-34, -26],
      [-20, -28], [18, -26], [35, 14], [12, 28], [-8, 35], [8, 36],
      [-37, -10], [38, -2], [-25, 24], [24, -24], [-6, -42], [6, -42],
    ];
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const canopyGeo = new THREE.DodecahedronGeometry(1.9, 0);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });

    const trunksInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const canopiesInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
    trunksInst.castShadow = !this.isSoftwareGl;
    canopiesInst.castShadow = !this.isSoftwareGl;

    const treePalette = [0x16a34a, 0x22c55e, 0x15803d, 0x10b981];
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
    this.scene.add(trunksInst, canopiesInst);

    // Interactive NPCs at each of the 6 zones
    WORLD_ZONES.forEach((zone) => {
      const rig = buildCompositeAvatar(zone.color, '#FDE047', true);
      rig.root.position.set(zone.position[0], 0, zone.position[2]);
      const label = createNameplateSprite(zone.npcName, zone.color, zone.name);
      label.position.y = 2.95;
      rig.root.add(label);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.08, 8, 20),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xeab308,
          emissiveIntensity: 0.8,
        })
      );
      halo.position.y = 3.45;
      rig.root.add(halo);
      this.scene.add(rig.root);
      this.npcEntries.push({ zone, rig, halo });
    });

    // Interactive Zone Energy Gates for unlockable zones
    const gateConfigs: Array<{ zoneId: WorldZoneId; x: number; z: number; rotY: number; color: number }> = [
      { zoneId: 'lab', x: 18, z: -6, rotY: 0.9, color: 0x06b6d4 },
      { zoneId: 'perpustakaan', x: -18, z: -10, rotY: -0.9, color: 0xf59e0b },
      { zoneId: 'pulau', x: 0, z: -28, rotY: 0, color: 0x8b5cf6 },
      { zoneId: 'arena', x: 20, z: 17, rotY: -0.7, color: 0xef4444 },
    ];
    gateConfigs.forEach((g) => {
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
      mesh.position.set(g.x, 1.8, g.z);
      mesh.rotation.y = g.rotY;
      this.scene.add(mesh);
      this.gates.push({ zoneId: g.zoneId, mesh, lockedY: 1.8, unlocked: false });
    });

    // Collectible Knowledge Crystals
    const crystalCoords: Array<[number, number]> = [
      [5, 16], [-6, 15], [-14, 14], [12, 4], [-13, -4],
      [18, -14], [-18, -18], [0, -18], [16, 14], [24, 14],
    ];
    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.7,
      roughness: 0.15,
      metalness: 0.5,
    });
    crystalCoords.forEach(([cx, cz], idx) => {
      const mesh = new THREE.Mesh(crystalGeo, crystalMat);
      mesh.position.set(cx, 1.15, cz);
      this.scene.add(mesh);
      this.crystals.push({ id: `crystal_${idx + 1}`, mesh, x: cx, z: cz, collected: false });
    });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'playing') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      this.jumpBufferTimer = 0.14;
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
    this.isDragging = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.mode !== 'playing') return;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isDragging || this.mode !== 'playing') return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.camYaw -= dx * 0.0065;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0045, 0.12, 1.05);
  };

  private handlePointerUp = () => {
    this.isDragging = false;
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.mode !== 'playing') return;
    this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.008, 6, 20);
  };

  private bindEvents() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('wheel', this.handleWheel, { passive: true });
  }

  public setMode(mode: 'tour' | 'playing') {
    this.mode = mode;
    this.playerRig.root.visible = mode === 'playing';
    if (mode === 'playing') {
      this.keys.clear();
      this.updateCamera(1);
    }
  }

  public setUnlockedZones(zones: WorldZoneId[], completedQuestionZoneIds: WorldZoneId[] = []) {
    const prevCount = this.unlockedZones.size;
    this.unlockedZones = new Set(zones);
    this.completedZones = new Set(completedQuestionZoneIds);
    if (this.unlockedZones.size > prevCount) {
      audioSynth.playUnlock();
    }
    this.gates.forEach((g) => {
      g.unlocked = this.unlockedZones.has(g.zoneId);
    });
  }

  public setVirtualInput(dx: number, dy: number) {
    this.virtualMove.x = THREE.MathUtils.clamp(dx, -1, 1);
    this.virtualMove.y = THREE.MathUtils.clamp(dy, -1, 1);
  }

  public triggerJump() {
    this.jumpBufferTimer = 0.14;
  }

  public triggerInteract() {
    if (!this.nearestNpc) return;
    this.interactTimer = 0.45;
    this.callbacks.onInteractNpc?.(this.nearestNpc);
  }

  public teleportToZone(zoneId: WorldZoneId) {
    const z = WORLD_ZONES.find((item) => item.id === zoneId);
    if (!z) return;
    this.playerPos.set(z.position[0], 0, z.position[2] + 4);
    this.playerVelY = 0;
    this.grounded = true;
    this.activeZone = zoneId;
    this.callbacks.onZoneChange?.(zoneId);
  }

  public syncRemotePlayers(players: PlayerAvatarState[], localStudentId: string) {
    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.studentId === localStudentId) continue;
      activeIds.add(p.studentId);
      let entry = this.remoteAvatars.get(p.studentId);
      if (!entry) {
        const rig = buildCompositeAvatar(p.avatarColor || '#10B981', '#F59E0B', false);
        const tag = createNameplateSprite(p.displayName, p.avatarColor || '#10B981');
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
      this.elapsed += dt;

      if (dt > 0.05) {
        this.updateSimulation(dt * 0.5, now);
        this.updateSimulation(dt * 0.5, now);
      } else {
        this.updateSimulation(dt, now);
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

  private updateSimulation(dt: number, nowMs: number) {
    // Animate NPCs, Halos, Crystals, Gates
    for (const npc of this.npcEntries) {
      const done = this.completedZones.has(npc.zone.id);
      npc.halo.rotation.y += dt * 2.2;
      npc.halo.position.y = 3.45 + Math.sin(this.elapsed * 3) * 0.12;
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
      crystal.mesh.rotation.y += dt * 2.1;
      crystal.mesh.position.y = 1.15 + Math.sin(this.elapsed * 3.2 + crystal.x) * 0.18;
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

    if (this.mode === 'tour') {
      const tourAngle = this.elapsed * 0.16;
      this.camera.position.set(Math.sin(tourAngle) * 34, 18 + Math.sin(this.elapsed * 0.4) * 2.5, Math.cos(tourAngle) * 34);
      this.camera.lookAt(0, 5, -6);
      return;
    }

    // Playing Mode: Input & Physics
    let moveForward = 0;
    let moveRight = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    moveForward += this.virtualMove.y;
    moveRight += this.virtualMove.x;

    // Camera-relative horizontal directions
    _camForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    _camRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();

    _moveDir.set(0, 0, 0);
    _moveDir.addScaledVector(_camForward, moveForward);
    _moveDir.addScaledVector(_camRight, moveRight);

    const isMoving = _moveDir.lengthSq() > 0.01;
    const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = isSprinting ? 14.5 : 9.2;

    if (isMoving) {
      _moveDir.normalize();
      this.playerPos.x += _moveDir.x * speed * dt;
      this.playerPos.z += _moveDir.z * speed * dt;
      const targetRot = Math.atan2(_moveDir.x, _moveDir.z);
      // Shortest angular diff
      let diff = targetRot - this.playerRotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerRotY += diff * (1 - Math.exp(-14 * dt));
      this.walkPhase += speed * dt * 1.15;
    }

    // Keep player on main continent or bridge/Knowledge Island
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

    // Jump & Gravity with Coyote Time & Squash/Stretch
    if (this.grounded) {
      this.coyoteTimer = 0.1;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.playerVelY = 10.8;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.squashX = 0.84;
      this.squashY = 1.18;
      audioSynth.playJump();
    }

    this.playerVelY -= 26 * dt;
    this.playerPos.y += this.playerVelY * dt;
    if (this.playerPos.y <= 0) {
      if (!this.grounded && this.playerVelY < -4) {
        this.squashX = 1.2;
        this.squashY = 0.8;
      }
      this.playerPos.y = 0;
      this.playerVelY = 0;
      this.grounded = true;
    }

    this.squashX = THREE.MathUtils.damp(this.squashX, 1, 14, dt);
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);
    this.interactTimer = Math.max(0, this.interactTimer - dt);

    // Apply transforms & articulated limb animation
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerRotY;
    this.playerRig.bodyGroup.scale.set(this.squashX, this.squashY, this.squashX);
    this.playerRig.shadowDisc.position.y = -this.playerPos.y + 0.02;
    const shadowFade = Math.max(0.12, 0.36 - this.playerPos.y * 0.05);
    (this.playerRig.shadowDisc.material as THREE.MeshBasicMaterial).opacity = shadowFade;

    let animState: AnimState = 'idle';
    if (this.interactTimer > 0) {
      animState = 'interact';
      this.playerRig.rightArm.rotation.x = -2.2;
    } else if (!this.grounded) {
      animState = 'jump';
      this.playerRig.leftArm.rotation.x = -0.8;
      this.playerRig.rightArm.rotation.x = -0.8;
    } else if (isMoving) {
      animState = isSprinting ? 'run' : 'walk';
      const swing = Math.sin(this.walkPhase) * (isSprinting ? 0.85 : 0.58);
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

    // Collectible crystals pickup check
    for (const c of this.crystals) {
      if (c.collected) continue;
      if (Math.hypot(this.playerPos.x - c.x, this.playerPos.z - c.z) < 1.8) {
        c.collected = true;
        c.mesh.visible = false;
        audioSynth.playPickup();
        this.callbacks.onCollectCrystal?.(c.id, 15);
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
      if (d < 4.5) {
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

    // Throttled multiplayer broadcast (~10Hz max to avoid bandwidth/Firebase waste)
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

    _desiredCamPos.set(
      this.playerPos.x + Math.sin(this.camYaw) * horizDist,
      this.playerPos.y + vertOffset,
      this.playerPos.z + Math.cos(this.camYaw) * horizDist
    );

    const k = dt >= 1 ? 100 : 12;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredCamPos.x, k, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredCamPos.y, k, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredCamPos.z, k, dt);

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
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('wheel', this.handleWheel);

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
