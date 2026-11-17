import * as THREE from 'three';

export function createCanvasTexture(
  drawFn: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 256,
  isColorMap = true,
  repeat = 1,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (isColorMap) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createNameplateSprite(
  text: string,
  badgeColor = '#2563EB',
  subtitle?: string
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = subtitle ? 160 : 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.beginPath();
  ctx.roundRect(20, 16, canvas.width - 40, canvas.height - 32, 26);
  ctx.fill();

  ctx.strokeStyle = badgeColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(20, 16, canvas.width - 40, canvas.height - 32, 26);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (subtitle) {
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(text.slice(0, 28), canvas.width / 2, canvas.height / 2 - 18);

    ctx.fillStyle = '#93C5FD';
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(subtitle.slice(0, 30), canvas.width / 2, canvas.height / 2 + 22);
  } else {
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(text.slice(0, 28), canvas.width / 2, canvas.height / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(subtitle ? 3.8 : 3.4, subtitle ? 0.95 : 0.72, 1);
  return sprite;
}

export interface AvatarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  shadowDisc: THREE.Mesh;
}

/**
 * Builds an original stylized 10-part Eduverse Explorer Avatar grounded at y = 0.
 */
export function buildCompositeAvatar(primaryColor: string, accentColor = '#F59E0B', isNpc = false): AvatarRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(primaryColor),
    roughness: 0.45,
    metalness: 0.1,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.15,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: isNpc ? 0xe2e8f0 : 0xfde2c4,
    roughness: 0.65,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentColor),
    roughness: 0.25,
    metalness: 0.5,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.5,
    roughness: 0.15,
    metalness: 0.6,
  });

  // Legs (pivot at hip y = 0.72)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.2, 0.72, 0);
  const legGeo = new THREE.BoxGeometry(0.28, 0.66, 0.3);
  const shoeGeo = new THREE.BoxGeometry(0.3, 0.14, 0.38);
  const lLegMesh = new THREE.Mesh(legGeo, darkMat);
  lLegMesh.position.y = -0.33;
  lLegMesh.castShadow = true;
  const lShoe = new THREE.Mesh(shoeGeo, accentMat);
  lShoe.position.set(0, -0.65, 0.04);
  leftLeg.add(lLegMesh, lShoe);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.2, 0.72, 0);
  const rLegMesh = new THREE.Mesh(legGeo, darkMat);
  rLegMesh.position.y = -0.33;
  rLegMesh.castShadow = true;
  const rShoe = new THREE.Mesh(shoeGeo, accentMat);
  rShoe.position.set(0, -0.65, 0.04);
  rightLeg.add(rLegMesh, rShoe);

  bodyGroup.add(leftLeg, rightLeg);

  // Torso (primary silhouette)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.85, 0.44), primaryMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Chest badge / trim
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.06), accentMat);
  chestPlate.position.set(0, 1.24, 0.24);
  bodyGroup.add(chestPlate);

  // Explorer Backpack
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.24), darkMat);
  backpack.position.set(0, 1.18, -0.32);
  backpack.castShadow = true;
  bodyGroup.add(backpack);

  // Arms (pivot at shoulder y = 1.52)
  const armGeo = new THREE.BoxGeometry(0.24, 0.68, 0.24);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.52, 1.52, 0);
  const lArmMesh = new THREE.Mesh(armGeo, primaryMat);
  lArmMesh.position.y = -0.3;
  lArmMesh.castShadow = true;
  leftArm.add(lArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.52, 1.52, 0);
  const rArmMesh = new THREE.Mesh(armGeo, primaryMat);
  rArmMesh.position.y = -0.3;
  rArmMesh.castShadow = true;
  rightArm.add(rArmMesh);
  bodyGroup.add(leftArm, rightArm);

  // Head group
  const head = new THREE.Group();
  head.position.set(0, 1.88, 0);
  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.6, 0.62), skinMat);
  cranium.castShadow = true;
  head.add(cranium);

  if (isNpc) {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.08), visorMat);
    visor.position.set(0, 0.04, 0.3);
    const antennaStem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), darkMat);
    antennaStem.position.set(0, 0.4, 0);
    const antennaOrb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), visorMat);
    antennaOrb.position.set(0, 0.55, 0);
    head.add(visor, antennaStem, antennaOrb);
  } else {
    const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.04);
    const lEye = new THREE.Mesh(eyeGeo, darkMat);
    lEye.position.set(-0.14, 0.04, 0.31);
    const rEye = new THREE.Mesh(eyeGeo, darkMat);
    rEye.position.set(0.14, 0.04, 0.31);
    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.74), accentMat);
    capBrim.position.set(0, 0.26, 0.08);
    const capCrown = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.64), primaryMat);
    capCrown.position.set(0, 0.36, 0);
    head.add(lEye, rEye, capBrim, capCrown);
  }
  bodyGroup.add(head);

  // Contact shadow disc
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.02;
  root.add(shadowDisc);

  return { root, bodyGroup, head, leftArm, rightArm, leftLeg, rightLeg, shadowDisc };
}

