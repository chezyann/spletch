# Checklist avant ouverture publique

- [ ] `package-lock.json` généré, relu et commité.
- [ ] `npm ci`, `npm run check` et `npm audit --omit=dev --audit-level=high` réussis.
- [ ] `npm run production:gate` réussi avec les variables de production.
- [ ] `APP_SECRET` aléatoire, stocké dans un gestionnaire de secrets et procédure de rotation testée.
- [ ] HTTPS/WSS et domaine final vérifiés ; aucune origine de développement dans `WEB_ORIGINS`.
- [ ] Sauvegarde chiffrée et restauration testée.
- [ ] PDF.js, Sharp, Node, Caddy et images Docker à jour.
- [ ] Tests XSS : chat, collage WYSIWYG, liens, spoilers, code et données Yjs forgées.
- [ ] Tests de révocation d’un membre/lien/session sur une connexion WebSocket active.
- [ ] Tests d’images malformées et de PDF volumineux sur desktop, tablette et téléphone ; annulation/reprise vérifiées.
- [ ] Tests de charge et quotas vérifiés.
- [ ] Politique de confidentialité, rétention et procédure d’incident publiées.
- [ ] Test de pénétration indépendant terminé.
- [ ] Un seul réplica applicatif tant que les stockages distribués ne sont pas branchés.
