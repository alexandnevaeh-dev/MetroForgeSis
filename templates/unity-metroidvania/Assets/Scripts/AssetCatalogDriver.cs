using System.Collections;
using System.IO;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// Labeled diagnostic gallery. Captures go to qa/catalog-captures/ and are not acceptance evidence.
/// Each subject is framed and previous stage sprites are destroyed before the next capture.
/// </summary>
public class AssetCatalogDriver : MonoBehaviour
{
    private IEnumerator Start()
    {
        var game = GetComponent<GameBootstrap>();
        var wait = 0f;
        while ((game == null || game.Pack == null) && wait < 8f)
        {
            wait += Time.unscaledDeltaTime;
            yield return null;
        }
        var qa = Path.Combine(Directory.GetParent(Application.dataPath)?.FullName ?? Application.persistentDataPath, "qa");
        var destDir = Path.Combine(qa, "catalog-captures");
        Directory.CreateDirectory(destDir);
        var root = new GameObject("CatalogStage").transform;
        var cam = Camera.main;
        if (cam != null)
            cam.backgroundColor = new Color(0.05f, 0.04f, 0.05f);

        var streaming = Path.Combine(Application.streamingAssetsPath);
        yield return ShowSheet(root, streaming, "player_idle", "assets/characters/player_idle.png", 128, 128, 4, destDir);
        yield return ShowSheet(root, streaming, "player_walk", "assets/characters/player_walk.png", 64, 64, 4, destDir);
        yield return ShowSheet(root, streaming, "player_run", "assets/characters/player_run.png", 64, 64, 4, destDir);
        yield return ShowSheet(root, streaming, "player_attack", "assets/characters/player_attack.png", 128, 128, 4, destDir);
        yield return ShowSheet(root, streaming, "player_attack_2", "assets/characters/player_attack_2.png", 64, 64, 6, destDir);
        yield return ShowSheet(root, streaming, "player_attack_3", "assets/characters/player_attack_3.png", 64, 64, 6, destDir);
        yield return ShowSheet(root, streaming, "player_fall", "assets/characters/player_fall.png", 64, 64, 3, destDir);
        yield return ShowSheet(root, streaming, "player_dash", "assets/characters/player_dash.png", 64, 64, 3, destDir);
        yield return ShowSheet(root, streaming, "enemy_000_walk", "assets/enemies/enemy_000_walk.png", 64, 64, 4, destDir);
        yield return ShowSheet(root, streaming, "enemy_001_hurt", "assets/enemies/enemy_001_hurt.png", 64, 64, 4, destDir);
        yield return ShowSheet(root, streaming, "catalog_only_boss_idle", "assets/bosses/boss_idle.png", 128, 128, 4, destDir, "CATALOG ONLY — not in gameplay");
        yield return ShowStill(root, streaming, "title_heat_v2", "assets/ui/title.png", destDir);
        yield return ShowStill(root, streaming, "pickup_dash", "assets/props/interact/ability.png", destDir);
        yield return ShowStill(root, streaming, "gate", "assets/props/interact/gate.png", destDir);
        yield return ShowStill(root, streaming, "checkpoint", "assets/props/interact/save_shrine.png", destDir);
        yield return ShowStill(root, streaming, "biome0_far", "assets/backgrounds/biome_0/far.png", destDir);
        yield return ShowStill(root, streaming, "biome1_far", "assets/backgrounds/biome_1/far.png", destDir);
        yield return ShowStill(root, streaming, "biome2_far", "assets/backgrounds/biome_2/far.png", destDir);
        yield return ShowSheet(root, streaming, "ambient_steam", "assets/vfx/ambient_steam.png", 64, 96, 4, destDir);
        yield return ShowSheet(root, streaming, "ambient_molten", "assets/vfx/ambient_molten.png", 160, 48, 4, destDir);

        ClearStage(root);
        if (cam != null)
            cam.orthographicSize = 120f;
        if (game != null)
        {
            game.DiagnosticWarpToRoom("room_000");
            yield return new WaitForSeconds(0.5f);
            yield return CaptureTo(destDir, "diag_biome0_room000");
            game.DiagnosticWarpToRoom("room_003");
            yield return new WaitForSeconds(0.5f);
            yield return CaptureTo(destDir, "diag_biome1_room003");
            game.DiagnosticWarpToRoom("room_006");
            yield return new WaitForSeconds(0.5f);
            yield return CaptureTo(destDir, "diag_biome2_room006");
        }

        File.WriteAllText(Path.Combine(qa, "catalog-result.json"),
            "{\n  \"engine\": \"unity\",\n  \"mode\": \"catalog\",\n  \"note\": \"Diagnostic gallery only. Not acceptance evidence. Each sheet/still is framed on-subject. Boss/NPC remain not implemented in gameplay. biome room shots are diagnostic warps.\"\n}\n");
        Debug.Log("FOUNDRY_CATALOG_OK");
#if UNITY_EDITOR
        EditorApplication.Exit(0);
#else
        Application.Quit(0);
#endif
    }

