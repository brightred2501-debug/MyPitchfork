# MyPitchfork 项目拆解

本文档基于当前代码状态整理，目标是让开发者、维护者或准备开源发布的人快速理解这个项目的产品目标、技术结构、数据流、渲染逻辑和后续扩展方向。

## 1. 项目定位

MyPitchfork 是一个本地运行的专辑评分海报生成工具。用户可以搜索专辑，加载专辑封面和曲目列表，为整张专辑和每首歌填写评分，再生成一张带有 Pitchfork 风格排版气质的 PNG 图片。

当前版本的核心特点：

- 单页工具型网页，不是营销页。
- 使用 Apple iTunes Search API 获取专辑、歌手、封面和曲目信息。
- 用户可编辑专辑名、艺人/乐队名、总评分、简评和单曲评分。
- 每首歌支持红心标记，红心会出现在预览和导出的 PNG 中。
- 总评分 `>= 90` 时，评分圆圈和数字会使用红色强调。
- 草稿保存到 `localStorage`，刷新后不会立刻丢失。
- 下载图片不是截图 DOM，而是使用 Canvas 单独绘制，保证导出质量和排版可控。

## 2. 技术栈

项目当前是非常轻量的原生 Web 实现：

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 页面结构 | HTML | `index.html` 提供固定单页结构 |
| 交互逻辑 | Vanilla JavaScript | `src/app.js` 使用原生 ES modules 编排状态和事件 |
| 样式 | CSS | `src/styles.css` 定义整体布局、编辑器和海报视觉 |
| 本地服务 | Node.js HTTP server | `server.js` 提供静态文件服务 |
| 数据源 | Apple iTunes Search API | 使用 JSONP 方式请求，规避浏览器 CORS 限制 |
| 导出 | Canvas API | 手动绘制最终 PNG |
| 本地缓存 | `localStorage` | 保存当前评分草稿 |

当前没有引入 React、Vue、Vite、构建工具或第三方前端依赖。运行方式是直接启动本地静态服务。

## 3. 目录结构

```text
MyPitchfork/
  index.html
  package.json
  server.js
  docs/
    development-plan.md
    project-breakdown.md
  src/
    app.js
    api/
      itunes.js
    lib/
      artwork.js
      canvas-text.js
      format.js
      storage.js
      validation.js
    poster/
      canvas-renderer.js
      dom-renderer.js
    styles.css
  out/
    *.png
```

各文件职责：

| 文件 | 职责 |
| --- | --- |
| `index.html` | 定义页面骨架，包括顶部操作区、搜索区、评分编辑区和海报预览区 |
| `src/app.js` | 页面状态、事件绑定和各模块之间的流程编排 |
| `src/api/itunes.js` | iTunes 搜索、Lookup 和 JSONP 请求封装 |
| `src/lib/artwork.js` | 封面 URL 高清化 |
| `src/lib/canvas-text.js` | Canvas 文本换行、截断和排版辅助 |
| `src/lib/format.js` | 时长、年份和下载文件名格式化 |
| `src/lib/storage.js` | `localStorage` 草稿读写和旧数据兼容 |
| `src/lib/validation.js` | 评分清洗和未评分曲目统计 |
| `src/poster/dom-renderer.js` | 浏览器 DOM 海报预览渲染 |
| `src/poster/canvas-renderer.js` | PNG Canvas 排版、绘制和下载 |
| `src/styles.css` | 页面和海报的全部样式，包含响应式布局、曲目表格、红心按钮、评分圆圈等 |
| `server.js` | 一个极简 Node 静态文件服务器，默认监听 `127.0.0.1:5174` |
| `package.json` | 定义项目脚本，`npm run dev` 和 `npm start` 都启动 `server.js` |
| `docs/development-plan.md` | 早期开发方案和需求规划 |
| `docs/project-breakdown.md` | 当前这份项目拆解文档 |
| `out/` | 生成图片的输出目录或临时存放目录，属于产物目录 |

如果后续发布到 GitHub，建议增加 `.gitignore`，并把 `out/`、临时文件和本地环境文件排除。

## 4. 启动方式

