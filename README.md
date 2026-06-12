# Little Desktop Buddy 🐈

两只猫咪（淘淘 & 墨墨）的桌面宠物（macOS / Windows），基于 Electron。详细设计见 [PLAN.md](PLAN.md)。

## 下载安装

到 [Releases](https://github.com/lilong7676/little-desktop-buddy/releases) 下载：

- macOS：`.dmg`（arm64 / x64）。未签名，首次启动右键 App → 打开；或执行 `xattr -dr com.apple.quarantine "/Applications/Little Desktop Buddy.app"`
- Windows：`Setup.exe` 安装版或 `portable.exe` 免安装版。SmartScreen 提示时选「仍要运行」

## 玩法

- 🖱️ 摸摸：单击猫身冒爱心，60% 概率说话回应；像素级判定，透明区域不挡鼠标
- 🎬 表演：双击立刻播放随机 AI 动画（伸懒腰/歪头/洗脸/打哈欠）
- 🏀 扔猫：快速甩出去松手——惯性飞行、空中翻滚、落地弹跳
- 🫂 合体：把一只拖到另一只身上松手，合体；闲置后切换抱抱睡照片；双击分开
- 😴 睡觉：闲置后入睡（性格决定快慢），💤 飘起，摸一下叫醒
- 🚶 散步：贴底边时随机散步
- 📌 吸附：托盘可切「自动吸附 / 自由放置」，锚点为四角+四边中点
- 📏 大小：托盘「宠物大小」四档缩放，以脚底为锚点不漂移

## 开发

```bash
npm install
npm run dev
```

首次安装如果 Electron 二进制下载失败，手动执行 `node node_modules/electron/install.js`。

## 打包

```bash
npm run dist:mac   # macOS dmg（arm64 + x64）
npm run dist:win   # Windows nsis + portable
```

CI：推送 `v*` tag 自动构建双平台并发布 GitHub Release（见 `.github/workflows/build.yml`）。

## 使用

- 两只猫常驻桌面顶层，鼠标不在猫身上时窗口完全点击穿透
- 鼠标悬停猫身可拖拽；菜单栏 🐈 托盘可切换「自动吸附 / 自由放置」、显示/隐藏单只猫、退出
- 吸附模式：松手时距最近锚点（四角 + 四边中点，基于 workArea）48px 内自动缓动贴附
- 位置按显示器持久化在 `~/Library/Application Support/little-desktop-buddy/settings.json`

## 素材管线

原始照片放 `cats/`，用系统 Vision 框架抠图：

```bash
swift scripts/cutout.swift cats/photo.jpg assets/cutouts
sips -Z 512 assets/cutouts/xxx.png --out src/renderer/public/sprites/<pet>_<pose>.png
```

新 sprite 注册在 `src/main/pets.ts`。

## 目录结构

- `src/main/` 主进程：窗口、吸附（snap.ts）、托盘、持久化
- `src/preload/` contextBridge API
- `src/renderer/` 猫的渲染、呼吸/拖拽动画、穿透切换
- `scripts/cutout.swift` Vision 抠图脚本
