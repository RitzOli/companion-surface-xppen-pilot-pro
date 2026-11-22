# Protocole HID — XPPen Pilot Pro

XPPen ne documente pas ce matériel : le protocole a été retrouvé en capturant
ce que la console envoie. Toutes les observations proviennent de `tools/bench.mjs` et des
analyses de `capture.jsonl`.

## Périphérique

| | |
|---|---|
| Nom USB | `Pilot Pro` (fabricant `Hanvon ugee`) |
| VID:PID | `0x28BD:0x0203` |
| Transport testé | USB (le boîtier fait aussi Bluetooth 5.3 et dongle 2.4 G) |

Trois interfaces HID, dont une seule est exploitable :

| Interface | UsagePage | Rôle | Ouvrable |
|---|---|---|---|
| MI_00 Col01/02 | `0x0001` usage `0x0002` | souris | non — Windows refuse l'accès |
| MI_00 Col03 | `0x0001` usage `0x0006` | clavier | non — Windows refuse l'accès |
| MI_01 | `0x000D` usage `0x0002` | digitizer | non — Windows refuse l'accès |
| **MI_02** | **`0xFF0A` usage `0x0001`** | **vendeur, données brutes** | **oui** |

C'est MI_02 que le plugin ouvre. Le driver constructeur (`PilotController.exe`)
lit la même interface en parallèle sans conflit : Windows ouvre les collections
HID en mode partagé.

## Format général

Toutes les trames font 12 octets et commencent par le report ID `0x02`.
L'octet 1 porte le type, l'octet 2 le sous-type.

```
octet   0     1      2       3       4     5     6     7    8..11
      0x02  type  sous-type  ...    ...   ...   ...   ...   0x00
```

| Type | Sous-type | Contenu |
|---|---|---|
| `0xF2` | `0x01` | statut / batterie |
| `0xF3` | `0x01` | joystick analogique |
| `0xF3` | `0x02` | molettes |
| `0xF3` | `0x03` | boutons |

## `0xF2` — statut

```
02 f2 01 5d 01 50 00 00 00 00 00 00
         ^^          ^^
         |           +-- constante 0x50, rôle inconnu
         +-------------- niveau de batterie (0x5d = 93 %)
```

Émis spontanément toutes les ~10 s. L'octet 3 a été vu monter de `0x56` à `0x5d`
(86 → 93) pendant une charge sur USB, ce qui identifie la batterie.

## `0xF3`/`0x01` — joystick analogique

```
02 f3 01 01 ff 01 12 fe 00 00 00 00
            ^^^^^ ^^^^^
            |     +-- Y : int16 little-endian, -511 à +511
            +-------- X : int16 little-endian, -511 à +511
```

Flux continu à ~200 Hz tant que le stick est hors du centre, terminé par une
trame à `0,0` au retour au repos. Amplitude maximale mesurée exactement `±511`
sur les deux axes, soit un codage 10 bits signé.

Ce n'est pas une croix à quatre directions : c'est un vrai analogique, il faudra
seuiller pour en tirer des directions discrètes.

Le sens des axes reste à confirmer sur le boîtier (X+ vers la droite ? Y+ vers
le haut ?).

### Diaphonie mécanique avec la molette zoom

La molette `0x01` est concentrique au joystick : la tourner **secoue le stick**
et produit de fausses déflexions. Mesuré sur 59 déflexions et 749 crans de
molette :

| Amplitude max de la déflexion | Avec crans de molette | Sans |
|---|---|---|
| 100-249 | 6 | 4 |
| 250-449 | 0 | 0 |
| 450-549 | 9 | 40 |

Les poussées réelles atteignent toutes 500-534 (soit un axe à fond, ±511) ; le
parasite plafonne à 250. Une zone morte à **300** sépare les deux populations
sans recouvrement.

Ce tableau vient d'une première capture. La capture complète du dépôt
(`capture.jsonl`, 21,7 min, 150 déflexions, 265 crans de zoom) confirme la zone
morte : les 7 déflexions faibles accompagnées d'un cran de zoom plafonnent à 235,
et aucune des 18 déflexions entre 250 et 449 n'en porte.

Elle montre aussi le sens inverse, plus rare : **11 poussées franches sur 86**
(450 et plus) contiennent un cran de zoom, toujours un seul, isolé, dont 7 au
moment où le stick est à fond. Une molette tournée exprès donne une rafale de
crans, pas un cran seul : c'est donc bien le stick qui entraîne la molette,
environ une poussée sur huit. D'où l'option « Bloquer le zoom » du plugin, qui
ignore la molette zoom tant que le joystick est poussé.

Les molettes `0x02` et `0x04` ne présentent aucune diaphonie.

## `0xF3`/`0x02` — molettes

```
02 f3 02 01 04 01 00 00 00 00 00 00
         ^^ ^^ ^^
         |  |  +-- nombre de crans, toujours 0x01
         |  +----- identifiant de molette : 0x01, 0x02 ou 0x04
         +-------- sens : 0x01 horaire, 0x02 antihoraire
```

Une trame par cran, pas de trame de repos. Les trois molettes et les deux sens
ont été observés.

| Identifiant | Molette |
|---|---|
| `0x01` | molette « zoom » |
| `0x02` | potentiomètre cliquable (son clic est le bit `b7.0` des boutons) |
| `0x04` | molette extérieure (la grande) |

## `0xF3`/`0x03` — boutons

```
02 f3 03 01 00 08 00 00 00 00 00 00
         ^^ ^^^^^^^^^
         |  +-- masque d'état, octets 4 à 7
         +----- groupe de boutons
```

Le repos est `02 f3 03 00 00 00 00 00 00 00 00 00` — groupe et masque à zéro.
Un appui lève un bit, le relâchement le rabaisse. Pas de rebond, pas de
répétition pendant un maintien : le boîtier n'émet qu'aux transitions. Plusieurs
bits peuvent être levés simultanément, le masque est donc un état complet et non
un événement.

### Groupe `0x01`

| Bit | Contrôle |
|---|---|
| `b5.0` … `b5.3` | Left Btn 1 à 4 |
| `b5.4` … `b5.7` | Right Btn 1 à 4 |
| `b6.0` | Cross Left |
| `b6.1` | Cross Up |
| `b6.2` | Cross Right |
| `b6.3` | Cross Down |
| `b4.4` | bouton du dessus |
| `b7.0` | clic du potentiomètre (molette `0x02`) |

L'octet 7 n'est utilisé que par le clic du potentiomètre. Ce clic vise le même
contrôle Companion que la rotation de la même molette, ce qui en fait un
encodeur cliquable.

### Groupe `0x04`

Une seule occurrence capturée, `02 f3 03 04 04 00 00 …`, soit le bit `b4.2`.
Famille de boutons distincte des douze raccourcis — probablement les touches
tactiles A/B/C/D du dessus du joystick, ou les boutons de fonction restants.

## Reste à établir

- sens des axes du joystick (X+ / Y+)
- appui central du joystick : existe-t-il ?
- touches tactiles A/B/C/D : remontent-elles, ou le driver les traite-t-il en interne ?
- les deux boutons de fonction encore non identifiés
- contenu réel du groupe `0x04`
