<p align="center">
  <img src="assets/icons/icon-256.png" width="104" height="104" alt="Film Album logo">
</p>
<h1 align="center">Film Album</h1>
<p align="center">胶卷、底片、摄影记忆与纸上画册，一处归档。</p>
<p align="center">
  <a href="https://github.com/JackerKun/FilmAlbum/actions/workflows/desktop-build.yml"><img src="https://github.com/JackerKun/FilmAlbum/actions/workflows/desktop-build.yml/badge.svg" alt="Desktop builds"></a>
  <img src="https://img.shields.io/badge/macOS-13%2B-202720" alt="macOS 13+">
  <img src="https://img.shields.io/badge/Windows-x64%20%7C%20ARM64-202720" alt="Windows x64 and ARM64">
  <img src="https://img.shields.io/badge/Local--first-SQLite-c7b57a" alt="Local-first SQLite">
</p>
<p align="center">
  简体中文 · <a href="README.en.md">English</a> ·
  <a href="https://github.com/JackerKun/FilmAlbum/releases">下载桌面版</a> ·
  <a href="#界面导览">界面预览</a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a> ·
  <a href="BUILDING.md">构建与发布</a>
</p>

Film Album 是面向长期胶片收藏的本地档案工作台。它把胶卷信息、每格底片、多个扫描版本、实物存放位置、地图记忆与摄影画册连在一起，支持 macOS / Windows 桌面应用和本地浏览器模式。

![档案馆卡片总览：8 卷演示胶卷、组合筛选、收藏与右侧档案检查器](docs/screenshots/archive.webp)

