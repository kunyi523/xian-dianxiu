import { BUILDINGS, HERB_PER_MIN_PER_LV, ORE_PER_MIN_PER_LV, type BuildingDef } from "./data";

export const TIER_NAME = ["", "草创", "开山", "仙府", "仙宫"] as const;

/* ---------- 暖褐水墨调色板 v10（一念逍遥式：暖米纸底 + 暖灰墨山） ----------
 * 用户 2026-09-24 定版：完完全全按一念逍遥截图重来，v9 清新青绿作废。
 * 天空暖纸 → 山峦暖灰墨 → 深墨暖黑 → 水面暖灰，金做暖金点缀。
 * 所有世界渲染统一走这里。 */
export const PAL = {
  skyTop: "#dcd7c6", // 天空·暖灰
  skyMid: "#e4dfd0", // 天空·暖纸过渡
  skyBot: "#ece5d2", // 天空·纸白
  peakFar: "#b0a898", // 远山·淡暖灰墨
  peakMid: "#928676", // 中山·暖灰
  peakNear: "#6b6558", // 近山·深暖灰
  ink: "#232429", // 墨·暖黑（主）
  inkSoft: "#4a443c", // 墨·暖灰（淡）
  inkFaint: "rgba(35,36,41,", // 需拼 alpha 的墨
  water: "#cfc8b4", // 水·暖灰
  mist: "rgba(236,229,210,", // 雾·暖纸
  stone: "#d8d0bd", // 石径·浅暖
  stoneEdge: "#a89f8d", // 石径·边
  gold: "#d8c690", // 金·暖金点缀
  seal: "#412d26", // 徽章·深褐（配暖纸）
  paper: "#ece5d2", // 纸·暖米
  ghost: "#a89f8d", // 虚印地基·暖灰
  robeBlue: "#5c4a3a",
  robeWhite: "#ece5d2",
} as const;

/** 建筑五阶段:0废墟 1雏形(破) 2成型 3宏伟 4仙宫(满级) */
export function buildingTier(lv: number): 0 | 1 | 2 | 3 | 4 {
  if (lv <= 0) return 0;
  if (lv < 10) return 1;
  if (lv < 25) return 2;
  if (lv < 40) return 3;
  return 4;
}

export function nextTierAt(lv: number): number | null {
  if (lv < 1) return 1;
  if (lv < 10) return 10;
  if (lv < 25) return 25;
  if (lv < 40) return 40;
  return null;
}

export function tierName(id: string, tier: number): string {
  if (tier <= 0) return "废墟";
  const def = BUILDINGS.find((b) => b.id === id);
  return def?.tiers[tier - 1] ?? TIER_NAME[tier] ?? "";
}

