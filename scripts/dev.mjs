// electron-vite's `dev` / `preview` spawn the Electron binary inheriting this
// process's environment. VS Code's integrated terminal exports
// ELECTRON_RUN_AS_NODE=1 (it is set for the extension host), which makes the
// spawned Electron run as plain Node — the app then crashes on startup with
// "Cannot read properties of undefined (reading 'isPackaged')".
//
// Stripping the variable here makes `npm run dev` work the same from the VS
// Code terminal and from a standalone one. Runs on macOS, Windows and Linux.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE

const bin = fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url))
const mode = process.argv[2] === 'preview' ? 'preview' : 'dev'
const passthrough = process.argv.slice(process.argv[2] === 'preview' ? 3 : 2)

const child = spawn(process.execPath, [bin, mode, ...passthrough], { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
