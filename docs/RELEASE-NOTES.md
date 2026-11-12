## Film Album 3.1.0

- **浏览与归档**。顶部增加前进和后退，返回时恢复筛选、视图与滚动位置。全部胶卷新增默认展开的胶片条视图，档案视图按 50 卷分批加载。
- **看片与地图**。切换照片时等待下一张载入，再柔和切换。信息栏集中显示照片、胶卷、扫描版本、EXIF 和直方图。带坐标的照片可跳转回忆地图并选中当前卷。
- **录入与选片**。新建胶卷可在地图上设置地点。批量编辑按字段提供选择、文字录入、日期控件或地图。导入支持核对格号和重复文件，整卷和项目保留接触印样导出。
- **更新与预览**。桌面版在后台检查 GitHub 正式版本，帮助菜单提供手动检查和发布页入口。源码可通过 `./start.sh` 启动，README 更新了 12 张来自独立演示库的截图。

### What's new

- **Archive navigation**. Back and Forward restore the previous view, filters and scroll position. The archive adds expanded film strips and loads rolls in batches of 50.
- **Review and map**. Photo review waits for the incoming image and fades it in. The information panel brings together photo, roll and scan details, EXIF and the histogram. A map link opens the current roll when coordinates are available.
- **Entry and selection**. Set the shooting location on a map when creating a roll. Batch editing provides controls suited to each field. Check frame numbers and duplicate files during import, then export contact sheets for rolls or projects.
- **Updates and preview**. The desktop app checks for stable releases in the background, and the Help menu offers a manual check and a link to releases. Use `./start.sh` to preview from source. The README includes 12 new screenshots from an isolated demo library.

### 安装包 / Packages

- macOS 13+，Apple Silicon 与 Intel，DMG 和 ZIP。
- Windows x64 与 ARM64，安装 EXE 和 ZIP。使用 ZIP 时，请完整解压后运行 `Film Album.exe`。
- 使用 `SHA256SUMS` 核对安装包。默认发行包使用 macOS 临时签名，Apple 公证和 Windows Authenticode 签名尚未配置。
- macOS 13+ packages include DMG and ZIP for Apple Silicon and Intel.
- Windows packages include setup EXE and ZIP for x64 and ARM64. Extract the full ZIP before launching `Film Album.exe`.
- Verify packages with `SHA256SUMS`. macOS packages use ad-hoc signing. Apple notarization and Windows Authenticode signing are pending.
