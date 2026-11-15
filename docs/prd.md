# boardroom 平台 PRD

> 状态：v1.0 定稿（2026-11-16），四轮拷问 + 手机实测之后。每款游戏的规格在 `docs/games/`：
> - [哥布林山脉](games/goblin-mountain.md)（当前）
> - [Zombicide 黑死病](games/zombicide-black-plague.md)（暂停）

## 1. 目标

把作者买的桌游一款一款做成电子版，**在 iPhone 上离线单人玩**，和 Obsidian 深度结合；以后再加双人和联机。

- **只给自己用**（以后加朋友），不公开上线。
- **代码公开，内容私有。** 公开仓库只有引擎、界面、插件和原创测试内容；商业游戏的卡图、卡面数据、规则原文只在作者的 vault 里。
- **一款游戏一个 vault**，放在 iCloud 的 Obsidian 文件夹里（`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/<游戏名>/`），手机和 Mac 自动同步。
- **中英双语**，随时切换。

## 2. 非目标（现在）

- 公开托管、账号、匹配；联机多人（以后要做时再加服务端）。
- 电脑对手。
- 通用桌游规则 DSL：每款游戏的规则用 TypeScript 写，共用部分抽成库。
- 单独的原生 App；PWA 和单文件 HTML 导出放到「之后」。

## 3. 宿主：Obsidian 插件（手机实测通过）

2026-11-16 在作者的 iPhone（iOS 18.7，Obsidian 1.15.1，视口 440×956 @3x，安全区上 62 下 34）上用验证插件实测（`spikes/obsidian-mobile`）：

| 能力 | 结果 | 做法 |
|---|---|---|
| 自定义视图 + 读 vault 图片 | ✅ | `ItemView` + `vault.getResourcePath` |
| 写笔记 | ✅ | `vault.create/modify` |
| 隐藏顶栏和底部导航栏 | ✅ | 游戏打开时给 body 加 class，CSS 隐藏 `.view-header`（只限本视图）、`.mobile-navbar`、`.mobile-toolbar`，关闭视图时移除 |
| 横滑和侧栏手势冲突 | 不拦截时**经常误拉侧栏**；拦截后不会 | 游戏视图根节点上 `touchstart/move/end`、`pointerdown/move` 一律 `stopPropagation` |
| 顶部下拉 | 不触发命令面板 | — |
| 屏幕常亮 | ✅ `navigator.wakeLock` 可用 | 游戏视图可见时申请，隐藏或关闭时释放，切回前台重新申请 |
| 流畅度 | 顺滑 | — |
| WebGL2 | 可用 | 现在用不到 |

开发时同一套界面也能在浏览器里跑（`host-web`），方便调试和自动化测试。

## 4. 架构

```
packages/
  core/            种子随机、对局会话（动作日志、撤销、存档）、待选、i18n、公共类型
  ui/              React 外壳：沉浸框架、底部面板、按钮、语言切换、提示、待选面板、主题
  host-obsidian/   Obsidian 插件：视图、vault 读写、沉浸/手势/常亮、命令、安装脚本
  host-web/        Vite 开发宿主：读 fixtures、localStorage 存档；给浏览器调试和 e2e 用
games/
  goblin-mountain/ 规则引擎、内容包解析和校验、游戏界面、zh/en 文案
fixtures/
  goblin-mountain/ 原创测试卡（原创地点名和数值），测试和文档用
```

### 4.1 引擎约定（参照 BoardOL）

- 状态是纯数据，可以序列化成 JSON。
- `apply(state, action) → { state, events }`：校验、改状态、返回事件；不合法就抛 `RuleError`，带一个文案 key，界面按当前语言显示。
- `legalActions(state)`：给界面高亮用，测试里也用来做随机对局。
- 所有随机都走状态里的 mulberry32 种子。同样的种子加同样的动作 → 同样的局面。
- **待选**：需要玩家选的时候，状态进入 `pending`，界面弹出待选面板；只有一个选项时自动走。
- **手动调整**：一类特殊动作（改骰子点数、改资源、移动骰子），绕过规则、进日志、能撤销。

### 4.2 对局会话（core）

