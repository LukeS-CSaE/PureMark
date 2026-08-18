# PRD · 设置界面取消左栏卡片

> 类型：增量需求 PRD（聚焦变更部分） · 简单 PRD 格式
> 关联代码：`src/components/dialogs/SettingsPanel.tsx`、`src/styles/layout.css`（`.settings-nav` / `.settings-group` / `.settings-popover`）

## 1. 产品目标（一句话）

移除设置面板左侧导航的「卡片」容器样式，改为更轻量、与主内容更融合的导航呈现。

## 2. 背景与现状（对照真实代码）

- 设置面板 `SettingsPanel.tsx`：左侧 `nav.settings-nav` + 右侧 `div.settings-body`；分区 `SECTIONS = 外观 / 编辑器 / 快捷键`。
- **左栏「卡片」样式来源**（`src/styles/layout.css` 约 603–615 行 `.settings-nav`）：
  ```css
  .settings-nav{
    width:184px; flex:none; display:flex; flex-direction:column; gap:2px;
    padding:10px 8px;
    background: var(--surface);          /* 浮起卡片底 */
    box-shadow: var(--shadow-1);          /* 阴影 */
    border-radius: var(--radius-card);    /* 圆角 */
  }
  ```
  即一个带背景 + 阴影 + 圆角的「浮起卡片」。
- 右侧 `.settings-group` 本身是「标题 + 分隔线」列表（非卡片），**无需改动**。
- 外层 `.settings-popover` = `.popover`（亚克力磨砂 + 阴影 + 圆角），是模态容器，**保留**。

## 3. 用户故事

- 作为用户，我希望设置左栏更轻量、不突兀，和右侧内容更连贯，而不是一个浮起的卡片。
- 作为用户，我希望分区导航仍清晰可辨（当前 / 选中态明显）。

## 4. 需求池

### P0（必须）
1. **移除 `.settings-nav` 卡片视觉**：`background: var(--surface)` → 透明或极淡底；去掉 `box-shadow: var(--shadow-1)`；`border-radius: var(--radius-card)` → 0 或极小；`padding` 调整为与内容对齐（如 `10px 4px`）。
2. **用分隔线替代卡片边界**：在 `.settings-nav` 与 `.settings-body` 之间增加 1px `var(--hairline)` 竖分隔线（当前仅 `gap:18px` 无分隔），使「轻量导航 + 内容」结构清晰。
3. **选中态保留且更轻**：`.settings-nav-item.active` 维持 `var(--primary-soft)` 底 + `var(--primary)` 文字（已足够清晰），可微调圆角 / 内距保持可读。
4. **布局兼容**：`.settings`（flex 容器）去卡片后仍正常；左栏宽度可略减（如 176px）或保持 184px 但无背景。

### P1（应该）
5. **微交互保持**：hover `var(--surface-2)` 保留，与整体交互一致。
6. **窄屏适配**：设置弹窗 `60vw / 80vh`，左栏在极窄时仍可读（当前内容少，影响低）。
7. **分区增多可滚动**：轻量导航列表已 `overflow-y:auto; scrollbar-width:none`，保持。

### P2（可选）
8. 可选：左栏分区项前图标保留（已是 `Icon`），或改为更紧凑纯文字。
9. 与整体「去卡片 / 轻量化」设计语言对齐审查（如侧栏、状态栏是否也有类似卡片可统一）。

## 5. UI / 交互设计稿

### 现状（卡片）
```text
┌──────────────────────────────────────┐
│ 设置                         [X]      │
│ ┌──────────┐ ┌──────────────────────┐ │
│ │[▦]外观   │ │ 主题  [浅][深][跟随] │ │
│ │[✎]编辑器 │ │ 主题色 [sw][sw]...   │ │
│ │[⌨]快捷键 │ │ ...                   │ │
│ └──────────┘ └──────────────────────┘ │
└──────────────────────────────────────┘
   ↑ 左栏带 surface 背景 + 阴影 + 圆角 = 卡片
```

### 目标（轻量）
```text
┌──────────────────────────────────────┐
│ 设置                         [X]      │
│ 外观       │ 主题  [浅][深][跟随]     │
│ 编辑器     │ 主题色 [sw][sw]...       │
│ 快捷键     │ ...                       │
│            │                          │
└────────────┴──────────────────────────┘
   ↑ 左栏无背景 / 无阴影，仅竖分隔线；选中项用 accent 软底
```

### 建议 CSS 变更（示意）
```css
.settings-nav{
  width:176px; flex:none; display:flex; flex-direction:column; gap:2px;
  padding:10px 4px;
  background:transparent;                  /* 去卡片底 */
  box-shadow:none;                         /* 去阴影   */
  border-radius:0;                         /* 去圆角   */
  border-right:1px solid var(--hairline);  /* 轻分隔线 */
}
```

## 6. 对现有功能的影响与风险

- **影响 1**：纯视觉层改动，不涉及状态 / 逻辑；`SECTIONS` 数据结构不变。
- **影响 2**：`.settings-popover` 仍是亚克力 popover 容器，保留；仅其内部的 `.settings-nav` 去卡片。
- **风险**：去背景后，若主面板背景与左栏同色，选中态需足够对比（现有 `primary-soft` 可保证）。
- **风险**：如其它地方（侧栏 Explorer、状态栏）也用类似卡片，建议本项目仅改设置左栏，统一化列为 P2。

## 7. 待确认问题

1. **去卡片后左栏是否需要一条竖分隔线**，还是完全无边界仅靠间距（**默认建议加 1px hairline 分隔线**）？
2. 左栏宽度是否保持 184px 或收窄（**默认建议 176px 左右**）？
3. 选中态是否维持现有 `primary-soft` 软底，还是改为左侧 accent 竖条（更轻量）？
4. 是否顺带统一其它界面的卡片风格（P2，**默认仅改设置左栏**）？
