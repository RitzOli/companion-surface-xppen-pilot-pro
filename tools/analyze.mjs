/**
 * Analyse une capture JSONL produite par tools/capture.mjs.
 *
 * Regroupe les rapports en "evenements" separes par un silence, determine la
 * trame de repos de chaque report ID, et affiche pour chaque evenement les
 * octets/bits qui ont bouge par rapport au repos.
 *
 * Usage :
 *   node tools/analyze.mjs [fichier.jsonl] [--gap 600] [--raw]
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--')) ?? 'capture.jsonl'
const gap = Number(takeOption('--gap') ?? 600)
const showRaw = args.includes('--raw')
const since = Number(takeOption('--since') ?? 0)
// Type de message = octet 1 (0xf2 = statut/batterie, 0xf3 = controles).
const type = takeOption('--type')

const frames = readFileSync(file, 'utf8')
	.split('\n')
	.filter(Boolean)
	.map((l) => JSON.parse(l))
	.map((f) => ({ ...f, buf: Buffer.from(f.hex, 'hex') }))
	.filter((f) => f.t >= since)
	.filter((f) => !type || f.buf[1] === Number(type))

if (frames.length === 0) {
	console.log('Capture vide.')
	process.exit(0)
}

// Trame de repos par report ID : la plus frequente.
const restByReport = new Map()
{
	const counts = new Map()
	for (const f of frames) {
		const key = `${f.buf[0]}|${f.hex}`
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	const best = new Map()
	for (const [key, n] of counts) {
		const [id, hex] = key.split('|')
		if (!best.has(id) || best.get(id).n < n) best.set(id, { hex, n })
	}
	for (const [id, v] of best) restByReport.set(Number(id), Buffer.from(v.hex, 'hex'))
}

console.log(`${frames.length} rapports, seuil de silence ${gap} ms\n`)
console.log('Trames de repos par report ID :')
for (const [id, buf] of restByReport) console.log(`  0x${id.toString(16).padStart(2, '0')} : ${spaced(buf)}`)
console.log()

// Decoupage en evenements.
const events = []
let cur = null
for (const f of frames) {
	if (!cur || f.t - cur.end > gap) {
		cur = { start: f.t, end: f.t, frames: [f] }
		events.push(cur)
	} else {
		cur.end = f.t
		cur.frames.push(f)
	}
}

let n = 0
for (const ev of events) {
	// Un evenement uniquement compose de trames de repos = bruit de fond (heartbeat).
	const meaningful = ev.frames.filter((f) => {
		const rest = restByReport.get(f.buf[0])
		return !rest || !rest.equals(f.buf)
	})
	if (meaningful.length === 0 && !showRaw) continue

	n++
	console.log(`=== EVENEMENT ${n}  t=${ev.start}ms  duree=${ev.end - ev.start}ms  (${ev.frames.length} trames)`)
	for (const f of ev.frames) {
		const rest = restByReport.get(f.buf[0])
		const isRest = rest && rest.equals(f.buf)
		if (isRest && !showRaw) {
			console.log(`   +${String(f.t - ev.start).padStart(5)}ms  [repos]`)
			continue
		}
		console.log(`   +${String(f.t - ev.start).padStart(5)}ms  ${spaced(f.buf)}`)
		if (rest) {
			const diffs = diffBits(rest, f.buf)
			if (diffs.length) console.log(`            ${diffs.join('  ')}`)
		}
	}
	console.log()
}

if (n === 0) console.log('Aucun evenement en dehors des trames de repos. Relance avec --raw pour tout voir.')

function diffBits(rest, cur) {
	const out = []
	const len = Math.max(rest.length, cur.length)
	for (let i = 0; i < len; i++) {
		const a = rest[i] ?? 0
		const b = cur[i] ?? 0
		if (a === b) continue
		const bits = []
		for (let bit = 7; bit >= 0; bit--) {
			const wasSet = (a >> bit) & 1
			const isSet = (b >> bit) & 1
			if (wasSet !== isSet) bits.push(`${isSet ? '+' : '-'}b${bit}`)
		}
		out.push(`o${i}:${hex2(a)}->${hex2(b)}(${bits.join(',')})`)
	}
	return out
}

function spaced(buf) {
	return [...buf].map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

function hex2(v) {
	return v.toString(16).padStart(2, '0')
}

function takeOption(name) {
	const i = args.indexOf(name)
	return i >= 0 ? args[i + 1] : undefined
}