安装依赖不是必须的，因为当前项目没有第三方包。但仍然可以使用 npm 脚本启动：

```bash
npm run dev
```

默认服务地址：

```text
http://127.0.0.1:5174/
```

如果 `5174` 被占用，可以临时指定端口：

```powershell
$env:PORT='5175'; npm run dev
```

`server.js` 会把项目根目录作为静态文件根目录，访问 `/` 时返回 `index.html`。

## 5. 用户流程

完整用户路径如下：

1. 用户打开本地网页。
2. 在搜索框输入专辑名。
3. 选择搜索地区，例如 `US`、`CN`、`JP`、`GB`、`TW`、`HK`。
4. 点击搜索。
5. 应用通过 iTunes Search API 获取专辑结果。
6. 用户在结果列表中选择正确专辑。
7. 应用通过 iTunes Lookup API 获取曲目列表。
8. 应用生成一个 `draft` 草稿对象，并渲染评分编辑器。
9. 用户编辑专辑名、艺人名、总评分、简评、单曲评分和红心标记。
10. 每次编辑后，应用实时更新海报预览，并保存到 `localStorage`。
11. 用户点击下载 PNG。
12. 应用校验总评分和单曲评分是否完整。
13. 应用使用 Canvas 重新绘制海报。
14. 应用把 Canvas 转成 PNG Blob 并触发浏览器下载。

## 6. 全局状态模型

`src/app.js` 顶部定义了一个单一 `state` 对象：

```js
const state = {
  query: "",
  country: "us",
  results: [],
  status: "idle",
  loadingAlbumId: undefined,
  draft: loadStoredDraft(),
  notice: "",
  exporting: false,
};
```

字段说明：

| 字段 | 类型倾向 | 用途 |
| --- | --- | --- |
| `query` | string | 搜索框当前输入 |
| `country` | string | iTunes API 地区参数 |
| `results` | array | 专辑搜索结果 |
| `status` | string | 搜索状态，包含 `idle`、`loading`、`success`、`empty`、`error` |
| `loadingAlbumId` | number 或 undefined | 当前正在加载曲目的专辑 ID |
| `draft` | object 或 null | 当前专辑评分草稿 |
| `notice` | string | 顶部提示信息 |
| `exporting` | boolean | PNG 是否正在生成 |

这个项目没有使用框架状态管理。所有状态更新都直接改 `state`，然后调用对应的 `render*` 函数刷新 UI。

## 7. 草稿数据结构

选择专辑后会生成一个 `draft` 对象。它大致长这样：

```js
{
  collectionId: 123456,
  albumName: "Album Name",
  artistName: "Artist Name",
  artworkUrl: "https://...",
  sourceArtworkUrl: "https://...",
  country: "us",
  overallScore: undefined,
  comment: "",
  tracks: [
    {
      id: 1,
      discNumber: 1,
      trackNumber: 1,
      name: "Song Name",
      durationMs: 180000,
      liked: false,
      rating: undefined
    }
  ],
  updatedAt: "2026-07-28T..."
}
```

关键字段：

| 字段 | 说明 |
| --- | --- |
| `overallScore` | 专辑总评分，范围被限制为 `0-100` 的整数 |
| `comment` | 简短评论，输入框限制 `maxlength=180` |
| `tracks[].rating` | 单曲评分，范围同样限制为 `0-100` 的整数 |
| `tracks[].liked` | 单曲红心状态，预览和 PNG 导出都会使用 |
| `updatedAt` | 每次编辑后更新时间，方便后续做历史记录或排序 |

老草稿兼容：

- `loadStoredDraft()` 会读取 `localStorage`。
- 如果旧草稿中的 track 没有 `liked` 字段，会用 `Boolean(track.liked)` 补成布尔值。

## 8. 数据请求流程

### 8.1 搜索专辑

搜索入口是 `handleSearch(event)`。

流程：

```text
handleSearch
  -> searchAlbums(term, country)
  -> requestJsonp(ITUNES_SEARCH_URL, params)
  -> normalize iTunes results
  -> renderSearchState()
```

请求地址：

```text
https://itunes.apple.com/search
```

请求参数：

