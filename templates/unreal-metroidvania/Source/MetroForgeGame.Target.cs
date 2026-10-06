using UnrealBuildTool;

public class MetroForgeGameTarget : TargetRules
{
	public MetroForgeGameTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
		ExtraModuleNames.Add("MetroForgeGame");
	}
}
