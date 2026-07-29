# Architecture de performance du tableau

Spletch! 0.5.1 réduit le coût du navigateur en fonction du nombre d’objets visibles plutôt que du nombre total d’objets du tableau. Aucun niveau de détail dépendant du zoom n’est appliqué : un objet visible conserve le même rendu à toutes les échelles.

## Virtualisation du viewport

- index spatial uniforme de 512 unités ;
- requête du viewport avec marge de préchargement ;
- les objets sélectionnés ou édités restent montés même hors champ ;
- les zones de texte DOM utilisent la même liste virtualisée ;
- la sélection rectangulaire interroge l’index au lieu de parcourir tout le tableau.

## Couches de rendu

1. grille sans détection d’événements ;
2. objets statiques visibles ;
3. sélection, transformation et tracé courant ;
4. présence et curseurs distants sans détection d’événements.

Pendant un déplacement ou une transformation, Konva met à jour les nœuds directement. Yjs ne reçoit que l’état final de l’action.

## Dessins

Le tracé courant reste local durant le geste. À la fin :

1. suppression radiale des points trop proches ;
2. simplification Douglas–Peucker ;
3. normalisation de la boîte englobante ;
4. une seule transaction Yjs persistante.

## Images

Chaque upload produit trois variantes WebP immuables :

- miniature, maximum 384 px ;
- affichage, maximum 2 048 px ;
- pleine définition.

Le client charge la miniature puis remplace progressivement par la variante d’affichage. Les images hors viewport ne sont pas montées. Un cache LRU libère les images les moins récemment utilisées.

## Mode adaptatif

Le mode est choisi automatiquement selon :

- le nombre total et visible d’objets ;
- la mémoire annoncée par l’appareil ;
- les longues tâches observées sur le thread principal.

Le mode peut réduire le ratio de pixels, les ombres, le dessin parfait et la fréquence des curseurs distants. Il ne masque pas de texte et ne simplifie pas le rendu selon le zoom.

## Seuils initiaux

- qualité : moins de 500 objets visibles ;
- équilibré : à partir de 500 objets visibles ou 8 000 objets au total ;
- économie : à partir de 1 200 objets visibles ou 25 000 objets au total.

Ces seuils devront être affinés avec les mesures réelles du DS423+ et des appareils clients.
