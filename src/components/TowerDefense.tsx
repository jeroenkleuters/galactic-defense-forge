import { useEffect, useRef, useState } from "react";
import {
  Game,
  TOWER_SPECS,
  TOTAL_WAVES,
  WORLD_H,
  WORLD_W,
  type HudState,
  type TowerKind,
} from "../game/engine";

const KINDS: TowerKind[] = ["turbolaser", "ion", "tractor"];

export function TowerDefense() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>({
    credits: 220,
    lives: 20,
    wave: 0,
    enemiesLeft: 0,
    status: "idle",
  });
  const [selected, setSelected] = useState<TowerKind | null>(null);
  const [towerPanel, setTowerPanel] = useState<{ kind: TowerKind; level: number; cost: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD_W * dpr;
    canvas.height = WORLD_H * dpr;
    ctx.scale(dpr, dpr);

    const game = new Game(ctx);
    game.onHud = setHud;
    gameRef.current = game;
    game.start();
    game.emitHud();
    return () => game.stop();
  }, []);

  const toWorld = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * WORLD_W,
      y: ((e.clientY - r.top) / r.height) * WORLD_H,
    };
  };

  const syncPanel = () => {
    const g = gameRef.current!;
    const t = g.selectedTower;
    setTowerPanel(t ? { kind: t.kind, level: t.level, cost: g.upgradeCost(t) } : null);
  };

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Credits" value={`${hud.credits}`} tone="credits" />
          <Stat label="Shield" value={`${hud.lives}`} tone="lives" />
          <Stat label="Wave" value={`${hud.wave}/${TOTAL_WAVES}`} tone="wave" />
          <Stat label="Hostiles" value={`${hud.enemiesLeft}`} tone="enemy" />
        </div>

        <div className="relative overflow-hidden rounded-xl border border-hologram/30 shadow-[0_0_60px_-15px_var(--glow)]">
          <canvas
            ref={canvasRef}
            style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}
            className="block w-full cursor-crosshair"
            onMouseMove={(e) => {
              const g = gameRef.current;
              if (!g) return;
              const p = toWorld(e);
              g.hover = { x: p.x, y: p.y, valid: g.canPlace(p.x, p.y) };
            }}
            onMouseLeave={() => {
              const g = gameRef.current;
              if (g) g.hover = { x: -999, y: -999, valid: false };
            }}
            onClick={(e) => {
              const g = gameRef.current;
              if (!g) return;
              const p = toWorld(e);
              if (g.selected) {
                g.place(p.x, p.y);
                return;
              }
              g.pickTower(p.x, p.y);
              syncPanel();
            }}
          />

          {(hud.status === "won" || hud.status === "lost") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
              <p className="font-display text-4xl tracking-[0.2em] text-hologram">
                {hud.status === "won" ? "SECTOR HELD" : "BASE OVERRUN"}
              </p>
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {hud.status === "won"
                  ? `All ${TOTAL_WAVES} imperial waves repelled. The outpost survives.`
                  : "Imperial forces breached the shield generator."}
              </p>
              <button
                className="rounded-md border border-hologram/50 bg-hologram/10 px-5 py-2 font-display text-sm tracking-widest text-hologram transition hover:bg-hologram/20"
                onClick={() => {
                  gameRef.current?.reset();
                  setSelected(null);
                  setTowerPanel(null);
                }}
              >
                REDEPLOY
              </button>
            </div>
          )}
        </div>
      </div>

      <aside className="w-full shrink-0 space-y-3 lg:w-72">
        <button
          disabled={hud.enemiesLeft > 0 || hud.status === "won" || hud.status === "lost"}
          onClick={() => gameRef.current?.nextWave()}
          className="w-full rounded-lg border border-imperial/50 bg-imperial/15 px-4 py-3 font-display text-sm tracking-[0.2em] text-imperial transition enabled:hover:bg-imperial/25 disabled:opacity-35"
        >
          {hud.enemiesLeft > 0 ? "WAVE INBOUND" : `LAUNCH WAVE ${hud.wave + 1}`}
        </button>

        <div className="space-y-2">
          {KINDS.map((k) => {
            const s = TOWER_SPECS[k];
            const active = selected === k;
            const afford = hud.credits >= s.cost;
            return (
              <button
                key={k}
                onClick={() => {
                  const g = gameRef.current!;
                  const next = active ? null : k;
                  setSelected(next);
                  g.selected = next;
                  g.selectedTower = null;
                  setTowerPanel(null);
                }}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-hologram bg-hologram/15"
                    : "border-border bg-card/60 hover:border-hologram/50"
                } ${afford ? "" : "opacity-45"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm tracking-wider text-foreground">{s.name}</span>
                  <span className="font-mono text-xs text-credit">{s.cost}c</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{s.desc}</p>
                <div className="mt-2 flex gap-3 font-mono text-[10px] uppercase text-muted-foreground">
                  <span>dmg {s.damage}</span>
                  <span>rng {s.range}</span>
                  <span>rof {(1 / s.cooldown).toFixed(1)}/s</span>
                </div>
              </button>
            );
          })}
        </div>

        {towerPanel && (
          <div className="rounded-lg border border-hologram/40 bg-card/70 p-3">
            <p className="font-display text-sm tracking-wider text-hologram">
              {TOWER_SPECS[towerPanel.kind].name} · Mk{towerPanel.level}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={towerPanel.level >= 4 || hud.credits < towerPanel.cost}
                onClick={() => {
                  const g = gameRef.current!;
                  if (g.selectedTower) g.upgrade(g.selectedTower);
                  syncPanel();
                }}
                className="flex-1 rounded-md border border-credit/50 bg-credit/10 px-2 py-2 font-mono text-xs text-credit disabled:opacity-40"
              >
                {towerPanel.level >= 4 ? "MAX" : `UPGRADE ${towerPanel.cost}c`}
              </button>
              <button
                onClick={() => {
                  const g = gameRef.current!;
                  if (g.selectedTower) g.sell(g.selectedTower);
                  setTowerPanel(null);
                }}
                className="rounded-md border border-imperial/50 bg-imperial/10 px-3 py-2 font-mono text-xs text-imperial"
              >
                SELL
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card/40 p-3 text-xs leading-relaxed text-muted-foreground">
          Pick a battery, click open space to deploy. Click a deployed battery to
          upgrade or sell it. Hostiles jump in from the left hyperlane — stop them
          before they reach the base.
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const color =
    tone === "credits"
      ? "text-credit"
      : tone === "lives"
        ? "text-hologram"
        : tone === "enemy"
          ? "text-imperial"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`font-display text-xl ${color}`}>{value}</p>
    </div>
  );
}
