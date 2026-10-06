import type { QuantumAssemblyResult } from '@metroforge/godot';

/** The same gameplay gate applies to editor projects and copied release packages. */
export function quantumRuntimeFailures(
  runtime: Record<string, any>,
  expected: QuantumAssemblyResult & { seed: number; terrainSha256: string; entrySha256: string },
  standalone = false,
): string[] {
  const packageInfo = runtime.generation?.package;
  const checks: Record<string, boolean> = {
    configuration: runtime.generation?.configuration_sha256 === expected.configSha256 && runtime.generation?.seed === expected.seed,
    terrain: runtime.generation?.initial_terrain_sha256 === expected.terrainSha256,
    entry: runtime.generation?.entry_script_sha256 === expected.entrySha256,
    template: packageInfo?.integrity === true && packageInfo.files === expected.files - 2 && packageInfo.template_sha256 === expected.templateSha256,
    standalone: !standalone || (packageInfo?.standalone === true && packageInfo.release === true),
    route: runtime.world?.visited_waypoints === 161 && runtime.full_route?.failure === '',
    extraction: runtime.player_hp > 0 && runtime.progression?.extracted === true && runtime.progression?.secret_found === true,
    contacts: runtime.art?.integrity === true && runtime.art.floorFailures === 0 && runtime.art.floorChecks > 10000 && runtime.art.propChecks === 480 && runtime.art.propFailures === 0,
    branches: ['echo', 'survey'].every(branch => runtime.full_route?.branches?.[branch]?.outbound === true && runtime.full_route?.branches?.[branch]?.returned === true),
    enemies: ['200', '301', '302', '303'].every(id => runtime.enemy_deaths?.[id] && runtime.enemy_active_counts?.[id] > 0),
    boss: ['slam', 'burst', 'roar'].every(attack => runtime.boss_active?.[attack] > 0),
    animations: ['skitter', 'driller', 'wraith', 'golem'].every(kind => ['idle', 'walk', 'run', 'attack', 'hit', 'death'].every(state => runtime.art?.actorStates?.[kind]?.[state] === true)),
  };
  return Object.entries(checks).filter(([, passed]) => !passed).map(([gate]) => gate);
}
