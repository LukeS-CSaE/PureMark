import { forwardRef, type ComponentType, type Ref } from "react";
import {
  PenTool,
  Minus,
  Square,
  X,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  FilePlus,
  Save,
  Heading,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Edit3,
  Keyboard,
  Columns,
  Columns2,
  Code2,
  Pilcrow,
  Sun,
  Moon,
  MonitorCog,
  Eye,
  Search,
  Settings,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Check,
  Palette,
  ListTree,
  PanelLeft,
  PanelRight,
} from "lucide-react";

/**
 * ListTreeFramed — a composite lucide icon that overlays the tree-shaped
 * `ListTree` lines inside the rounded-rectangle border of `Square`. This keeps
 * the TOC toggle visually consistent with the framed Panel* icons in the
 * toolbar (PanelLeftOpen, PanelRight, ...) which already carry a rounded border.
 *
 * The outer <span> is a relative, fixed-size box; the two lucide icons are
 * absolutely positioned to fill it, so the tree sits centered inside the frame.
 */
export const ListTreeFramed = forwardRef<
  HTMLSpanElement,
  { size?: number; className?: string }
>(function ListTreeFramed({ size = 16, className }, ref) {
  return (
    <span
      ref={ref as Ref<HTMLSpanElement>}
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flex: "none",
      }}
    >
      {/* <Square
        size={size}
        strokeWidth={strokeWidth}
        style={{ position: "absolute", inset: 0 }}
      />
      <ListTree
        size={12}
        x={6}
        y={6}
        strokeWidth={strokeWidth}
        style={{ position: "absolute", inset: 0 }}
      /> */}
      <Square size={size}>
        <ListTree
          size={14}
          x={5}
          y={5}
          absoluteStrokeWidth
        />
      </Square>
    </span>
  );
});
ListTreeFramed.displayName = "ListTreeFramed";

/**
 * Central icon registry. All icons used across the app are funnelled through
 * this module so we depend on a single, auditable set (lucide-react).
 */
export const Icons = {
  PenTool,
  Minus,
  Square,
  X,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  FilePlus,
  Save,
  Heading,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Link: LinkIcon,
  Image: ImageIcon,
  Table: TableIcon,
  Edit3,
  Keyboard,
  Columns,
  Columns2,
  Code2,
  Pilcrow,
  Sun,
  Moon,
  MonitorCog,
  Eye,
  Search,
  Settings,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Check,
  Palette,
  ListTree: ListTreeFramed,
  PanelLeft,
  PanelRight,
} as const;

export type IconName = keyof typeof Icons;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/**
 * Thin wrapper around lucide-react icons. Keeps the rest of the codebase
 * free of direct lucide imports and ensures a consistent default size.
 */
export default function Icon({ name, size = 16, className, strokeWidth = 2 }: IconProps) {
  const Cmp = Icons[name] as ComponentType<{
    size?: number;
    className?: string;
    strokeWidth?: number;
  }>;
  return <Cmp size={size} className={className} strokeWidth={strokeWidth} />;
}
