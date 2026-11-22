/**
 * Plugin de surface Companion pour le XPPen Pilot Pro.
 *
 * Le boîtier est un périphérique d'entrée pur : il n'affiche rien et n'a aucune
 * LED. Ce plugin l'expose donc comme une surface dont tous les contrôles
 * remontent vers Companion, sans jamais rien redescendre.
 */
import { createModuleLogger } from '@companion-surface/base'
import { VENDOR_ID, PRODUCT_ID, USAGE_PAGE, AXIS_MAX } from './protocol.js'
import { buildSurfaceLayout, TRANSFER_VARIABLES, PHYSICAL_BUTTONS } from './layout.js'
import { PilotProSurface } from './surface.js'

const BUTTON_LIST = PHYSICAL_BUTTONS.join(', ')

const configFields = [
	{
		id: 'info',
		type: 'static-text',
		label: 'Noms des boutons',
		value: BUTTON_LIST,
	},

	{
		id: 'joystick_mode',
		type: 'dropdown',
		label: 'Joystick',
		default: '4',
		choices: [
			{ id: '4', label: '4 directions' },
			{ id: '8', label: '8 directions, diagonales comprises' },
			{ id: 'variables', label: 'Variables seules, aucun appui' },
		],
		tooltip: 'En mode variables, le joystick n’appuie sur aucun bouton : seules joystick_x et joystick_y sont envoyées.',
	},
	{
		id: 'deadzone',
		type: 'number',
		label: 'Zone morte',
		default: 300,
		min: 0,
		max: AXIS_MAX,
		description: `Sur ${AXIS_MAX}. Sous 250, tourner la molette zoom déclenchera le joystick.`,
	},
	{
		id: 'joy_hold',
		type: 'number',
		label: 'Confirmation (ms)',
		default: 80,
		min: 0,
		max: 2000,
		description: 'La direction doit tenir ce temps avant de compter. 0 : immédiat.',
	},
	{
		id: 'joy_repeat',
		type: 'number',
		label: 'Répétition (ms)',
		default: 0,
		min: 0,
		max: 5000,
		description: '0 : le bouton reste enfoncé. Au-dessus : appuis répétés à ce rythme.',
	},
	{
		id: 'joy_cooldown',
		type: 'number',
		label: 'Temps mort (ms)',
		default: 0,
		min: 0,
		max: 5000,
		description: 'Après un relâchement, retarde la direction suivante : évite les rebonds du ressort.',
	},
	{
		id: 'suppress_zoom',
		type: 'checkbox',
		label: 'Bloquer le zoom',
		default: true,
		description: 'Ignore la molette zoom tant que le joystick est poussé : elle entoure le joystick et tourne toute seule.',
	},

	{
		id: 'latches',
		type: 'textinput',
		label: 'Boutons maintenus',
		default: '',
		placeholder: 'left-1, top-button',
		description: 'Exemple : left-1, top-button — un appui les enfonce, l’appui suivant les relâche.',
	},

	{
		id: 'combos',
		type: 'textinput',
		label: 'Combos',
		default: '',
		placeholder: 'left-1+left-2, left-3+left-4',
		description: 'Exemple : left-1+left-2, left-3+left-4 — quatre maximum, affectés dans l’ordre à combo-1 … combo-4.',
	},
	{
		id: 'combo_window',
		type: 'number',
		label: 'Combo : délai (ms)',
		default: 50,
		min: 0,
		max: 500,
		description: 'Écart accepté entre les deux doigts. Ne retarde que les boutons cités.',
	},

	{
		id: 'doubles',
		type: 'textinput',
		label: 'Double-clic',
		default: '',
		placeholder: 'left-1, right-1',
		description: 'Exemple : left-1, right-1 — quatre maximum, affectés dans l’ordre à double-1 … double-4.',
	},
	{
		id: 'double_mode',
		type: 'dropdown',
		label: 'Double : mode',
		default: 'additive',
		choices: [
			{ id: 'additive', label: 'Additif — le simple part aussi' },
			{ id: 'exclusive', label: 'Exclusif — le double seul' },
		],
		isVisibleExpression: '$(options:doubles) != ""',
	},
	{
		id: 'double_window',
		type: 'number',
		label: 'Double : délai (ms)',
		default: 250,
		min: 50,
		max: 1000,
		isVisibleExpression: '$(options:doubles) != ""',
	},
]

/** @type {import('@companion-surface/base').SurfacePlugin<{ path: string }>} */
export default {
	async init() {},

	async destroy() {},

	checkSupportsHidDevice(device) {
		if (device.vendorId !== VENDOR_ID || device.productId !== PRODUCT_ID) return null
		// Le boîtier expose aussi une souris, un clavier et un digitizer ; seule
		// l'interface vendeur porte les données brutes, et c'est la seule que
		// Windows accepte d'ouvrir.
		if (device.usagePage !== USAGE_PAGE) return null

		return {
			surfaceId: `xppen-pilot-pro:${device.serialNumber?.trim() || 'usb'}`,
			// Le boîtier renvoie un numéro de série vide, rempli d'espaces.
			surfaceIdIsNotUnique: !device.serialNumber?.trim(),
			description: 'XPPen Pilot Pro',
			pluginInfo: { path: device.path },
		}
	},

	async openSurface(surfaceId, pluginInfo, context) {
		const surface = new PilotProSurface(surfaceId, pluginInfo.path, context, createModuleLogger(surfaceId))
		return {
			surface,
			registerProps: {
				brightness: false,
				surfaceLayout: buildSurfaceLayout(),
				transferVariables: TRANSFER_VARIABLES,
				// Aucun marquage sur les boutons : une saisie de code à l'aveugle
				// serait inutilisable, on laisse Companion gérer le déverrouillage.
				pincodeMap: null,
				location: null,
				configFields,
			},
		}
	},
}
