# Modèle de menace

## Actifs

- comptes et sessions ;
- tableaux privés et documents de synthèse ;
- liens de partage ;
- images et pages PDF converties ;
- historique d’audit ;
- disponibilité du service collaboratif.

## Adversaires considérés

- visiteur anonyme possédant ou devinant un lien ;
- membre lecteur tentant d’écrire ;
- éditeur malveillant tentant un déni de service ;
- attaquant XSS ou CSRF ;
- bot de credential stuffing ;
- fichier image/PDF malformé ;
- dépendance npm compromise.

## Frontières de confiance

- navigateur ↔ API HTTPS ;
- navigateur ↔ WebSocket WSS ;
- API ↔ SQLite/volume privé ;
- navigateur ↔ PDF.js et Web Worker ;
- chaîne de dépendances npm.

## Contrôles principaux

Les autorisations sont systématiquement vérifiées côté serveur. Le rôle du client n’est jamais considéré comme une preuve. Les documents sont limités en taille et complexité. Les PDF sont convertis localement et les images reçues sont systématiquement décodées puis réencodées côté serveur. Les sessions ne sont pas accessibles au JavaScript du navigateur. Les dépendances directes sont figées et la CI bloque les contrôles statiques, les tests, le build et les vulnérabilités élevées.

## Risques résiduels

- SQLite et le stockage local imposent une architecture mono-instance ;
- PDF.js doit être régulièrement mis à jour et testé sur les navigateurs mobiles ;
- le chat éphémère est perdu au redémarrage ;
- un véritable test de pénétration et un test de charge restent nécessaires avant une ouverture publique importante ;
- le lockfile transitif doit être généré dans un environnement connecté au registre npm.
