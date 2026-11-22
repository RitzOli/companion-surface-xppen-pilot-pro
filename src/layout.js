/**
 * Disposition de la surface telle que Companion la présente.
 *
 * La grille n'imite pas la géométrie du boîtier : elle regroupe les contrôles
 * par famille, une ligne par famille, ce qui est bien plus lisible dans
 * l'interface de Companion qu'un calque physique.
 *
 * Cette disposition est figée au moment où la surface s'enregistre, avant que
 * la configuration de l'utilisateur ne soit connue. Les emplacements de combos
 * et de double-clics sont donc déclarés d'avance et affectés ensuite par la
 * config — sans quoi tout changement de réglage décalerait la grille et
 * casserait les affectations de boutons déjà faites par l'utilisateur.
 */

/**
 * Huit colonnes, comme une page Companion (colonnes 0-7). La grille compte
 * cinq lignes, une de plus que la page par défaut : il faut donc agrandir la
 * page à cinq lignes, sinon la dernière reste hors d'atteinte.
 *
 * Toute modification de ROWS décale les contrôles sous les boutons déjà placés
 * par l'utilisateur, sans rien casser de visible — la page continue d'afficher
 * ses anciennes étiquettes en désignant autre chose. Un nouveau contrôle
 * s'ajoute donc en fin de grille, jamais au milieu.
 */
export const COLUMNS = 8

/** Les contrôles, regroupés par famille sur chaque ligne. */
export const ROWS = [
	['left-1', 'left-2', 'left-3', 'left-4', 'right-1', 'right-2', 'right-3', 'right-4'],
	['cross-up', 'cross-down', 'cross-left', 'cross-right', 'top-button', 'dial-zoom', 'dial-pot', 'dial-outer'],
	['dial-zoom-plus', 'dial-zoom-minus', 'dial-pot-plus', 'dial-pot-minus', 'dial-outer-plus', 'dial-outer-minus'],
	['joy-up', 'joy-down', 'joy-left', 'joy-right', 'joy-up-left', 'joy-up-right', 'joy-down-left', 'joy-down-right'],
	['combo-1', 'combo-2', 'combo-3', 'combo-4', 'double-1', 'double-2', 'double-3', 'double-4'],
]

/** Les contrôles physiques réellement présents sur le boîtier. */
export const PHYSICAL_BUTTONS = [
	'left-1',
	'left-2',
	'left-3',
	'left-4',
	'right-1',
	'right-2',
	'right-3',
	'right-4',
	'cross-up',
	'cross-down',
	'cross-left',
	'cross-right',
	'top-button',
]

/** Les quatre directions cardinales du joystick, et les diagonales du mode 8 axes. */
export const JOY_CARDINAL = ['joy-up', 'joy-down', 'joy-left', 'joy-right']
export const JOY_DIAGONAL = ['joy-up-left', 'joy-up-right', 'joy-down-left', 'joy-down-right']

export const COMBO_SLOTS = ['combo-1', 'combo-2', 'combo-3', 'combo-4']
export const DOUBLE_SLOTS = ['double-1', 'double-2', 'double-3', 'double-4']

/** Les molettes en encodeur : un contrôle qui reçoit les rotations gauche et droite. */
export const DIAL_CONTROLS = {
	zoom: 'dial-zoom',
	pot: 'dial-pot',
	outer: 'dial-outer',
}

/**
 * Les mêmes molettes, mais éclatées en un contrôle par sens.
 *
 * Companion modélise une molette comme un encodeur unique, ce qui oblige à
 * activer les actions rotatives sur le bouton et masque les deux sens dans des
 * groupes d'actions repliés. Ces contrôles-ci sont de simples boutons : un cran
 * de molette y déclenche un appui complet. Les deux formes coexistent, chaque
 * cran alimente les deux — libre à l'utilisateur de mapper l'une, l'autre, ou
 * les deux.
 *
 * Index 0 pour l'antihoraire, 1 pour l'horaire.
 */
export const DIAL_DIRECTION_CONTROLS = {
	zoom: ['dial-zoom-minus', 'dial-zoom-plus'],
	pot: ['dial-pot-minus', 'dial-pot-plus'],
	outer: ['dial-outer-minus', 'dial-outer-plus'],
}

/**
 * Construit la définition de disposition attendue par Companion.
 *
 * Le Pilot Pro n'a ni écran, ni LED, ni rétroéclairage : le style par défaut
 * ne demande donc aucun rendu. Companion n'appellera jamais draw() avec autre
 * chose qu'un identifiant de contrôle.
 */
export function buildSurfaceLayout() {
	const controls = {}
	ROWS.forEach((row, rowIndex) => {
		row.forEach((id, column) => {
			controls[id] = { row: rowIndex, column }
		})
	})
	return { stylePresets: { default: {} }, controls }
}

/**
 * Variables remontées par la surface vers Companion.
 *
 * Companion les rend avec son propre sélecteur de variable personnalisée, dont
 * la hauteur ne dépend pas de nous : ni le nom, ni la description, ni leur
 * absence n'y changent quoi que ce soit.
 */
export const TRANSFER_VARIABLES = [
	{ id: 'battery', type: 'input', name: 'Niveau de batterie', description: 'Pourcentage rapporté par le boîtier' },
	{ id: 'joystick_x', type: 'input', name: 'Joystick X', description: 'Axe horizontal brut, -511 à 511' },
	{ id: 'joystick_y', type: 'input', name: 'Joystick Y', description: 'Axe vertical brut, -511 à 511' },
]
