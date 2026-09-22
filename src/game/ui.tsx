import { useEffect, useRef, useState } from "react";
import { BUILDINGS, CLICK_UPGRADES, CRAFTS, DISCIPLES, RARITY, REALMS, SKILLS } from "./data";
import { buildingTier, buildingsInBand, nextTierAt, perkLine, tierName } from "./ink";
import {
  buildingCost,
  buildingUnlocked,
  clickPower,
  clickUpgradeCost,
  critChance,
  formatNum,
  formatTime,
  maxAffordable,
  multipliers,
  prestigeFruit,
  skillCost,
  totalDps,
} from "./sim";
import { useGame, type BuyMode, type Tab } from "./store";

const ASSET_BASE = (import.meta as ImportMeta & { env: { BASE_URL?: string } }).env.BASE_URL || "/";
const assetUrl = (p: string) => `${ASSET_BASE}${p.replace(/^\//, "")}`;


/** 壳层稀有度：墨深 + 高阶朱砂，不用彩虹档色 */
const INK_RARITY_COLOR = [
  "#9a9488", // 凡人 · 浅淡
  "#7a7468", // 炼气
  "#5c564c", // 筑基
  "#3a3630", // 金丹 · 浓墨
  "#a63d32", // 元婴 · 朱砂
  "#8a3028", // 化神
  "#6e2a24", // 合体
  "#4a1e1a", // 仙人 · 阴刻
] as const;

function inkRarityColor(r: number) {
  return INK_RARITY_COLOR[Math.max(0, Math.min(7, r | 0))] ?? INK_RARITY_COLOR[0];
}

const TAB_AXIS: Record<string, string> = {
  fate: "拜山卷",
  mind: "开光卷",
  sect: "山门对照",
  realm: "云游卷",
  dao: "道藏卷",
};


function buildingBreath(state: ReturnType<typeof useGame.getState>, b: (typeof BUILDINGS)[number], lv: number) {
  if (lv <= 0) return b.baseDps;
  const m = multipliers(state);
  const hallMul = 1 + 0.005 * (state.buildings.hall ?? 0);
  const swordExtra = 1 + 0.016 * (state.buildings.sword ?? 0);
  const arrayMul = 1 + 0.012 * (state.buildings.array ?? 0);
  const sword = b.projectile === "sword" ? m.sword * swordExtra : 1;
  const layer = b.id === "array" ? arrayMul : 1;
  return b.baseDps * lv * m.dps * sword * hallMul * layer;
}

function lockHint(bId: string, unlocked: boolean) {
  if (unlocked) return "";
  if (bId === "alchemy") return "机缘未至 · 脉口已开或八层后可显丹灶";
  return "机缘未至";
}

/** HUD 任务进度：开光累计等 damage 浮点不拖长串；大数走 formatNum */
function formatMissionProgress(progress: number, target: number) {
  const p = Math.min(Math.max(0, progress), target);
  const t = Math.max(0, target);
  if (t >= 100) {
    return `${formatNum(Math.floor(p))} / ${formatNum(Math.floor(t))}`;
  }
  if (t > 0 && t < 20 && (p % 1 !== 0 || t % 1 !== 0)) {
    const pct = Math.min(100, Math.floor((p / t) * 100));
    return `${pct}%`;
  }
  return `${Math.floor(p)} / ${Math.floor(t)}`;
}


