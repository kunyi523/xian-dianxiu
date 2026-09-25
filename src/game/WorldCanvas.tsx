import { useEffect, useRef } from "react";
import { BUILDINGS, DISCIPLES } from "./data";
import {
  BUILDING_SLOTS,
  buildingsInBand,
  buildingTier,
  drawBandMist,
  drawCraneFly,
  drawCultivator,
  drawDistantPeaks,
  drawForeground,
  drawPath,
  drawPeaks,
  drawProceduralBuilding,
  drawSiteFx,
  drawSky,
  drawSwordRider,
  drawTribCloud,
  drawUpgradeBurst,
  drawWaterfall,
  pathCornerNear,
  pathPoint,
  pathSteepAt,
  PATH_COUNT,
  setInkAssetBase,
  slotXY,
  stampStates,
  tribCenter,
  TRIB,
  WORLD_K,
  type Blit,
  setFxAssetBase,
} from "./ink";
import { juice, type JuiceEvent } from "./juice";
import { formatNum, totalDps } from "./sim";
import { useGame } from "./store";

const ASSET_BASE = (import.meta as ImportMeta & { env: { BASE_URL?: string } }).env.BASE_URL || "/";
const assetUrl = (p: string) => `${ASSET_BASE}${p.replace(/^\//, "")}`;

// 建筑分级贴图基址:{base}/{id}_t{n}.png,public/sprites 映射
setInkAssetBase(assetUrl("sprites"));
// 特效逐帧基址:{base}/{kind}_f{n}.png,public/fx 映射
setFxAssetBase(assetUrl("fx"));

// 帧间缓存:建筑表静态不变,band 分组与 id→index 只算一次,避免每帧 filter/sort/findIndex
const BAND_CACHE = [buildingsInBand(0), buildingsInBand(1), buildingsInBand(2)] as const;
const BUILDING_INDEX = new Map(BUILDINGS.map((b, i) => [b.id, i] as const));

// 建筑标识:一念逍遥式深褐圆徽 + 暖金单字,名号暖金书法缀于徽下,跟建筑一起平移
const SEAL_CHARS: Record<string, string> = {
  hall: "香",
  house: "舍",
  sword: "剑",
  array: "纹",
  mine: "脉",
  tower: "塔",
  mirror: "镜",
  alchemy: "丹",
};
function drawBuildingLabel(
  ctx: CanvasRenderingContext2D,
  id: string,
  name: string,
  x: number,
  y: number,
  time: number,
) {
  const seal = SEAL_CHARS[id];
  if (!seal) return;
  // 圆徽落在建筑底座中心,名号缀在圆徽下方,随建筑一起平移
  const bob = Math.sin(time * 1.3 + x * 0.04) * 1.5;
  const cx = x;
  const sealY = y - 6 + bob;
  const nameY = y + 21 + bob;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 深褐圆徽
  ctx.beginPath();
  ctx.arc(cx, sealY, 11, 0, Math.PI * 2);
  ctx.fillStyle = "#2e2a26";
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(216,198,144,0.55)";
  ctx.stroke();
  ctx.fillStyle = "#e8d9a8";
  ctx.font = "600 13px \"Songti SC\",\"STSong\",serif";
  ctx.fillText(seal, cx, sealY + 0.5);
  // 名号:暖金书法,深墨描边保底
  ctx.font = "600 14px \"Songti SC\",\"STSong\",serif";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(35,32,28,0.85)";
  ctx.strokeText(name, cx, nameY);
  ctx.fillStyle = "#f0e6c8";
  ctx.fillText(name, cx, nameY);
  ctx.restore();
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  kind: "dot" | "sword" | "spark" | "ring" | "mote";
  size: number;
};
type Floater = { x: number; y: number; n: string; life: number; crit: boolean };
type Walker = { s: number; sp: number; v: number; bob: number; path: number; jitter: number; pause: number };
type Orb = { a: number; life: number };
type Bolt = { pts: { x: number; y: number }[]; branches: { x: number; y: number }[][]; life: number };
type Guest = {
  id: string;
  rarity: number;
  nx: number;
  ny: number;
  enter: number;
  /** enter 动画总时长，按稀有阶分化 */
  enterMax: number;
  fromX: number;
  fromY: number;
  name: string;
  v: number;
  bob: number;
  ang: number;
  slash: number;
};

