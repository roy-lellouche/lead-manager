# Instructions pour Claude — lead-manager

## ⚠️ RÈGLE OBLIGATOIRE : toujours livrer en production

Pour **chaque modification**, quelle que soit la session, sans attendre de
demande supplémentaire :

1. **Commit** les changements sur la branche de travail de la session.
2. **Push** la branche de travail (`git push -u origin <branche>`).
3. **Merger dans `main`** (branche de production) puis **push `main`** :
   ```bash
   git fetch origin main
   git checkout main && git pull origin main
   git merge --no-edit <branche>
   git push origin main
   git checkout <branche>
   ```
   (Si une PR existe pour la branche, la merger dans `main` revient au même.)
   En cas de conflit, le résoudre proprement avant de pousser — ne jamais
   écraser l'historique de `main` (pas de `--force` sur `main`).
4. **Suivre le déploiement Vercel** déclenché par le push sur `main`
   (outils MCP Vercel : `list_deployments` / `get_deployment` /
   `list_deployment_events`) jusqu'à l'état final :
   - `READY` → confirmer à l'utilisateur que c'est en prod (avec l'URL).
   - `ERROR` / `CANCELED` → lire les logs de build, corriger, re-commit,
     re-merger, re-pousser et suivre à nouveau jusqu'à `READY`.

### Infos Vercel du projet

- Équipe : `rscrm` (`team_wnYHeLRG54CP0iNGwFp10PST`)
- Projet : `crm-rs-ecologie` (`prj_2ImY04ow87xQYOTArQyrmphElM1n`)
- URL de prod : https://crm-rs-ecologie.vercel.app
- Dépôt Git : `roy-lellouche/lead-manager`, branche de prod `main`

### Si aucun déploiement n'apparaît après le push sur `main`

Les commits écrits par `Claude <noreply@anthropic.com>` ne déclenchent pas
toujours le webhook Git de Vercel. Si aucun déploiement pour le SHA poussé
n'apparaît dans `list_deployments` après environ 1 minute, le lancer
soi-même avec l'outil MCP `create_deployment` :

```json
{
  "teamId": "team_wnYHeLRG54CP0iNGwFp10PST",
  "requestBody": {
    "name": "crm-rs-ecologie",
    "project": "prj_2ImY04ow87xQYOTArQyrmphElM1n",
    "target": "production",
    "gitSource": { "type": "github", "org": "roy-lellouche",
                   "repo": "lead-manager", "ref": "main", "sha": "<sha de main>" }
  }
}
```

Puis suivre ce déploiement avec `get_deployment` jusqu'à `READY`.

Une tâche n'est **pas terminée** tant que le déploiement de production Vercel
n'est pas `READY`.

## Avant de pousser

- Lancer les vérifications rapides du projet sur ce qui a changé
  (`npm run lint`, `npx tsc --noEmit`, tests concernés) quand c'est pertinent.
- Les migrations Supabase se trouvent dans `supabase/` : vérifier la
  numérotation pour éviter les doublons.
