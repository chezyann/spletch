# Politique de sécurité

## Signaler une vulnérabilité

Ne publiez pas de vulnérabilité exploitable dans une issue publique. Transmettez le scénario, l’impact, les étapes de reproduction et la version concernée au mainteneur du déploiement.

## Mesures intégrées

- sessions opaques dans des cookies `HttpOnly`, `Secure` en production et `SameSite=Lax` ;
- protection CSRF signée sur toutes les mutations HTTP ;
- mots de passe Argon2id et migration transparente des anciens condensats scrypt ;
- limitation des tentatives d’authentification, appels API, uploads, messages, réactions et mises à jour temps réel ;
- tickets WebSocket signés, valables 90 secondes et renouvelés ;
- réévaluation des rôles et des sessions pendant les connexions WebSocket ;
- liste stricte des origines HTTP et WebSocket ;
- CSP, HSTS, politique de référent, interdiction d’iframe et de détection MIME ;
- rendu Markdown centralisé, HTML brut interdit et nettoyage DOMPurify ;
- éditeurs WYSIWYG ProseMirror/Tiptap à schéma fermé ;
- images décodées, orientées, débarrassées de leurs métadonnées puis réencodées en WebP ;
- PDF analysés et convertis localement avec PDF.js, page par page, avec limites de taille, pages, résolution et pixels ; le serveur ne reçoit que des images qu’il décode et réencode ;
- documents Yjs compactés, versionnés et soumis à des quotas ;
- journaux d’audit pour l’authentification, le partage, les assets et les opérations sensibles ;
- jetons de partage stockés uniquement sous forme de condensat et échangés contre un cookie court ;
- noms d’invités normalisés, caractères de contrôle/bidirectionnels retirés et noms réservés interdits.

## Hypothèses de déploiement

Le profil fourni est sécurisé pour une instance applicative unique avec un volume persistant. Redis peut propager les documents entre plusieurs serveurs Hocuspocus, mais il ne remplace pas une base relationnelle et un stockage d’assets partagés. Ne lancez pas plusieurs réplicas applicatifs sur des volumes SQLite indépendants.

## Rotation et incidents

En cas de fuite présumée :

1. remplacez `APP_SECRET` ;
2. révoquez toutes les sessions et tous les liens de partage ;
3. consultez `audit_events` ;
4. restaurez une sauvegarde vérifiée si l’intégrité des documents est affectée ;
5. informez les utilisateurs concernés selon vos obligations réglementaires.
