# README screenshots

These images show the real Film Album 3.0.1 UI with the application's `seedDemo` fixtures: eight rolls, 98 visible synthetic photographs, multiple scans, projects, coordinates, a sample photobook and disconnected-storage cases. No personal library or photographs are used. The screenshots use Simplified Chinese; both READMEs share these assets.

这些截图来自程序内置的合成演示资料库，不含个人照片。保留实际界面与地图署名，不额外绘制控件或替换界面内容。图像采用 WebP，按工作区设置窗口高度以减少空白。

| File                   | View                                                     |
| ---------------------- | -------------------------------------------------------- |
| `archive.webp`         | Roll cards and metadata inspector                        |
| `film-135.webp`        | Fully extended 135 cassette / perforated film            |
| `film-120.webp`        | 120 backing paper / unperforated film / take-up spool    |
| `timeline.webp`        | Chronological year / month archive                       |
| `lighttable.webp`      | Photo review, result thumbnails, EXIF and histogram      |
| `projects.webp`        | Project photo sequence, chapters and selection stages    |
| `map.webp`             | China map and Shanghai roll photo preview                |
| `map-roll-picker.webp` | Placement picker with advanced search filters            |
| `photobook.webp`       | Demo book, selected photo frame and editing controls     |
| `library.webp`         | Library statistics, offline previews and storage volumes |

## Refresh the screenshots

Use Node.js 22.13+ (24 LTS recommended), the locked project dependencies and Google Chrome. The script uses the portable image engine, so screenshot generation does not require Xcode.

```bash
npm ci
node scripts/screenshots.mjs
```

The script finds Chrome at its normal macOS / Windows install path, or `/usr/bin/google-chrome` on Linux. To use another Chrome / Chromium executable:

```bash
FILMALBUM_SCREENSHOT_BROWSER="/absolute/path/to/chromium" node scripts/screenshots.mjs
```

For an alternate output directory:

```bash
FILMALBUM_SCREENSHOT_DIR="/absolute/path/to/screenshots" node scripts/screenshots.mjs
```

A fresh temporary library and browser profile are created for each capture and removed afterward. The script never opens the normal `data/` or desktop library. Chrome is started with a separate temporary profile and an automatically allocated debug port. Only local application pages are automated; the map uses the application's configured map tiles and retains their attribution. Network access is needed for the map background.

`capture-report.json` records the application version, image sizes, dimensions and synthetic source. The script checks the demo label and expected UI states; it fails on uncaught renderer exceptions. Review all screenshots visually before committing. In particular, check loaded images, visible map attribution, frame selection / resize handles, filter labels and the absence of personal data. The capture is documentation evidence, not a complete application acceptance test.

Review changes to both `README.md` and `README.en.md` when adding or renaming an image. This documentation workflow is separate from installer builds and does not create a new release.
