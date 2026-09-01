// Space tower defense engine — plain canvas 2D, framework agnostic.

export type TowerKind = "turbolaser" | "ion" | "tractor";

export interface TowerSpec {
  kind: TowerKind;
  name: string;
  cost: number;
  range: number;
  damage: number;
  cooldown: number; // seconds
  color: string;
  desc: string;
}

export const TOWER_SPECS: Record<TowerKind, TowerSpec> = {
  turbolaser: {
    kind: "turbolaser",
    name: "Turbolaser",
    cost: 60,
    range: 130,
    damage: 12,
    cooldown: 0.5,
    color: "#4ce0b3",
    desc: "Fast green bolts. Reliable all-round battery.",
  },
  ion: {
    kind: "ion",
    name: "Ion Cannon",
    cost: 110,
    range: 165,
    damage: 42,
    cooldown: 1.6,
    color: "#63b8ff",
    desc: "Heavy blue burst. Slow, hits hard.",
  },
  tractor: {
    kind: "tractor",
    name: "Tractor Beam",
    cost: 90,
    range: 120,
    damage: 4,
    cooldown: 0.35,
    color: "#f0a63c",
    desc: "Chews shields and slows hostiles by 45%.",
  },
};

export interface Tower {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  cd: number;
  angle: number;
  level: number;
}

interface Enemy {
  id: number;
  t: number; // distance along path
  speed: number;
  hp: number;
  maxHp: number;
  bounty: number;
  slow: number;
  type: "tie" | "bomber" | "interceptor" | "destroyer";
  size: number;
  x: number;
  y: number;
  angle: number;
}

interface Shot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface HudState {
  credits: number;
  lives: number;
  wave: number;
  enemiesLeft: number;
  status: "idle" | "running" | "won" | "lost";
}

export const WORLD_W = 960;
export const WORLD_H = 600;

const PATH: [number, number][] = [
  [-40, 110],
  [190, 110],
  [190, 300],
  [420, 300],
  [420, 120],
  [640, 120],
  [640, 450],
  [300, 450],
  [300, 545],
  [1000, 545],
];

function buildPath() {
  const segs: { x: number; y: number; dx: number; dy: number; len: number }[] = [];
  let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x, y] = PATH[i]!;
    const [x2, y2] = PATH[i + 1]!;
    const dx = x2 - x;
    const dy = y2 - y;
    const len = Math.hypot(dx, dy);
    segs.push({ x, y, dx: dx / len, dy: dy / len, len });
    total += len;
  }
  return { segs, total };
}

const { segs: SEGMENTS, total: PATH_LEN } = buildPath();

function pointAt(t: number) {
  let d = Math.max(0, t);
  for (const s of SEGMENTS) {
    if (d <= s.len) return { x: s.x + s.dx * d, y: s.y + s.dy * d, a: Math.atan2(s.dy, s.dx) };
    d -= s.len;
  }
  const last = SEGMENTS[SEGMENTS.length - 1]!;
  return { x: last.x + last.dx * last.len, y: last.y + last.dy * last.len, a: Math.atan2(last.dy, last.dx) };
}

interface WaveDef {
  type: Enemy["type"];
  count: number;
  gap: number;
  hp: number;
  speed: number;
  bounty: number;
}

function waveFor(n: number): WaveDef[] {
  const s = 1 + (n - 1) * 0.22;
  const defs: WaveDef[] = [
    { type: "tie", count: 6 + n * 2, gap: 0.75, hp: Math.round(38 * s), speed: 52, bounty: 9 },
  ];
  if (n >= 2)
    defs.push({ type: "interceptor", count: 3 + n, gap: 0.45, hp: Math.round(26 * s), speed: 92, bounty: 11 });
  if (n >= 3)
    defs.push({ type: "bomber", count: 2 + Math.floor(n / 2), gap: 1.2, hp: Math.round(120 * s), speed: 34, bounty: 22 });
  if (n % 4 === 0)
    defs.push({ type: "destroyer", count: 1 + Math.floor(n / 8), gap: 3, hp: Math.round(900 * s), speed: 22, bounty: 120 });
  return defs;
}

export const TOTAL_WAVES = 12;