    private IEnumerator ShowSheet(Transform root, string streaming, string label, string rel, int fw, int fh, int frames, string destDir, string caption = null)
    {
        ClearStage(root);
        var path = Path.Combine(streaming, rel.Replace('/', Path.DirectorySeparatorChar));
        var go = new GameObject(label);
        go.transform.SetParent(root, false);
        go.transform.position = Vector3.zero;
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 20;
        var captionGo = CreateLabel(root, string.IsNullOrEmpty(caption) ? label : caption, 0f, -18f);
        if (File.Exists(path))
        {
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Point;
            tex.LoadImage(File.ReadAllBytes(path), false);
            var sprites = new Sprite[frames];
            for (var i = 0; i < frames; i++)
            {
                var rect = new Rect(i * fw, tex.height - fh, fw, fh);
                if (rect.xMax > tex.width)
                    rect.width = tex.width - rect.x;
                sprites[i] = Sprite.Create(tex, rect, new Vector2(0.5f, 0f), 1f, 0, SpriteMeshType.FullRect);
            }
            var t = 0f;
            var frame = 0;
            while (t < 1.15f)
            {
                sr.sprite = sprites[frame];
                FrameRenderer(Camera.main, sr, captionGo);
                t += Time.deltaTime;
                if (t > (frame + 1) * (1.15f / frames))
                    frame = Mathf.Min(frames - 1, frame + 1);
                yield return null;
            }
        }
        FrameRenderer(Camera.main, sr, captionGo);
        yield return CaptureTo(destDir, label);
        if (go != null)
            Destroy(go);
        if (captionGo != null)
            Destroy(captionGo);
    }

    private IEnumerator ShowStill(Transform root, string streaming, string label, string rel, string destDir)
    {
        ClearStage(root);
        var path = Path.Combine(streaming, rel.Replace('/', Path.DirectorySeparatorChar));
        var go = new GameObject(label);
        go.transform.SetParent(root, false);
        go.transform.position = Vector3.zero;
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 20;
        var captionGo = CreateLabel(root, label, 0f, -18f);
        if (File.Exists(path))
        {
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Point;
            tex.LoadImage(File.ReadAllBytes(path), false);
            var ppu = Mathf.Max(tex.width / 160f, 1f);
            sr.sprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), ppu);
        }
        FrameRenderer(Camera.main, sr, captionGo);
        yield return new WaitForSeconds(0.2f);
        FrameRenderer(Camera.main, sr, captionGo);
        yield return CaptureTo(destDir, label);
        if (go != null)
            Destroy(go);
        if (captionGo != null)
            Destroy(captionGo);
    }

    private static void ClearStage(Transform root)
    {
        if (root == null)
            return;
        for (var i = root.childCount - 1; i >= 0; i--)
            Destroy(root.GetChild(i).gameObject);
    }

    private static void FrameRenderer(Camera cam, SpriteRenderer sr, GameObject caption)
    {
        if (cam == null)
            return;
        if (sr == null || sr.sprite == null)
        {
            cam.orthographicSize = 80f;
            cam.transform.position = new Vector3(0f, 40f, -10f);
            return;
        }
        var b = sr.bounds;
        if (caption != null)
        {
            var tm = caption.GetComponent<TextMesh>();
            if (tm != null)
                caption.transform.position = new Vector3(b.center.x, b.min.y - 12f, 0f);
        }
        var half = Mathf.Max(b.extents.x, b.extents.y) + 18f;
        cam.orthographicSize = Mathf.Max(28f, half);
        cam.transform.position = new Vector3(b.center.x, b.center.y, -10f);
    }

    private static GameObject CreateLabel(Transform root, string label, float x, float y)
    {
        var go = new GameObject("label_" + label);
        go.transform.SetParent(root, false);
        go.transform.position = new Vector3(x, y, 0f);
        var tm = go.AddComponent<TextMesh>();
        tm.text = label;
        tm.fontSize = 32;
        tm.characterSize = 0.35f;
        tm.anchor = TextAnchor.MiddleCenter;
        tm.alignment = TextAlignment.Center;
        tm.color = label.StartsWith("CATALOG ONLY") ? new Color(1f, 0.82f, 0.35f) : Color.white;
        var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        if (font != null)
            tm.font = font;
        var mr = go.GetComponent<MeshRenderer>();
        if (mr != null)
            mr.sortingOrder = 40;
        return go;
    }

    private IEnumerator CaptureTo(string destDir, string name)
    {
        yield return null;
        var cam = Camera.main;
        if (cam == null)
            yield break;
        var w = Mathf.Clamp(cam.pixelWidth, 320, 1920);
        var h = Mathf.Clamp(cam.pixelHeight, 180, 1080);
        var rt = RenderTexture.GetTemporary(w, h, 24, RenderTextureFormat.ARGB32);
        var prev = cam.targetTexture;
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
        tex.Apply();
        cam.targetTexture = prev;
        RenderTexture.active = null;
        RenderTexture.ReleaseTemporary(rt);
        File.WriteAllBytes(Path.Combine(destDir, name + ".png"), tex.EncodeToPNG());
        Destroy(tex);
        Debug.Log("FOUNDRY_CATALOG_CAPTURE " + name);
    }
}
