# dsh-service-control

在 DeepSeek Harness（DSH）Web **会话头部右侧工具区**（导出会话/修复会话按钮旁）提供 **「重启服务」** 与 **「关闭服务」** 两个按钮，让你不用回到终端窗口，就能在 UI 里直接重启或关闭整个 `dsh web` 进程。

- **重启服务**（⟳）：优雅关闭当前进程 → 自动重新拉起 `dsh web`，前端 WebSocket 自动重连，页面无需手动刷新。
- **关闭服务**（⏻）：优雅关闭整个 `dsh web` 进程，前端页面随后自动关闭（被浏览器拦截时回退到空白页，手动关标签即可）。

## 功能

- **两段式确认**：点击一次按钮变红显示「确认？」，5 秒内再点一次才真正执行，防止误触。
- **优雅退出**：通过 DSH launcher 的 `ctx.appExit(0)` 退出入口，先 dispose 整个应用树（保存会话、关闭 WebSocket 等），等价于在启动窗口按 Ctrl+C，不会强杀丢数据。
- **自动重启（适配新启动器）**：重启走 `restart-web.ps1` → 一次性计划任务 → `restart-helper.ps1` → 启动器 `-ControlledRestart`。计划任务独立于后端进程树，杀后端不影响它；`-ControlledRestart` 复用「先启动后诊断」路径，不弹菜单、不开浏览器，只以退出码和日志报告。日志写入 `restart-web.log(.err)`。
- **重启后保留**：作为 profile 本地插件（junction 到 profile 的 node_modules 并在 `cordis.patch.yml` 登记），进程重启后按钮依然存在——这是它与动态插件形态的根本区别。

## 安装

1. 将本包放入工作区，例如 `插件开发/dsh-service-control`。
2. 在 profile 的 node_modules 里建 junction：

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-service-control" `
     -Target "D:\ds harness默认工作区\插件开发\dsh-service-control"
   ```

3. 在 `cordis.patch.yml` 末尾追加：

   ```yaml
   - insert:
       - id: dsh-service-control
         name: 'dsh-service-control'
   ```

4. 重启 `dsh web` 生效。

> 路径硬编码：Host 半区里的 `D:\DeepSeek Harness` 与 `3080` 是当前部署事实，如需移植到其他部署请同步修改 `lib/index.js` 顶部的 `DSH_WEB` / `DSH_ROOT` / `PORT`。

## 原理

- Host 半区通过 `ctx.connection.rpc.handle(RPC_CHANNEL, handler, { authority: 'loopback' })` 暴露两个 endpoint：`service/restart`、`service/shutdown`。
- 关闭：`ctx.get('appExit')(0)` 优雅退出整个进程。
- 重启：`spawn` detached 的 `pwsh` 运行 `restart-web.ps1`（注册一次性计划任务），再 `appExit(0)` 退出宿主；计划任务独立运行 `restart-helper.ps1` → 启动器 `-ControlledRestart`。

## 许可证

MIT
