# 桌面宠物 Little Desktop Buddy — 技术规划

> 两只猫咪的桌面宠物：常驻桌面顶层，支持「自动吸附」与「自由拖放」两种定位模式，跨 macOS / Windows。

## 一、目标与范围

- 桌面上显示 1~2 只猫咪（基于真实猫咪照片制作的素材）
- 定位：用户可拖到任意位置；开启吸附模式后松手自动贴到最近的锚点（屏幕边/角等）
- 平台：macOS（arm64 + x64）、Windows 10/11
- 常驻但不打扰：不占任务栏/Dock、不抢焦点、猫身以外的区域鼠标点击穿透

## 二、技术选型

**推荐：Electron + TypeScript + Vite（渲染层先用纯 DOM/CSS，不引框架）**

| 考量 | 结论 |
|---|---|
| 透明无边框 + 置顶窗口 | Electron 在 mac/win 双平台最成熟 |
| 点击穿透 + 悬停唤醒 | `setIgnoreMouseEvents(true, { forward: true })` 是桌宠的关键能力：整窗穿透、但仍能收到 mousemove 来检测鼠标是否悬停在猫身上，Electron 双平台支持最好 |
| 团队技术栈 | TS/前端栈一致，迭代快 |
| 代价 | 单实例内存 ~80–120MB。备选 **Tauri v2**（~20MB），但透明窗口 + 点击穿透事件转发在 Windows（wry）上坑较多，MVP 不选 |

渲染方案：MVP 用 `<img>` 序列帧切换 + CSS transform 动画即可；后续若做逐帧走路动画再考虑 PixiJS/Canvas。

## 三、架构

```
┌─ Main Process ────────────────────────────────────┐
│ WindowManager   每只猫一个透明小窗口                 │
│ SnapManager     锚点计算 / 吸附缓动移动              │
│ TrayMenu        托盘菜单（模式切换、显示隐藏、退出）   │
│ SettingsStore   electron-store（位置、模式、自启）   │
│ DisplayWatcher  screen API：多显示器插拔、DPI       │
└────────────────────┬──────────────────────────────┘
                     │ IPC：拖拽位移 / 穿透切换 / 设置
┌─ Renderer（每只猫一个）────────────────────────────┐
│ PetSprite       素材渲染（序列帧 + CSS 动画）        │
│ StateMachine    idle / walk / sleep / drag / react │
│ InputLayer      hover 取消穿透、拖拽、单击双击        │
└───────────────────────────────────────────────────┘
```

**每只猫一个独立窗口**（而非一个全屏透明大窗）的理由：

- 拖拽/吸附天然按窗口计算，逻辑简单
- 点击穿透控制粒度合适（猫身上不穿透，其余全穿透）
- 两只猫可以分别放在不同显示器上

## 四、窗口与系统集成要点

| 能力 | 实现 |
|---|---|
| 透明无边框 | `transparent: true, frame: false, hasShadow: false, resizable: false`（Windows 透明窗口要求不可 resize） |
| 置顶 | `setAlwaysOnTop(true, 'floating')`；macOS 用 `'screen-saver'` 级别可浮于全屏应用之上 |
| 不占任务栏/Dock | `skipTaskbar: true`；macOS 可选 `app.dock.hide()`（纯托盘应用） |
| 跨工作区可见 | `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` |
| 点击穿透 | 默认 `setIgnoreMouseEvents(true, { forward: true })`；renderer 检测鼠标进入/离开猫身（透明像素判定或包围盒）时 IPC 切换 |
| 不抢焦点 | `focusable: false`（Windows 上注意与拖拽事件的兼容性，必要时改为 blur 即还焦点） |
| 多屏 DPI | Windows 多显示器不同缩放比时，用 `screen` 模块的 DIP 坐标体系统一计算 |

## 五、定位与吸附（核心交互）

两种模式，托盘菜单可切换：

1. **自由放置**：拖到哪停在哪，松手即持久化
2. **自动吸附**：松手时计算与最近锚点的距离，小于阈值（默认 48px，可配）则以 ~150ms ease-out 缓动贴上去；超过阈值停在原地

**锚点集合**：

- 屏幕四角、四边中点
- 底部「地面」：基于 `display.workArea`（而不是 `bounds`），自动避开 Windows 任务栏 / macOS Dock
- 后续：用户自定义锚点（拖到某处后托盘点「钉在这里」）

**实现细节**：

- 拖拽不用 `-webkit-app-region: drag`（与 click 事件冲突、拿不到 drag-end 时机做吸附）。改为：renderer `pointerdown` 记录窗口内偏移 → 拖动期间节流上报屏幕坐标 → main `setPosition`；`pointerup` 触发吸附判定
- 吸附动画在 main 里做 easing 逐帧 `setPosition`
- 持久化：按 `display.id` 存 `{ x, y, anchorId, mode }`；显示器拔掉后回落到主屏对应锚点
- 越界保护：clamp 到 workArea 内，至少露出 30% 猫身

## 六、动画与行为状态机

```
idle ──闲置 N 分钟──▶ sleep（Zzz 气泡）
 │  ▲                    │ 鼠标靠近/点击
 │  └────────────────────┘
 ├─ 被拖起 ──▶ drag（四脚朝天/惊讶姿势）──松手──▶ idle
 ├─ 单击 ──▶ react（摸头爱心）──▶ idle
 └─ 吸附在底边且随机触发 ──▶ walk（沿地面散步）──▶ idle
```

- idle：呼吸起伏（scaleY 微动）+ 随机眨眼
- 两只猫各自独立状态机，行为参数（散步频率、睡觉倾向）按猫的性格配置

**素材方案**：

- 方案 A（MVP）：照片抠图（去背景）→ 每猫 3~5 个姿势 → CSS 变换做动画
- 方案 B（升级）：用 AI 将照片转成统一卡通/像素风 sprite sheet，做逐帧动画

## 七、托盘与设置

- 每只猫显示/隐藏开关
- 模式切换：自由放置 / 自动吸附
- 贴边散步开关
- 开机自启：`app.setLoginItemSettings`
- 退出

## 八、打包发布

- electron-builder：macOS dmg（universal），Windows NSIS
- macOS 签名+公证（自用可 ad-hoc，首次右键打开）；Windows 无签名有 SmartScreen 提示，自用可忽略
- （可选，后期）electron-updater + GitHub Releases 自动更新

## 九、里程碑

| 阶段 | 内容 | 预估 |
|---|---|---|
| M1 骨架 | 脚手架；透明置顶窗口；静态猫图；手动拖拽；点击穿透 | 0.5~1 天 |
| M2 吸附与记忆 | 锚点吸附+缓动；位置持久化；多显示器；托盘菜单 | 1 天 |
| M3 灵魂注入 | 素材处理；状态机动画；两只猫并存；点击交互 | 1~2 天 |
| M4 成品 | 开机自启；mac/win 打包；应用图标；README | 1 天 |

## 十、需要准备的素材

1. **每只猫 3~5 张照片**：坐姿/站姿（侧面更好）、睡觉蜷成一团、可选一张抬头看镜头；背景尽量干净、光线均匀，猫主体 ≥ 500px
2. **两只猫的名字 + 一句性格描述**（映射到行为参数：粘人的多散步多求摸，高冷的多睡觉）
3. **风格选择**：真实照片抠图风 / AI 卡通化 / 像素风
