# Installer la surface Companion XPPen Pilot Pro (version 0.1.0)

Cette surface n'est pas dans la liste officielle de Companion : elle s'installe à la main, une fois par poste.
Elle fait de la console d'édition **XPPen Pilot Pro** (USB) une surface Companion : 13 boutons, 3 molettes dont une
cliquable, le joystick, les combos et les double-clics.

Fichier fourni : `xppen-pilot-pro-0.1.0.tgz`. C'est une **surface**, pas une connexion. Il faut **Bitfocus Companion 5**
(essayé avec la 5.0.2), sous Windows, macOS ou Linux : le pilote USB est dans le paquet.

## 1. Importer le module

**Depuis le PC où tourne Companion** : l'import depuis un autre ordinateur est refusé par défaut.

1. Ouvrir l'interface de Companion (le bouton « Launch GUI » de la fenêtre de Companion).
2. Aller dans **Modules**.
3. Cliquer sur **Import module package**, puis choisir `xppen-pilot-pro-0.1.0.tgz`.
4. **XPPen Pilot Pro** apparaît dans la liste, en version 0.1.0.

## 2. Brancher la console

1. Brancher la Pilot Pro en **USB sur le PC où tourne Companion**.
2. Aller dans **Surfaces** : la **XPPen Pilot Pro** apparaît. Il n'y a pas de connexion à créer.
3. Agrandir la page Companion à **cinq lignes** : la console en utilise cinq, et la dernière resterait hors d'atteinte
   avec les quatre lignes par défaut.

## Bon à savoir

- Le pilote XPPen (`PilotController.exe`) peut rester en marche. Mais il continue d'envoyer ses raccourcis clavier à
  l'application active en même temps que Companion reçoit les appuis. Si ce double effet gêne, quitter le pilote, ou
  lui donner un profil vide.
- La console n'a ni écran ni voyant : rien ne s'affiche dessus, tout part vers Companion.
- La disposition des contrôles sur la page et tous les réglages (joystick, combos, double-clics) sont décrits dans
  l'aide de la surface (bouton « ? » dans Companion). Les réglages eux-mêmes sont dans **Surfaces**, en cliquant sur
  la console.

## Pour l'équipe : refaire le paquet

Dans `D:\dev\xppen` : `npm install`, puis `npx companion-surface-build`. Le fichier sort sous le nom
`xppen-pilot-pro-<version>.tgz`. `build-config.cjs` y ajoute le pilote natif (`node-hid`). Mettre la version dans
`package.json` et `companion/manifest.json` avant.
