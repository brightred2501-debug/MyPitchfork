# MyPitchfork 本地网页应用开发方案

## 1. 需求理解

目标是做一个本地运行的网页应用，用来快速生成一张 Pitchfork 风格的专辑评分图片。

核心流程：

1. 用户输入专辑名称。
2. 应用自动搜索并获取专辑信息，包括：
   - 专辑名
   - 歌手 / 乐队名
   - 专辑封面
   - 歌曲列表
   - 每首歌时长
3. 用户选择正确的专辑。
4. 用户为每首歌填写评分或星级。
5. 用户手动填写专辑总评分，评分体系为 `0-100` 的整数。
6. 用户填写一段简单评语。
7. 应用生成一张评分图片，内容包括：
   - 中间上方的专辑名字
   - 歌手 / 乐队名
   - 左侧带阴影的专辑封面
   - 右侧圆圈数字总评分
   - 总评分超过 90 时，评分圆圈使用红色强调
   - 简单评语
   - 每首歌曲的名称、时长、评分
8. 用户可以下载生成的图片。

## 2. 已确认决策

- 产品形态：本地网页应用。
- 专辑数据源：使用 Apple 官方 iTunes Search API / Lookup API。
- 封面来源：使用 Apple 官方接口返回的 `artworkUrl100`，并按 Apple 图片 CDN 的常见规则提升分辨率。
- 总评分体系：`0-100` 整数。
- 总评分输入方式：用户手动填写，不由单曲评分自动计算。

## 3. 数据源方案

本项目的数据获取直接调用 Apple 官方 iTunes Search API，不依赖第三方封面搜索网站。

官方参考文档：

- iTunes Search API Overview: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html
- Search Examples: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/SearchExamples.html
- Lookup Examples: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html

### 3.1 专辑搜索

使用 Apple 官方 iTunes Search API 搜索专辑：

```text
https://itunes.apple.com/search?term={keyword}&media=music&entity=album&limit=10&country={country}
```

返回结果中重点使用字段：

- `collectionId`：专辑 ID，用于后续查询曲目。
- `collectionName`：专辑名。
- `artistName`：歌手 / 乐队名。
- `artworkUrl100`：封面图 URL。
- `releaseDate`：发行日期，可用于辅助用户选择正确版本。
- `trackCount`：曲目数量。
- `primaryGenreName`：音乐类型，可选展示。

### 3.2 曲目获取

使用 Apple 官方 iTunes Lookup API 根据 `collectionId` 获取专辑曲目：

```text
https://itunes.apple.com/lookup?id={collectionId}&entity=song&country={country}
```

返回结果通常第一项是专辑信息，后续项是歌曲。曲目字段：

- `trackName`：歌曲名。
- `trackNumber`：曲序。
- `trackTimeMillis`：歌曲时长，前端格式化为 `m:ss`。
- `discNumber`：多碟专辑时用于排序。

排序规则：

1. 按 `discNumber` 升序。
2. 按 `trackNumber` 升序。

### 3.3 封面高清化

iTunes 常返回 `100x100` 封面图，例如：

```text
.../100x100bb.jpg
```

前端可将尺寸替换为较大尺寸，例如：

```text
.../1200x1200bb.jpg
```

初始建议使用 `1200x1200`，兼顾清晰度和加载速度。若图片加载失败，则回退到原始 `artworkUrl100`。

### 3.4 国家/地区参数

默认使用 `country=us`，因为国际专辑数据较完整。

后续可以在设置中加入地区选项：

- `us`
- `cn`
- `jp`
- `gb`
- `tw`
- `hk`

第一版不必做复杂地区管理，先保留默认值和内部配置即可。

## 4. 应用页面结构

第一版建议做成单页应用，不做营销首页，打开后直接进入工具界面。

页面分为三个主要区域：

1. 搜索与选择区
2. 编辑评分区
3. 海报预览与导出区

### 4.1 搜索与选择区

功能：

- 输入专辑名关键词。
- 点击搜索按钮。
- 展示搜索结果列表。
- 每条结果展示：
  - 小封面
  - 专辑名
  - 歌手 / 乐队名
  - 发行年份
  - 曲目数量
- 用户点击某个结果后，应用加载曲目列表。

状态：

