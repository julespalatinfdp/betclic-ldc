# Betclic — LDC Groupes

Chaque soir de Ligue des Champions, 5 cotes par match. Les membres composent une sélection de 5 cotes parmi l'ensemble de la soirée, librement réparties.

**Barème** : 🟢 Facile 2 pts · 🟡 Moyen 4 pts · 🔴 Difficile 8 pts
Maximum théorique : 40 points (5 cotes difficiles).

## Parcours membre

1. Panneau public avec le visuel, la liste des matchs et le bouton **🎯 Composer ma sélection**
2. Navigation match par match : les 5 cotes du match en boutons, avec leur difficulté et leurs points
3. Un clic sélectionne, un second retire. Le compteur `●●●○○ 3/5` reste visible en permanence
4. **📋 Ma sélection** affiche le récap groupé par match à tout moment
5. **✅ Valider** s'active à 5/5 et verrouille définitivement

Le bouton Valider reste grisé tant que la sélection n'est pas complète, et affiche la progression (`Valider (3/5)`).

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

## Bon à savoir

- Les sélections non validées comptent quand même au classement, avec un départage défavorable.
- Le bot supporte de 2 à 8 matchs par soirée.
- Filets anti-crash en place : une interaction en échec est loggée sans faire tomber le process.
