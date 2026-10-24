import * as THREE from 'three';
import { model } from '../assets';
import type { Slot } from '../world/city';
import { buildSurroundings } from '../world/surroundings';
import { label } from '../world/props';
import type { Box } from './arena';

/**
 * Scena separata dei lavoretti al chiuso (cucina, sala, hotel, bar, forno, pulizie…):
 * un locale chiuso col **soffitto** (dentro un palazzo non si vede mai il cielo; regola dell'utente),
 * muri alti fino al soffitto, pavimento e mobili Kenney; dalla porta si vede il quartiere vero dove si è accettato
 * il lavoro. Grande quanto serve per le cose da fare.
 *
 * Le coordinate dei lavoretti (at, furn) sono quelle del progetto (`w` × `d`); il locale vero è più grande
 * (SPREAD) e le cose si allargano: in mezzo le distanze crescono, vicino ai muri resta la stessa distanza dal
 * muro (i mobili contro il muro restano contro il muro, ma più distanti tra loro). Così c'è spazio per
 * camminare, girare la visuale e toccare la cosa giusta.
 */
export const ROOM_ORIGIN = new THREE.Vector3(0, 0, 4800);

/** Mobili usati nei locali (da precaricare). */
export const ROOM_ASSETS = [
  'table', 'tableRound', 'tableCloth', 'chairCushion', 'chair', 'kitchenBar', 'kitchenBarEnd', 'stoolBar', 'kitchenCoffeeMachine',
  'kitchenMicrowave', 'kitchenCabinetUpper', 'kitchenCabinet', 'kitchenStove', 'kitchenFridge', 'kitchenFridgeLarge', 'kitchenSink',
  'bedSingle', 'bedDouble', 'bathroomSink', 'trashcan', 'coatRackStanding', 'sideTable', 'lampRoundTable', 'rugRound', 'rugRectangle',
  'plantSmall1', 'pottedPlant', 'books', 'cabinetBedDrawerTable', 'toaster', 'kitchenBlender', 'bench', 'loungeSofa', 'desk', 'tableCoffee', 'cabinetTelevision', 'bookcaseOpen',
].map((n) => `furniture/${n}.glb`);

/** Scala dei mobili Kenney (come nella casa del cliente): un bancone arriva a circa 1 m. */
export const FURN = 2.3;

/** Quanto è più grande il locale vero rispetto alle misure del progetto (per lato). */
export const SPREAD = 1.5;
/** fascia vicino al muro (m) che resta alla stessa distanza dal muro */
const WALL_BAND = 1.0;

/** coordinata del progetto (mezza misura h) → locale vero (mezza misura H) */
function spread(a: number, h: number, H: number) {
  const m = Math.min(WALL_BAND, h / 2);
  const k = Math.abs(a);
  const v = k >= h - m ? H - (h - k) : (k * (H - m)) / (h - m);
  return Math.sign(a) * v;
}

const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });

export interface RoomOpts {
  w: number;
  d: number;
  /** colore del pavimento e dei muri */
  floor?: number;
  wall?: number;
  /** pavimento a scacchi (cucine, bar) */
  tiles?: boolean;
  /** cartello sopra la porta */
  sign?: string;
  /** colore del soffitto */
  ceiling?: number;
  slot?: Slot;
  placed?: { path: string; m: THREE.Matrix4 }[];
}

export class Room {
  group = new THREE.Group();
  bounds: Box;
  blocks: Box[] = [];
  /** dentro, vicino alla porta (sul lato davanti, +z) */
  entry: THREE.Vector3;
  /** centro del pavimento */
  center: THREE.Vector3;
  /** misure vere del locale */
  readonly w: number;
  readonly d: number;
  /** misure del progetto (quelle delle coordinate dei lavoretti) */
  private w0: number;
  private d0: number;

