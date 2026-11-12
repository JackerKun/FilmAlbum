<p align="center">
  <img src="assets/icons/icon-256.png" width="92" height="92" alt="Film Album">
</p>
<h1 align="center">Film Album · 胶片档案馆</h1>
<p align="center">整理胶卷和扫描件，找回底片、拍摄地点与当时的照片。</p>
<p align="center">
  简体中文 · <a href="README.en.md">English</a> ·
  <a href="https://github.com/JackerKun/FilmAlbum/releases">下载桌面版</a> ·
  <a href="#界面导览">界面导览</a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a>
</p>

Film Album 是面向胶片摄影的本地档案工作台。以胶卷管理拍摄和冲洗记录，以每格底片管理照片和多个扫描版本。选出的照片可以整理成摄影项目、接触印样或打印画册。支持 macOS、Windows 和本地浏览器模式。

![胶片档案馆的卡片视图，右侧显示选中胶卷的档案和拍摄位置](docs/screenshots/archive.webp)

_截图取自实际界面。专用演示库包含 **72 卷、1,442 条可见底片记录**，复用 17 张 AI 生成的示例影像，包含 135、120、扫描版本、地图定位、摄影项目与画册。_

## 下载与启动

| 设备                             | GitHub Release 安装包                      |
| -------------------------------- | ------------------------------------------ |
| Mac · Apple Silicon（macOS 13+） | `FilmAlbum-<版本>-mac-arm64.dmg`           |
| Mac · Intel（macOS 13+）         | `FilmAlbum-<版本>-mac-x64.dmg`             |
| Windows · Intel / AMD x64        | `FilmAlbum-<版本>-windows-x64-setup.exe`   |
| Windows · ARM64                  | `FilmAlbum-<版本>-windows-arm64-setup.exe` |

