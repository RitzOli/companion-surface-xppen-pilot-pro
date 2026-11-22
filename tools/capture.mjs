/**
 * Capture brute des rapports HID du XPPen Pilot Pro.
 *
 * Ecrit un JSON par ligne dans le fichier de sortie (JSONL), pour etre relu
 * par tools/analyze.mjs.
 *
 * Usage :
 *   node tools/capture.mjs                      -> interface vendeur (0xFF0A) vers capture.jsonl
 *   node tools/capture.mjs --out round2.jsonl   -> autre fichier de sortie
 *   node tools/capture.mjs --all                -> tente toutes les interfaces XPPen
 */
import HID from 'node-hid'
import { createWriteStream } from 'node:fs'

const VID = 0x28bd

const args = process.argv.slice(2)
const outPath = takeOption('--out') ?? 'capture.jsonl'
const wantAll = args.includes('--all')

const all = HID.devices().filter((d) => d.vendorId === VID)
const targets = wantAll ? all : all.filter((d) => (d.usagePage ?? 0) >= 0xff00)

if (targets.length === 0) {
	console.error('Aucune interface XPPen trouvee. Le boitier est-il branche ?')
	process.exit(1)
}

const out = createWriteStream(outPath, { flags: 'a' })
const t0 = Date.now()
const open = []

for (const info of targets) {
	const iface = `MI_${info.interface}`
	try {
		const dev = new HID.HID(info.path)
		dev.on('data', (buf) => {
			out.write(JSON.stringify({ t: Date.now() - t0, iface, hex: buf.toString('hex') }) + '\n')
		})
		dev.on('error', (e) => console.error(`[${iface}] erreur : ${e.message}`))
		open.push(dev)
		console.log(`[${iface}] ouvert (usagePage 0x${(info.usagePage ?? 0).toString(16)})`)
	} catch (e) {
		console.error(`[${iface}] ouverture impossible : ${e.message}`)
	}
}

if (open.length === 0) process.exit(1)

console.log(`\nCapture en cours -> ${outPath}. Ctrl+C pour arreter.\n`)

const stop = () => {
	for (const d of open) {
		try {
			d.close()
		} catch {}
	}
	out.end(() => process.exit(0))
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function takeOption(name) {
	const i = args.indexOf(name)
	return i >= 0 ? args[i + 1] : undefined
}
