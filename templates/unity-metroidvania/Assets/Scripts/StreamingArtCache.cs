using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using UnityEngine;

/// <summary>
/// Decodes StreamingAssets PNGs once. Room loads must not re-read or re-decode the same files.
/// </summary>
public static class StreamingArtCache
{
    public static Sprite[] GetAtlas(string root, string path, GameplaySpriteRegion[] regions, FilterMode filter, float pixelsPerUnit)
    {
        if(regions == null || regions.Length == 0 || float.IsNaN(pixelsPerUnit) || float.IsInfinity(pixelsPerUnit) || pixelsPerUnit <= 0)
            throw new System.ArgumentException("Invalid animation atlas scale or frames");
        var key=new System.Text.StringBuilder(AssetKey(root,path)).Append("|atlas|").Append(filter).Append('|').Append(pixelsPerUnit.ToString(System.Globalization.CultureInfo.InvariantCulture));
        foreach(var r in regions)key.Append('|').Append(JsonUtility.ToJson(r));
        var cacheKey=key.ToString();
        if(Sheets.TryGetValue(cacheKey,out var cached)&&cached!=null)return cached;
        var texture=GetTexture(root,path,filter,TextureWrapMode.Clamp);
        if(texture==null)return null;
        var frames=new Sprite[regions.Length];
        for(int i=0;i<regions.Length;i++)
        {
            var r=regions[i];
            if(r==null || !Finite(r.x)||!Finite(r.y)||!Finite(r.width)||!Finite(r.height)||!Finite(r.pivotX)||!Finite(r.pivotY)
                ||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>texture.width||r.y+r.height>texture.height
                ||r.pivotX<0||r.pivotX>1||r.pivotY<0||r.pivotY>1)
                throw new System.ArgumentException("Invalid animation atlas region");
            frames[i]=Sprite.Create(texture,new Rect(r.x,texture.height-r.y-r.height,r.width,r.height),new Vector2(r.pivotX,r.pivotY),pixelsPerUnit,0,SpriteMeshType.FullRect);
        }
        Sheets[cacheKey]=frames;return frames;
    }
    private static bool Finite(float value)=>!float.IsNaN(value)&&!float.IsInfinity(value);
    private static readonly Dictionary<string, Texture2D> Textures = new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, Sprite> Sprites = new Dictionary<string, Sprite>();
    private static readonly Dictionary<string, Sprite[]> Sheets = new Dictionary<string, Sprite[]>();

    private static string AssetKey(string root, string rel) => Path.GetFullPath(Path.Combine(root, rel.Replace('/', Path.DirectorySeparatorChar))).Replace('\\', '/');

    public static float LastPreloadMs { get; private set; }
    public static int LastPreloadCount { get; private set; }
    public static int HitCount { get; private set; }
    public static int MissCount { get; private set; }
    public static float LastMissMs { get; private set; }

    public static Texture2D GetTexture(string streamingRoot, string rel, FilterMode filter, TextureWrapMode wrap)
    {
        if (string.IsNullOrEmpty(rel))
            return null;
        var key = AssetKey(streamingRoot, rel) + "|" + filter + "|" + wrap;
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
        // Missing JSON scale fields deserialize as zero; preserve the legacy one-pixel world scale.
        if (float.IsNaN(ppu) || float.IsInfinity(ppu) || ppu <= 0f) ppu = 1f;
        var key = AssetKey(streamingRoot, rel) + "|s|" + pivot.x + "," + pivot.y + "|" + ppu + "|" + filter;
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
        var key = AssetKey(streamingRoot, rel) + "|9|" + border.x + "," + border.y + "," + border.z + "," + border.w;
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

    public static Sprite[] GetSheet(string streamingRoot, string rel, int frameWidth, int frameHeight, Vector2 pivot, FilterMode filter, float pixelsPerUnit = 1f)
    {
        var ppu = float.IsNaN(pixelsPerUnit) || float.IsInfinity(pixelsPerUnit) || pixelsPerUnit <= 0f ? 1f : pixelsPerUnit;
        var key = ppu.ToString(System.Globalization.CultureInfo.InvariantCulture) + "|" + AssetKey(streamingRoot, rel) + "|sheet|" + frameWidth + "x" + frameHeight + "|" + pivot.x + "," + pivot.y + "|" + filter;
        if (Sheets.TryGetValue(key, out var cached) && cached != null)
            return cached;
        var tex = GetTexture(streamingRoot, rel, filter, TextureWrapMode.Clamp);
        if (tex == null)
            return null;
        var width = Mathf.Clamp(frameWidth, 1, tex.width);
        var height = Mathf.Clamp(frameHeight, 1, tex.height);
        var columns = Mathf.Max(1, tex.width / width);
        var rows = Mathf.Max(1, tex.height / height);
        var frames = new Sprite[columns * rows];
        // Source image order: left to right, then top to bottom.
        // Horizontal strips retain their original order.
        for (var row = 0; row < rows; row++)
        {
            for (var column = 0; column < columns; column++)
            {
                var rect = new Rect(column * width, tex.height - (row + 1) * height, width, height);
                frames[row * columns + column] = Sprite.Create(tex, rect, pivot, ppu, 0, SpriteMeshType.FullRect);
            }
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