export function Hud() {
  const qi = useGame((s) => s.qi);
  const jade = useGame((s) => s.jade);
  const herbs = useGame((s) => s.herbs);
  const ore = useGame((s) => s.ore);
  const combo = useGame((s) => s.combo);
  const missions = useGame((s) => s.missions);
  const lab = useGame((s) => s.labUnlocked);
  const tab = useGame((s) => s.tab);
  const disciples = useGame((s) => s.disciples);
  const dps = useGame((s) => totalDps(s));
  const mission = missions.find((m) => m.progress < m.target) ?? missions[0];
  const ready = missions.find((m) => m.progress >= m.target);
  const portrait = disciples[0]
    ? portraitSrc(DISCIPLES.find((d) => d.id === disciples[0].id) ?? "outer")
    : assetUrl("sprites/mascot.png?v=2");

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto flex items-stretch gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => useGame.getState().setMenu(true)}
          className="hud-stat flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden p-0"
          aria-label="宗主"
        >
          <img src={portrait} alt="" className="h-full w-full object-cover object-top" />
        </button>
        {ready ? (
          <button
            type="button"
            onClick={() => useGame.getState().claimMission(ready.id)}
            className="hud-stat flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 px-3 text-left"
          >
            <span className="truncate text-sm font-medium text-ink">{ready.title}</span>
            <span className="shrink-0 text-sm text-seal">领取 · 玉×{ready.rewardJade}</span>
          </button>
        ) : !lab && jade >= 20 ? (
          <button
            type="button"
            onClick={() => useGame.getState().unlockLab()}
            className="hud-stat flex min-h-12 min-w-0 flex-1 items-center px-3 text-left text-sm font-medium text-ink"
          >
            解锁藏经阁
          </button>
        ) : mission ? (
          <div className="hud-stat flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 px-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">{mission.title}</div>
              <div className="text-xs tabular-nums text-muted">
                {formatMissionProgress(mission.progress, mission.target)}
              </div>
            </div>
            <span className="shrink-0 text-xs text-seal">玉×{mission.rewardJade}</span>
          </div>
        ) : (
          <div className="hud-stat min-h-12 flex-1" />
        )}
        <button
          type="button"
          onClick={() => useGame.getState().setMenu(true)}
          className="hud-stat flex h-12 w-12 shrink-0 items-center justify-center"
          aria-label="菜单"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="stroke-ink" aria-hidden>
            <path d="M3 5h12M3 9h12M3 13h12" strokeWidth="1.6" />
          </svg>
        </button>
      </div>

      {/* qi/jade/etc. stay visible while a bottom Sheet tab is open */}
      <div
        className={
          tab === null
            ? "pointer-events-none absolute right-2 top-[4.25rem] flex w-36 flex-col gap-1.5"
            : "pointer-events-none absolute inset-x-2 top-[4.25rem] z-20 flex flex-wrap justify-end gap-1.5"
        }
      >
        {tab === null ? (
          <>
            <div className="hud-stat px-2.5 py-2">
              <div className="text-[10px] tracking-[0.28em] text-muted">香火</div>
              <div className="font-mono text-3xl leading-none tabular-nums text-ink">{formatNum(qi)}</div>
              <div className="mt-1 text-xs tabular-nums text-muted">{formatNum(dps)} 山息/秒</div>
            </div>
            <div className="hud-stat px-2.5 py-2">
              <div className="text-xs tracking-widest text-muted">资粮</div>
              <div className="mt-1 space-y-0.5 text-sm tabular-nums text-ink">
                <div className="flex justify-between">
                  <span className="text-muted">仙玉</span>
                  <span>{formatNum(jade)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">灵草</span>
                  <span>{formatNum(Math.floor(herbs))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">脉晶</span>
                  <span>{formatNum(Math.floor(ore))}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="hud-stat px-2.5 py-1.5">
              <span className="mr-1 text-[10px] tracking-widest text-muted">香火</span>
              <span className="font-mono text-base leading-none tabular-nums text-ink">{formatNum(qi)}</span>
              <span className="ml-1.5 text-[10px] tabular-nums text-muted">{formatNum(dps)} 山息</span>
            </div>
            <div className="hud-stat flex items-center gap-2.5 px-2.5 py-1.5 text-xs tabular-nums text-ink">
              <span>
                <span className="text-muted">仙玉</span> {formatNum(jade)}
              </span>
              <span>
                <span className="text-muted">草</span> {formatNum(Math.floor(herbs))}
              </span>
              <span>
                <span className="text-muted">矿</span> {formatNum(Math.floor(ore))}
              </span>
            </div>
          </>
        )}
      </div>

      {combo > 2 && (
        <div className="pointer-events-none absolute left-3 top-16 font-display text-3xl text-seal">{combo} 开光</div>
      )}
    </div>
  );
}

