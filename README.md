# 墨阅 MoRead

轻巧、离线、安全的 Markdown 阅读与编辑器，支持 macOS（Apple 芯片）与 Windows（64 位），界面提供 5 种语言。

A light, offline and safe Markdown reader and editor for macOS (Apple silicon) and Windows (64-bit), with an interface in 5 languages. [English below](#english).

## 特点

- **完全离线**：不联网、不上传、无统计；公式、图表、代码高亮全部内置。
- **安全阅读**：阅读区运行在隔离沙箱中，文档脚本不会执行，远程资源默认不加载，相对链接不能越出已打开的文件夹。
- **文件保真**：保留原编码（UTF-8 / BOM / UTF-16）与换行符；原子保存；文件被其他程序修改时自动载入或阻止覆盖。
- **阅读 / 源码 / 分栏** 三种视图，分栏按标题同步滚动；大纲导航、文件夹浏览、查找替换、专注模式。
- **Markdown 编辑辅助**：列表续写、Tab 嵌套、加粗 / 斜体 / 代码 / 链接快捷键。
- **丰富语法**：GFM 表格与任务列表、脚注、提示块、KaTeX 公式、Mermaid 图表、安全 HTML。
- **导出**：单文件离线 HTML，或打印 / 存为 PDF。
- **主题与语言**：跟随系统 / 浅色 / 纸色 / 深色；简体中文、繁體中文、English、日本語、한국어。
- **小巧**：macOS 安装包约 10 MB，Windows 单文件约 17 MB，无内置浏览器内核。

## 下载与安装

见发布包中的《使用手册》第 1 节（[docs/使用手册.md](docs/使用手册.md)）。系统要求：macOS 12 及以上（Apple 芯片）；Windows 10 / 11 64 位，需 Microsoft Edge WebView2 运行时。

## 文档

- [使用手册](docs/使用手册.md) · [User Guide](docs/User-Guide.md)
- [版本说明](docs/版本说明.md)
- [隐私说明](docs/隐私说明.md)

## 从源码构建

需要 Go 1.26.10+、Node.js 22.12+、Wails CLI 2.17.0；macOS 构建另需 Xcode 26+（编译系统图标）。依赖版本由 `go.mod`、`frontend/package-lock.json` 锁定。

```sh
cd frontend && npm ci && cd ..
scripts/release.sh            # 测试 → 构建 → 打包，输出到 dist/MoRead-<版本>
```

`scripts/release.sh` 依次运行前端与 Go 测试（含 race）、构建 macOS / Windows 版本并写入提交号与构建时间、编译 macOS 图标、校验签名、生成 DMG / ZIP / EXE 与 SHA256SUMS，并检查每个文件不超过 30,000,000 字节。工作区未提交时脚本会拒绝构建（本地试构建可设 `ALLOW_DIRTY=1`）。

正式签名为可选项，设置环境变量后自动启用：`MACOS_SIGN_IDENTITY`（Developer ID Application 证书名）用于 macOS 签名并开启加固运行时，再设 `NOTARY_PROFILE`（`xcrun notarytool store-credentials` 保存的钥匙串配置名）即对应用与 DMG 公证并装订；`WINDOWS_SIGN_COMMAND` 为对 exe 原地签名的命令，脚本以文件路径为唯一参数调用。未设置时 macOS 使用临时签名，Windows 不签名。

图标由 `scripts/make_icons.py` 绘制并生成；第三方声明由 `scripts/notices.py` 生成。界面文字位于 `frontend/src/locales/*.json`，前端与原生菜单共用，新增文字须同时补齐全部语言（测试会校验）。

## 许可

源代码按 [MIT 许可](LICENSE) 开放，© 2026 阿屠宰。「墨阅」「MoRead」名称与应用图标不在 MIT 许可范围内，发布修改版请改名换图标，见 [TRADEMARKS.md](TRADEMARKS.md)。第三方组件各按原许可使用，见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。

## 参与

欢迎提交问题、翻译校对与改进，见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。

---

<a id="english"></a>

## English

**Highlights**

- **Fully offline**: no network, no uploads, no analytics; math, diagrams and code highlighting are built in.
- **Safe reading**: the reading pane is sandboxed, document scripts never run, remote resources are not loaded, and relative links cannot leave the folder you opened.
- **Faithful files**: original encoding (UTF-8 / BOM / UTF-16) and line endings are kept; saves are atomic; changes made by other programs are reloaded or protected from being overwritten.
- **Read, Source and Split** views with heading-aligned scrolling; outline, folder browsing, find and replace, focus mode.
- **Editing aids**: list continuation, Tab nesting, shortcuts for bold, italic, code and links.
- **Rich syntax**: GFM tables and task lists, footnotes, alerts, KaTeX math, Mermaid diagrams, safe HTML.
- **Export** to a single offline HTML file, or print / save as PDF.
- **Themes and languages**: System, Light, Paper, Dark; 10 interface languages.
- **Small**: about 10 MB on macOS and a 17 MB single file on Windows, with no bundled browser engine.

**Install**: see section 1 of the [User Guide](docs/User-Guide.md). Requires macOS 12+ on Apple silicon, or 64-bit Windows 10 / 11 with Microsoft Edge WebView2 Runtime.

**Documents**: [User Guide](docs/User-Guide.md) · [Release notes](docs/版本说明.md) · [Privacy](docs/隐私说明.md)

**Build**: Go 1.26.10+, Node.js 22.12+, Wails CLI 2.17.0 and, on macOS, Xcode 26+. Run `cd frontend && npm ci`, then `scripts/release.sh`, which tests, builds, stamps the commit and build time, compiles the macOS icon, verifies signatures and writes DMG / ZIP / EXE packages with SHA256SUMS. Signing is optional: set `MACOS_SIGN_IDENTITY` (Developer ID Application) to sign with the hardened runtime, add `NOTARY_PROFILE` (a `notarytool` keychain profile) to notarize and staple the app and DMG, and set `WINDOWS_SIGN_COMMAND` to a command that signs the exe in place. Without them the macOS app is ad-hoc signed and the Windows exe is unsigned.

**License**: source code under the [MIT License](LICENSE), © 2026 阿屠宰. The names "墨阅" / "MoRead" and the app icon are not covered; forks must use their own name and icon ([TRADEMARKS.md](TRADEMARKS.md)). Third-party components keep their own licenses ([THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)).

**Contributing**: see [CONTRIBUTING.md](CONTRIBUTING.md); report security issues privately as described in [SECURITY.md](SECURITY.md).