/**
 * Builds a composite 7-part Academy + Clock Tower Landmark so spawn vista is dramatic.
 */
export function buildAcademyLandmark(stoneTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    map: stoneTex,
    roughness: 0.85,
    envMapIntensity: 0.18,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.45,
    metalness: 0.2,
    envMapIntensity: 0.35,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.65,
    envMapIntensity: 0.2,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.7,
    envMapIntensity: 0.75,
  });

  // Stepped plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, envMapIntensity: 0.15 })
  );
  plinth.position.y = 0.4;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Left and Right wings framing arched doorway (never floating door!)
  const leftWing = new THREE.Mesh(new THREE.BoxGeometry(5.5, 6.2, 8.5), wallMat);
  leftWing.position.set(-4.5, 3.9, 0);
  leftWing.castShadow = true;
  leftWing.receiveShadow = true;

  const rightWing = new THREE.Mesh(new THREE.BoxGeometry(5.5, 6.2, 8.5), wallMat);
  rightWing.position.set(4.5, 3.9, 0);
  rightWing.castShadow = true;
  rightWing.receiveShadow = true;

  const centerArch = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 8.5), trimMat);
  centerArch.position.set(0, 5.9, 0);
  group.add(leftWing, rightWing, centerArch);

  // Pediment roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 3.6, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 8.8, 0);
  roof.castShadow = true;
  group.add(roof);

  // Tall Clock Tower Landmark
  const towerShaft = new THREE.Mesh(new THREE.BoxGeometry(3.4, 15, 3.4), wallMat);
  towerShaft.position.set(0, 7.5, -5.2);
  towerShaft.castShadow = true;
  const clockDial = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.25, 24), goldMat);
  clockDial.rotation.x = Math.PI / 2;
  clockDial.position.set(0, 12.6, -3.45);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.2, 4), trimMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, 17.1, -5.2);
  group.add(towerShaft, clockDial, spire);

  // Front columns
  const colGeo = new THREE.CylinderGeometry(0.32, 0.38, 4.8, 12);
  [-2.1, 2.1].forEach((x) => {
    const col = new THREE.Mesh(colGeo, wallMat);
    col.position.set(x, 3.2, 4.4);
    col.castShadow = true;
    group.add(col);
  });

  return group;
}

/**
 * Builds composite Science Observatory Dome (7 parts).
 */
export function buildScienceLabLandmark(): THREE.Group {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65 });
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x0891b2, roughness: 0.35, metalness: 0.25 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.4,
    transparent: true,
    opacity: 0.78,
  });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.7, 8), baseMat);
  plinth.position.y = 0.35;
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.2, 4.4, 8), tealMat);
  hull.position.y = 2.9;
  hull.castShadow = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
  dome.position.y = 5.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.24, 8, 24), baseMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 5.1;
  const telescope = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 4.5, 12), baseMat);
  telescope.position.set(2.2, 7.2, 1.5);
  telescope.rotation.z = -Math.PI / 4;
  group.add(plinth, hull, dome, ring, telescope);
  return group;
}