| 参数 | 值 |
| --- | --- |
| `term` | 用户输入的搜索关键词 |
| `media` | `music` |
| `entity` | `album` |
| `limit` | `10` |
| `country` | 当前选择地区 |

返回结果会被整理成内部专辑对象：

```js
{
  collectionId,
  albumName,
  artistName,
  artworkUrl,
  releaseDate,
  trackCount,
  genre,
  country
}
```

### 8.2 加载曲目

选择专辑后进入 `handleSelectAlbum(album)`。

流程：

```text
handleSelectAlbum
  -> fetchAlbumDraft(album, country)
  -> requestJsonp(ITUNES_LOOKUP_URL, params)
  -> split collection and tracks
  -> sort tracks
  -> create draft
  -> persistDraft()
  -> renderAll()
```

请求地址：

```text
https://itunes.apple.com/lookup
```

请求参数：

| 参数 | 值 |
| --- | --- |
| `id` | `collectionId` |
| `entity` | `song` |
| `country` | 当前选择地区 |

曲目排序规则：

1. 先按 `discNumber` 升序。
2. 再按 `trackNumber` 升序。

如果没有找到任何歌曲，会抛出错误并显示提示。

### 8.3 JSONP 机制

项目使用 `requestJsonp(endpoint, params)` 动态插入 `<script>` 标签。

原因：

- iTunes Search API 支持 callback 参数。
- 浏览器普通 `fetch` 可能遇到 CORS 限制。
- JSONP 可以让纯静态前端直接调用接口。

实现要点：

- 每次请求生成唯一 callback 名。
- 设置 12 秒超时。
- 请求成功、失败或超时后都会清理 script 和全局 callback。

## 9. 事件绑定和交互逻辑

初始化入口：

```text
DOMContentLoaded
  -> init()
  -> collect elements
  -> bindEvents()
  -> renderAll()
```

主要事件：

| 元素 | 事件 | 行为 |
| --- | --- | --- |
| 搜索表单 | `submit` | 搜索专辑 |
| 搜索输入框 | `input` | 更新 `state.query` 和搜索按钮状态 |
| 地区选择 | `change` | 更新 `state.country` |
| 清空按钮 | `click` | 清空当前草稿 |
| 下载按钮 | `click` | 校验并导出 PNG |
| 专辑名输入 | `input` | 更新草稿并实时刷新海报 |
| 艺人名输入 | `input` | 更新草稿并实时刷新海报 |
| 总评分输入 | `input` | 归一化评分，刷新海报和下载状态 |
| 简评输入 | `input` | 更新草稿并刷新海报 |
| 单曲评分输入 | `input` | 归一化评分，刷新海报和下载状态 |
| 红心按钮 | `click` | 切换 `track.liked`，刷新海报 |

所有草稿编辑都会调用 `touchDraft()`：

```text
touchDraft()
  -> update updatedAt
  -> persistDraft()
```

## 10. 评分处理

评分输入使用 `normalizeScoreInput(input)` 和 `scoreFromInput(value)`。

规则：

- 空字符串会变成 `undefined`。
- 非数字会变成 `undefined`。
- 数字会四舍五入为整数。
- 小于 `0` 会被压到 `0`。
- 大于 `100` 会被压到 `100`。

所以用户输入：

| 输入 | 结果 |
| --- | --- |
| 空 | 空 |
| `88.6` | `89` |
| `-10` | `0` |
| `120` | `100` |

下载前校验：

- 必须有 `draft`。
- 必须填写 `overallScore`。
- 所有单曲必须填写 `rating`。
- 红心不参与校验，它只是视觉标记。

## 11. 渲染体系

项目渲染分为两套：

1. 页面实时预览，使用 DOM 和 CSS。
2. 下载 PNG，使用 Canvas API 重新绘制。

这样做的好处是：

- 页面预览响应快，便于用户编辑。
- PNG 导出清晰且可控，不依赖浏览器截图第三方库。
- 可以分别处理屏幕布局和导出布局。

### 11.1 总渲染入口

`renderAll()` 会依次调用：

```text
renderSearchState()
renderEditor()
renderPoster()
renderDownloadState()
renderNotice()
```

