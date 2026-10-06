using UnrealBuildTool;

public class MetroForgeGame : ModuleRules
{
	public MetroForgeGame(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"Paper2D",
			"UMG",
			"Slate",
			"SlateCore",
			"Json",
			"JsonUtilities",
			"ImageWrapper"
		});
	}
}
