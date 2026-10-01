class_name AbilityRegistry
extends RefCounted
## Single source of truth for ability IDs the runtime actually implements.
## Must stay in sync with packages/shared/src/registered-abilities.ts

const SUPPORTED_IDS: Array[String] = [
	"dash",
	"double_jump",
	"wall_slide",
	"wall_jump",
	"air_dash",
	"ground_slam",
	"grapple",
	"swim",
	"phase",
]

static func is_supported(ability_id: String) -> bool:
	return ability_id in SUPPORTED_IDS

static func create_all() -> Array[PlayerAbility]:
	return [
		SwimAbility.new(),
		PhaseAbility.new(),
		DashAbility.new(),
		DoubleJumpAbility.new(),
		WallSlideAbility.new(),
		WallJumpAbility.new(),
		AirDashAbility.new(),
		GroundSlamAbility.new(),
		GrappleAbility.new(),
	]
