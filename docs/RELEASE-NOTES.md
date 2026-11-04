Film Album is a local-first film archive and photobook workspace.
Film Album 是本地胶片档案与摄影画册工作台。

## Packages / 安装包

- macOS 13+: Apple Silicon `mac-arm64` / Intel `mac-x64`, DMG and ZIP.
- Windows: Intel / AMD `x64` and ARM64, setup EXE and ZIP.
- Extract the complete Windows ZIP before running `Film Album.exe`.
- `SHA256SUMS` covers the downloadable installers and application archives.

## Preview release / 预览版本

These packages are built on native runners and must pass application startup and thumbnail checks before this draft is prepared. This is not a full manual acceptance test of every feature.
这些包已通过对应原生 runner 的测试、打包和应用启动 / 缩略图检查；不代表全部功能均已完成人工验收。

Packages currently use no distribution certificates: macOS uses ad-hoc signing without notarization; Windows executables have no Authenticode signature. Operating systems may ask you to confirm the developer.
当前未配置发行证书：Mac 使用临时签名且未公证，Windows EXE 未签名，系统可能提示无法验证开发者。

Windows currently has no HEIC / camera RAW decoding or object classification. JPEG / PNG / TIFF previews, local Chinese / English OCR, QR decoding and PDF export are supported.
Windows 暂不支持 HEIC / 相机 RAW 解码与物体分类。支持 JPEG / PNG / TIFF 预览、中英文离线 OCR、二维码与 PDF。

Photobook PDFs use RGB, bleed and crop marks; they are not CMYK / PDF-X certified or imposed print signatures.
画册 PDF 为 RGB，带出血和裁切标记，不是 CMYK / PDF-X 认证或印厂拼版文件。

Existing libraries are not bundled. Back up your own library before upgrading. Use File → Open library to select its folder.
安装包不含个人资料库。升级前请备份原库，通过“文件 → 打开资料库”选择现有目录。

See the repository README and BUILDING.md for usage, storage locations and build instructions.
