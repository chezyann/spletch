# Import PDF côté client

## Décision

Le PDF original reste dans le navigateur. Le serveur ne reçoit que les pages converties en images.

## Flux

1. le navigateur lit le fichier avec PDF.js ;
2. il calcule localement un identifiant stable à partir du SHA-256 du PDF ;
3. il rend une page à la fois sur un canvas ;
4. il réduit automatiquement le DPI si la page dépasserait 20 millions de pixels ;
5. il encode la page en WebP ;
6. il téléverse immédiatement l’image avec son numéro, le nombre total de pages et le DPI effectif ;
7. le serveur décode puis réencode l’image avec Sharp avant stockage ;
8. l’objet Yjs ne conserve que l’identifiant de l’asset et ses transformations.

## Valeurs par défaut

- 144 ppp ;
- 30 pages maximum par opération ;
- 50 Mo maximum pour le PDF local ;
- 20 millions de pixels maximum par page ;
- qualité WebP 88 % ;
- traitement séquentiel ;
- trois tentatives de téléversement par page ;
- annulation via `AbortController`.

## Reprise et idempotence

Une page est identifiée par :

```text
boardId + SHA-256 du PDF + numéro de page + DPI effectif
```

Le serveur renvoie l’asset existant lorsqu’une tentative identique est répétée. Le client vérifie également si l’objet correspondant existe déjà sur le tableau avant de l’ajouter.

## Sécurité

- `isEvalSupported` est désactivé dans PDF.js ;
- le PDF original n’est jamais envoyé à l’API ;
- les métadonnées client ne sont pas considérées comme une preuve ;
- Sharp impose une limite de pixels, décode réellement l’image et produit un nouveau WebP sans métadonnées ;
- les quotas de stockage et les permissions du tableau restent vérifiés côté serveur ;
- les blobs et Base64 ne sont jamais placés dans Yjs.

## Tests à exécuter avant production

- PDF chiffrés, corrompus, avec formulaires, transparences et polices non intégrées ;
- documents de 1, 10 et 30 pages ;
- mobile avec 2 à 4 Go de RAM ;
- annulation pendant le rendu, l’encodage et le téléversement ;
- perte réseau après réception serveur mais avant réponse client ;
- réimport du même PDF à la même résolution et à une résolution différente ;
- dépassement des quotas et fichiers images malformés.