_真实界面，使用内置合成演示数据。下方[界面导览](#界面导览)介绍各工作区的入口与操作。_

**当前处于预览阶段。** [3.0.1](https://github.com/JackerKun/FilmAlbum/releases/tag/v3.0.1) 已通过 Mac Apple Silicon / Intel 与 Windows x64 / ARM64 的原生构建、启动、缩略图、原片及 PDF 保存自动检查；这不代表全部功能均完成人工验收。默认包尚未配置正式发行签名 / Apple 公证。

## 下载与安装

前往 [Releases](https://github.com/JackerKun/FilmAlbum/releases)，按设备选择：

| 设备                          | 下载文件                                   | 安装方式                          |
| ----------------------------- | ------------------------------------------ | --------------------------------- |
| Mac · Apple Silicon（M 系列） | `FilmAlbum-<版本>-mac-arm64.dmg`           | 打开 DMG，将应用拖入 Applications |
| Mac · Intel                   | `FilmAlbum-<版本>-mac-x64.dmg`             | 同上；需要 macOS 13 或更新版本    |
| Windows · Intel / AMD 64 位   | `FilmAlbum-<版本>-windows-x64-setup.exe`   | 运行安装向导                      |
| Windows · ARM64               | `FilmAlbum-<版本>-windows-arm64-setup.exe` | 在 Windows ARM 设备运行安装向导   |

也提供 macOS / Windows ZIP。Windows ZIP 必须**完整解压**后运行 `Film Album.exe`，不能只复制 EXE。桌面版自带运行环境，不需要安装 Node.js、npm 或 Xcode。

Release 同时提供 `SHA256SUMS` 供核对下载文件。Actions 的下载附件会按保留期限过期，正式下载以已发布的 Release 为准。

## 核心功能

| 模块            | 主要能力                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| **档案馆**      | 卡片、档案表格、胶卷架、摄影编年时间轴；胶片、相机、镜头、日期和冲洗记录       |
| **胶卷抽拉**    | 135 暗盒与齿孔胶片；120 卷轴、背纸与无齿孔宽胶片；拖动片头展开整卷             |
| **看片台**      | 单图 / 双图 / 四图对比、缩略图条、缩放、EXIF、RGB 直方图、评分与色标           |
| **项目 / 策展** | 摄影项目、章节、候选与定稿、自由画布、排序和作品集导出                         |
| **回忆地图**    | 默认中国全国，可设置默认国家；县城 / 街道缩放、地名查找、照片预览与落点确认    |
| **定制画册**    | 多比例尺寸预设、精细素材筛选、毫米坐标、四角缩放、拖动裁切、对齐分布与打印 PDF |
| **资料库**      | 原片检查、断链 / 重复报告、外置盘引用、离线预览、历史、回收站及备份恢复        |

- **胶卷与底片分别管理**：同一格底片可保留多个扫描或调色版本，切换主版本不会丢失底片记录。
- **面向大资料库筛选**：地点、胶卷、日期、135 / 120、BW / Color、型号、相机、镜头、标签、评分、存储卷、在线状态等可组合查询；结果按页加载。
- **找到实物底片**：柜、盒、册、页、片袋位置与永久胶卷编号、二维码标签相互对应。
- **为纸上输出设计**：素材拖入画册，拖四角调整照片框，双击进入裁切；支持出血、裁切标记和有效 DPI 检查。

地图定位、画册编辑、快捷键与资料库操作详见 [使用指南](docs/USER_GUIDE.md)。

## 界面导览

以下截图来自 **3.0.1 内置演示资料库：8 卷、98 张可见模拟影像**，包含多扫描版本、世界坐标、项目、画册和离线 / 断链案例。山景为程序在本机生成的合成图，不含真实用户照片。截图使用简体中文界面；可在顶部切换 English。图片可点击查看大图，次要界面可展开查看。

### 从胶卷到每格底片

<details>
<summary>135 / 120 胶卷抽拉：不同卷轴、齿孔与展开方式</summary>

**入口：** 档案馆进入一卷 → 看片台选择“胶片条”。拖动金色片头 / 收片轴，或用下方滑块展开；横向拖动浏览，双击底片进入大图。

**135：** 暗盒与双排齿孔胶片，可抽出、收卷。

![135 抽拉界面：Portra 400 暗盒、齿孔胶片、展开滑块与逐格预览](docs/screenshots/film-135.webp)

**120：** 供片轴、背纸与收片轴，宽胶片无齿孔；画幅比例随 6×4.5 / 6×6 / 6×7 等规格变化。

![120 卷片界面：供片轴、背纸、无齿孔宽胶片与收片轴](docs/screenshots/film-120.webp)

</details>

<details>
<summary>摄影时间轴：按年、月回看拍摄记录</summary>

**入口：** 档案馆 → 时间轴。按真实拍摄日期排列，使用年份索引或顺序切换快速回看；每卷保留照片、器材、胶片、日期与存放位置线索。

![摄影时间轴：年份索引、按月排列的胶卷记录及右侧档案](docs/screenshots/timeline.webp)

</details>

### 看片台：照片、信息与当前结果一起看

**入口：** 看片台双击照片。底部缩略图条对应当前查询结果；`F` 适合窗口、`Z` 原像素、`I` EXIF、`H` 直方图、`1–5` 评分。还支持两图 / 四图对比与扫描版本对照。

![沉浸看片台：大图、当前结果缩略图条、EXIF、RGB 直方图、评分与色标](docs/screenshots/lighttable.webp)

<details>
<summary>摄影项目：按章节组织候选与定稿照片</summary>

**入口：** 项目 / 策展 → 选择项目。将看片台选片加入项目，按章节及候选 / 定稿筛选；可切换策展画布安排图片，或导出作品集。

![摄影项目：世界漫游示例项目的照片序列、章节与选片状态入口](docs/screenshots/projects.webp)

</details>

### 回忆地图：先看照片，再确认位置

**入口：** 回忆地图。点击胶卷标记查看照片预览；用“查地点”寻找省、市、县或街道。定位时先选卷，再点击地图落点并确认保存。默认全国视野，可在资料库设置中更换国家。

![回忆地图：中国区域底图、胶卷位置、上海暮色照片预览与已保存坐标](docs/screenshots/map.webp)

<details>
<summary>海量选卷检索：定位状态、日期、地点、设备与胶片组合筛选</summary>

**入口：** 回忆地图 → 定位选中胶卷。支持名称 / 永久编号关键词、已定位 / 未定位、年份、135 / 120、黑白 / 彩色、胶片型号，以及更多日期、地点、设备、项目、标签条件；结果包含预览图、有效坐标与分页。已保存坐标但地名为空，仍显示“已定位”。

![定位选卷窗口：定位状态与多维组合筛选、照片封面、已定位标记和坐标](docs/screenshots/map-roll-picker.webp)

</details>

### 定制画册：筛选素材，精确排版，导出打印

**入口：** 定制画册 → 新建画册或编辑示例画册。左侧按地点、胶卷、日期等条件找图；中间拖动照片框及四角调大小，双击拖动裁切；右侧设置毫米坐标、旋转、对齐与分布。完成后保存，运行“打印检查 / PDF”检查分辨率和缺图，再导出。

![画册设计器：详细素材筛选、带安全线的页面、选中照片框与精确对齐属性](docs/screenshots/photobook.webp)

<details>
<summary>资料库：检查原片、生成离线预览与管理外置盘</summary>

**入口：** 资料库 → 总览。查看原片、预览缓存及离线 / 断链情况，运行完整性检查；在“备份”中生成并验证快照。离线预览要在原片连接时先生成，拔掉外置盘后仍可浏览缓存；打印或导出原片仍需连接原片。

![资料库总览：胶卷和照片统计、离线预览覆盖、原片检查与存储卷](docs/screenshots/library.webp)

</details>

### 自己体验同样的演示数据

按下文[从源码运行](#从源码运行)启动本地服务后，访问 `http://127.0.0.1:8091/?debug=1`：

1. 在实验入口点击“生成全新演示资料库”。
2. 等后台任务完成，在任务中心点击“打开演示资料库”。
3. 浏览上述工作区；完成后点击“演示模式 · 返回”→“返回正式资料库”。

演示数据生成在独立目录，不会覆盖原资料库。正常启动时不显示实验入口。维护者可用 [截图脚本](scripts/screenshots.mjs) 更新图片，复现方式见 [截图说明](docs/screenshots/README.md)。

## 数据放在哪里

默认数据保存在设备上；核心档案、预览和画册操作不需要云账号。

| 运行方式              | 默认资料库                                         |
| --------------------- | -------------------------------------------------- |
| macOS 桌面版          | `~/Library/Application Support/Film Album/library` |
| Windows 桌面版        | `%APPDATA%/Film Album/library`                     |
| 本地浏览器 / 源码模式 | 项目下的 `data/`，可用 `FILMALBUM_DATA_DIR` 修改   |

桌面菜单 **文件 / File → 打开资料库** 可选择含 `catalog.sqlite` 的现有目录。打开其他库不会自动合并或移动照片。升级和迁移前建议先在“资料库 → 备份”生成并验证快照。

外置盘 / NAS 支持引用导入和离线预览；删除先进入回收站。原片检查使用哈希识别内容变化，未知哈希的旧文件会在首次检查时建立基准。

地图瓦片与地名搜索需要联网，会向所配置的地图服务请求相应位置 / 查询文字；照片分类、OCR 与画册导出在本机执行。地图服务可替换为自建服务。

## 从源码运行

需要 Git、Node.js **22.13+**（建议 24 LTS）与 npm。

```bash
git clone https://github.com/JackerKun/FilmAlbum.git
cd FilmAlbum
npm ci
npm run desktop
```

也可以启动本地浏览器版：

```bash
npm run serve
# 打开 http://127.0.0.1:8091
```

macOS 源码模式首次处理影像会编译 Swift 辅助程序，需要先安装 Xcode Command Line Tools：`xcode-select --install`。已打包的桌面应用不需要此步骤。启动、切库、端口冲突及 Windows PowerShell 写法见 [构建与运行说明](BUILDING.md)。

## 在 GitHub 构建安装包

### 手动构建

1. 将完整源码推送到本仓库的默认分支，包含 `.github/`、`scripts/`、`assets/` 和 `package-lock.json`。
2. 打开 [Actions → Desktop builds](https://github.com/JackerKun/FilmAlbum/actions/workflows/desktop-build.yml)，点击 **Run workflow**。
3. 选择系统 `all / mac / win` 与架构 `all / arm64 / x64`。首次建议选择 `all / all`。
4. 完成后进入该次运行的 **Artifacts** 下载对应 `FilmAlbum-mac-arm64` 等附件。解压外层附件后，里面才是 DMG、安装 EXE 或程序 ZIP。

四个平台分别使用 GitHub 原生 macOS / Windows runner；每组执行依赖安装、UI 检查、自动测试、打包、实际应用启动检查和 SHA-256 校验。失败的启动日志会随可用构建附件保留，不能当成验证通过的 Release。

### 按版本生成 Release

`package.json` 中的版本与标签必须一致。当前版本示例：

```bash
git tag v3.0.1
git push origin v3.0.1
```

标签触发全部四组构建；**全部通过后自动创建草稿 Release**，附上安装包、ZIP、构建记录和 `SHA256SUMS`。在 [Releases](https://github.com/JackerKun/FilmAlbum/releases) 检查说明与附件后，再点击 **Publish release** 公开。手动运行只生成 Actions 附件，不自动发布。

草稿上传使用工作流自身的 `GITHUB_TOKEN`，不需要另建个人访问令牌；仅 Release 任务申请 `contents: write`。默认构建不依赖签名证书。详细维护步骤见 [BUILDING.md](BUILDING.md)。

## 代码结构

源码按职责放在 `src/client/`、`src/server/`、`src/shared/`；Electron 在 `desktop/`，Swift 在 `native/`，测试在 `tests/`，构建和发布工具在 `scripts/`。根目录只保留入口、依赖和项目说明。格式化使用 Prettier；详见 [架构与开发约定](docs/ARCHITECTURE.md)。

## 本地打包与检查

```bash
./build.sh all                    # macOS 上生成两种 Mac 包和两种 Windows ZIP
./build.sh mac --arch host        # 当前 Mac 架构
./build.sh all --plan             # 仅查看构建目标
npm run check
npm test
```

Windows 本机使用 `./build.ps1 win --arch x64` 或 Git Bash；它会同时生成安装向导 EXE 与 ZIP。macOS DMG 需要 macOS 主机。输出位于 `dist/<版本>/<系统>-<架构>/`。

## 当前边界

| 能力                                | macOS        | Windows                         |
| ----------------------------------- | ------------ | ------------------------------- |
| 档案、看片、地图、画册编辑          | 支持         | 支持                            |
| JPEG / PNG / TIFF 预览、二维码、PDF | 支持         | 支持                            |
| 本地中文 / 英文 OCR                 | Apple Vision | 离线 Tesseract                  |
| HEIC 解码                           | ImageIO      | 当前不支持                      |
| 物体分类                            | Apple Vision | 当前不支持；保留 OCR 与主色线索 |

- Windows 暂无相机 RAW 解码；建议使用 TIFF / JPEG 扫描稿。macOS 的具体格式支持取决于系统 ImageIO。
- PDF 为带页面框、出血和裁切标记的 **RGB 单页顺序文件**；不等同于 CMYK / PDF-X 认证或印厂拼版。
- 简体中文与 English 覆盖主要导航和常用操作，部分动态说明尚未完成英文覆盖。
- 模拟元数据容量测试不等同于真实海量 TIFF 导入、磁盘故障或 NAS 长期压力测试。
- GitHub 上的首次原生运行结果以 Actions 为准；本地 Rosetta 测试不能替代 Intel Mac 原生验证。

## 项目与第三方许可

项目许可目前为 `UNLICENSED`，尚未选定开源许可证。第三方组件按各自许可证分发，见 [THIRD-PARTY.md](packaging/THIRD-PARTY.md)、字体 / OCR 资源附带许可及 [Logo 设计记录](assets/LOGO.md)。

## 桌面导出与离线预览

PDF 生成后会提示系统“另存为”；任务中心区分“PDF 已生成”和“已保存”，可再次选择“保存 PDF”。原片导出保留实际扩展名，保存完成后可在文件管理器中显示。取消保存不会删除已生成的 PDF。

离线预览是保存在本资料库的 640 / 1600 像素浏览缓存，无需下载。**先连接原片并生成缓存，再断开外置盘**，之后在“全库照片”中照常查看；“离线 / 断链”只是筛选原片不可用的照片，全部在线时为空是正常情况。资料库总览展示缓存数量，任务中心列出失败原因。引用导入可直接选择外置盘目录，并默认生成预览。打印画册和导出原片仍需要原片在线。
