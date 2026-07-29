# Installer Spletch! sur DS423+ avec Portainer

Ce guide utilise le DS423+ comme serveur principal et le DS1815+ comme destination de sauvegarde.

## Phase A — Publication unique de l'image Docker

Cette phase n'est réalisée qu'une seule fois. Elle permet ensuite de mettre Spletch! à jour en modifiant uniquement `SPLETCH_VERSION` dans Portainer.

### A1. Créer le dépôt GitHub

1. Créer un dépôt vide nommé `spletch`.
2. Ne pas ajouter de README, de licence ou de `.gitignore` lors de sa création.
3. Décompresser ce kit sur l'ordinateur.
4. Envoyer tout son contenu dans le dépôt avec GitHub Desktop ou Git.

Commandes Git possibles :

```bash
git init
git add .
git commit -m "Spletch 0.5.1"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/spletch.git
git push -u origin main
```

### A2. Générer le lockfile sans installer Node.js

1. Ouvrir le dépôt GitHub.
2. Aller dans **Actions**.
3. Choisir **Générer le lockfile npm**.
4. Cliquer sur **Run workflow**.
5. Attendre que l'action soit verte.
6. Vérifier que `package-lock.json` apparaît à la racine du dépôt.

### A3. Publier l'image 0.5.1

1. Dans GitHub, ouvrir **Releases**.
2. Cliquer sur **Draft a new release**.
3. Créer le tag `v0.5.1` depuis la branche `main`.
4. Publier la release.
5. Ouvrir **Actions → Publier l'image Docker** et attendre la fin du build.
6. Ouvrir le package `spletch` depuis le profil GitHub.
7. Aller dans **Package settings → Change visibility → Public**.

L'image obtenue est :

```text
ghcr.io/votre_compte_en_minuscules/spletch:0.5.1
```

## Phase B — Préparer le DS423+

### B1. Créer les dossiers

Dans File Station, créer :

```text
/volume1/docker/spletch/app
/volume1/docker/spletch/data
/volume1/docker/spletch/backups
```

Copier tout le contenu de ce kit dans :

```text
/volume1/docker/spletch/app
```

Ne jamais remplacer ni supprimer les dossiers `data` et `backups` pendant une mise à jour.

### B2. Préparer le fichier `.env.portainer`

Sur l'ordinateur, copier :

```text
deploy/synology/.env.portainer.example
```

sous le nom :

```text
.env.portainer
```

Pour le premier test local, modifier au minimum :

```env
SPLETCH_IMAGE_REPOSITORY=ghcr.io/VOTRE_COMPTE_EN_MINUSCULES/spletch
SPLETCH_VERSION=0.5.1
SPLETCH_PULL_POLICY=always
WEB_ORIGINS=http://IP_DU_DS423:4080
COOKIE_SECURE=false
DATA_PATH=/volume1/docker/spletch/data
BACKUP_PATH=/volume1/docker/spletch/backups
CADDYFILE_PATH=/volume1/docker/spletch/app/deploy/synology/Caddyfile
HOST_PORT=4080
BIND_ADDRESS=0.0.0.0
APP_MEMORY_LIMIT=4g
```

## Phase C — Déployer dans Portainer

1. Ouvrir Portainer.
2. Sélectionner l'environnement Docker du DS423+.
3. Aller dans **Stacks → Add stack**.
4. Nommer la stack `spletch`.
5. Choisir **Upload**.
6. Charger `deploy/synology/portainer-stack.yml`.
7. Charger `.env.portainer` dans **Environment variables**.
8. Cliquer sur **Deploy the stack**.

États attendus :

```text
spletch-permissions  exited (0)
spletch              healthy
spletch-proxy        healthy
```

Tester :

```text
http://IP_DU_DS423:4080/api/health
http://IP_DU_DS423:4080
```

## Phase D — Configurer HTTPS et WebSocket

### D1. Obtenir un nom d'hôte

Utiliser soit un domaine personnel, soit un nom Synology DDNS, par exemple :

```text
spletch-votrenom.synology.me
```

### D2. Créer le proxy inversé DSM

Dans DSM :

```text
Panneau de configuration
→ Portail de connexion
→ Avancé
→ Proxy inversé
→ Créer
```

Source :

```text
Protocole : HTTPS
Hôte      : spletch-votrenom.synology.me
Port       : 443
```

Destination :

```text
Protocole : HTTP
Hôte      : 127.0.0.1
Port       : 4080
```

Dans **En-tête personnalisé**, choisir **Créer → WebSocket**.

### D3. Passer la stack en mode HTTPS

Modifier les variables de la stack :

```env
WEB_ORIGINS=https://spletch-votrenom.synology.me
COOKIE_SECURE=true
BIND_ADDRESS=127.0.0.1
```

Puis cliquer sur **Update the stack**.

Tester :

```text
https://spletch-votrenom.synology.me/api/health
https://spletch-votrenom.synology.me
```

## Phase E — Sauvegarder vers le DS1815+

1. Installer **Hyper Backup Vault** sur le DS1815+.
2. Installer ou ouvrir **Hyper Backup** sur le DS423+.
3. Créer une tâche **Dossiers et paquets → Périphérique NAS distant**.
4. Sélectionner les dossiers :

```text
/volume1/docker/spletch/data
/volume1/docker/spletch/backups
```

5. Planifier une sauvegarde quotidienne.
6. Activer la rotation des versions.
7. Lancer une première sauvegarde manuelle.

## Phase F — Mettre à jour plus tard

1. Lire les notes de version.
2. Dans Portainer, ouvrir **Stacks → spletch**.
3. Modifier uniquement :

```env
SPLETCH_VERSION=VERSION_SUIVANTE
```

4. Cliquer sur **Update the stack**.
5. Activer **Re-pull image and redeploy**.
6. Attendre les statuts `healthy`.
7. Tester `/api/health` et un tableau existant.

Une sauvegarde SQLite est créée automatiquement avant le démarrage de la nouvelle version.
