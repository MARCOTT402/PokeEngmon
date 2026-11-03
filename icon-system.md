# PokeEngmon Icon 设计制度 v1.0

> 日期：2026-11-03
> 参考基准：Duolingo 图标美学（手工矢量、全填充、极圆润、色彩编码）× Pokémon 官方色彩体系
> 适用范围：正式版 index.html 与原型 prototype/*.html 的全部图标

---

## 1. 决策记录

| 决策项 | 结论 | 备注 |
|---|---|---|
| 风格方向 | **B 墨线贴纸** | 填充 + 1.8px 墨线描边 + 左上白高光；与现有精灵球/皮卡丘插画语言同源 |
| 主色锚点 | **精灵球红 #EE1515** | CTA/品牌/生命 共用红色家族（同 Duolingo「绿=行动+生命」的收敛逻辑） |
| 交付形式 | 内联 `<symbol>` sprite | file:// 安全、零请求、CSS 变量可穿透 |

## 2. 美学总则

1. **手写矢量**：全部 path 由本仓库自行绘制，禁止第三方图标库（FontAwesome 等）、图标字体、emoji。
2. **全填充（Filled）**：形体靠色块表达；内部细节用「挖空」（背景色）或双色层次，不依赖细线。
3. **极度圆润**：形体仅允许四种原型——圆、圆角矩形、水滴、胶囊；所有转角 `round join`，无锐角。尖角一律改为圆弧收尾。
4. **光学统一**：图形占满 24×24 画布 ≥70%，视觉重心居中；同屏图标光重一致。
5. **色彩即功能**：每枚图标 = 形状语义 + 专属 token 色；看颜色即知功能，表外颜色禁止出现。

## 3. 色彩编码（Pokémon 官方色系）

### 3.1 Token 表

| Token | Hex | 出处 | 语义 |
|---|---|---|---|
| `--pk-red` | #EE1515 | 精灵球红 | **主色**：CTA/品牌、Hearts（生命）、Dex、错误态 |
| `--pk-yellow` | #FFCB05 | 皮卡丘黄 | Star/XP、星级徽章、火焰内焰 |
| `--pk-blue` | #2A75BB | 精灵球蓝 | 信息、日历、链接 |
| `--pk-fire` | #EE8130 | 火系 | Streak 火焰 |
| `--pk-water` | #6390F0 | 水系 | Diamond 宝石 |
| `--pk-electric` | #F7D02C | 电系 | Energy 闪电 |
| `--pk-grass` | #7AC74C | 草系 | Quests、答对/成功 |
| `--pk-fighting` | #C22E28 | 格斗系 | Battle |
| `--pk-psychic` | #F95587 | 超能系 | Quiz/训练 |
| `--pk-fairy` | #D685AD | 妖精系 | Friends |
| `--pk-dragon` | #6F35FC | 龙系 | Leaderboard、Gacha |
| `--pk-steel` | #B7B7CE | 钢系 | 设置（gear） |
| `--pk-ink` | #1B1B22 | 漫画线稿黑 | 全部描边 + 工具类单色图标 |

### 3.2 收敛规则

- 现有 hardcode 色：`#ffb020`→`--pk-fire`、`#57c7ff`→`--pk-water`、`#f7d02c` 保留为 `--pk-electric`、`#1b1b22` 保留为 `--pk-ink`。
- 全站只允许 Token 表颜色 + 中性色（页面底色、白色）。可用脚本 grep 全部 hex 做审计。
- 错误态与 CTA 同为红色：靠形状与语境区分（❌ 形 vs 按钮），与游戏惯例一致。

## 4. 几何规范

| 项 | 规范 |
|---|---|
| 设计画布 | 24×24 viewBox，安全边距 2px |
| 使用尺寸 | 16（chip 内）/ 18 / 22（dock）/ 24（tab）/ 48（空状态、介绍位） |
| 描边 | 1.8px（24px 基准，缩放等比），`--pk-ink`，`stroke-linejoin/linecap: round` |
| 高光 | 白色 65% 不透明度，圆点或圆角短棒，一律置于左上 |
| 双色 | 主形 + 挖空细节（背景色）+ 可选 20% 暗色底片（≥48px 时使用） |
| 禁止 | 渐变、滤镜、blur（项目禁令）、尖角、emoji、描边 <1.5px |

## 5. 图标清单与语义映射（~31 枚）

### 5.1 资源类（彩色贴纸）

| ID | 名称 | 色 | 造型要点 |
|---|---|---|---|
| `i-energy` | 能量 | electric | 水滴形闪电，圆角收尾，ink 描边 |
| `i-gem` | 钻石 | water | 圆角六边形，台面横线挖空 |
| `i-streak` | 连续天数 | fire | 水滴火焰，内焰 yellow 挖空 |
| `i-heart` | 生命 | red | 圆角心形，左上白高光 |
| `i-star` | 星级/XP | yellow | 五角圆润星 |
| `i-dex` | 图鉴 | red | 圆角矩形设备，白屏挖空 + ink 镜头点 |

### 5.2 导航类（彩色）

| ID | 名称 | 色 | 造型要点 |
|---|---|---|---|
| `i-home` | 主页 | red/white | **精灵球造型**：上半 red、下半白、ink 中线 + 圆钮 |
| `i-quiz` | 训练/测验 | psychic | 圆润脑形（替换原闪电，避免与 energy 撞形） |
| `i-quests` | 任务 | grass | 圆角清单纸 + 挖空勾 |
| `i-battle` | 战斗 | fighting | 交叉双剑，圆角刃 |
| `i-gear` | 设置 | steel | 八齿圆角齿轮 |
| `i-board` | 排行榜 | dragon | 三阶圆角领奖台 |
| `i-friends` | 好友 | fairy | 双圆头人形重叠 |
| `i-calendar` | 日历 | blue | 白纸蓝顶 + red 圆点标记 |

### 5.3 工具类（`currentColor` 单色填充，随父级变色）

`i-close` ✕ ｜ `i-back` ‹ ｜ `i-chevron` › ｜ `i-lock` 锁 ｜ `i-volume` 音量 ｜ `i-globe` 地球 ｜ `i-doc` 文档 ｜ `i-info` 信息 ｜ `i-import` 导入 ｜ `i-add-text` 句子题 ｜ `i-add-pic` 图片题 ｜ `i-csv` CSV 上传 ｜ `i-myq` 我的题目 ｜ `i-reset` 重置时钟 ｜ `i-copyright` 版权 ｜ `i-play` 播放 ｜ `i-user` 训练员

> 默认色规则：承载工具图标的父级按钮 `color` 默认为 `var(--pk-ink)`；特殊语境（如深色按钮上）才覆写为白。

## 6. 工程交付

### 6.1 Sprite 结构

- `<svg hidden>` 内联于 `<body>` 顶部，含全部 `<symbol id="i-*" viewBox="0 0 24 24">`。
- 引用：`<svg class="ic" width="22" height="22" aria-hidden="true"><use href="#i-energy"/></svg>`。
- 可交互元素一律保留 `aria-label`，图标本身 `aria-hidden="true"`。

### 6.2 上色机制（关键实现细节）

- **工具类**：path 用 `fill="currentColor"`，由父级按钮 `color` 控制。
- **彩色类**：symbol 内 path 用内联 `style="fill:var(--pk-fire,#EE8130)"`。
  - 注意：CSS 自定义属性会穿透 `<use>` shadow DOM，但**外层 class 选择器不会**——所以必须内联 style 或依赖继承，不能用 `.pk-fire { fill: … }` 这种外层规则。
  - `var()` 兜底值保证 sprite 被单独复制出去时仍可渲染。
- Token 定义于 `:root`，换肤只改一张表。

### 6.3 动效

- 按压：所有可按元素统一 `120ms cubic-bezier(.25,1,.5,1)`。
- 收集类（gem/heart/star）可获得 pop 反馈；错误态 wiggle；全部在 `prefers-reduced-motion: reduce` 下停用。
- 禁止对 icon 使用 blur。

## 7. 验收标准

1. **视觉**：24px 渲染清晰；无表外颜色（hex 审计通过）；同屏图标光重一致。
2. **无障碍**：所有可交互图标所在按钮有 `aria-label`；触控面积 ≥44px（HUD 审计 <44px = 0）。
3. **性能**：capture.mjs 28 图回归，HUD 指标不变——scroll 差 0、FPS 60、CLS 0。
4. **合规**：全文件无 emoji 图标、无第三方图标引用、无 blur/渐变。

## 8. 分阶段落地

| 阶段 | 内容 | 约束 |
|---|---|---|
| Phase 1 | 绘制 sprite + 原型 `home-p1.html` 全量替换现有 25+ 个混杂 SVG；重跑 capture.mjs | 不动正式文件、不升版本、不注册 SW（遵守原型硬约束） |
| Phase 2 | iPhone 5 分钟实测通过后，另开任务迁移 `index.html`，替换全部 emoji 图标 | 遵循 preop-checklist（APP_VERSION/sw.js/index.html 同步规则） |
