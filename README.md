# 仙途点修 · 源码包

水墨修仙点击挂机。存档键 `xian-clicker-v1`（建筑 / 弟子 id 勿改）。

## 本地跑起来

```bash
npm i
npm run dev
```

浏览器打开终端给出的地址。技术栈：React 19 · TanStack Start · Vite · Tailwind v4 · Zustand · Canvas 2D。无账号、无数据库。

## 游戏核心（动手从这里开始）

全部玩法都在 `src/game/`：

| 文件 | 干什么 |
|---|---|
| `data.ts` | 建筑、弟子、功法、秘境、点击升级的静态表 |
| `sim.ts` | 花费、DPS、解锁、渡劫公式 |
| `store.ts` | Zustand 状态 + tick + 存档 |
| `ink.ts` | 山体落点 PEAKS、路径、水墨绘制 |
| `WorldCanvas.tsx` | 山图、点击、飞鹤、NPC、粒子 |
| `ui.tsx` | HUD、印鉴底栏、对照卷、教程 |
| `GameShell.tsx` | 壳层、触控、错误恢复 |
| `audio.ts` | 水墨合成音效 |
| `juice.ts` | 点击/升级反馈事件总线 |

入口：`src/routes/index.tsx` → `GameShell`。

美术：`public/sprites/`（残山 / 仙山 JPG、建筑、立绘）。

## 约定

- 建筑 id（`hall` `house` `sword` …）和弟子 id **不要改**，否则旧档废掉。
- 山图落点在 `ink.ts` 的 `PEAKS`：香案 (0.48, 0.58)、茅舍 (0.16, 0.88)、剑冢 (0.80, 0.78)。
- 词表走「开光 / 香火 / 山息 / 拜山 / 云游」，不要写「伤害/秒」。
- 不要出现「一念逍遥 / 一年逍遥」文案或水印。
