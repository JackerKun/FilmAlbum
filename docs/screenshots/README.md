# README 截图 / README screenshots

这组截图使用 Film Album 实际界面和专用临时资料库。模拟数据包含 **72 卷、1,442 条可见底片记录**，横跨 2018 至 2025 年，含多个扫描版本、拍摄坐标、选片项目、画册及离线和断链示例。17 张合成影像在不同记录中复用。简体中文和英文 README 共用这组截图。

These are real UI captures of an isolated documentation library with 72 rolls and 1,442 visible frame records. The fixture reuses 17 synthetic photographs and includes rescans, location pins, a project, a photobook and disconnected storage.

| 文件                   | 画面                                   |
| ---------------------- | -------------------------------------- |
| `archive.webp`         | 胶卷卡片、首批加载的 50 卷及档案侧栏   |
| `new-roll.webp`        | 新建胶卷、日期控件、地图选点与胶片选择 |
| `archive-film.webp`    | 档案馆纵向浏览多卷胶片条               |
| `timeline.webp`        | 按年、月组织胶卷的摄影时间轴           |
| `film-135.webp`        | 135 暗盒、齿孔和展开的胶片             |
| `film-120.webp`        | 120 卷轴、背纸和展开的胶片             |
| `lighttable.webp`      | 看片台大图、缩略图条、直方图与地图     |
| `projects.webp`        | 摄影项目的章节和候选、定稿照片         |
| `map.webp`             | 回忆地图和上海暮色胶卷预览             |
| `map-roll-picker.webp` | 地图选卷、组合筛选和分页               |
| `photobook.webp`       | 定制画册的素材栏、页面和布局控件       |
| `library.webp`         | 资料库总览、预览覆盖和存储卷           |

## 重新生成 / Regenerate

需要 Node.js 22.13+、项目依赖、Google Chrome 和可访问的地图瓦片服务。截图流程使用可移植影像引擎。

```bash
npm ci
node scripts/screenshots.mjs
```

可通过 `FILMALBUM_SCREENSHOT_BROWSER` 指定 Chrome / Chromium 的可执行文件，通过 `FILMALBUM_SCREENSHOT_DIR` 指定输出目录。

脚本会创建独立的 SQLite 资料库和 Chrome 配置目录，使用自动分配的本地端口，退出后清理临时文件。地图底图保留 OpenStreetMap 署名。`capture-report.json` 记录数据规模、项目版本及每张截图的尺寸和界面标题。

## 演示影像 / Demo photographs

[胶片接触表](demo-contact-sheet.webp)和[京都街巷](demo-kyoto.webp)由内置 ImageGen 生成。截图脚本将接触表切成 16 张示例影像，另用京都街巷展示大图和画册。

<details>
<summary>图像生成提示词 / Image generation prompts</summary>

**Contact sheet**

> Create one edge-to-edge photographic contact sheet as a synthetic source asset for Film Album's demo library. EXACTLY 4 columns by 4 rows of equal-sized rectangular landscape photographs, 16 separate photographs, on a 3:2 landscape overall canvas, boundaries at 25%, 50%, 75% precisely, zero gap, zero margins, zero frame, zero text. The cells will be automatically cut along equal quarters, keep composition subjects away from seams. Each cell is a standalone believable analog photograph with film grain, good shadow detail, refined palette. Grid order left-to-right top-to-bottom: row 1: Shanghai art deco waterfront in blue hour, warm Kyoto alley through foliage, Tokyo rainy neon reflections at night, monochrome Beijing hutong cyclist; row 2: pale teal alpine lake, amber rocky desert at sunset, black and white foggy redwood forest, Iceland volcanic black sand and surf; row 3: quiet Lisbon tiled street with tram, charcoal New York city steps, olive-toned Hong Kong ferry framed by harbor, Paris café terrace with gentle morning light; row 4: sunlight on pink wildflowers macro, misty Hangzhou West Lake in pale jade, muted rust-colored train carriage by a station, delicate coastal rocks in black-and-white. All are fictional and show authentic travel documentary photography, no text overlays, no logos or watermarks, exactly 16 equal tiles. High resolution.

**Kyoto lane**

> A standalone 3:2 landscape analog film photograph for the Film Album synthetic documentation library. Early morning in a quiet Kyoto lane in autumn, viewed from street level along a narrow wet stone path between old dark cedar houses, one small person with a pale umbrella halfway down the lane, a Japanese maple with ochre and dark vermilion leaves frames the upper right, softly diffused overcast light, understated Portra-like muted greens, warm blacks and fine visible film grain, believable subtle optical softness, detailed textures in wood and paving, human-scale candid editorial travel photograph with calm atmosphere and layered composition. Realistic photograph, no text overlays, no visible logo, no borders, no graphic design, no collage. High resolution.

</details>
