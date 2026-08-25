import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useConfigStore, DEFAULT_CONFIG } from "../../store/useConfigStore";
import { useUIStore } from "../../store/useUIStore";
import { usePanesStore } from "../../store/usePanesStore";
// react-color 的 BlockPicker 取代原生 <input type="color"> 作为主题色取色器。
import { BlockPicker } from "react-color";

import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  MAX_ACCENT_COUNT,
  appendCustomAccent,
  normalizeAccentHex,
  removeCustomAccent,
} from "../../lib/theme";
import type { FileSortOrder, ThemePreference, ViewMode } from "../../types";
import Icon, { type IconName } from "../ui/Icon";
import Toggle from "../ui/Toggle";
import Select from "../ui/Select";
// 版本号单一数据源：直接读 package.json（tsconfig resolveJsonModule 已开启）。
import pkg from "../../../package.json";
// 关于页图标：走 Vite 资源导入（与 Header logo 同模式），不用字符串路径。
import aboutIcon from "../../assets/icon_transparent.png";

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "系统默认 (苹方)", value: DEFAULT_CONFIG.fontFamily },
  { label: "等宽 (Mono)", value: '"JetBrains Mono", "Fira Code", Consolas, monospace' },
  { label: "宋体 (Serif)", value: '"SimSun", "Songti SC", serif' },
  { label: "雅黑 (YaHei)", value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: "PingFang SC", value: '"PingFang SC"' },
];

/** 文件树排序选项。 */
const SORT_OPTIONS: { value: FileSortOrder; label: string }[] = [
  { value: "name-asc", label: "名称 A→Z" },
  { value: "name-desc", label: "名称 Z→A" },
  { value: "type", label: "类型" },
  { value: "modified-desc", label: "修改时间（最新在前）" },
  { value: "modified-asc", label: "修改时间（最早在前）" },
];

/** The three theme choices (iter2 B-1 debt, closed in iter2-ext T01). */
const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "auto", label: "跟随系统", icon: "MonitorCog" },
  { value: "light", label: "浅色", icon: "Sun" },
  { value: "dark", label: "深色", icon: "Moon" },
];

/** Left-hand directory of setting groups. */
const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: "appearance", label: "外观", icon: "Palette" },
  { id: "editor", label: "编辑器", icon: "Edit3" },
  { id: "shortcuts", label: "快捷键", icon: "Keyboard" },
  { id: "about", label: "关于", icon: "Info" },
];

/** 关于页的只读信息行（版本号来自 package.json，不硬编码）。 */
const ABOUT_ROWS: { label: string; value: string }[] = [
  { label: "版本", value: `v${pkg.version}` },
  // { label: "技术栈", value: "Tauri 2 · React · ProseMirror · CodeMirror 6" },
  // { label: "存储方式", value: "本地优先，文档直接读写磁盘文件" },
];

/** Supported shortcuts, grouped by scope. `Mod` matches Ctrl (Win) / ⌘ (Mac). */
const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "通用",
    items: [
      { keys: ["Ctrl", "N"], label: "新建文档" },
      { keys: ["Ctrl", "S"], label: "保存" },
      { keys: ["Ctrl", "W"], label: "关闭当前标签页" },
      { keys: ["Ctrl", "F"], label: "查找" },
    ],
  },
  {
    title: "编辑视图",
    items: [
      { keys: ["Ctrl", "B"], label: "加粗" },
      { keys: ["Ctrl", "I"], label: "斜体" },
      { keys: ["Ctrl", "Shift", "X"], label: "删除线" },
      { keys: ["Ctrl", "E"], label: "行内代码" },
      { keys: ["Ctrl", "K"], label: "插入链接" },
      { keys: ["Ctrl", "Alt", "1"], label: "一级标题" },
      { keys: ["Ctrl", "Alt", "2"], label: "二级标题" },
      { keys: ["Ctrl", "Alt", "3"], label: "三级标题" },
      { keys: ["Ctrl", "Alt", "4"], label: "四级标题" },
      { keys: ["Ctrl", "Alt", "5"], label: "五级标题" },
      { keys: ["Ctrl", "Alt", "6"], label: "六级标题" },
      { keys: ["Ctrl", "Alt", "0"], label: "清除标题" },
    ],
  },
  {
    title: "块操作",
    items: [
      { keys: ["Ctrl", "D"], label: "复制当前块到下方" },
      { keys: ["Alt", "↑"], label: "上移当前块" },
      { keys: ["Alt", "↓"], label: "下移当前块" },
    ],
  },
];

