import HID from 'node-hid'

const VID = 0x28bd // XPPen / Hanvon Ugee

const devices = HID.devices().filter((d) => d.vendorId === VID)

if (devices.length === 0) {
	console.log('Aucun périphérique XPPen (VID 0x28BD) trouvé.')
	console.log('Tous les périphériques HID :')
	for (const d of HID.devices()) {
		console.log(
			`  ${hex(d.vendorId)}:${hex(d.productId)}  usagePage=${hex(d.usagePage)} usage=${hex(d.usage)}  ${d.product ?? ''}`
		)
	}
	process.exit(1)
}

for (const d of devices) {
	console.log('---')
	console.log(`  product      : ${d.product}`)
	console.log(`  manufacturer : ${d.manufacturer}`)
	console.log(`  vid:pid      : ${hex(d.vendorId)}:${hex(d.productId)}`)
	console.log(`  interface    : ${d.interface}`)
	console.log(`  usagePage    : ${hex(d.usagePage)}`)
	console.log(`  usage        : ${hex(d.usage)}`)
	console.log(`  serial       : ${d.serialNumber}`)
	console.log(`  path         : ${d.path}`)
}

function hex(n) {
	return n === undefined ? 'undefined' : '0x' + n.toString(16).padStart(4, '0')
}
