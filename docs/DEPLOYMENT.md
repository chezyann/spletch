# Déploiement

## Préparation obligatoire

1. Installez Node.js 22 et npm 10 ou plus récents.
2. Copiez `.env.example` vers `.env`.
3. Générez `APP_SECRET` avec au moins 32 octets aléatoires.
4. Configurez un nom de domaine HTTPS dans `DOMAIN` et `WEB_ORIGINS`.
5. Exécutez `npm install` dans un environnement ayant accès au registre npm, puis **commitez le `package-lock.json` généré**.
6. Exécutez `npm run check` et `npm audit --omit=dev --audit-level=high`.

Le dépôt livré contient des versions directes figées, mais le lockfile transitif doit être produit et vérifié avant toute image de production.

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

Caddy termine TLS et l’application tourne sans privilèges. La conversion PDF est exécutée dans le navigateur ; le volume `spletch_data` contient la base et les images téléversées.

## Sauvegardes

```bash
npm run backup
```

Conservez les sauvegardes chiffrées hors de la machine, testez régulièrement une restauration et définissez une durée de rétention.

## Montée en charge

Le mode multi-instance exige :

- Redis activé pour la propagation Hocuspocus ;
- une base relationnelle partagée à la place de SQLite ;
- un stockage objet partagé pour les assets ;
- un rate limiter distribué ;
- une stratégie de sessions partagée.

Tant que ces adaptateurs ne sont pas branchés, gardez `app` à un seul réplica.
