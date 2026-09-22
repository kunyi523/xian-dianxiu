import {
  BUILDINGS,
  CLICK_UPGRADES,
  CRAFTS,
  DISCIPLES,
  GACHA_WEIGHTS,
  REALMS,
  SKILLS,
  type BonusKind,
} from "./data";
import type { GameState } from "./store";

const UNITS = [
  { v: 1e44, s: "载" },
  { v: 1e40, s: "正" },
  { v: 1e36, s: "涧" },
  { v: 1e32, s: "沟" },
  { v: 1e28, s: "穰" },
  { v: 1e24, s: "秭" },
  { v: 1e20, s: "垓" },
  { v: 1e16, s: "京" },
  { v: 1e12, s: "兆" },
  { v: 1e8, s: "亿" },
  { v: 1e4, s: "万" },
] as const;

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return sign + (abs < 10 && abs % 1 !== 0 ? abs.toFixed(1) : Math.floor(abs).toString());
  for (const u of UNITS) {
    if (abs >= u.v) {
      const x = abs / u.v;
      const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
      return sign + x.toFixed(digits).replace(/\.0+$/, "") + u.s;
    }
  }
  return sign + Math.floor(abs).toString();
}

export function formatTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildingCost(id: string, fromLevel: number, count = 1): number {
  const b = BUILDINGS.find((x) => x.id === id);
  if (!b) return Infinity;
  const r = b.costScale;
  return b.baseCost * Math.pow(r, fromLevel) * ((Math.pow(r, count) - 1) / (r - 1));
}

export function maxAffordable(id: string, fromLevel: number, qi: number): number {
  if (qi <= 0) return 0;
  const b = BUILDINGS.find((x) => x.id === id);
  if (!b) return 0;
  const r = b.costScale;
  const first = b.baseCost * Math.pow(r, fromLevel);
  if (qi < first) return 0;
  const n = Math.floor(Math.log((qi * (r - 1)) / first + 1) / Math.log(r));
  return Math.max(0, n);
}

export function clickUpgradeCost(id: string, level: number): number {
  const u = CLICK_UPGRADES.find((x) => x.id === id);
  if (!u) return Infinity;
  return u.baseCost * Math.pow(u.scale, level);
}

export function skillCost(id: string, level: number): number {
  const s = SKILLS.find((x) => x.id === id);
  if (!s) return Infinity;
  return Math.ceil(s.cost * Math.pow(s.costScale, level));
}

export function layerHp(layer: number): number {
  return 50 * Math.pow(1.62, layer);
}

export function tribulationNeed(filled: number): number {
  return 5000 * Math.pow(1.55, filled);
}

export function prestigeFruit(totalDamage: number, tribBonus: number): number {
  if (totalDamage < 2e5) return 0;
  return Math.max(1, Math.floor(Math.sqrt(totalDamage / 2e5) * (1 + tribBonus)));
}

function sumBonus(state: GameState, kind: BonusKind): number {
  let v = 0;
  for (const owned of state.disciples) {
    const def = DISCIPLES.find((d) => d.id === owned.id);
    if (!def || def.bonus.kind !== kind) continue;
    v += def.bonus.value * (1 + 0.25 * owned.stars);
  }
  for (const s of SKILLS) {
    if (s.kind !== kind) continue;
    v += s.value * (state.skills[s.id] ?? 0);
  }
  for (const c of CRAFTS) {
    if (c.kind !== kind) continue;
    v += c.value * (state.crafts[c.id] ?? 0);
  }
  return v;
}

export function multipliers(state: GameState) {
  // 道果转加成边际递减:囤积仍有收益,但不再线性爆炸(0.04×道果在后期会失控)
  const prestige = 1 + 0.06 * state.prestigeCount + 0.3 * Math.sqrt(state.daoFruit);
  return {
    dps: (1 + sumBonus(state, "dps")) * prestige,
    // 点击不吃转生乘区:开光已挂钩秒伤(秒伤里已有转生乘区),再乘一次会随转生二次放大
    click: 1 + sumBonus(state, "click"),
    jade: 1 + sumBonus(state, "jade"),
    crit: sumBonus(state, "crit"),
    explore: 1 + sumBonus(state, "explore"),
    sword: 1 + sumBonus(state, "sword"),
    offline: 1 + sumBonus(state, "offline"),
    dao: sumBonus(state, "dao"),
  };
}

