using System.Collections.Generic;
using UnityEngine;

/// <summary>Stormglass's painted stone coping follows collision surfaces without scaling physics.</summary>
public static class CastleTerrainPresentation
{
    private static readonly Dictionary<string, Sprite> Caps = new Dictionary<string, Sprite>();
    private static readonly Dictionary<string, Sprite> Masonry = new Dictionary<string, Sprite>();
    private static Sprite _foundation;

    public static bool Apply(string root, Transform solid, GameplayRect rect, SpriteRenderer renderer)
    {
        const string asset = "assets/architecture/stormglass/floor_strip.png";
        if (!Caps.TryGetValue(root, out var cap))
        {
            var texture = StreamingArtCache.GetTexture(root, asset, FilterMode.Point, TextureWrapMode.Clamp);
            if (texture == null) return false;
            var pixels = texture.GetPixels32();
            // Strip transparent sky padding above the stone. Choose a continuous opaque
            // center span so feet meet a readable surface rather than the PNG's empty border.
            var left = texture.width / 10;
            var width = texture.width - left * 2;
            var top = -1;
            for (var y = texture.height - 1; y >= 0; y--)
            {
                var opaque = 0;
                for (var x = left; x < left + width; x++)
                    if (pixels[y * texture.width + x].a >= 240) opaque++;
                if (opaque >= width * 0.98f) { top = y; break; }
            }
            if (top < 0) return false;
            cap = Sprite.Create(texture, new Rect(left, 0, width, top + 1),
                new Vector2(0.5f, 1f), 1f, 0, SpriteMeshType.FullRect);
            Caps[root] = cap;
        }

        // Opaque backing keeps decorative background stairs out of solid collision volumes.
        if (_foundation == null)
            _foundation = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4),
                new Vector2(0.5f, 0.5f), 4f, 0, SpriteMeshType.FullRect);
        renderer.sprite = _foundation;
        renderer.drawMode = SpriteDrawMode.Sliced;
        renderer.size = new Vector2(rect.width, rect.height);
        renderer.color = new Color(0.075f, 0.095f, 0.13f, 1f);

        if (!Masonry.TryGetValue(root, out var masonry))
        {
            var texture = StreamingArtCache.GetTexture(root, "assets/architecture/stormglass/platform.png", FilterMode.Point, TextureWrapMode.Clamp);
            if (texture != null && texture.width >= 384 && texture.height >= 80)
            {
                // Reuse the painted arcade's center span, excluding its end caps and sky padding.
                masonry = Sprite.Create(texture, new Rect(38, 3, 308, 65),
                    new Vector2(0.5f, 1f), 1f, 0, SpriteMeshType.FullRect);
                Masonry[root] = masonry;
            }
        }
        if (masonry != null)
        {
            var support = new GameObject("CastleFoundationMasonry");
            support.transform.SetParent(solid, false);
            support.transform.localPosition = new Vector3(0, rect.height * 0.5f, 0);
            var facade = support.AddComponent<SpriteRenderer>();
            facade.sprite = masonry;
            facade.sortingOrder = renderer.sortingOrder + 1;
            facade.drawMode = SpriteDrawMode.Tiled;
            facade.tileMode = SpriteTileMode.Continuous;
            facade.size = new Vector2(rect.width, rect.height);
            facade.color = new Color(0.72f, 0.77f, 0.85f, 1f);
        }

        var face = new GameObject("CastleStoneCoping");
        face.transform.SetParent(solid, false);
        face.transform.localPosition = new Vector3(0, rect.height * 0.5f, 0);
        var stone = face.AddComponent<SpriteRenderer>();
        stone.sprite = cap;
        stone.sortingOrder = renderer.sortingOrder + 2;
        stone.drawMode = SpriteDrawMode.Tiled;
        stone.tileMode = SpriteTileMode.Continuous;
        stone.size = new Vector2(rect.width, Mathf.Min(rect.height, cap.rect.height));
        return true;
    }
}
