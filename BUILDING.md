# Film Album 3 · 桌面版打包说明

Logo 已接入应用、Dock、Windows EXE、网页导航与安装包。设计源图在 `assets/logo-source.png`；设计提示词记录在 `assets/LOGO.md`。图标由 `scripts/make-icons.mjs` 生成 PNG / ICNS / ICO。

## 一键打包

构建环境需要 Node.js 22.13+（建议 Node 24 LTS）和 npm。macOS 额外需要 Xcode Command Line Tools：`xcode-select --install`。首次构建需要联网下载 Electron 与 npm 依赖；字体和中英文 OCR 模型已随源码提供，并校验 SHA-256。

在项目根目录执行：

```bash
chmod +x build.sh
./build.sh all
```

在 macOS 上，这会生成下面四组包：

| 系统        | 架构                  | 产物             |
| ----------- | --------------------- | ---------------- |
| macOS 13+   | Apple Silicon / arm64 | DMG、ZIP         |
| macOS 13+   | Intel / x64           | DMG、ZIP         |
| Windows 10+ | Intel / AMD x64       | 可解压运行的 ZIP |
| Windows 11  | ARM64                 | 可解压运行的 ZIP |

产物目录为 `dist/3.0.1/<mac或win>-<arm64或x64>/`，同时写入 `SHA256SUMS` 与 `build-manifest.json`。Windows ZIP 需完整解压，运行其中的 `Film Album.exe`；不要单独拷贝 EXE。

构建 Windows 安装向导 `.exe` 时，在 Windows 本机或 Windows CI 上运行：

```powershell
./build.ps1 win --arch x64
# Windows ARM 机器：
./build.ps1 win --arch arm64
```