/**
 * Lightweight preferences panel with a directory (left) + detail (right)
 * layout. Edits are written through `useConfigStore` (persisted to
 * settings.json). Changing the default view also switches the current view
 * immediately for feedback.
 */
export default function SettingsPanel() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const setConfigOpen = useUIStore((s) => s.setConfigOpen);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);

  const [active, setActive] = useState("appearance");

  // 新增主题色：react-color 的 BlockPicker 弹层，由“+”色板按钮触发。
  const canAddAccent =
    ACCENT_PRESETS.length + config.customAccents.length < MAX_ACCENT_COUNT;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  // 取色器实时颜色（仅本地预览，提交时才写入配置）。
  const [draftHex, setDraftHex] = useState(
    config.accent === "custom" && config.accentCustom ? config.accentCustom : DEFAULT_ACCENT.primary,
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  /** 点“+”打开取色弹层：先按按钮位置给个初始位，测量后再夹取到视口内。 */
  function openPicker() {
    const el = addBtnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPickerPos({ top: r.bottom + 8, left: r.left });
    }
    setPickerOpen(true);
  }

  /**
   * 弹层渲染后测量其真实尺寸，并把位置夹取到视口内，使其始终贴合「+」按钮、
   * 不超出屏幕：左缘对齐按钮（三角指向按钮），下方放不下则翻到按钮上方，
   * 右/上/下越界则贴边。
   */
  useLayoutEffect(() => {
    if (!pickerOpen || !pickerRef.current || !addBtnRef.current) return;
    const pop = pickerRef.current.getBoundingClientRect();
    const btn = addBtnRef.current.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btn.left; // 左缘对齐按钮，三角指向按钮
    let top = btn.bottom + 8; // 默认在按钮下方

    // 水平：超右边界左移；仍超左则贴左边界。
    if (left + pop.width > vw - margin) left = vw - margin - pop.width;
    if (left < margin) left = margin;

    // 垂直：下方放不下则翻到按钮上方；上方也放不下则贴顶。
    if (top + pop.height > vh - margin) top = btn.top - pop.height - 8;
    if (top < margin) top = margin;

    setPickerPos({ top, left });
  }, [pickerOpen]);

  /** 点击面板内其它区域时关闭取色弹层（点“+”本身除外，由其切换逻辑处理）。 */
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (pickerRef.current?.contains(t) || addBtnRef.current?.contains(t)) return;
      setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  /** 取色器选定一个 hex：命中已有色则直接选中，否则追加并选中。 */
  function pickCustomHex(raw: string): void {
    const hex = normalizeAccentHex(raw);
    if (!hex) return;
    const preset = ACCENT_PRESETS.find((p) => normalizeAccentHex(p.primary) === hex);
    if (preset) {
      update({ accent: preset.id });
      return;
    }
    if (config.customAccents.includes(hex)) {
      update({ accent: "custom", accentCustom: hex });
      return;
    }
    if (!canAddAccent) return;
    update({
      customAccents: appendCustomAccent(config.customAccents, hex),
      accent: "custom",
      accentCustom: hex,
    });
  }

  /** 删除一个自定义主题色；若正在使用则回退到默认色。 */
  function removeAccent(hex: string): void {
    const next = removeCustomAccent(config.customAccents, hex);
    const isActive = config.accent === "custom" && config.accentCustom === hex;
    update(
      isActive
        ? { customAccents: next, accent: DEFAULT_CONFIG.accent, accentCustom: null }
        : { customAccents: next },
    );
  }

  function close() {
    setConfigOpen(false);
  }

  return (
    <div className="overlay-scrim" onClick={close}>
      <div
        className="popover settings-popover"
        style={{ width: "60vw", height: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between  border-border-subtle px-4 py-3">
          <span className="text-[18px] font-semibold tracking-tight">设置</span>
          <button type="button" className="btn-icon" title="关闭" onClick={close}>
            <Icon name="X" size={15} />
          </button>
        </div>

        <div className="settings">
          <nav className="settings-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item${active === s.id ? " active" : ""}`}
                aria-current={active === s.id}
                onClick={() => setActive(s.id)}
              >
                <Icon name={s.icon} size={16} />
                <span>{s.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-body">
            {active === "appearance" && (
              <>
                <div className="settings-group">
                  <span className="settings-group-title">主题</span>
                  <div className="flex w-full min-w-0">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`theme-segment${config.theme === opt.value ? " active" : ""}`}
                        aria-pressed={config.theme === opt.value}
                        title={opt.label}
                        onClick={() => update({ theme: opt.value })}
                      >
                        <Icon name={opt.icon} size={14} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  {config.theme === "auto" && (
                    <span className="mt-1 block text-[11px] text-foreground-subtle">
                      当前跟随系统：{resolvedTheme === "dark" ? "深色" : "浅色"}
                    </span>
                  )}
                </div>

                <div className="settings-group">
                  <span className="settings-group-title">
                    主题色（{ACCENT_PRESETS.length + config.customAccents.length}/{MAX_ACCENT_COUNT}）
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {ACCENT_PRESETS.map((preset) => {
                      const on = config.accent === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`accent-swatch${on ? " active" : ""}`}
                          style={{ background: preset.primary }}
                          aria-label={preset.label}
                          aria-pressed={on}
                          title={preset.label}
                          onClick={() => update({ accent: preset.id })}
                        >
                          {on && <Icon name="Check" size={13} strokeWidth={3} />}
                        </button>
                      );
                    })}
                    {config.customAccents.map((hex) => {
                      const on = config.accent === "custom" && config.accentCustom === hex;
                      return (
                        <span key={hex} className="accent-swatch-wrap">
                          <button
                            type="button"
                            className={`accent-swatch${on ? " active" : ""}`}
                            style={{ background: hex }}
                            aria-label={`自定义主题色 ${hex}`}
                            aria-pressed={on}
                            title={hex}
                            onClick={() => update({ accent: "custom", accentCustom: hex })}
                          >
                            {on && <Icon name="Check" size={13} strokeWidth={3} />}
                          </button>
                          <button
                            type="button"
                            className="swatch-remove"
                            title="删除该主题色"
                            aria-label={`删除主题色 ${hex}`}
                            onClick={() => removeAccent(hex)}
                          >
                            <Icon name="X" size={9} strokeWidth={3} />
                          </button>
                        </span>
                      );
                    })}
                    <button
                      ref={addBtnRef}
                      type="button"
                      className="accent-swatch accent-add"
                      title={canAddAccent ? "新增主题色" : `主题色已达上限（${MAX_ACCENT_COUNT}）`}
                      aria-label="新增主题色"
                      aria-expanded={pickerOpen}
                      disabled={!canAddAccent}
                      onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                    >
                      <Icon name="Plus" size={13} />
                    </button>
                    {/* react-color 取色弹层：用 Portal 挂到 body，脱离 .popover（含 backdrop-filter/transform，
                        会成为 fixed 的包含块）的坐标系，避免定位相对 popover 而非视口而溢出。 */}
                    {pickerOpen && pickerPos &&
                      createPortal(
                        <div
                          ref={pickerRef}
                          className="accent-picker-popover"
                          style={{
                            position: "fixed",
                            top: pickerPos.top,
                            left: pickerPos.left,
                            zIndex: 60,
                          }}
                        >
                          <BlockPicker
                            color={draftHex}
                            colors={[...ACCENT_PRESETS.map((p) => p.primary)]}
                            onChange={(c) => setDraftHex(c.hex)}
                            onChangeComplete={(c) => {
                              pickCustomHex(c.hex);
                              setPickerOpen(false);
                            }}
                          />
                        </div>,
                        document.body,
                      )}
                  </div>
                </div>

                <div className="settings-group settings-row">
                  <span className="settings-group-title">字体</span>
                  <Select
                    className="w-1/3"
                    value={config.fontFamily}
                    options={FONT_OPTIONS}
                    onChange={(v) => update({ fontFamily: v })}
                  />
                </div>

                <label className="settings-group setting-row">
                  <span className="settings-group-title">字号（{config.fontSize}px）</span>
                  <input
                    type="range"
                    min={12}
                    max={22}
                    value={config.fontSize}
                    onChange={(e) => update({ fontSize: Number(e.target.value) })}
                    className="range"
                    style={
                      {
                        "--fill": `${((config.fontSize - 12) / 10) * 100}%`,
                      } as CSSProperties
                    }
                  />
                </label>

                <label className="settings-group settings-row">
                  <span className="settings-group-title">默认视图</span>
                  <Select
                    className="w-1/3"
                    value={config.defaultView}
                    options={[
                      { label: "编辑", value: "edit" },
                      { label: "实时", value: "live" },
                      { label: "预览", value: "preview" },
                    ]}
                    onChange={(v) => {
                      const view = v as ViewMode;
                      update({ defaultView: view });
                      update({
                        paneViewModes: [
                          view,
                          useConfigStore.getState().config.paneViewModes?.[1] ?? "preview",
                        ],
                      });
                      usePanesStore.getState().setPaneViewMode(
                        usePanesStore.getState().focusedPaneId,
                        view,
                      );
                    }}
                  />
                </label>
              </>
            )}

            {active === "editor" && (
              <>
                <div className="settings-group settings-row">
                  <span className="settings-row-label">显示文件树</span>
                  <Toggle
                    label="显示侧边栏"
                    checked={config.sidebarVisible}
                    onChange={(v) => {
                      useUIStore.getState().setSidebarVisible(v);
                      update({ sidebarVisible: v });
                    }}
                  />
                </div>

                <div className="settings-group settings-row">
                  <span className="settings-row-label">文件排序方式</span>
                  {/* <span className="settings-group-title">文件排序方式</span> */}
                  <Select
                    className="w-1/4"
                    value={config.fileSortOrder}
                    options={SORT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                    onChange={(v) => update({ fileSortOrder: v as FileSortOrder })}
                  />
                </div>

                <div className="settings-group settings-row">
                  <span className="settings-row-label">
                    重命名时显示扩展名
                    <span className="mt-1 block text-[11px] text-foreground-subtle">
                      关闭时仅编辑文件名主名，扩展名自动保留；开启后可一并修改扩展名，变更时实时提示。
                    </span>
                  </span>
                  <Toggle
                    label="重命名时显示扩展名"
                    checked={config.showExtensionOnRename}
                    onChange={(v) => update({ showExtensionOnRename: v })}
                  />
                </div>

                {/* <div className="settings-group settings-row">
                  <span className="settings-row-label">分屏视图（双栏）</span>
                  <Toggle
                    label="分屏视图（双栏）"
                    checked={config.workspaceLayout === "split"}
                    onChange={(v) => setSplit(v)}
                  />
                </div> */}

                <div className="settings-group settings-row">
                  <span className="settings-row-label">
                    自动保存草稿
                  </span>
                  <Toggle
                    label="自动保存草稿"
                    checked={config.autoSave}
                    onChange={(v) => update({ autoSave: v })}
                  />
                </div>

                <div className="settings-group settings-row">
                  <span className="settings-row-label">
                    显示滚动条
                    {/* <span className="mt-1 block text-[11px] text-foreground-subtle">
                      关闭后隐藏全部滚动条（仍可滚动），界面更简洁。
                    </span> */}
                  </span>
                  <Toggle
                    label="显示滚动条"
                    checked={config.showScrollbar}
                    onChange={(v) => update({ showScrollbar: v })}
                  />
                </div>

                <div className="settings-group settings-row">
                  <span className="settings-row-label">
                    文本编辑器
                    <span className="mt-1 block text-[11px] text-foreground-subtle">
                      开启后视图栏新增「编辑」选项，可编辑非渲染的文本。
                    </span>
                  </span>
                  <Toggle
                    label="CodeMirror 源码编辑器"
                    checked={config.useCodeMirrorSource}
                    onChange={(v) => update({ useCodeMirrorSource: v })}
                  />
                </div>
              </>
            )}

            {active === "shortcuts" && (
              <div className="settings-shortcuts">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title} className="settings-group">
                    <span className="settings-group-title">{group.title}</span>
                    {group.items.map((item) => (
                      <div key={item.label} className="shortcut-row">
                        <span className="shortcut-label">{item.label}</span>
                        <span className="kbd">
                          {item.keys.map((k) => (
                            <kbd key={k} className="keycap">
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                {/* <p className="settings-note">
                  macOS 上 <kbd className="keycap">Ctrl</kbd> 对应{" "}
                  <kbd className="keycap">⌘</kbd> 键，功能一致。
                </p> */}
              </div>
            )}

            {active === "about" && (
              <div className="about-page">
                <div className="settings-group about-head">
                  {/* <img src={aboutIcon} alt="PureMark" className="about-logo" /> */}
                  <div>
                    <span className="text-[16px] font-semibold tracking-tight">
                      PureMark <span className="text-foreground-subtle">v{pkg.version}</span>
                    </span>
                    <span className="mt-1 block text-[12px] text-foreground-subtle">
                      极简的 Markdown 编辑器
                    </span>
                  </div>
                </div>

                {ABOUT_ROWS.map((row) => (
                  <div key={row.label} className="settings-group settings-row">
                    <span className="settings-row-label">{row.label}</span>
                    <span className="text-[12px] text-foreground-muted">{row.value}</span>
                  </div>
                ))}


                {/* 右下角背景水印：左右翻转（scaleX(-1)），不拦截交互 */}
                <img src={aboutIcon} alt="" aria-hidden className="about-bg" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
