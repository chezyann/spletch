import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const packages = ['package.json', 'apps/server/package.json', 'apps/web/package.json']
const errors = []
for (const filename of packages) {
  const full = path.join(root, filename)
  const data = JSON.parse(fs.readFileSync(full, 'utf8'))
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(data[section] ?? {})) {
      if (/^(latest|next|\^|~|\*|workspace:\*)/.test(String(version))) errors.push(`${filename}: ${name} n’est pas figé (${version})`)
    }
  }
}

const requiredFiles = ['Dockerfile', 'deploy/Caddyfile', '.dockerignore', 'SECURITY.md', 'docs/THREAT_MODEL.md']
for (const filename of requiredFiles) if (!fs.existsSync(path.join(root, filename))) errors.push(`${filename} est absent`)
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
if (!dockerfile.includes('npm ci')) errors.push('Dockerfile doit utiliser npm ci')
if (!dockerfile.includes('package-lock.json obligatoire')) errors.push('Dockerfile doit bloquer un build sans lockfile')
const caddy = fs.readFileSync(path.join(root, 'deploy/Caddyfile'), 'utf8')
if (!caddy.includes('reverse_proxy /api/* app:4000')) errors.push('Le proxy API Caddy ne cible pas le service app')

const forbidden = [
  { directory: 'apps/web/src', pattern: /localStorage\.(getItem|setItem).*session|spletch\.session/g, message: 'jeton de session dans localStorage' },
  { directory: 'apps/web/src', pattern: /dangerouslySetInnerHTML/g, message: 'HTML injecté sans composant centralisé', allowed: ['apps/web/src/security/MarkdownContent.tsx'] },
  { directory: 'apps/web/src', pattern: /execCommand|insertAdjacentHTML|document\.write|new Function|\beval\s*\(/g, message: 'API DOM ou exécution dynamique interdite' },
]
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
}
for (const rule of forbidden) {
  for (const file of walk(path.join(root, rule.directory)).filter(file => /\.(ts|tsx|js|jsx)$/.test(file))) {
    const relativeFile = path.relative(root, file).replaceAll('\\', '/')
    const source = fs.readFileSync(file, 'utf8')
    if (rule.pattern.test(source) && !(rule.allowed ?? []).includes(relativeFile)) errors.push(`${relativeFile}: ${rule.message}`)
    rule.pattern.lastIndex = 0
  }
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('Contrôles statiques de sécurité réussis.')
