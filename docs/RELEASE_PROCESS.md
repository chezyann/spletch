# Contrat des futures versions Synology

Chaque future livraison destinée à Portainer doit fournir :

- une image Docker multiarchitecture avec un tag immuable ;
- un `release.json` ;
- des notes de version ;
- la version minimale pouvant être mise à jour directement ;
- la version des schémas de base et de canvas ;
- l'indication explicite qu'un retour arrière nécessite ou non une restauration ;
- une empreinte SHA-256 de l'archive source.

## Mise à jour habituelle

Lorsque `databaseMigration` vaut `none` ou `backward-compatible`, l'utilisateur change seulement `SPLETCH_VERSION`, redéploie la stack et vérifie le healthcheck.

## Mise à jour nécessitant une restauration pour revenir en arrière

Si une migration est destructive, les notes de version doivent l'indiquer avant l'installation. Le retour arrière associe alors l'ancienne image à la sauvegarde créée avant le démarrage de la nouvelle version.

## Tags

- `0.x.y` : version immuable utilisée en production ;
- `stable` : alias pratique, non recommandé dans la stack de production ;
- aucun usage de `latest`.
