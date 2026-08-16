// dsh-service-control — Host 半区
// 通过 loopback RPC 提供「关闭服务」与「重启服务」两个操作。
// 关闭：调用 launcher 的 ctx.appExit(0) 优雅退出整个进程树。
// 重启（2026-08-15 v2）：注册一次性计划任务（restart-web.ps1）→ 由任务计划程序
//       运行 restart-helper.ps1 直接拉起 `node bin.js web`，再 ctx.appExit(0) 退出。
//       不能用「后端 spawn 的 detached 进程」重启——它会随宿主进程/Job 一起被终止。
// legacy：restartScript() 保留但已不再使用。

import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const name = 'dsh-service-control'
const RPC_CHANNEL = '/dsh-service-control'

// ── 动态路径解析（避免硬编码，支持环境变量覆盖）──────────────────────────
// DSH_HARNESS_ROOT: harness 部署根（可显式覆盖；默认用进程 cwd——启动器以
//   -WorkingDirectory $root 启动 web，所以运行中的 cwd 就是 harness 根）
// DSH_WEB_PORT: 监听端口（默认 3080，与 DSH_WEB_URL 保持一致）
const HARNESS_ROOT = process.env.DSH_HARNESS_ROOT || process.cwd()
const DSH_ROOT = HARNESS_ROOT
const DSH_WEB = join(DSH_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const PORT = Number(process.env.DSH_WEB_PORT || 3080)
const LOG_FILE = join(DSH_ROOT, 'dsh-service-control.log')
const log = (msg) => {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`) } catch { }
}

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
  log('apply: dsh-service-control v2 loaded (scheduled-task restart)')
  ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
    if (endpoint === 'service/shutdown') {
      const exit = ctx.get('appExit')
      if (typeof exit !== 'function') {
        return { ok: false, error: { code: 'no-exit', message: 'appExit 服务不可用，无法关闭进程' } }
      }
      log('shutdown: requested')
      exit(0)
      return { ok: true, value: { message: 'DeepSeek Harness 正在关闭' } }
    }
    if (endpoint === 'service/restart') {
      const exit = ctx.get('appExit')
      if (typeof exit !== 'function') {
        log('restart: appExit missing')
        return { ok: false, error: { code: 'no-exit', message: 'appExit 服务不可用，无法重启进程' } }
      }
      log('restart: requested, spawning pwsh -> restart-web.ps1')
      // 重启走「一次性计划任务」机制（2026-08-15 v2，已验证可靠）：
      // 由后端 spawn 的进程（即使 detached）会随宿主进程/Job 一起被终止，
      // 导致「杀掉后端但拉不起来」。计划任务独立于后端进程树，杀后端不影响它。
      // restart-web.ps1 只负责注册一次性任务（3 秒后由任务计划程序运行
      // restart-helper.ps1 直接拉起 node web），注册完即退出。
      const helper = spawn('C:\\Program Files\\PowerShell\\7\\pwsh.exe', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-File', join(DSH_ROOT, 'restart-web.ps1')
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      log('restart: spawned pid=' + (helper.pid != null ? helper.pid : '?'))
      helper.on('exit', (code) => log('restart: pwsh exit code=' + code))
      helper.on('error', (e) => log('restart: pwsh spawn error: ' + String((e && e.message) || e)))
      helper.unref()
      // 等任务注册完成（最多 8 秒）再退出，确保任务已写入任务计划程序
      await Promise.race([
        new Promise((r) => helper.on('exit', r)),
        new Promise((r) => setTimeout(r, 8000)),
      ])
      log('restart: proceeding to appExit(0)')
      exit(0)
      return { ok: true, value: { message: '正在重启 DeepSeek Harness…' } }
    }
    return { ok: false, error: { code: 'bad-request', message: 'unknown endpoint ' + JSON.stringify(endpoint) } }
  }, { authority: 'loopback' })
}

const inject = ['connection']

export { apply, inject, name }
export default { apply, inject, name }
