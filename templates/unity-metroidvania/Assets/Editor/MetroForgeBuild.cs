#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class MetroForgeBuild
{
    public static void BuildMacOS()
    {
        BuildStandalone(BuildTarget.StandaloneOSX, "macOS", "ConduitFoundry.app", "ARM64");
    }

    public static void BuildWindows()
    {
        BuildStandalone(BuildTarget.StandaloneWindows64, "Windows", "ConduitFoundry.exe", "x86_64");
    }

    public static void BuildLinux()
    {
        BuildStandalone(BuildTarget.StandaloneLinux64, "Linux", "ConduitFoundry", "x86_64");
    }

    private static void BuildStandalone(BuildTarget target, string platform, string filename, string architecture)
    {
        var projectRoot = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
        var dest = Path.Combine(projectRoot, "Builds", platform, filename);
        Directory.CreateDirectory(Path.GetDirectoryName(dest) ?? dest);

        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
        if (target == BuildTarget.StandaloneOSX)
            PlayerSettings.SetArchitecture(NamedBuildTarget.Standalone, 2);

        var options = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/World.unity" },
            locationPathName = dest,
            target = target,
            options = BuildOptions.None,
        };
        var report = BuildPipeline.BuildPlayer(options);
        var summary = report.summary;
        var qa = Path.Combine(projectRoot, "qa");
        Directory.CreateDirectory(qa);
        File.WriteAllText(
            Path.Combine(qa, "standalone-build.json"),
            "{\n" +
            "  \"engine\": \"unity\",\n" +
            "  \"result\": \"" + summary.result + "\",\n" +
            "  \"errors\": " + summary.totalErrors + ",\n" +
            "  \"size\": " + summary.totalSize + ",\n" +
            "  \"path\": \"" + dest.Replace("\\", "\\\\") + "\",\n" +
            "  \"scriptingBackend\": \"Mono\",\n" +
            "  \"architecture\": \"" + architecture + "\"\n" +
            "}\n");
        if (summary.result != BuildResult.Succeeded)
            throw new Exception("Unity " + platform + " standalone failed: " + summary.result + " errors=" + summary.totalErrors);
        Debug.Log("FOUNDRY_STANDALONE_OK " + dest);
    }
}
#endif
