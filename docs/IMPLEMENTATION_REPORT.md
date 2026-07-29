# Spletch! 0.5.1 — rapport d’implémentation

## Périmètre appliqué

Cette version applique les optimisations retenues, à l’exception explicite des niveaux de détail dépendant du zoom.

### 1. Virtualisation et index spatial

- nouvel index uniforme de 512 unités dans `apps/web/src/performance/spatialIndex.ts` ;
- calcul conservateur des boîtes englobantes des objets pivotés ;
- rendu limité au viewport avec marge de préchargement ;
- objets sélectionnés et objet édité forcés dans la liste visible ;
- sélection rectangulaire alimentée par l’index spatial ;
- overlays DOM des textes eux aussi virtualisés.

### 2. Interactions hors React/Yjs

- les déplacements collectifs modifient directement les nœuds Konva puis produisent une transaction Yjs finale ;
- les transformations restent locales jusqu’à `transformEnd` ;
- le tracé courant n’est plus écrit dans Yjs à chaque événement pointeur ;
- les curseurs distants sont limités à 12, 20 ou 30 mises à jour par seconde selon la pression de rendu ;
- les objets Yjs inchangés conservent leur identité JavaScript pour permettre la mémorisation React.

### 3. Couches séparées

- grille non interactive ;
- objets statiques visibles ;
- objets sélectionnés, transformer et tracé courant ;
- présence et curseurs distants non interactifs.

Les formes sont rendues par un composant `memo` qui ignore les changements sans effet sur l’objet concerné.

### 4. Images progressives

Chaque upload produit :

- une miniature WebP de 384 px maximum ;
- une variante d’affichage de 2 048 px maximum ;
- une variante pleine définition.

Le navigateur charge la miniature puis la variante d’affichage. Un cache LRU conserve au maximum 72 images ou environ 320 Mo décodés. Les anciens assets sans variantes restent compatibles grâce à un retour automatique vers le fichier principal.

### 5. Simplification des tracés

- réduction radiale des points proches ;
- algorithme Douglas–Peucker ;
- normalisation correcte des coordonnées négatives ;
- une seule insertion Yjs en fin de geste.

### 6. Mode adaptatif sans LOD

Le mode qualité, équilibré ou économie peut ajuster :

- le ratio de pixels ;
- les ombres ;
- `perfectDrawEnabled` ;
- la fréquence des curseurs distants.

Il ne masque ni ne simplifie les objets en fonction du niveau de zoom.

## Renommage et déploiement

- produit renommé en **Spletch!** ;
- packages npm renommés `@spletch/web` et `@spletch/server` ;
- cookies et clés locales renommés ;
- migration transparente de `atelier.sqlite` vers `spletch.sqlite` ;
- stack Portainer utilisant `SPLETCH_VERSION` et `SPLETCH_IMAGE_REPOSITORY` ;
- limite par défaut portée à 10 000 objets par tableau ;
- limite mémoire du conteneur Synology fixée à 4 Go pour le DS423+ équipé de 16 Go.
