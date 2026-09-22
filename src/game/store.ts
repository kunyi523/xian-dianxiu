import { create } from "zustand";
import { BUILDINGS, CLICK_UPGRADES, CRAFTS, DISCIPLES, HERB_PER_MIN_PER_LV, ORE_PER_MIN_PER_LV, REALMS, SKILLS } from "./data";
import { juice } from "./juice";
import { sfx, setSfxEnabled } from "./audio";
import { buildingTier, tierName } from "./ink";
import {
  autoCps,
  buildingCost,
  buildingUnlocked,
  clickPower,
  clickUpgradeCost,
  critChance,
  critMult,
  exploreLoot,
  gachaRoll,
  layerHp,
  maxAffordable,
  multipliers,
  prestigeFruit,
  skillCost,
  startQiAfterPrestige,
  totalDps,
  tribulationNeed,
} from "./sim";

export type Tab = "sect" | "mind" | "fate" | "realm" | "dao" | null;
export type BuyMode = 1 | 10 | 100 | "max";

export type Mission = {
  id: string;
  title: string;
  kind: "clicks" | "building" | "damage" | "pulls" | "layers" | "explore" | "lab";
  target: number;
  progress: number;
  rewardJade: number;
  buildingId?: string;
};

export type OwnedDisciple = { id: string; stars: number };
export type ExploreSlot = { realmId: string; endAt: number } | null;

export type GameState = {
  version: number;
  qi: number;
  jade: number;
  herbs: number;
  ore: number;
  daoFruit: number;
  totalDamage: number;
  lifetimeDamage: number;
  layer: number;
  layerHp: number;
  tribulation: number;
  tribFilled: number;
  buildings: Record<string, number>;
  clickUp: Record<string, number>;
  disciples: OwnedDisciple[];
  skills: Record<string, number>;
  crafts: Record<string, number>;
  explores: ExploreSlot[];
  missions: Mission[];
  pity: number;
  pulls: number;
  clickCount: number;
  layersBroken: number;
  exploresDone: number;
  prestigeCount: number;
  labUnlocked: boolean;
  lastSave: number;
  started: boolean;
  seenTitle: boolean;
  tutorialStep: number;
  combo: number;
  lastClickAt: number;
  autoAcc: number;
  sfxOn: boolean;
  shakeOn: boolean;
};

export type GameStore = GameState & {
  tab: Tab;
  buyMode: BuyMode;
  focusBuilding: string | null;
  gachaReveal: { id: string; rarity: number; isNew: boolean }[] | null;
  toasts: { id: number; text: string }[];
  offlineGift: { sec: number; qi: number } | null;
  menuOpen: boolean;
  hydrate: () => void;
  persist: () => void;
  setTab: (t: Tab) => void;
  openSect: (id: string) => void;
  setBuyMode: (m: BuyMode) => void;
  startGame: () => void;
  skipTutorial: () => void;
  finishTutorial: () => void;
  setMenu: (v: boolean) => void;
  dismissOffline: () => void;
  click: (nx: number, ny: number, auto?: boolean) => void;
  collectOrb: (nx: number, ny: number) => void;
  tick: (dt: number) => void;
  buyBuilding: (id: string) => void;
  buyClick: (id: string) => void;
  pull: (count: number) => void;
  clearGacha: () => void;
  startExplore: (slot: number, realmId: string) => void;
  claimExplore: (slot: number) => void;
  buySkill: (id: string) => void;
  craft: (id: string) => void;
  claimMission: (id: string) => void;
  unlockLab: () => void;
  prestige: () => void;
  resetSave: () => void;
  setSfx: (v: boolean) => void;
  setShake: (v: boolean) => void;
  pushToast: (text: string) => void;
  // 测试外挂:不进存档,localStorage xian-debug 持久开关
  debug: boolean;
  setDebug: (v: boolean) => void;
  cheat: (kind: "qi" | "jade" | "fruit" | "buildings" | "layer10" | "layer50" | "unlock" | "prestige") => void;
};

