/**
 * 自定义重命名弹层（替代 window.prompt）。
 *
 * 由 `useUIStore.rename` 驱动渲染，支持键盘（Enter 提交 / Escape 取消）。
 * 调用方通过 `openRename({ title, defaultValue, onSubmit })` 打开弹层，
 * `onSubmit` 在用户确认后以新名称调用。
 *
 * 扩展名处理：
 * - 当设置 `showExtensionOnRename` 为 false，且调用方 `canHideExtension` 为 true，
 *   且文件名确有扩展名时，输入框只显示主名，提交时自动拼回原扩展名；
 * - 当显示扩展名（开关开启）时，若用户修改了扩展名，输入框下方实时显示
 *   醒目但非阻断的警告，提示扩展名变更可能影响文件类型与打开方式。
 */
import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import { useUIStore } from "../../store/useUIStore";
import { useConfigStore } from "../../store/useConfigStore";
import Icon from "../ui/Icon";

/** 拆分文件名为主名与扩展名。无扩展名（无点 / 点开头 / 点结尾）返回空 ext。 */
function splitExtension(name: string): { base: string; ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, idx), ext: name.slice(idx + 1) };
}

export default function RenamePopover() {
  const rename = useUIStore((s) => s.rename);
  const showExtension = useConfigStore((s) => s.config.showExtensionOnRename);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时根据文件名与设置，计算输入框初值及是否隐藏扩展名。
  const meta = useMemo(() => {
    if (!rename) return null;
    const { base, ext } = splitExtension(rename.defaultValue);
    const hideMode = !showExtension && !!rename.canHideExtension && ext !== "";
    return { base, ext, hideMode, initial: hideMode ? base : rename.defaultValue };
  }, [rename, showExtension]);

  // 弹层打开时重置输入值并自动选中
  useEffect(() => {
    if (rename && meta) {
      setValue(meta.initial);
      // 延迟聚焦确保 DOM 已渲染
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [rename, meta]);

  if (!rename || !meta) return null;

  const trimmed = value.trim();
  // 隐藏模式：提交时把原始扩展名拼回主名；显示模式：直接提交完整名。
  const finalName = meta.hideMode ? (trimmed ? `${trimmed}.${meta.ext}` : "") : trimmed;
  const canSubmit = finalName.length > 0 && finalName !== rename.defaultValue;

  // 显示模式下实时检测扩展名变化（非阻断警告）。
  const currentExt = splitExtension(trimmed).ext;
  let warn: string | null = null;
  if (!meta.hideMode && meta.ext !== currentExt) {
    if (meta.ext && currentExt) {
      warn = `扩展名已从「.${meta.ext}」变更为「.${currentExt}」，修改后可能影响文件的类型与打开方式。`;
    } else if (meta.ext && !currentExt) {
      warn = `已移除扩展名「.${meta.ext}」，文件将不再带有类型后缀。`;
    } else if (!meta.ext && currentExt) {
      warn = `已添加扩展名「.${currentExt}」，请确认文件类型正确。`;
    }
  }

  function handleSubmit() {
    if (!finalName) {
      useUIStore.getState().closeRename();
      return;
    }
    if (finalName !== rename!.defaultValue) rename!.onSubmit(finalName);
    useUIStore.getState().closeRename();
  }

  function handleCancel() {
    useUIStore.getState().closeRename();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // 输入为空（如纯空格）时不提交也不关闭，需点取消或 Esc。
      if (finalName) handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }

  return (
    <div className="rename-overlay" role="dialog" aria-modal="true" aria-label={rename.title} onClick={handleCancel}>
      <div className="rename-popover" onClick={(e) => e.stopPropagation()}>
        <div className="rename-head">
          <Icon name="Pencil" size={14} />
          <span className="rename-title">{rename.title}</span>
          <button type="button" className="btn-icon" title="取消" onClick={handleCancel}>
            <Icon name="X" size={13} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          className="rename-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={meta.hideMode ? "文件名（不含扩展名）" : "请输入名称"}
        />
        {warn && (
          <div className="rename-warn" role="alert">
            <Icon name="AlertTriangle" size={13} className="rename-warn-icon" />
            <span>{warn}</span>
          </div>
        )}
        <div className="rename-actions">
          <button
            type="button"
            className="rename-btn primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            确定
          </button>
          <button type="button" className="rename-btn" onClick={handleCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
