// dsh-service-control — Host 半区
// 通过 loopback RPC 提供「关闭服务」与「重启服务」两个操作。
// 关闭：调用 launcher 的 ctx.appExit(0) 优雅退出整个进程树。
// 重启：先启动一个完全脱离宿主管理的独立 pwsh 重启进程（detached + unref，
//       宿主退出不会连带终止它），再调用 ctx.appExit(0) 退出；独立进程
//       等待端口 3080 释放后重新拉起 `dsh web`（node bin.js web）。

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const name = 'dsh-service-control'
const RPC_CHANNEL = '/dsh-service-control'

// dsh web 入口：部署根/node_modules/@deepseek-ai/dsh/lib/bin.js
// （本包通常装在 profile 的 node_modules 下，向上找到部署根不可靠，
//   因此直接使用固定的部署路径；与启动脚本 restart-web.ps1 一致。）
const DSH_WEB = 'D:\\DeepSeek Harness\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'
const DSH_ROOT = 'D:\\DeepSeek Harness'
const PORT = 3080

// 独立重启脚本（PowerShell）。先等宿主优雅退出，再轮询端口释放，最后拉起新实例。
// 通过 -EncodedCommand（UTF-16LE base64）传给 detached 的 pwsh 进程执行。
function restartScript() {
  return `
$ErrorActionPreference = 'Stop'
$port = ${PORT}
$bin = '${DSH_WEB}'
$root = '${DSH_ROOT}'
# 1) 等宿主进程退出（appExit 优雅关闭，最多给它一点时间）
Start-Sleep -Seconds 4
# 2) 轮询端口释放，最多 30 秒
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  $conn = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conn) { break }
  $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 1
# 3) 拉起新的 dsh web（隐藏窗口，输出进日志）
$out = Join-Path $root 'restart-web.log'
$err = Join-Path $root 'restart-web.log.err'
Start-Process -FilePath 'node' -ArgumentList @('"' + $bin + '"','web') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
`
}

function apply(ctx) {
  ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
    if (endpoint === 'service/shutdown') {
      const exit = ctx.get('appExit')
      if (typeof exit !== 'function') {
        return { ok: false, error: { code: 'no-exit', message: 'appExit 服务不可用，无法关闭进程' } }
      }
      exit(0)
      return { ok: true, value: { message: 'DeepSeek Harness 正在关闭' } }
    }
    if (endpoint === 'service/restart') {
      const exit = ctx.get('appExit')
      if (typeof exit !== 'function') {
        return { ok: false, error: { code: 'no-exit', message: 'appExit 服务不可用，无法重启进程' } }
      }
      // 1) 启动脱离宿主管家的独立重启进程（detached + unref）
      try {
        const encoded = Buffer.from(restartScript(), 'utf16le').toString('base64')
        const child = spawn('C:\\Program Files\\PowerShell\\7\\pwsh.exe', [
          '-NoProfile', '-EncodedCommand', encoded
        ], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        })
        child.unref()
      } catch (error) {
        return { ok: false, error: { code: 'spawn-failed', message: error && error.message ? error.message : String(error) } }
      }
      // 2) 宿主优雅退出（重启进程已独立，宿主退出不影响它）
      exit(0)
      return { ok: true, value: { message: '正在重启 DeepSeek Harness…' } }
    }
    return { ok: false, error: { code: 'bad-request', message: 'unknown endpoint ' + JSON.stringify(endpoint) } }
  }, { authority: 'loopback' })
}

const inject = ['connection']

export { apply, inject, name }
export default { apply, inject, name }
