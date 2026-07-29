# Déploiement Synology + Portainer

La méthode recommandée utilise une image Docker préconstruite dans GHCR. Node.js, npm, Sharp et Argon2 ne sont pas installés directement dans DSM et les futures mises à jour se font en redéployant la stack.

## Prérequis

- Synology avec Container Manager/Docker et Portainer ;
- architecture `x86_64` ou `aarch64` ;
- DS423+ recommandé ; avec vos 16 Go de RAM, la stack réserve jusqu’à 4 Go à Spletch! ;
- un domaine/DDNS pour l'accès HTTPS public ;
- une image publiée dans un registre, voir [PUBLISH_GHCR.md](PUBLISH_GHCR.md).

## 1. Copier uniquement les fichiers de déploiement

Placer le dossier du projet dans :

```text
/volume1/docker/spletch/app
```

Créer :

```text
/volume1/docker/spletch/data
/volume1/docker/spletch/backups
```

Ces deux derniers dossiers contiennent les données persistantes et ne devront jamais être remplacés par une nouvelle archive.

## 2. Préparer les variables

Copier `.env.portainer.example` en `.env.portainer` et modifier au minimum :

```env
SPLETCH_IMAGE_REPOSITORY=ghcr.io/votre-compte/spletch
SPLETCH_VERSION=0.5.1
WEB_ORIGINS=https://board.votre-domaine.fr
COOKIE_SECURE=true
```

Pour un premier test local :

```env
WEB_ORIGINS=http://192.168.1.20:4080
COOKIE_SECURE=false
```

Le secret applicatif est généré au premier démarrage dans `data/app-secret`.

## 3. Déployer dans Portainer

1. Ouvrir **Stacks → Add stack**.
2. Nommer la stack `spletch`.
3. Choisir **Upload** et charger `portainer-stack.yml`.
4. Dans les variables, charger `.env.portainer`.
5. Pour une image privée, sélectionner le registre GHCR configuré dans Portainer.
6. Cliquer sur **Deploy the stack**.

Tester :

```text
http://IP_DU_NAS:4080/api/health
http://IP_DU_NAS:4080
```

## 4. Configurer le proxy inversé DSM

Dans DSM 7 :

1. **Panneau de configuration → Portail de connexion → Avancé → Proxy inversé → Créer**.
2. Source : `HTTPS`, hôte `board.votre-domaine.fr`, port `443`.
3. Destination : `HTTP`, hôte `127.0.0.1`, port `4080`.
4. Dans les en-têtes personnalisés, choisir **Créer → WebSocket**.
5. Associer un certificat valide au sous-domaine.

Après validation, `BIND_ADDRESS=127.0.0.1` peut être utilisé pour ne plus exposer le port 4080 au réseau local.

## 5. Sauvegardes

À chaque redéploiement, si une base existe, une sauvegarde SQLite est créée automatiquement avant le démarrage. La nouvelle version ne démarre pas si cette sauvegarde échoue, sauf si `REQUIRE_STARTUP_BACKUP=false` est volontairement configuré.

Créer également une tâche DSM quotidienne :

```bash
/volume1/docker/spletch/app/deploy/synology/backup-now.sh
```

Sauvegarder `data/` et `backups/` avec Hyper Backup vers une destination extérieure au NAS.

## 6. Futures mises à jour

Suivre [UPDATE.md](UPDATE.md). En pratique :

```env
SPLETCH_VERSION=VERSION_SUIVANTE
```

puis **Update the stack → Re-pull image and redeploy**.

## Construction locale de secours

Si aucun registre n'est utilisé, l'image peut encore être construite sur le NAS :

```bash
cd /volume1/docker/spletch/app
SPLETCH_IMAGE_REPOSITORY=spletch-synology \
SPLETCH_VERSION=0.5.1 \
./deploy/synology/build-image.sh
```

Configurer alors :

```env
SPLETCH_IMAGE_REPOSITORY=spletch-synology
SPLETCH_VERSION=0.5.1
SPLETCH_PULL_POLICY=never
```

Ce mode est un secours ; il ne permet pas la mise à jour par simple téléchargement/redéploiement.

## Dépannage

```bash
./deploy/synology/healthcheck.sh
docker logs --tail=200 spletch
docker logs --tail=200 spletch-proxy
```

- Boucle de connexion : vérifier que `WEB_ORIGINS` correspond exactement à l'URL du navigateur.
- Cookies absents en HTTP local : utiliser temporairement `COOKIE_SECURE=false`.
- WebSocket déconnecté : ajouter l'en-tête DSM prédéfini **WebSocket**.
- Permission refusée : redéployer la stack ; le service `permissions` remet les dossiers à l'UID 1000.