  constructor(opts: RoomOpts) {
    const O = ROOM_ORIGIN;
    const g = this.group;
    this.w0 = opts.w;
    this.d0 = opts.d;
    const W = (this.w = opts.w * SPREAD);
    const D = (this.d = opts.d * SPREAD);
    this.center = O.clone();
    this.bounds = { minX: O.x - W / 2 + 0.35, maxX: O.x + W / 2 - 0.35, minZ: O.z - D / 2 + 0.35, maxZ: O.z + D / 2 - 0.35 };
    const plane = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      g.add(p);
      return p;
    };
    plane(900, 900, mat(0x6fae4f), O.x, -0.02, O.z);
    plane(W + 6, D + 8, mat(0x9aa0aa), O.x, -0.01, O.z + 1);
    if (opts.tiles) {
      // scacchi bianchi e grigi
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f2f2f2';
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = '#b9bcc4';
      x.fillRect(0, 0, 32, 32);
      x.fillRect(32, 32, 32, 32);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(W / 1.2, D / 1.2);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      plane(W, D, new THREE.MeshLambertMaterial({ map: tex }), O.x, 0.01, O.z);
    } else plane(W, D, mat(opts.floor ?? 0xc9a77c), O.x, 0.01, O.z);
    // muri alti fino al soffitto, con la porta davanti in mezzo
    const H = 2.8;
    const wallM = mat(opts.wall ?? 0xf1e6d2);
    const wall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallM);
      m.position.set(x, H / 2, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      this.blocks.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    };
    const DOOR = 1.8;
    wall(O.x, O.z - D / 2 - 0.15, W + 0.6, 0.3);
    wall(O.x - W / 2 - 0.15, O.z, 0.3, D);
    wall(O.x + W / 2 + 0.15, O.z, 0.3, D);
    const side = (W - DOOR) / 2;
    wall(O.x - DOOR / 2 - side / 2, O.z + D / 2 + 0.15, side, 0.3);
    wall(O.x + DOOR / 2 + side / 2, O.z + D / 2 + 0.15, side, 0.3);
    // il soffitto (dentro un palazzo non si vede mai il cielo) e l'architrave sopra la porta; non fa ombra,
    // se no il sole lo stenderebbe su tutta la stanza. Qualche plafoniera accesa.
    // (colore pieno, senza luce: dal basso il sole non lo illuminerebbe e verrebbe scuro)
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, D + 0.6), new THREE.MeshBasicMaterial({ color: opts.ceiling ?? 0xdcd5c6, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(O.x, H, O.z);
    ceil.userData.noGlow = true;
    g.add(ceil);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR, H - 2.2, 0.3), wallM);
    lintel.position.set(O.x, 2.2 + (H - 2.2) / 2, O.z + D / 2 + 0.15);
    g.add(lintel);
    const lampM = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    for (let ix = 0; ix < Math.max(1, Math.round(W / 5)); ix++) for (let iz = 0; iz < Math.max(1, Math.round(D / 5)); iz++) {
      const nx = Math.max(1, Math.round(W / 5));
      const nz = Math.max(1, Math.round(D / 5));
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), lampM);
      l.position.set(O.x - W / 2 + (W / nx) * (ix + 0.5), H - 0.03, O.z - D / 2 + (D / nz) * (iz + 0.5));
      l.userData.noGlow = true;
      g.add(l);
    }
    // battiscopa colorato in cima ai muri
    for (const [x, z, w2, d2] of [[0, -D / 2 - 0.15, W + 0.6, 0.34], [0, D / 2 + 0.15, W + 0.6, 0.34], [-W / 2 - 0.15, 0, 0.34, D], [W / 2 + 0.15, 0, 0.34, D]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.22, d2), mat(0x8e5bd6));
      b.position.set(O.x + x, H + 0.11, O.z + z);
      g.add(b);
    }
    if (opts.sign) {
      const s = label(opts.sign, { bg: '#e8590c', scale: 0.7 });
      s.position.set(O.x, H + 1.1, O.z + D / 2 + 0.3);
      g.add(s);
    }
    this.entry = new THREE.Vector3(O.x, 0, O.z + D / 2 - 0.9);
    if (opts.slot && opts.placed) buildSurroundings(g, opts.slot, opts.placed, new THREE.Vector3(O.x, 0, O.z + 1), W + 6, D + 8);
  }

  /**
   * Mette un mobile Kenney centrato in (x, z) del locale (coordinate rispetto al centro), girato di `rot`;
   * se `solid` non si attraversa. Restituisce l'oggetto e il suo ingombro.
   */
  furn(path: string, x: number, z: number, rot = 0, scale = FURN, solid = true) {
    return this.place(path, this.sx(x), this.sz(z), rot, scale, solid);
  }

  /**
   * Bancone fatto di più pezzi uno accanto all'altro, da `a` a `b` (coordinate del progetto, lungo x se
   * `alongX`, altrimenti lungo z; l'altra coordinata è `c`): resta intero anche nel locale allargato.
   */
  furnRow(path: string, a: number, b: number, c: number, alongX: boolean, rot = 0, scale = FURN) {
    const A = alongX ? this.sx(a) : this.sz(a);
    const B = alongX ? this.sx(b) : this.sz(b);
    const C = alongX ? this.sz(c) : this.sx(c);
    // larghezza di un pezzo (lungo la fila)
    const probe = new THREE.Box3().setFromObject(model(`furniture/${path}.glb`, scale));
    const along = Math.abs(Math.cos(rot)) > 0.5 === alongX ? probe.max.x - probe.min.x : probe.max.z - probe.min.z;
    const k = Math.max(1, Math.round(Math.abs(B - A) / along));
    const step = (B - A) / k;
    const out = [];
    for (let i = 0; i < k; i++) {
      const v = A + step * (i + 0.5);
      out.push(alongX ? this.place(path, v, C, rot, scale) : this.place(path, C, v, rot, scale));
    }
    return out;
  }

  /** Mette un mobile nel punto (x, z) del locale vero (rispetto al centro). */
  private place(path: string, x: number, z: number, rot = 0, scale = FURN, solid = true) {
    const O = ROOM_ORIGIN;
    const inner = model(`furniture/${path}.glb`, scale);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    const o = new THREE.Group();
    o.add(inner);
    o.position.set(O.x + x, 0, O.z + z);
    o.rotation.y = rot;
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
    });
    this.group.add(o);
    o.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(o);
    if (solid) this.blocks.push({ minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z });
    return { obj: o, top: bb.max.y, box: bb };
  }

  /** Punto del locale (coordinate rispetto al centro). */
  at(x: number, z: number, y = 0) {
    return new THREE.Vector3(ROOM_ORIGIN.x + this.sx(x), y, ROOM_ORIGIN.z + this.sz(z));
  }

  /**
   * Punto accanto a un oggetto: l'oggetto in (x, z) (coordinate del progetto) e il punto spostato di (dx, dz)
   * metri veri. La distanza tra un oggetto e il suo punto da toccare resta quella del progetto.
   */
  near(x: number, z: number, dx: number, dz: number) {
    return this.at(x, z).add(new THREE.Vector3(dx, 0, dz));
  }

  /**
   * Un accessorio piccolo (macchina del caffè, frullatore…) appoggiato sopra un mobile (`base`), mai a terra.
   * Restituisce l'accessorio (è lui che si accende e si tocca).
   */
  furnOn(base: string, path: string, x: number, z: number, rot = 0, scale = FURN) {
    const b = this.furn(base, x, z, rot);
    const a = this.furn(path, x, z, rot, scale, false);
    a.obj.position.y = b.top;
    a.obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(a.obj);
    return { obj: a.obj, top: bb.max.y, box: bb };
  }

  /** coordinate del progetto → locale vero (rispetto al centro) */
  sx(x: number) {
    return spread(x, this.w0 / 2, this.w / 2);
  }
  sz(z: number) {
    return spread(z, this.d0 / 2, this.d / 2);
  }

  collide(p: THREE.Vector3, r = 0.35) {
    const b = this.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
    for (const k of this.blocks) {
      if (p.x < k.minX - r || p.x > k.maxX + r || p.z < k.minZ - r || p.z > k.maxZ + r) continue;
      const push = [k.minX - r - p.x, k.maxX + r - p.x, k.minZ - r - p.z, k.maxZ + r - p.z];
      const i = push.map(Math.abs).indexOf(Math.min(...push.map(Math.abs)));
      if (i < 2) p.x += push[i];
      else p.z += push[i];
    }
  }

  blocked(x: number, z: number) {
    return this.blocks.some((k) => x > k.minX - 0.15 && x < k.maxX + 0.15 && z > k.minZ - 0.15 && z < k.maxZ + 0.15);
  }
}
