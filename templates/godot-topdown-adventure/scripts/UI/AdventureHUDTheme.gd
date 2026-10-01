extends RefCounted
## Native adventure UI tokens. The editor keeps its separate forge theme.
const INK := Color("142630")
const PANEL := Color("192e35f2")
const BORDER := Color("428276")
const TEXT := Color("dae2b5")
const MUTED := Color("a1b0ae")
const GOLD := Color("eeb866")
const CYAN := Color("63d8d3")
const HEALTH := Color("82b987")
const DANGER := Color("e07b80")

static func box(color: Color, border: bool = true) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = BORDER
	style.set_border_width_all(1 if border else 0)
	style.set_corner_radius_all(2)
	return style

static func make_theme() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = 14
	theme.set_color("font_color", "Label", TEXT)
	theme.set_color("font_shadow_color", "Label", INK)
	theme.set_constant("shadow_offset_y", "Label", 1)
	theme.set_stylebox("panel", "Panel", box(PANEL))
	theme.set_stylebox("panel", "PanelContainer", box(PANEL))
	theme.set_stylebox("background", "ProgressBar", box(INK))
	theme.set_stylebox("fill", "ProgressBar", box(HEALTH, false))
	return theme
