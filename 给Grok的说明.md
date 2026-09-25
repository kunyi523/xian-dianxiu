# 给 Grok：把《仙途点修》做成 App

## 这是什么
《仙途点修》是一款水墨古风修仙主题的点击放置网页游戏（太空点击 / space clicker 类）。
玩家点击劫云造成伤害、收集"山息"、建造升级 8 栋建筑、收弟子、渡劫转生。
技术栈：React 19 + Vite + Zustand + Canvas 2D，无后端、无登录，纯前端，`npm run build` 后就是静态文件，可直接部署。

## 目标
请把它做成一个**手机 App**（iOS 优先要能在 iPhone/iPad 上安装运行，Android 顺带最好）。
建议路线：Capacitor / Cordova 套壳（把 `dist/` 包进去即可），或 PWA（`index.html` 里已有 apple-touch-icon，可"添加到主屏幕"）。

## 构建与运行
```bash
npm install
npm run dev      # 本地开发
npm run build    # 产出 dist/，部署这个目录即可
```

## 目录结构
- `src/game/` — 游戏全部代码
  - `ui.tsx` — 界面（顶栏/点化区/Sheet/底栏）
  - `ink.ts` — Canvas 世界渲染（山水、建筑、特效）
  - `WorldCanvas.tsx` — 世界画布组件
  - `store.ts` / `sim.ts` — 数值与状态（**不要改数值**）
- `public/bg/` — 背景：`bg_panorama.jpg`（主背景）+ `fused_block/`（8 栋建筑 × 5 个等级 = 40 张"长在山里"的建筑状态图）
- `public/fx/` — 特效帧：`jielei_f1..f6`（雷劫云）、`xianqi_f1..f6`（仙气）、`crane_fly_1/2`（仙鹤）
- `public/sprites/` — UI 图标：`mascot.png`（白鹤吉祥物）、`disciple-*.png`（弟子）、`portrait-*.jpg`（立绘）

## 必须遵守（玩家定的铁律）
1. **不要改任何数值**：首次渡劫 5000、点击伤害=1%秒伤、劫层每层+0.8%、道果加成 0.3×√道果、建筑基础伤害 31/160/720/4400/21000/117000。
2. **不要改购买、点击、升级逻辑**，不要动 `store.ts` / `sim.ts` 的数值部分。
3. 建筑 0 级显示废墟，1~9/10~24/25~39/40+ 级分别显示 T1~T4，共 5 个阶段，图片在 `public/bg/fused_block/{id}_t{0..4}.png`，建筑 ID：`hall, house, sword, array, mine, tower, mirror, alchemy`。
4. 布局（顶栏/点化区/Sheet/底栏）不要动，只做 App 套壳和必要的移动端适配。
5. 游戏存档在 localStorage，套壳时保证 WebView 的 localStorage 可用。

## 当前状态
- 网页版已完成、可玩，`npm run build` 通过。
- 需要的是：能装到手机上的 App 包（或 TestFlight / PWA 链接），玩家在 iPhone/iPad 的 Safari 里能直接玩。
