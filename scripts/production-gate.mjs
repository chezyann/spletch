import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const failures = []
const warnings = []
const lock = path.join(root, 'package-lock.json')
if (!fs.existsSync(lock)) failures.push('package-lock.json absent : générez-le avec npm install dans un environnement connecté, vérifiez-le puis commitez-le.')

const secret = process.env.APP_SECRET ?? ''
if (secret.length < 32 || /changez|development-only|example/i.test(secret)) failures.push('APP_SECRET doit être une valeur aléatoire d’au moins 32 caractères.')
const origins = (process.env.WEB_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)
if (!origins.length || origins.some(origin => !origin.startsWith('https://'))) failures.push('WEB_ORIGINS doit contenir uniquement les origines HTTPS autorisées.')
if (process.env.COOKIE_SECURE !== 'true') failures.push('COOKIE_SECURE=true est obligatoire en production.')
if (process.env.NODE_ENV !== 'production') failures.push('NODE_ENV=production est obligatoire.')
if (process.env.TRUST_PROXY !== 'true') warnings.push('TRUST_PROXY devrait être true derrière Caddy ou un autre proxy de confiance.')
if (process.env.REDIS_HOST) warnings.push('Redis est activé : vérifiez que la base relationnelle, les sessions, le rate limiting et les assets utilisent eux aussi un stockage partagé avant plusieurs réplicas.')


for (const warning of warnings) console.warn(`AVERTISSEMENT: ${warning}`)
if (failures.length) {
  for (const failure of failures) console.error(`BLOQUANT: ${failure}`)
  process.exit(1)
}
console.log('Contrôles de préparation à la production réussis.')