- 初始状态
- 搜索中
- 无结果
- 搜索失败
- 已选择专辑

### 4.2 编辑评分区

展示已选专辑信息和可编辑字段。

用户可编辑：

- 专辑显示名称
- 歌手 / 乐队显示名称
- 专辑总评分，`0-100` 整数
- 简短评语
- 每首歌评分

单曲评分第一版建议使用 `0-100` 整数输入，与总分保持一致。

如果后续希望支持星级，可增加显示模式：

- 分数模式：`0-100`
- 星级模式：`0-5`

但第一版建议先统一为 `0-100`，减少换算和视觉表达复杂度。

### 4.3 海报预览与导出区

实时预览最终图片。

海报内容布局：

- 顶部居中：
  - 专辑名
  - 歌手 / 乐队名
- 主视觉区：
  - 左侧：专辑封面，带阴影
  - 右侧：圆形总评分
- 中部：
  - 简短评语
- 下部：
  - 曲目列表
  - 每行展示歌曲名、时长、评分

导出功能：

- 点击下载按钮。
- 将预览区域导出为 PNG。
- 默认文件名：

```text
{artistName} - {albumName} rating.png
```

## 5. 海报视觉方案

整体方向是 Pitchfork 风格参考，而不是直接复制品牌资产。

建议视觉特征：

- 黑白为主，强调排版。
- 使用粗体无衬线字体做标题。
- 留白明确。
- 封面有轻微投影。
- 总评分使用醒目的圆圈数字。
- 总评分 `>= 90` 时使用红色圆圈或红色数字。
- 曲目列表使用紧凑表格感布局。

建议画布尺寸：

- 默认导出：`1200 x 1600`
- 预览区按比例缩放显示。

评分颜色规则：

- `0-89`：黑色或深灰。
- `90-100`：红色强调。

第一版不引入 Pitchfork logo，也不直接使用 Pitchfork 的商标或官方版式，以降低侵权风险。

## 6. 技术选型建议

因为当前项目目录尚未发现已有源码，建议从轻量前端项目开始。

推荐方案：

- Vite
- React
- TypeScript
- CSS Modules 或普通 CSS
- `html-to-image` 或 `modern-screenshot` 用于导出 PNG
- `lucide-react` 用于按钮图标

理由：

- 本地启动快。
- 交互状态清晰。
- 后续扩展桌面应用或本地存档也方便。
- 图片导出库能直接把 DOM 预览转为 PNG。

可选替代：

- 纯 HTML/CSS/JavaScript：更简单，但状态管理和后续维护较弱。
- Next.js：能力更完整，但本地小工具略重。

## 7. 模块设计

建议目录结构：

```text
src/
  api/
    itunes.ts
  components/
    AlbumSearch.tsx
    AlbumResultList.tsx
    RatingEditor.tsx
    PosterPreview.tsx
    TrackRatingTable.tsx
  lib/
    artwork.ts
    format.ts
    posterExport.ts
  types/
    album.ts
  App.tsx
  main.tsx
  styles.css
```

### 7.1 `api/itunes.ts`

职责：

- 搜索专辑。
- 根据专辑 ID 获取曲目。
- 将 iTunes 原始返回转换为应用内部数据结构。

### 7.2 `lib/artwork.ts`

职责：

- 将 `artworkUrl100` 转换为高清封面 URL。
- 提供封面加载失败时的回退逻辑。

### 7.3 `lib/format.ts`

职责：

- 毫秒转 `m:ss`。
- 清理导出文件名。
- 校验评分范围。

### 7.4 `components/PosterPreview.tsx`

职责：

- 渲染最终海报。
- 保持固定画布比例。
- 处理长标题、长歌名、多曲目时的排版。

### 7.5 `lib/posterExport.ts`

职责：

- 将海报 DOM 节点导出为 PNG。
- 处理图片跨域、字体加载、缩放倍率。

## 8. 数据类型草案

```ts
export type AlbumSearchResult = {
  collectionId: number;
  albumName: string;
  artistName: string;
  artworkUrl: string;
  releaseDate?: string;
  trackCount?: number;
  genre?: string;
};

export type Track = {
  id: number | string;
  discNumber: number;
  trackNumber: number;
  name: string;
  durationMs?: number;
  rating?: number;
};

export type ReviewDraft = {
  albumName: string;
  artistName: string;
  artworkUrl: string;
  overallScore?: number;
  comment: string;
  tracks: Track[];
};
```

