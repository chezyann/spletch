# Mettre à jour depuis Portainer

Après la configuration initiale du registre, une mise à jour courante ne demande que le changement d'une variable.

## Avant la mise à jour

Spletch! crée automatiquement une sauvegarde versionnée à chaque démarrage si une base existe déjà. Une sauvegarde manuelle supplémentaire peut être lancée depuis DSM ou en SSH :

```bash
/volume1/docker/spletch/app/deploy/synology/backup-now.sh
```

## Mise à jour normale

1. Ouvrir **Portainer → Stacks → spletch**.
2. Ouvrir l'onglet **Editor** ou **Environment variables**.
3. Remplacer uniquement :

```env
SPLETCH_VERSION=0.4.1
```

par la version indiquée dans les notes de publication, par exemple :

```env
SPLETCH_VERSION=0.5.1
```

4. Cliquer sur **Update the stack**.
5. Activer **Re-pull image and redeploy** si Portainer affiche l'option.
6. Attendre que `spletch` et `spletch-proxy` passent à l'état `healthy`.
7. Ouvrir `/api/health`, puis vérifier un tableau existant.

Les dossiers `data` et `backups` ne sont pas recréés et ne doivent jamais être supprimés lors du redéploiement.

## Retour arrière

1. Remettre l'ancienne valeur de `SPLETCH_VERSION`.
2. Redéployer la stack avec récupération de l'image.
3. Consulter les notes de la version concernée : elles indiquent si la base doit aussi être restaurée.

Pour 0.4.1 → 0.5.1, aucune restauration de base n'est nécessaire.

## Restaurer une sauvegarde lorsque c'est requis

Arrêter la stack, puis en SSH :

```bash
cd /volume1/docker/spletch/app
./deploy/synology/restore-backup.sh /volume1/docker/spletch/backups/LE_DOSSIER_DE_SAUVEGARDE
```

Redéployer ensuite la version correspondante.

## Ne pas utiliser `latest`

La production doit toujours utiliser une version explicite telle que `0.5.1`. Le tag `stable` peut servir à tester, mais il ne garantit pas qu'un redémarrage futur utilisera exactement les mêmes octets.