- 一局 = 内容包版本 + 种子 + 选项 + 动作列表。
- 撤销 = 去掉最后一个动作后从头重放；撤销不改变随机结果。
- 存档：`对局/存档/<id>.json`，每个动作后写一次（防抖）；打开 vault 时可以「继续上一局」。
- 结束：写一篇 `对局/<日期> <游戏> <结果>.md`，内容有结果、关键事件、种子和动作列表，链接到用到的卡牌笔记。

### 4.3 内容包

- 游戏数据都是 vault 里的 markdown 笔记（frontmatter + 表格）和图片，人读人改。
- 文件夹、笔记名、表格列名用中文；frontmatter 键和 ID 用英文；列名到字段的映射写在代码里，写错就报人话错误（指出文件、行、列）。
- 插件监听 vault 改动，内容改了就重新加载；**进行中的对局用开局时的内容快照**，不受影响。
- vault 根目录的 `boardroom.json` 声明这是哪款游戏：`{ "game": "goblin-mountain" }`。

### 4.4 双语

- 所有界面文案放在 `zh` 和 `en` 两个文案表里，组件里不写死文字；测试检查两边的 key 完全一致。
- 卡面数据同时有中文名和英文名两列。
- 默认语言跟随 Obsidian 的界面语言（读不到就用系统语言）；右上角「中 / EN」切换，对局不中断，选择存在插件设置里。

### 4.5 手机界面硬要求（每个里程碑的验收标准）

- 以 440×956（作者的手机）为主设计尺寸，375×667（iPhone SE）兜底；竖屏。
- 单手操作：常用操作在屏幕下方 1/3；点击区域不小于 44×44pt。
- 尊重安全区；沉浸模式下自己画一个退出按钮。
- 禁止误触：游戏区域禁用文字选择、长按菜单、双击缩放。
- 每个操作有视觉反馈；音效可开关；不依赖震动。
- 深色主题，跟卡牌的暗色画风一致；数值用大号字。
- 动画流畅，减少动画的系统设置要尊重（`prefers-reduced-motion`）。
- 验收在作者手机上实测，不只看电脑模拟器。

## 5. 技术栈和工程

- TypeScript，npm workspaces，React，esbuild 打插件，Vite 跑 host-web，vitest 跑测试，Playwright 跑 host-web 的 e2e（手机视口）。
- GitHub 公开仓库 `luoxin9510/boardroom`，MIT。CI：类型检查、lint、单元测试、构建插件。
- 安装到 vault：`npm run install:vault -- <vault 路径>`，把构建好的插件拷进 `<vault>/.obsidian/plugins/boardroom/`，iCloud 同步到手机。
- 流程：每个里程碑 spec → ticket → 分支 → PR → CI 绿 → 独立 Opus 审核 → 合并；里程碑之间停下来等作者用手机试玩。
- 文档和代码同一个 PR 更新。

## 6. 之后

PWA 和离线网页版、单文件 HTML 导出、双人同屏、联机（需要 Mac 或 VPS 当服务器）、在笔记里嵌入棋盘（代码块）、Bases 统计所有对局、下一款游戏、恢复 Zombicide。

## 7. 决定记录

拷问第 1、2 轮的 Zombicide 专属决定在 [那份文档](games/zombicide-black-plague.md) 的 §9。平台层面仍然有效的：

1. 手动调整永远保留；规则只高亮、不拦人的「辅助」模式只给 Zombicide 用，小游戏完整执行规则。
2. 撤销不改变随机结果，想重掷就用手动调整。
3. 存档和对局记录放在 vault。
4. 中文字段名和英文 ID 的约定（§4.3）。
5. 引擎核心带待选状态；待选面板预选推荐项，可设「以后都按推荐自动」。
6. 素材由 agent 用脚本处理（切卡、转正、压缩）。
7. 仓库公开、MIT、里程碑流程（§5）。

第 3、4 轮和之后（2026-11-16）：

8. 先做小 PnP 游戏，第一款哥布林山脉，**只做单人**。
9. 中英双语。
10. 手机完全离线独立运行 → 宿主改成 **Obsidian 插件**（实测通过，§3）；浏览器宿主只用于开发和测试。
11. vault 放 iCloud 的 Obsidian 文件夹，一款游戏一个。
12. 本机服务、局域网、联机都推迟到「之后」。