/**
 * Builds Knowledge Island Lighthouse + Pavilion (6 parts).
 */
export function buildKnowledgeIslandLandmark(): THREE.Group {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.75 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const violetMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.35, metalness: 0.2 });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xfde047,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.1,
  });

  const islandBase = new THREE.Mesh(new THREE.CylinderGeometry(11, 13.5, 1.8, 12), rockMat);
  islandBase.position.y = -0.3;
  const islandTop = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 11, 0.6, 12), grassMat);
  islandTop.position.y = 0.65;
  islandTop.receiveShadow = true;

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.1, 10, 12), whiteMat);
  tower.position.set(3.5, 5.9, -2);
  tower.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 2.2, 12), violetMat);
  stripe.position.set(3.5, 6.2, -2);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 10), beaconMat);
  lantern.position.set(3.5, 11.4, -2);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 10), violetMat);
  cap.position.set(3.5, 12.8, -2);

  group.add(islandBase, islandTop, tower, stripe, lantern, cap);
  return group;
}

/**
 * Builds Digital Library Pavilion (5 parts).
 */
export function buildLibraryLandmark(): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.65 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.3 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(11, 0.7, 9), stoneMat);
  base.position.y = 0.35;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(9.2, 5.0, 7.2), stoneMat);
  hall.position.y = 3.2;
  hall.castShadow = true;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.8, 8.2), amberMat);
  fascia.position.y = 6.0;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.6, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 7.7;

  group.add(base, hall, fascia, roof);
  return group;
}

/**
 * Builds Boss Challenge Colosseum Arena (8 pillars + glowing core ring).
 */
export function buildChallengeArenaLandmark(): THREE.Group {
  const group = new THREE.Group();
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
  const crimsonMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.4, roughness: 0.3 });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.2, 0.5, 16), floorMat);
  floor.position.y = 0.25;
  floor.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.22, 8, 32), crimsonMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.55;
  group.add(floor, ring);

  const pillarGeo = new THREE.CylinderGeometry(0.48, 0.56, 5.6, 10);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(Math.cos(angle) * 9.5, 3.05, Math.sin(angle) * 9.5);
    p.castShadow = true;
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crimsonMat);
    flame.position.set(Math.cos(angle) * 9.5, 6.2, Math.sin(angle) * 9.5);
    group.add(p, flame);
  }

  // Holographic Boss Crown Ring hovering above the arena
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.14, 8, 32), crimsonMat);
  crownRing.rotation.x = Math.PI / 2;
  crownRing.position.y = 7.4;
  group.add(crownRing);

  return group;
}

/**
 * Generates a vibrant atmospheric sky dome texture (deep azure zenith -> warm sunlit horizon).
 */