也支持 Windows Git Bash 的 `./build.sh win --arch x64`。在 Windows 上会同时生成 NSIS 安装程序和 ZIP。macOS DMG / 签名必须使用 macOS 主机；本脚本不承诺 Windows 主机直接生成 macOS 应用。跨系统构建规则见 [electron-builder 官方说明](https://www.electron.build/docs/features/multi-platform-build/)。

## 常用参数

```bash
./build.sh mac --arch host       # 当前 Mac 架构
./build.sh win --arch x64        # Windows x64 ZIP；Windows 主机同时生成安装程序
./build.sh all --plan            # 查看目标组合
./build.sh mac --arch arm64 --dir # 只生成展开的 .app
./build.sh all --skip-tests      # 仅在已经验证过源码后跳过测试
./build.sh mac --arch arm64 --signed # 使用你配置的正式证书
```

默认先执行 UI 合约检查和完整自动测试，再打包。`scripts/smoke-desktop.mjs` 可在对应系统和架构上验证打包产物：启动应用、读取 SQLite、等待界面缩略图、通过 preload 保存原片与真实画册 PDF、保存截图并退出。该检查使用临时资料库，不会读取个人照片。

`.github/workflows/desktop-build.yml` 提供四个原生系统 / 架构的 CI 任务：macos-15 / arm64、macos-15-intel / x64、windows-2025 / x64、windows-11-arm / arm64。手动运行可选择系统与架构；推送与 package.json 一致的 `v<版本>` 标签时构建全部目标。

每组先检查与测试，再打包并启动真实应用，验证 SQLite 和界面缩略图。附件仅收集构建清单声明的安装包，不包含展开目录中的 EXE。每个安装包重新校验 SHA-256，并附上构建和启动记录；启动失败时保留诊断，但整组任务仍为失败。

标签构建全部通过后，用 GITHUB_TOKEN 自动生成**草稿 Release**并上传安装包、ZIP、构建 / 启动记录及合并后的 SHA256SUMS。它不会自动公开发布；维护者检查后手动点击 Publish release。已公开的同标签 Release 不会被脚本覆盖。

## 开发与使用

```bash
npm ci
npm run desktop
# 也可继续使用浏览器版：
npm run serve
```

桌面程序自带 Electron / Node，无需用户安装 Node 或 Swift。macOS 原生影像辅助程序已在构建时编译。后台服务绑定随机本机端口，独立于网页开发用的 8091，并通过每次启动生成的会话令牌访问。

默认资料库：

- macOS：`~/Library/Application Support/Film Album/library`
- Windows：`%APPDATA%/Film Album/library`

通过“文件 / File → 打开资料库”选择旧资料库根目录（含 `catalog.sqlite` 的目录）；原浏览器版通常是项目下的 `data`。桌面版不会自动合并或复制旧库。日志在相应应用数据目录的 `logs/desktop.log`。

## 平台能力与发行状态

两个系统共用档案、筛选、地图、胶片抽拉、画册编辑等界面。macOS 使用 ImageIO / Vision；Windows 使用 Sharp、EXIF、二维码、中文 / 英文离线 OCR 与 PDF 引擎。Windows 支持 JPEG、PNG、TIFF、WebP 等；当前不提供 HEIC / 相机 RAW 解码和 Vision 物体分类。建议导入 TIFF / JPEG 扫描稿，已有 OCR 和主色信息仍可检索。

PDF 支持中英文、毫米尺寸、出血、裁切标记与图片裁切 / 旋转；输出为 RGB，并非 CMYK / PDF-X 印前认证文件。

默认构建未配置公开发行证书：Mac 使用临时签名，未公证；Windows 未 Authenticode 签名。系统首次打开可能提示无法验证开发者。正式分发需配置自己的 Apple Developer ID / Windows 签名证书，然后使用 `--signed`；Mac 公证还需要 electron-builder 所需的 Apple 账号或 API 凭据。参见 [官方签名说明](https://www.electron.build/v26/docs/features/code-signing/)。不要将证书或密码写入仓库。

第三方许可记录见 `packaging/THIRD-PARTY.md`，字体和 OCR 模型许可随 `assets/` 提供。

## 首次提交到 GitHub

目标仓库：https://github.com/JackerKun/FilmAlbum 。项目已包含 `.gitignore`，默认排除 `data/`、依赖、构建目录、日志和本地证书。它不会自动移除 Git 已经跟踪的文件；提交前检查 `git status` 与暂存差异，确认没有个人照片和资料库。

在本地项目根目录执行（已有 origin 时不重复添加）：

```bash
git remote -v
# 仅在没有 origin 时添加：
git remote add origin https://github.com/JackerKun/FilmAlbum.git
git add .
git diff --cached --stat
git commit -m "Prepare Film Album desktop builds and documentation"
git push -u origin HEAD
```

保留原有 master / main 分支名称即可；不要为了提交覆盖远程历史。如果远程仓库已有 README 或其他提交，先获取并核对历史，再合并处理。

工作流文件需要出现在仓库默认分支上，Actions 页面才会显示手动 Run workflow 按钮。第一次可以只运行 `mac / arm64`，确认后再运行 `all / all`。查看该次任务中的 Artifacts；附件保留 30 天。

## 发布一个版本

1. 修改 package.json 的 version，并同步 package-lock.json（可运行 `npm install --package-lock-only`）。提交并推送源码。
2. 为该提交打与版本一致的标签，例如 `git tag v3.0.1`，然后 `git push origin v3.0.1`。标签不匹配会在构建开始前被拒绝。
3. 等待四个平台构建、测试与真实应用启动检查全部通过。不同平台可能排队；额度和 runner 可用性以 GitHub 账户为准。
4. 打开仓库 Releases 中的草稿，核对八个包（两种 Mac 的 DMG / ZIP，加两种 Windows 的 setup EXE / ZIP）、SHA256SUMS、四组构建与启动记录，完成说明后再 Publish release。
5. 已发布版本不可通过此工作流覆盖；修复请增加版本并使用新标签。草稿阶段重跑会替换同名附件。

手动 workflow_dispatch 运行不创建 Release。未通过或被取消的构建不会准备 Release。默认依赖仅 GITHUB_TOKEN；如果仓库 / 组织策略禁止 contents: write，Release 上传会明确报错，需要仓库维护者调整对应 Actions 权限。

## 排查 Actions

- **看不到 Run workflow**：检查工作流是否已推送到默认分支，以及仓库是否启用了 Actions。
- **版本标签失败**：tag 必须等于 `v` 加 package.json 的 version，不是随意命名的 v 标签。
- **缺少资源**：提交完整 assets/、scripts/、packaging/ 和 package-lock.json；不要只上传 build.sh。
- **测试 / 启动失败**：查看失败步骤及可用附件中的 smoke-report、截图和日志；不跳过失败来冒充已验证版本。
- **只有 Actions 附件、没有 Release**：手动运行属于正常情况；标签构建需全部四组通过才准备草稿，草稿不会出现在公共下载列表中。

参考：[GitHub runner 系统 / 架构](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[手动运行工作流](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[Release API 与草稿](https://docs.github.com/en/rest/releases/releases)。

## 3.0.1 源码目录调整

服务入口移到 `src/server/server.mjs`，前端 / 共享模块分别在 `src/client/`、`src/shared/`；测试在 `tests/`，Swift 在 `native/Native.swift`。`npm run serve`、`npm run desktop`、`npm test` 和 `build.sh` 入口保持不变。不要继续用旧的 `node server.mjs` 路径。

资料库仍位于原来的 data/ 或系统应用数据目录，整理不会搬动 / 重导入照片。架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
