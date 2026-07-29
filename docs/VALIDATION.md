# Spletch! 0.5.1 — validation

## Contrôles réussis

- transpilation syntaxique de 46 fichiers TypeScript/TSX ;
- contrôle statique de sécurité du dépôt ;
- validation de tous les fichiers JSON ;
- validation YAML de Docker Compose, Portainer et GitHub Actions ;
- validation syntaxique de tous les scripts shell Synology ;
- contrôle de cohérence du kit de déploiement ;
- validation syntaxique JavaScript de la démonstration autonome ;
- tests unitaires manuels de l’index spatial, de la simplification et de la normalisation des tracés.

## Mesure algorithmique locale

Jeu de test : 25 000 rectangles répartis sur un grand tableau, 1 000 requêtes de viewport.

- construction de l’index : 18,05 ms ;
- requête médiane : 0,0059 ms ;
- 95e percentile : 0,0203 ms ;
- moyenne : 59,5 objets retournés par viewport ;
- tracé de 5 000 points simplifié à 302 points en 7,39 ms.

Ces valeurs mesurent les algorithmes dans Node.js, pas les FPS finaux d’un navigateur réel. La démo v22 permet les essais interactifs sur les appareils cibles.

## Limites de validation

Le registre npm de l’environnement de création ne contient pas toutes les dépendances du projet. Les opérations suivantes restent obligatoires dans un environnement connecté avant publication de l’image Docker :

```bash
npm install
npm ci
npm run check
npm audit --omit=dev --audit-level=high
npm run production:gate
```

Le build Vite complet, le typecheck avec les types réels de React/Konva, les tests multi-utilisateurs et les mesures sur téléphone n’ont pas pu être exécutés ici.