const SAVE_KEY = "xian-clicker-v1";
const SAVE_VERSION = 1;
let toastSeq = 1;

function emptyBuildings(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const b of BUILDINGS) o[b.id] = 0;
  return o;
}

export function defaultState(): GameState {
  return {
    version: SAVE_VERSION,
    qi: 0,
    jade: 12,
    herbs: 0,
    ore: 0,
    daoFruit: 0,
    totalDamage: 0,
    lifetimeDamage: 0,
    layer: 0,
    layerHp: layerHp(0),
    tribulation: 0,
    tribFilled: 0,
    buildings: emptyBuildings(),
    clickUp: { sense: 0, critC: 0, critD: 0, auto: 0 },
    disciples: [],
    skills: {},
    crafts: {},
    explores: [null],
    missions: starterMissions(),
    pity: 0,
    pulls: 0,
    clickCount: 0,
    layersBroken: 0,
    exploresDone: 0,
    prestigeCount: 0,
    labUnlocked: false,
    lastSave: Date.now(),
    started: false,
    seenTitle: false,
    tutorialStep: 0,
    combo: 0,
    lastClickAt: 0,
    autoAcc: 0,
    sfxOn: true,
    shakeOn: true,
  };
}

function starterMissions(): Mission[] {
  return [
    { id: "m1", title: "开光劫云 20 次", kind: "clicks", target: 20, progress: 0, rewardJade: 6 },
    { id: "m2", title: "点燃开山香案", kind: "building", target: 1, progress: 0, rewardJade: 8, buildingId: "hall" },
    { id: "m3", title: "揭开一层劫云", kind: "layers", target: 1, progress: 0, rewardJade: 8 },
  ];
}

function rollMission(state: GameState): Mission {
  const templates: Mission[] = [
    {
      id: "",
      title: `开光 ${50 + state.prestigeCount * 20} 次`,
      kind: "clicks",
      target: 50 + state.prestigeCount * 20,
      progress: 0,
      rewardJade: 6,
    },
    { id: "", title: "揭开 3 层劫云", kind: "layers", target: 3, progress: 0, rewardJade: 8 },
    { id: "", title: "拜山投缘 1 次", kind: "pulls", target: 1, progress: 0, rewardJade: 5 },
    { id: "", title: "完成云游 1 次", kind: "explore", target: 1, progress: 0, rewardJade: 6 },
    {
      id: "",
      title: `开光累计 ${formatShort(2000 * Math.pow(4, state.prestigeCount))} 山息`,
      kind: "damage",
      target: 2000 * Math.pow(4, state.prestigeCount),
      progress: 0,
      rewardJade: 10,
    },
  ];
  const owned = BUILDINGS.filter((b, i) => i === 0 || (state.buildings[BUILDINGS[i - 1].id] ?? 0) > 0);
  const b = owned[Math.floor(Math.random() * owned.length)];
  const nextLv = (state.buildings[b.id] ?? 0) + 3 + Math.floor(Math.random() * 5);
  templates.push({
    id: "",
    title: `将${b.name}升至 ${nextLv} 级`,
    kind: "building",
    target: nextLv,
    progress: state.buildings[b.id] ?? 0,
    rewardJade: 8 + Math.floor(nextLv / 5),
    buildingId: b.id,
  });
  if (!state.labUnlocked) {
    templates.push({ id: "", title: "开封藏经阁", kind: "lab", target: 1, progress: 0, rewardJade: 12 });
  }
  const m = templates[Math.floor(Math.random() * templates.length)];
  m.id = "m" + Math.random().toString(36).slice(2, 8);
  return m;
}

function formatShort(n: number) {
  if (n >= 1e8) return n / 1e8 + "亿";
  if (n >= 1e4) return n / 1e4 + "万";
  return String(n);
}

