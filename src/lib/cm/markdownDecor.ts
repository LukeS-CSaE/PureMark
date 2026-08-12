/**
 * 行级渲染重写后, 本文件已废弃.
 *
 * 旧版本 (装饰器方案) 在这里实现: line decoration + mark decoration + 隐
 * 藏语法符. 该方案在嵌套 mark (StrongEmphasis 内嵌 Emphasis) 时触发
 * RangeSetBuilder.add 的 from-ordering 错误, 加上 cm-md-* 与 cm-tok-md-*
 * 的样式竞争, 已经全面重写为行级 widget 替换 (见 ./liveRender.ts 与
 * ./livePreview.ts).
 *
 * 保留此 stub 只是为了让旧 import 不致立即报错; 任何新代码都不应再依赖
 * 这个模块. 一旦确认无任何 import, 即可删除整个文件.
 */
export {};