export function createSkyDomeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#0f172a');
  grad.addColorStop(0.24, '#1d4ed8');
  grad.addColorStop(0.48, '#38bdf8');
  grad.addColorStop(0.66, '#bae6fd');
  grad.addColorStop(0.8, '#fde68a');
  grad.addColorStop(1.0, '#0284c7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Soft horizon cloud streaks
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  for (let i = 0; i < 14; i++) {
    const x = (i * 83) % 512;
    const y = 240 + ((i * 29) % 70);
    const w = 90 + (i % 4) * 35;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 12 + (i % 3) * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface SentinelDroneRig {
  root: THREE.Group;
  body: THREE.Group;
  scannerRing: THREE.Mesh;
  warningDisc: THREE.Mesh;
  warningMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshStandardMaterial;
}

/**
 * Builds a composite 6-part Sentinel Patroller Drone + Ground Telegraph Warning Ring.
 */
export function buildSentinelDrone(accentHex = 0xef4444): SentinelDroneRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.65;
  root.add(body);

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.65,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.3,
    metalness: 0.45,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.25,
    roughness: 0.15,
  });

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), hullMat);
  core.castShadow = true;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), eyeMat);
  eye.position.set(0, 0.04, 0.52);

  const scannerRing = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.08, 8, 24), eyeMat);
  scannerRing.rotation.x = Math.PI / 2;

  const podGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.62, 10);
  const leftPod = new THREE.Mesh(podGeo, trimMat);
  leftPod.position.set(-0.78, -0.08, 0);
  const rightPod = new THREE.Mesh(podGeo, trimMat);
  rightPod.position.set(0.78, -0.08, 0);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.48, 8), hullMat);
  spire.position.set(0, 0.78, 0);

  body.add(core, eye, scannerRing, leftPod, rightPod, spire);

  // Ground telegraph ring (expands & intensifies before shockwave)
  const warningMat = new THREE.MeshBasicMaterial({
    color: accentHex,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const warningDisc = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.45, 28), warningMat);
  warningDisc.rotation.x = -Math.PI / 2;
  warningDisc.position.y = 0.06;
  root.add(warningDisc);

  return { root, body, scannerRing, warningDisc, warningMat, eyeMat };
}

/**
 * Builds a composite 4-part Energy Jump Pad that launches the avatar onto sky platforms.
 */
export function buildJumpPad(colorHex = 0x10b981): { root: THREE.Group; ring: THREE.Mesh } {
  const root = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.28, 8), baseMat);
  base.position.y = 0.14;
  base.receiveShadow = true;

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.34, 16), glowMat);
  core.position.y = 0.18;

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 24), glowMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.68;

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.06, 6, 8), baseMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.28;

  root.add(base, core, ring, rim);
  return { root, ring };
}

/**
 * Builds a composite 4-part Cyber-Academic Lamp Post.
 */
export function buildLampPost(lightColor = 0xfde047): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: lightColor,
    emissive: lightColor,
    emissiveIntensity: 1.2,
    roughness: 0.15,
  });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.4, 8), poleMat);
  plinth.position.y = 0.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.8, 8), poleMat);
  pole.position.y = 2.2;
  pole.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.12), poleMat);
  arm.position.set(0.28, 4.0, 0);
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), lampMat);
  orb.position.set(0.55, 3.72, 0);

  group.add(plinth, pole, arm, orb);
  return group;
}

/**
 * Builds an elevated Energy Parkour Platform (3 parts).
 */
export function buildFloatingPlatform(width: number, depth: number, accentHex = 0x38bdf8): THREE.Group {
  const group = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.55,
    roughness: 0.25,
  });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.45, depth), deckMat);
  deck.receiveShadow = true;
  deck.castShadow = true;

  const rim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, 0.16, depth + 0.24), trimMat);
  rim.position.y = -0.14;

  const underCore = new THREE.Mesh(new THREE.ConeGeometry(Math.min(width, depth) * 0.36, 0.9, 6), trimMat);
  underCore.rotation.x = Math.PI;
  underCore.position.y = -0.68;

  group.add(deck, rim, underCore);
  return group;
}

/**
 * Builds a rotating Energy Laser Pylon (3 parts).
 */
export function buildLaserPylon(beamLength: number): { root: THREE.Group; rotator: THREE.Group } {
  const root = new THREE.Group();
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
  const laserMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xe11d48,
    emissiveIntensity: 1.5,
    roughness: 0.1,
  });

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.3, 8), pylonMat);
  pedestal.position.y = 0.65;
  pedestal.castShadow = true;

  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), laserMat);
  cap.position.y = 1.55;

  const rotator = new THREE.Group();
  rotator.position.y = 0.85;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, beamLength, 8), laserMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.x = beamLength * 0.5;
  rotator.add(beam);

  root.add(pedestal, cap, rotator);
  return { root, rotator };
}

