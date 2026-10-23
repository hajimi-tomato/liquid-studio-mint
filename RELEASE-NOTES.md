# 涂抹 · v2026.10.23.1

当前正式工作台入口：`index.html` 或 `studio-20261023-1.html`。

- 手机竖屏保留画布，参数区独立滚动；短横屏采用紧凑布局。
- 移动端复用真实撤销 / 重做控件，优化主要触控范围和数值输入。
- 双指缩放取消本次未完成触笔，避免误画笔点与残留历史。
- 保留桌面分层涂抹、玻璃、调色、多图、存档与图片 / 动画导出能力。

手机兼容性目前通过 Chromium 触摸模拟验证，iPhone Safari、微信内置浏览器和低端设备仍需真机测试。

[完整更新日志](https://github.com/hajimi-tomato/liquid-studio-mint/blob/main/CHANGELOG.md) · [使用指南](https://github.com/hajimi-tomato/liquid-studio-mint/blob/main/docs/USER_GUIDE.md)
