using UnrealBuildTool;

public class MetroForgeGameEditorTarget : TargetRules
{
	public MetroForgeGameEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
		ExtraModuleNames.Add("MetroForgeGame");
	}
}