局部编辑通常只调用必要的渲染函数。例如修改总评分时：

```text
update score
touchDraft()
renderPoster()
renderDownloadState()
```

### 11.2 搜索结果渲染

`renderResults()` 会把 `state.results` 渲染成按钮列表。

每条结果包含：

- 封面缩略图。
- 专辑名。
- 艺人名。
- 发行年份、曲目数、类型。
- 选择状态。

选中专辑会加载曲目并进入编辑状态。

### 11.3 编辑器渲染

`renderEditor()` 控制编辑区是否显示。

没有草稿时：

- 显示等待选择专辑的空状态。
- 清空曲目编辑器。
- 禁用清空按钮。

有草稿时：

- 填充专辑名、艺人名、总评分、简评。
- 调用 `renderTrackEditor()` 渲染曲目列表。

`renderTrackEditor()` 的每一行包含：

| 列 | 内容 |
| --- | --- |
| 曲目 | 曲序和歌曲名 |
| 时长 | `m:ss` |
| 红心 | 可点击的心形按钮 |
| 评分 | 单曲评分输入框 |

红心按钮会根据 `track.liked` 切换：

- `aria-pressed="true"` 或 `false`。
- `.track-heart-toggle--active` 样式。
- 页面预览立即更新。

### 11.4 海报预览渲染

`renderPoster()` 使用 DOM 构建海报。

没有草稿时：

- 显示空海报状态。

有草稿时：

- 顶部显示 `BERLEY Album Review`。
- `BERLEY` 为红色，`Album Review` 为绿色。
- 显示专辑名和艺人名。
- 显示封面图。
- 显示总评分圆圈。
- 如果总评分 `>= 90`，圆圈和数字变红。
- 如果有简评，显示简评。
- 显示曲目列表、时长、红心和单曲评分。

曲目数量会影响海报密度：

| 曲目数 | class | 效果 |
| --- | --- | --- |
| `<= 16` | 默认 | 普通行高 |
| `17-22` | `poster--dense` | 压缩曲目行距 |
| `> 22` | `poster--extended` | 进一步压缩，并增加海报最小高度 |

## 12. 下载 PNG 流程

下载入口是 `handleDownload()`。

流程：

```text
handleDownload()
  -> validate draft
  -> validate overall score
  -> validate track ratings
  -> state.exporting = true
  -> drawPosterCanvas(state.draft)
  -> downloadCanvas(canvas, filename)
  -> state.exporting = false
```

### 12.1 Canvas 尺寸

`drawPosterCanvas(draft)` 中固定宽度：

```js
const width = 1200;
const margin = 92;
```

高度不是固定死的，而是由 `calculateCanvasLayout()` 根据内容计算：

- 专辑名行数。
- 艺人名行数。
- 是否有简评。
- 曲目数量。
- 曲目行高。

因此导出的图片可能是长图，尤其是曲目很多或评论较长时。

### 12.2 Canvas 布局计算

`calculateCanvasLayout(ctx, draft, width, margin)` 负责算出所有关键坐标。

主要变量：

| 变量 | 说明 |
| --- | --- |
| `kickerY` | `BERLEY Album Review` 顶部标签位置 |
| `titleY` | 专辑名起始位置 |
| `titleLines` | 专辑名换行结果，最多 3 行 |
| `artistY` | 艺人名起始位置 |
| `artistLines` | 艺人名换行结果，最多 2 行 |
| `mainY` | 封面和评分圆圈起始位置 |
| `coverSize` | 封面尺寸，当前为 `620` |
| `afterMainY` | 主视觉区之后的位置 |
| `commentLines` | 评论换行结果，最多 4 行 |
| `trackRowHeight` | 曲目行高，根据曲目数量调整 |
| `height` | 最终 canvas 高度 |

### 12.3 Canvas 绘制顺序

实际绘制顺序：

1. 背景色。
2. 外边框。
3. 顶部 `BERLEY Album Review`。
4. 专辑名。
5. 艺人名。
6. 封面图。
7. 总评分圆圈。
8. 简评区域。
9. 曲目列表。

对应函数：

