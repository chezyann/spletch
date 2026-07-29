# Spletch! 0.5.1

Version de préparation au déploiement Synology/Portainer.

## Changements

- ajout d'un workflow GitHub Actions générant et validant `package-lock.json` sans installation locale de Node.js ;
- build Docker rendu strictement reproductible avec `npm ci` ;
- ajout d'un guide d'installation complet, de GitHub jusqu'au proxy inversé DSM et aux sauvegardes ;
- conservation des optimisations de performance de la version 0.5.0 ;
- aucune migration destructive de la base ou du format des tableaux.

## Mise à jour depuis 0.5.0

Le retour arrière vers 0.5.0 ne nécessite pas de restauration de base. Les données restent dans les volumes Synology.
