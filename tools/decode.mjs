/**
 * Decodeur d'evenements pour le XPPen Pilot Pro.
 *
 * Relit une capture JSONL et reconstruit les appuis/relaches en suivant les
 * transitions de bits du masque, plutot qu'en decoupant par silence. Chaque
 * appui est nomme par sa position binaire (ex. b5.3 = octet 5, bit 3) et
 * accompagne de sa duree de maintien, ce qui permet de distinguer sans
 * ambiguite un appui bref d'un appui maintenu.
 *
 * Usage :
 *   node tools/decode.mjs [fichier.jsonl] [--since 370000]
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--')) ?? 'capture.jsonl'
const since = Number(takeOption('--since') ?? 0)

// Octets du message 0xf3 qui portent le masque des controles.
const MASK_BYTES = [3, 4, 5, 6, 7, 8, 9, 10, 11]

const frames = readFileSync(file, 'utf8')
	.split('\n')
	.filter(Boolean)
	.map((l) => JSON.parse(l))
	.map((f) => ({ ...f, buf: Buffer.from(f.hex, 'hex') }))
	.filter((f) => f.t >= since && f.buf[1] === 0xf3)

if (frames.length === 0) {
	console.log('Aucun message de controle (0xf3) dans cette plage.')
	process.exit(0)
}

const down = new Map() // nom du bit -> instant de l'appui
let prev = new Map() // nom du bit -> 0/1
let prevT = frames[0].t

for (const f of frames) {
	const cur = new Map()
	for (const i of MASK_BYTES) {
		const v = f.buf[i] ?? 0
		for (let bit = 0; bit < 8; bit++) cur.set(`b${i}.${bit}`, (v >> bit) & 1)
	}

	// L'octet 3 vaut 0x01 des qu'un controle est actif : c'est un drapeau
	// d'activite, pas un bit de controle. On l'ignore dans le suivi.
	cur.set('b3.0', 0)

	const changes = []
	for (const [name, v] of cur) {
		const was = prev.get(name) ?? 0
		if (v === was) continue
		if (v === 1) {
			down.set(name, f.t)
			changes.push(`APPUI   ${name}`)
		} else {
			const held = f.t - (down.get(name) ?? f.t)
			down.delete(name)
			changes.push(`RELACHE ${name}  (tenu ${held}ms)`)
		}
	}

	if (changes.length) {
		const silence = f.t - prevT
		const sep = silence > 2000 ? '\n' : ''
		for (const c of changes) {
			console.log(`${sep}t=${String(f.t).padStart(7)}ms  (+${String(silence).padStart(5)}ms)  ${c}   ${f.hex}`)
		}
		prevT = f.t
	}

	prev = cur
}

const stuck = [...down.keys()]
if (stuck.length) console.log(`\nToujours enfonce en fin de capture : ${stuck.join(', ')}`)

function takeOption(name) {
	const i = args.indexOf(name)
	return i >= 0 ? args[i + 1] : undefined
}
