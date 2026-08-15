// dsh-service-control — Client 半区
// 在侧边栏底部（设置齿轮旁）注册「重启服务」「关闭服务」两个按钮。
// 每个按钮采用两段式确认（点击一次变红「确认？」，5 秒内再点一次执行），
// 通过 loopback RPC 调用 Host 半区完成重启/关闭。
window.__ModuleLoader__.load({
  id: 'dsh-service-control',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    const RPC_CHANNEL = '/dsh-service-control'
    const inject = ['slots', 'connection']

    const btnCss = '.dsc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#999);cursor:pointer;font-size:13px;line-height:1;padding:0 8px;white-space:nowrap;flex:none;box-sizing:border-box;transition:background .15s,color .15s,border-color .15s}.dsc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,#eee)}.dsc-btn.dsc-confirm{color:#e5534b;border-color:rgba(229,83,75,.55);background:rgba(229,83,75,.12)}.dsc-btn.dsc-busy{opacity:.65;cursor:default}'

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
        const { id, order, label, title, icon, endpoint } = props
        const [phase, setPhase] = React.useState('idle')
        const wide = props.wide === true

        const exec = () => {
          setPhase('busy')
          rpc.call(RPC_CHANNEL, endpoint, {}).then(() => {
            // 进程即将退出/重启，无需额外处理；RPC 可能因断连而 reject，忽略。
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
        const cls = 'dsc-btn' + (phase === 'confirm' ? ' dsc-confirm' : '') + (phase === 'busy' ? ' dsc-busy' : '')
        return React.createElement('button', {
          type: 'button',
          className: cls,
          onClick,
          title,
          disabled: phase === 'busy',
          style: { order }
        }, wide ? React.createElement('span', null, text) : React.createElement('span', null, icon))
      }

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-service-control',
        order: 20,
        label: '服务控制'
      }, (props) => React.createElement('div', { style: { display: 'contents' } },
        React.createElement(ActionButton, Object.assign({}, props, {
          id: 'restart', order: 20, label: '重启服务', title: '重启 DeepSeek Harness 服务', icon: '⟳', endpoint: 'service/restart'
        })),
        React.createElement(ActionButton, Object.assign({}, props, {
          id: 'shutdown', order: 30, label: '关闭服务', title: '关闭 DeepSeek Harness 服务并关闭此页面', icon: '⏻', endpoint: 'service/shutdown'
        }))
      )))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
