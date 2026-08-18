import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUIStore } from "../store/useUIStore";
import type { MenuItem } from "../types";
import Icon from "./ui/Icon";

const MENU_WIDTH = 220;
const MENU_GAP = 6;
/** 菜单项估算高度，用于视口翻转。 */
const ROW_HEIGHT = 32;
const MENU_PAD = 12;

/**
 * 受控自定义右键菜单（需求2 / T0）。
 *
 * - 通过 createPortal 渲染到 document.body，定位基于光标 clientX/clientY，
 *   并在溢出视口时自动翻转（向左 / 向上）。
 * - 受 useUIStore.contextMenu 驱动；点击菜单项 / 点击菜单外 / 滚动 / Esc 均关闭。
 * - 支持键盘可达：方向键导航（跳过分隔线与禁用项）、Enter 触发、Esc 关闭（T5）。
 *   高亮色复用 theme 的 --primary（随 accent 主题色联动，设计 §7 / Q-F）。
 */
export default function ContextMenu() {
  const menu = useUIStore((s) => s.contextMenu);
  const close = useUIStore((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [active, setActive] = useState<number>(0);

  // 计算定位 + 视口翻转
  useEffect(() => {
    if (!menu) return;
    const estHeight = menu.items.length * ROW_HEIGHT + MENU_PAD;
    let x = menu.x;
    let y = menu.y;
    // 右溢 -> 翻到光标左侧
    if (x + MENU_WIDTH + MENU_GAP > window.innerWidth) {
      x = Math.max(MENU_GAP, menu.x - MENU_WIDTH);
    }
    // 下溢 -> 翻到视口底部上方
    if (y + estHeight + MENU_GAP > window.innerHeight) {
      y = Math.max(MENU_GAP, window.innerHeight - estHeight - MENU_GAP);
    }
    setPos({ x, y });
    setActive(firstEnabled(menu.items, 0));
  }, [menu]);

  // 关闭时机 + 键盘导航
  useEffect(() => {
    if (!menu) return;

    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => step(menu.items, i, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => step(menu.items, i, -1));
      } else if (e.key === "Enter") {
        const item = menu.items[active];
        if (item && !item.separator && !item.disabled && item.run) {
          e.preventDefault();
          item.run();
          close();
        }
      }
    };

    const onPointerDown = (e: globalThis.MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };

    const onScrollOrResize = (): void => close();

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    // capture: 监听任意滚动容器，避免菜单悬在已滚动内容之上
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [menu, active, close]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y, width: MENU_WIDTH }}
      role="menu"
      // 菜单自身不再弹原生菜单（设计 §7.7）
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={item.id ?? `sep-${i}`} className="context-menu-sep" role="separator" />
        ) : (
          <button
            key={item.id ?? `item-${i}`}
            type="button"
            role="menuitem"
            className={
              "context-menu-item" +
              (active === i ? " is-active" : "") +
              (item.disabled ? " is-disabled" : "")
            }
            disabled={item.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              if (item.disabled) return;
              item.run?.();
              close();
            }}
          >
            {item.icon ? (
              <Icon name={item.icon} size={15} className="context-menu-icon" />
            ) : (
              <span className="context-menu-icon" />
            )}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut ? (
              <span className="context-menu-shortcut">{item.shortcut}</span>
            ) : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** 第一个可聚焦（非分隔、非禁用）的索引。 */
function firstEnabled(items: MenuItem[], from: number): number {
  if (from < 0 || from >= items.length) return 0;
  if (!items[from].separator && !items[from].disabled) return from;
  return step(items, from, 1);
}

/** 在菜单项中向前/后移动，跳过分隔线与禁用项（循环）。 */
function step(items: MenuItem[], from: number, dir: 1 | -1): number {
  let j = from;
  for (let n = 0; n < items.length; n += 1) {
    j += dir;
    if (j < 0) j = items.length - 1;
    if (j >= items.length) j = 0;
    if (!items[j].separator && !items[j].disabled) return j;
  }
  return from;
}