| 函数 | 说明 |
| --- | --- |
| `drawCanvasKicker()` | 绘制红色 BERLEY 和绿色 ALBUM REVIEW |
| `drawCenteredLines()` | 绘制多行居中文本 |
| `drawArtwork()` | 绘制封面、阴影和封面 fallback |
| `drawScore()` | 绘制总评分圆圈 |
| `drawCanvasTrackList()` | 绘制曲目列表 |
| `drawCanvasHeart()` | 绘制红心图标 |
| `downloadCanvas()` | 转成 PNG 并触发下载 |

### 12.4 图片加载

`loadImage(url)` 使用浏览器 `Image` 对象。

设置项：

```js
image.crossOrigin = "anonymous";
image.referrerPolicy = "no-referrer";
```

如果封面加载失败：

- `drawPosterCanvas()` 会 catch 错误并得到 `null`。
- `drawArtwork()` 会画一个 fallback 占位符。
- 下载不会因为封面失败而完全中断。

## 13. 文本溢出和换行策略

这个项目对预览和下载 PNG 的文字处理不完全一样。

### 13.1 专辑名

预览：

- 使用 CSS 正常换行。
- `overflow-wrap: anywhere` 允许超长连续字符断开。
- 不会盖住艺人名，因为 DOM 文档流会把下方内容推开。

下载 PNG：

- 使用 `wrapCanvasText()` 按 canvas 可用宽度换行。
- 使用 `limitLines(..., 3)` 限制最多 3 行。
- 超过 3 行会在最后一行添加 `...`。
- 艺人名位置会根据专辑名行数重新计算，所以不会被专辑名盖住。

### 13.2 艺人/乐队名

预览：

- 在海报 header 中按普通文本布局。
- 有空格的长文本会自然换行。

下载 PNG：

- 已加入换行保护。
- 使用 `wrapCanvasText()` 按 canvas 可用宽度换行。
- 使用 `limitLines(..., 2)` 限制最多 2 行。
- 主视觉区域的 `mainY` 会根据艺人名行数下移。
- 因此不会盖住封面或评分圆圈。

### 13.3 歌曲名

预览：

- 使用 CSS grid 布局。
- 歌名列允许换行。
- `overflow-wrap: anywhere` 允许超长连续字符断开。
- 当前行会变高，下一行会被推下去，所以不会盖住下一首歌。

下载 PNG：

- 歌曲名不换行。
- 使用 `truncateCanvasText()` 按固定宽度截断。
- 超出部分使用 `...`。
- 因为每行高度固定，所以不会盖住下一行。

### 13.4 简评

预览：

- 文本在评论区域自然换行。
- `overflow-wrap: anywhere` 防止长词撑破容器。

下载 PNG：

- 使用 `wrapCanvasText()` 换行。
- 最多显示 4 行。
- 超出后最后一行加 `...`。

## 14. 样式系统拆解

`src/styles.css` 使用原生 CSS 变量定义主题色。

主要变量：

```css
:root {
  --paper: #fffdf8;
  --paper-deep: #f8f6ef;
  --ink: #171513;
  --muted: #6d6860;
  --line: #d8d2c8;
  --red: #d52020;
  --blue: #2563eb;
  --green: #0f766e;
  --shadow: 0 18px 60px rgba(23, 21, 19, 0.14);
}
```

视觉特点：

- 背景是轻微网格纸感。
- 页面主要面板使用浅纸色和细边框。
- 海报使用硬边框、粗字重、大留白和封面阴影。
- 评分圆圈使用大数字，形成核心视觉焦点。
- 红色只用于高分强调、红心和 BERLEY 品牌字样。
- 绿色用于 Album Review 标签。

主要布局：

| 区域 | 布局 |
| --- | --- |
| `.workspace` | 桌面双栏，左侧编辑，右侧预览 |
| `.left-rail` | 搜索和编辑面板垂直排列 |
| `.poster-stage` | 可滚动的预览舞台 |
| `.poster` | 纵向海报容器 |
| `.poster-main` | 封面和评分圆圈的双列布局 |
| `.poster-track` | 曲目行 grid |
| `.track-editor__row` | 编辑器曲目行 grid |

