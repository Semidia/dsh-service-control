// dsh-service-control — Client 半区
// 在聊天页面顶部（会话头部右侧工具区，导出会话/修复会话按钮旁）注册
// 「重启服务」「关闭服务」两个按钮。每个按钮两段式确认（点击一次变红
// 「确认？」，5 秒内再点一次执行），通过 loopback RPC 调用 Host 半区。
window.__ModuleLoader__.load({
  id: 'dsh-service-control',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    const RPC_CHANNEL = '/dsh-service-control'
    const inject = ['slots', 'connection']

    // 与「导出会话 / 修复会话」同款胶囊按钮样式（同一套 DSW 主题变量）。
    const btnCss =
      '.dsc-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);height:32px;color:var(--dsw-alias-label-primary);background:0 0;border-radius:18px;align-items:center;justify-content:center;gap:4px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex;white-space:nowrap}' +
      '.dsc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-dimmed)}' +
      '.dsc-btn:disabled{opacity:.5;cursor:default}' +
      '.dsc-btn span,.dsc-btn svg{flex:none}' +
      '.dsc-btn.dsc-confirm{color:#e5534b;border-color:rgba(229,83,75,.6);background:rgba(229,83,75,.12)}' +
      '.dsc-btn.dsc-danger{color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-label-error)}'

    function injectCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="dsh-service-control"]')) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-service-control'
      tag.dataset.pluginCss = 'dsh-service-control'
      tag.textContent = btnCss
      document.head.appendChild(tag)
    }

    function apply(ctx) {
      injectCss()
      const rpc = ctx.connection.rpc

      function ActionButton(props) {
        const { label, title, endpoint, danger } = props
        const [phase, setPhase] = React.useState('idle')

        const exec = () => {
          setPhase('busy')
          rpc.call(RPC_CHANNEL, endpoint, {}).then(() => {
            // 进程即将退出/重启，RPC 可能因断连而 reject，忽略。
          }).catch(() => {})
        }

        const onClick = () => {
          if (phase === 'idle') {
            setPhase('confirm')
            setTimeout(() => setPhase((p) => (p === 'confirm' ? 'idle' : p)), 5000)
            return
          }
          if (phase === 'confirm') exec()
        }

        const text = phase === 'idle' ? label : phase === 'confirm' ? '确认？' : '处理中…'
        const cls = 'dsc-btn' +
          (danger ? ' dsc-danger' : '') +
          (phase === 'confirm' ? ' dsc-confirm' : '') +
          (phase === 'busy' ? ' dsc-busy' : '')
        return React.createElement('button', {
          type: 'button',
          className: cls,
          onClick,
          title,
          disabled: phase === 'busy',
        }, React.createElement('span', null, text))
      }

      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'dsh-service-control',
        order: 20,
        label: '服务控制',
        inject: () => ({})
      }, (props) => React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement(ActionButton, {
          label: '重启服务', title: '重启 DeepSeek Harness 服务', endpoint: 'service/restart', danger: false,
        }),
        React.createElement(ActionButton, {
          label: '关闭服务', title: '关闭 DeepSeek Harness 服务并关闭此页面', endpoint: 'service/shutdown', danger: true,
        }),
      )))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
