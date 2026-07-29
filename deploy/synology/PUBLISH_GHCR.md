# Publier Spletch! dans GitHub Container Registry

Cette configuration est effectuée une seule fois. Après cela, les mises à jour sur le Synology se résument à modifier `SPLETCH_VERSION` puis à redéployer la stack.

## 1. Créer un dépôt GitHub vide

Créer un dépôt nommé `spletch`, sans README ni autre fichier initial, puis y envoyer le contenu complet du kit.

```bash
git init
git add .
git commit -m "Spletch 0.5.1"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/spletch.git
git push -u origin main
```

GitHub Desktop peut être utilisé à la place de ces commandes.

## 2. Générer le lockfile depuis GitHub

Aucune installation locale de Node.js n'est nécessaire :

1. ouvrir **Actions** dans le dépôt ;
2. choisir **Générer le lockfile npm** ;
3. cliquer sur **Run workflow** ;
4. attendre la réussite ;
5. vérifier que `package-lock.json` a été ajouté à la branche principale.

Si la branche principale refuse les commits automatiques, autoriser temporairement GitHub Actions à écrire dans la branche ou exécuter localement `npm install` puis pousser le lockfile.

## 3. Publier l'image

Depuis GitHub :

1. ouvrir **Releases → Draft a new release** ;
2. créer le tag `v0.5.1` depuis `main` ;
3. publier la release ;
4. attendre la réussite de l'action **Publier l'image Docker**.

Le workflow construit :

```text
ghcr.io/VOTRE_COMPTE_EN_MINUSCULES/spletch:0.5.1
ghcr.io/VOTRE_COMPTE_EN_MINUSCULES/spletch:stable
```

pour `linux/amd64` et `linux/arm64`.

## 4. Rendre l'image publique

Le plus simple pour Portainer Community Edition est une image publique :

1. ouvrir le profil GitHub ;
2. ouvrir **Packages → spletch** ;
3. ouvrir **Package settings** ;
4. choisir **Change visibility → Public**.

Une image publique GHCR peut être téléchargée anonymement par le Synology. Attention : GitHub n'autorise pas le retour d'un package public vers le mode privé.

## 5. Configurer Portainer

```env
SPLETCH_IMAGE_REPOSITORY=ghcr.io/votre_compte_en_minuscules/spletch
SPLETCH_VERSION=0.5.1
SPLETCH_PULL_POLICY=always
```

Ne jamais utiliser `latest` pour une installation de production.