响应式规则：

- 小于 `980px` 时改为单栏布局，预览区域提前显示。
- 小于 `680px` 时顶部栏纵向排列，搜索表单和元数据表单改为单列。
- 移动端海报内边距、标题字号、评分圆圈和曲目列宽都会缩小。

## 15. 本地缓存

缓存 key：

```js
const STORAGE_KEY = "my-pitchfork-review-draft";
```

保存时机：

- 专辑加载完成。
- 专辑名变化。
- 艺人名变化。
- 总评分变化。
- 简评变化。
- 单曲评分变化。
- 红心状态变化。

清空逻辑：

- 点击清空或刷新按钮后，`state.draft = null`。
- `persistDraft()` 删除对应 `localStorage` key。
- 页面重新渲染为空状态。

限制：

- 当前只保存一个草稿。
- 没有历史记录。
- 没有导入/导出 JSON。

## 16. 错误和边界处理

已经覆盖的情况：

| 情况 | 处理 |
| --- | --- |
| 搜索关键词为空 | 不发起搜索 |
| 搜索接口失败 | 显示搜索错误 |
| 搜索无结果 | 显示空状态 |
| 曲目加载失败 | 显示提示 |
| 专辑没有曲目 | 抛出错误并提示 |
| 总评分为空时下载 | 阻止下载并提示 |
| 单曲评分未填完整 | 阻止下载并提示剩余数量 |
| 评分超出 `0-100` | 自动压回合法范围 |
| 封面加载失败 | 预览和 canvas 都使用 fallback |
| localStorage 写入失败 | 显示草稿缓存失败 |
| PNG 生成失败 | 显示导出失败 |

仍可加强的情况：

- iTunes 接口偶尔返回重复、地区差异或特殊版本专辑。
- 图片 CDN 跨域策略如果变化，canvas 可能无法读取封面。
- 过多曲目的专辑会生成较长 PNG，分享平台可能压缩或裁切。
- 当前没有自动测试，功能回归主要依赖手动验证。

## 17. 关键函数索引

| 函数 | 职责 |
| --- | --- |
| `init()` | 初始化元素引用、绑定事件并渲染页面 |
| `bindEvents()` | 绑定所有用户交互 |
| `handleSearch()` | 处理专辑搜索 |
| `handleSelectAlbum()` | 处理专辑选择和曲目加载 |
| `handleDownload()` | 校验并导出 PNG |
| `resetCurrentDraft()` | 清空当前草稿 |
| `searchAlbums()` | 调用 iTunes Search API 并规范化专辑结果 |
| `fetchAlbumDraft()` | 调用 iTunes Lookup API 并生成草稿 |
| `requestJsonp()` | 封装 JSONP 请求 |
| `renderAll()` | 全量渲染入口 |
| `renderSearchState()` | 渲染搜索状态 |
| `renderResults()` | 渲染专辑搜索结果 |
| `renderEditor()` | 渲染评分编辑器 |
| `renderTrackEditor()` | 渲染单曲评分和红心列表 |
| `renderPoster()` | 渲染 DOM 海报预览 |
| `renderDownloadState()` | 控制下载按钮和未评分提示 |
| `touchDraft()` | 更新时间并保存草稿 |
| `persistDraft()` | 写入或删除本地缓存 |
| `loadStoredDraft()` | 读取本地缓存并做基本兼容 |
| `normalizeScoreInput()` | 清洗输入框评分 |
| `scoreFromInput()` | 把输入值转换成合法评分 |
| `upgradeArtworkUrl()` | 把 iTunes 封面 URL 升级为高分辨率 |
| `formatDuration()` | 把毫秒转换为 `m:ss` |
| `sanitizeFilename()` | 清理下载文件名 |
| `drawPosterCanvas()` | 创建并绘制导出图片 |
| `calculateCanvasLayout()` | 计算 canvas 排版坐标和高度 |
| `drawArtwork()` | 绘制封面区域 |
| `drawScore()` | 绘制评分圆圈 |
| `drawCanvasTrackList()` | 绘制曲目列表 |
| `drawCanvasKicker()` | 绘制 BERLEY 和 ALBUM REVIEW |
| `drawCanvasHeart()` | 绘制红心 |
| `loadImage()` | 加载封面图片 |
| `downloadCanvas()` | 触发 PNG 下载 |
| `wrapCanvasText()` | canvas 多行换行 |
| `truncateCanvasText()` | canvas 单行截断 |

