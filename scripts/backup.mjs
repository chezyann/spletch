import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const data = path.resolve(root, process.env.DATA_DIR ?? 'data')
const backupRoot = path.resolve(root, process.env.BACKUP_DIR ?? 'backups')
const stamp = new Date().toISOString().replaceAll(':', '-')
const version = (process.env.APP_VERSION ?? 'unknown').replaceAll(/[^a-zA-Z0-9._-]/g, '_')
const target = path.join(backupRoot, `${stamp}--v${version}`)

await fs.mkdir(target, { recursive: true })
await new Promise((resolve, reject) => {
  const output = path.join(target, 'spletch.sqlite')
  const child = spawn('sqlite3', [path.join(data, 'spletch.sqlite'), `.backup '${output.replaceAll("'", "''")}'`], { stdio: 'inherit' })
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`sqlite3 a quitté avec le code ${code}`)))
  child.on('error', reject)
})
const includeAssets = (process.env.BACKUP_INCLUDE_ASSETS ?? 'true') === 'true'
if (includeAssets) {
  await fs.cp(path.join(data, 'assets'), path.join(target, 'assets'), { recursive: true, force: true }).catch(error => {
    if (error?.code !== 'ENOENT') throw error
  })
}
await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(),
  applicationVersion: process.env.APP_VERSION ?? null,
  databaseFile: 'spletch.sqlite',
  includesAssets: includeAssets,
}, null, 2) + '\n', { mode: 0o600 })
console.log(`Sauvegarde créée dans ${target}`)
