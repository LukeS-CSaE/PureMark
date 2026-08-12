> 📄 **文档状态（2026-08-10）**：本文件是 PureMark 的 **Markdown 渲染样例**，用于对照预览/实时模式的实际渲染效果，仍有效。项目整体认知见 `docs/项目认知与现状总览.md`。

# Markdown 渲染测试文档
## 1. 标题
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题

## 2. 段落与换行

这是第一段文字。Markdown 中的段落通过空行分隔。

这是第二段文字。
行尾加两个空格可以换行（软换行）。

## 3. 文字样式

*斜体* 或 _斜体_

**粗体** 或 __粗体__

***粗斜体*** 或 ___粗斜体___

~~删除线~~

<u>下划线</u>（HTML 标签）

`行内代码`

## 4. 引用

> 这是一级引用
>
> > 这是二级引用
> >
> > > 这是三级引用

## 5. 列表

### 无序列表

- 苹果
- 香蕉
- 樱桃
  - 子项缩进
  - 子项缩进

### 有序列表

1. 第一步
2. 第二步
3. 第三步
   1. 子步骤 1
   2. 子步骤 2

### 任务列表

- [x] 已完成任务
- [ ] 未完成任务
- [ ] 待办事项

## 6. 代码块

### 普通代码块

```
function hello() {
  console.log("Hello, World!");
}
```

### 带语言高亮

```javascript
const greeting = (name) => {
  return `Hello, ${name}!`;
};
```

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

```css
.container {
  display: flex;
  justify-content: center;
  background-color: #f0f0f0;
}
```

## 7. 链接

[普通链接](https://example.com)

[带标题的链接](https://example.com "悬停提示文字")

自动链接：<https://example.com>

## 8. 图片

![替代文字](https://picsum.photos/200/100 "图片标题")

![图片加载失败](invalid-url.jpg)

## 9. 表格

| 左对齐 | 居中对齐 | 右对齐 |
| :----- | :------: | -----: |
| 单元格 | 单元格 | 单元格 |
| 内容 | 内容 | 内容 |
| 较长内容测试 | 较长内容测试 | 较长内容测试 |

### 无对齐表格

| 名称 | 价格 | 数量 |
| ---- | ---- | ---- |
| 苹果 | 5 元 | 10 |
| 香蕉 | 3 元 | 20 |

### 空单元格表格

| 列一 | 列二 | 列三 |
| ---- | ---- | ---- |
| 有内容 | | 有内容 |
| | 有内容 | |

## 10. 分割线

---

***

___

## 11. 转义字符

\*不会被解析为斜体\*

\`反引号\`

## 12. HTML 标签

<p style="color: red;">红色段落（HTML）</p>

<span style="background: yellow;">黄色背景文字</span>

<div align="center">居中 div</div>

## 13. 脚注

这里有个脚注[^1]和另一个脚注[^2]。

[^1]: 这是第一个脚注的内容。
[^2]: 这是第二个脚注的内容。

## 14. 定义列表

Markdown
: 一种轻量级标记语言，由 John Gruber 创建。

HTML
: 超文本标记语言，是 Web 的基础。

## 15. 数学公式（LaTeX）

行内公式：$E = mc^2$

块级公式：

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

## 16. 高亮（某些编辑器支持）

==高亮文字==

## 17. 上标与下标（某些编辑器支持）

H~2~O

X^2^ + Y^2^ = Z^2^

## 18. Emoji（某些编辑器支持）

:smile: :heart: :rocket: :fire:

## 19. 混合嵌套

> **粗体引用** 包含 `代码` 和 [链接](https://example.com)
>
> - 列表嵌套在引用中
> - 第二项

1. 有序列表中的 **粗体**
   - 嵌套无序列表的 *斜体*
   - `代码片段`

## 20. 长文本与超长链接

这是一个非常长的段落，用于测试编辑器的自动换行和渲染性能。你可以在这里写很多文字，观察编辑器是否能够正确处理长文本的显示，包括中英文混排、标点符号、数字和特殊字符等。测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容测试内容。

这是一个超长链接测试：https://example.com/very/long/path/that/might/cause/rendering/issues/in/some/markdown/editors/with/many/parameters?param1=value1&param2=value2&param3=value3&param4=value4&param5=value5

---

*文档结束 — 用于 Markdown 编辑器渲染测试*