export class Game {
  ctx: CanvasRenderingContext2D;
  towers: Tower[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  parts: Particle[] = [];
  stars: { x: number; y: number; r: number; a: number; s: number }[] = [];
  credits = 220;
  lives = 20;
  wave = 0;
  status: HudState["status"] = "idle";
  selected: TowerKind | null = null;
  hover = { x: -999, y: -999, valid: false };
  selectedTower: Tower | null = null;
  private queue: { type: Enemy["type"]; hp: number; speed: number; bounty: number; at: number }[] = [];
  private clock = 0;
  private ids = 1;
  private raf = 0;
  private last = 0;
  onHud: (h: HudState) => void = () => {};

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.random() * WORLD_W,
        y: Math.random() * WORLD_H,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.7 + 0.2,
        s: Math.random() * 0.5 + 0.08,
      });
    }
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  emitHud() {
    this.onHud({
      credits: this.credits,
      lives: this.lives,
      wave: this.wave,
      enemiesLeft: this.enemies.length + this.queue.length,
      status: this.status,
    });
  }

  nextWave() {
    if (this.status === "lost" || this.status === "won") return;
    if (this.enemies.length || this.queue.length) return;
    if (this.wave >= TOTAL_WAVES) return;
    this.wave++;
    this.status = "running";
    let at = this.clock + 0.5;
    for (const d of waveFor(this.wave)) {
      for (let i = 0; i < d.count; i++) {
        this.queue.push({ type: d.type, hp: d.hp, speed: d.speed, bounty: d.bounty, at });
        at += d.gap;
      }
      at += 1.2;
    }
    this.emitHud();
  }

  canPlace(x: number, y: number) {
    if (x < 24 || y < 24 || x > WORLD_W - 24 || y > WORLD_H - 24) return false;
    for (const s of SEGMENTS) {
      // distance to segment
      const px = x - s.x;
      const py = y - s.y;
      const proj = Math.max(0, Math.min(s.len, px * s.dx + py * s.dy));
      const cx = s.x + s.dx * proj;
      const cy = s.y + s.dy * proj;
      if (Math.hypot(x - cx, y - cy) < 42) return false;
    }
    for (const t of this.towers) if (Math.hypot(t.x - x, t.y - y) < 38) return false;
    return true;
  }

  place(x: number, y: number) {
    if (!this.selected) return;
    const spec = TOWER_SPECS[this.selected];
    if (this.credits < spec.cost || !this.canPlace(x, y)) return;
    this.credits -= spec.cost;
    this.towers.push({ id: this.ids++, kind: this.selected, x, y, cd: 0, angle: -Math.PI / 2, level: 1 });
    this.emitHud();
  }

  pickTower(x: number, y: number) {
    this.selectedTower = this.towers.find((t) => Math.hypot(t.x - x, t.y - y) < 24) ?? null;
    return this.selectedTower;
  }

  upgradeCost(t: Tower) {
    return Math.round(TOWER_SPECS[t.kind].cost * 0.8 * t.level);
  }

  upgrade(t: Tower) {
    const cost = this.upgradeCost(t);
    if (this.credits < cost || t.level >= 4) return;
    this.credits -= cost;
    t.level++;
    this.emitHud();
  }

  sell(t: Tower) {
    const refund = Math.round(TOWER_SPECS[t.kind].cost * (0.5 + 0.4 * (t.level - 1)));
    this.credits += refund;
    this.towers = this.towers.filter((x) => x !== t);
    this.selectedTower = null;
    this.emitHud();
  }

  private boom(x: number, y: number, color: string, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (30 + Math.random() * 140) * power;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        color,
        size: 1 + Math.random() * 2.5 * power,
      });
    }
  }

  private update(dt: number) {
    this.clock += dt;

    for (const s of this.stars) {
      s.x -= s.s * 12 * dt;
      if (s.x < 0) s.x += WORLD_W;
    }

    while (this.queue.length && this.queue[0].at <= this.clock) {
      const q = this.queue.shift()!;
      const size = q.type === "destroyer" ? 26 : q.type === "bomber" ? 16 : 11;
      const p = pointAt(0);
      this.enemies.push({
        id: this.ids++,
        t: 0,
        speed: q.speed,
        hp: q.hp,
        maxHp: q.hp,
        bounty: q.bounty,
        slow: 0,
        type: q.type,
        size,
        x: p.x,
        y: p.y,
        angle: p.a,
      });
    }

    for (const e of this.enemies) {
      const mult = e.slow > 0 ? 0.55 : 1;
      e.slow = Math.max(0, e.slow - dt);
      e.t += e.speed * mult * dt;
      const p = pointAt(e.t);
      e.x = p.x;
      e.y = p.y;
      e.angle = p.a;
    }

    // leaks
    const leaked = this.enemies.filter((e) => e.t >= PATH_LEN);
    if (leaked.length) {
      this.lives -= leaked.length;
      for (const e of leaked) this.boom(e.x, e.y, "#ff5a5a", 10);
      this.enemies = this.enemies.filter((e) => e.t < PATH_LEN);
      if (this.lives <= 0) {
        this.lives = 0;
        this.status = "lost";
      }
      this.emitHud();
    }

    // towers fire
    for (const t of this.towers) {
      const spec = TOWER_SPECS[t.kind];
      const range = spec.range * (1 + (t.level - 1) * 0.12);
      let best: Enemy | null = null;
      for (const e of this.enemies) {
        if (Math.hypot(e.x - t.x, e.y - t.y) <= range && (!best || e.t > best.t)) best = e;
      }
      t.cd -= dt;
      if (best) {
        t.angle = Math.atan2(best.y - t.y, best.x - t.x);
        if (t.cd <= 0) {
          t.cd = spec.cooldown;
          const dmg = spec.damage * (1 + (t.level - 1) * 0.55);
          best.hp -= dmg;
          if (t.kind === "tractor") best.slow = 0.6;
          this.shots.push({ x: t.x, y: t.y, tx: best.x, ty: best.y, life: 0.09, color: spec.color });
          this.boom(best.x, best.y, spec.color, 4, 0.4);
        }
      }
    }

    const dead = this.enemies.filter((e) => e.hp <= 0);
    if (dead.length) {
      for (const e of dead) {
        this.credits += e.bounty;
        this.boom(e.x, e.y, e.type === "destroyer" ? "#ffd166" : "#ff8a3d", e.type === "destroyer" ? 46 : 18, e.type === "destroyer" ? 2 : 1);
      }
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      this.emitHud();
    }

    for (const s of this.shots) s.life -= dt;
    this.shots = this.shots.filter((s) => s.life > 0);

    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    this.parts = this.parts.filter((p) => p.life > 0);

    if (
      this.status === "running" &&
      !this.enemies.length &&
      !this.queue.length
    ) {
      if (this.wave >= TOTAL_WAVES) this.status = "won";
      else this.status = "idle";
      this.emitHud();
    }
  }

  private drawShip(e: Enemy) {
    const c = this.ctx;
    c.save();
    c.translate(e.x, e.y);
    c.rotate(e.angle);
    const s = e.size;
    if (e.type === "destroyer") {
      c.fillStyle = "#b9c4d4";
      c.strokeStyle = "#5f6c80";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(s * 1.6, 0);
      c.lineTo(-s, s * 0.8);
      c.lineTo(-s, -s * 0.8);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#8e9bad";
      c.fillRect(-s * 0.8, -s * 0.3, s * 0.7, s * 0.6);
      c.fillStyle = "#63b8ff";
      c.fillRect(-s, -s * 0.15, s * 0.25, s * 0.3);
    } else if (e.type === "bomber") {
      c.fillStyle = "#2c3342";
      c.strokeStyle = "#9fb1c7";
      c.lineWidth = 1.4;
      c.fillRect(-s * 0.6, -s * 0.5, s * 1.2, s);
      c.strokeRect(-s * 0.6, -s * 0.5, s * 1.2, s);
      c.fillStyle = "#1b2130";
      c.fillRect(-s * 0.25, -s * 1.4, s * 0.5, s * 2.8);
      c.strokeRect(-s * 0.25, -s * 1.4, s * 0.5, s * 2.8);
    } else {
      // TIE fighter silhouette
      const col = e.type === "interceptor" ? "#3c4a63" : "#2b3242";
      c.fillStyle = col;
      c.strokeStyle = e.type === "interceptor" ? "#7fe3ff" : "#a9b6c9";
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(-s * 0.2, -s * 1.3);
      c.lineTo(s * 0.35, -s * 0.8);
      c.lineTo(s * 0.35, s * 0.8);
      c.lineTo(-s * 0.2, s * 1.3);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      c.fillStyle = "#4a5568";
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(s * 0.15, 0, s * 0.22, 0, Math.PI * 2);
      c.fillStyle = "#d7f5ff";
      c.fill();
    }
    c.restore();

    // health bar
    if (e.hp < e.maxHp) {
      const w = e.size * 2.4;
      const c2 = this.ctx;
      c2.fillStyle = "rgba(0,0,0,0.55)";
      c2.fillRect(e.x - w / 2, e.y - e.size - 10, w, 4);
      c2.fillStyle = e.hp / e.maxHp > 0.4 ? "#4ce0b3" : "#ff6b6b";
      c2.fillRect(e.x - w / 2, e.y - e.size - 10, (w * e.hp) / e.maxHp, 4);
    }
  }

  private drawTower(t: Tower) {
    const c = this.ctx;
    const spec = TOWER_SPECS[t.kind];
    c.save();
    c.translate(t.x, t.y);
    c.fillStyle = "rgba(10,18,30,0.9)";
    c.strokeStyle = spec.color;
    c.lineWidth = 1.6;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const r = 17;
      i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.rotate(t.angle);
    c.fillStyle = spec.color;
    if (t.kind === "ion") {
      c.fillRect(0, -4, 20, 8);
      c.fillRect(16, -6, 5, 12);
    } else if (t.kind === "tractor") {
      c.beginPath();
      c.moveTo(4, -3);
      c.lineTo(22, -9);
      c.lineTo(22, 9);
      c.lineTo(4, 3);
      c.closePath();
      c.fill();
    } else {
      c.fillRect(0, -2.5, 22, 2.6);
      c.fillRect(0, 1, 22, 2.6);
    }
    c.restore();

    for (let i = 0; i < t.level - 1; i++) {
      c.fillStyle = spec.color;
      c.beginPath();
      c.arc(t.x - 8 + i * 8, t.y + 22, 2.4, 0, Math.PI * 2);
      c.fill();
    }
  }

  private draw() {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    g.addColorStop(0, "#050912");
    g.addColorStop(0.5, "#08111f");
    g.addColorStop(1, "#0b0716");
    c.fillStyle = g;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // nebula
    const neb = c.createRadialGradient(760, 140, 20, 760, 140, 320);
    neb.addColorStop(0, "rgba(90,60,180,0.35)");
    neb.addColorStop(1, "rgba(90,60,180,0)");
    c.fillStyle = neb;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    const neb2 = c.createRadialGradient(140, 480, 10, 140, 480, 280);
    neb2.addColorStop(0, "rgba(0,140,160,0.25)");
    neb2.addColorStop(1, "rgba(0,140,160,0)");
    c.fillStyle = neb2;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    for (const s of this.stars) {
      c.globalAlpha = s.a;
      c.fillStyle = "#dff1ff";
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // hyperlane path
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "rgba(80,190,255,0.10)";
    c.lineWidth = 46;
    c.beginPath();
    PATH.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.stroke();
    c.strokeStyle = "rgba(120,220,255,0.55)";
    c.lineWidth = 1.5;
    c.setLineDash([14, 12]);
    c.lineDashOffset = -this.clock * 40;
    c.stroke();
    c.setLineDash([]);

    // base
    const base = pointAt(PATH_LEN);
    c.fillStyle = "rgba(90,255,200,0.12)";
    c.beginPath();
    c.arc(base.x - 40, base.y, 46, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#4ce0b3";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(base.x - 40, base.y, 26, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#4ce0b3";
    c.font = "11px ui-monospace, monospace";
    c.textAlign = "center";
    c.fillText("BASE", base.x - 40, base.y + 4);

    // spawn marker
    const sp = pointAt(0);
    c.strokeStyle = "rgba(255,90,90,0.7)";
    c.beginPath();
    c.arc(sp.x + 40, sp.y, 18, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "rgba(255,120,120,0.9)";
    c.fillText("JUMP", sp.x + 40, sp.y - 26);

    for (const t of this.towers) this.drawTower(t);

    if (this.selectedTower) {
      const t = this.selectedTower;
      const spec = TOWER_SPECS[t.kind];
      c.strokeStyle = "rgba(255,255,255,0.35)";
      c.setLineDash([5, 6]);
      c.beginPath();
      c.arc(t.x, t.y, spec.range * (1 + (t.level - 1) * 0.12), 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }

    for (const e of this.enemies) this.drawShip(e);

    for (const s of this.shots) {
      c.strokeStyle = s.color;
      c.lineWidth = 2.4;
      c.globalAlpha = Math.min(1, s.life / 0.09);
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.tx, s.ty);
      c.stroke();
      c.globalAlpha = 1;
    }

    for (const p of this.parts) {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    // placement ghost
    if (this.selected && this.hover.x > -900) {
      const spec = TOWER_SPECS[this.selected];
      const ok = this.hover.valid && this.credits >= spec.cost;
      c.strokeStyle = ok ? "rgba(120,255,210,0.8)" : "rgba(255,90,90,0.8)";
      c.fillStyle = ok ? "rgba(120,255,210,0.10)" : "rgba(255,90,90,0.10)";
      c.beginPath();
      c.arc(this.hover.x, this.hover.y, spec.range, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(this.hover.x, this.hover.y, 17, 0, Math.PI * 2);
      c.stroke();
    }
  }

  reset() {
    this.towers = [];
    this.enemies = [];
    this.shots = [];
    this.parts = [];
    this.queue = [];
    this.credits = 220;
    this.lives = 20;
    this.wave = 0;
    this.status = "idle";
    this.selectedTower = null;
    this.selected = null;
    this.emitHud();
  }
}
