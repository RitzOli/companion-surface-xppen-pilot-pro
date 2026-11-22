/**
 * Instance de surface : traduit les événements du boîtier en appuis Companion.
 *
 * Le Pilot Pro n'a ni écran ni LED, donc rien à dessiner. Tout le travail est
 * dans l'autre sens : décoder, filtrer le bruit mécanique, et synthétiser les
 * gestes que le matériel ne connaît pas (combos, double-clics).
 */
import HID from 'node-hid'
import { decode, maskToControls, BUTTON_GROUP_SHORTCUTS, AXIS_MAX } from './protocol.js'
import { DIAL_CONTROLS, DIAL_DIRECTION_CONTROLS, COMBO_SLOTS, DOUBLE_SLOTS, PHYSICAL_BUTTONS } from './layout.js'

/** Les variables de joystick ne sont poussées qu'à cette cadence : le boîtier émet à ~200 Hz. */
const VARIABLE_INTERVAL = 50

/** Sortie de zone morte plus basse que l'entrée, pour éviter le battement en limite. */
const HYSTERESIS = 0.75

const SECTORS_8 = ['joy-right', 'joy-up-right', 'joy-up', 'joy-up-left', 'joy-left', 'joy-down-left', 'joy-down', 'joy-down-right']
const SECTORS_4 = ['joy-right', 'joy-up', 'joy-left', 'joy-down']

export class PilotProSurface {
	/**
	 * @param openDevice fabrique du périphérique, injectable pour les tests —
	 *   le comportement de cette classe se vérifie sans matériel branché.
	 */
	constructor(surfaceId, devicePath, context, logger, openDevice = (path) => new HID.HID(path)) {
		this.surfaceId = surfaceId
		this.productName = 'XPPen Pilot Pro'

		this.#devicePath = devicePath
		this.#context = context
		this.#log = logger
		this.#openDevice = openDevice
	}

	#devicePath
	#context
	#log
	#openDevice
	#device = null

	/** Contrôles physiquement enfoncés au dernier rapport. */
	#down = new Set()
	/** Contrôles dont l'appui a réellement été transmis à Companion. */
	#emitted = new Set()
	/** Appuis retenus le temps de voir si un combo se forme. id -> timeout */
	#deferred = new Map()
	/** Accords actuellement actifs. */
	#activeCombos = new Set()
	/** Dernier instant d'appui par contrôle, pour le double-clic. */
	#lastPress = new Map()

	#joyX = 0
	#joyY = 0
	/** Direction déduite de la géométrie, avant confirmation. */
	#joyCandidate = null
	/** Direction effectivement transmise à Companion. */
	#joyDirection = null
	#joyHoldTimer = null
	#joyRepeatTimer = null
	#joyBlockedUntil = 0
	#joyVariableTimer = null
	#battery = null