## 9. 错误处理

需要覆盖以下情况：

- 搜索接口失败。
- 搜索无结果。
- 选中的专辑没有曲目信息。
- 封面高清图加载失败。
- 用户输入总评分为空或超出 `0-100`。
- 单曲评分为空或超出 `0-100`。
- 海报导出失败。

第一版可用页面内提示，不需要复杂通知系统。

## 10. 本地缓存

第一版建议加入 `localStorage` 草稿缓存。

缓存内容：

- 当前选择的专辑
- 用户填写的总评分
- 简评
- 每首歌评分

价值：

- 刷新页面后不丢评分。
- 本地工具使用体验更稳。

不建议第一版做多专辑历史库，避免范围扩大。

## 11. 实现阶段

### 阶段一：项目初始化

- 创建 Vite + React + TypeScript 项目。
- 配置基础样式。
- 建立核心类型。
- 搭建单页布局。

### 阶段二：专辑搜索与曲目获取

- 接入 iTunes Search API。
- 展示搜索结果。
- 接入 Lookup API。
- 格式化曲目时长和排序。
- 实现封面高清化与回退。

### 阶段三：评分编辑

- 实现总评分输入。
- 实现简评输入。
- 实现单曲评分输入。
- 加入评分范围校验。
- 加入本地草稿缓存。

### 阶段四：海报预览

- 实现固定比例海报组件。
- 完成专辑封面、标题、歌手、总评分、简评、曲目表排版。
- 处理长文本和多曲目情况。
- 加入 `>= 90` 红色强调规则。

### 阶段五：图片导出

- 接入 DOM 转 PNG 库。
- 实现下载按钮。
- 测试高清封面导出。
- 处理跨域图片失败时的提示或回退。

### 阶段六：体验打磨

- 补充加载、空状态、错误状态。
- 调整移动端布局。
- 检查导出图片中文字不重叠。
- 测试不同专辑：
  - 短标题专辑
  - 长标题专辑
  - 多碟专辑
  - 曲目很多的专辑
  - 非英文专辑

## 12. 主要风险与对策

### 12.1 Apple/iTunes 接口跨域问题

风险：浏览器直接请求接口时可能受 CORS 限制。

对策：

- 先尝试浏览器直接请求。
- 如果受限，Vite 开发环境配置本地代理。
- 未来如需打包成静态页面，可考虑让用户手动配置代理服务，或切换到支持 CORS 的音乐元数据源。

### 12.2 图片导出跨域问题

风险：外链封面图可能污染 canvas，导致导出失败。

对策：

- 图片元素设置 `crossOrigin="anonymous"`。
- 优先使用支持跨域的 Apple CDN 图片。
- 导出失败时提示用户，并保留手动上传封面的后续扩展入口。

### 12.3 搜索结果不唯一

风险：同名专辑、豪华版、单曲、地区版本混在一起。

对策：

- 搜索结果列表显示发行年份、曲目数量和封面。
- 用户手动选择正确版本。

### 12.4 曲目过多导致海报拥挤

风险：双专辑或豪华版曲目太多，海报下方列表溢出。

对策：

- 第一版限制曲目表字号和行高。
- 超过一定曲目数时压缩列表间距。
- 仍然过多时允许海报高度自动增加，导出长图。

## 13. 第一版验收标准

第一版完成后，应满足：

- 可以输入专辑名并搜索。
- 可以从搜索结果中选择专辑。
- 可以自动加载封面和曲目列表。
- 可以填写专辑总评分、简评和每首歌评分。
- 总评分使用 `0-100` 整数。
- 总评分 `>= 90` 时，海报评分圆圈变红。
- 可以实时预览海报。
- 可以导出 PNG 图片。
- 刷新页面后，当前草稿不会立即丢失。

## 14. 后续可扩展功能

- 手动上传或替换专辑封面。
- 支持星级模式。
- 支持多个海报模板。
- 支持专辑历史记录。
- 支持自定义导出尺寸。
- 支持字体选择。
- 支持更多音乐数据源，例如 MusicBrainz、Spotify、Last.fm。
- 支持批量保存评分数据为 JSON。
