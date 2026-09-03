# Betclic — LDC Groupes

Chaque soir de Ligue des Champions, 5 cotes par match. Les membres composent une sélection de 5 cotes parmi l'ensemble de la soirée, librement réparties.

**Barème** : 🟢 Facile 2 pts · 🟡 Moyen 4 pts · 🔴 Difficile 8 pts
Maximum théorique : 40 points (5 cotes difficiles).

## Parcours membre

1. Panneau public avec le visuel, la liste des matchs et deux boutons : **🎯 Composer ma sélection** et **📋 Ma sélection**
2. Navigation match par match : les 5 cotes du match en boutons, avec leur difficulté et leurs points
3. Un clic sélectionne, un second retire. Le compteur `●●●○○ 3/5` reste visible en permanence
4. **📋 Ma sélection** affiche le récap groupé par match à tout moment
5. **✅ Valider** s'active à 5/5 et verrouille définitivement

Le bouton Valider reste grisé tant que la sélection n'est pas complète, et affiche la progression (`Valider (3/5)`).

Le bouton **📋 Ma sélection** du panneau public reste accessible à tout moment, y compris après la fermeture : les membres peuvent revoir leurs cotes et, une fois les résultats saisis, voir lesquelles sont passées et leur total.

## Commandes admin

### `/create-ldc`

| Champ | Exemple |
|---|---|
| `nom` | `LDC — Journée 1` |
| `fermeture` | `2026-09-08T18:45:00` |
| `match1` à `match8` | voir format ci-dessous |
| `image` | URL du visuel (optionnel) |
| `channel` | canal cible (défaut : ici) |

**Format d'un match** — l'ordre définit la difficulté :

```
Real Madrid vs Man City = Plus de 1.5 buts | Real marque | Les 2 marquent | Plus de 3.5 buts | Mbappé doublé
```

Positions 1 et 2 → 🟢 Facile (2 pts) · positions 3 et 4 → 🟡 Moyen (4 pts) · position 5 → 🔴 Difficile (8 pts)

**Afficher la cote Betclic** (optionnel) : ajoutez `:` suivi de la cote à la fin du libellé.

```
Real Madrid vs Man City = Plus de 1.5 buts:1.25 | Real marque:1.15 | Les 2 marquent : Oui:1.70 | Plus de 3.5 buts:2.40 | Mbappé doublé:5.50
```

Le parseur distingue le deux-points d'un libellé de celui d'une cote : seul un nombre en fin de chaîne est interprété comme une cote.

⚠️ Interdits dans les libellés : `|` et `=`. Cotes en points, pas en virgules.

### `/set-result-ldc`

Une commande par match, à lancer après les résultats.

| Champ | Exemple |
|---|---|
| `session_id` | `ldc_1757...` |
| `match` | `2` |
| `gagnantes` | `1,3,5` (ou `aucune`) |

Les numéros correspondent à la position de la cote dans le match (1 à 5). La commande est réexécutable pour corriger : elle remplace les résultats précédents de ce match.

### `/close-ldc`
Ferme les sélections manuellement avant l'heure prévue.

### `/classement-ldc`
Poste le classement dans le canal. Option `top` pour choisir le nombre de joueurs affichés (défaut 20).

Départage en cas d'égalité : la sélection validée le plus tôt passe devant.

## Déploiement Railway

1. Nouveau service branché sur le repo
2. **Volume monté sur `/app/data`**
3. Variables : `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DATA_PATH=/app/data/ldc-data.json`, et optionnellement `ADMIN_LOG_CHANNEL` (l'ID de session y est posté à chaque création)
4. `node deploy-commands.js` pour enregistrer les commandes
5. Activer les **backups du volume** dans l'onglet Backups

`MAX_PICKS` permet de changer le nombre de cotes à sélectionner (5 par défaut).

## Performance et fiabilité

La couche de données est optimisée pour les pics d'affluence :

- **État tenu en mémoire**, le fichier n'est lu qu'au démarrage. Aucun coût de lecture par interaction.
- **Écritures groupées et asynchrones** (toutes les 2 secondes au maximum) pour les clics de navigation et de sélection.
- **Écriture synchrone garantie** sur les moments critiques : validation d'une sélection, création de session, saisie des résultats, fermeture. Coût mesuré : 0,6 ms à 1000 membres.
- **Écriture atomique** via fichier temporaire puis renommage. Une coupure en cours d'écriture ne peut pas corrompre le fichier de données.
- **Sauvegarde sur SIGTERM**, ce qui couvre les redéploiements Railway.

Mesures sur une simulation de 1000 membres composant leur sélection simultanément (13 000 interactions) : 15 ms de CPU au total, une seule écriture disque au lieu de 13 000, fichier final de 108 Ko. La charge réelle d'une soirée reste très en deçà de la capacité.

### Redémarrage du bot

Les sélections sont conservées, les membres n'ont rien à refaire. Trois scénarios testés sur le code réel :

| Scénario | Résultat |
|---|---|
| Redéploiement Railway (SIGTERM) | Aucune perte, sauvegarde forcée avant l'arrêt |
| Coupure brutale après le cycle d'écriture | Aucune perte |
| Coupure brutale immédiate (`kill -9`) | Validations toutes préservées. Au pire, les clics des 2 dernières secondes non encore écrits sont à refaire |

**Prérequis absolu** : le volume doit être monté sur `/app/data` et `DATA_PATH` pointer dessus. Sans volume, tout est perdu au moindre redéploiement.

Un suivi est loggué chaque minute en période d'activité : nombre d'interactions, écritures effectuées et mémoire utilisée.

⚠️ Le bot ne relit plus le fichier en cours d'exécution. Si vous modifiez `ldc-data.json` depuis la console Railway, **redémarrez le service** pour que le changement soit pris en compte.

`FLUSH_MS` permet d'ajuster l'intervalle d'écriture (2000 ms par défaut).

## Bon à savoir

- Les sélections non validées comptent quand même au classement, avec un départage défavorable.
- Le bot supporte de 2 à 8 matchs par soirée.
- Filets anti-crash en place : une interaction en échec est loggée sans faire tomber le process.
