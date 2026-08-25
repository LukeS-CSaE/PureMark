/**
 * 本地兜底类型声明：react-color 2.x 不自带类型，且本项目未引入 @types/react-color。
 * 仅声明本项目实际用到的 API（SketchPicker + 通用取色结果），足以让 tsc 通过。
 * 如需完整类型，可 `pnpm add -D @types/react-color` 并删除本文件。
 */
declare module "react-color" {
  import type { ComponentType, CSSProperties } from "react";

  /** react-color 回调里统一返回的颜色结构（取本项目需要的字段）。 */
  export interface ColorResult {
    hex: string;
    rgb: { r: number; g: number; b: number; a?: number };
    hsl: { h: number; s: number; l: number; a?: number };
    /** 部分组件还会返回 source 等字段，用索引签名兜底，避免严格模式报错。 */
    [key: string]: unknown;
  }

  export interface SketchPickerProps {
    color?: string | { [key: string]: unknown };
    /** 拖拽过程中持续触发（频率高），仅用于本地预览，不要在此持久化。 */
    onChange?: (color: ColorResult, event: React.ChangeEvent<HTMLInputElement>) => void;
    /** 松手/完成时触发一次，适合做持久化提交。 */
    onChangeComplete?: (color: ColorResult) => void;
    disableAlpha?: boolean;
    presetColors?: string[];
    /** BlockPicker 用的色板数组（字段名是 colors，不是 presetColors）。 */
    colors?: string[];
    width?: string | number;
    className?: string;
    style?: CSSProperties;
  }

  export const SketchPicker: ComponentType<SketchPickerProps>;
  export const ChromePicker: ComponentType<SketchPickerProps>;
  export const SwatchesPicker: ComponentType<Pick<SketchPickerProps, "color" | "onChange" | "onChangeComplete">>;
  export const BlockPicker: ComponentType<SketchPickerProps>;
  export const CirclePicker: ComponentType<SketchPickerProps>;
}