export function BottomNav() {
  const tab = useGame((s) => s.tab);
  const tutorialStep = useGame((s) => s.tutorialStep);
  const explores = useGame((s) => s.explores);
  const now = Date.now();
  const realmReady = explores.some((slot) => slot && now >= slot.endAt);
  const items: { id: Tab; label: string; mark: string }[] = [
    { id: "fate", label: "拜山", mark: "缘" },
    { id: "mind", label: "开光", mark: "识" },
    { id: "sect", label: "仙山", mark: "山" },
    { id: "realm", label: "云游", mark: "游" },
    { id: "dao", label: "道藏", mark: "道" },
  ];
  return (
    <nav className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <div className="seal-nav">
        {items.map((it) => {
          const on = tab === it.id;
          const pulse = (tutorialStep === 3 && it.id === "fate") || (realmReady && it.id === "realm");
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => useGame.getState().setTab(it.id)}
              className={`seal-chip ${on ? "seal-chip-on" : ""} ${pulse ? "nav-pulse" : ""}`}
            >
              <span className="seal-chip-mark">{it.mark}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function Sheet() {
  const tab = useGame((s) => s.tab);
  if (!tab) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-16 z-30 mx-auto max-w-lg px-2 pb-1">
      <div className="sheet-enter hud-box paper-grain max-h-[48vh] overflow-y-auto bg-paper p-3" data-allow-touch-scroll>
        <div className="sheet-axis sticky top-0 z-10 bg-paper/95">
          <div className="flex items-center gap-2">
            <span className="sheet-axis-knob" aria-hidden />
            <span className="sheet-axis-label">{TAB_AXIS[tab] ?? "对照卷"}</span>
          </div>
          <button
            type="button"
            onClick={() => useGame.getState().setTab(tab)}
            className="flex min-h-9 items-center px-2 text-sm tracking-widest text-muted"
          >
            收起
          </button>
        </div>
        {tab === "sect" && <SectPanel />}
        {tab === "mind" && <MindPanel />}
        {tab === "fate" && <FatePanel />}
        {tab === "realm" && <RealmPanel />}
        {tab === "dao" && <DaoPanel />}
      </div>
    </div>
  );
}

function BuyToggle() {
  const mode = useGame((s) => s.buyMode);
  const opts: BuyMode[] = [1, 10, 100, "max"];
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => useGame.getState().setBuyMode(o)}
          className={`h-7 min-w-9 px-2 text-[11px] ${mode === o ? "bg-ink text-paper" : "bg-paper-2 text-muted"}`}
        >
          {o === "max" ? "最大" : `×${o}`}
        </button>
      ))}
    </div>
  );
}