function applyDamage(s: GameState, amount: number) {
  s.qi += amount;
  s.totalDamage += amount;
  s.lifetimeDamage += amount;
  s.layerHp -= amount;
  s.tribulation += amount;
  let guard = 0;
  let broke = 0;
  while (s.layerHp <= 0 && guard++ < 24) {
    s.layer += 1;
    s.layersBroken += 1;
    s.layerHp += layerHp(s.layer);
    const jade = 1 + Math.floor(Math.random() * 3) + (Math.random() < multipliers(s).jade - 1 ? 1 : 0);
    s.jade += jade;
    if (Math.random() < 0.45) s.herbs += 1 + Math.floor(Math.random() * 2);
    if (Math.random() < 0.35) s.ore += 1;
    bumpMissions(s, "layers", 1);
    broke += 1;
  }
  if (broke > 0) {
    // 一次结算只播一次破层反馈,避免大额伤害叠 24 个钟声
    juice.emit({ t: "layer", layer: s.layer });
    if (s.sfxOn) sfx.layer();
  }
  if (s.layerHp <= 0) s.layerHp = layerHp(s.layer);
  while (true) {
    const need = tribulationNeed(s.tribFilled);
    if (s.tribulation < need) break;
    s.tribulation -= need;
    s.tribFilled += 1;
    const gain = 1 + (Math.random() < multipliers(s).dao ? 1 : 0);
    s.daoFruit += gain;
  }
  bumpMissions(s, "damage", amount);
}

function bumpTutorial(s: GameState) {
  if (s.tutorialStep <= 0 || s.tutorialStep >= 5) return;
  let step = s.tutorialStep;
  if (step === 1 && s.clickCount >= 8) step = 2;
  if (step === 2 && (s.buildings.hall ?? 0) >= 1) step = 3;
  if (step === 3 && s.disciples.length >= 1) step = 4;
  s.tutorialStep = step;
}

function bumpMissions(s: GameState, kind: Mission["kind"], amount: number, buildingId?: string) {
  for (const m of s.missions) {
    if (m.kind !== kind) continue;
    if (m.kind === "building") {
      if (buildingId && m.buildingId === buildingId) m.progress = s.buildings[buildingId] ?? 0;
      continue;
    }
    if (m.kind === "lab") {
      m.progress = s.labUnlocked ? 1 : 0;
      continue;
    }
    m.progress = Math.min(m.target, m.progress + amount);
  }
}

function persistNow(s: GameState) {
  try {
    const base = defaultState();
    const blob: Record<string, unknown> = {};
    for (const k of Object.keys(base) as (keyof GameState)[]) blob[k] = s[k];
    blob.lastSave = Date.now();
    blob.combo = 0;
    blob.autoAcc = 0;
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    localStorage.setItem(SAVE_KEY + ":bak", JSON.stringify(blob));
  } catch {
    /* private mode */
  }
}

let saveTimer = 0;
let hudTimer = 0;

