using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

/// <summary>Batch EditMode regression for missing-art terrain. Does not replace gameplay tests.</summary>
public static class MetroForgeSolidValidation
{
    [Serializable] private class Result
    {
        public bool passed;
        public int cases;
        public string scope = "Native EditMode missing-art collider and renderer dimensions";
        public string detail;
    }

    public static void Run()
    {
        var result = new Result();
        GameObject owner = null;
        GameObject root = null;
        try
        {
            owner = new GameObject("SolidValidationBootstrap");
            root = new GameObject("SolidValidationRoot");
            var game = owner.AddComponent<GameBootstrap>();
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
            typeof(GameBootstrap).GetField("_worldRoot", flags).SetValue(game, root.transform);
            // A fresh nonexistent path forces the real missing-art branch without changing assets.
            typeof(GameBootstrap).GetField("_streamingRoot", flags).SetValue(game,
                Path.Combine(Application.dataPath, "MissingArt_" + Guid.NewGuid().ToString("N")));
            var create = typeof(GameBootstrap).GetMethod("CreateSolid", flags);
            var sizes = new[] { new Vector2(1600, 32), new Vector2(2560, 32),
                new Vector2(48, 16), new Vector2(160, 16), new Vector2(16, 1216), new Vector2(32, 64) };
            foreach (var size in sizes)
            {
                var rect = new GameplayRect { name = "SolidCase" + result.cases,
                    x = 32, y = 160, width = size.x, height = size.y };
                var room = new GameplayRoom { height = 1280, biomeId = "missing_art" };
                create.Invoke(game, new object[] { rect, room });
                Physics2D.SyncTransforms();
                var solid = root.transform.Find(rect.name);
                if (solid == null) throw new Exception("Solid was not created");
                var collider = solid.GetComponent<BoxCollider2D>();
                var renderer = solid.GetComponent<SpriteRenderer>();
                if (Vector3.Distance(solid.localScale, Vector3.one) > .001f ||
                    Vector2.Distance(collider.bounds.size, size) > .01f ||
                    Vector2.Distance(renderer.bounds.size, size) > .01f)
                    throw new Exception("Missing-art dimensions changed for " + size +
                        "; collider=" + collider.bounds.size + "; renderer=" + renderer.bounds.size);
                if (Vector3.Distance(collider.bounds.center, Coord.RectCenter(rect, room.height)) > .01f)
                    throw new Exception("Collider center changed for " + size);
                result.cases++;
            }
            result.passed = true;
            result.detail = "Authored bounds, centers and identity transforms preserved for floors, balconies and walls";
        }
        catch (Exception error) { result.detail = error.ToString(); Debug.LogException(error); }
        finally
        {
            if (root != null) UnityEngine.Object.DestroyImmediate(root);
            if (owner != null) UnityEngine.Object.DestroyImmediate(owner);
            var output = Path.GetFullPath(Path.Combine(Application.dataPath, "../qa"));
            Directory.CreateDirectory(output);
            File.WriteAllText(Path.Combine(output, "solid-fallback-result.json"), JsonUtility.ToJson(result, true));
        }
        Debug.Log(result.passed ? "METROFORGE_SOLID_VALIDATION_PASS" : "METROFORGE_SOLID_VALIDATION_FAIL");
        EditorApplication.Exit(result.passed ? 0 : 1);
    }
}