export function clickPower(state: GameState): number {
  const m = multipliers(state);
  const sense = 1 + (state.clickUp.sense ?? 0);
  const tower = 1 + 0.012 * (state.buildings.tower ?? 0);
  const mirror = 1 + 0.008 * (state.buildings.mirror ?? 0);
  // 开光挂钩秒伤:后期点击随山息成长,不沦为仪式感(1%经连击暴击放大后约当秒伤的五到八成)
  const dpsShare = 0.01 * totalDps(state);
  return (sense * tower * mirror + dpsShare) * m.click;
}

export function critChance(state: GameState): number {
  const m = multipliers(state);
  return Math.min(0.65, 0.04 + 0.03 * (state.clickUp.critC ?? 0) + m.crit);
}

export function critMult(state: GameState): number {
  return 2 + 0.25 * (state.clickUp.critD ?? 0);
}

export function autoCps(state: GameState): number {
  return 0.4 * (state.clickUp.auto ?? 0) + 0.12 * Math.floor((state.buildings.house ?? 0) / 3);
}

export function buildingUnlocked(state: GameState, index: number): boolean {
  if (index === 0) return true;
  const b = BUILDINGS[index];
  const prev = BUILDINGS[index - 1];
  if ((state.buildings[prev.id] ?? 0) >= 1) return true;
  // P1 soft wall: 瀑侧丹灶 — 脉口已开或层数够即可提前显形（价仍按 baseCost）
  if (b?.id === "alchemy") {
    return (state.buildings.mine ?? 0) >= 1 || state.layer >= 8;
  }
  return false;
}

export function totalDps(state: GameState): number {
  const m = multipliers(state);
  const hallMul = 1 + 0.005 * (state.buildings.hall ?? 0);
  const swordExtra = 1 + 0.016 * (state.buildings.sword ?? 0);
  const arrayMul = 1 + 0.012 * (state.buildings.array ?? 0);
  // 劫层乘区:每破一层全山山息+0.8%,破劫即修为,线性累加不爆炸,转生/不转生两条路都吃到后期成长
  const layerMult = 1 + 0.008 * state.layer;
  let dps = 0;
  for (const b of BUILDINGS) {
    const lv = state.buildings[b.id] ?? 0;
    if (lv <= 0) continue;
    const sword = b.projectile === "sword" ? m.sword * swordExtra : 1;
    const layer = b.id === "array" ? arrayMul : 1;
    dps += b.baseDps * lv * m.dps * sword * hallMul * layer;
  }
  return dps * layerMult;
}

export function gachaRoll(rareBonus: number): { def: (typeof DISCIPLES)[number]; rarity: number } {
  const weights = GACHA_WEIGHTS.map((w, i) => (i >= 3 ? w * (1 + rareBonus * 8) : w));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  let rarity = 0;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      rarity = i;
      break;
    }
  }
  const pool = DISCIPLES.filter((d) => d.rarity === rarity);
  const def = pool[Math.floor(Math.random() * pool.length)] ?? DISCIPLES[0];
  return { def, rarity: def.rarity };
}

export function exploreLoot(state: GameState, realmId: string) {
  const realm = REALMS.find((x) => x.id === realmId);
  if (!realm) return { jade: 0, herbs: 0, ore: 0, qi: 0 };
  const m = multipliers(state).explore;
  const rng = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  return {
    jade: Math.round(rng(realm.jade[0], realm.jade[1]) * m),
    herbs: Math.round(rng(realm.herbs[0], realm.herbs[1]) * m),
    ore: Math.round(rng(realm.ore[0], realm.ore[1]) * m),
    qi: Math.round(realm.qi * m * (1 + 0.15 * state.layer)),
  };
}

export function startQiAfterPrestige(state: GameState): number {
  const lv = state.skills.seed ?? 0;
  return 50 * Math.pow(8, lv);
}

export function discipleCount(state: GameState): number {
  return state.disciples.reduce((a, d) => a + 1 + d.stars, 0);
}
