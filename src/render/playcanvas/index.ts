import * as pc from "playcanvas";
import type { FlipperView, Snapshot, StaticScene } from "../../sim/snapshot";
import { drawHud } from "../hud";
import type { Renderer } from "../renderer";
import { backglassTexture, drawDisplay, glowTexture, playfieldTexture, studioSky } from "./art";
import { fitDistance } from "./frame";
import { rampGeometry } from "./ramp";
import rampPlasticUrl from "./assets/ramp-plastic.webp";
import type { MeshData } from "./ramp";

// The PlayCanvas renderer (issue #45): the same Renderer interface as the canvas placeholder,
// a lit 3D table behind it. World metres become centimetres here (1 unit = 1 cm), x to the
// right, z down the table (toward the player), y up. It reads only the static scene and the
// snapshot; it never touches the simulation. Loaded on demand, so it is not in the first load.

const S = 100;
const RAIL_H = 2.4;
const RAIL_T = 0.55;

const color = (r: number, g: number, b: number) => new pc.Color(r, g, b);

function material(opts: { diffuse?: [number, number, number]; emissive?: [number, number, number]; metal?: number; gloss?: number; opacity?: number; map?: pc.Texture; emissiveIntensity?: number }): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  if (opts.diffuse) m.diffuse = color(...opts.diffuse);
  if (opts.emissive) {
    m.emissive = color(...opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  m.useMetalness = true;
  m.metalness = opts.metal ?? 0;
  m.gloss = opts.gloss ?? 0.5;
  if (opts.map) m.diffuseMap = opts.map;
  if (opts.opacity !== undefined) {
    m.opacity = opts.opacity;
    m.blendType = pc.BLEND_NORMAL;
  }
  m.update();
  return m;
}

function texture(device: pc.GraphicsDevice, source: HTMLCanvasElement, srgb = true): pc.Texture {
  const t = new pc.Texture(device, { width: source.width, height: source.height, format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
  t.setSource(source);
  return t;
}

export interface PlayCanvasOptions {
  /** The canvas to draw on; it must not have a 2D context. */
  canvas: HTMLCanvasElement;
  /** Where the text overlay (the display and the touch band's names) goes. */
  overlayParent: HTMLElement;
}

export function createPlayCanvasRenderer(opts: PlayCanvasOptions): Renderer {
  const app = new pc.Application(opts.canvas, { graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" } });
  app.autoRender = false;
  app.setCanvasFillMode(pc.FILLMODE_NONE); // the default keeps the aspect of the first canvas size; the app sets the size itself
  app.scene.ambientLight = color(0.22, 0.22, 0.27);
  const overlay = document.createElement("canvas");
  overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;width:100vw;height:100vh";
  opts.overlayParent.appendChild(overlay);
  const octx = overlay.getContext("2d")!;
  let w = 1;
  let h = 1;
  let dpr = 1;

  // reflections for the metal: a studio sky made on a canvas
  try {
    const sky = texture(app.graphicsDevice, studioSky(), false);
    sky.projection = pc.TEXTUREPROJECTION_EQUIRECT;
    app.scene.envAtlas = pc.EnvLighting.generateAtlas(sky);
    app.scene.skyboxIntensity = 1.6;
  } catch (e) {
    console.warn("playcanvas: no reflections", e);
  }

  const root = new pc.Entity("table");
  app.root.addChild(root);
  const dyn = new pc.Entity("dynamic");
  root.addChild(dyn);

  const camera = new pc.Entity("camera");
  camera.addComponent("camera", { fov: 50, nearClip: 5, farClip: 600, clearColor: new pc.Color(0, 0, 0) });
  app.root.addChild(camera);
  try {
    const frame = new pc.CameraFrame(app, camera.camera!);
    frame.rendering.toneMapping = pc.TONEMAP_ACES;
    frame.rendering.samples = 4;
    frame.bloom.intensity = 0.03;
    frame.bloom.blurLevel = 6;
    frame.update();
  } catch (e) {
    console.warn("playcanvas: no post effects", e);
  }
  camera.camera!.layers = camera.camera!.layers.filter((l) => l !== pc.LAYERID_SKYBOX); // the sky lights the metal, it is not drawn behind the table

  const key = new pc.Entity("key");
  key.addComponent("light", { type: "directional", color: color(1, 0.95, 0.88), intensity: 1.6, castShadows: true, shadowResolution: 2048, shadowDistance: 260, shadowBias: 0.15, normalOffsetBias: 0.06, shadowIntensity: 0.8, shadowType: pc.SHADOW_PCF3_32F });
  key.setEulerAngles(58, -28, 0);
  app.root.addChild(key);
  const fill = new pc.Entity("fill");
  fill.addComponent("light", { type: "directional", color: color(0.55, 0.62, 0.9), intensity: 0.5, castShadows: false });
  fill.setEulerAngles(35, 150, 0);
  app.root.addChild(fill);

  const mats = {
    chrome: material({ diffuse: [0.92, 0.94, 1], metal: 1, gloss: 0.96 }),
    steel: material({ diffuse: [0.16, 0.17, 0.22], metal: 0.7, gloss: 0.6 }),
    rubber: material({ diffuse: [0.1, 0.35, 0.95], emissive: [0.05, 0.2, 0.7], emissiveIntensity: 0.35, metal: 0, gloss: 0.5 }),
    amber: material({ diffuse: [0.95, 0.6, 0.15], emissive: [1, 0.55, 0.1], emissiveIntensity: 0.7, metal: 0.2, gloss: 0.7 }),
    bumperBody: material({ diffuse: [0.6, 0.07, 0.05], metal: 0.15, gloss: 0.75 }),
    bumperCap: material({ diffuse: [1, 0.8, 0.35], emissive: [1, 0.65, 0.2], emissiveIntensity: 1.4, metal: 0, gloss: 0.95 }),
    flipper: material({ diffuse: [0.98, 0.93, 0.78], metal: 0.1, gloss: 0.9 }),
    flipperRubber: material({ diffuse: [0.85, 0.08, 0.06], metal: 0, gloss: 0.55 }),
    ball: material({ diffuse: [0.95, 0.96, 1], metal: 1, gloss: 0.98 }),
    hole: material({ diffuse: [0.02, 0.02, 0.02], metal: 0, gloss: 0.2 }),
    plastic: material({ diffuse: [0.55, 0.78, 1], opacity: 0.45, metal: 0, gloss: 0.97 }),
  };
  // the printed ramp plastic (an asset, #45): until it has loaded, or when it fails, the plain tinted plastic stays
  const rampImage = new Image();
  rampImage.onload = () => {
    const t = new pc.Texture(app.graphicsDevice, { width: rampImage.width, height: rampImage.height, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_REPEAT });
    t.setSource(rampImage);
    const m = mats.plastic;
    m.diffuse = color(1, 1, 1);
    m.diffuseMap = t;
    m.opacityMap = t;
    m.opacityMapChannel = "a";
    m.opacity = 0.9;
    m.update();
  };
  rampImage.src = rampPlasticUrl;
  const glowTex = texture(app.graphicsDevice, glowTexture(), false);
  /** An additive glow: light on the playfield that does not hide what is under it. */
  const glowMaterial = (rgb: [number, number, number], intensity: number): pc.StandardMaterial => {
    const m = new pc.StandardMaterial();
    m.diffuse = color(0, 0, 0);
    m.emissive = color(...rgb);
    m.emissiveIntensity = intensity;
    m.emissiveMap = glowTex;
    m.opacityMap = glowTex;
    m.opacityMapChannel = "a"; // the glow texture carries its softness in the alpha channel
    m.blendType = pc.BLEND_ADDITIVE;
    m.depthWrite = false;
    m.useLighting = false;
    m.update();
    return m;
  };

  const add = (parent: pc.Entity, type: "box" | "cylinder" | "sphere" | "plane", mat: pc.Material, shadows = true): pc.Entity => {
    const e = new pc.Entity();
    e.addComponent("render", { type, material: mat, castShadows: shadows, receiveShadows: true });
    parent.addChild(e);
    return e;
  };
  const place = (e: pc.Entity, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0) => {
    e.setLocalPosition(x, y, z);
    e.setLocalScale(sx, sy, sz);
    e.setLocalEulerAngles(0, rotY, 0);
  };

  let sceneW = 0.52;
  let sceneL = 1.05;
  const X = (x: number) => (x - sceneW / 2) * S;
  const Z = (y: number) => (y - sceneL / 2) * S;

  /** Things that light up for a moment when a switch is hit: the materials to brighten and by how much. */
  interface Flash {
    level: number;
    parts: { mat: pc.StandardMaterial; base: number; boost: number }[];
  }
  const flashes = new Map<string, Flash>();
  const flashFor = (sw: string): Flash => {
    let f = flashes.get(sw);
    if (!f) {
      f = { level: 0, parts: [] };
      flashes.set(sw, f);
    }
    return f;
  };

  interface Insert { disc: pc.Entity; glow: pc.Entity; rgb: [number, number, number]; level: number; discMat: pc.StandardMaterial; glowMat: pc.StandardMaterial }
  const inserts = new Map<string, Insert>();
  const insertMaterial = (rgb: [number, number, number], level: number): pc.StandardMaterial => material({ diffuse: [rgb[0] * 0.15, rgb[1] * 0.15, rgb[2] * 0.15], emissive: rgb, emissiveIntensity: level * 1.6, metal: 0, gloss: 0.9 });
  /** What colour an insert is, by the name of its lamp: the lanes of the skill shot green, rollovers yellow, lanes orange, the kickback red. */
  const insertColor = (id: string): [number, number, number] => (id.startsWith("skill") ? [0.2, 1, 0.35] : id.startsWith("roll") ? [1, 0.9, 0.2] : id.startsWith("kick") ? [1, 0.2, 0.15] : [1, 0.55, 0.12]);
  const LAMP_LEVEL = { off: 0.25, lit: 1.2, flash: 1.2, collected: 0.5 } as const;

  let flipperEntities: pc.Entity[][] = [];
  const balls: pc.Entity[] = [];
  const TRAIL = 9;
  const trails: { pos: { x: number; y: number; z: number }[]; ents: pc.Entity[] }[] = [];
  const trailMat = glowMaterial([0.6, 0.8, 1], 0.45);
  let focusX = 0;
  let focusZ = 0;
  const ballLift: number[] = []; // the drawn height of each ball: it eases toward the real one, so a drop off the end of a ramp is not a jump
  let built: pc.Entity | null = null;

  function build(scene: StaticScene): void {
    sceneW = scene.width;
    sceneL = scene.length;
    if (built) {
      built.destroy();
      built = null;
    }
    inserts.clear();
    flashes.clear();
    const g = new pc.Entity("static");
    root.addChild(g);
    built = g;
    // the playfield
    const tex = texture(app.graphicsDevice, playfieldTexture(1536, 3072, sceneW, sceneL));
    const field = add(g, "box", material({ diffuse: [1, 1, 1], map: tex, metal: 0, gloss: 0.55 }));
    place(field, 0, -0.5, 0, sceneW * S, 1, sceneL * S);
    // rails: a steel wall under a chrome tube
    const joints = new Set<string>();
    for (const wl of scene.walls) {
      const ax = X(wl.ax);
      const az = Z(wl.ay);
      const bx = X(wl.bx);
      const bz = Z(wl.by);
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const yaw = (-Math.atan2(bz - az, bx - ax) * 180) / Math.PI;
      if (wl.kind === "wall") {
        const wall = add(g, "box", mats.steel);
        place(wall, (ax + bx) / 2, RAIL_H / 2, (az + bz) / 2, len, RAIL_H, RAIL_T * 0.7, yaw);
        const pivot = new pc.Entity();
        pivot.setLocalPosition((ax + bx) / 2, RAIL_H + 0.1, (az + bz) / 2);
        pivot.setLocalEulerAngles(0, yaw, 0);
        g.addChild(pivot);
        const tube = add(pivot, "cylinder", mats.chrome);
        tube.setLocalEulerAngles(0, 0, 90);
        tube.setLocalScale(RAIL_T * 1.2, len + 0.05, RAIL_T * 1.2);
        for (const [x, z] of [[ax, az], [bx, bz]] as const) {
          const k = `${x.toFixed(2)},${z.toFixed(2)}`;
          if (joints.has(k)) continue;
          joints.add(k);
          const cap = add(g, "sphere", mats.chrome);
          place(cap, x, RAIL_H + 0.1, z, RAIL_T * 1.2, RAIL_T * 1.2, RAIL_T * 1.2);
        }
      } else {
        const own = (wl.kind === "rubber" ? mats.rubber : mats.amber).clone() as pc.StandardMaterial;
        const e = add(g, "box", own);
        place(e, (ax + bx) / 2, RAIL_H * 0.45, (az + bz) / 2, len, RAIL_H * 0.9, RAIL_T * 1.1, yaw);
        if (wl.sw !== null) flashFor(wl.sw).parts.push({ mat: own, base: own.emissiveIntensity, boost: 3.5 });
      }
    }
    // posts and bumpers
    for (const p of scene.posts) {
      const x = X(p.x);
      const z = Z(p.y);
      const r = p.r * S;
      if (p.kind === "switch") {
        const body = add(g, "cylinder", mats.bumperBody);
        place(body, x, 1.2, z, r * 2, 2.4, r * 2);
        const ring = add(g, "cylinder", mats.chrome);
        place(ring, x, 2.45, z, r * 2.2, 0.35, r * 2.2);
        const domeMat = mats.bumperCap.clone() as pc.StandardMaterial;
        const dome = add(g, "sphere", domeMat, false);
        place(dome, x, 2.6, z, r * 1.6, r * 0.9, r * 1.6);
        const glowMat = glowMaterial([1, 0.6, 0.15], 0.45);
        const glow = add(g, "plane", glowMat, false);
        place(glow, x, 0.06, z, r * 4.2, 1, r * 4.2);
        if (p.sw !== null) {
          const f = flashFor(p.sw);
          f.parts.push({ mat: domeMat, base: domeMat.emissiveIntensity, boost: 5 }, { mat: glowMat, base: glowMat.emissiveIntensity, boost: 2.2 });
        }
      } else {
        const e = add(g, "cylinder", mats.chrome);
        place(e, x, 1.6, z, r * 2, 3.2, r * 2);
      }
    }
    // inserts: the lit discs of the lanes and rollovers, with a glow; a dark hole for a sinkhole
    for (const t of scene.triggers) {
      if (t.hold) {
        const hole = add(g, "cylinder", mats.hole, false);
        place(hole, X(t.x), 0.04, Z(t.y), t.r * S * 2.2, 0.08, t.r * S * 2.2);
        continue;
      }
      const rgb = insertColor(t.id);
      const disc = add(g, "cylinder", insertMaterial(rgb, 0.25), false);
      place(disc, X(t.x), 0.05, Z(t.y), t.r * S * 2.2, 0.1, t.r * S * 2.2);
      const glow = add(g, "plane", glowMaterial(rgb, 0.25), false);
      place(glow, X(t.x), 0.1, Z(t.y), t.r * S * 4.5, 1, t.r * S * 4.5);
      inserts.set(t.id, { disc, glow, rgb, level: 0.25, discMat: disc.render!.meshInstances[0]!.material as pc.StandardMaterial, glowMat: glow.render!.meshInstances[0]!.material as pc.StandardMaterial });
    }
    buildCabinet(g);
    // ramps: an inclined plastic slab with chrome rails on supports, rising along its height profile
    for (const r of scene.ramps) {
      if (r.path.length < 2) continue;
      const path = r.path.map((q, i) => ({ x: X(q.x), y: (r.heights[i] ?? 0) * S + 0.15, z: Z(q.y) }));
      const geo = rampGeometry(path, r.width * S, 0.35, 1.1);
      const slab = new pc.Entity();
      slab.addComponent("render", { meshInstances: [new pc.MeshInstance(meshOf(geo.surface), mats.plastic), new pc.MeshInstance(meshOf(geo.rails), mats.chrome)], castShadows: true, receiveShadows: true });
      g.addChild(slab);
      for (const sp of geo.supports) {
        const leg = add(g, "cylinder", mats.chrome);
        place(leg, sp.x, sp.y / 2, sp.z, 0.7, Math.max(0.1, sp.y), 0.7);
      }
    }
  }

  /** The cabinet around the table: wooden sides and front, and the backbox with its painted glass and the dot-matrix display. */
  function buildCabinet(g: pc.Entity): void {
    const wood = material({ diffuse: [0.16, 0.09, 0.05], metal: 0, gloss: 0.6 });
    const black = material({ diffuse: [0.04, 0.04, 0.05], metal: 0.3, gloss: 0.7 });
    const wS = sceneW * S;
    const lS = sceneL * S;
    for (const sx of [-1, 1]) {
      const side = add(g, "box", wood);
      place(side, sx * (wS / 2 + 2.6), 2, 0, 5.2, 8, lS + 4);
      const trim = add(g, "box", mats.chrome);
      place(trim, sx * (wS / 2 + 0.2), 4.1, 0, 0.5, 0.35, lS + 4);
    }
    const front = add(g, "box", wood);
    place(front, 0, 1.2, lS / 2 + 2.6, wS + 10.4, 4.4, 5.2);
    const bar = add(g, "box", mats.chrome);
    place(bar, 0, 3.6, lS / 2 + 0.4, wS + 1, 0.6, 0.9);
    // the backbox
    const bz = -lS / 2 - 8;
    const box = add(g, "box", black);
    place(box, 0, 31, bz, wS + 10.4, 62, 16);
    const glassMat = material({ diffuse: [0, 0, 0], emissive: [1, 1, 1], emissiveIntensity: 0.9, metal: 0, gloss: 0.9 });
    glassMat.emissiveMap = texture(app.graphicsDevice, backglassTexture());
    glassMat.update();
    const glass = add(g, "plane", glassMat, false);
    glass.setLocalPosition(0, 40, bz + 8.05);
    glass.setLocalEulerAngles(90, 0, 0);
    glass.setLocalScale(wS, 1, 40);
    const dmdBack = add(g, "box", black, false);
    place(dmdBack, 0, 13, bz + 8.02, wS * 0.9, 16, 0.6);
    displayCanvas = document.createElement("canvas");
    displayCanvas.width = 640;
    displayCanvas.height = 160;
    drawDisplay(displayCanvas, []);
    displayTexture = texture(app.graphicsDevice, displayCanvas, false);
    const dmdMat = material({ diffuse: [0, 0, 0], emissive: [1, 1, 1], emissiveIntensity: 1.2, metal: 0, gloss: 0.95 });
    dmdMat.emissiveMap = displayTexture;
    dmdMat.update();
    const dmd = add(g, "plane", dmdMat, false);
    dmd.setLocalPosition(0, 13, bz + 8.4);
    dmd.setLocalEulerAngles(90, 0, 0);
    dmd.setLocalScale(wS * 0.84, 1, wS * 0.84 * 0.25);
  }

  let displayCanvas: HTMLCanvasElement | null = null;
  let displayTexture: pc.Texture | null = null;
  let displayText = "";

  /** A flipper's body: a prism with the pivot at the origin, the axis along +x, `len` long, as wide as the end radii (r0 at the pivot, r1 at the tip), `hgt` tall. Built once per flipper. */
  function flipperMesh(len: number, r0: number, r1: number, hgt: number): pc.Mesh {
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
      const base = pos.length / 3;
      for (const v of [a, b, c, d]) {
        pos.push(...v);
        nor.push(...n);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    // top and bottom
    quad([0, hgt, -r0], [len, hgt, -r1], [len, hgt, r1], [0, hgt, r0], [0, 1, 0]);
    quad([0, 0, r0], [len, 0, r1], [len, 0, -r1], [0, 0, -r0], [0, -1, 0]);
    // the two long sides, with their slanted normals
    const slope = (r0 - r1) / len;
    const nl = Math.hypot(1, slope);
    quad([0, 0, -r0], [len, 0, -r1], [len, hgt, -r1], [0, hgt, -r0], [slope / nl, 0, -1 / nl]);
    quad([len, 0, r1], [0, 0, r0], [0, hgt, r0], [len, hgt, r1], [slope / nl, 0, 1 / nl]);
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(pos);
    mesh.setNormals(nor);
    mesh.setIndices(idx);
    mesh.update();
    return mesh;
  }

  function meshOf(m: MeshData): pc.Mesh {
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(m.positions);
    mesh.setNormals(m.normals);
    mesh.setUvs(0, m.uvs);
    mesh.setIndices(m.indices);
    mesh.update();
    return mesh;
  }

  function flipperParts(i: number, f: FlipperView): pc.Entity[] {
    let parts = flipperEntities[i];
    if (!parts) {
      const len = Math.hypot((f.tx - f.px) * S, (f.ty - f.py) * S);
      const hgt = RAIL_H + 0.3;
      const body = new pc.Entity();
      body.addComponent("render", { meshInstances: [new pc.MeshInstance(flipperMesh(len, f.r0 * S, f.r1 * S, hgt), mats.flipper)], castShadows: true, receiveShadows: true });
      dyn.addChild(body);
      parts = [add(dyn, "cylinder", mats.flipperRubber), add(dyn, "cylinder", mats.flipperRubber), body];
      flipperEntities[i] = parts;
    }
    return parts;
  }

  function updateFlipper(i: number, f: FlipperView): void {
    const [a, b, body] = flipperParts(i, f) as [pc.Entity, pc.Entity, pc.Entity];
    const px = X(f.px);
    const pz = Z(f.py);
    const tx = X(f.tx);
    const tz = Z(f.ty);
    const hgt = RAIL_H + 0.3;
    place(a, px, hgt / 2 - 0.02, pz, f.r0 * S * 2, hgt - 0.04, f.r0 * S * 2);
    place(b, tx, hgt / 2 - 0.02, tz, f.r1 * S * 2, hgt - 0.04, f.r1 * S * 2);
    body.setLocalPosition(px, 0, pz);
    body.setLocalScale(1, 1, 1);
    body.setLocalEulerAngles(0, (-Math.atan2(tz - pz, tx - px) * 180) / Math.PI, 0);
  }

  let framedFor = "";
  let distance = 100;
  function updateCamera(snap: Snapshot): void {
    const c = snap.camera;
    const fov = c.mode === "tilted" ? c.fovDeg : 30;
    const pitch = (c.mode === "tilted" ? c.pitchDeg : 0) * (Math.PI / 180);
    const key = `${w}x${h} ${fov} ${pitch} ${sceneW} ${sceneL}`;
    if (key !== framedFor) {
      framedFor = key;
      distance = fitDistance(pitch, fov, w / h, sceneW * S, sceneL * S, RAIL_H * 3, [[(-sceneW * S) / 2, 20, (-sceneL * S) / 2], [(sceneW * S) / 2, 20, (-sceneL * S) / 2]]);
    }
    camera.camera!.fov = fov;
    // the view leans a little toward the ball, eased so it never jerks
    const b = snap.balls[0];
    const wantX = b ? Math.max(-1, Math.min(1, X(b.x) / ((sceneW * S) / 2))) * 3 : 0;
    const wantZ = b ? Math.max(-1, Math.min(1, Z(b.y) / ((sceneL * S) / 2))) * 7 : 0;
    focusX += (wantX - focusX) * 0.06;
    focusZ += (wantZ - focusZ) * 0.06;
    camera.setPosition(focusX, Math.cos(pitch) * distance, Math.sin(pitch) * distance + focusZ);
    camera.lookAt(focusX, 0, focusZ);
  }

  app.start();

  return {
    resize(cssW, cssH, ratio) {
      w = cssW;
      h = cssH;
      dpr = ratio;
      app.graphicsDevice.maxPixelRatio = ratio;
      app.graphicsDevice.resizeCanvas(cssW, cssH);
      overlay.width = Math.round(cssW * ratio);
      overlay.height = Math.round(cssH * ratio);
    },
    setScene(scene) {
      build(scene);
    },
    draw(snap) {
      snap.flippers.forEach((f, i) => updateFlipper(i, f));
      while (balls.length < snap.balls.length) balls.push(add(dyn, "sphere", mats.ball));
      balls.forEach((e, i) => {
        const b = snap.balls[i];
        e.enabled = b !== undefined;
        if (b) {
          const target = b.z * S;
          const lift = ballLift[i] === undefined ? target : ballLift[i]! + (target - ballLift[i]!) * 0.35;
          ballLift[i] = lift;
          place(e, X(b.x), b.r * S + lift, Z(b.y), b.r * S * 2, b.r * S * 2, b.r * S * 2);
        }
      });
      // flashes: a hit lights its parts, which then fade
      for (const h of snap.hits) {
        const f = flashes.get(h.sw);
        if (f) f.level = Math.max(f.level, 0.45 + 0.55 * Math.min(1, h.s + (h.kick ? 0.4 : 0)));
      }
      for (const f of flashes.values()) {
        if (f.level <= 0.01 && f.level !== 0) f.level = 0;
        else f.level *= 0.84;
        for (const part of f.parts) {
          part.mat.emissiveIntensity = part.base + part.boost * f.level;
          part.mat.update();
        }
      }
      // a short glowing trail behind a fast ball
      snap.balls.forEach((b, i) => {
        let t = trails[i];
        if (!t) {
          t = { pos: [], ents: Array.from({ length: TRAIL }, () => add(dyn, "plane", trailMat, false)) };
          trails[i] = t;
        }
        const fast = Math.hypot(b.vx, b.vy) > 0.9;
        t.pos.unshift({ x: X(b.x), y: b.r * S + (ballLift[i] ?? 0), z: Z(b.y) });
        if (t.pos.length > TRAIL) t.pos.length = TRAIL;
        t.ents.forEach((e, k) => {
          const p = t!.pos[k + 1];
          e.enabled = fast && p !== undefined;
          if (p) {
            const size = b.r * S * 2.6 * (1 - (k + 1) / (TRAIL + 2));
            place(e, p.x, Math.max(0.15, p.y * 0.5), p.z, size, 1, size);
          }
        });
      });
      for (let i = snap.balls.length; i < trails.length; i++) trails[i]?.ents.forEach((e) => (e.enabled = false));
      for (const [id, ins] of inserts) {
        const lamp = snap.lamps[id] ?? "off";
        const level = LAMP_LEVEL[lamp];
        if (level !== ins.level) {
          ins.level = level;
          ins.discMat.emissiveIntensity = level * 1.6;
          ins.discMat.update();
          ins.glowMat.emissiveIntensity = level;
          ins.glowMat.update();
        }
      }
      updateCamera(snap);
      app.renderNextFrame = true;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, w, h);
      drawHud(octx, [], w, h); // only the names of the touch buttons: the lines are on the display
      const text = snap.hud.lines.join("\n");
      if (text !== displayText && displayCanvas && displayTexture) {
        displayText = text;
        drawDisplay(displayCanvas, snap.hud.lines);
        displayTexture.upload();
      }
    },
    dispose() {
      overlay.remove();
      app.destroy();
    },
  };
}
