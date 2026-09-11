import { describe, expect, it } from 'vitest';
import { compileStyleBoxTexture } from '../src/ui-stylebox.js';

describe('compileStyleBoxTexture', () => {
  it('emits a 9-slice StyleBoxTexture pointing at the generated PNG', () => {
    const tres = compileStyleBoxTexture({ texturePath: 'assets/ui/hud_frame.png', margin: 6 });
    expect(tres).toContain('[gd_resource type="StyleBoxTexture" format=3]');
    expect(tres).toContain('path="res://assets/ui/hud_frame.png"');
    expect(tres).toContain('texture_margin_left = 6');
    expect(tres).toContain('texture = ExtResource("1_tex")');
  });
});
