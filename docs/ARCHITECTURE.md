# Architecture consolidée

## Source de vérité

`apps/web` et `apps/server` constituent l’application déployable. Les anciennes démonstrations HTML sont uniquement des prototypes visuels et ne doivent pas être publiées comme produit.

## Flux persistants

- SQLite : utilisateurs, sessions, tableaux, membres, liens, droits, inventaire des assets, audit ;
- documents Yjs : objets du tableau et documents ProseMirror collaboratifs ;
- stockage privé : images WebP et pages PDF déjà converties par le navigateur ;
- sauvegarde : copie cohérente SQLite avec `sqlite3 .backup`, puis répertoire d’assets.

## Flux éphémères

- présence, curseurs et sélections : Awareness Yjs ;
- chat et réactions : messages stateless Hocuspocus, 150 messages maximum et expiration après deux heures ;
- compteurs non lus : état local du client.

## Texte riche

Le chat reçoit du Markdown Discord, rendu par un composant centralisé `MarkdownContent`. Les notes de projet et les textes du tableau sont des documents ProseMirror/Tiptap collaboratifs. Ils utilisent le même ensemble fonctionnel : titres, emphases, soulignement, barré, spoilers, citations, listes, tâches, liens, code en ligne, blocs de code avec langage et tableaux.

Aucun HTML arbitraire n’est conservé dans le modèle métier.

## Assets

Le document Yjs ne contient jamais de blob ni de Base64. Un objet image ou page PDF contient uniquement un `assetId`, ses dimensions et sa transformation. L’API vérifie l’accès avant chaque téléchargement.


## Import PDF côté client

PDF.js est intégré au bundle du client. Le navigateur lit le PDF, rend une seule page à la fois sur un canvas, adapte la résolution si le nombre de pixels dépasse la limite locale, encode la page en WebP puis la téléverse. Le PDF original n’est jamais envoyé au serveur.

Chaque page téléversée porte un `sourceDocumentId` dérivé localement du SHA-256 du PDF, le nom source, le numéro de page, le nombre total de pages et la résolution effective. Une contrainte unique `(boardId, sourceDocumentId, pageNumber, dpi)` rend les reprises idempotentes. Le serveur décode et réencode malgré tout chaque image avec Sharp avant stockage.

## Schéma du canvas

Chaque objet porte `schemaVersion: 3`, un identifiant, une transformation, un ordre de calque et des propriétés spécifiques. `migrateElement` assure la lecture des anciens objets et borne les valeurs numériques. Le serveur refait une validation indépendante avant chaque sauvegarde Yjs.


## Pipeline de rendu performant

Le tableau construit un index spatial en mémoire à partir des métadonnées Yjs. Une requête du viewport fournit uniquement les objets à monter dans Konva et les overlays DOM. Les objets sélectionnés restent montés afin de préserver les transformations hors champ.

Les couches sont séparées entre grille, objets statiques, interaction et présence. Le déplacement, le redimensionnement et le tracé courant utilisent les nœuds Konva directement ; la transaction Yjs est produite à la fin de l’action. Les images sont chargées progressivement depuis des variantes immuables et conservées dans un cache LRU. Voir `docs/PERFORMANCE.md`.
