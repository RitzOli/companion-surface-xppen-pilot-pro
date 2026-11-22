# companion-surface-xppen-pilot-pro

Surface [Bitfocus Companion](https://bitfocus.io/companion) pour la console d'édition **XPPen Pilot Pro**.

La Pilot Pro est une petite console USB pensée pour le montage : boutons, molettes et joystick. Avec cette surface,
chacun de ses contrôles commande un bouton de Companion, comme le ferait un Stream Deck sans écran.

XPPen ne documente pas le protocole de la console. Il a été retrouvé en observant ce qu'elle envoie en USB :
voir [PROTOCOL.md](PROTOCOL.md).

## Ce que la surface apporte

| | |
|---|---|
| **Boutons** | 13 : quatre à gauche, quatre à droite, la croix, le bouton du dessus |
| **Molettes** | 3, dont une cliquable. Chacune existe en encodeur et en deux boutons, un par sens |
| **Joystick** | 4 ou 8 directions, ou ses deux axes en variables |
| **Combos** | jusqu'à 4 appuis à deux doigts, chacun sur son propre bouton |
| **Double-clics** | jusqu'à 4 boutons qui réagissent au double appui |
| **Boutons maintenus** | un appui les enfonce, le suivant les relâche |
| **Variables** | niveau de batterie, axes X et Y du joystick |

La console n'a ni écran ni voyant : Companion ne lui renvoie rien.

## Installation

- Sur un poste : télécharger le paquet [xppen-pilot-pro-0.1.0.tgz](xppen-pilot-pro-0.1.0.tgz) et l'importer, voir
  [INSTALLATION.md](INSTALLATION.md).
- Il faut Bitfocus Companion 5.
- La console se branche en USB sur la machine où tourne Companion.
- La page Companion doit passer à **cinq lignes** : la console en utilise cinq.

## Mode d'emploi

La disposition des contrôles sur la page et tous les réglages sont décrits dans
[companion/HELP.md](companion/HELP.md). C'est aussi l'aide affichée par le bouton « ? » dans Companion.

`xppen-page.companionconfig` est une page Companion toute faite, avec un bouton par contrôle, nommé et coloré
par famille. Elle s'importe par **Import / Export** dans Companion.

## Limites connues

- **USB seulement** : la console sait aussi se connecter en Bluetooth et par sa clé 2,4 GHz, ce n'est pas essayé.
- **Touches tactiles A/B/C/D** et une partie des boutons de fonction : la console ne les envoie pas, on ne peut pas
  s'en servir dans Companion.
- **Pilote XPPen** : s'il reste en marche, il continue d'envoyer ses raccourcis clavier en plus de Companion.

## Développement

```bash
npm install
npm test          # essais du module, sans console branchée
npm run bench     # voir en direct ce que la console envoie
npx companion-surface-build   # fabrique xppen-pilot-pro-<version>.tgz
```

Les outils de `tools/` ont servi à retrouver le protocole : capture, décodage, analyse. `capture.jsonl` est la
capture d'origine.

## Licence

MIT.
