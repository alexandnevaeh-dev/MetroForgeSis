using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using UnityEngine;

/// <summary>
/// Decodes StreamingAssets PNGs once. Room loads must not re-read or re-decode the same files.
/// </summary>
public static class StreamingArtCache
{
    private static readonly Dictionary<string, Texture2D> Textures = new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, Sprite> Sprites = new Dictionary<string, Sprite>();
    private static readonly Dictionary<string, Sprite[]> Sheets = new Dictionary<string, Sprite[]>();

    public static float LastPreloadMs { get; private set; }
    public static int LastPreloadCount { get; private set; }
    public static int HitCount { get; private set; }
    public static int MissCount { get; private set; }
    public static float LastMissMs { get; private set; }

    public static Texture2D GetTexture(string streamingRoot, string rel, FilterMode filter, TextureWrapMode wrap)
    {
        if (string.IsNullOrEmpty(rel))
            return null;
        var key = rel.Replace('\\', '/') + "|" + filter + "|" + wrap;
        if (Textures.TryGetValue(key, out var cached) && cached != null)
        {
            HitCount++;
            return cached;
        }
        var path = Path.Combine(streamingRoot, rel.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(path))
            return null;
        MainThreadProbe.ArtMissMarker.Begin();
        var t0 = Time.realtimeSinceStartup;
        var bytes = File.ReadAllBytes(path);
        var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        tex.filterMode = filter;
        tex.wrapMode = wrap;
        tex.name = rel;
        if (!tex.LoadImage(bytes, false))
        {
            Object.Destroy(tex);
            MainThreadProbe.ArtMissMarker.End();
            return null;
        }
        Textures[key] = tex;
        MissCount++;
        LastMissMs = (Time.realtimeSinceStartup - t0) * 1000f;
        MainThreadProbe.ArtMissMarker.End();
        MainThreadProbe.Record("art_miss", LastMissMs, 0, rel);
        return tex;
    }

    public static Sprite GetSprite(string streamingRoot, string rel, Vector2 pivot, float ppu, FilterMode filter)
    {
        var key = rel.Replace('\\', '/') + "|s|" + pivot.x + "," + pivot.y + "|" + ppu + "|" + filter;
        if (Sprites.TryGetValue(key, out var cached) && cached != null)
            return cached;
        var tex = GetTexture(streamingRoot, rel, filter, TextureWrapMode.Clamp);
        if (tex == null)
            return null;
        var sprite = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), pivot, ppu, 0, SpriteMeshType.FullRect);
        Sprites[key] = sprite;
        return sprite;
    }

    public static Sprite GetSliced(string streamingRoot, string rel, Vector4 border)
    {
        var key = rel.Replace('\\', '/') + "|9|" + border.x + "," + border.y + "," + border.z + "," + border.w;
        if (Sprites.TryGetValue(key, out var cached) && cached != null)
            return cached;
        var tex = GetTexture(streamingRoot, rel, FilterMode.Point, TextureWrapMode.Clamp);
        if (tex == null)
            return null;
        var sprite = Sprite.Create(
            tex,
            new Rect(0, 0, tex.width, tex.height),
            new Vector2(0.5f, 0.5f),
            1f,
            0,
            SpriteMeshType.FullRect,
            border);
        Sprites[key] = sprite;
        return sprite;
    }

    public static Sprite[] GetSheet(string streamingRoot, string rel, int frameWidth, int frameHeight, Vector2 pivot, FilterMode filter)
    {
        var key = rel.Replace('\\', '/') + "|sheet|" + frameWidth + "x" + frameHeight + "|" + pivot.x + "," + pivot.y + "|" + filter;
        if (Sheets.TryGetValue(key, out var cached) && cached != null)
            return cached;
        var tex = GetTexture(streamingRoot, rel, filter, TextureWrapMode.Clamp);
        if (tex == null)
            return null;
        var count = Mathf.Max(1, tex.width / Mathf.Max(1, frameWidth));
        var frames = new Sprite[count];
        for (var i = 0; i < count; i++)
        {
            var rect = new Rect(i * frameWidth, tex.height - frameHeight, frameWidth, frameHeight);
            if (rect.xMax > tex.width)
                rect.width = tex.width - rect.x;
            if (rect.y < 0f)
                rect.y = 0f;
            frames[i] = Sprite.Create(tex, rect, pivot, 1f, 0, SpriteMeshType.FullRect);
        }
        Sheets[key] = frames;
        return frames;
    }

    public static float PreloadTree(string streamingRoot, string relativeFolder)
    {
        var dir = Path.Combine(streamingRoot, relativeFolder.Replace('/', Path.DirectorySeparatorChar));
        if (!Directory.Exists(dir))
            return 0f;
        var sw = Stopwatch.StartNew();
        var n = 0;
        foreach (var file in Directory.GetFiles(dir, "*.png", SearchOption.AllDirectories))
        {
            var rel = file.Substring(streamingRoot.Length).TrimStart(Path.DirectorySeparatorChar, '/').Replace('\\', '/');
            var filter = rel.Contains("/backgrounds/") || rel.Contains("/vfx/ambient_steam")
                ? FilterMode.Bilinear
                : FilterMode.Point;
            if (GetTexture(streamingRoot, rel, filter, TextureWrapMode.Clamp) != null)
                n++;
        }
        sw.Stop();
        LastPreloadCount += n;
        LastPreloadMs += (float)sw.Elapsed.TotalMilliseconds;
        return (float)sw.Elapsed.TotalMilliseconds;
    }
}
