<p align="center">
  <img src="assets/icons/icon-256.png" width="92" height="92" alt="Film Album">
</p>
<h1 align="center">Film Album · 胶片档案馆</h1>
<p align="center">从一卷胶片，到一本摄影画册。</p>
<p align="center">
  简体中文 · <a href="README.en.md">English</a> ·
  <a href="https://github.com/JackerKun/FilmAlbum/releases">下载桌面版</a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a> ·
  <a href="docs/photobook-studio.md">画册工作台</a>
</p>

Film Album 是面向胶片摄影的本地档案与画册工作台。以胶卷记录拍摄、器材、冲洗和底片位置，以每格底片管理照片与多个扫描版本；再把选出的影像编成摄影项目、接触印样和画册。支持 macOS、Windows，也可在本地浏览器运行。

![胶片档案馆：多卷卡片、筛选与胶卷档案侧栏](docs/screenshots/archive.webp)

_以上及下方均为当前代码运行后的实际界面截图，使用独立的 **72 卷、1,442 条可见底片记录** 演示库。17 张 AI 生成示例影像在不同记录中复用；不包含个人照片。截图生成方法见[截图说明](docs/screenshots/README.md)。源码截图可能包含尚未打包到正式 Release 的功能。_

## 下载与启动

在 [GitHub Releases](https://github.com/JackerKun/FilmAlbum/releases) 选择适合设备的安装包：

| 设备                             | 安装包                                     |
| -------------------------------- | ------------------------------------------ |
| Mac · Apple Silicon（macOS 13+） | `FilmAlbum-<版本>-mac-arm64.dmg`           |
| Mac · Intel（macOS 13+）         | `FilmAlbum-<版本>-mac-x64.dmg`             |
| Windows · Intel / AMD x64        | `FilmAlbum-<版本>-windows-x64-setup.exe`   |
| Windows · ARM64                  | `FilmAlbum-<版本>-windows-arm64-setup.exe` |

Mac 打开 DMG 后拖入「应用程序」；Windows 运行安装向导，或完整解压 ZIP 后启动 `Film Album.exe`。桌面安装包自带运行环境，下载文件可用发布页中的 `SHA256SUMS` 校验。

启动时会在后台检查 GitHub 最新正式 Release，发现新版本后提供「去下载」入口；安装由用户自行决定。「帮助」菜单也可主动检查更新或打开 GitHub 发布页，断网不影响本地资料库使用。

## 围绕胶片的工作流程

| 工作环节   | 可以做什么                                                 |
| ---------- | ---------------------------------------------------------- |
| 建卷与归档 | 胶片型号、画幅、相机、镜头、日期、冲洗、标签和地图位置     |
| 找到底片   | 永久编号、柜 / 盒 / 册 / 页 / 片袋位置、二维码标签         |
| 扫描与选片 | 导入预演、重复检查、多个扫描版本、评级、色标、淘汰与对比   |
| 整理故事   | 摄影项目、章节、候选与定稿照片、回忆地图                   |
| 编排画册   | 三步建册、分类风格与规格、跨页排版、贴图、蒙版、地图与注释 |
| 输出与保存 | 接触印样、三种画册 PDF、资料库备份、离线预览与断链检查     |

### 胶卷档案与胶片条

「全部胶卷」提供卡片、档案表格、胶卷架、胶片条和时间轴，默认每批加载 50 卷。胶片条默认展开，上下滚动即可浏览多卷；打开整卷后，135 暗盒与 120 卷轴有各自的抽拉表现。顶部后退 / 前进可返回此前的浏览位置。

新建胶卷时选择胶片型号，用日期控件记录时间，并在地图上设置拍摄位置。批量修改按字段提供合适的操作：评分、色标和状态可选择，备注、标签、相机等可以录入，地点在地图上设置。

![全部胶卷中的多卷胶片条](docs/screenshots/archive-film.webp)

<details>
<summary>新建胶卷、时间轴与 135 / 120 胶片</summary>

![新建胶卷：日期、地点地图与胶片型号选择](docs/screenshots/new-roll.webp)

![按年份和月份查看拍摄记录](docs/screenshots/timeline.webp)

![135 暗盒与双排齿孔胶片](docs/screenshots/film-135.webp)

![120 卷轴、背纸与宽胶片](docs/screenshots/film-120.webp)

</details>

### 看片、扫描版本与回忆地图

导入前预演分卷、格号、排序与查重。重扫可附加到同一格底片，并切换主扫描版本。看片台支持单张、双图和四图比较，配合评分、色标与淘汰完成选片。

大图的信息栏集中展示照片、胶卷、扫描版本、EXIF、直方图和拍摄位置；地图入口可跳到回忆地图并选中当前卷。接触印样保留为导出功能，从整卷工具栏进入。

![沉浸看片台：大图、照片序列、直方图和拍摄位置](docs/screenshots/lighttable.webp)

<details>
<summary>回忆地图、地图选卷与摄影项目</summary>

回忆地图支持地名搜索、地图选点与胶卷预览。定位前可组合年份、画幅、胶片、地点、器材与标签等条件查找胶卷。

![回忆地图与选中胶卷的照片预览](docs/screenshots/map.webp)

![按组合条件查找需要定位的胶卷](docs/screenshots/map-roll-picker.webp)

项目按章节整理候选与定稿照片，可进入策展画布，也可继续制作画册。

![摄影项目的章节与照片序列](docs/screenshots/projects.webp)

</details>

## 把照片编成一本书

画册工作台按 **选择照片 → 风格与结构 → 全册初稿** 引导建册。选片支持胶卷、相机等筛选、Shift 连选和批量加入；画册规格以比例缩略图展示，可搜索、分类和筛选横竖方向，也可自定义尺寸。

提供 **12 套分类风格**，涵盖摄影作品、旅行纪实、生活纪念与胶片档案，可加入封面、章节、胶卷手记、拍摄地图和底片索引。每册最多 200 页，批量加入匹配照片时单次最多 1,200 张。

![画册工作台：跨页编辑、素材与属性面板](docs/screenshots/photobook.webp)

### 编排时，把空间留给画面

- **四种视图**：整册、跨页、单页、阅读预览；支持缩放，按住空格＋鼠标左键拖动平移工作区。
- **稳定的工具栏**：选中不同元素时顶部工具不增减；裁切、完整显示和照片交换放在属性栏。支持图文、仅图标、仅文字显示。
- **由你控制的面板**：点击画布两侧把手展开或收起素材、属性栏；整册视图同样保留你的选择。
- **准确排版**：页面 / 安全边距 / 元素对齐、等距分布、拖动吸附、可开关的毫米网格和自定义横竖辅助线。
- **照片与装饰**：照片形状蒙版、文字、30 款分类胶片与相机贴图、自定义图片；搜索地点并框选地图范围，直接贴入页面。
- **可回退的操作**：元素右键菜单、锁定、撤销重做、自动保存；替换或更换版式后，移出的内容可从待排区找回。

整册中单击选中页面，双击进入编辑，拖动调整整页顺序，Shift 拖动可移动整章。地图快照随画册保存，编辑辅助线不进入阅读或 PDF。更详细的操作见[画册使用说明](docs/photobook-studio.md)。

<details>
<summary>选片、规格与整册风格</summary>

![按胶卷和相机筛选照片，支持 Shift 连选](docs/screenshots/book-selection.webp)

![带分类与比例缩略图的画册规格](docs/screenshots/book-sizes.webp)

![三步建册中的风格、章节和附录设置](docs/screenshots/book-builder.webp)

![分类风格与应用后的页面预览](docs/screenshots/book-styles.webp)

</details>

<details>
<summary>整册编排、贴图与地图</summary>

![整册视图保留素材栏，并支持整页拖动排序](docs/screenshots/book-overview.webp)

![相机与镜头分类贴图库](docs/screenshots/book-stickers.webp)

![大地图预览与左侧地点设置，可框选范围后贴入画册；图中为离线地理示意图](docs/screenshots/book-map-insert.webp)

![阅读预览：隐藏编辑面板，专注于页面](docs/screenshots/book-reading.webp)

</details>

### 从阅读预览到 PDF

导出前检查缺失原片、分辨率、文字溢出、安全边距、装订和页面待办，可直接定位问题页面。导出过程中显示等待动画与处理进度，生成完成后再保存文件。

| 输出         | 用途                               |
| ------------ | ---------------------------------- |
| 阅读 PDF     | 屏幕阅读，不带出血与裁切标记       |
| 印刷内页 PDF | 按单页输出，含设置的出血和裁切标记 |
| 封面展开 PDF | 封底、书脊与封面合成一页           |

PDF 嵌入内置中文字体，支持照片蒙版、贴图和地图快照。当前输出为 **RGB**，不提供 CMYK / PDF/X 或印厂拼版；制作印刷文件时，请按印厂要求设置尺寸、出血、装订与书脊。

### 画册常用操作

| 操作                | 快捷方式                                                    |
| ------------------- | ----------------------------------------------------------- |
| 平移放大的工作区    | 按住 `空格` ＋ 鼠标左键拖动                                 |
| 缩放                | 缩放滑杆、滚轮或触摸板捏合；整册用 `Ctrl / Command` ＋ 滚轮 |
| 暂时关闭拖动吸附    | 拖动时按住 `Alt`                                            |
| 限制横向或纵向移动  | 拖动时按住 `Shift`                                          |
| 多选元素 / 连续选片 | `Shift` ＋ 点击，分别用于画布 / 选片列表                    |
| 微调元素            | 方向键：1 mm；`Shift`：10 mm；`Alt`：0.1 mm                 |
| 撤销 / 重做         | `Ctrl / Command + Z` / `Shift + Ctrl / Command + Z`         |
| 立即保存            | `Ctrl / Command + S`，普通修改也会自动保存                  |
| 阅读翻页            | 左右方向键                                                  |

## 本地资料库与离线使用

| 运行方式       | 默认资料库目录                                     |
| -------------- | -------------------------------------------------- |
| macOS 桌面版   | `~/Library/Application Support/Film Album/library` |
| Windows 桌面版 | `%APPDATA%/Film Album/library`                     |
| 本地浏览器版   | 项目下的 `data/`，可用 `FILMALBUM_DATA_DIR` 修改   |

桌面版「文件 → 打开资料库」可切换到含 `catalog.sqlite` 的目录。原片可引用外置盘或 NAS，提前生成预览后可离线浏览；画册 PDF、打印和原片导出需要连接原片所在存储。资料库支持断链检查、回收站恢复以及备份创建与验证。

档案、选片与排版在本机运行。在线地图底图、地名搜索和版本检查需要联网；已保存到画册的地图快照可离线查看和导出，离线地理示意图使用随应用提供的 Natural Earth 数据。

<details>
<summary>资料库总览</summary>

![资料库中的档案数量、预览覆盖与存储状态](docs/screenshots/library.webp)

</details>

## 从源码预览

需要 **Node.js 22.13+** 和 npm。macOS 或 Bash 环境中：

```bash
git clone https://github.com/JackerKun/FilmAlbum.git
cd FilmAlbum
./start.sh
```

`start.sh` 检查环境、在依赖缺失时安装依赖，并启动桌面版。也可手动运行：

```bash
npm ci
npm run desktop
```

本地浏览器模式使用 `npm run serve`，访问 `http://127.0.0.1:8091`。macOS 源码模式的原生影像引擎需要 Xcode Command Line Tools。`?debug=1` 提供较小的内置演示库；本文截图使用单独的大型演示库。

## 开发与文档

```bash
npm run check                   # 界面入口与脚本检查
npm test                        # 自动测试
node scripts/screenshots.mjs     # 主界面截图
node scripts/qa-photobook.mjs    # 画册截图、交互及 PDF 导出回归
```

[使用指南](docs/USER_GUIDE.md) · [画册工作台](docs/photobook-studio.md) · [截图与演示数据](docs/screenshots/README.md) · [架构说明](docs/ARCHITECTURE.md) · [构建与发布](BUILDING.md)

当前为预览软件。Windows 影像引擎支持 JPEG、PNG、TIFF、WebP 等扫描件，暂不提供 HEIC / 相机 RAW 解码。默认发行构建尚未配置签名和 Apple 公证。新版画册没有旧画册的专门迁移流程。

项目许可为 `UNLICENSED`；第三方组件按各自许可证分发，见[第三方许可](packaging/THIRD-PARTY.md)。