function SectPanel() {
  const qi = useGame((s) => s.qi);
  const buildings = useGame((s) => s.buildings);
  const mode = useGame((s) => s.buyMode);
  const layer = useGame((s) => s.layer);
  const focus = useGame((s) => s.focusBuilding);
  const bands: { band: 0 | 1 | 2; title: string }[] = [
    { band: 2, title: "山麓 · 烟火" },
    { band: 1, title: "山腰 · 剑阵" },
    { band: 0, title: "近劫 · 接天" },
  ];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">仙山对照</h2>
        <BuyToggle />
      </div>
      <p className="mb-2 text-[11px] text-muted">天道第 {layer + 1} 层 · 主购在山体碑亭，此卷快捷升级</p>
      {bands.map(({ band, title }) => {
        const list = buildingsInBand(band);
        if (!list.length) return null;
        return (
          <div key={band}>
            <div className="band-head">{title}</div>
            <ul className="flex flex-col gap-2">
              {list.map((b) => {
                const i = BUILDINGS.findIndex((x) => x.id === b.id);
                const unlocked = buildingUnlocked(useGame.getState(), i);
                const lv = buildings[b.id] ?? 0;
                const n = mode === "max" ? Math.max(1, maxAffordable(b.id, lv, qi)) : mode;
                const cost = buildingCost(b.id, lv, n);
                const can = unlocked && qi >= cost;
                const tier = buildingTier(lv);
                const next = nextTierAt(lv);
                return (
                  <li
                    key={b.id}
                    className={`flex items-center gap-2 bg-paper-2 p-2 ${unlocked ? "" : "opacity-40"} ${focus === b.id ? "ring-1 ring-seal" : ""}`}
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden border border-ink/15 bg-paper">
                      <img src={`/sprites/building-${b.sprite}.png?v=2`} alt="" className="h-full w-full object-cover object-top" />
                      {tier > 0 && (
                        <span className="absolute bottom-0 right-0 bg-ink px-1 text-[10px] leading-4 text-paper">
                          {tierName(b.id, tier)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{b.name}</span>
                        <span className="text-xs tabular-nums text-muted">Lv.{lv}</span>
                      </div>
                      <div className="line-clamp-1 text-[10px] text-faint">{unlocked ? b.flavor : lockHint(b.id, unlocked)}</div>
                      <div className="text-[11px] tabular-nums text-seal">
                        {formatNum(buildingBreath(useGame.getState(), b, Math.max(1, lv)))} 山息/秒
                        {lv > 0 ? ` · ${perkLine(b.id, lv)}` : ""}
                        {next ? ` · ${next - lv}级进阶` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!can}
                      onClick={() => useGame.getState().buyBuilding(b.id)}
                      className="ink-btn ink-btn-solid shrink-0 px-2 py-2 text-[11px] leading-tight"
                    >
                      {unlocked ? formatNum(cost) : "未开"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MindPanel() {
  const qi = useGame((s) => s.qi);
  const clickUp = useGame((s) => s.clickUp);
  const power = useGame((s) => clickPower(s));
  const cc = useGame((s) => critChance(s));
  return (
    <div>
      <h2 className="mb-1 font-display text-lg text-ink">开光</h2>
      <p className="mb-3 text-[11px] text-muted">
        开光 {formatNum(power)} · 暴机 {(cc * 100).toFixed(0)}%
      </p>
      <ul className="flex flex-col gap-2">
        {CLICK_UPGRADES.map((u) => {
          const lv = clickUp[u.id] ?? 0;
          const maxed = "max" in u && u.max ? lv >= u.max : false;
          const locked = "needSense" in u && u.needSense ? (clickUp.sense ?? 0) < u.needSense : false;
          const cost = clickUpgradeCost(u.id, lv);
          const can = !maxed && !locked && qi >= cost;
          return (
            <li key={u.id} className="flex items-center gap-2 bg-paper-2 p-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium">{u.name}</span>
                  <span className="text-[11px] text-muted">Lv.{lv}</span>
                </div>
                <div className="text-[10px] text-faint">{u.desc}</div>
                {locked && <div className="text-[10px] text-seal">需指尖开光 5 级</div>}
              </div>
              <button
                type="button"
                disabled={!can}
                onClick={() => useGame.getState().buyClick(u.id)}
                className="ink-btn ink-btn-solid shrink-0 px-2 py-2 text-[11px]"
              >
                {maxed ? "已满" : formatNum(cost)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FatePanel() {
  const jade = useGame((s) => s.jade);
  const disciples = useGame((s) => s.disciples);
  const pity = useGame((s) => s.pity);
  const reveal = useGame((s) => s.gachaReveal);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">拜山</h2>
        <span className="text-[11px] text-muted">缘簿余 {40 - pity}</span>
      </div>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          disabled={jade < 10}
          onClick={() => useGame.getState().pull(1)}
          className="ink-btn ink-btn-solid min-h-11 flex-1 py-2 text-[13px]"
        >
          投缘 · 10 缘玉
        </button>
        <button
          type="button"
          disabled={jade < 90}
          onClick={() => useGame.getState().pull(10)}
          className="ink-btn min-h-11 flex-1 py-2 text-[13px]"
        >
          十缘 · 90
        </button>
      </div>
      {reveal && (
        <div className="mb-3 border border-ink/20 bg-paper p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted">此番拜山所得</span>
            <button type="button" className="text-[11px] text-seal" onClick={() => useGame.getState().clearGacha()}>
              收下
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {reveal.map((r, i) => {
              const d = DISCIPLES.find((x) => x.id === r.id);
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className="flex h-20 w-14 items-end overflow-hidden border border-ink/15 bg-paper-2">
                    <PortraitImg d={d ?? "outer"} className="h-20 w-14 object-cover object-top" />
                  </div>
                  <span className="mt-0.5 text-[9px]" style={{ color: inkRarityColor(r.rarity) }}>
                    {d?.name}
                  </span>
                  {r.isNew && r.rarity >= 3 ? (
                    <span className="text-[8px] text-seal">新 · {d?.title}</span>
                  ) : r.isNew ? (
                    <span className="text-[8px] text-muted">新</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {disciples.length === 0 ? (
        <p className="text-xs text-muted">尚未有人拜山。破层可得仙玉。</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {disciples
            .slice()
            .sort((a, b) => {
              const da = DISCIPLES.find((d) => d.id === a.id);
              const db = DISCIPLES.find((d) => d.id === b.id);
              return (db?.rarity ?? 0) - (da?.rarity ?? 0);
            })
            .map((o) => {
              const d = DISCIPLES.find((x) => x.id === o.id);
              if (!d) return null;
              return (
                <li key={o.id} className="flex items-center gap-2 bg-paper-2 p-2">
                  <div className="h-16 w-12 shrink-0 overflow-hidden border border-ink/15 bg-paper">
                    <PortraitImg d={d} className="h-16 w-12 object-cover object-top" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink">
                      {d.name}
                      {o.stars > 0 ? ` · ${o.stars}印` : ""}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                      <span className="rarity-stamp" style={{ color: inkRarityColor(d.rarity) }}>
                        {RARITY[d.rarity]}
                      </span>
                      <span>{d.title}{d.rarity >= 3 ? " · 御剑" : ""}</span>
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

/** 立绘分级：g2=普通档，g3=高稀有档；未列出的沿用原图（从简档） */
const PORTRAIT_GRADE: Record<string, "g2" | "g3"> = {
  chiyun: "g2",
  xiaohua: "g2",
  qinghe: "g3",
  jianjiu: "g3",
  xuantian: "g3",
  chuchen: "g3",
};

function portraitSrc(d: { sprite: string; portrait?: string } | string) {
  if (typeof d === "string") {
    if (d === "mascot") return assetUrl("sprites/mascot.png?v=2");
    return assetUrl(`sprites/disciple-${d}.png?v=2`);
  }
  // Portraits are optional on lean Pages deploy; disciple sprites always ship.
  if (d.portrait) {
    const g = PORTRAIT_GRADE[d.portrait];
    const file = g
      ? `sprites/portrait-${d.portrait}_${g}.jpg?v=7`
      : `sprites/portrait-${d.portrait}.jpg?v=6`;
    return assetUrl(file);
  }
  if (d.sprite === "mascot") return assetUrl("sprites/mascot.png?v=2");
  return assetUrl(`sprites/disciple-${d.sprite}.png?v=2`);
}

function PortraitImg({ d, className }: { d: { sprite: string; portrait?: string } | string; className?: string }) {
  const primary = portraitSrc(d);
  const fallback =
    typeof d === "string"
      ? assetUrl(d === "mascot" ? "sprites/mascot.png?v=2" : `sprites/disciple-${d}.png?v=2`)
      : assetUrl(d.sprite === "mascot" ? "sprites/mascot.png?v=2" : `sprites/disciple-${d.sprite}.png?v=2`);
  return (
    <img
      src={primary}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fallback === "1") return;
        el.dataset.fallback = "1";
        el.src = fallback;
      }}
    />
  );
}

function RealmPanel() {
  const explores = useGame((s) => s.explores);
  const layer = useGame((s) => s.layer);
  const now = Date.now();
  return (
    <div>
      <h2 className="mb-1 font-display text-lg text-ink">云游</h2>
      <p className="mb-3 text-[11px] text-muted">派山门中人云游闭关。云阶灯火亮起后可多开一路。</p>
      <div className="mb-3 flex flex-col gap-2">
        {explores.map((slot, i) => (
          <div key={i} className="bg-paper-2 p-2">
            <div className="mb-1 text-[11px] text-muted">第 {i + 1} 路</div>
            {!slot ? (
              <div className="flex flex-wrap gap-1">
                {REALMS.map((r) => {
                  const locked = layer < r.unlockLayer;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={locked}
                      onClick={() => useGame.getState().startExplore(i, r.id)}
                      className="ink-btn min-h-9 px-2 py-1 text-[11px]"
                    >
                      {locked ? `${r.name} · ${r.unlockLayer}层` : `${r.name} · ${formatTime(r.duration)}`}
                    </button>
                  );
                })}
              </div>
            ) : now >= slot.endAt ? (
              <button
                type="button"
                onClick={() => useGame.getState().claimExplore(i)}
                className="ink-btn ink-btn-solid min-h-11 w-full py-2 text-[13px]"
              >
                云游归来
              </button>
            ) : (
              <div className="text-xs text-ink-2">
                {REALMS.find((r) => r.id === slot.realmId)?.name} · 剩余 {formatTime((slot.endAt - now) / 1000)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DaoPanel() {
  const dao = useGame((s) => s.daoFruit);
  const skills = useGame((s) => s.skills);
  const lab = useGame((s) => s.labUnlocked);
  const crafts = useGame((s) => s.crafts);
  const alchemy = useGame((s) => s.buildings.alchemy ?? 0);
  const totalDamage = useGame((s) => s.totalDamage);
  const prestigeCount = useGame((s) => s.prestigeCount);
  const fruit = prestigeFruit(totalDamage, multipliers(useGame.getState()).dao);
  const jade = useGame((s) => s.jade);
  const herbs = useGame((s) => s.herbs);
  const ore = useGame((s) => s.ore);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg text-ink">劫后归山</h2>
        <p className="mb-2 text-[11px] text-muted">
          已归山 {prestigeCount} 次 · 本次可得道果 {fruit || "—"}
        </p>
        <button
          type="button"
          disabled={fruit < 1}
          onClick={() => useGame.getState().prestige()}
          className="ink-btn ink-btn-solid min-h-11 w-full py-2 text-[13px]"
        >
          {fruit < 1 ? "山息未满，不可归山" : `劫后归山 · 得 ${fruit} 道果`}
        </button>
        <p className="mt-1 text-[10px] text-faint">重置山势印记与香火，保留弟子、功法与部分仙玉。</p>
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-medium text-ink">功法 · 道果 {formatNum(dao)}</h3>
        {!lab && (
          <button
            type="button"
            disabled={jade < 20}
            onClick={() => useGame.getState().unlockLab()}
            className="ink-btn mb-2 min-h-11 w-full py-2 text-xs"
          >
            花费 20 仙玉解锁藏经阁
          </button>
        )}
        <ul className="flex flex-col gap-2">
          {SKILLS.map((sk) => {
            const lv = skills[sk.id] ?? 0;
            const cost = skillCost(sk.id, lv);
            const can = lab && lv < sk.max && dao >= cost;
            return (
              <li key={sk.id} className="flex items-center gap-2 bg-paper-2 p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-xs">
                    <span>{sk.name}</span>
                    <span className="text-muted">
                      {lv}/{sk.max}
                    </span>
                  </div>
                  <div className="text-[10px] text-faint">{sk.desc}</div>
                </div>
                <button
                  type="button"
                  disabled={!can}
                  onClick={() => useGame.getState().buySkill(sk.id)}
                  className="ink-btn shrink-0 px-2 py-1 text-[11px]"
                >
                  {lv >= sk.max ? "已满" : `${cost} 果`}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-medium text-ink">炼器</h3>
        {alchemy < 1 ? (
          <p className="text-[11px] text-muted">建起瀑侧丹灶后方可炼制法宝。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {CRAFTS.map((c) => {
              const lv = crafts[c.id] ?? 0;
              const can = lv < c.max && herbs >= c.herbs && ore >= c.ore && jade >= c.jade;
              return (
                <li key={c.id} className="flex items-center gap-2 bg-paper-2 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs">
                      {c.name} · {lv}/{c.max}
                    </div>
                    <div className="text-[10px] text-faint">
                      {c.desc} · 草{c.herbs} 矿{c.ore} 玉{c.jade}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => useGame.getState().craft(c.id)}
                    className="ink-btn shrink-0 px-2 py-1 text-[11px]"
                  >
                    炼
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function TitleScreen() {
  const go = () => useGame.getState().startGame();
  // 标题五连击开测试模式（隐藏入口）
  const taps = useRef<number[]>([]);
  const onTitleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      const st = useGame.getState();
      st.setDebug(true);
      st.pushToast("测试模式已开启 · 进山后点右下「试」");
    }
  };
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-t from-ink/60 via-ink/15 to-transparent px-6 text-center"
      onClick={go}
    >
      <div className="hud-box paper-grain w-full max-w-sm px-6 py-7">
        <p className="title-line text-[11px] tracking-[0.55em] text-muted" style={{ animationDelay: "0ms" }}>
          天劫未散
        </p>
        <h1
          className="title-line mt-3 font-display text-5xl tracking-[0.28em] text-ink"
          style={{ animationDelay: "80ms" }}
          onClick={onTitleTap}
        >
          仙途点修
        </h1>
        <div className="title-line mt-5 space-y-1.5 text-base leading-relaxed text-ink-2" style={{ animationDelay: "180ms" }}>
          <p>你以凡躯立于劫云之下。</p>
          <p>开光劫云，立门开山，</p>
          <p>拜山投缘，香火伐劫。</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go();
          }}
          className="title-line ink-btn ink-btn-solid mt-7 min-h-12 min-w-44 px-8 py-3 text-base tracking-[0.3em]"
          style={{ animationDelay: "320ms" }}
        >
          开启仙途
        </button>
      </div>
    </div>
  );
}

const TUTORIAL: { title: string; body: string; cls: string }[] = [
  { title: "", body: "", cls: "" },
  { title: "指尖开光", body: "点山中任意处，给空峰开光。连点积「开光连势」。", cls: "left-3 top-[22%]" },
  { title: "落下第一印", body: "滑山找到山麓香案虚印，点碑落「开山香案」。", cls: "left-[8%] top-[46%]" },
  { title: "拜山投缘", body: "点底栏「拜山」，用缘玉请人上山。", cls: "inset-x-4 bottom-28" },
  { title: "香火自燃", body: "云阶亮起后山门会替你开光；金丹以上可御剑绕劫云。", cls: "left-3 top-[46%]" },
];

export function TutorialCoach() {
  const step = useGame((s) => s.tutorialStep);
  const started = useGame((s) => s.started);
  useEffect(() => {
    if (step !== 4) return;
    const t = window.setTimeout(() => useGame.getState().finishTutorial(), 5200);
    return () => window.clearTimeout(t);
  }, [step]);
  if (!started || step < 1 || step > 4) return null;
  const t = TUTORIAL[step];
  return (
    <div className={`pointer-events-none absolute z-30 ${t.cls}`}>
      <div className="coach-card pointer-events-auto max-w-56 px-3 py-2.5">
        <div className="font-display text-sm text-ink">{t.title}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{t.body}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] tabular-nums text-faint">{step} / 4</span>
          <button
            type="button"
            className="text-[11px] text-seal"
            onClick={() => useGame.getState().skipTutorial()}
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuSheet() {
  const open = useGame((s) => s.menuOpen);
  const sfxOn = useGame((s) => s.sfxOn);
  const shakeOn = useGame((s) => s.shakeOn);
  const daoFruit = useGame((s) => s.daoFruit);
  const prestigeCount = useGame((s) => s.prestigeCount);
  const wipe = useGame((s) => s.toasts.some((t) => t.text === "再点一次废弃存档"));
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-ink/35 px-3 pb-20">
      <button type="button" className="absolute inset-0" aria-label="关闭" onClick={() => useGame.getState().setMenu(false)} />
      <div className="hud-box paper-grain relative w-full max-w-sm p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg">宗主</h2>
          <button type="button" className="min-h-10 px-2 text-sm tracking-widest text-muted" onClick={() => useGame.getState().setMenu(false)}>
            关闭
          </button>
        </div>
        <p className="mb-3 text-[11px] text-muted">
          已归山 {prestigeCount} 次 · 道果 {formatNum(daoFruit)}
        </p>
        <label className="flex min-h-11 items-center justify-between text-xs">
          音效
          <input type="checkbox" checked={sfxOn} onChange={(e) => useGame.getState().setSfx(e.target.checked)} />
        </label>
        <label className="flex min-h-11 items-center justify-between text-xs">
          震屏
          <input type="checkbox" checked={shakeOn} onChange={(e) => useGame.getState().setShake(e.target.checked)} />
        </label>
        <button
          type="button"
          onClick={() => {
            useGame.getState().setMenu(false);
            useGame.getState().setTab("dao");
          }}
          className="ink-btn mt-2 min-h-11 w-full py-2 text-xs"
        >
          渡劫与功法
        </button>
        <button
          type="button"
          onClick={() => {
            const g = useGame.getState();
            if (wipe) g.resetSave();
            else g.pushToast("再点一次废弃存档");
          }}
          className="ink-btn mt-2 min-h-11 w-full py-2 text-xs text-danger"
        >
          废弃存档
        </button>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-40 mx-auto flex max-w-sm flex-col items-center gap-1">
      {toasts.map((t) => (
        <div key={t.id} className="toast-pop border border-ink/35 bg-paper/95 px-3 py-1.5 text-xs text-ink">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function OfflineModal() {
  const gift = useGame((s) => s.offlineGift);
  if (!gift) return null;
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-ink/40 px-6"
      onPointerUp={() => useGame.getState().dismissOffline()}
    >
      <div className="hud-box w-full max-w-sm p-5 text-center" onPointerUp={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl">闭关归来</h2>
        <p className="mt-2 text-[13px] text-muted">
          离山 {formatTime(gift.sec)}，山门代收香火 {formatNum(gift.qi)}
        </p>
        <button
          type="button"
          onPointerUp={() => useGame.getState().dismissOffline()}
          className="ink-btn ink-btn-solid mt-4 min-h-11 w-full py-2"
        >
          收下
        </button>
      </div>
    </div>
  );
}

const CHEATS = [
  { kind: "qi", label: "香火+100亿" },
  { kind: "jade", label: "仙玉+2000" },
  { kind: "fruit", label: "道果+100" },
  { kind: "buildings", label: "全建筑40级" },
  { kind: "layer10", label: "劫层+10" },
  { kind: "layer50", label: "直达50层" },
  { kind: "unlock", label: "系统全开" },
  { kind: "prestige", label: "强行渡劫" },
] as const;

// 测试外挂面板:debug 模式下右下角「试」字浮钮进入,正式服隐藏
export function DebugPanel() {
  const debug = useGame((s) => s.debug);
  const [open, setOpen] = useState(false);
  if (!debug) return null;
  return (
    <>
      <button
        type="button"
        aria-label="测试面板"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute bottom-24 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-seal/50 bg-ink/70 font-display text-lg text-paper shadow-lg"
      >
        试
      </button>
      {open && (
        <div
          className="pointer-events-auto absolute inset-0 z-[70] flex items-end justify-center bg-ink/45 px-4 pb-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="hud-box w-full max-w-sm p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">测试外挂</h2>
              <button
                type="button"
                className="text-xs text-muted underline"
                onClick={() => {
                  useGame.getState().setDebug(false);
                  setOpen(false);
                }}
              >
                关闭测试模式
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">仅测试期使用,不影响正式存档结构</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {CHEATS.map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  className="ink-btn min-h-11 px-3 py-2 text-sm"
                  onClick={() => useGame.getState().cheat(c.kind)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ink-btn ink-btn-solid mt-3 min-h-11 w-full py-2"
              onClick={() => setOpen(false)}
            >
              收起
            </button>
          </div>
        </div>
      )}
    </>
  );
}
