# 给 Grok 的接力说明（2026-09-25）

## 当前状态
- 游戏最新版已部署：https://kunyi523.github.io/xian-dianxiu/（GitHub Pages，`gh-pages` 分支，纯静态）
- PWA 已配好：`manifest.webmanifest`、icon 180/192/512、全屏 standalone。iPhone Safari 打开后「分享 → 添加到主屏幕」，就是全屏独立 App 体验。
- 线上版默认开启测试外挂（右下「试」面板），只改了部署包，源码未动。
- 源码在 `game` 分支：https://github.com/kunyi523/xian-dianxiu/tree/game

## 玩家的目标
要在 iPhone/iPad 上像原生 App 一样玩到这个游戏。

## 你之前说的
- main 和 game 是两套不相干的历史（main 是旧 Pages 部署，已被 gh-pages 取代）。
- 你做不了签名 ipa（没有 Xcode）。

## 剩下的路（二选一）
1. **PWA 路线（已完成）**：玩家添加到主屏幕即用，无需签名，这是目前唯一不需要 Mac/开发者账号的方案。
2. **原生 App 路线**：需要一台 Mac + Xcode + Apple Developer 账号（99美元/年），用 Capacitor 把 `dist/` 套壳后 Archive 签名，走 TestFlight 或 App Store。这一步必须有人有 Mac 才能做，我和你都没有。

## 铁律（玩家定的，不要碰）
- 数值：首次渡劫 5000、点击=1%秒伤、劫层每层+0.8%、道果 0.3×√道果、建筑基础伤害 31/160/720/4400/21000/117000。
- 不改购买、点击、升级逻辑，不动 `store.ts` / `sim.ts` 数值部分。
- 布局（顶栏/点化区/Sheet/底栏）不动。
- 存档在 localStorage，套壳保证 WebView 的 localStorage 可用。