export function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: Particle[] = [];
    const floaters: Floater[] = [];
    const walkers: Walker[] = [];
    const guests: Guest[] = [];
    let orb: Orb | null = null;
    let trauma = 0;
    let time = 0;
    let last = performance.now();
    let acc = 0;
    // dps 只用于发射频率,0.5s 缓存一次;stampStates 只在建筑/层数变化时重算
    let cachedDps = 0;
    let lastDpsAt = 0;
    let lastStampKey = "";
    let lastStamps: ReturnType<typeof stampStates> = [];
    const getStamps = (st: ReturnType<typeof useGame.getState>) => {
      const key = st.layer + ":" + JSON.stringify(st.buildings);
      if (key !== lastStampKey) {
        lastStampKey = key;
        lastStamps = stampStates(st.buildings, st.layer);
      }
      return lastStamps;
    };
    let flash = 0;
    let boltFlash = 0; // 雷击专属闪白
    let pendingBolt = false; // 破境时排一道大的
    let vortexPulse = 0;
    let running = true;
    let orbTimer = 18 + Math.random() * 12;
    let lightningT = 3 + Math.random() * 4;
    let bolt: Bolt | null = null;
    const buildingFlash: Record<string, number> = {};
    const buildingTierUp: Record<string, boolean> = {};
    let cssW = 390;
    let cssH = 700;

    // 3 只丹顶鹤双帧振翅(public/fx/crane_fly_1/2.png)，天空低频飞过，少而小
    const cranes = Array.from({ length: 3 }, (_, i) => ({
      x: -0.2 + Math.random() * 1.4,
      y: 0.03 + Math.random() * 0.12,
      sp: (0.02 + Math.random() * 0.022) * (i % 2 === 0 ? 1 : -1),
      ph: i * 2.1 + Math.random(),
      sc: 0.95 + (i % 3) * 0.18,
    }));

    const motes = Array.from({ length: 18 }, () => ({
      x: Math.random(),
      y: 0.2 + Math.random() * 0.55,
      sp: 0.008 + Math.random() * 0.012,
      ph: Math.random() * 10,
    }));

    // 每位弟子固定一条山路(i % 3),沿 waypoint 来回行走,不再随机乱走
    const makeWalker = (i: number): Walker => ({
      s: Math.random(),
      // 略慢,陡段再乘 pathSteepAt
      sp: (Math.random() * 0.042 + 0.016) * (Math.random() < 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.3),
      v: i % 6,
      bob: Math.random() * 10,
      path: i % PATH_COUNT,
      jitter: 0.4 + Math.random() * 0.85,
      pause: Math.random() * 0.6,
    });
    for (let i = 0; i < 8; i++) {
      walkers.push(makeWalker(i));
    }

    const spawnParticle = (p: Particle) => {
      if (particles.length > 200) particles.shift();
      particles.push(p);
    };

    /** 可选触觉：与 shakeOn 同开同关 */
    const pulseVibrate = (ms: number) => {
      if (!useGame.getState().shakeOn) return;
      try {
        const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
        nav.vibrate?.(ms);
      } catch {
        /* ignore */
      }
    };

    const mountain = new Image();
    mountain.crossOrigin = "anonymous";
    // qg1:清新青山底图(青绿山水,无文字);世界坐标改用屏幕坐标,背景只做装饰
    mountain.src = assetUrl("bg/bg_panorama.jpg?v=6");
    let mountainOk = false;
    // 融合块:建筑已画死进背景块,随背景同一套变换叠上去(真融合路线)
    // 区域为背景像素坐标(4500×1932),块与块互不重叠;tiers=该建筑融合块档数
    const FUSED_BLOCKS = [
      { id: "tower", sx: 3025, sy: 225, sw: 450, sh: 450, tiers: 4 },
      { id: "mirror", sx: 2905, sy: 925, sw: 450, sh: 450, tiers: 4 },
      { id: "mine", sx: 2975, sy: 1375, sw: 450, sh: 450, tiers: 4 },
      { id: "sword", sx: 1825, sy: 1355, sw: 450, sh: 450, tiers: 4 },
      { id: "hall", sx: 2300, sy: 850, sw: 600, sh: 600, tiers: 3 },
      { id: "alchemy", sx: 1525, sy: 1025, sw: 450, sh: 450, tiers: 4 },
      { id: "array", sx: 1825, sy: 625, sw: 450, sh: 450, tiers: 4 },
      { id: "house", sx: 1125, sy: 1425, sw: 450, sh: 450, tiers: 4 },
    ];
    const FUSED_IDS = new Set(FUSED_BLOCKS.map((b) => b.id));
    const fusedImgs = new Map<string, HTMLImageElement>();
    for (const b of FUSED_BLOCKS) {
      for (let t = 1; t <= b.tiers; t++) {
        const key = `${b.id}_t${t}`;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = assetUrl(`bg/fused_block/${key}.png?v=1`);
        fusedImgs.set(key, img);
      }
    }
    let blit: Blit | null = null;
    // Offscreen cache: avoid drawImage-ing the ~0.9MB JPG every rAF
    let mountainCache: HTMLCanvasElement | null = null;
    let mountainCacheKey = "";
    mountain.onload = () => {
      mountainOk = true;
      mountainCache = null;
      mountainCacheKey = "";
    };

    // 横滑镜头:pan 为世界横向偏移(px),-1 表示未初始化(首次对准中央劫云/主建筑/瀑布)
    const cam = { pan: -1 };
    const clampPan = (w: number) => {
      const worldW = w * WORLD_K;
      if (cam.pan < 0) cam.pan = worldW * TRIB.nx - w / 2;
      cam.pan = Math.max(0, Math.min(worldW - w, cam.pan));
    };

    // 拖拽:>12px 视为滑动(横向平移镜头),否则为点按
    const drag = { on: false, moved: false, x: 0, y: 0, lx: 0 };

    const LANDINGS = [
      { nx: 0.16, ny: 0.72 },
      { nx: 0.8, ny: 0.66 },
      { nx: 0.5, ny: 0.6 },
      { nx: 0.65, ny: 0.7 },
      { nx: 0.45, ny: 0.72 },
      { nx: 0.55, ny: 0.72 },
      { nx: 0.3, ny: 0.74 },
      { nx: 0.7, ny: 0.74 },
    ];

    /** 单张空山底图:尺寸变才重建离屏 */
    const ensureMountainCache = (dw: number, dh: number, dpr: number) => {
      const bw = Math.max(1, Math.round(dw * dpr));
      const bh = Math.max(1, Math.round(dh * dpr));
      const key = `qg1|${bw}x${bh}|m:${mountainOk ? 1 : 0}`;
      if (mountainCache && mountainCacheKey === key) return mountainCache;
      const hasMtn = mountainOk && mountain.naturalWidth > 0;
      if (!hasMtn) return null;
      const oc = document.createElement("canvas");
      oc.width = bw;
      oc.height = bh;
      const octx = oc.getContext("2d");
      if (!octx) return null;
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(mountain, 0, 0, bw, bh);
      mountainCache = oc;
      mountainCacheKey = key;
      return oc;
    };

    /** 世界比屏宽(WORLD_K 倍):底图 cover 世界矩形,镜头随 pan 平移 */
    const syncBlit = (w: number, h: number) => {
      const worldW = w * WORLD_K;
      clampPan(w);
      // 世界坐标映射:blit.dx = -pan,后续所有 slotXY/tribCenter/pathPoint 自动跟随镜头
      blit = { dx: -cam.pan, dy: 0, dw: worldW, dh: h };
      const base = mountainOk && mountain.naturalWidth ? mountain : null;
      if (!base || !base.naturalWidth) return false;
      const ir = base.naturalWidth / base.naturalHeight;
      const wr = worldW / h;
      let dw: number, dh: number, dx: number, dy: number;
      if (ir > wr) {
        dh = h;
        dw = dh * ir;
        dx = -cam.pan - (dw - worldW) / 2;
        dy = 0;
      } else {
        dw = worldW;
        dh = dw / ir;
        dx = -cam.pan;
        dy = (h - dh) / 2;
      }
      const dpr = canvas.width / Math.max(1, w);
      const cache = ensureMountainCache(dw, dh, dpr);
      if (cache) {
        // Cache is already device-pixel sized; transform scales CSS→device ≈ 1:1
        ctx.drawImage(cache, dx, dy, dw, dh);
      } else {
        ctx.drawImage(base, dx, dy, dw, dh);
      }
      // 融合块:按当前 tier 叠对应块,建筑已画死在块里
      const bw = base.naturalWidth;
      const bh = base.naturalHeight;
      const bd = useGame.getState().buildings;
      for (const b of FUSED_BLOCKS) {
        const lv = bd[b.id] ?? 0;
        if (lv <= 0) continue;
        const tier = Math.min(buildingTier(lv), b.tiers);
        const img = fusedImgs.get(`${b.id}_t${tier}`);
        if (!img || img.naturalWidth === 0) continue;
        ctx.drawImage(
          img,
          dx + (b.sx * dw) / bw,
          dy + (b.sy * dh) / bh,
          (b.sw * dw) / bw,
          (b.sh * dh) / bh,
        );
      }
      return true;
    };

    const unsub = juice.on((e: JuiceEvent) => {
      const w = cssW;
      const h = cssH;
      if (e.t === "click") {
        const x = e.x * w;
        const y = e.y * h;
        trauma = Math.min(1, trauma + (e.crit ? 0.2 : 0.1));
        if (e.crit) pulseVibrate(12);
        vortexPulse = 1;
        // 更利落的墨点/笔触环：略快扩散、略短寿命
        const n = e.crit ? 9 : 6;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 16 + Math.random() * 28;
          spawnParticle({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 8,
            life: 0.32 + Math.random() * 0.22,
            max: 0.55,
            color: e.crit ? "#7a3a2c" : "#4a443c",
            kind: "mote",
            size: e.crit ? 2.2 : 1.55,
          });
        }
        spawnParticle({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 0.26,
          max: 0.26,
          color: e.crit ? "#7a3a2c" : "#232429",
          kind: "ring",
          size: e.crit ? 8 : 6,
        });
        floaters.push({
          x,
          y,
          n: (e.crit ? "暴 " : "+") + formatNum(e.n),
          life: 0.9,
          crit: e.crit,
        });
        if (floaters.length > 18) floaters.shift();
      } else if (e.t === "layer") {
        trauma = Math.min(1, trauma + 0.65);
        flash = 0.4;
        pendingBolt = true; // 破境：劫云降下一道大雷
        pulseVibrate(18);
        vortexPulse = 1;
        const { cx, cy } = tribCenter(cssW, cssH, blit);
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          spawnParticle({
            x: cx,
            y: cy,
            vx: Math.cos(a) * 42,
            vy: Math.sin(a) * 28,
            life: 0.7,
            max: 0.7,
            color: i % 2 ? "#7a3a2c" : "#232429",
            kind: "mote",
            size: 2,
          });
        }
        floaters.push({ x: cx, y: cy - 22, n: `破境 · 第 ${e.layer} 层`, life: 1.4, crit: true });
      } else if (e.t === "orb") {
        orb = null;
        trauma = Math.min(1, trauma + 0.35);
      } else if (e.t === "upgrade") {
        if (e.id) {
          buildingFlash[e.id] = e.tierUp ? 1.6 : 1.05;
          buildingTierUp[e.id] = !!e.tierUp;
          const slot = BUILDING_SLOTS[e.id];
          if (slot) {
            const p = slotXY(slot.nx, slot.ny, w, h, blit);
            const n = e.tierUp ? 36 : 22;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2;
              const sp = e.tierUp ? 48 : 28;
              spawnParticle({
                x: p.x,
                y: p.y - 10,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * 0.7 - 18,
                life: e.tierUp ? 1.1 : 0.75,
                max: e.tierUp ? 1.1 : 0.75,
                color: i % 2 ? "#7a3a2c" : "#ece5d2",
                kind: i % 4 === 0 ? "ring" : "mote",
                size: e.tierUp ? 3.2 : 2.2,
              });
            }
            floaters.push({
              x: p.x,
              y: p.y - 28,
              n: e.tierUp ? `进阶 · ${e.name ?? ""}` : `${e.name ?? "建筑"} 升级`,
              life: e.tierUp ? 1.6 : 1.1,
              crit: !!e.tierUp,
            });
          }
        }
        trauma = Math.min(1, trauma + (e.tierUp ? 0.55 : 0.32));
        flash = Math.max(flash, e.tierUp ? 0.35 : 0.16);
      } else if (e.t === "mission") {
        // 事毕：淡墨洗屏 + 软墨点 + 朱砂一点
        flash = Math.max(flash, 0.28);
        trauma = Math.min(1, trauma + 0.2);
        pulseVibrate(10);
        const mx = w * 0.5;
        const my = h * 0.42;
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 8 + Math.random() * 18;
          spawnParticle({
            x: mx + (Math.random() - 0.5) * 40,
            y: my + (Math.random() - 0.5) * 24,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 10,
            life: 0.85 + Math.random() * 0.45,
            max: 1.3,
            color: i % 3 === 0 ? "#7a3a2c" : i % 2 ? "#4a443c" : "#6b5f4e",
            kind: "mote",
            size: 1.6 + Math.random() * 1.2,
          });
        }
        spawnParticle({
          x: mx,
          y: my,
          vx: 0,
          vy: 0,
          life: 0.5,
          max: 0.5,
          color: "#7a3a2c",
          kind: "ring",
          size: 6,
        });
        floaters.push({ x: mx, y: my - 18, n: "事毕", life: 1.35, crit: true });
        if (floaters.length > 18) floaters.shift();
      } else if (e.t === "prestige") {
        flash = 0.7;
        trauma = 1;
        pulseVibrate(22);
      } else if (e.t === "gacha") {
        const def = DISCIPLES.find((d) => d.id === e.id);
        const name = def?.name ?? e.name;
        const aura = def?.aura;
        let guest = guests.find((g) => g.id === e.id);
        const slot = LANDINGS[guests.length % LANDINGS.length];
        if (!guest) {
          guest = {
            id: e.id,
            rarity: e.rarity,
            nx: slot.nx + (Math.random() - 0.5) * 0.04,
            ny: slot.ny + (Math.random() - 0.5) * 0.02,
            enter: 0,
            enterMax: 1.7,
            fromX: cssW * 0.78,
            fromY: cssH * 0.12,
            name,
            v: guests.length % 6,
            bob: Math.random() * 8,
            ang: Math.random() * Math.PI * 2,
            slash: 1.2 + Math.random() * 2,
          };
          guests.push(guest);
        }
        if (e.isNew) {
          // 阶梯入场时长：0–2 淡墨 · 3–4 印环 · 5–7 墨瀑更长
          const enterMax =
            e.rarity >= 5 ? 2.65 : e.rarity >= 3 ? 2.05 : 1.45;
          guest.enterMax = enterMax;
          guest.enter = enterMax;
          guest.fromX = cssW * (0.62 + Math.random() * 0.28);
          guest.fromY = cssH * (0.06 + Math.random() * 0.08);
          guest.rarity = e.rarity;
          guest.name = name;
          const land = slotXY(guest.nx, guest.ny, cssW, cssH, blit);
          const titleBit = def?.title ? ` · ${def.title}` : "";
          floaters.push({
            x: land.x,
            y: land.y - 26,
            n: e.rarity >= 3 ? `${name}${titleBit}` : `${name} · 拜山`,
            life: e.rarity >= 5 ? 2.35 : e.rarity >= 3 ? 2.0 : 1.55,
            crit: e.rarity >= 3,
          });

          const fxKind =
            aura ??
            (e.rarity >= 6 ? "void" : e.rarity >= 5 ? "sword" : e.rarity >= 3 ? "seal" : "cloud");

          if (e.rarity <= 2) {
            // 低稀：淡墨几点 + 轻环，不抢画面
            trauma = Math.min(1, trauma + 0.08);
            for (let i = 0; i < 5; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 6 + Math.random() * 10;
              spawnParticle({
                x: land.x,
                y: land.y - 6,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * 0.55 - 4,
                life: 0.5 + Math.random() * 0.3,
                max: 0.85,
                color: i % 2 ? "#6b5f4e" : "#4a443c",
                kind: "mote",
                size: 1.3 + Math.random() * 0.6,
              });
            }
            spawnParticle({
              x: land.x,
              y: land.y - 4,
              vx: 0,
              vy: 0,
              life: 0.34,
              max: 0.34,
              color: "#4a443c",
              kind: "ring",
              size: 4,
            });
          } else if (e.rarity <= 4) {
            // 中稀：朱砂印环 + 更明显上浮墨点；按 aura 分色/形
            trauma = Math.min(1, trauma + 0.2);
            flash = Math.max(flash, 0.14);
            const nBurst = 10 + e.rarity * 2;
            for (let i = 0; i < nBurst; i++) {
              const a = (Math.PI * 2 * i) / nBurst + Math.random() * 0.15;
              const sp =
                fxKind === "sword" ? 26 + Math.random() * 16 : 14 + Math.random() * 14;
              spawnParticle({
                x: land.x,
                y: land.y - 8,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * (fxKind === "cloud" ? 0.4 : 0.8) - (fxKind === "dawn" ? 12 : 6),
                life: 0.65 + Math.random() * 0.35,
                max: 1.05,
                color:
                  fxKind === "seal" || fxKind === "dawn"
                    ? "#7a3a2c"
                    : fxKind === "void"
                      ? "#232429"
                      : "#4a443c",
                kind: fxKind === "sword" ? "sword" : i % 5 === 0 ? "ring" : "mote",
                size: fxKind === "sword" ? 2.5 : fxKind === "seal" ? 4.5 : 2.1,
              });
            }
            // 主印环（seal / 默认中稀都有一圈朱砂）
            spawnParticle({
              x: land.x,
              y: land.y - 6,
              vx: 0,
              vy: 0,
              life: 0.62,
              max: 0.62,
              color: fxKind === "void" ? "#232429" : "#7a3a2c",
              kind: "ring",
              size: 10,
            });
            if (fxKind === "seal") {
              spawnParticle({
                x: land.x,
                y: land.y - 6,
                vx: 0,
                vy: 0,
                life: 0.42,
                max: 0.42,
                color: "#7a3a2c",
                kind: "ring",
                size: 6,
              });
            }
          } else {
            // 高稀 5–7：墨瀑爆发 + 洗屏闪 + 更长入场；aura 决定主形
            trauma = Math.min(1, trauma + (e.rarity >= 7 ? 0.55 : 0.42));
            flash = Math.max(flash, e.rarity >= 7 ? 0.55 : 0.42);
            pulseVibrate(e.rarity >= 7 ? 16 : 12);
            const nBurst = 22 + e.rarity * 4;
            for (let i = 0; i < nBurst; i++) {
              const a = (Math.PI * 2 * i) / nBurst + Math.random() * 0.25;
              const sp =
                fxKind === "sword"
                  ? 36 + Math.random() * 28
                  : fxKind === "void"
                    ? 22 + Math.random() * 30
                    : 18 + Math.random() * 22;
              const kind =
                fxKind === "sword" && i % 3 === 0
                  ? "sword"
                  : fxKind === "seal" && i % 4 === 0
                    ? "ring"
                    : "mote";
              spawnParticle({
                x: land.x + (Math.random() - 0.5) * 18,
                y: land.y - 10 + (Math.random() - 0.5) * 10,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * (fxKind === "cloud" ? 0.35 : 0.9) - (fxKind === "dawn" ? 18 : 8),
                life: 0.85 + Math.random() * 0.55,
                max: 1.45,
                color:
                  fxKind === "dawn"
                    ? i % 2 ? "#7a3a2c" : "#6b5f4e"
                    : fxKind === "seal"
                      ? i % 2 ? "#7a3a2c" : "#232429"
                      : fxKind === "void"
                        ? i % 3 === 0 ? "#ece5d2" : "#232429"
                        : fxKind === "sword"
                          ? i % 2 ? "#4a443c" : "#232429"
                          : "#4a443c",
                kind,
                size: kind === "sword" ? 3.1 : kind === "ring" ? 6 : 2.4 + Math.random() * 1.4,
              });
            }
            // 外层墨环 + 内层朱/墨印
            spawnParticle({
              x: land.x,
              y: land.y - 8,
              vx: 0,
              vy: 0,
              life: 0.85,
              max: 0.85,
              color: fxKind === "dawn" || fxKind === "seal" ? "#7a3a2c" : "#232429",
              kind: "ring",
              size: 14,
            });
            spawnParticle({
              x: land.x,
              y: land.y - 8,
              vx: 0,
              vy: 0,
              life: 0.55,
              max: 0.55,
              color: "#7a3a2c",
              kind: "ring",
              size: 7,
            });
            // 二次墨点雨（洗墨感）
            for (let i = 0; i < 12; i++) {
              spawnParticle({
                x: land.x + (Math.random() - 0.5) * 50,
                y: land.y - 40 - Math.random() * 30,
                vx: (Math.random() - 0.5) * 8,
                vy: 18 + Math.random() * 28,
                life: 0.7 + Math.random() * 0.4,
                max: 1.2,
                color: i % 4 === 0 ? "#7a3a2c" : "#232429",
                kind: "mote",
                size: 1.2 + Math.random() * 1.8,
              });
            }
          }
        }
      }
    });

    const handleTap = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      const st = useGame.getState();
      if (!st.started) return;
      const px = nx * cssW;
      const py = ny * cssH;
      const { cx, cy, R } = tribCenter(cssW, cssH, blit);
      // 仙果优先
      if (orb) {
        const ox = cx + Math.sin(orb.a) * R * 0.7;
        const oy = cy + Math.cos(orb.a * 0.65) * R * 0.32;
        if (Math.hypot(px - ox, py - oy) < 22) {
          st.collectOrb(nx, ny);
          return;
        }
      }
      // 建筑热区 → 开宗/提示
      for (const mark of getStamps(st)) {
        const slot = BUILDING_SLOTS[mark.id];
        if (!slot) continue;
        const p = slotXY(slot.nx, slot.ny, cssW, cssH, blit);
        // 用 hw/hh 较大边作热区，利于山麓香案等碑亭点中
        const box = blit ? blit.dw * Math.max(slot.hw, slot.hh) : 48;
        const hit = Math.max(32, box * 0.48);
        if (Math.hypot(px - p.x, py - p.y) < hit) {
          if (mark.locked) useGame.getState().pushToast("机缘未至");
          else useGame.getState().openSect(mark.id);
          return;
        }
      }
      // 空白轻点（非拖拽）→ 开光劫核；不要求点中小核。拖拽仍由 threshold 12px 平移。
      st.click(nx, ny);
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (!useGame.getState().started) return;
      if (ev.target !== canvas) return;
      drag.on = true;
      drag.moved = false;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      drag.lx = ev.clientX;
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!drag.on) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.moved && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        drag.moved = true;
        drag.lx = ev.clientX;
      }
      if (drag.moved) {
        // 横向滑动镜头;纵向不跟手
        const worldW = cssW * WORLD_K;
        cam.pan = Math.max(0, Math.min(worldW - cssW, cam.pan - (ev.clientX - drag.lx)));
        drag.lx = ev.clientX;
      }
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!drag.on) return;
      const moved = drag.moved;
      drag.on = false;
      if (!moved) handleTap(ev.clientX, ev.clientY);
    };
    const onGlobalDown = (ev: PointerEvent) => {
      if (ev.target !== canvas) drag.on = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointerdown", onGlobalDown, true);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      cssW = parent.clientWidth;
      cssH = parent.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(120, Math.floor(cssW * dpr));
      canvas.height = Math.max(180, Math.floor(cssH * dpr));
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
      // Size/DPR changed → rebuild mountain cache on next syncBlit
      mountainCache = null;
      mountainCacheKey = "";
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const paintBuildings = (band: 0 | 1 | 2, st: ReturnType<typeof useGame.getState>, painted: boolean) => {
      const w = cssW;
      const h = cssH;
      for (const def of BAND_CACHE[band]) {
        const slot = BUILDING_SLOTS[def.id];
        if (!slot) continue;
        const lv = st.buildings[def.id] ?? 0;
        const idx = BUILDING_INDEX.get(def.id) ?? 0;
        const prevOk =
          idx <= 0 ||
          (st.buildings[BUILDINGS[idx - 1].id] ?? 0) > 0 ||
          (def.id === "alchemy" && ((st.buildings.mine ?? 0) > 0 || st.layer >= 8));
        if (!prevOk && lv <= 0) continue;
        const p = slotXY(slot.nx, slot.ny, w, h, blit);
        const s = blit ? blit.dw * slot.hw : 56;
        if (lv <= 0) {
          // 未解锁:淡色虚印地基(从无到有的起点),不再画废墟;纯矢量,不依赖贴图
          drawSiteFx(ctx, p.x, p.y, 0, time, def.id, s, false, band);
          continue;
        }
        const fl = buildingFlash[def.id] ?? 0;
        if (fl > 0) drawUpgradeBurst(ctx, p.x, p.y, Math.min(1, fl), !!buildingTierUp[def.id]);
        ctx.save();
        if (fl > 0) ctx.globalAlpha = 0.88 + Math.min(1, fl) * 0.12;
        // 有融合块的建筑已画死在块里,不再画 sprite(真融合路线)
        if (painted) {
          if (!(lv > 0 && FUSED_IDS.has(def.id)))
            drawSiteFx(ctx, p.x, p.y, lv, time, def.id, s, false, band);
        } else drawProceduralBuilding(ctx, def, p.x, p.y, lv, time);
        ctx.restore();
        drawBuildingLabel(ctx, def.id, def.name, p.x, p.y, time);
      }
    };

    const paintWalkers = (minNy: number, maxNy: number) => {
      const w = cssW;
      const h = cssH;
      for (const wk of walkers) {
        const p = pathPoint(wk.s, w, h, blit, wk.path, wk.jitter);
        const ny = p.y / h;
        if (ny < minNy || ny >= maxNy) continue;
        const sc = 0.72 + ny * 0.28;
        drawCultivator(ctx, p.x, p.y, wk.v, time + wk.bob, sc, wk.sp >= 0 ? 1 : -1);
      }
    };

    let raf = 0;
    let pageVisible = typeof document !== "undefined" ? !document.hidden : true;

    const tick = (now: number) => {
      if (!running) return;
      if (!pageVisible) {
        raf = 0;
        return;
      }
      try {
        tickFrame(now);
      } catch (err) {
        console.warn(err);
      }
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible && running && raf === 0) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tickFrame = (now: number) => {
      if (!running) return;
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.1);
      acc += dt;
      while (acc >= 1 / 30) {
        useGame.getState().tick(1 / 30);
        acc -= 1 / 30;
      }
      time += dt;
      trauma = Math.max(0, trauma - dt * 1.8);
      flash = Math.max(0, flash - dt * 1.6);
      boltFlash = Math.max(0, boltFlash - dt * 2.4);
      vortexPulse = Math.max(0, vortexPulse - dt * 2.4);
      orbTimer -= dt;
      lightningT -= dt;
      for (const k of Object.keys(buildingFlash)) {
        buildingFlash[k] = Math.max(0, buildingFlash[k] - dt * 1.15);
      }

      const w = cssW;
      const h = cssH;
      const st = useGame.getState();
      if (now - lastDpsAt > 500) {
        cachedDps = totalDps(st);
        lastDpsAt = now;
      }
      const dps = cachedDps;
      const targetWalkers = Math.min(
        18,
        3 + Math.floor((st.disciples.length + Object.values(st.buildings).reduce((a, b) => a + (b > 0 ? 1 : 0), 0)) * 0.6),
      );
      while (walkers.length < targetWalkers) {
        walkers.push(makeWalker(walkers.length));
      }
      while (walkers.length > targetWalkers) walkers.pop();

      const { cx, cy, R } = tribCenter(w, h, blit);

      if (orbTimer < 0 && !orb && st.started) {
        orb = { a: Math.random() * Math.PI * 2, life: 11 };
        orbTimer = (22 + Math.random() * 16) / (1 + 0.04 * (st.buildings.mirror ?? 0));
      }
      if (orb) {
        orb.life -= dt;
        orb.a += dt * 0.7;
        if (orb.life <= 0) orb = null;
      }

      /** 雷劫：从劫云劈下分叉闪电，落点对准目标；big=破境大雷 */
      const strikeAt = (tx: number, ty: number, big: boolean) => {
        const pts: { x: number; y: number }[] = [];
        const branches: { x: number; y: number }[][] = [];
        let x = cx + (Math.random() - 0.5) * R * 0.9;
        let y = cy + R * 0.22;
        pts.push({ x, y });
        const segs = big ? 9 : 7;
        for (let i = 0; i < segs; i++) {
          x += (tx - x) * 0.24 + (Math.random() - 0.5) * 26;
          y += (ty - y) * 0.24 + (Math.random() - 0.35) * 10;
          pts.push({ x, y });
          if (Math.random() < (big ? 0.6 : 0.45)) {
            const bx = x + (Math.random() - 0.5) * 44;
            const by = y + 14 + Math.random() * 26;
            branches.push([
              { x, y },
              { x: (x + bx) / 2 + (Math.random() - 0.5) * 10, y: (y + by) / 2 },
              { x: bx, y: by },
            ]);
          }
        }
        pts.push({ x: tx, y: ty });
        bolt = { pts, branches, life: big ? 0.3 : 0.22 };
        boltFlash = Math.max(boltFlash, big ? 0.5 : 0.26);
        trauma = Math.min(1, trauma + (big ? 0.3 : 0.15));
      };
      /** 落点：优先劈向已解锁建筑，否则劈向劫云正下方地面 */
      const strikeRandomTarget = (big: boolean) => {
        const st2 = useGame.getState();
        const ownedIds = BUILDINGS.map((b) => b.id).filter((id) => (st2.buildings[id] ?? 0) > 0);
        let tx: number;
        let ty: number;
        if (ownedIds.length > 0 && Math.random() < 0.7) {
          const id = ownedIds[Math.floor(Math.random() * ownedIds.length)];
          const slot = BUILDING_SLOTS[id];
          const p = slot ? slotXY(slot.nx, slot.ny, w, h, blit) : null;
          tx = (p ? p.x : w * 0.5) + (Math.random() - 0.5) * 20;
          ty = (p ? p.y : h * 0.7) - 12;
        } else {
          tx = cx + (Math.random() - 0.5) * R * 2;
          ty = cy + R * 2.4 + Math.random() * h * 0.08;
        }
        strikeAt(tx, ty, big);
      };
      if (pendingBolt) {
        pendingBolt = false;
        strikeRandomTarget(true);
      }
      if (lightningT < 0) {
        // 5–12s 一道，节奏错落，不频繁
        lightningT = 5 + Math.random() * 7;
        strikeRandomTarget(false);
      }
      if (bolt) {
        bolt.life -= dt;
        if (bolt.life <= 0) bolt = null;
      }

      const owned = BUILDINGS.filter((b) => (st.buildings[b.id] ?? 0) > 0);
      const fireRate = Math.min(12, 1 + Math.log10(dps + 1) * 2.6);
      if (dps > 0 && owned.length && Math.random() < fireRate * dt) {
        const def = owned[Math.floor(Math.random() * owned.length)] ?? BUILDINGS[0];
        const slot = BUILDING_SLOTS[def.id];
        const origin = slot ? slotXY(slot.nx, slot.ny, w, h, blit) : { x: w * 0.5, y: h * 0.75 };
        const sx = origin.x;
        const sy = origin.y;
        const dx = cx - sx;
        const dy = cy - sy;
        const len = Math.hypot(dx, dy) || 1;
        // 投射物色压向墨/朱砂，避免霓虹感；spark→软墨点
        const inkish =
          def.color === "#a63d32" || def.color === "#6e2a24"
            ? def.color
            : def.projectile === "sword"
              ? "#4a443c"
              : "#232429";
        spawnParticle({
          x: sx,
          y: sy,
          vx: (dx / len) * 48,
          vy: (dy / len) * 48,
          life: 0.95,
          max: 0.95,
          color: inkish,
          kind: def.projectile === "sword" ? "sword" : "mote",
          size: def.projectile === "sword" ? 2.2 : 1.9,
        });
      }

      for (const wk of walkers) {
        if (wk.pause > 0) {
          wk.pause -= dt;
          continue;
        }
        const steep = pathSteepAt(wk.s, wk.path);
        // 陡阶减速；平台略恢复
        const speedMul = Math.max(0.32, 1 - steep * 0.58);
        wk.s += wk.sp * dt * speedMul;
        if (wk.s > 1) {
          wk.s = 1;
          wk.sp *= -1;
          wk.pause = 0.35 + Math.random() * 0.7;
        } else if (wk.s < 0) {
          wk.s = 0;
          wk.sp *= -1;
          wk.pause = 0.35 + Math.random() * 0.7;
        } else {
          // 折点偶停，像贴阶喘息
          const corner = pathCornerNear(wk.s, wk.path);
          if (corner > 0.55 && Math.random() < dt * (0.55 + corner * 0.9)) {
            wk.pause = 0.35 + Math.random() * 1.05;
          }
        }
      }

      const ownedIds = new Set(st.disciples.map((d) => d.id));
      for (let i = guests.length - 1; i >= 0; i--) {
        if (!ownedIds.has(guests[i].id)) guests.splice(i, 1);
      }
      for (const d of st.disciples) {
        if (guests.some((g) => g.id === d.id)) continue;
        const def = DISCIPLES.find((x) => x.id === d.id);
        const slot = LANDINGS[guests.length % LANDINGS.length];
        guests.push({
          id: d.id,
          rarity: def?.rarity ?? 0,
          nx: slot.nx + (Math.random() - 0.5) * 0.04,
          ny: slot.ny + (Math.random() - 0.5) * 0.02,
          enter: 0,
          enterMax: 1.7,
          fromX: 0,
          fromY: 0,
          name: def?.name ?? "",
          v: guests.length % 6,
          bob: Math.random() * 8,
          ang: Math.random() * Math.PI * 2,
          slash: 1.2 + Math.random() * 2,
        });
      }
      for (const g of guests) {
        if (g.enter > 0) g.enter = Math.max(0, g.enter - dt);
        if (g.rarity >= 3 && g.enter <= 0) {
          g.ang += dt * (0.45 + g.rarity * 0.05);
          g.slash -= dt;
          if (g.slash <= 0) {
            g.slash = 2.4 + Math.random() * 1.4;
            spawnParticle({
              x: cx,
              y: cy,
              vx: Math.cos(g.ang) * 40,
              vy: Math.sin(g.ang) * 20,
              life: 0.45,
              max: 0.45,
              color: "#7a3a2c",
              kind: "sword",
              size: 3,
            });
            vortexPulse = Math.max(vortexPulse, 0.5);
          }
        }
      }
      for (const b of cranes) {
        b.x += b.sp * dt;
        b.ph += dt;
        // 宽航线穿越天空；回流时抬高一点
        if (b.x > 1.28) {
          b.x = -0.24;
          b.y = 0.02 + Math.random() * 0.14;
          b.sc = 1.1 + Math.random() * 0.55;
        } else if (b.x < -0.24) {
          b.x = 1.28;
          b.y = 0.02 + Math.random() * 0.14;
          b.sc = 1.1 + Math.random() * 0.55;
        }
      }
      for (const m of motes) {
        m.y -= m.sp * dt * 0.35;
        m.x += Math.sin(time * 0.4 + m.ph) * dt * 0.02;
        if (m.y < 0.12) {
          m.y = 0.78;
          m.x = Math.random();
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        if (p.life <= 0) particles.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.life -= dt;
        f.y -= 22 * dt;
        if (f.life <= 0) floaters.splice(i, 1);
      }

      const shake = trauma * trauma;
      const ox = st.shakeOn ? Math.sin(time * 38) * 5 * shake : 0;
      const oy = st.shakeOn ? Math.cos(time * 31) * 4 * shake : 0;
      const dpr = canvas.width / Math.max(1, w);

      ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      drawSky(ctx, w, h);
      const painted = syncBlit(w, h);

      for (const crane of cranes) {
        const p = slotXY(crane.x, crane.y, w, h, blit);
        const by = p.y + Math.sin(time * 1.1 + crane.ph) * 7;
        const face = crane.sp >= 0 ? 1 : -1;
        // 轻墨迹（3 点），不堆粒子数组
        ctx.save();
        for (let k = 1; k <= 3; k++) {
          ctx.globalAlpha = 0.07 / k;
          ctx.fillStyle = "#232429";
          ctx.beginPath();
          ctx.arc(p.x - face * k * 8 * crane.sc, by + Math.sin(time + crane.ph + k) * 1.5, 1.4 / k, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        drawCraneFly(ctx, p.x, by, time + crane.ph, 46 * crane.sc, face);
      }

      for (const m of motes) {
        ctx.globalAlpha = 0.14 + 0.1 * Math.sin(time + m.ph);
        ctx.fillStyle = "#232429";
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (!painted) {
        drawDistantPeaks(ctx, w, h);
        drawPeaks(ctx, w, h, 0);
      }
      // 山间石径：始终绘制，弟子行走的路看得见
      drawPath(ctx, w, h, blit);
      drawTribCloud(ctx, cx, cy, R * (1.18 + vortexPulse * 0.07), vortexPulse, time);

      paintBuildings(0, st, painted);
      paintWalkers(0, 0.4);

      if (!painted) {
        drawPeaks(ctx, w, h, 1);
        drawWaterfall(ctx, w, h, time);
      }
      paintBuildings(1, st, painted);
      paintWalkers(0.4, 0.62);

      if (!painted) {
        drawPeaks(ctx, w, h, 2);
      }
      paintBuildings(2, st, painted);
      paintWalkers(0.62, 1.1);
      if (!painted) {
        drawBandMist(ctx, w, h, 2);
        drawForeground(ctx, w, h);
      }

      const focus = st.focusBuilding;
      for (const mark of getStamps(st)) {
        const slot = BUILDING_SLOTS[mark.id];
        if (!slot) continue;
        const p = slotXY(slot.nx, slot.ny, w, h, blit);
        if (focus === mark.id) {
          const pulse = 0.45 + 0.35 * Math.sin(time * 4);
          ctx.strokeStyle = `rgba(166,61,50,${pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 18 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      const shownGuests = guests.slice(0, 8);
      for (const g of shownGuests) {
        const land = slotXY(g.nx, g.ny, w, h, blit);
        if (g.enter > 0) {
          const em = g.enterMax > 0 ? g.enterMax : 1.7;
          const u = 1 - g.enter / em;
          const ease = 1 - (1 - u) * (1 - u) * (1 - u);
          const x = g.fromX + (land.x - g.fromX) * ease;
          const y = g.fromY + (land.y - g.fromY) * ease;
          drawSwordRider(ctx, x, y, time + g.bob, 1.15, land.x >= g.fromX ? 1 : -1, g.rarity);
          ctx.save();
          ctx.font = "700 14px 'Noto Serif SC', serif";
          ctx.textAlign = "center";
          ctx.strokeStyle = "rgba(243,238,228,0.85)";
          ctx.lineWidth = 4;
          ctx.strokeText(g.name, x, y - 18);
          ctx.fillStyle = "#232429";
          ctx.fillText(g.name, x, y - 18);
          ctx.restore();
        } else if (g.rarity >= 3) {
          const dash = g.slash < 0.28 ? 1 - g.slash / 0.28 : 0;
          const rad = R * (2.35 - dash * 0.35);
          const x = cx + Math.cos(g.ang) * rad;
          const y = cy + Math.sin(g.ang) * R * 0.72 + 10;
          drawSwordRider(ctx, x, y, time + g.bob, 1.55, Math.cos(g.ang) > 0 ? 1 : -1, g.rarity);
        } else {
          drawCultivator(ctx, land.x, land.y, g.v, time + g.bob, 1.45, 1);
        }
      }

      if (bolt) {
        // 三层辉光：外晕蓝 → 中层冷白 → 核心纯白
        const a = Math.min(1, bolt.life * 5);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        const passes: Array<[string, number]> = [
          [`rgba(140,190,255,${a * 0.35})`, 7],
          [`rgba(225,240,255,${a * 0.85})`, 3],
          [`rgba(255,255,255,${a})`, 1.2],
        ];
        const traceBolt = () => {
          ctx.beginPath();
          ctx.moveTo(bolt!.pts[0].x, bolt!.pts[0].y);
          for (const p of bolt!.pts) ctx.lineTo(p.x, p.y);
          for (const br of bolt!.branches) {
            ctx.moveTo(br[0].x, br[0].y);
            for (let i = 1; i < br.length; i++) ctx.lineTo(br[i].x, br[i].y);
          }
        };
        for (const [style, lw] of passes) {
          ctx.strokeStyle = style;
          ctx.lineWidth = lw;
          traceBolt();
          ctx.stroke();
        }
        // 落点冲击环
        const tip = bolt.pts[bolt.pts.length - 1];
        ctx.strokeStyle = `rgba(225,240,255,${a * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, (1 - a) * 30 + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (orb) {
        const oxp = cx + Math.sin(orb.a) * R * 0.85;
        const oyp = cy + Math.cos(orb.a * 0.65) * R * 0.28;
        const pulse = 5 + Math.sin(time * 5) * 1.2;
        ctx.fillStyle = "rgba(166,61,50,0.2)";
        ctx.beginPath();
        ctx.arc(oxp, oyp, pulse + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#7a3a2c";
        ctx.beginPath();
        ctx.arc(oxp, oyp, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ece5d2";
        ctx.fillRect(Math.round(oxp) - 1, Math.round(oyp) - 1, 2, 2);
      }

      for (const p of particles) {
        const a = Math.max(0, p.life / p.max);
        if (p.kind === "ring") {
          ctx.strokeStyle = p.color.startsWith("#a6")
            ? `rgba(166,61,50,${a * 0.85})`
            : `rgba(28,25,20,${a * 0.75})`;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          // 略大扩散半径 → 环感更利落
          ctx.arc(p.x, p.y, (1 - a) * (26 + p.size) + 4, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === "sword") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(0, -1, 11, 2);
          ctx.fillStyle = "#ece5d2";
          ctx.fillRect(9, -2, 3, 4);
          ctx.restore();
        } else if (p.kind === "mote") {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.55, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          // spark/dot：软边墨晕，勿硬圆霓虹点
          ctx.globalAlpha = a * 0.75;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * 1.35, p.size * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * 2.2, p.size * 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.font = "700 13px 'Noto Serif SC', serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(28,25,20,0.55)";
      ctx.lineWidth = 4;
      ctx.strokeText(formatNum(Math.max(0, st.layerHp)), cx, cy + R * 0.82);
      ctx.fillStyle = "#ece5d2";
      ctx.fillText(formatNum(Math.max(0, st.layerHp)), cx, cy + R * 0.82);

      ctx.font = "600 13px 'Noto Sans SC', sans-serif";
      for (const f of floaters) {
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.crit ? "#7a3a2c" : "#232429";
        ctx.fillText(f.n, f.x, f.y);
        ctx.globalAlpha = 1;
      }

      if (flash > 0) {
        ctx.fillStyle = `rgba(242,250,246,${flash * 0.32})`;
        ctx.fillRect(-4, -4, w + 8, h + 8);
      }
      if (boltFlash > 0) {
        // 雷击闪白：冷白色，比普通事件闪更亮更短
        ctx.fillStyle = `rgba(235,244,252,${boltFlash * 0.5})`;
        ctx.fillRect(-4, -4, w + 8, h + 8);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      unsub();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointerdown", onGlobalDown, true);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full touch-none" />;
}