/* ---------- 建筑 PNG(分级贴图 {id}_t{n})资源 ---------- */
let inkAssetBase = "/";
export function setInkAssetBase(b: string) {
  inkAssetBase = b.replace(/\/$/, "");
}
const buildingImgCache = new Map<string, HTMLImageElement>();
const buildingImgMissing = new Set<string>();
/** 取分级建筑贴图,只拼 {id}_t{n}.png,不兼容旧文件名。缺图打日志,不做 fallback。 */
export function buildingImg(id: string, tier: number): HTMLImageElement | null {
  const key = `${id}_t${tier}`;
  let img = buildingImgCache.get(key);
  if (!img) {
    img = new Image();
    img.src = `${inkAssetBase}/${key}.png`;
    img.onerror = () => {
      if (!buildingImgMissing.has(key)) {
        buildingImgMissing.add(key);
        console.warn(`[ink] 建筑贴图缺失:${key}.png,不做 fallback`);
      }
    };
    buildingImgCache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/* ---------- 特效 PNG(逐帧 {kind}_f{n})资源 ---------- */
let fxAssetBase = "/";
export function setFxAssetBase(b: string) {
  fxAssetBase = b.replace(/\/$/, "");
}
const fxImgCache = new Map<string, HTMLImageElement>();
const fxImgMissing = new Set<string>();
/** 取特效逐帧贴图,只拼 {kind}_f{n}.png(jielei_f1..f6 / xianqi_f1..f6)。缺图打日志,不做 fallback。 */
export function fxImg(kind: "jielei" | "xianqi", frame: number): HTMLImageElement | null {
  const key = `${kind}_f${frame}`;
  let img = fxImgCache.get(key);
  if (!img) {
    img = new Image();
    img.src = `${fxAssetBase}/${key}.png`;
    img.onerror = () => {
      if (!fxImgMissing.has(key)) {
        fxImgMissing.add(key);
        console.warn(`[ink] 特效贴图缺失:${key}.png,不做 fallback`);
      }
    };
    fxImgCache.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/* ---------- 飞行仙鹤双帧（翅膀上扬 / 下压振翅） ---------- */
const craneFlyCache: (HTMLImageElement | null)[] = [null, null];
let craneFlyLogged = false;
/** public/fx/crane_fly_1.png / crane_fly_2.png。缺图打一次日志，不回退。 */
export function craneFlyImg(frame: 0 | 1): HTMLImageElement | null {
  if (!craneFlyCache[frame]) {
    const img = new Image();
    img.src = `${fxAssetBase}/crane_fly_${frame + 1}.png`;
    img.onerror = () => {
      if (!craneFlyLogged) {
        craneFlyLogged = true;
        console.warn("[ink] 飞行仙鹤贴图缺失:crane_fly_1/2.png,不做 fallback");
      }
    };
    craneFlyCache[frame] = img;
  }
  const img = craneFlyCache[frame];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * 双帧振翅仙鹤：按时间在上扬/下压两帧间切换，带飞行起伏与轻微倾摆。
 * wPx 为期望翼展像素宽。
 */
export function drawCraneFly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  wPx: number,
  facing: number,
) {
  const img = craneFlyImg(Math.floor(t * 3) % 2 === 0 ? 0 : 1);
  if (!img) return;
  const bobY = Math.sin(t * 1.6) * wPx * 0.06;
  const tilt = Math.sin(t * 1.1) * 0.06;
  const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
  const dw = wPx;
  const dh = wPx * ratio;
  ctx.save();
  ctx.translate(x, y + bobY);
  ctx.rotate(tilt * facing);
  ctx.scale(facing, 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/* ---------- 分级 PNG 精灵绘制(统一 footprint) ---------- */
/**
 * 精灵图统一 1600x1600,建筑脚底在底部 40px 边距处、水平居中。
 * 绘制时全 tier 用同一逻辑尺寸,脚底锚定在 (x,y),换图不跳位。
 */
function drawSpriteBuilding(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  s: number,
  tier: number,
) {
  if (tier < 1) return; // 未解锁不上图
  // 只有 t1-t3;t4 暂用 t3。hall 只有 t1/t2,逻辑 tier 2/3/4 显式用 t2,不请求 hall_t3
  const t = Math.min(tier, id === "hall" ? 2 : 3);
  const img = buildingImg(id, t);
  if (!img) return; // 缺图已打日志,不绘制
  const size = s * 2; // 逻辑格:与槽位宽度对齐,运行时只做统一 scale
  const feetFromTop = (1560 / 1600) * size; // 脚底在图内距顶 1560px 处
  const dx = x - size / 2;
  const dy = y - feetFromTop;
  // 洇墨边:模糊本体重影垫底,轮廓如墨洇入纸,不再是硬切贴纸
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.filter = "blur(3px) saturate(0.7) brightness(1.05)";
  ctx.drawImage(img, dx, dy, size, size);
  ctx.restore();
  // 罩染:收饱和度提亮,建筑和背景山用同一套青灰墨色呼吸
  ctx.save();
  ctx.filter = "saturate(0.7) brightness(1.05)";
  ctx.drawImage(img, dx, dy, size, size);
  ctx.restore();
}export function perkLine(id: string, lv: number): string {
  if (lv <= 0) return BUILDINGS.find((b) => b.id === id)?.perk ?? "";
  if (id === "hall") return `香火 全山山息 +${(lv * 0.5).toFixed(1)}%`;
  if (id === "house") return `人潮 香火自燃 ${(Math.floor(lv / 3) * 0.12).toFixed(2)}/秒`;
  if (id === "sword") return `剑鸣 剑系 +${(lv * 1.6).toFixed(0)}%`;
  if (id === "array") return `阵眼 劫层 +${(lv * 1.2).toFixed(0)}%`;
  if (id === "mine") return `脉晶 ${(lv * ORE_PER_MIN_PER_LV).toFixed(1)}/分`;
  if (id === "tower") return `神雷 开光 +${(lv * 1.2).toFixed(0)}%`;
  if (id === "mirror") return `望劫 开光 +${(lv * 0.8).toFixed(0)}%`;
  if (id === "alchemy") return `丹烟 ${(lv * HERB_PER_MIN_PER_LV).toFixed(1)}/分`;
  return "";
}

export const SHORT_NAME: Record<string, string> = {
  hall: "香",
  house: "茅",
  sword: "剑",
  array: "纹",
  mine: "脉",
  tower: "雷",
  mirror: "镜",
  alchemy: "丹",
};

/** 世界宽度 = 屏幕宽 × WORLD_K,可左右滑动;中央(劫云/主建筑/瀑布)为开屏镜头 */
export const WORLD_K = 2.4;

export type Peak = {
  id: string;
  nx: number;
  ny: number;
  hw: number;
  hh: number;
  band: 0 | 1 | 2;
  z: number;
};

export const PEAKS: Peak[] = [
  // 2026-09-24 横滑版:nx 为世界坐标(0-1 铺满 worldW);建筑实际绘制宽 = 2×hw×worldW,
  // hw/hh 按 worldW(=2.4 屏宽)折算,屏上观感与上一版一致。左3栋/右4栋,中央只留劫云+开山香案+瀑布。
  // band0 近劫 · band1 山腰 · band2 山麓
  { id: "main", nx: 0.48, ny: 0.18, hw: 0.16, hh: 0.2, band: 0, z: 0 },
  // 右上孤峰 → 雷骨塔
  { id: "tower", nx: 0.885, ny: 0.42, hw: 0.025, hh: 0.048, band: 0, z: 1 },
  // 右中峰 → 望劫镜
  { id: "mirror", nx: 0.72, ny: 0.475, hw: 0.031, hh: 0.036, band: 0, z: 2 },
  // 左山腰 → 瀑侧丹灶
  { id: "alchemy", nx: 0.1, ny: 0.575, hw: 0.025, hh: 0.033, band: 1, z: 0 },
  // 左中山腰台地 → 镇峰残纹
  { id: "array", nx: 0.235, ny: 0.545, hw: 0.036, hh: 0.038, band: 1, z: 1 },
  // 右山腰 → 龙脉口（洞府入口）
  { id: "mine", nx: 0.875, ny: 0.615, hw: 0.027, hh: 0.038, band: 1, z: 2 },
  // 左近山丘 → 云阶茅舍
  { id: "house", nx: 0.09, ny: 0.75, hw: 0.036, hh: 0.033, band: 2, z: 0 },
  // 中央主建筑 → 开山香案（瀑布上方）
  { id: "hall", nx: 0.6, ny: 0.665, hw: 0.042, hh: 0.046, band: 2, z: 1 },
  // 右近山丘 → 悬剑冢
  { id: "sword", nx: 0.745, ny: 0.735, hw: 0.029, hh: 0.04, band: 2, z: 2 },
];

export const BUILDING_SLOTS: Record<string, { nx: number; ny: number; z: number; band: 0 | 1 | 2; hw: number; hh: number }> =
  Object.fromEntries(
    PEAKS.filter((p) => p.id !== "main").map((p) => [p.id, { nx: p.nx, ny: p.ny, z: p.z, band: p.band, hw: p.hw, hh: p.hh }]),
  );

/** 拜山多径：世界坐标(nx 0-1 铺满 worldW)；左山环 / 右山环 / 中央朝圣 */
export const MOUNTAIN_PATHS: { nx: number; ny: number }[][] = [
  // 0 · 左山环 — 丹灶 0.10/0.575 ↔ 残纹 0.235/0.545 ↔ 茅舍 0.09/0.75
  [
    { nx: 0.06, ny: 0.6 },
    { nx: 0.1, ny: 0.575 },
    { nx: 0.16, ny: 0.56 },
    { nx: 0.235, ny: 0.55 },
    { nx: 0.28, ny: 0.58 },
    { nx: 0.24, ny: 0.63 },
    { nx: 0.17, ny: 0.68 },
    { nx: 0.1, ny: 0.72 },
    { nx: 0.09, ny: 0.75 },
    { nx: 0.06, ny: 0.72 },
    { nx: 0.05, ny: 0.66 },
    { nx: 0.06, ny: 0.6 },
  ],
  // 1 · 右山环 — 望劫镜 0.72/0.475 → 雷骨塔 0.885/0.42 → 龙脉口 0.875/0.615 → 悬剑冢 0.745/0.735
  [
    { nx: 0.68, ny: 0.5 },
    { nx: 0.72, ny: 0.475 },
    { nx: 0.78, ny: 0.45 },
    { nx: 0.885, ny: 0.43 },
    { nx: 0.92, ny: 0.48 },
    { nx: 0.9, ny: 0.56 },
    { nx: 0.875, ny: 0.615 },
    { nx: 0.84, ny: 0.66 },
    { nx: 0.78, ny: 0.7 },
    { nx: 0.745, ny: 0.735 },
    { nx: 0.7, ny: 0.7 },
    { nx: 0.68, ny: 0.62 },
    { nx: 0.67, ny: 0.55 },
    { nx: 0.68, ny: 0.5 },
  ],
  // 2 · 中央朝圣 — 香案 0.60/0.665 直上劫云 0.60/0.12
  [
    { nx: 0.6, ny: 0.63 },
    { nx: 0.6, ny: 0.6 },
    { nx: 0.6, ny: 0.52 },
    { nx: 0.6, ny: 0.44 },
    { nx: 0.6, ny: 0.36 },
    { nx: 0.6, ny: 0.28 },
    { nx: 0.6, ny: 0.2 },
    { nx: 0.6, ny: 0.16 },
    { nx: 0.64, ny: 0.24 },
    { nx: 0.65, ny: 0.34 },
    { nx: 0.64, ny: 0.46 },
    { nx: 0.62, ny: 0.58 },
    { nx: 0.6, ny: 0.63 },
  ],
];

export const MOUNTAIN_PATH = MOUNTAIN_PATHS[0];

export const PATH_COUNT = MOUNTAIN_PATHS.length;

export const TRIB = { nx: 0.6, ny: 0.12 };

export type Blit = { dx: number; dy: number; dw: number; dh: number };

export function coverBlit(imgW: number, imgH: number, w: number, h: number): Blit {
  const ir = imgW / Math.max(1, imgH);
  const cr = w / Math.max(1, h);
  if (ir > cr) {
    const dh = h;
    const dw = dh * ir;
    return { dx: (w - dw) / 2, dy: 0, dw, dh };
  }
  const dw = w;
  const dh = dw / ir;
  return { dx: 0, dy: (h - dh) / 2, dw, dh };
}

export function panBlit(blit: Blit, pan: number, w: number): Blit {
  const extra = blit.dw - w;
  if (extra <= 0) return { ...blit, dx: 0 };
  const max = extra / 2;
  const p = Math.max(-max, Math.min(max, pan));
  return { ...blit, dx: (w - blit.dw) / 2 + p };
}

/**
 * 背景装饰图适配（高屏手机）：
 * 宽度铺满；图高于屏则垂直居中裁，图矮于屏则贴底、上方留天空渐变。
 * 世界坐标不再跟随图片走（统一用屏幕坐标），背景只做装饰。
 */
export function backdropBlit(imgW: number, imgH: number, w: number, h: number): Blit {
  const dw = w;
  const dh = (dw / Math.max(1, imgW)) * Math.max(1, imgH);
  const dy = dh >= h ? (h - dh) / 2 : h - dh;
  return { dx: 0, dy, dw, dh };
}

export function slotXY(nx: number, ny: number, w: number, h: number, blit: Blit | null) {
  if (!blit) return { x: nx * w, y: ny * h };
  return { x: blit.dx + nx * blit.dw, y: blit.dy + ny * blit.dh };
}

export function tribCenter(w: number, h: number, blit: Blit | null = null) {
  const p = slotXY(TRIB.nx, TRIB.ny, w, h, blit);
  // 视觉半径加大（点空开光已不依赖 R 命中）
  return { cx: p.x, cy: p.y, R: Math.min(w, h) * 0.128 };
}

/** 当前段陡度 0..1：陡阶减速用 */
export function pathSteepAt(s: number, pathIndex = 0): number {
  const path = MOUNTAIN_PATHS[Math.max(0, Math.min(MOUNTAIN_PATHS.length - 1, pathIndex | 0))] ?? MOUNTAIN_PATHS[0];
  const n = Math.max(1, path.length - 1);
  const t = Math.max(0, Math.min(0.999, s)) * n;
  const i = Math.floor(t);
  const a = path[i];
  const b = path[i + 1] ?? a;
  const dx = Math.abs(b.nx - a.nx);
  const dy = Math.abs(b.ny - a.ny);
  return dy / Math.max(0.018, dx + dy);
}

/** 靠近折点（台阶拐角）时 ≈1，便于停顿 */
export function pathCornerNear(s: number, pathIndex = 0): number {
  const path = MOUNTAIN_PATHS[Math.max(0, Math.min(MOUNTAIN_PATHS.length - 1, pathIndex | 0))] ?? MOUNTAIN_PATHS[0];
  const n = Math.max(1, path.length - 1);
  const t = Math.max(0, Math.min(0.999, s)) * n;
  const frac = Math.abs(t - Math.round(t));
  return Math.max(0, 1 - frac / 0.08);
}

export function pathPoint(
  s: number,
  w: number,
  h: number,
  blit: Blit | null = null,
  pathIndex = 0,
  jitter = 0,
) {
  const path = MOUNTAIN_PATHS[Math.max(0, Math.min(MOUNTAIN_PATHS.length - 1, pathIndex | 0))] ?? MOUNTAIN_PATHS[0];
  const n = path.length - 1;
  const t = Math.max(0, Math.min(0.999, s)) * n;
  const i = Math.floor(t);
  const f = t - i;
  const a = path[i];
  const b = path[i + 1] ?? a;
  // 偏线性插值，保留之字拐角（少滑轨样条感）
  const ease = f * 0.72 + f * f * (3 - 2 * f) * 0.28;
  const nx = a.nx + (b.nx - a.nx) * ease;
  const ny = a.ny + (b.ny - a.ny) * ease;
  // 轻抖动 + 沿段微侧移，像贴阶走而非贴一条曲线
  const jx = jitter * 0.014 * Math.sin(s * Math.PI * 2 + pathIndex) + jitter * 0.006 * Math.sin(t * 1.7);
  const jy = jitter * 0.008 * Math.cos(s * Math.PI * 2 + pathIndex * 1.7);
  return slotXY(nx + jx, ny + jy, w, h, blit);
}

export function stampStates(buildings: Record<string, number>, layer = 0) {
  const out: { id: string; owned: boolean; locked: boolean; lv: number }[] = [];
  let lockedShown = false;
  for (const def of BUILDINGS) {
    const lv = buildings[def.id] ?? 0;
    const idx = BUILDINGS.findIndex((b) => b.id === def.id);
    // 与 sim.buildingUnlocked 保持一致:丹灶在龙脉口已开或层数≥8 时提前显形
    const prevOk =
      idx <= 0 ||
      (buildings[BUILDINGS[idx - 1].id] ?? 0) > 0 ||
      (def.id === "alchemy" && ((buildings.mine ?? 0) > 0 || layer >= 8));
    if (lv > 0 || prevOk) {
      out.push({ id: def.id, owned: lv > 0, locked: false, lv });
    } else if (!lockedShown) {
      out.push({ id: def.id, owned: false, locked: true, lv: 0 });
      lockedShown = true;
    }
  }
  return out;
}

export function buildingsInBand(band: 0 | 1 | 2) {
  return BUILDINGS.filter((b) => BUILDING_SLOTS[b.id]?.band === band).sort(
    (a, b) => (BUILDING_SLOTS[a.id]?.z ?? 0) - (BUILDING_SLOTS[b.id]?.z ?? 0),
  );
}

// 人物配色：青白为主，朱砂/玄青点缀，配清新背景
const SKIN = ["#e8c39a", "#dfb183", "#d09a6e", "#f0cfae", "#ddac82", "#cfa37e"];
const HAIR = ["#232a2e", "#2e363b", "#1f2529", "#3a444a"];
const ROBE = ["#ece5d2", "#7a3a2c", "#5c4a3a", "#f2ecdc", "#6b5a44", "#8c2f28"];

// 渐变缓存:createRadial/LinearGradient 有开销,动画参数量化后跨帧复用同一对象
const gradCache = new Map<string, CanvasGradient>();
function radialCached(
  ctx: CanvasRenderingContext2D,
  key: string,
  x0: number,
  y0: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number,
  stops: Array<[number, string]>,
): CanvasGradient {
  let g = gradCache.get(key);
  if (!g) {
    g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    if (gradCache.size > 60) gradCache.clear();
    gradCache.set(key, g);
  }
  return g;
}

const skyCache = new Map<number, CanvasGradient>();

// 劫云墨团相对位置:静态常量,避免每帧重建数组
const TRIB_BLOBS: Array<[number, number, number]> = [
  [0, 0.06, 1.08],
  [-0.78, 0.12, 0.7],
  [0.76, 0.14, 0.68],
  [-0.38, -0.12, 0.55],
  [0.36, -0.1, 0.52],
  [0.04, 0.28, 0.48],
  [-0.55, 0.32, 0.36],
  [0.58, 0.3, 0.34],
];

export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const key = Math.round(h);
  let g = skyCache.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PAL.skyTop);
    g.addColorStop(0.45, PAL.skyMid);
    g.addColorStop(1, PAL.skyBot);
    if (skyCache.size > 8) skyCache.clear();
    skyCache.set(key, g);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawDistantPeaks(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = PAL.peakFar;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.38);
  ctx.lineTo(w * 0.3, h * 0.22);
  ctx.lineTo(w * 0.55, h * 0.32);
  ctx.lineTo(w, h * 0.18);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
}

export function drawPeaks(ctx: CanvasRenderingContext2D, w: number, h: number, band: 0 | 1 | 2) {
  const fill = [PAL.peakFar, PAL.peakMid, PAL.peakNear][band];
  ctx.fillStyle = fill;
  ctx.beginPath();
  const y0 = h * (0.28 + band * 0.18);
  ctx.moveTo(0, h);
  ctx.lineTo(0, y0);
  ctx.quadraticCurveTo(w * 0.25, y0 - h * 0.08, w * 0.5, y0 + h * 0.04);
  ctx.quadraticCurveTo(w * 0.75, y0 - h * 0.06, w, y0);
  ctx.lineTo(w, h);
  ctx.fill();
}

export function drawWaterfall(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#f4ecdc";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.22);
  ctx.lineTo(w * 0.2, h * 0.62);
  ctx.stroke();
  ctx.globalAlpha = 0.35 + 0.12 * Math.sin(t * 4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.175, h * 0.24 + ((t * 40) % 20));
  ctx.lineTo(w * 0.195, h * 0.6);
  ctx.stroke();
  ctx.restore();
}

export function drawPath(ctx: CanvasRenderingContext2D, w: number, h: number, blit: Blit | null) {
  // 三条淡雅石径：左山环最实，朝圣最淡；双色叠画，有石板路感；随镜头平移
  MOUNTAIN_PATHS.forEach((path, pi) => {
    const trace = () => {
      ctx.beginPath();
      path.forEach((p, i) => {
        const s = slotXY(p.nx, p.ny, w, h, blit);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(168,159,141,${[0.42, 0.3, 0.22][pi] ?? 0.25})`;
    ctx.lineWidth = pi === 0 ? 7 : 5;
    trace();
    ctx.stroke();
    ctx.strokeStyle = `rgba(244,236,220,${[0.9, 0.72, 0.55][pi] ?? 0.6})`;
    ctx.lineWidth = pi === 0 ? 3.4 : 2.4;
    trace();
    ctx.stroke();
  });
}

export function drawBandMist(ctx: CanvasRenderingContext2D, w: number, h: number, band: number) {
  ctx.fillStyle = `${PAL.mist}${0.12 + band * 0.05})`;
  ctx.fillRect(0, h * (0.35 + band * 0.2), w, 28);
}

export function drawForeground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#4a443c";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.92);
  ctx.quadraticCurveTo(w * 0.5, h * 0.88, w, h * 0.94);
  ctx.lineTo(w, h);
  ctx.fill();
}

export function drawCultivator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  variant: number,
  t: number,
  scale = 1,
  facing = 1,
) {
  const bob = Math.sin(t * 7.2) * 1.15;
  const stride = Math.sin(t * 8.4);
  const skin = SKIN[variant % SKIN.length];
  const hair = HAIR[variant % HAIR.length];
  const robe = ROBE[variant % ROBE.length];
  const female = variant % 3 === 1;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale * facing, scale);
  ctx.fillStyle = hair;
  if (female) {
    ctx.fillRect(-2, -8, 5, 3);
    ctx.fillRect(-3, -6, 2, 5);
    ctx.fillRect(2, -6, 2, 5);
  } else {
    ctx.fillRect(-2, -8, 5, 3);
    ctx.fillRect(-1, -9, 3, 2);
  }
  ctx.fillStyle = skin;
  ctx.fillRect(-2, -6, 5, 4);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-1, -5, 1, 1);
  ctx.fillRect(1, -5, 1, 1);
  ctx.fillStyle = robe;
  ctx.fillRect(-3, -2, 7, 5);
  ctx.fillStyle = variant % 2 === 0 ? PAL.seal : PAL.robeBlue;
  ctx.fillRect(-3, -1, 7, 1);
  ctx.fillStyle = robe;
  ctx.fillRect(-2 + stride * 1.2, 3, 2, 3.2);
  ctx.fillRect(1 - stride * 1.2, 3, 2, 3.2);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-2 + stride * 1.2, 6, 2, 1);
  ctx.fillRect(1 - stride * 1.2, 6, 2, 1);
  ctx.restore();
}

export function drawSwordRider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  scale: number,
  facing: number,
  rarity: number,
) {
  const bob = Math.sin(t * 5.1) * 1.4;
  const tilt = Math.sin(t * 2.4) * 0.12;
  const robe = rarity >= 5 ? PAL.seal : rarity >= 3 ? PAL.ink : rarity >= 1 ? PAL.inkSoft : PAL.robeWhite;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(tilt);
  ctx.scale(scale * facing, scale);
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-11, 5);
  ctx.lineTo(12, 2.4);
  ctx.stroke();
  ctx.fillStyle = "#e8c39a";
  ctx.fillRect(-2, -8, 4, 4);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-2, -9, 4, 2);
  ctx.fillStyle = robe;
  ctx.fillRect(-3, -4, 6, 6);
  ctx.restore();
}

export function drawCrane(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, scale = 1, facing = 1) {
  const flap = Math.sin(t * 3.4);
  const wLift = flap * 8;
  const ink = PAL.ink;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 曳腿（双线拖尾，先画压底）
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-5, 1.5);
  ctx.quadraticCurveTo(-10, 3, -15, 2.2 + flap * 1.2);
  ctx.moveTo(-5, 2.4);
  ctx.quadraticCurveTo(-9.5, 4.6, -14, 4.8 + flap * 1.2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 尾羽
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(-6, -0.8);
  ctx.lineTo(-12, -2.6);
  ctx.lineTo(-11, 0.6);
  ctx.lineTo(-6, 1.6);
  ctx.closePath();
  ctx.fill();

  // 身体：白身墨背
  ctx.fillStyle = "rgba(28,25,20,0.9)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5, 3.4, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(244,240,230,0.92)";
  ctx.beginPath();
  ctx.ellipse(0.6, -0.9, 5.1, 2.0, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // 远翅（淡墨）
  ctx.strokeStyle = "rgba(28,25,20,0.42)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-1, -1);
  ctx.quadraticCurveTo(-6, -6 - wLift * 0.5, -13, -8 - wLift * 0.7);
  ctx.stroke();

  // 近翅主羽 + 羽尖分叉
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(1, -1.5);
  ctx.quadraticCurveTo(-3, -7 - wLift * 0.6, -9, -10 - wLift);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-9, -10 - wLift);
  ctx.lineTo(-14, -12 - wLift * 1.15);
  ctx.moveTo(-8, -9.4 - wLift * 0.95);
  ctx.lineTo(-12.5, -10.6 - wLift * 1.05);
  ctx.stroke();

  // 脖颈
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(5.5, -1);
  ctx.quadraticCurveTo(8.5, -3.5, 10.5, -6.5);
  ctx.stroke();

  // 头（纸白描墨边）
  ctx.fillStyle = "#f4f0e6";
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(11.5, -7, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 丹顶
  ctx.fillStyle = "#b03a2e";
  ctx.beginPath();
  ctx.arc(11.5, -8.3, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // 长喙
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(13.6, -7.5);
  ctx.lineTo(17.5, -6.2);
  ctx.lineTo(13.6, -6.1);
  ctx.closePath();
  ctx.fill();
  // 目
  ctx.beginPath();
  ctx.arc(12.1, -7.2, 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawTribCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  pulse: number,
  t: number,
) {
  // pulse 量化到 0.05 一档:渐变跨帧复用,肉眼无差
  const pq = Math.round(pulse * 20) / 20;
  const sq = Math.round(s);
  const cxq = Math.round(cx);
  const cyq = Math.round(cy);
  const gk = `${cxq},${cyq},${sq},${pq}`;
  ctx.save();
  // 外圈青灰晕（云气 wash）
  const wash = radialCached(ctx, `wash:${gk}`, cxq, cyq, sq * 0.15, cxq, cyq, sq * 2.4, [
    [0, `${PAL.inkFaint}${0.16 + pq * 0.06})`],
    [0.45, `${PAL.inkFaint}0.07)`],
    [1, `${PAL.inkFaint}0)`],
  ]);
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.05, s * 2.35, s * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // 劫云主体:六帧 PNG(jielei_f1..f6 雷劫云),pulse 只调尺寸与透明
  const fx = fxImg("jielei", Math.floor(t * 6) % 6 + 1);
  if (fx) {
    const fs = s * (4.7 + pulse * 0.18); // PNG 全帧即云团,按原洗染范围对齐
    ctx.globalAlpha = 0.97;
    ctx.drawImage(fx, cx - fs / 2, cy - fs / 2 + s * 0.05, fs, fs);
    ctx.globalAlpha = 1;
  }
  // 缺图只打日志(见 fxImg):不绘制矢量主体,不做 fallback
  // 软朱砂印心（非硬红点）
  const sealR = sq * (0.22 + pq * 0.12);
  const seal = radialCached(
    ctx,
    `seal:${gk}`,
    cxq + sq * 0.04,
    cyq - sq * 0.02,
    0,
    cxq + sq * 0.04,
    cyq,
    sealR,
    [
      [0, `rgba(177,58,44,${0.72 + pq * 0.2})`],
      [0.45, `rgba(177,58,44,${0.28 + pq * 0.12})`],
      [1, "rgba(177,58,44,0)"],
    ],
  );
  ctx.fillStyle = seal;
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.05, cy, s * (0.16 + pulse * 0.35), s * (0.08 + pulse * 0.16), 0.12, 0, Math.PI * 2);
  ctx.fill();
  // 云端高光一点
  ctx.fillStyle = `rgba(236,229,210,${0.22 + pulse * 0.15})`;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.06, cy - s * 0.05, s * 0.045, s * 0.022, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  id: string,
  owned: boolean,
  locked: boolean,
) {
  const r = id === "hall" ? 15 : id === "array" ? 14 : 12;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = owned ? 0.7 : locked ? 0.38 : 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(236,229,210,0.35)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = owned ? "rgba(35,36,41,0.72)" : locked ? "rgba(143,166,171,0.55)" : "rgba(70,84,91,0.6)";
  ctx.fill();
  ctx.strokeStyle = owned ? "rgba(236,229,210,0.65)" : "rgba(168,159,141,0.5)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = locked ? 0.55 : 0.95;
  ctx.fillStyle = "#ece5d2";
  ctx.strokeStyle = "#ece5d2";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (locked) {
    ctx.beginPath();
    ctx.arc(0, -1.6, 2.4, Math.PI, 0);
    ctx.stroke();
    ctx.strokeRect(-2.8, -1.6, 5.6, 4.6);
  } else {
    drawStampMark(ctx, id);
  }
  ctx.restore();
}

function drawStampMark(ctx: CanvasRenderingContext2D, id: string) {
  ctx.strokeStyle = "#ece5d2";
  ctx.fillStyle = "#ece5d2";
  ctx.lineWidth = 1.25;
  ctx.lineCap = "round";
  if (id === "sword") {
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 6);
    ctx.moveTo(-3.2, -2.5);
    ctx.lineTo(3.2, -2.5);
    ctx.stroke();
  } else if (id === "tower") {
    ctx.strokeRect(-2.6, -2.2, 5.2, 3.2);
    ctx.beginPath();
    ctx.moveTo(-2, -2.2);
    ctx.lineTo(0, -6.4);
    ctx.lineTo(2, -2.2);
    ctx.stroke();
  } else if (id === "array") {
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6.2, 5);
    ctx.lineTo(-6.2, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0.4, 2.4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "mine") {
    ctx.beginPath();
    ctx.moveTo(-6.5, 3);
    ctx.quadraticCurveTo(0, -8, 6.5, 3);
    ctx.stroke();
  } else if (id === "alchemy") {
    ctx.beginPath();
    ctx.moveTo(-5.2, 1.5);
    ctx.lineTo(-3.2, 6);
    ctx.lineTo(3.2, 6);
    ctx.lineTo(5.2, 1.5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -1.2, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "mirror") {
    ctx.beginPath();
    ctx.ellipse(0, 0.2, 4.6, 6.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "house") {
    ctx.beginPath();
    ctx.moveTo(0, -6.2);
    ctx.lineTo(6.2, 0.2);
    ctx.lineTo(-6.2, 0.2);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeRect(-4, 0.2, 8, 5.2);
  } else {
    ctx.beginPath();
    ctx.moveTo(-7, -1);
    ctx.lineTo(0, -8);
    ctx.lineTo(7, -1);
    ctx.stroke();
    ctx.strokeRect(-5.4, -1, 10.8, 7);
  }
}

function drawQiThreads(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  n: number,
  spread: number,
  height: number,
  tint: "ink" | "seal" | "paper" = "ink",
) {
  for (let i = 0; i < n; i++) {
    const seed = i * 1.618;
    const life = (t * 0.28 + seed) % 1;
    const sway = Math.sin(seed * 4 + t * 0.9) * spread * 0.35;
    const px = x + Math.sin(seed * 2.3) * spread * 0.45 + sway * life;
    const py = y - life * height;
    const a = (1 - life) * (1 - life) * 0.42;
    ctx.globalAlpha = a;
    ctx.strokeStyle = tint === "seal" ? PAL.seal : tint === "paper" ? PAL.paper : PAL.inkSoft;
    ctx.lineWidth = 1 + (1 - life) * 0.6;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(seed) * spread * 0.25, y);
    ctx.quadraticCurveTo(x + sway, y - life * height * 0.55, px, py);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 仙气六帧:建筑绘制之后的低透明 overlay,慢循环,不遮建筑主体。 */
function drawXianqiOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
) {
  const img = fxImg("xianqi", Math.floor(t * 3) % 6 + 1);
  if (!img) return; // 缺图已打日志,不绘制
  const size = s * 2.2;
  ctx.save();
  ctx.globalAlpha = 0.22;
  // 建筑中心约在 (x, y-0.9s):overlay 中心略上移,不压建筑主体
  ctx.drawImage(img, x - size / 2, y - 1.05 * s - size / 2, size, size);
  ctx.restore();
}

/** 前景压脚:山石草丛画在建筑底座"前面",把建筑嵌进山里 */
function drawBaseOverlap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  id: string,
) {
  // id 做稳定伪随机种子,帧间不闪
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const rnd = () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return h / 4294967296;
  };
  ctx.save();
  // 两簇山石,一左一右压住底座下沿
  const rocks: Array<[number, number, number]> = [
    [-0.48 - rnd() * 0.1, 0.03, 0.2 + rnd() * 0.08],
    [0.44 + rnd() * 0.1, 0.05, 0.16 + rnd() * 0.07],
  ];
  for (const [ox, oy, r] of rocks) {
    const rx = x + ox * s;
    const ry = y + oy * s;
    const rw = r * s;
    const rh = r * s * 0.45;
    const pts: Array<[number, number]> = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 1 - rnd() * 0.35;
      pts.push([
        rx + Math.cos(a) * rw * rr,
        ry + Math.sin(a) * rh * rr * (Math.sin(a) > 0 ? 0.7 : 1),
      ]);
    }
    const g = ctx.createLinearGradient(0, ry - rh, 0, ry + rh * 0.7);
    g.addColorStop(0, "rgba(188,203,198,0.78)");
    g.addColorStop(1, "rgba(108,128,122,0.78)");
    ctx.fillStyle = g;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    // 淡墨晕边:石头如水墨洇开,不再是实色 blob
    ctx.save();
    ctx.filter = "blur(1.5px)";
    ctx.fill();
    ctx.restore();
    // 石顶受光:一道淡线,和背景山同一套笔法
    ctx.strokeStyle = "rgba(236,229,210,0.55)";
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.beginPath();
    ctx.moveTo(rx - rw * 0.7, ry - rh * 0.55);
    ctx.quadraticCurveTo(rx, ry - rh * 1.05, rx + rw * 0.7, ry - rh * 0.5);
    ctx.stroke();
    // 皴笔:两三道短线,和背景山同一套笔法
    ctx.strokeStyle = "rgba(35,36,41,0.35)";
    ctx.lineWidth = Math.max(1, s * 0.012);
    for (let k = 0; k < 3; k++) {
      const sx = rx - rw * 0.5 + rnd() * rw;
      ctx.beginPath();
      ctx.moveTo(sx, ry - rh * 0.5);
      ctx.lineTo(sx + rw * 0.2, ry + rh * 0.1);
      ctx.stroke();
    }
  }
  // 草丛:几笔出锋,散在底座前
  ctx.strokeStyle = "rgba(35,36,41,0.5)";
  ctx.lineWidth = Math.max(1, s * 0.01);
  ctx.lineCap = "round";
  for (let k = 0; k < 8; k++) {
    const gx = x + (rnd() - 0.5) * s * 1.1;
    const gy = y + s * (0.02 + rnd() * 0.06);
    const lean = (rnd() - 0.5) * s * 0.1;
    const gh = s * (0.06 + rnd() * 0.08);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + lean * 0.4, gy - gh * 0.7, gx + lean, gy - gh);
    ctx.stroke();
  }
  ctx.restore();
}

/** 未解锁槽位:淡色虚印地基。细虚线椭圆地基轮廓,低透明,不抢戏。 */
function drawGhostFoundation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
) {
  const breath = 0.2 + 0.07 * Math.sin(t * 1.15 + x * 0.01);
  ctx.save();
  ctx.strokeStyle = PAL.ghost;
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.setLineDash([s * 0.085, s * 0.065]);
  // 外圈:地基轮廓,与建筑 footprint 对齐,脚底锚定 (x, y)
  ctx.globalAlpha = breath;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.62, s * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 内圈:示意"可建造",更淡
  ctx.globalAlpha = breath * 0.65;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.32, s * 0.105, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 建筑落地:接地阴影(建筑之前画,压住中间、四周晕开)+ 脚底雾带(建筑之后画,融掉生硬底边) */
function drawGroundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const shW = s * 0.72;
  const shH = s * 0.2;
  ctx.save();
  ctx.translate(x, y + s * 0.03);
  ctx.scale(1, shH / shW);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, shW);
  g.addColorStop(0, "rgba(28,38,42,0.30)");
  g.addColorStop(0.65, "rgba(28,38,42,0.13)");
  g.addColorStop(1, "rgba(28,38,42,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, shW, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 空气透视罩:以建筑为中心的淡青灰柔光,远建筑更浓,和背景山同呼吸 */
function drawAirHaze(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, band: 0 | 1 | 2) {
  const a = band === 0 ? 0.17 : band === 1 ? 0.1 : 0.05;
  const w = s * 1.05;
  const h = s * 1.1;
  ctx.save();
  ctx.translate(x, y - s * 0.8);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(229,239,243,${a})`);
  g.addColorStop(1, "rgba(229,239,243,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBaseMist(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {  const mW = s * 0.88;
  const mH = s * 0.15;
  ctx.save();
  ctx.translate(x, y - s * 0.01);
  ctx.scale(1, mH / mW);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, mW);
  g.addColorStop(0, "rgba(236,243,245,0.22)");
  g.addColorStop(1, "rgba(236,243,245,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, mW, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawSiteFx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lv: number,
  t: number,
  id?: string,
  scale = 56,
  ruined = false,
  band: 0 | 1 | 2 = 2,
) {
  const tier = ruined ? 0 : buildingTier(lv);
  const s = Math.max(28, scale);
  const breath = 0.5 + 0.5 * Math.sin(t * 1.15 + x * 0.01);
  ctx.save();
  // 第2层收口:8 栋全部走分级 PNG 精灵;hall 只有 t1/t2,逻辑 tier 2/3/4 显式用 t2
  if (id) {
    if (tier < 1) {
      // 未解锁:淡色虚印地基(从无到有的起点),不再画废墟
      drawGhostFoundation(ctx, x, y, s, t);
      ctx.restore();
      return;
    }
    drawGroundShadow(ctx, x, y, s);
    drawSpriteBuilding(ctx, id, x, y, s, tier);
    // 空气透视:远建筑罩一层淡青灰,和背景山呼吸同一种空气;band0 最远最浓
    drawAirHaze(ctx, x, y, s, band);
    drawBaseMist(ctx, x, y, s);
    // 仙气:建筑绘制之后,低透明 overlay,不遮建筑主体
    drawXianqiOverlay(ctx, x, y, s, t);
    // 前景压脚:山石草丛盖住底座下沿,建筑嵌进山里
    drawBaseOverlap(ctx, x, y, s, id);
    ctx.restore();
    return;
  }
  if (id === "array") drawArraySite(ctx, x, y, s, tier, t, ruined, breath);
  else if (id === "sword") drawSwordSite(ctx, x, y, s, tier, t, ruined);
  else if (id === "tower") drawTowerSite(ctx, x, y, s, tier, t, ruined, breath);
  else if (id === "mine") drawMineSite(ctx, x, y, s, tier, t, ruined);
  else if (id === "alchemy") drawAlchemySite(ctx, x, y, s, tier, t, ruined, breath);
  else if (id === "mirror") drawMirrorSite(ctx, x, y, s, tier, t, ruined, breath);
  else if (id === "house") drawHouseSite(ctx, x, y, s, tier, t, ruined, breath);
  else if (id === "hall") drawHallSite(ctx, x, y, s, tier, t, ruined);
  ctx.restore();
}

function drawArraySite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
  breath: number,
) {
  const pillars: [number, number, number][] = [
    [0, -s * 0.38, ruined ? -0.18 : 0],
    [-s * 0.46, s * 0.24, ruined ? 0.22 : 0],
    [s * 0.46, s * 0.24, ruined ? -0.12 : 0],
  ];
  for (const [px, py, rot] of pillars) {
    ctx.save();
    ctx.translate(x + px, y + py);
    ctx.rotate(rot);
    ctx.globalAlpha = ruined ? 0.32 : 0.65;
    ctx.strokeStyle = ruined ? "#5c564c" : "#2a2622";
    ctx.lineWidth = ruined ? 1.2 : 1.8;
    const h = ruined ? s * 0.14 : s * (0.22 + tier * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h);
    ctx.moveTo(-4.5, -h);
    ctx.lineTo(4.5, -h);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = ruined ? "rgba(92,86,76,0.4)" : `rgba(166,61,50,${0.38 + breath * 0.28})`;
  ctx.lineWidth = ruined ? 1 : 1.7;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.38);
  ctx.lineTo(x + s * 0.46, y + s * 0.24);
  ctx.lineTo(x - s * 0.46, y + s * 0.24);
  ctx.closePath();
  ctx.stroke();
  if (tier >= 1) {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (tier >= 2) drawQiThreads(ctx, x, y, t, 5, s * 0.28, s * 0.7, "ink");
  if (tier >= 3) drawQiThreads(ctx, x, y - s * 0.1, t + 1, 4, s * 0.22, s * 0.85, "seal");
}

function drawSwordSite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
) {
  const n = ruined ? 1 : 2 + tier;
  for (let i = 0; i < n; i++) {
    const ang = ruined ? -0.6 : t * 0.7 + i * ((Math.PI * 2) / n);
    const rr = ruined ? s * 0.18 : s * (0.22 + 0.08 * Math.sin(t + i));
    ctx.save();
    ctx.globalAlpha = ruined ? 0.3 : 0.7;
    ctx.translate(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.45 - 8);
    ctx.rotate(ang + 0.4);
    ctx.strokeStyle = ruined ? "#5c564c" : "#1c1914";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.16);
    ctx.lineTo(0, -s * 0.22);
    ctx.stroke();
    ctx.restore();
  }
  if (tier >= 2) drawQiThreads(ctx, x, y, t, 3 + tier, s * 0.2, s * 0.55, "ink");
}

function drawTowerSite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
  breath: number,
) {
  if (ruined) {
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#5c564c";
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 8);
    ctx.lineTo(x - 2, y - s * 0.4);
    ctx.stroke();
    return;
  }
  if (tier >= 1) drawQiThreads(ctx, x, y - s * 0.35, t, 3, s * 0.12, s * 0.55, "ink");
  if (tier >= 2) {
    ctx.strokeStyle = `rgba(28,25,20,${0.4 + breath * 0.3})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.4);
    ctx.lineTo(x + Math.sin(t * 8) * s * 0.12, y - s * 0.95);
    ctx.stroke();
  }
}

function drawMineSite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
) {
  ctx.globalAlpha = ruined ? 0.28 : 0.55;
  ctx.strokeStyle = "#2a2622";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.38, y + s * 0.12);
  ctx.quadraticCurveTo(x, y - s * (ruined ? 0.12 : 0.28), x + s * 0.38, y + s * 0.12);
  ctx.stroke();
  if (!ruined && tier >= 2) drawQiThreads(ctx, x, y, t, 4, s * 0.22, s * 0.45, "ink");
}

function drawAlchemySite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
  breath: number,
) {
  if (ruined) return;
  ctx.fillStyle = `rgba(166,61,50,${0.32 + breath * 0.35})`;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + s * 0.06);
  ctx.quadraticCurveTo(x, y - s * (0.18 + breath * 0.1), x + 4, y + s * 0.06);
  ctx.fill();
  drawQiThreads(ctx, x, y - s * 0.05, t, 2 + tier, s * 0.12, s * 0.5, tier >= 3 ? "seal" : "ink");
}

function drawMirrorSite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
  breath: number,
) {
  ctx.globalAlpha = ruined ? 0.25 : 0.55;
  ctx.strokeStyle = ruined ? "#5c564c" : "#2a2622";
  ctx.beginPath();
  ctx.ellipse(x, y - 2, s * 0.22, s * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!ruined && tier >= 2) drawQiThreads(ctx, x, y - s * 0.1, t, 3, s * 0.16, s * 0.45, "paper");
}

function drawHouseSite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
  breath: number,
) {
  if (ruined) return;
  const g = 0.35 + breath * 0.4;
  ctx.fillStyle = `rgba(166,61,50,${g})`;
  ctx.fillRect(x - s * 0.28, y - 8, 4, 6);
  ctx.fillRect(x + s * 0.22, y - 6, 4, 6);
  if (tier >= 2) drawQiThreads(ctx, x, y, t, 3, s * 0.3, s * 0.35, "ink");
}

function drawHallSite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  tier: number,
  t: number,
  ruined: boolean,
) {
  if (ruined) return;
  drawQiThreads(ctx, x, y + 4, t, 3 + tier, s * 0.22, s * 0.45, "ink");
  if (tier >= 3) drawQiThreads(ctx, x, y, t + 1.2, 3, s * 0.16, s * 0.55, "seal");
}

export function drawUpgradeBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fl: number,
  tierUp: boolean,
) {
  if (fl <= 0) return;
  ctx.save();
  const a = Math.min(1, fl);
  ctx.globalAlpha = a * 0.55;
  ctx.fillStyle = PAL.paper;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 18 + (1 - a) * 70, 10 + (1 - a) * 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = a * 0.7;
  ctx.fillStyle = tierUp ? "rgba(177,58,44,0.55)" : "rgba(236,229,210,0.55)";
  ctx.fillRect(x - (tierUp ? 5 : 3), y - (40 + (1 - a) * 90), tierUp ? 10 : 6, 50 + (1 - a) * 90);
  ctx.strokeStyle = `rgba(177,58,44,${a})`;
  ctx.lineWidth = tierUp ? 3 : 2;
  ctx.beginPath();
  ctx.arc(x, y, 16 + (1 - a) * (tierUp ? 70 : 40), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawProceduralBuilding(
  ctx: CanvasRenderingContext2D,
  def: BuildingDef,
  x: number,
  y: number,
  lv: number,
  t: number,
) {
  drawSiteFx(ctx, x, y, lv, t, def.id, 48, lv <= 0);
}

export function drawRuinVeil(ctx: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(176,164,148,0.7)";
  ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#6e685c";
  ctx.fillRect(x - rw * 0.25, y, rw * 0.18, rh * 0.22);
  ctx.fillRect(x + rw * 0.1, y + rh * 0.05, rw * 0.2, rh * 0.16);
  ctx.restore();
}
