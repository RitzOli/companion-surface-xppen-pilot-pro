/**
 * Vérification de la logique de surface, sans matériel branché.
 *
 * On injecte un faux périphérique HID, on lui fait cracher des trames réelles
 * relevées à la capture, et on vérifie la suite d'appels reçus par un contexte
 * Companion factice.
 *
 * Usage : node tools/selftest.mjs
 */
import { EventEmitter } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { decode, maskToControls } from '../src/protocol.js'
import { PilotProSurface } from '../src/surface.js'

let failures = 0

function check(label, actual, expected) {
	const a = JSON.stringify(actual)
	const e = JSON.stringify(expected)
	if (a === e) {
		console.log(`  ok   ${label}`)
	} else {
		failures++
		console.log(`  ÉCHEC ${label}\n         attendu ${e}\n         obtenu  ${a}`)
	}
}

// --- Décodeur ----------------------------------------------------------------

console.log('\ndécodeur')
const frame = (hex) => Buffer.from(hex, 'hex')

check('statut / batterie', decode(frame('02f201640150000000000000')), { kind: 'status', battery: 100 })
check('bouton left-1', decode(frame('02f303010001000000000000')), { kind: 'buttons', group: 1, mask: 0x0100 })
check('repos', decode(frame('02f303000000000000000000')), { kind: 'buttons', group: 0, mask: 0 })
check('clic potentiomètre', decode(frame('02f303010000000100000000')), { kind: 'buttons', group: 1, mask: 0x01000000 })
check('molette extérieure +', decode(frame('02f302010401000000000000')), { kind: 'dial', dial: 'outer', direction: 1, steps: 1 })
check('molette zoom −', decode(frame('02f302020101000000000000')), { kind: 'dial', dial: 'zoom', direction: -1, steps: 1 })
check('potentiomètre +', decode(frame('02f302010201000000000000')), { kind: 'dial', dial: 'pot', direction: 1, steps: 1 })
check('joystick à fond à droite', decode(frame('02f30101ff010000 00000000'.replace(/ /g, ''))), {
	kind: 'joystick',
	x: 511,
	y: 0,
})
check('joystick à fond en bas', decode(frame('02f30101000001fe00000000')), { kind: 'joystick', x: 0, y: -511 })

check('masque -> contrôles', [...maskToControls(0x0100)], ['left-1'])
check('masque accord left-1+left-2', [...maskToControls(0x0300)].sort(), ['left-1', 'left-2'])
check('masque clic potentiomètre', [...maskToControls(0x01000000)], ['dial-pot'])

// --- Surface -----------------------------------------------------------------

/** Contexte Companion factice : il note simplement ce qu'on lui demande. */
function makeContext() {
	const calls = []
	return {
		calls,
		isLocked: false,
		capabilities: {},
		disconnect: (e) => calls.push(['disconnect', e.message]),
		keyDownById: (id) => calls.push(['down', id]),
		keyUpById: (id) => calls.push(['up', id]),
		keyDownUpById: (id) => calls.push(['downup', id]),
		rotateLeftById: (id) => calls.push(['left', id]),
		rotateRightById: (id) => calls.push(['right', id]),
		changePage: () => {},
		sendVariableValue: (n, v) => calls.push(['var', n, v]),
		logger: { debug() {}, warn() {}, error() {} },
	}
}

async function scenario(label, config, script) {
	const context = makeContext()
	const device = new EventEmitter()
	device.close = () => {}
	const surface = new PilotProSurface('test', 'fake', context, context.logger, () => device)
	await surface.init()
	await surface.updateConfig(config)
	const send = (hex) => device.emit('data', frame(hex))
	await script({ send, context, surface })
	await surface.close()
	return context.calls.filter((c) => c[0] !== 'var')
}

console.log('\nappuis simples')
check(
	'appui puis relâche de left-1',
	await scenario('', {}, async ({ send }) => {
		send('02f303010001000000000000')
		send('02f303000000000000000000')
	}),
	[
		['down', 'left-1'],
		['up', 'left-1'],
	]
)

check(
	'clic du potentiomètre vise le même contrôle que sa rotation',
	await scenario('', {}, async ({ send }) => {
		send('02f303010000000100000000') // clic
		send('02f303000000000000000000')
		send('02f302010201000000000000') // rotation +
	}),
	[
		['down', 'dial-pot'],
		['up', 'dial-pot'],
		['right', 'dial-pot'],
		['downup', 'dial-pot-plus'],
	]
)

console.log('\nmolettes')
check(
	'un cran alimente l’encodeur et le bouton de sens',
	await scenario('', {}, async ({ send }) => {
		send('02f302010401000000000000') // extérieure, horaire
		send('02f302020401000000000000') // extérieure, antihoraire
	}),
	[
		['right', 'dial-outer'],
		['downup', 'dial-outer-plus'],
		['left', 'dial-outer'],
		['downup', 'dial-outer-minus'],
	]
)

console.log('\naccords')
check(
	'left-1+left-2 déclenche combo-1, pas les boutons individuels',
	await scenario('', { combos: 'left-1+left-2', combo_window: 50 }, async ({ send }) => {
		send('02f303010001000000000000') // left-1 seul
		send('02f303010003000000000000') // left-1 + left-2 dans la fenêtre
		await sleep(120)
		send('02f303000000000000000000')
	}),
	[
		['down', 'combo-1'],
		['up', 'combo-1'],
	]
)

