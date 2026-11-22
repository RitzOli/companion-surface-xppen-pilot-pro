/**
 * Fabrique une page Companion prête à importer, avec un bouton par contrôle
 * du Pilot Pro, nommé et coloré par famille.
 *
 * Plutôt que d'écrire le JSON d'un bouton à la main — la structure en couches
 * de Companion 5 est verbeuse et versionnée — on récupère un export réel
 * depuis Companion et on s'en sert de gabarit. Le fichier produit suit donc
 * exactement le format de la version installée.
 *
 * Usage :
 *   node tools/make-page.mjs [--port 8000] [--page 1] [--out xppen-page.companionconfig]
 */
import { gzipSync, gunzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { ROWS } from '../src/layout.js'

const args = process.argv.slice(2)
const port = takeOption('--port') ?? '8000'
const sourcePage = takeOption('--page') ?? '1'
const outPath = takeOption('--out') ?? 'xppen-page.companionconfig'

/** Une teinte par famille, pour repérer les contrôles d'un coup d'œil. */
const FAMILY_COLORS = {
	left: 0x1f3a5f,
	right: 0x1f5f4f,
	cross: 0x4a2f5f,
	joy: 0x5f3a1f,
	dial: 0x5f1f2f,
	top: 0x3f3f3f,
	combo: 0x2b2b2b,
	double: 0x2b2b2b,
}

/** Ces contrôles reçoivent des rotations : Companion doit l'autoriser sur le bouton. */
const ROTARY = new Set(['dial-zoom', 'dial-pot', 'dial-outer'])

const url = `http://127.0.0.1:${port}/int/export/page/${sourcePage}`
const response = await fetch(url)
if (!response.ok) {
	console.error(`Companion a répondu ${response.status} sur ${url}.`)
	console.error("Vérifie qu'il tourne et que la page demandée existe.")
	process.exit(1)
}

const raw = Buffer.from(await response.arrayBuffer())
const source = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8'))

const template = findFirstButton(source)
if (!template) {
	console.error(`La page ${sourcePage} ne contient aucun bouton à recopier comme gabarit.`)
	console.error('Crée un bouton quelconque dessus, puis relance.')
	process.exit(1)
}

const controls = {}
let count = 0
ROWS.forEach((row, rowIndex) => {
	row.forEach((id, column) => {
		controls[rowIndex] ??= {}
		controls[rowIndex][column] = makeButton(template, id)
		count++
	})
})

const page = {
	version: source.version,
	type: 'page',
	companionBuild: source.companionBuild,
	page: {
		id: source.page.id,
		name: 'XPPen Pilot Pro',
		controls,
		gridSize: { minColumn: 0, maxColumn: ROWS[0].length - 1, minRow: 0, maxRow: ROWS.length - 1 },
	},
	// Aucune action n'est posée sur ces boutons : rien à rattacher à une
	// connexion, donc rien à importer de ce côté.
	instances: {},
	connectionCollections: [],
	oldPageNumber: source.oldPageNumber ?? 1,
	imageLibrary: [],
	imageLibraryCollections: [],
}

writeFileSync(outPath, gzipSync(Buffer.from(JSON.stringify(page), 'utf8')))
console.log(`${count} boutons écrits dans ${outPath}`)
console.log(`Grille ${ROWS[0].length} colonnes × ${ROWS.length} lignes, format ${source.companionBuild}.`)
console.log('\nDans Companion : Import / Export -> Import, choisis ce fichier, et affecte-le à une page.')

// -----------------------------------------------------------------------------

function makeButton(template, controlId) {
	const button = structuredClone(template)
	const family = controlId.split('-')[0]

	for (const layer of button.style.layers) {
		if (layer.type === 'text') {
			layer.text.value = labelFor(controlId)
			layer.text.isExpression = false
			layer.fontsize.value = 14
		}
		if (layer.type === 'box' && layer.color) {
			// Les boutons de sens sont éclaircis pour se distinguer de l'encodeur
			// de la même molette, qui porte la teinte pleine.
			const base = FAMILY_COLORS[family] ?? 0x2b2b2b
			layer.color.value = /-(plus|minus)$/.test(controlId) ? lighten(base) : base
		}
	}

	button.options = { ...button.options, rotaryActions: ROTARY.has(controlId) }
	button.feedbacks = []
	// Page de repérage : les boutons sont nommés et placés, les actions restent
	// à poser par l'utilisateur.
	button.steps = { 0: { action_sets: emptyActionSets(ROTARY.has(controlId)), options: { runWhileHeld: [] } } }

	return button
}

/**
 * « joy-up-left » devient « joy » puis « up-left » sur deux lignes : plus
 * lisible qu'une longue ligne rétrécie. Les boutons de sens des molettes
 * gagnent un signe, bien plus parlant que « dial-zoom-plus » écrit en petit.
 */
function labelFor(controlId) {
	const dial = controlId.match(/^dial-(\w+)-(plus|minus)$/)
	if (dial) return `${dial[1]}\n${dial[2] === 'plus' ? '+' : '−'}`

	const cut = controlId.indexOf('-')
	return cut < 0 ? controlId : `${controlId.slice(0, cut)}\n${controlId.slice(cut + 1)}`
}

/** Éclaircit une couleur RVB en la tirant vers le blanc d'un tiers. */
function lighten(rgb) {
	const mix = (c) => Math.round(c + (255 - c) / 3)
	return (mix((rgb >> 16) & 0xff) << 16) | (mix((rgb >> 8) & 0xff) << 8) | mix(rgb & 0xff)
}

function emptyActionSets(rotary) {
	const sets = { down: [], up: [] }
	if (rotary) {
		sets.rotate_left = []
		sets.rotate_right = []
	}
	return sets
}

function findFirstButton(source) {
	for (const row of Object.values(source.page?.controls ?? {})) {
		for (const control of Object.values(row)) {
			if (control?.style?.layers) return control
		}
	}
	return null
}

function takeOption(name) {
	const i = args.indexOf(name)
	return i >= 0 ? args[i + 1] : undefined
}