## 18. 当前实现优点

- 技术栈简单，几乎零依赖，适合快速部署到静态站点。
- 状态集中在一个对象里，小项目维护成本低。
- iTunes API 数据稳定，适合专辑和曲目元数据。
- DOM 预览和 Canvas 导出分离，导出质量更可控。
- 文本换行、截断、红心和高分强调已经覆盖主要视觉边界。
- 本地缓存让工具使用体验更连续。

## 19. 当前实现局限

- `src/app.js` 文件较大，后续功能增多后会变得难维护。
- 没有类型约束，没有自动测试。
- Canvas 和 DOM 是两套渲染逻辑，功能变更时必须同步修改。
- 没有导入/导出草稿数据能力。
- 只能保存一个草稿，不能管理多个专辑评分历史。
- 图片下载依赖浏览器 Canvas 和远程封面跨域支持。
- 当前没有 `.gitignore`、`README.md`、`LICENSE` 等开源基础文件。

## 20. 建议的后续重构方向

如果项目继续扩展，可以分阶段改造。

### 20.1 轻量模块拆分（已完成）

已在保留原生 JS 和零依赖的前提下，把 `src/app.js` 拆分为：

```text
src/
  api/
    itunes.js
  lib/
    artwork.js
    canvas-text.js
    format.js
    storage.js
    validation.js
  poster/
    canvas-renderer.js
    dom-renderer.js
  app.js
```

优先拆：

- iTunes API。
- 文本换行和截断。
- Canvas 绘制。
- 本地缓存。
- 评分清洗。

### 20.2 增加测试

最值得测试的纯函数：

- `scoreFromInput()`
- `formatDuration()`
- `sanitizeFilename()`
- `upgradeArtworkUrl()`
- `wrapCanvasText()`
- `truncateCanvasText()`
- `calculateCanvasLayout()`

这些函数一旦有测试，后续改排版会更放心。

### 20.3 增加 README 和开源文件

准备发布到 GitHub 时建议增加：

```text
README.md
LICENSE
.gitignore
.env.example
```

README 建议包含：

- 项目简介。
- 截图。
- 本地运行方式。
- 功能列表。
- 数据来源说明。
- 许可声明。
- 隐私说明。

### 20.4 静态部署

由于当前项目是纯前端加静态文件服务，部署选择很多：

- GitHub Pages。
- Netlify。
- Vercel。
- Cloudflare Pages。
- 个人网站的静态目录。

需要注意：

- iTunes JSONP 请求依赖用户浏览器访问 Apple API。
- 如果后续接入自己的 API key，不能把 key 放到前端。
- 如果继续纯静态部署，当前架构是匹配的。

## 21. 发布前检查清单

开源或部署前建议确认：

- 页面可以正常搜索专辑。
- 至少测试 `US`、`CN`、`JP` 三个地区。
- 长专辑名不会压住艺人名。
- 长艺人名在 PNG 中最多两行并省略。
- 长歌曲名在预览中换行，在 PNG 中省略。
- 多曲目专辑不会导致导出异常。
- 红心在预览和 PNG 中都能显示。
- 总评分 `>= 90` 时圆圈变红。
- 总评分 `< 90` 时圆圈保持黑色。
- 未填写总评分时不能下载。
- 未填写全部单曲评分时不能下载。
- 封面加载失败时仍可导出。
- `out/` 等生成物不被提交。
- 没有 API key、token、隐私数据或本地路径泄漏。

## 22. 一句话总结

MyPitchfork 当前是一个小而完整的本地海报生成器：它用 iTunes API 获取音乐元数据，用原生 DOM 做实时编辑预览，用 Canvas 生成最终 PNG。它的核心价值在于流程短、依赖少、可部署性强，后续最值得投入的是模块拆分、测试覆盖、开源基础文件和更丰富的海报模板。
