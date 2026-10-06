extends RefCounted
## Pure four-slot compiler. Preview and fired entities consume the same compiled values.
const DEFAULTS := {
	"photon":{"waveform":"photon","operator":"collapse","state":"thermal","trigger":"impact"},
	"tachyon":{"waveform":"tachyon","operator":"superposition","state":"dark_energy","trigger":"probability_threshold"}
}
const OPTIONS := {
	"waveform":["photon","tachyon"], "operator":["collapse","superposition","entanglement","tunneling"],
	"state":["thermal","dark_energy"], "trigger":["impact","probability_threshold"]
}
const LABELS := {"photon":"Photon pulse","tachyon":"Tachyon bolt","collapse":"Collapse","superposition":"Superposition",
	"entanglement":"Entanglement","tunneling":"Tunneling","thermal":"Thermal","dark_energy":"Dark energy",
	"impact":"Impact","probability_threshold":"Probability threshold"}

static func compile(recipe, blueprints: Array = []) -> Dictionary:
	if not recipe is Dictionary or recipe.size() != 4:
		return {"accepted":false,"reason":"Choose exactly four module slots."}
	for slot in OPTIONS:
		if not recipe.has(slot) or not recipe[slot] is String or recipe[slot] not in OPTIONS[slot]:
			return {"accepted":false,"reason":"Unknown %s module." % slot}
	if recipe.operator in ["entanglement","tunneling"] and recipe.operator not in blueprints:
		return {"accepted":false,"reason":"%s blueprint has not been discovered." % LABELS[recipe.operator]}
	if recipe.operator == "superposition":
		if recipe.waveform != "tachyon" or recipe.state != "dark_energy" or recipe.trigger != "probability_threshold":
			return {"accepted":false,"reason":"Superposition needs Tachyon / Dark energy / Probability threshold."}
	elif recipe.trigger != "impact":
		return {"accepted":false,"reason":"Probability threshold belongs to Superposition; use Impact."}
	var photon: bool = recipe.waveform == "photon"
	var definition := {"damage":12.0 if photon else 8.0,"cost":4.0 if photon else 6.0,
		"cooldown":24 if photon else 36,"windup":6 if photon else 9,"life":36 if photon else 48,
		"speed":1200.0 if photon else 1000.0,"slots":3 if recipe.operator == "superposition" else 1,
		"recipe":recipe.duplicate(true)}
	if recipe.operator == "entanglement": definition.cost += 2.0
	if recipe.operator == "tunneling": definition.cost += 3.0
	var behavior: String = "Stabilizes unstable ore for 3 seconds."
	if recipe.operator == "superposition": behavior = "Splits once into 3 bolts in low-density material; children retain remaining life and range."
	elif recipe.operator == "entanglement": behavior = "Hit two living targets to link them for 6 seconds. Direct damage transfers 50% once; death breaks the link."
	elif recipe.operator == "tunneling": behavior = "Crosses at most 32 occupied microcells. Damage loses 20% after each 8; protected material always stops the shot."
	behavior += " Thermal impacts heat mutable material." if recipe.state == "thermal" else " Dark energy passes through fluid without heating it."
	return {"accepted":true,"definition":definition,"behavior":behavior,"label":LABELS[recipe.waveform]+" / "+LABELS[recipe.operator]}