check(
	'un membre pressé seul reste un appui normal, après la fenêtre',
	await scenario('', { combos: 'left-1+left-2', combo_window: 40 }, async ({ send }) => {
		send('02f303010001000000000000')
		await sleep(120)
		send('02f303000000000000000000')
	}),
	[
		['down', 'left-1'],
		['up', 'left-1'],
	]
)

check(
	'un bouton hors accord ne subit aucune latence',
	await scenario('', { combos: 'left-1+left-2', combo_window: 400 }, async ({ send }) => {
		send('02f303010008000000000000') // left-4
		send('02f303000000000000000000')
	}),
	[
		['down', 'left-4'],
		['up', 'left-4'],
	]
)

console.log('\ndouble-clic')
check(
	'mode additif : le simple part deux fois, le double en plus',
	await scenario('', { doubles: 'left-1', double_mode: 'additive', double_window: 300 }, async ({ send }) => {
		send('02f303010001000000000000')
		send('02f303000000000000000000')
		send('02f303010001000000000000')
		send('02f303000000000000000000')
	}),
	[
		['down', 'left-1'],
		['up', 'left-1'],
		['down', 'left-1'],
		['downup', 'double-1'],
		['up', 'left-1'],
	]
)

console.log('\nboutons maintenus')
check(
	'un bouton verrouillé bascule au lieu de suivre le doigt',
	await scenario('', { latches: 'left-1' }, async ({ send }) => {
		send('02f303010001000000000000')
		send('02f303000000000000000000') // relâchement physique : sans effet
		send('02f303010001000000000000') // second appui : relâche
		send('02f303000000000000000000')
	}),
	[
		['down', 'left-1'],
		['up', 'left-1'],
	]
)

check(
	'la fermeture relâche un bouton resté verrouillé',
	await scenario('', { latches: 'left-1' }, async ({ send }) => {
		send('02f303010001000000000000')
		send('02f303000000000000000000')
	}),
	[
		['down', 'left-1'],
		['up', 'left-1'], // émis par close()
	]
)

console.log('\njoystick')
check(
	'une secousse sous la zone morte ne déclenche rien',
	await scenario('', { deadzone: 300, joy_hold: 0 }, async ({ send }) => {
		send('02f301017900000000000000') // x=121, l'amplitude typique du parasite
		send('02f301010000000000000000')
	}),
	[]
)

check(
	'une poussée franche déclenche la direction',
	await scenario('', { deadzone: 300, joy_hold: 0 }, async ({ send }) => {
		send('02f30101ff01000000000000') // x=511
		await sleep(20)
		send('02f301010000000000000000')
	}),
	[
		['down', 'joy-right'],
		['up', 'joy-right'],
	]
)

check(
	'le délai de confirmation coupe une poussée trop brève',
	await scenario('', { deadzone: 300, joy_hold: 150 }, async ({ send }) => {
		send('02f30101ff01000000000000')
		await sleep(40)
		send('02f301010000000000000000')
		await sleep(200)
	}),
	[]
)

check(
	'le délai de confirmation laisse passer une poussée tenue',
	await scenario('', { deadzone: 300, joy_hold: 60 }, async ({ send }) => {
		send('02f30101ff01000000000000')
		await sleep(150)
		send('02f301010000000000000000')
	}),
	[
		['down', 'joy-right'],
		['up', 'joy-right'],
	]
)

check(
	'mode 8 directions : une diagonale a son propre contrôle',
	await scenario('', { deadzone: 300, joy_hold: 0, joystick_mode: '8' }, async ({ send }) => {
		send('02f30101ff01ff01 00000000'.replace(/ /g, '')) // x=511, y=511
		await sleep(20)
		send('02f301010000000000000000')
	}),
	[
		['down', 'joy-up-right'],
		['up', 'joy-up-right'],
	]
)

console.log('\ndiaphonie molette zoom / joystick')
check(
	'la zoom est ignorée pendant une déviation du joystick',
	await scenario('', { deadzone: 300, joy_hold: 0, suppress_zoom: true }, async ({ send }) => {
		send('02f30101ff01000000000000') // stick à fond
		send('02f302010101000000000000') // cran de zoom pendant la poussée
		send('02f301010000000000000000')
	}),
	[
		['down', 'joy-right'],
		['up', 'joy-right'],
	]
)

check(
	'la zoom passe quand le joystick est au repos',
	await scenario('', { deadzone: 300, suppress_zoom: true }, async ({ send }) => {
		send('02f302010101000000000000')
	}),
	[
		['right', 'dial-zoom'],
		['downup', 'dial-zoom-plus'],
	]
)

check(
	'les deux autres molettes ne sont jamais filtrées',
	await scenario('', { deadzone: 300, joy_hold: 0, suppress_zoom: true }, async ({ send }) => {
		send('02f30101ff01000000000000')
		send('02f302010401000000000000') // extérieure +
		send('02f302020201000000000000') // potentiomètre −
		send('02f301010000000000000000')
	}),
	[
		['down', 'joy-right'],
		['right', 'dial-outer'],
		['downup', 'dial-outer-plus'],
		['left', 'dial-pot'],
		['downup', 'dial-pot-minus'],
		['up', 'joy-right'],
	]
)

console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests passent.')
process.exit(failures ? 1 : 0)
