# 参与贡献 / Contributing

感谢你愿意改进墨阅 MoRead。中文或英文提交 issue 与 PR 均可。Issues and pull requests are welcome in Chinese or English.

## 开发环境 / Setup

- Go 1.25+、Node.js 22.12+、Wails CLI 2.17.0（`go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.0`）
- macOS 构建需 Xcode 26+；Windows 构建需 WebView2 运行时

```sh
cd frontend && npm ci && cd ..
wails dev                     # 本地调试 / live development
cd frontend && npm test       # 前端测试 / frontend tests
go test -race ./...           # Go 测试 / Go tests
scripts/release.sh            # 完整构建与打包（需先提交）/ full build and packaging
```

## 设计不变量 / Design invariants

这些约束是墨阅安全与可靠性的基础，PR 不得破坏：

1. **完全离线**：所有渲染资源随应用打包，不发起任何自动网络请求；远程图片默认不加载。
2. **不执行文档代码**：文档中的脚本与危险 HTML 必须被净化；阅读区保持 opaque-origin 沙箱，父子通道严格校验来源、令牌与版本。
3. **文件边界**：相对链接与图片不得越出用户显式打开的文件夹，不得因相对链接扩大授权目录；符号链接越界拒绝。
4. **保存安全**：保留编辑基线哈希检查与取消语义；临时文件写入并同步后原子替换；保留原编码与换行。
5. **体积**：不打包 node_modules 或浏览器内核；每个发布文件不超过 30,000,000 字节。

These invariants keep MoRead safe and reliable: stay fully offline; never execute document code and keep the reading pane sandboxed; never let relative links widen the opened folder; keep baseline-checked atomic saves that preserve encoding and line endings; never bundle node_modules or a browser runtime.

## 代码风格 / Style

- 前端：`cd frontend && npx prettier --write "src/**/*.{js,css}" "test/**/*.mjs"`
- Go：`gofmt`，`go vet ./...`
- 新功能与修复请附测试；只用虚构的示例文件，不要提交真实文档或个人数据。

## 翻译 / Translations

界面文字全部在 `frontend/src/locales/<语言>.json`，前端与原生菜单共用，以 `en.json` 为基准。修改翻译只需编辑 JSON，无需构建。新增文字时必须给全部 10 种语言补齐同名键（`npm test` 会校验键、占位符与源码引用）。欢迎母语者校对现有译文。

All interface text lives in `frontend/src/locales/<lang>.json`, shared by the web UI and native menus, with `en.json` as the reference. New strings need the same key in every language; `npm test` checks keys and placeholders.

## 名称与图标 / Name and icon

代码按 MIT 许可；名称与图标规则见 [TRADEMARKS.md](TRADEMARKS.md)。发布修改版请换用自己的名称与图标。
