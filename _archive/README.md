# L'archive

Du code retiré du site mais **gardé exprès**, parce qu'il contient des
mécaniques qui valent d'être reprises ailleurs. Rien ici n'est monté, servi,
ni chargé : `server.js` n'en `require` aucune ligne, et aucune route ne pointe
dessus. C'est une réserve de pièces, pas une application.

⚠️ **Ne rien remettre en service tel quel.** Tout ce qui suit a été écrit pour
un Perudo qui avait son propre système de comptes, sa propre identité visuelle
et son propre hall. Le salon a changé depuis. Ce qu'on vient chercher ici, ce
sont des **mécaniques et des décisions de conception**, pas des fichiers à
rebrancher.

---

## `perudo-v1/` — le Perudo d'avant (13 344 lignes)

Le jeu a été réécrit au standard du salon (voir `perudo/game.js` et
`public/perudo/`). Les **règles de la maison** ont été reprises à l'identique
et vérifiées : 36 288 combinaisons comparées entre les deux implémentations,
zéro divergence. Le reste attend ici.

### Ce qu'on est venu y chercher

| Ce qu'il y a | Où | Pourquoi ça vaut le coup |
|---|---|---|
| **La campagne** | `game.js` : `start_run`, `run_choose_node`, `run_pick_relic`, `run_data`, `abandon_run`, `create_campaign_game` | Une structure de run façon roguelike — carte de nœuds, choix de reliques, étoiles par niveau — qui n'a **rien de spécifique au Perudo**. Les reliques y modifient les règles du combat (`spareDie`, `forcePalifico`, `fog`, ancre, longue-vue) : c'est le bon patron pour une campagne applicable à n'importe quel jeu du salon. |
| **La messagerie** | `game.js` : `join_tavern`, `send_message`, `send_game_chat` ; côté client, la taverne | Un fil de discussion persistant hors partie (la taverne) **et** un fil par table. Le salon n'a aujourd'hui que les discussions du jour des jeux quotidiens. |
| **Le micro** | `game.js` : `join_voice`, `leave_voice`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate` | De la voix en WebRTC pair-à-pair, sans serveur média. Le plus délicat à refaire de zéro, et le plus précieux à relire. |
| **Les tournois** | `game.js` : `create_tournament`, `join_tournament`, `claim_tournament_match`, `spectate_tournament_match`, `get_tournament(s)` | Poules, matchs, champion. Un système de tournoi **générique** aurait plus de valeur que le seul tournoi de Perudo. |
| **Les cosmétiques et les hauts faits** | `game.js` : `ACHIEVEMENTS`, `set_cosmetics`, `set_title`, `syncRewards` | Récompenses débloquées par le jeu : cadres, bannières, couleurs de nom, titres. Le salon a depuis ses propres **titres** (`comptes/titres.js`) et son **choix de badges** (profil) — à rapprocher plutôt qu'à dupliquer. |
| **Les émotes** | `game.js` : `send_emote`, `send_reaction` | Réactions rapides en cours de partie. |

### Ce qui a déjà été repris, et qu'il ne faut PAS recopier

- **Les règles du jeu** — dans `perudo/game.js`, à l'identique et testées.
- **Les 47 skins de dés** — extraits dans `public/des.js`, partagés avec le
  Yams. L'ancien catalogue vivait en double.
- **Les statistiques** — reprises dans le cache commun (`perudo:stats:<pseudo>`),
  avec une migration des anciens profils faite une seule fois au démarrage
  (`reprendreLesProfilsPerudo` dans `server.js`).

### Les pièges à connaître avant d'y retoucher

- **Le système de comptes est parallèle à celui du salon.** `registeredUsers`,
  `loadUsers`, `saveUsers` y désignent les profils *Perudo*, rangés dans la clé
  Redis `users` (ou `perudo_users.json`) — à ne jamais confondre avec
  `portail_users`, les comptes du salon. Les événements `login`, `register` et
  `salon_login` appartiennent à ce système-là. Tout ce qu'on reprendra devra
  passer au cookie signé du portail.
- **Les événements socket n'ont pas de préfixe** (`create_game`, `join_game`,
  `send_message`…). Le serveur partage un seul `io` entre tous les jeux :
  remettre ce fichier en service provoquerait des collisions avec les autres.
  Tout ce qu'on reprendra doit être préfixé.
- **Les mains partent parfois en bloc** (`reveal_hands` envoie `game.hands`
  entier). C'est voulu à la révélation, mais c'est le genre de détail à
  revérifier avant de réutiliser du code de diffusion d'état.
