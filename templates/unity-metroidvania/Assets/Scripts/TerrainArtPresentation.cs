using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

// Optional art-only settings beside a terrain PNG. Changes require preview restart.
public static class TerrainArtPresentation
{
    [Serializable] private class Settings
    {
        public float x, y, width, height;
        public float pixelsPerUnit = 1f;
        public float borderLeft, borderRight, borderTop, borderBottom;
        public bool smoothFiltering = true;
        public float tintR = 1f, tintG = 1f, tintB = 1f;
    }
    private static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();
    private static readonly Dictionary<string, Color> Tints = new Dictionary<string, Color>();
    private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);

    public static bool Apply(string root, string relativePng, Transform solid, GameplayRect rect, SpriteRenderer fallback)
    {
        var path = Path.GetFullPath(Path.Combine(root, relativePng));
        if (!Cache.TryGetValue(path, out var sprite))
        {
            var settingsPath = Path.ChangeExtension(path, ".presentation.json");
            if (!File.Exists(settingsPath)) { Cache[path] = null; return false; }
            try
            {
                var settings = JsonUtility.FromJson<Settings>(File.ReadAllText(settingsPath));
                if (settings == null) throw new FormatException("Expected terrain settings object");
                foreach (var value in new[] { settings.x, settings.y, settings.width, settings.height, settings.pixelsPerUnit, settings.borderLeft, settings.borderRight, settings.borderTop, settings.borderBottom, settings.tintR, settings.tintG, settings.tintB })
                    if (!Finite(value)) throw new FormatException("Terrain settings must be finite");
                if (settings.tintR < 0 || settings.tintR > 1 || settings.tintG < 0 || settings.tintG > 1 || settings.tintB < 0 || settings.tintB > 1)
                    throw new FormatException("Terrain tint channels must be between zero and one");
                var texture = StreamingArtCache.GetTexture(root, relativePng, settings.smoothFiltering ? FilterMode.Bilinear : FilterMode.Point, TextureWrapMode.Clamp);
                if (texture == null || settings.x < 0 || settings.y < 0 || settings.width <= 0 || settings.height <= 0 || settings.pixelsPerUnit <= 0
                    || settings.x + settings.width > texture.width || settings.y + settings.height > texture.height
                    || settings.borderLeft < 0 || settings.borderRight < 0 || settings.borderLeft + settings.borderRight >= settings.width || settings.borderTop < 0 || settings.borderBottom < 0 || settings.borderTop + settings.borderBottom >= settings.height)
                    throw new FormatException("Terrain crop, scale or borders are out of bounds");
                sprite = Sprite.Create(texture, new Rect(settings.x, settings.y, settings.width, settings.height), new Vector2(.5f, 1f), settings.pixelsPerUnit, 0, SpriteMeshType.FullRect, new Vector4(settings.borderLeft, settings.borderBottom, settings.borderRight, settings.borderTop));
                Cache[path] = sprite;
                Tints[path] = new Color(settings.tintR, settings.tintG, settings.tintB, 1f);
            }
            catch (Exception error)
            {
                Cache[path] = null;
                Debug.LogWarning("Terrain presentation rejected for " + relativePng + ": " + error.Message);
                return false;
            }
        }
        if (sprite == null) return false;
        var face = new GameObject("TerrainArt");
        face.transform.SetParent(solid, false);
        face.transform.localPosition = new Vector3(0, rect.height * .5f, 0);
        var renderer = face.AddComponent<SpriteRenderer>();
        renderer.sortingOrder = fallback.sortingOrder;
        renderer.sprite = sprite;
        renderer.color = Tints[path];
        renderer.drawMode = SpriteDrawMode.Tiled;
        renderer.tileMode = SpriteTileMode.Continuous;
        renderer.size = new Vector2(rect.width, rect.height);
        fallback.enabled = false;
        return true;
    }
}
