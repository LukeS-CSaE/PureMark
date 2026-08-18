import { useState, type CSSProperties } from "react";
import { useConfigStore, DEFAULT_CONFIG } from "../../store/useConfigStore";
import { useUIStore } from "../../store/useUIStore";
import { usePanesStore } from "../../store/usePanesStore";
import { ACCENT_PRESETS } from "../../lib/theme";
import type { ThemePreference, ViewMode } from "../../types";
import Icon, { type IconName } from "../ui/Icon";
import Toggle from "../ui/Toggle";
import Select from "../ui/Select";

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "系统默认 (苹方)", value: DEFAULT_CONFIG.fontFamily },
  { label: "等宽 (Mono)", value: '"JetBrains Mono", "Fira Code", Consolas, monospace' },
  { label: "宋体 (Serif)", value: '"SimSun", "Songti SC", serif' },
  { label: "雅黑 (YaHei)", value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: "PingFang SC", value: '"PingFang SC"' },
];

/** The three theme choices (iter2 B-1 debt, closed in iter2-ext T01). */
const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "light", label: "浅色", icon: "Sun" },
  { value: "dark", label: "深色", icon: "Moon" },
  { value: "auto", label: "跟随系统", icon: "MonitorCog" },
];

/** Left-hand directory of setting groups. */
const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: "appearance", label: "外观", icon: "Palette" },
  { id: "editor", label: "编辑器", icon: "Edit3" },
  { id: "shortcuts", label: "快捷键", icon: "Keyboard" },
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
                  <span className="settings-group-title">主题色</span>
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
                  </div>
                </div>

                <label className="settings-group">
                  <span className="settings-group-title">字体</span>
                  <Select
                    className="w-full"
                    value={config.fontFamily}
                    options={FONT_OPTIONS}
                    onChange={(v) => update({ fontFamily: v })}
                  />
                </label>

                <label className="settings-group">
                  <span className="settings-group-title">字号（{config.fontSize}px）</span>
                  <input
                    type="range"
                    min={12}
                    max={22}
                    value={config.fontSize}
                    onChange={(e) => update({ fontSize: Number(e.target.value) })}
                    className="range w-full"
                    style={
                      {
                        "--fill": `${((config.fontSize - 12) / 10) * 100}%`,
                      } as CSSProperties
                    }
                  />
                </label>

                <label className="settings-group">
                  <span className="settings-group-title">默认视图</span>
                  <Select
                    className="w-full"
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

                <div className="settings-group settings-row">
                  <span className="settings-row-label">显示滚动条</span>
                  <Toggle
                    label="显示滚动条"
                    checked={config.showScrollbar}
                    onChange={(v) => update({ showScrollbar: v })}
                  />
                </div>
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

                {/* <div className="settings-group settings-row">
                  <span className="settings-row-label">分屏视图（双栏）</span>
                  <Toggle
                    label="分屏视图（双栏）"
                    checked={config.workspaceLayout === "split"}
                    onChange={(v) => setSplit(v)}
                  />
                </div> */}

                <div className="settings-group settings-row">
                  <span className="settings-row-label">自动保存草稿</span>
                  <Toggle
                    label="自动保存草稿"
                    checked={config.autoSave}
                    onChange={(v) => update({ autoSave: v })}
                  />
                </div>

                <div className="settings-group settings-row">
                  <span className="settings-row-label">
                    CodeMirror 源码编辑器
                    <span className="mt-1 block text-[11px] text-foreground-subtle">
                      开启后视图栏新增「编辑」选项，使用 CodeMirror 源码视图（与实时/预览共享外壳样式）。
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
          </div>
        </div>
      </div>
    </div>
  );
}