// flush 差分:只把变化的字段 set 进 store,避免 8Hz 全量重渲染所有订阅组件
const lastFlushSig = new Map<string, string>();
function sig(v: unknown): string {
  if (v === null || typeof v !== "object") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function flush(set: (p: Partial<GameStore>) => void, s: GameStore) {
  const full = {
    qi: s.qi,
    jade: s.jade,
    herbs: s.herbs,
    ore: s.ore,
    daoFruit: s.daoFruit,
    totalDamage: s.totalDamage,
    lifetimeDamage: s.lifetimeDamage,
    layer: s.layer,
    layerHp: s.layerHp,
    tribulation: s.tribulation,
    tribFilled: s.tribFilled,
    buildings: { ...s.buildings },
    clickUp: { ...s.clickUp },
    disciples: s.disciples.map((d) => ({ ...d })),
    skills: { ...s.skills },
    crafts: { ...s.crafts },
    explores: s.explores.slice(),
    missions: s.missions.map((m) => ({ ...m })),
    pity: s.pity,
    pulls: s.pulls,
    clickCount: s.clickCount,
    layersBroken: s.layersBroken,
    exploresDone: s.exploresDone,
    prestigeCount: s.prestigeCount,
    labUnlocked: s.labUnlocked,
    lastSave: s.lastSave,
    started: s.started,
    seenTitle: s.seenTitle,
    tutorialStep: s.tutorialStep,
    combo: s.combo,
    lastClickAt: s.lastClickAt,
    autoAcc: s.autoAcc,
    sfxOn: s.sfxOn,
    shakeOn: s.shakeOn,
  };
  const partial: Partial<GameStore> = {};
  let any = false;
  for (const k of Object.keys(full) as (keyof typeof full)[]) {
    const sg = sig(full[k]);
    if (lastFlushSig.get(k) !== sg) {
      lastFlushSig.set(k, sg);
      (partial as Record<string, unknown>)[k] = full[k];
      any = true;
    }
  }
  if (any) set(partial);
}

export const useGame = create<GameStore>((set, get) => ({
  ...defaultState(),
  tab: null,
  buyMode: 1,
  focusBuilding: null,
  gachaReveal: null,
  toasts: [],
  offlineGift: null,
  menuOpen: false,
  debug:
    typeof localStorage !== "undefined" &&
    (() => {
      try {
        return localStorage.getItem("xian-debug") === "1";
      } catch {
        return false;
      }
    })(),

  hydrate() {
    try {
      const tryParse = (key: string): Partial<GameState> | null => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as Partial<GameState>) : null;
        } catch {
          return null;
        }
      };
      // 主存档损坏时回退读备份,都坏才重置
      const loaded: Partial<GameState> | null = tryParse(SAVE_KEY) ?? tryParse(SAVE_KEY + ":bak");
      const base = defaultState();
      const next: GameState = {
        ...base,
        ...loaded,
        version: SAVE_VERSION,
        buildings: { ...base.buildings, ...loaded?.buildings },
        clickUp: { ...base.clickUp, ...loaded?.clickUp },
        skills: { ...base.skills, ...loaded?.skills },
        crafts: { ...base.crafts, ...loaded?.crafts },
      };
      if (!next.missions?.length) next.missions = starterMissions();
      else {
        for (const m of next.missions) {
          if (m.kind === "building" && m.buildingId) {
            m.progress = Math.min(m.target, next.buildings[m.buildingId] ?? 0);
          }
          if (m.kind === "lab") m.progress = next.labUnlocked ? 1 : 0;
        }
      }
      if (!next.explores?.length) next.explores = [null];
      if (typeof next.tutorialStep !== "number" || next.tutorialStep < 0 || next.tutorialStep > 5) {
        next.tutorialStep = next.started ? 5 : 0;
      }
      const elapsed = Math.max(0, Date.now() - (next.lastSave || Date.now()));
      const cap = 8 * 3600 * 1000;
      const dt = Math.min(elapsed, cap) / 1000;
      let gift: { sec: number; qi: number } | null = null;
      if (dt > 15 && next.started) {
        const dps = totalDps(next);
        const qi = dps * dt * multipliers(next).offline * 0.5;
        next.qi += qi;
        // 离线收益只加香火:不计入 totalDamage,否则挂机可白嫖转生道果
        next.lifetimeDamage += qi;
        gift = { sec: dt, qi };
      }
      sfx.unlock();
      setSfxEnabled(next.sfxOn !== false);
      const live = get();
      set({
        ...next,
        started: live.started || next.started,
        seenTitle: live.seenTitle || next.seenTitle,
        tutorialStep: live.started ? live.tutorialStep : next.tutorialStep,
        tab: null,
        buyMode: 1,
        focusBuilding: null,
        gachaReveal: null,
        toasts: [],
        menuOpen: false,
        offlineGift: live.started ? null : gift,
        lastSave: Date.now(),
      });
    } catch {
      set({
        ...defaultState(),
        tab: null,
        buyMode: 1,
        focusBuilding: null,
        gachaReveal: null,
        toasts: [],
        menuOpen: false,
        offlineGift: null,
      });
    }
  },

  persist() {
    persistNow(get());
  },

  setTab(t) {
    const cur = get().tab;
    if (cur === t) set({ tab: null, focusBuilding: null });
    else set({ tab: t, focusBuilding: t === "sect" ? get().focusBuilding : null });
  },
  openSect(id) {
    set({ tab: "sect", focusBuilding: id });
  },
  setBuyMode(m) {
    set({ buyMode: m });
  },
  startGame() {
    const step = get().tutorialStep === 0 ? 1 : get().tutorialStep;
    set({ started: true, seenTitle: true, tutorialStep: step, menuOpen: false, tab: null, gachaReveal: null });
    sfx.unlock();
    persistNow(get());
  },
  skipTutorial() {
    set({ tutorialStep: 5, focusBuilding: null });
    persistNow(get());
  },
  finishTutorial() {
    set({ tutorialStep: 5, focusBuilding: null });
    persistNow(get());
  },
  setMenu(v) {
    set({ menuOpen: v, tab: v ? null : get().tab });
  },
  dismissOffline() {
    set({ offlineGift: null });
  },

  click(nx, ny, auto = false) {
    const s = get();
    if (!s.started) return;
    const now = performance.now();
    let combo = s.combo;
    if (!auto) {
      combo = now - s.lastClickAt < 380 ? Math.min(24, combo + 1) : 1;
    }
    const power = clickPower(s);
    const crit = Math.random() < critChance(s);
    const comboMul = 1 + combo * 0.04;
    const amount = power * comboMul * (crit ? critMult(s) : 1);
    s.combo = combo;
    s.lastClickAt = auto ? s.lastClickAt : now;
    s.clickCount = s.clickCount + (auto ? 0 : 1);
    applyDamage(s, amount);
    if (!auto) bumpMissions(s, "clicks", 1);
    bumpTutorial(s);
    // 不在这里 flush:tick 的 hudTimer 会以 8Hz 批量同步,高频连点不再每次全量刷新
    if (s.tutorialStep === 2) set({ focusBuilding: "hall" });
    juice.emit({ t: "click", x: nx, y: ny, n: amount, crit });
    // auto: always emit juice floaters; SFX only on crit (mute-friendly)
    if (s.sfxOn && (!auto || crit)) sfx.click(crit);
  },

  collectOrb(nx, ny) {
    const s = get();
    const m = multipliers(s);
    const amount = Math.max(clickPower(s) * 40, totalDps(s) * 8, 25);
    applyDamage(s, amount);
    s.jade += Math.random() < 0.5 * m.jade ? 1 : 0;
    flush(set, s);
    juice.emit({ t: "orb" });
    juice.emit({ t: "click", x: nx, y: ny, n: amount, crit: true });
    if (s.sfxOn) sfx.orb();
    get().pushToast(`仙果 · 香火 +${Math.floor(amount)}`);
  },

  tick(dt) {
    const s = get();
    if (!s.started) return;
    const capped = Math.min(dt, 0.1);
    const dps = totalDps(s);
    if (dps > 0) applyDamage(s, dps * capped);
    const mineLv = s.buildings.mine ?? 0;
    if (mineLv > 0) s.ore += (mineLv * ORE_PER_MIN_PER_LV * capped) / 60;
    const alchLv = s.buildings.alchemy ?? 0;
    if (alchLv > 0) s.herbs += (alchLv * HERB_PER_MIN_PER_LV * capped) / 60;
    const cps = autoCps(s);
    if (cps > 0) {
      s.autoAcc += cps * capped;
      while (s.autoAcc >= 1) {
        s.autoAcc -= 1;
        // share crit / juice with manual click; coords near 劫核
        get().click(0.5 + (Math.random() - 0.5) * 0.06, 0.42 + (Math.random() - 0.5) * 0.05, true);
      }
    }
    if (s.combo > 0 && performance.now() - s.lastClickAt > 700) s.combo = 0;
    const houseLv = s.buildings.house ?? 0;
    const slots = 1 + (houseLv >= 3 ? 1 : 0) + (mineLv >= 1 ? 1 : 0);
    while (s.explores.length < slots) s.explores.push(null);
    for (const m of s.missions) {
      if (m.kind === "building" && m.buildingId) {
        m.progress = Math.min(m.target, s.buildings[m.buildingId] ?? 0);
      }
    }
    hudTimer += capped;
    if (hudTimer > 0.12) {
      hudTimer = 0;
      flush(set, s);
    }
    saveTimer += capped;
    if (saveTimer > 4) {
      saveTimer = 0;
      persistNow(s);
    }
  },

  buyBuilding(id) {
    const s = get();
    const idx = BUILDINGS.findIndex((b) => b.id === id);
    if (idx < 0 || !buildingUnlocked(s, idx)) return;
    const lv = s.buildings[id] ?? 0;
    const mode = get().buyMode;
    const n = mode === "max" ? Math.max(1, maxAffordable(id, lv, s.qi)) : mode;
    const cost = buildingCost(id, lv, n);
    if (s.qi < cost || n < 1) return;
    s.qi -= cost;
    s.buildings[id] = lv + n;
    bumpMissions(s, "building", n, id);
    bumpTutorial(s);
    flush(set, s);
    persistNow(s);
    const nextT = buildingTier(lv + n);
    const prevT = buildingTier(lv);
    const def = BUILDINGS.find((b) => b.id === id);
    juice.emit({ t: "upgrade", id, tierUp: nextT > prevT, name: def?.name });
    if (s.sfxOn) sfx.upgrade();
    if (nextT > prevT) {
      get().pushToast(`${def?.name ?? ""} 进阶 · ${tierName(id, nextT)}`);
    }
  },

  buyClick(id) {
    const s = get();
    const def = CLICK_UPGRADES.find((u) => u.id === id);
    if (!def) return;
    const lv = s.clickUp[id] ?? 0;
    if ("max" in def && def.max && lv >= def.max) return;
    if ("needSense" in def && def.needSense && (s.clickUp.sense ?? 0) < def.needSense) return;
    const cost = clickUpgradeCost(id, lv);
    if (s.qi < cost) return;
    s.qi -= cost;
    s.clickUp[id] = lv + 1;
    flush(set, s);
    juice.emit({ t: "upgrade" });
    if (s.sfxOn) sfx.upgrade();
  },

  pull(count) {
    const s = get();
    const price = count === 10 ? 90 : 10 * count;
    if (s.jade < price) return;
    s.jade -= price;
    const rareBonus = Math.max(0, multipliers(s).jade - 1);
    const reveal: { id: string; rarity: number; isNew: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      let rolled = gachaRoll(rareBonus);
      s.pity += 1;
      if (s.pity >= 40 && rolled.rarity < 3) {
        const pool = DISCIPLES.filter((d) => d.rarity >= 3);
        const def = pool[Math.floor(Math.random() * pool.length)] ?? DISCIPLES[0];
        rolled = { def, rarity: def.rarity };
      }
      if (rolled.rarity >= 3) s.pity = 0;
      const existing = s.disciples.find((d) => d.id === rolled.def.id);
      const isNew = !existing;
      if (existing) existing.stars = Math.min(5, existing.stars + 1);
      else s.disciples.push({ id: rolled.def.id, stars: 0 });
      reveal.push({ id: rolled.def.id, rarity: rolled.rarity, isNew });
      s.pulls += 1;
      bumpMissions(s, "pulls", 1);
      juice.emit({
        t: "gacha",
        rarity: rolled.rarity,
        name: rolled.def.name,
        id: rolled.def.id,
        isNew,
      });
    }
    bumpTutorial(s);
    flush(set, s);
    set({ gachaReveal: reveal });
    persistNow(get());
    if (s.sfxOn) sfx.gacha(Math.max(...reveal.map((r) => r.rarity)));
    // 轻量揭示文案（壳层样式留给粉哥）
    const best = reveal.reduce((a, b) => (b.rarity > a.rarity ? b : a), reveal[0]);
    if (best) {
      const def = DISCIPLES.find((d) => d.id === best.id);
      const rareName = ["凡人", "炼气", "筑基", "金丹", "元婴", "化神", "合体", "仙人"][best.rarity] ?? "";
      if (best.isNew && best.rarity >= 3) {
        get().pushToast(`${def?.name ?? best.id} · ${rareName}拜山`);
      } else if (count === 1) {
        get().pushToast(best.isNew ? `${def?.name ?? ""} · 投缘得人` : `${def?.name ?? ""} · 缘印加深`);
      } else {
        const news = reveal.filter((r) => r.isNew).length;
        get().pushToast(news > 0 ? `十缘 · 新人 ${news} · 最上${rareName}` : `十缘 · 缘印加深 · 最上${rareName}`);
      }
    }
  },

  clearGacha() {
    set({ gachaReveal: null });
  },

  startExplore(slot, realmId) {
    const s = get();
    const realm = REALMS.find((r) => r.id === realmId);
    if (!realm || s.layer < realm.unlockLayer) return;
    if (s.explores[slot]) return;
    const next = s.explores.slice();
    next[slot] = { realmId, endAt: Date.now() + realm.duration * 1000 };
    set({ explores: next });
  },

  claimExplore(slot) {
    const s = get();
    const job = s.explores[slot];
    if (!job || Date.now() < job.endAt) return;
    const loot = exploreLoot(s, job.realmId);
    s.qi += loot.qi;
    s.jade += loot.jade;
    s.herbs += loot.herbs;
    s.ore += loot.ore;
    s.exploresDone += 1;
    s.explores[slot] = null;
    bumpMissions(s, "explore", 1);
    flush(set, s);
    get().pushToast(`云游归来  香火+${Math.floor(loot.qi)}  缘玉+${loot.jade}`);
    juice.emit({ t: "upgrade" });
  },

  buySkill(id) {
    const s = get();
    const def = SKILLS.find((x) => x.id === id);
    if (!def) return;
    const lv = s.skills[id] ?? 0;
    if (lv >= def.max) return;
    const cost = skillCost(id, lv);
    if (s.daoFruit < cost) return;
    s.daoFruit -= cost;
    s.skills[id] = lv + 1;
    flush(set, s);
    juice.emit({ t: "upgrade" });
    if (s.sfxOn) sfx.upgrade();
  },

  craft(id) {
    const s = get();
    const def = CRAFTS.find((x) => x.id === id);
    if (!def) return;
    if ((s.buildings.alchemy ?? 0) < 1) return;
    const lv = s.crafts[id] ?? 0;
    if (lv >= def.max) return;
    if (s.herbs < def.herbs || s.ore < def.ore || s.jade < def.jade) return;
    s.herbs -= def.herbs;
    s.ore -= def.ore;
    s.jade -= def.jade;
    s.crafts[id] = lv + 1;
    flush(set, s);
    juice.emit({ t: "upgrade" });
    if (s.sfxOn) sfx.upgrade();
  },

  claimMission(id) {
    const s = get();
    const m = s.missions.find((x) => x.id === id);
    if (!m || m.progress < m.target) return;
    s.jade += m.rewardJade;
    s.missions = s.missions.filter((x) => x.id !== id);
    s.missions.push(rollMission(s));
    flush(set, s);
    persistNow(s);
    // dedicated mission juice + soft chime; upgrade emit keeps building-less burst fallback
    juice.emit({ t: "mission" });
    juice.emit({ t: "upgrade", name: m.title });
    if (s.sfxOn) sfx.orb();
    get().pushToast(`事成 · 缘玉 +${m.rewardJade}`);
  },

  unlockLab() {
    const s = get();
    if (s.labUnlocked || s.jade < 20) return;
    s.jade -= 20;
    s.labUnlocked = true;
    bumpMissions(s, "lab", 1);
    flush(set, s);
    set({ tab: "dao" });
    get().pushToast("藏经阁已开  可修道藏");
    juice.emit({ t: "upgrade" });
  },

  prestige() {
    const s = get();
    const fruit = prestigeFruit(s.totalDamage, multipliers(s).dao);
    if (fruit < 1) return;
    const keepJade = Math.floor(s.jade * 0.35);
    const next = defaultState();
    next.started = true;
    next.seenTitle = true;
    next.daoFruit = s.daoFruit + fruit;
    next.prestigeCount = s.prestigeCount + 1;
    next.disciples = s.disciples;
    next.skills = s.skills;
    next.crafts = s.crafts;
    next.labUnlocked = s.labUnlocked;
    next.pity = s.pity;
    next.jade = Math.max(keepJade, 10); // 至少一次拜山投缘
    next.qi = startQiAfterPrestige(s);
    next.buildings.hall = 1; // 道种留香案残影，免二周目纯干点
    next.lifetimeDamage = s.lifetimeDamage;
    next.pulls = s.pulls;
    next.sfxOn = s.sfxOn;
    next.shakeOn = s.shakeOn;
    next.tutorialStep = 5;
    next.missions = starterMissions();
    set({ ...get(), ...next, tab: null, gachaReveal: null });
    juice.emit({ t: "prestige" });
    if (s.sfxOn) sfx.prestige();
    get().pushToast(`劫后归山  道果 +${fruit}`);
    persistNow(get());
  },

  resetSave() {
    const fresh = defaultState();
    set({ ...get(), ...fresh, tab: null, gachaReveal: null, offlineGift: null, toasts: [] });
    persistNow(get());
  },

  setDebug(v: boolean) {
    try {
      localStorage.setItem("xian-debug", v ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ debug: v });
  },

  cheat(kind: "qi" | "jade" | "fruit" | "buildings" | "layer10" | "layer50" | "unlock" | "prestige") {
    const s = get();
    const label: Record<string, string> = {
      qi: "香火 +100亿",
      jade: "仙玉 +2000",
      fruit: "道果 +100",
      buildings: "全建筑 40 级",
      layer10: "劫层 +10",
      layer50: "直达 50 层",
      unlock: "系统全开",
      prestige: "强行渡劫",
    };
    if (kind === "qi") s.qi += 1e10;
    else if (kind === "jade") s.jade += 2000;
    else if (kind === "fruit") s.daoFruit += 100;
    else if (kind === "buildings") {
      const next = { ...s.buildings };
      for (const b of BUILDINGS) next[b.id] = Math.max(next[b.id] ?? 0, 40);
      s.buildings = next;
    } else if (kind === "layer10" || kind === "layer50") {
      s.layer = kind === "layer50" ? 50 : s.layer + 10;
      s.layerHp = layerHp(s.layer);
    } else if (kind === "unlock") {
      s.labUnlocked = true;
      s.jade += 2000;
      if (s.tutorialStep < 5) s.tutorialStep = 5;
    } else if (kind === "prestige") {
      s.daoFruit += 50;
      // 强行渡劫:先补足 prestigeFruit 的 totalDamage 门槛(2e5),否则 prestige() 会直接返回
      s.totalDamage = Math.max(s.totalDamage, 2e5);
      s.lifetimeDamage = Math.max(s.lifetimeDamage, 2e5);
      flush(set, s);
      get().prestige();
      return;
    }
    flush(set, s);
    get().pushToast(`测试 · ${label[kind] ?? kind}`);
  },

  setSfx(v) {
    setSfxEnabled(v);
    set({ sfxOn: v });
  },
  setShake(v) {
    set({ shakeOn: v });
  },

  pushToast(text) {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-3), { id, text }] });
    window.setTimeout(() => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    }, 2600);
  },
}));

if (typeof window !== "undefined") {
  (window as Window & { __xian?: typeof useGame }).__xian = useGame;
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistNow(useGame.getState());
  });
  window.addEventListener("pagehide", () => persistNow(useGame.getState()));
}
