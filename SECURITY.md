# 安全策略 / Security policy

墨阅以「离线、不执行文档代码、不越出已打开文件夹」为核心承诺，我们非常重视相关问题。

**请勿在公开 issue 中报告安全问题。** 请通过本仓库 GitHub 页面的 **Security → Report a vulnerability**（私密漏洞报告）提交，附上受影响版本、平台、复现用的最小 Markdown 示例与预期/实际行为。我们会在 7 天内确认收到，并在修复发布后致谢（如你愿意）。

优先处理的问题类型：

- 文档中的脚本或 HTML 在阅读区或宿主页面执行；
- 绕过沙箱、CSP 或宿主/阅读区消息通道校验；
- 文档触发任何自动网络请求；
- 相对链接、图片或符号链接读取已打开文件夹之外的文件；
- 保存导致数据丢失、覆盖其他程序的修改或破坏编码。

只支持最新发布版本的安全修复。

---

MoRead promises to stay offline, never execute document code and never read outside the folder you opened. **Please do not report security issues in public issues.** Use **Security → Report a vulnerability** on this repository with the affected version, platform, a minimal Markdown sample and expected versus actual behaviour. We acknowledge reports within 7 days. Priority: script or HTML execution, sandbox / CSP / message-channel bypass, automatic network requests, file access outside the opened folder, and data loss on save. Only the latest release receives security fixes.
