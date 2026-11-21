// Runs the API server (restarts on change) and the Vite dev server together.
import { spawn } from 'node:child_process'

const run = (cmd: string, args: string[]) =>
  spawn(cmd, args, { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0))

run(process.execPath, ['--watch', 'server/index.ts'])
run('npx', ['vite'])
