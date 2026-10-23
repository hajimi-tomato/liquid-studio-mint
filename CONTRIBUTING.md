# 贡献指南

感谢帮助改进涂抹。提交修改前，请先了解 [架构](docs/ARCHITECTURE.md) 和 [设计规范](docs/DESIGN.md)。

## 开发环境

- Node.js 22。
- Python 3，用于静态服务与浏览器测试的 webServer。
- 默认浏览器为 Microsoft Edge；也可以使用 Playwright 自带 Chromium。

```bash
npm ci
npm run dev
```

浏览器访问 http://127.0.0.1:8000/。如果系统只提供 `python3`，可直接执行 README 中的静态服务命令，并让测试复用该服务。

## 检查命令

```bash
npm run check:docs
npm test
npm run test:e2e
```

没有 Edge 时，先执行 `npx playwright install chromium`，再设置环境变量：

```bash
# macOS / Linux
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

```powershell
# PowerShell
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm run test:e2e
```

GitHub Actions 使用 Windows 2025 运行器预装的 Microsoft Edge，运行同一组测试。文档检查验证仓库内相对链接、图片引用和静态入口资源，不负责判断所有外部网站是否在线。

## 修改边界

1. 功能代码与可部署静态文件都在 `dist/`，它不是可以随意删除的构建产物。
2. 笔画修改应通过事务完成，不要原地修改已提交的图层数组。
3. 展示代码应读取真实编辑状态；参数示意不能偷偷修改作品。
4. 保留撤销、对比、存档兼容和导出能力。不要为动效复制一套独立的编辑状态。
5. 当前 CSS 和图标有历史覆盖层；修改后检查最终样式，不只检查基础 token。
6. 功能行为变化时同步更新使用指南、截图和更新日志。单纯文档修改不需要更改产品版本。

## 界面验证

至少检查桌面、390×844 竖屏和 844×390 横屏。涉及触控时使用真实触摸事件，而不是只缩小窗口并使用鼠标。

关注参数作用范围、点击后的图标位置、选中与禁用状态、触控区域、数值输入、独立滚动、减少动态效果偏好，以及浏览器控制台错误。真机结果与模拟结果应分别说明。

### 更新截图

先启动本地服务，然后运行：

```bash
npm run docs:screenshots
```

截图脚本使用新建浏览器上下文与内置示例图片，输出 `docs/assets/`。效果图由真实编辑器导出，不使用概念稿代替产品界面。

## 提交与 Pull Request

保持改动聚焦，说明具体问题、修改后的行为和验证结果。涉及 UI 时附上修改前后的截图，并注明是真机还是模拟。请不要在反馈或测试文件中上传私人照片、访问凭证或个人浏览器数据。

站点发布是单独步骤，详见 [部署说明](docs/DEPLOYMENT.md)。合并代码并不代表线上入口已经更新。

## 授权说明

项目尚未指定项目级许可证。提交代码或素材时请说明来源与适用许可，保留第三方许可文件；不要假定所有随附图片与依赖都适用相同授权。
