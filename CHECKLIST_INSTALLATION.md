# Checklist d'installation Spletch!

## GitHub

- [ ] Dépôt `spletch` créé
- [ ] Sources poussées sur `main`
- [ ] Workflow « Générer le lockfile npm » réussi
- [ ] `package-lock.json` présent
- [ ] Release/tag `v0.5.1` créée
- [ ] Workflow « Publier l'image Docker » réussi
- [ ] Package GHCR rendu public

## DS423+

- [ ] `/volume1/docker/spletch/app` créé
- [ ] `/volume1/docker/spletch/data` créé
- [ ] `/volume1/docker/spletch/backups` créé
- [ ] Kit copié dans `app`
- [ ] `.env.portainer` adapté
- [ ] Stack `spletch` déployée
- [ ] Conteneur `spletch` healthy
- [ ] Conteneur `spletch-proxy` healthy
- [ ] `/api/health` répond
- [ ] Création d'un compte testée
- [ ] Collaboration entre deux navigateurs testée

## HTTPS

- [ ] Domaine ou DDNS créé
- [ ] Certificat valide obtenu
- [ ] Proxy inversé DSM créé
- [ ] En-tête WebSocket activé
- [ ] `WEB_ORIGINS` passé en HTTPS
- [ ] `COOKIE_SECURE=true`
- [ ] `BIND_ADDRESS=127.0.0.1`
- [ ] Stack redéployée
- [ ] Connexion HTTPS testée

## Sauvegarde DS1815+

- [ ] Hyper Backup Vault installé sur le DS1815+
- [ ] Tâche Hyper Backup créée sur le DS423+
- [ ] `data/` sélectionné
- [ ] `backups/` sélectionné
- [ ] Sauvegarde quotidienne planifiée
- [ ] Première sauvegarde terminée
- [ ] Test de restauration planifié
