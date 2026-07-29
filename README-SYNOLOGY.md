# Spletch! — DS423+ + Portainer

Le parcours complet est décrit dans [INSTALLATION_PAS_A_PAS.md](INSTALLATION_PAS_A_PAS.md).

Ordre recommandé :

1. publier une image Docker publique dans GHCR avec les workflows inclus ;
2. créer les dossiers persistants sur le DS423+ ;
3. déployer `portainer-stack.yml` dans Portainer ;
4. tester localement sur le port 4080 ;
5. configurer le proxy inversé HTTPS/WebSocket de DSM ;
6. sauvegarder `data/` et `backups/` vers le DS1815+ avec Hyper Backup.

Les futures mises à jour se font en modifiant uniquement `SPLETCH_VERSION` puis en utilisant **Update the stack / Re-pull image and redeploy**.