Mac 打开 DMG 后将应用拖入「应用程序」，Windows 运行安装向导。Windows ZIP 完整解压后可运行 `Film Album.exe`。安装包自带运行环境，并提供 `SHA256SUMS` 供下载校验。[GitHub Releases](https://github.com/JackerKun/FilmAlbum/releases)

桌面版启动后在后台检查 GitHub 最新正式版本。发现更新时，点击「去下载」可打开发布页，由你决定何时安装。「帮助」菜单也提供「检查更新」和「打开 GitHub 发布页」。离线时可继续使用本地资料库。

## 界面导览

### 胶卷归档与胶片条

新建胶卷时记录胶片、画幅、相机和拍摄日期，可同时在地图上标记地点。归档时还能补充镜头、冲洗、标签以及底片在柜、盒、册、页和片袋中的位置，按永久编号查找或打印二维码标签。

「全部胶卷」支持卡片、档案表格、胶卷架、胶片条和时间轴。默认每批加载 50 卷，向下滚动继续浏览。胶片条默认展开，可同时纵向浏览多卷。顶部「后退 / 前进」会恢复浏览记录中的视图、筛选和滚动位置。

![档案馆同时展开多卷胶片条](docs/screenshots/archive-film.webp)

<details>
<summary>新建胶卷、摄影时间轴与 135 / 120 抽拉</summary>

![新建胶卷表单，含拍摄日期控件、地点地图与胶片型号筛选](docs/screenshots/new-roll.webp)

![按年和月排列的摄影时间轴](docs/screenshots/timeline.webp)

打开整卷后可切换胶片条。135 使用暗盒和双排齿孔胶片，120 使用供片轴、背纸和宽胶片。拖动片头或滑块调整展开程度，双击一格进入大图。

![135 暗盒和双排齿孔胶片](docs/screenshots/film-135.webp)

![120 卷轴、背纸与无齿孔宽胶片](docs/screenshots/film-120.webp)

</details>

### 扫描版本与看片台

导入前可预演分卷、格号、排序和查重。已有底片可加入重扫版本，并切换主版本。看片台支持单张、双图和四图比较、评分、色标与淘汰。大图下方沿当前结果切换照片，按 `I` 展开照片、胶卷、扫描版本、EXIF、直方图和拍摄位置。打开整卷后可从工具栏导出接触印样。

![沉浸看片台的大图、缩略图条、RGB 直方图和拍摄位置](docs/screenshots/lighttable.webp)

### 回忆地图

按胶卷或照片浏览拍摄位置。地图上可预览整卷缩略图、按地名搜索，或给胶卷选点并保存。看片台信息栏「拍摄位置」旁的地图按钮会打开回忆地图并选中当前卷。

![回忆地图上的拍摄位置与上海暮色胶卷预览](docs/screenshots/map.webp)

<details>
<summary>在地图中查找要定位的胶卷</summary>

定位前可用年份、画幅、胶片型号、坐标状态、地点、器材和标签筛选胶卷。

![选卷定位窗口的组合条件和分页结果](docs/screenshots/map-roll-picker.webp)

</details>

### 摄影项目与定制画册

在项目中按章节整理候选和定稿照片，可切换到策展画布编排，或导出作品集。画册支持素材筛选、拖动裁切、毫米坐标、对齐、出血和打印检查，再导出带裁切标记的 RGB PDF。

![定制画册的素材、页面、照片框和排版属性](docs/screenshots/photobook.webp)

<details>
<summary>摄影项目照片序列与资料库总览</summary>

![摄影项目的章节、候选与定稿照片](docs/screenshots/projects.webp)

![资料库总览中的档案数量、预览覆盖和存储卷](docs/screenshots/library.webp)

</details>

## 资料库与离线使用

| 运行方式       | 默认资料库目录                                     |
| -------------- | -------------------------------------------------- |
| macOS 桌面版   | `~/Library/Application Support/Film Album/library` |
| Windows 桌面版 | `%APPDATA%/Film Album/library`                     |
| 本地浏览器版   | 项目下的 `data/`，可通过 `FILMALBUM_DATA_DIR` 修改 |

桌面版「文件 → 打开资料库」可切换到含 `catalog.sqlite` 的目录。外置盘或 NAS 可引用导入，并在断开前生成离线预览。打印和导出原片时需连接原片所在存储。资料库内可检查断链、恢复回收站记录、创建和验证备份。

档案、照片浏览和排版在本机运行。地图底图和地名查询使用配置的联网地图服务。更多导入、备份和快捷键说明见 [使用指南](docs/USER_GUIDE.md)。

## 从源码运行

需要 Node.js 22.13+ 和 npm。macOS 或 Bash 环境下可直接运行项目根目录的启动脚本。

```bash
git clone https://github.com/JackerKun/FilmAlbum.git
cd FilmAlbum
./start.sh
```

也可运行 `npm ci` 后使用 `npm run desktop` 启动桌面版，或用 `npm run serve` 启动本地浏览器版并访问 `http://127.0.0.1:8091`。macOS 源码模式使用原生影像引擎时需要 Xcode Command Line Tools。

访问 `http://127.0.0.1:8091/?debug=1` 可生成应用内置的小型演示库。README 使用独立的截图资料库，可用 `node scripts/screenshots.mjs` 复现。[截图生成说明](docs/screenshots/README.md)

## 开发与发行

使用 `npm run check` 检查界面入口和脚本语法，使用 `npm test` 运行测试。构建矩阵、安装包生成和草稿 Release 流程见 [构建与发布](BUILDING.md)。源码分层见 [架构说明](docs/ARCHITECTURE.md)。

当前为预览软件。Windows 可处理 JPEG、PNG 和 TIFF 扫描件，HEIC 和相机 RAW 支持受平台解码器限制。默认构建的发行签名和 Apple 公证尚未配置。

项目许可为 `UNLICENSED`。第三方组件按各自许可证分发。[第三方许可](packaging/THIRD-PARTY.md)
