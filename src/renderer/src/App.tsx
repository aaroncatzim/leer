import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pong, setPong] = useState('')
  const [settingsCount, setSettingsCount] = useState(0)

  useEffect(() => {
    window.api.getAppInfo().then(setInfo).catch((err: unknown) => console.error('getAppInfo', err))
    return window.api.on('ui:open-settings', () => setSettingsCount((n) => n + 1))
  }, [])

  const modKey = info?.platform === 'darwin' ? '⌘' : 'Ctrl'

  async function probeIpc() {
    try {
      const res = await window.api.ping('hola desde el renderer')
      setPong(`${res.pong} · ${new Date(res.at).toLocaleTimeString()}`)
    } catch (err) {
      setPong(`error: ${String(err)}`)
    }
  }

  return (
    <main className="shell">
      <header className="shell__bar">
        <span className="shell__logo" aria-hidden="true">&#9654;</span>
        <h1 className="shell__title">Lector Audio</h1>
        <span className="shell__badge">scaffold</span>
      </header>

      <section className="shell__panel">
        <p className="shell__lead">
          Ventana base del proyecto. La interfaz real &mdash;entrada de texto, lista de
          p&aacute;rrafos y reproductor&mdash; se construye sobre los mockups en las
          siguientes fases del brief.
        </p>

        <dl className="specs">
          <div><dt>App</dt><dd>{info?.appVersion ?? '…'}</dd></div>
          <div><dt>Electron</dt><dd>{info?.electron ?? '…'}</dd></div>
          <div><dt>Node</dt><dd>{info?.node ?? '…'}</dd></div>
          <div><dt>Chromium</dt><dd>{info?.chrome ?? '…'}</dd></div>
          <div><dt>Plataforma</dt><dd>{info?.platform ?? '…'}</dd></div>
        </dl>

        <div className="probe">
          <button type="button" className="probe__btn" onClick={probeIpc}>
            Probar puente IPC
          </button>
          <output className="probe__out">{pong || 'sin respuesta todavía'}</output>
        </div>

        <p className="shell__note">
          Evento <code>ui:open-settings</code> (main &rarr; renderer) recibido{' '}
          <strong>{settingsCount}</strong> vez(ces). Act&iacute;valo con{' '}
          <kbd>{modKey}</kbd> + <kbd>,</kbd> o desde el men&uacute; Herramientas.
        </p>
      </section>
    </main>
  )
}
