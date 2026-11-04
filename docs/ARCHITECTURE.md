# 代码结构与开发约定

```text
FilmAlbum/
├── src/
│   ├── client/        # 工作区、看片、地图、画册、任务与保存交互
│   │   └── legacy/   # 旧界面兼容代码，保留原有迁移与防覆盖检查
│   ├── server/        # HTTP API、SQLite、后台任务、预览、备份与导出
│   └── shared/        # 浏览器与 Node 共用的纯函数、胶片数据、排版计算
├── desktop/           # Electron 主进程、受限 preload、文件保存与目录选择
├── native/            # macOS Swift / ImageIO / Vision 辅助程序源码
├── public/            # Leaflet 等公开静态资源与地图数据
├── assets/            # Logo、平台图标、字体、中英文离线 OCR 模型及许可
├── tests/             # 单元、HTTP、文件保存、离线与发布流程测试
├── scripts/           # 测试入口、语法检查、格式化、构建与 GitHub 发布工具
├── packaging/         # 生产包文件白名单和第三方组件记录
├── docs/              # 使用、架构、开发记录与 Release 模板
├── .github/workflows/ # 四个平台的原生构建与草稿 Release
├── build.sh           # macOS / Git Bash 打包入口
├── build.ps1          # Windows PowerShell 打包入口
└── package.json       # 命令、版本与固定依赖
```

`data/`、`node_modules/`、`.build/`、`dist/` 是本机数据或生成内容，不提交 Git。重构只移动源码；既有资料库位置、SQLite 格式和原片位置不变，不需要搬照片。

## 模块边界

- `src/client/` 通过 HTTP API 读写资料库，不直接访问本机文件系统。
- `src/shared/` 保持纯函数，不依赖 DOM、Node 文件系统或 Electron；服务端与前端可以共同导入。
- `src/server/` 负责目录、影像、预览和后台任务。`static-files.mjs` 明确列出允许公开的前端 / 共享模块，不能通过浏览器读取服务端源码、数据库或私有字体路径。
- `desktop/preload.cjs` 只暴露保存当前资料库文件、显示本次保存文件、选择目录三个方法；不把 Node、通用 IPC 或任意文件读写交给界面。
- `desktop/file-service.mjs` 验证当前本地服务和下载路由，使用系统选择的保存路径，流式写入临时文件后原子替换；失败不覆盖已有文件。
- `native/Native.swift` 只在 macOS 构建 / 源码运行时使用，桌面包内置编译产物。Windows 使用 `src/server/portable-native.mjs`。

浏览器入口仍是 `/`，模块 URL 保持兼容；物理目录整理不要求使用者修改书签。`src/client/legacy/` 仅作兼容，不应继续新增业务功能。

## 常用开发命令

```bash
npm ci
npm run desktop       # Electron 桌面开发
npm run serve         # 本地浏览器模式，默认 127.0.0.1:8091
npm run check         # 递归语法检查和页面 ID 合约
npm test              # 明确收集 tests/test-*.mjs，兼容 Windows 命令行
npm run format        # Prettier 统一排版
npm run format:check  # 检查格式
./build.sh all --plan # 查看构建目标，不下载依赖或执行打包
```

旧兼容代码、第三方库、地图数据、模型和生成目录从格式化范围排除。业务代码新增或调整后，应保持对应测试、公开 URL 清单和打包目录清单一致。

## 验证桌面文件导出

`scripts/smoke-desktop.mjs` 启动打包应用并创建隔离资料库。除了 SQLite 和界面缩略图，它通过实际 renderer → preload → 主进程路径保存中文命名的原片和画册 PDF，校验原片字节与 PDF 文件头。测试使用临时保存目录，不打开用户个人资料库。

GitHub Release 任务要求四个平台的这些检查均通过，才会准备草稿；不使用浏览器下载成功或后端“生成完成”冒充文件已保存。
