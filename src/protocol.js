/**
 * Décodage du protocole HID du XPPen Pilot Pro.
 *
 * Aucune E/S ici : la fonction `decode` transforme une trame de 12 octets en
 * événement, et rien d'autre. Voir PROTOCOL.md pour le reverse-engineering.
 */

export const VENDOR_ID = 0x28bd
export const PRODUCT_ID = 0x0203
/** L'interface vendeur, la seule que Windows laisse ouvrir. */
export const USAGE_PAGE = 0xff0a

const TYPE_STATUS = 0xf2
const TYPE_CONTROL = 0xf3

const SUB_JOYSTICK = 0x01
const SUB_DIAL = 0x02
const SUB_BUTTON = 0x03

/** Amplitude maximale d'un axe du joystick, mesurée à la capture. */
export const AXIS_MAX = 511

/**
 * Les trois molettes, dans l'ordre où elles sont empilées autour du joystick.
 * L'identifiant est celui envoyé par le boîtier dans l'octet 4.
 */
export const DIALS = {
	0x01: 'zoom', // concentrique au joystick — celle qui provoque la diaphonie
	0x02: 'pot', // le potentiomètre
	0x04: 'outer', // la grande molette extérieure
}

/**
 * Position d'un bouton dans le masque, exprimée en index de bit à plat :
 * index = (octet - 4) * 8 + bit. Seul le groupe 0x01 est cartographié.
 */
export const BUTTON_BITS = {
	4: 'top-button', // octet 4, bit 4
	8: 'left-1',
	9: 'left-2',
	10: 'left-3',
	11: 'left-4',
	12: 'right-1',
	13: 'right-2',
	14: 'right-3',
	15: 'right-4',
	16: 'cross-left',
	17: 'cross-up',
	18: 'cross-right',
	19: 'cross-down',
	// Octet 7, bit 0 : le clic du potentiomètre. Il vise le même contrôle que
	// sa rotation, ce qui en fait un encodeur cliquable côté Companion.
	24: 'dial-pot',
}

export const BUTTON_GROUP_SHORTCUTS = 0x01

/**
 * Décode une trame brute.
 *
 * @param {Buffer|Uint8Array} buf trame de 12 octets telle que remontée par node-hid
 * @returns {object|null} l'événement, ou null si la trame n'est pas reconnue
 */
export function decode(buf) {
	if (!buf || buf.length < 8) return null

	const type = buf[1]
	const sub = buf[2]

	if (type === TYPE_STATUS) {
		return { kind: 'status', battery: buf[3] }
	}

	if (type !== TYPE_CONTROL) {
		return { kind: 'unknown', hex: hex(buf) }
	}

	switch (sub) {
		case SUB_JOYSTICK:
			return { kind: 'joystick', x: int16(buf, 4), y: int16(buf, 6) }

		case SUB_DIAL: {
			const dial = DIALS[buf[4]]
			if (!dial) return { kind: 'unknown', hex: hex(buf) }
			// Octet 3 : 0x01 horaire, 0x02 antihoraire. Octet 5 : nombre de crans.
			return { kind: 'dial', dial, direction: buf[3] === 0x02 ? -1 : 1, steps: buf[5] || 1 }
		}

		case SUB_BUTTON: {
			// Le masque est un état complet, pas un événement : plusieurs bits
			// peuvent être levés simultanément (appuis en accord).
			const mask = buf[4] | (buf[5] << 8) | (buf[6] << 16) | (buf[7] << 24)
			return { kind: 'buttons', group: buf[3], mask: mask >>> 0 }
		}

		default:
			return { kind: 'unknown', hex: hex(buf) }
	}
}

/**
 * Traduit un masque de boutons en identifiants de contrôle.
 * Les bits non cartographiés sont ignorés silencieusement.
 *
 * @param {number} mask
 * @returns {Set<string>}
 */
export function maskToControls(mask) {
	const out = new Set()
	for (const [bit, id] of Object.entries(BUTTON_BITS)) {
		if (mask & (1 << Number(bit))) out.add(id)
	}
	return out
}

function int16(buf, i) {
	const v = buf[i] | (buf[i + 1] << 8)
	return v & 0x8000 ? v - 0x10000 : v
}

function hex(buf) {
	return Buffer.from(buf).toString('hex')
}
