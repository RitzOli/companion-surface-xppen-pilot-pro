# XPPen Pilot Pro

Fait de la console d'édition XPPen Pilot Pro une surface Companion. La console
ne fait qu'envoyer : elle n'a ni écran ni voyant, Companion ne lui renvoie rien.
Chaque bouton, chaque molette et chaque direction du joystick commande un bouton
de Companion.

XPPen ne documente pas le protocole de la console : il a été retrouvé en
observant ce qu'elle envoie en USB. Les détails sont dans `PROTOCOL.md`.

## Branchement

La console se branche en USB. Il n'y a rien à régler avant : le plugin la lit en
même temps que le pilote XPPen, Windows l'autorise.

Le pilote XPPen (`PilotController.exe`) peut donc rester en marche, mais
**il continuera d'envoyer ses raccourcis clavier à l'application active**, en
plus des appuis reçus par Companion. Si ce double effet vous gêne, quittez le
pilote ou donnez-lui un profil vide.

## Disposition

Huit colonnes sur **cinq** lignes. Une page Companion n'en a que quatre par
défaut : **agrandissez la page à cinq lignes**, sinon la dernière restera hors
d'atteinte.

| Ligne | Contrôles |
|---|---|
| 0 | `left-1` … `left-4`, `right-1` … `right-4` |
| 1 | `cross-up` `cross-down` `cross-left` `cross-right`, `top-button`, puis les trois molettes en encodeur : `dial-zoom` `dial-pot` `dial-outer` |
| 2 | les mêmes molettes, un bouton par sens : `dial-zoom-plus` `dial-zoom-minus` `dial-pot-plus` `dial-pot-minus` `dial-outer-plus` `dial-outer-minus` |
| 3 | le joystick : `joy-up` `joy-down` `joy-left` `joy-right`, puis les diagonales du mode 8 directions |
| 4 | `combo-1` … `combo-4`, `double-1` … `double-4` |

### Les molettes, sous deux formes

Pour Companion, une molette est un **encodeur** : un seul bouton, qui reçoit
« rotate left » et « rotate right ». Ces boutons sont en ligne 1. Il faut y
activer les actions rotatives pour voir apparaître les deux groupes d'actions.

La ligne 2 propose la même chose autrement : **un bouton par sens**, qui reçoit
un appui complet à chaque cran. C'est plus lisible, plus simple à régler, et il
n'y a aucune option à activer.

Chaque cran arrive sous les deux formes. Servez-vous de l'une, de l'autre, ou
des deux.

Le potentiomètre `dial-pot` se clique en plus de tourner. Son clic arrive sur le
même bouton que sa rotation.

### La grille ne bouge jamais

Les emplacements de combos et de double-clics existent d'avance, même si vous ne
vous en servez pas. C'est voulu : la disposition est fixée une fois pour toutes
quand la surface s'enregistre. **Si elle changeait, vos boutons se décaleraient
sans prévenir** : la page garderait ses étiquettes, mais chaque bouton répondrait
à un autre contrôle. Un nouveau contrôle s'ajoutera donc toujours en fin de
grille.

## Variables

| Variable | Contenu |
|---|---|
| `battery` | niveau de charge en pourcentage, mis à jour toutes les 10 s |
| `joystick_x` | axe horizontal brut, -511 à 511 |
| `joystick_y` | axe vertical brut, -511 à 511 |

Les axes sont envoyés 20 fois par seconde tant que le joystick est poussé, puis
une dernière fois quand il revient au centre. Pour s'en servir, il faut relier
chacune de ces trois variables à une variable personnalisée, tout en bas des
réglages de la surface.

## Réglages

Ils sont dans **Surfaces**, en cliquant sur la console, sous les réglages
habituels de Companion. La première ligne, **Noms des boutons**, rappelle les
noms à écrire dans les listes plus bas.

### Joystick

**Joystick** — 4 directions, 8 directions avec les diagonales, ou « variables
seules » : dans ce dernier mode le joystick n'appuie sur aucun bouton, seules
`joystick_x` et `joystick_y` sont envoyées.

**Zone morte** — sur 511 d'amplitude, 300 par défaut. Ce n'est pas un réglage de
confort : la molette zoom entoure le joystick, et la tourner secoue le joystick
jusqu'à 250 environ. Une poussée volontaire dépasse 500. Sous 250, le joystick
se déclenchera chaque fois que vous toucherez la molette, surtout en mode
8 directions, où chaque direction ne couvre que 45°.

**Confirmation** — 80 ms par défaut. La direction doit tenir ce temps avant de
compter. Une secousse accidentelle dure 25 à 250 ms, une poussée volontaire
dépasse 400 ms. Mettre 0 pour un déclenchement immédiat.

**Répétition** — à 0, le bouton reste enfoncé tant que le joystick est poussé.
Au-dessus, il envoie des appuis complets à ce rythme, ce qui convient pour faire
défiler une timeline.

**Temps mort** — après un relâchement, retarde la direction suivante, pour ne
pas compter les rebonds du ressort de rappel.

**Bloquer le zoom** — pousser le joystick peut aussi faire tourner la molette
zoom de quelques crans. Coché, ces crans sont ignorés tant que le joystick est
poussé. À laisser coché, sauf besoin particulier.

### Boutons maintenus

Ces boutons basculent au lieu de suivre le doigt : un appui les enfonce et les
laisse enfoncés, l'appui suivant les relâche.

Pour un simple marche / arrêt, mieux vaut un bouton à étapes dans Companion :
l'état n'est alors tenu qu'à un seul endroit. Cette option sert au cas que
Companion ne couvre pas : garder une action en cours sans garder le doigt sur le
bouton.

### Combos

Quatre au maximum, écrits `left-1+left-2, left-3+left-4`, affectés **dans
l'ordre d'écriture** à `combo-1` … `combo-4`.

Un combo ne déclenche pas les boutons qui le composent : seul l'emplacement de
combo part. Pour distinguer un appui à deux doigts de deux appuis rapprochés, le
plugin retient un court instant les boutons d'un combo : c'est le réglage
**Combo : délai**, **50 ms par défaut, et seulement pour les boutons cités**.
Les autres restent instantanés.

Un nom de bouton mal écrit fait sauter le combo entier. La raison est dans le
journal.

### Double-clic

Quatre boutons au maximum, affectés dans l'ordre à `double-1` … `double-4`.
**Double : délai** donne le temps maximal entre les deux appuis, 250 ms par
défaut.

En mode **additif**, le premier appui part normalement et le double s'ajoute :
aucun retard, mais l'action simple s'exécute deux fois. En mode **exclusif**, le
deuxième appui ne lance que le double. L'additif convient quand les deux actions
se cumulent, l'exclusif quand elles s'opposent.

Pour un appui long, ne rien régler ici : Companion le fait déjà, avec les
groupes de durée du bouton.

## Ce que le plugin ne voit pas

Les quatre touches tactiles A/B/C/D au-dessus du joystick et une partie des
boutons de fonction annoncés par XPPen n'ont pas été retrouvés dans ce que la
console envoie, sur plus de vingt minutes de capture. Ils sont sans doute
traités à l'intérieur de la console, pour le changement de thème. On ne peut
donc pas s'en servir dans Companion.
