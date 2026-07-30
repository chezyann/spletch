# Spletch! 0.5.1 - EXPERIMENTAL !!!

Spletch! est une application web de tableau blanc collaboratif avec comptes, permissions, chat éphémère, notes de projet structurées, images et import de pages PDF.

`apps/web` et `apps/server` sont l’unique source de vérité déployable. Les anciennes démonstrations HTML restent des maquettes d’interaction et ne doivent pas être publiées comme application.

## Fonctionnalités consolidées

- comptes et sessions révocables ;
- tableaux attachés à leur propriétaire ;
- partage nominatif ou par lien, en lecture ou en écriture ;
- synchronisation Yjs/Hocuspocus et présence temps réel ;
- chat Markdown Discord éphémère, réactions et mentions ;
- notes de projet WYSIWYG ProseMirror/Tiptap persistantes ;
- zones de texte riches collaboratives sur le tableau ;
- formes, flèches, dessins, surligneur, images et pages PDF ;
- sélection multiple, groupes, calques, rotation et redimensionnement ;
- grille synchronisée au zoom et magnétisme activable ;
- interface responsive avec zones de chat et de notes réellement défilables ;
- page de gestion des sessions et suppression du compte ;
- virtualisation du viewport, index spatial et cache progressif des images ;
- mode de performance adaptatif sans niveau de détail dépendant du zoom.

## Socle de sécurité

- sessions opaques dans des cookies `HttpOnly` et `Secure` en production ;
- CSRF signé sur toutes les mutations HTTP ;
- Argon2id, migration des anciens mots de passe scrypt et limitation par IP/compte ;
- tickets WebSocket signés de courte durée, rôles réévalués pendant la connexion ;
- origines HTTP et WebSocket strictement autorisées ;
- quotas sur comptes, tableaux, membres, liens, documents, connexions et assets ;
- Markdown nettoyé, HTML brut interdit, éditeurs à schéma fermé et collage filtré ;
- images réencodées en WebP sans métadonnées ;
- PDF convertis dans le navigateur avec PDF.js, une page à la fois, puis téléversés en WebP ; le PDF original reste sur l’appareil ;
- CSP, HSTS, `Referrer-Policy`, protection d’iframe, contrôle MIME et journal d’audit ;
- sauvegarde SQLite cohérente et purge configurable des données supprimées.

Les détails sont dans [SECURITY.md](SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) et [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Prérequis

- Node.js 22.14 ou plus récent ;
- npm 10 ou plus récent ;

## Développement local

```bash
cp .env.example .env
# Utiliser NODE_ENV=development, COOKIE_SECURE=false et WEB_ORIGINS=http://localhost:5173
npm install
npm run dev
```

- application : `http://localhost:5173` ;
- API : `http://localhost:4000` ;
- WebSocket : `ws://localhost:4001`.

Les données locales sont enregistrées dans `data/spletch.sqlite` et `data/assets/`. Le serveur ne stocke pas les PDF originaux : il reçoit uniquement les pages converties en images par le navigateur.

## Contrôles

```bash
npm run security:check
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Avant une production, générez et commitez obligatoirement `package-lock.json`, puis utilisez :

```bash
npm ci
npm run check
npm run production:gate
```

Le Dockerfile et la CI refusent volontairement un build sans lockfile.

## Déploiement mono-instance

```bash
cp .env.example .env
# Remplacer APP_SECRET, DOMAIN et WEB_ORIGINS
npm install              # produit package-lock.json ; le vérifier et le commiter
npm run check
docker compose up --build -d
```

Caddy termine TLS. Le service applicatif s’exécute sans privilèges avec un volume persistant.

Le profil livré est volontairement **mono-instance**. Redis est disponible sous le profil Compose `scaling`, mais ne doit être activé qu’après migration vers une base relationnelle partagée, un stockage objet partagé, des sessions et un rate limiter distribués.

## Sauvegarde et maintenance

```bash
npm run backup
npm run maintenance:compact
```

Testez régulièrement une restauration. Les audits et tableaux supprimés suivent les durées configurées dans `.env`.

## État de validation de cette livraison

Les fichiers TypeScript/TSX ont passé une vérification de transpilation syntaxique et les contrôles statiques de sécurité. L’environnement de création n’a pas pu résoudre toutes les dépendances npm : le build complet, le typecheck avec dépendances, les tests d’intégration, `npm audit`, le test de charge et le test de pénétration restent des **portes de déploiement obligatoires**. Aucun lockfile approximatif n’a été fabriqué.
