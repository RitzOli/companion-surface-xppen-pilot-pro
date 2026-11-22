/**
 * Banc d'essai visuel pour cartographier le XPPen Pilot Pro.
 *
 * Ouvre l'interface vendeur, diffuse chaque trame au navigateur en SSE, et
 * sert une page ou l'on voit les contrones s'allumer en temps reel. La page
 * renvoie le nom donne a chaque controle, qui est ecrit dans mapping.json.
 *
 * Usage :
 *   node tools/bench.mjs [--port 8321]
 */
import HID from 'node-hid'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const VID = 0x28bd
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const mappingPath = join(root, 'mapping.json')

const args = process.argv.slice(2)
const port = Number(takeOption('--port') ?? 8321)

// --- HID -------------------------------------------------------------------

const info = HID.devices().find((d) => d.vendorId === VID && (d.usagePage ?? 0) >= 0xff00)
if (!info) {
	console.error('Interface vendeur XPPen introuvable. Le boitier est-il branche ?')
	process.exit(1)
}

const device = new HID.HID(info.path)
const log = createWriteStream(join(root, 'capture.jsonl'), { flags: 'a' })
const t0 = Date.now()
const clients = new Set()

device.on('data', (buf) => {
	const frame = { t: Date.now() - t0, hex: buf.toString('hex') }
	log.write(JSON.stringify({ ...frame, iface: 'MI_2' }) + '\n')
	const payload = `data: ${JSON.stringify(frame)}\n\n`
	for (const res of clients) res.write(payload)
})
device.on('error', (e) => console.error(`HID : ${e.message}`))

// --- Serveur ---------------------------------------------------------------

const server = createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost')

	if (url.pathname === '/events') {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		})
		res.write('retry: 1000\n\n')
		clients.add(res)
		req.on('close', () => clients.delete(res))
		return
	}

	if (url.pathname === '/mapping' && req.method === 'POST') {
		const body = await readBody(req)
		await writeFile(mappingPath, body, 'utf8')
		res.writeHead(204).end()
		console.log(`mapping.json mis a jour (${JSON.parse(body).length ?? '?'} controles)`)
		return
	}

	if (url.pathname === '/mapping') {
		const body = await readFile(mappingPath, 'utf8').catch(() => '[]')
		res.writeHead(200, { 'Content-Type': 'application/json' }).end(body)
		return
	}

	const html = await readFile(join(here, 'bench.html'), 'utf8')
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html)
})

server.listen(port, '127.0.0.1', () => {
	console.log(`Banc d'essai : http://localhost:${port}`)
	console.log(`Interface ${info.path}`)
})

const stop = () => {
	try {
		device.close()
	} catch {}
	server.close()
	log.end(() => process.exit(0))
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = ''
		req.on('data', (c) => (data += c))
		req.on('end', () => resolve(data))
		req.on('error', reject)
	})
}

function takeOption(name) {
	const i = args.indexOf(name)
	return i >= 0 ? args[i + 1] : undefined
}
