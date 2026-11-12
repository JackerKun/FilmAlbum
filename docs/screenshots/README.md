# 界面截图与演示数据 / UI screenshots

这些图片来自当前源码运行后的真实界面，使用独立临时资料库，不访问个人资料库。2026-11-12 重新截图，中英文 README 共用同一组图片。源码界面可能领先于已发布安装包。

演示库包含 **72 卷、1,442 条可见底片记录、17 张复用的 AI 生成影像**，覆盖 2018—2025 年，含扫描版本、拍摄坐标、项目、画册、离线和断链场景。画册回归从中选入 40 张照片建册。

Real UI captures from the current source, using an isolated fixture: **72 rolls, 1,442 visible frame records and 17 reused synthetic images**. Captured on 2026-11-12. No personal library or photographs are used.

## 图片索引

| 文件                                           | 展示内容                             |
| ---------------------------------------------- | ------------------------------------ |
| `archive.webp`                                 | 胶卷卡片、首批 50 卷与档案侧栏       |
| `new-roll.webp`                                | 新建胶卷、日期、地图选点与胶片选择   |
| `archive-film.webp`                            | 纵向浏览多卷展开的胶片条             |
| `timeline.webp`                                | 年月摄影时间轴                       |
| `film-135.webp` / `film-120.webp`              | 两种画幅的暗盒、卷轴与胶片           |
| `lighttable.webp`                              | 大图选片、缩略图、直方图与位置       |
| `projects.webp`                                | 项目章节、候选与定稿照片             |
| `map.webp` / `map-roll-picker.webp`            | 回忆地图、选中胶卷与组合筛选         |
| `library.webp`                                 | 资料库、预览覆盖与存储状态           |
| `photobook.webp`                               | 适应窗口的双页编辑与两侧功能区       |
| `book-selection.webp` / `book-sizes.webp`      | 胶卷与相机筛选、连选、分类规格缩略图 |
| `book-builder.webp` / `book-styles.webp`       | 建册流程、12 套风格与应用预览        |
| `book-overview.webp` / `book-reading.webp`     | 整册编排与摄影跨页阅读               |
| `book-shelf.webp`                              | 画册库与长标题布局                   |
| `book-stickers.webp` / `book-graphics.webp`    | 分类贴图、照片形状蒙版与元素编辑     |
| `book-map-insert.webp`                         | 大地图预览、地点设置与框选范围       |
| `book-snapping.webp` / `book-grid-guides.webp` | 吸附参考线、毫米网格与自定义辅助线   |
| `book-context-menu.webp`                       | 元素右键菜单与对齐操作               |
| `book-stable-tools.webp`                       | 固定工具栏、开关状态与侧边折叠把手   |
| `book-export-progress.webp`                    | PDF 导出等待动画与进度               |

## 地图与影像来源

回忆地图截图使用实际加载的 OpenStreetMap 底图并保留署名。画册地图窗口截图使用随应用提供的真实 Natural Earth 离线地理示意图。

画册回归中的地名搜索使用固定结果；街道框选测试使用明确标记的测试瓦片，只留在临时回归目录，**不发布为产品地图截图**。元素蒙版、吸附与辅助线截图包含专门用于交互验证的组合元素。

## 重新生成

需要 Node.js 22.13+、项目依赖、Google Chrome / Chromium。主界面在线地图截图还需要可访问的地图服务。脚本使用可移植影像引擎、独立 SQLite 资料库和浏览器配置，不修改个人资料。

```bash
npm ci
FILMALBUM_SCREENSHOT_DIR=/tmp/filmalbum-readme-refresh node scripts/screenshots.mjs
node scripts/qa-photobook.mjs
```

- 主界面脚本默认直接输出到本目录；建议像上面一样先输出临时目录，检查后再替换。
- `FILMALBUM_SCREENSHOT_BROWSER` 可指定主界面截图使用的 Chrome / Chromium 可执行文件。
- 画册脚本默认输出到系统临时目录下的 `filmalbum-book-qa`，同时验证编辑、面板、平移缩放、阅读与三种 PDF 导出。其 `report.json` 记录截图和检查结果。
- 检查截图后，将主界面图片与画册图片复制到本目录；`photobook.webp` 选用画册回归中的跨页编辑图。不要复制 `book-map-crop.webp` 测试瓦片截图。
- `capture-report.json` 汇总本次发布的图片尺寸、字节数、生成流程与数据规模；不包含演示影像源文件。

## 演示影像 / Demo photographs

[胶片接触表](demo-contact-sheet.webp)和[京都街巷](demo-kyoto.webp)由内置 ImageGen 生成。截图脚本将接触表切成 16 张示例影像，另用京都街巷展示大图和画册。

<details>
<summary>图像生成提示词 / Image generation prompts</summary>

**Contact sheet**

> Create one edge-to-edge photographic contact sheet as a synthetic source asset for Film Album's demo library. EXACTLY 4 columns by 4 rows of equal-sized rectangular landscape photographs, 16 separate photographs, on a 3:2 landscape overall canvas, boundaries at 25%, 50%, 75% precisely, zero gap, zero margins, zero frame, zero text. The cells will be automatically cut along equal quarters, keep composition subjects away from seams. Each cell is a standalone believable analog photograph with film grain, good shadow detail, refined palette. Grid order left-to-right top-to-bottom: row 1: Shanghai art deco waterfront in blue hour, warm Kyoto alley through foliage, Tokyo rainy neon reflections at night, monochrome Beijing hutong cyclist; row 2: pale teal alpine lake, amber rocky desert at sunset, black and white foggy redwood forest, Iceland volcanic black sand and surf; row 3: quiet Lisbon tiled street with tram, charcoal New York city steps, olive-toned Hong Kong ferry framed by harbor, Paris café terrace with gentle morning light; row 4: sunlight on pink wildflowers macro, misty Hangzhou West Lake in pale jade, muted rust-colored train carriage by a station, delicate coastal rocks in black-and-white. All are fictional and show authentic travel documentary photography, no text overlays, no logos or watermarks, exactly 16 equal tiles. High resolution.

**Kyoto lane**

> A standalone 3:2 landscape analog film photograph for the Film Album synthetic documentation library. Early morning in a quiet Kyoto lane in autumn, viewed from street level along a narrow wet stone path between old dark cedar houses, one small person with a pale umbrella halfway down the lane, a Japanese maple with ochre and dark vermilion leaves frames the upper right, softly diffused overcast light, understated Portra-like muted greens, warm blacks and fine visible film grain, believable subtle optical softness, detailed textures in wood and paving, human-scale candid editorial travel photograph with calm atmosphere and layered composition. Realistic photograph, no text overlays, no visible logo, no borders, no graphic design, no collage. High resolution.

</details>
