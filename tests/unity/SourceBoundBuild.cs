#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

// Validation-only wrapper. Capture every authored build input before compilation,
// reject changes during the build, then bind the native artifacts to that snapshot.
public static class SourceBoundBuild
{
    [Serializable] public class Entry { public string path; public string sha256; }
    [Serializable] public class Binding
    {
        public string schema = "metroforge.unity.source-binding.v1";
        public string unityVersion;
        public string project;
        public string finishedUtc;
        public string buildTarget = "StandaloneWindows64";
        public string scriptingBackend = "Mono";
        public bool inputsUnchanged;
        public Entry[] inputs;
        public Entry[] artifacts;
    }

    private static string Hash(string path)
    {
        using (var stream = File.OpenRead(path))
        using (var hash = SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }

    private static Entry[] Snapshot(string root)
    {
        return new[] { "Assets", "Packages", "ProjectSettings" }
            .SelectMany(folder => Directory.GetFiles(Path.Combine(root, folder), "*", SearchOption.AllDirectories))
            .OrderBy(path => path, StringComparer.Ordinal)
            .Select(path => new Entry { path = path.Substring(root.Length + 1).Replace('\\', '/'), sha256 = Hash(path) })
            .ToArray();
    }

    public static void BuildWindows()
    {
        var root = Directory.GetParent(Application.dataPath).FullName;
        // MetroForgeBuild selects Mono itself. Commit that target configuration
        // before binding the inputs so a fresh project's first build is covered
        // by the same unchanged-input guard as subsequent builds.
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
        AssetDatabase.SaveAssets();
        var before = Snapshot(root);
        MetroForgeBuild.BuildWindows();
        var after = Snapshot(root);
        var unchanged = before.Length == after.Length && before.Zip(after, (a, b) => a.path == b.path && a.sha256 == b.sha256).All(equal => equal);
        var build = Path.Combine(root, "Builds", "Windows");
        var paths = new[] { "ConduitFoundry.exe", "UnityPlayer.dll", "ConduitFoundry_Data/Managed/Assembly-CSharp.dll", "ConduitFoundry_Data/StreamingAssets/gameplay.json" };
        var binding = new Binding
        {
            unityVersion = Application.unityVersion,
            project = root,
            finishedUtc = DateTime.UtcNow.ToString("O"),
            inputsUnchanged = unchanged,
            inputs = before,
            artifacts = paths.Select(path => new Entry { path = path, sha256 = Hash(Path.Combine(build, path)) }).ToArray()
        };
        File.WriteAllText(Path.Combine(build, "source-binding.json"), JsonUtility.ToJson(binding, true));
        if (!unchanged) throw new Exception("Authored Unity inputs changed during build; source binding rejected.");
        Debug.Log("METROFORGE_SOURCE_BOUND_BUILD_PASS inputs=" + before.Length);
    }
}
#endif
