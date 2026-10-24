# 部署说明

[返回项目首页](../README.md)

## 静态部署要求

部署 `dist/` 内的文件即可，无需构建、Node.js 生产服务器或图片处理 API。使用支持 HTTPS、正确 MIME 类型和相对路径的静态托管。

部署内容包括 JavaScript 模块、CSS、`assets/`、`vendor/` 和 GIF Worker。不要只上传 HTML，也不要把 `node_modules/`、测试产物或本地浏览器配置目录上传。

建议 HTML 使用可重新验证的缓存；带版本查询参数的脚本与样式仍需结合托管方的缓存键规则配置。更新时保持入口与引用的文件同步发布，避免用户得到混合版本。

## 当前 GitHub Pages

- 源码位于 `main`，正式静态网站从 `gh-pages` 分支根目录发布。
- 稳定入口：https://hajimi-tomato.github.io/liquid-studio-mint/
- 当前版本入口：https://hajimi-tomato.github.io/liquid-studio-mint/studio-20261024-1.html
- 版本入口用于确认发布内容，不是冻结的历史快照；旧入口会跳转至当前版本。
- 本仓库的检查工作流只验证代码与文档，不自动发布站点。

`gh-pages` 有独立的发布历史。不能假定 `git subtree push` 总能快进成功；也不要用强制推送来覆盖已有发布文件。

### 使用发布检出目录更新

下例假定开发检出目录名为 `liquid-studio-mint`。先确认源文件、目标分支和本地改动：

```bash
git clone --branch gh-pages --single-branch https://github.com/hajimi-tomato/liquid-studio-mint.git liquid-studio-pages
```

随后运行下面的 Python 命令，将开发目录中的静态文件复制到发布目录。它会覆盖同名文件，**不会清空发布目录或删除已有文件**：

```bash
python -c "from pathlib import Path; import shutil; shutil.copytree(Path('liquid-studio-mint/dist'), Path('liquid-studio-pages'), dirs_exist_ok=True)"
```

在发布检出目录中审查并推送：

```bash
cd liquid-studio-pages
git status --short
git diff --check
git add .
git commit -m "Publish studio update"
git push origin gh-pages
```

复制不会清理过期文件。若某个文件确实应从线上删除，先在明确的发布目录中逐项核实，再提交对应删除。

### 发布后验证

1. 确认 Pages 构建完成，而不只是 Git 推送成功。
2. 打开稳定入口与当前版本入口，核对状态栏版本。
3. 检查脚本、图片和 Worker 没有 404。
4. 实测导入、涂抹、撤销、PNG 导出和动画生成。
5. 检查手机竖屏与横屏；确认旧链接仍可进入新版。

## 国内托管

现有静态结构可以迁移到国内对象存储 / 静态托管与 CDN，不需要改成集中处理图片的后端。观众请求静态文件，编辑运算仍由各自设备承担。

独立域名、HTTPS、缓存、流量监控和备案接入条件，应按照所选托管商的实际要求准备。当前仓库未完成国内生产部署，不包含已购买的域名或云资源配置。

迁移时需要特别处理 **IndexedDB 按来源隔离** 的事实：旧域名的本地作品不会自动出现在新域名上。正式迁移之前应先提供作品迁移方案，保留旧站入口，并明确提醒用户保存重要内容。

## 回滚

发布前保留当前 `gh-pages` 的提交标识。若新版本出现问题，优先在发布分支使用 `git revert` 创建回滚提交，并等待托管平台重新发布。不要通过重写公共分支历史回滚，也不要为了清缓存删除用户数据。