	#config = {
		joystickMode: '4',
		deadzone: 300,
		joyHold: 80,
		joyRepeat: 0,
		joyCooldown: 0,
		suppressZoom: true,
		combos: [],
		comboWindow: 50,
		doubles: [],
		doubleMode: 'additive',
		doubleWindow: 250,
		latches: [],
	}

	async init() {
		this.#device = this.#openDevice(this.#devicePath)
		this.#device.on('data', (buf) => this.#onFrame(buf))
		this.#device.on('error', (err) => {
			this.#log?.error?.(`Pilot Pro : erreur HID — ${err.message}`)
			this.#context.disconnect(err instanceof Error ? err : new Error(String(err)))
		})
	}

	async ready() {
		// Rien à préparer : le boîtier émet dès l'ouverture.
	}

	async close() {
		for (const timer of this.#deferred.values()) clearTimeout(timer)
		this.#deferred.clear()
		// Sans cela, un bouton verrouillé resterait enfoncé côté Companion après
		// le débranchement du boîtier.
		for (const id of this.#emitted) this.#context.keyUpById(id)
		this.#emitted.clear()
		this.#stopJoystickTimers()
		if (this.#joyVariableTimer) clearInterval(this.#joyVariableTimer)
		this.#joyVariableTimer = null
		try {
			this.#device?.close()
		} catch {
			// Le périphérique a pu partir avant nous, ce n'est pas une erreur.
		}
		this.#device = null
	}

	async updateConfig(config) {
		this.#config = {
			joystickMode: config.joystick_mode ?? '4',
			deadzone: clamp(Number(config.deadzone ?? 300), 0, AXIS_MAX),
			joyHold: clamp(Number(config.joy_hold ?? 80), 0, 2000),
			joyRepeat: clamp(Number(config.joy_repeat ?? 0), 0, 5000),
			joyCooldown: clamp(Number(config.joy_cooldown ?? 0), 0, 5000),
			suppressZoom: config.suppress_zoom !== false,
			combos: parseCombos(config.combos, this.#log),
			comboWindow: clamp(Number(config.combo_window ?? 50), 0, 500),
			doubles: parseButtonList(config.doubles, 'double-clic', this.#log, DOUBLE_SLOTS.length),
			doubleMode: config.double_mode ?? 'additive',
			doubleWindow: clamp(Number(config.double_window ?? 250), 50, 1000),
			latches: parseButtonList(config.latches, 'verrouillage', this.#log),
		}

		// Un bouton qui cesse d'être verrouillé ne doit pas rester enfoncé.
		for (const id of [...this.#emitted]) {
			if (this.#down.has(id) || this.#config.latches.includes(id)) continue
			this.#emitted.delete(id)
			this.#context.keyUpById(id)
		}
	}

	// --- Surfaces sans affichage : ces méthodes existent pour l'interface -----

	async setBrightness() {}
	async blank() {}
	async draw() {}
	async showStatus() {}

	// --- Décodage ------------------------------------------------------------

	#onFrame(buf) {
		const event = decode(buf)
		if (!event) return

		switch (event.kind) {
			case 'status':
				if (event.battery !== this.#battery) {
					this.#battery = event.battery
					this.#context.sendVariableValue('battery', event.battery)
				}
				return

			case 'buttons':
				if (event.group !== BUTTON_GROUP_SHORTCUTS && event.mask !== 0) {
					this.#log?.debug?.(`Pilot Pro : groupe de boutons inconnu 0x${event.group.toString(16)}`)
					return
				}
				this.#onButtons(maskToControls(event.mask))
				return

			case 'dial':
				this.#onDial(event)
				return

			case 'joystick':
				this.#onJoystick(event.x, event.y)
				return

			default:
				this.#log?.debug?.(`Pilot Pro : trame non reconnue ${event.hex}`)
		}
	}

	// --- Boutons, combos, double-clics --------------------------------------

	#onButtons(next) {
		const pressed = [...next].filter((id) => !this.#down.has(id))
		const released = [...this.#down].filter((id) => !next.has(id))
		this.#down = next

		// Un combo actif qui perd un membre se relâche, et ses membres ne
		// génèrent pas d'appui individuel au passage.
		for (const combo of this.#config.combos) {
			if (!this.#activeCombos.has(combo.slot)) continue
			if (combo.members.every((id) => next.has(id))) continue
			this.#activeCombos.delete(combo.slot)
			this.#context.keyUpById(combo.slot)
		}

		for (const id of released) this.#release(id)
		for (const id of pressed) this.#press(id)

		this.#checkCombos(next)
	}

	#press(id) {
		// Un membre de combo attend brièvement : peut-être son partenaire arrive.
		if (this.#config.comboWindow > 0 && this.#isComboMember(id)) {
			const timer = setTimeout(() => {
				this.#deferred.delete(id)
				if (this.#down.has(id)) this.#emit(id)
			}, this.#config.comboWindow)
			this.#deferred.set(id, timer)
			return
		}
		this.#emit(id)
	}

	#emit(id) {
		// Bouton verrouillé : l'appui bascule l'état au lieu de le suivre. Le
		// contrôle reste enfoncé côté Companion jusqu'au prochain appui, ce qui
		// permet aux actions « tant que tenu » de courir sans garder le doigt.
		if (this.#config.latches.includes(id)) {
			if (this.#emitted.delete(id)) this.#context.keyUpById(id)
			else {
				this.#emitted.add(id)
				this.#context.keyDownById(id)
			}
			return
		}

		const slot = this.#doubleSlotFor(id)
		const now = Date.now()
		const previous = this.#lastPress.get(id) ?? 0
		const isDouble = slot && now - previous <= this.#config.doubleWindow
		this.#lastPress.set(id, now)

		if (isDouble && this.#config.doubleMode === 'exclusive') {
			// Le premier appui a déjà été transmis ; on ne peut plus le retirer,
			// donc on le referme avant de laisser la place au double.
			if (this.#emitted.delete(id)) this.#context.keyUpById(id)
			this.#context.keyDownUpById(slot)
			return
		}

		this.#emitted.add(id)
		this.#context.keyDownById(id)
		if (isDouble) this.#context.keyDownUpById(slot)
	}

	#release(id) {
		const timer = this.#deferred.get(id)
		if (timer) {
			// Relâché avant la fin de la fenêtre de combo : c'était bien un appui
			// simple, très bref. On le joue en entier plutôt que de le perdre.
			clearTimeout(timer)
			this.#deferred.delete(id)
			this.#emit(id)
		}
		// Un bouton verrouillé garde son état : c'est le prochain appui qui le
		// relâchera, pas ce relâchement-ci.
		if (this.#config.latches.includes(id)) return
		if (!this.#emitted.delete(id)) return
		this.#context.keyUpById(id)
	}

	#checkCombos(next) {
		for (const combo of this.#config.combos) {
			if (this.#activeCombos.has(combo.slot)) continue
			if (!combo.members.every((id) => next.has(id))) continue

			// Le combo l'emporte : on annule les appuis retenus de ses membres,
			// et on referme ceux qui auraient déjà filé.
			for (const id of combo.members) {
				const timer = this.#deferred.get(id)
				if (timer) {
					clearTimeout(timer)
					this.#deferred.delete(id)
				}
				if (this.#emitted.delete(id)) this.#context.keyUpById(id)
			}
			this.#activeCombos.add(combo.slot)
			this.#context.keyDownById(combo.slot)
		}
	}

	#isComboMember(id) {
		return this.#config.combos.some((c) => c.members.includes(id))
	}

	#doubleSlotFor(id) {
		const index = this.#config.doubles.indexOf(id)
		return index >= 0 ? DOUBLE_SLOTS[index] : null
	}

	// --- Molettes -------------------------------------------------------------

	#onDial({ dial, direction, steps }) {
		// La molette zoom est concentrique au joystick : une poussée franche du
		// stick lui arrache des crans parasites. On se fie à la direction
		// géométrique et non à la direction confirmée, car la diaphonie survient
		// pendant la poussée, avant même que le délai de confirmation soit écoulé.
		if (dial === 'zoom' && this.#config.suppressZoom && this.#joyCandidate) return

		const encoder = DIAL_CONTROLS[dial]
		if (!encoder) return
		// Chaque cran alimente les deux formes : l'encodeur unique, et le bouton
		// dédié au sens. Mapper l'une n'empêche pas l'autre.
		const button = DIAL_DIRECTION_CONTROLS[dial][direction > 0 ? 1 : 0]

		for (let i = 0; i < steps; i++) {
			if (direction > 0) this.#context.rotateRightById(encoder)
			else this.#context.rotateLeftById(encoder)
			this.#context.keyDownUpById(button)
		}
	}

	// --- Joystick -------------------------------------------------------------

	#onJoystick(x, y) {
		this.#joyX = x
		this.#joyY = y
		this.#scheduleVariables()

		if (this.#config.joystickMode === 'variables') return

		const candidate = this.#directionOf(x, y)
		if (candidate === this.#joyCandidate) return
		this.#joyCandidate = candidate

		// Toute rupture annule une confirmation en cours : la direction a changé
		// avant d'avoir tenu assez longtemps, donc elle ne comptait pas.
		if (this.#joyHoldTimer) {
			clearTimeout(this.#joyHoldTimer)
			this.#joyHoldTimer = null
		}

		if (this.#joyDirection && this.#joyDirection !== candidate) this.#releaseJoystick()
		if (!candidate) return

		// Le temps mort après un relâchement s'ajoute au délai de confirmation
		// plutôt que de rejeter la direction : sinon un geste enchaîné serait
		// simplement perdu au lieu d'être différé.
		const wait = Math.max(this.#config.joyHold, this.#joyBlockedUntil - Date.now())
		if (wait <= 0) {
			this.#confirmJoystick(candidate)
			return
		}
		this.#joyHoldTimer = setTimeout(() => {
			this.#joyHoldTimer = null
			if (this.#joyCandidate === candidate) this.#confirmJoystick(candidate)
		}, wait)
	}

	/**
	 * Deux comportements, selon que la répétition est active :
	 * sans répétition le contrôle reste enfoncé tant que le stick est dévié ;
	 * avec répétition il émet des appuis complets à cadence régulière, ce qui
	 * convient au défilement d'une timeline.
	 */
	#confirmJoystick(direction) {
		this.#joyDirection = direction
		if (this.#config.joyRepeat > 0) {
			this.#context.keyDownUpById(direction)
			this.#joyRepeatTimer = setInterval(() => this.#context.keyDownUpById(direction), this.#config.joyRepeat)
		} else {
			this.#context.keyDownById(direction)
		}
	}

	#releaseJoystick() {
		const direction = this.#joyDirection
		this.#joyDirection = null
		if (this.#joyRepeatTimer) {
			clearInterval(this.#joyRepeatTimer)
			this.#joyRepeatTimer = null
		} else if (direction) {
			this.#context.keyUpById(direction)
		}
		if (this.#config.joyCooldown > 0) this.#joyBlockedUntil = Date.now() + this.#config.joyCooldown
	}

	#stopJoystickTimers() {
		if (this.#joyHoldTimer) clearTimeout(this.#joyHoldTimer)
		if (this.#joyRepeatTimer) clearInterval(this.#joyRepeatTimer)
		this.#joyHoldTimer = null
		this.#joyRepeatTimer = null
	}

	#directionOf(x, y) {
		const magnitude = Math.hypot(x, y)
		// Le seuil de sortie est plus bas que celui d'entrée : sans cela, un
		// stick maintenu pile sur la limite ferait clignoter l'appui.
		const threshold = this.#joyCandidate ? this.#config.deadzone * HYSTERESIS : this.#config.deadzone
		if (magnitude < threshold) return null

		const sectors = this.#config.joystickMode === '8' ? SECTORS_8 : SECTORS_4
		// Secteurs de 90° en 4 directions, de 45° en 8, mesurés depuis l'axe X
		// dans le sens trigonométrique.
		const step = (2 * Math.PI) / sectors.length
		const index = ((Math.round(Math.atan2(y, x) / step) % sectors.length) + sectors.length) % sectors.length
		return sectors[index]
	}

	#scheduleVariables() {
		if (this.#joyVariableTimer) return
		this.#joyVariableTimer = setInterval(() => {
			this.#context.sendVariableValue('joystick_x', this.#joyX)
			this.#context.sendVariableValue('joystick_y', this.#joyY)
			// Une fois revenu au centre et stable, on arrête de pousser.
			if (this.#joyX === 0 && this.#joyY === 0) {
				clearInterval(this.#joyVariableTimer)
				this.#joyVariableTimer = null
			}
		}, VARIABLE_INTERVAL)
	}
}

// --- Analyse de la configuration ---------------------------------------------

/**
 * « left-1+left-2, right-1+right-4 » -> [{ slot, members }]
 * Les combos en trop sont ignorés : il n'y a que quatre emplacements dans la
 * disposition, et celle-ci est figée à l'enregistrement de la surface.
 */
function parseCombos(raw, log) {
	if (!raw) return []
	const out = []
	for (const chunk of String(raw).split(',')) {
		const members = chunk
			.split('+')
			.map((s) => s.trim())
			.filter(Boolean)
		if (members.length < 2) continue

		const unknown = members.filter((id) => !PHYSICAL_BUTTONS.includes(id))
		if (unknown.length) {
			log?.warn?.(`Pilot Pro : combo ignoré, bouton inconnu — ${unknown.join(', ')}`)
			continue
		}
		if (out.length >= COMBO_SLOTS.length) {
			log?.warn?.(`Pilot Pro : combo ignoré, les ${COMBO_SLOTS.length} emplacements sont pris — ${chunk.trim()}`)
			break
		}
		out.push({ slot: COMBO_SLOTS[out.length], members })
	}
	// Les combos les plus larges d'abord : « 1+2+3 » doit l'emporter sur « 1+2 ».
	return out.sort((a, b) => b.members.length - a.members.length)
}

/**
 * « left-1, right-1 » -> ['left-1', 'right-1'], en écartant les inconnus.
 * @param {number} [limit] nombre d'entrées retenues, pour les listes adossées à des emplacements
 */
function parseButtonList(raw, label, log, limit = Infinity) {
	if (!raw) return []
	const out = []
	for (const chunk of String(raw).split(',')) {
		const id = chunk.trim()
		if (!id) continue
		if (!PHYSICAL_BUTTONS.includes(id)) {
			log?.warn?.(`Pilot Pro : ${label} ignoré, bouton inconnu — ${id}`)
			continue
		}
		if (out.length >= limit) {
			log?.warn?.(`Pilot Pro : ${label} ignoré, les ${limit} emplacements sont pris — ${id}`)
			break
		}
		out.push(id)
	}
	return out
}

function clamp(v, min, max) {
	if (!Number.isFinite(v)) return min
	return Math.min(max, Math.max(min, v))
}
