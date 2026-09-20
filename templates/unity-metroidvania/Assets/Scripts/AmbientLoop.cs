using System.IO;
using UnityEngine;

/// <summary>
/// Decorative looping sprite. No colliders — motion must not imply collision changes.
/// Importer matches SpriteSheetPlayer: LoadImage(bytes, false), Point, Clamp, PPU 1, FullRect.
/// </summary>
public class AmbientLoop : MonoBehaviour
{
    private Sprite[] _frames;
    private float _fps = 8f;
    private float _elapsed;
    private int _index;
    private SpriteRenderer _renderer;
    private Vector3 _origin;
    private Vector3 _bob;
    private bool _bobEnabled;

    public static AmbientLoop Spawn(
        Transform parent,
        string streamingRoot,
        string relativePath,
        Vector3 position,
        int sortingOrder,
        int frameWidth,
        int frameHeight,
        float fps,
        Vector2 pivot,
        Vector3 bob = default)
    {
        var frames = StreamingArtCache.GetSheet(streamingRoot, relativePath, frameWidth, frameHeight, pivot, FilterMode.Point);
        if (frames == null || frames.Length == 0)
            return null;
        var go = new GameObject(Path.GetFileNameWithoutExtension(relativePath));
        go.transform.SetParent(parent, false);
        go.transform.position = position;
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sortingOrder = sortingOrder;
        sr.sprite = frames[0];
        var loop = go.AddComponent<AmbientLoop>();
        loop._frames = frames;
        loop._fps = fps;
        loop._renderer = sr;
        loop._origin = position;
        loop._bob = bob;
        loop._bobEnabled = bob.sqrMagnitude > 0.01f;
        return loop;
    }

    private void Update()
    {
        if (_frames == null || _frames.Length == 0 || _renderer == null)
            return;
        if (_frames.Length > 1)
        {
            _elapsed += Time.deltaTime;
            var frameTime = 1f / Mathf.Max(1f, _fps);
            while (_elapsed >= frameTime)
            {
                _elapsed -= frameTime;
                _index = (_index + 1) % _frames.Length;
            }
            _renderer.sprite = _frames[_index];
        }
        if (_bobEnabled)
        {
            var t = Time.time;
            transform.position = _origin + new Vector3(
                Mathf.Sin(t * _bob.x) * _bob.y,
                Mathf.Sin(t * _bob.z + 1.7f) * _bob.y * 0.35f,
                0f);
        }
    }
}

public class PickupBob : MonoBehaviour
{
    private Vector3 _origin;

    private void Awake()
    {
        _origin = transform.position;
    }

    private void Update()
    {
        transform.position = _origin + new Vector3(0f, Mathf.Sin(Time.time * 3.2f) * 3f, 0f);
    }
}

public class CheckpointPulse : MonoBehaviour
{
    public string AuthoredRoomId;
    private SpriteRenderer _renderer;
    private float _armed;

    private void Awake()
    {
        _renderer = GetComponent<SpriteRenderer>();
    }

    public void Arm()
    {
        _armed = 1.6f;
    }

    private void Update()
    {
        if (_renderer == null)
            return;
        _armed = Mathf.Max(0f, _armed - Time.deltaTime);
        var pulse = 0.78f + 0.22f * Mathf.Sin(Time.time * 4f);
        if (_armed > 0f)
            pulse = 1.15f + 0.35f * Mathf.Sin(Time.time * 14f);
        _renderer.color = new Color(pulse, pulse, Mathf.Min(1.2f, pulse + 0.08f), 1f);
    }
}

public class DriftingMotes : MonoBehaviour
{
    private Transform[] _motes;
    private Vector3[] _origins;
    private float[] _speed;
    private float _height;

    public static void Spawn(Transform parent, Vector3 origin, Sprite sprite, int sortingOrder, float height)
    {
        if (sprite == null)
            return;
        var root = new GameObject("Motes");
        root.transform.SetParent(parent, false);
        root.transform.position = origin;
        var drift = root.AddComponent<DriftingMotes>();
        drift._height = Mathf.Max(48f, height);
        drift._motes = new Transform[5];
        drift._origins = new Vector3[5];
        drift._speed = new float[5];
        for (var i = 0; i < 5; i++)
        {
            var go = new GameObject("Mote_" + i);
            go.transform.SetParent(root.transform, false);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingOrder = sortingOrder;
            sr.color = new Color(1f, 1f, 1f, 0.35f);
            go.transform.localScale = Vector3.one * (0.35f + i * 0.08f);
            drift._origins[i] = new Vector3((i - 2) * 28f, Random.Range(0f, drift._height), 0f);
            go.transform.localPosition = drift._origins[i];
            drift._motes[i] = go.transform;
            drift._speed[i] = 8f + i * 3.5f;
        }
    }

    private void Update()
    {
        if (_motes == null)
            return;
        for (var i = 0; i < _motes.Length; i++)
        {
            var p = _motes[i].localPosition;
            p.y += _speed[i] * Time.deltaTime;
            p.x = _origins[i].x + Mathf.Sin(Time.time * 0.7f + i) * 6f;
            if (p.y > _height)
                p.y = 0f;
            _motes[i].localPosition = p;
        }
    }
}

/// <summary>
/// Soft steam volume: staggered wisps fade in, rise, and dissipate. No opaque rectangular cards.
/// </summary>
public class SteamPlume : MonoBehaviour
{
    private struct Wisp
    {
        public Transform Transform;
        public SpriteRenderer Renderer;
        public float Age;
        public float Life;
        public float Rise;
        public float Drift;
        public float Delay;
        public int Frame;
        public Vector3 Origin;
    }

    private Sprite[] _frames;
    private Wisp[] _wisps;

    public static SteamPlume Spawn(
        Transform parent,
        string streamingRoot,
        string relativePath,
        Vector3 position,
        int sortingOrder,
        int frameWidth,
        int frameHeight)
    {
        var frames = StreamingArtCache.GetSheet(
            streamingRoot, relativePath, frameWidth, frameHeight, new Vector2(0.5f, 0f), FilterMode.Bilinear);
        if (frames == null || frames.Length == 0)
            return null;
        var go = new GameObject("SteamPlume");
        go.transform.SetParent(parent, false);
        go.transform.position = position;
        var plume = go.AddComponent<SteamPlume>();
        plume._frames = frames;
        plume._wisps = new Wisp[8];
        for (var i = 0; i < plume._wisps.Length; i++)
        {
            var wispGo = new GameObject("Wisp_" + i);
            wispGo.transform.SetParent(go.transform, false);
            var sr = wispGo.AddComponent<SpriteRenderer>();
            sr.sprite = frames[i % frames.Length];
            sr.sortingOrder = sortingOrder;
            sr.color = new Color(0.9f, 0.94f, 0.97f, 0f);
            wispGo.transform.localScale = Vector3.one * 0.22f;
            wispGo.transform.localEulerAngles = new Vector3(0f, 0f, (i - 3.5f) * 6f);
            plume._wisps[i] = new Wisp
            {
                Transform = wispGo.transform,
                Renderer = sr,
                Age = 0f,
                Life = 2.2f + (i % 4) * 0.35f,
                Rise = 22f + i * 3.5f,
                Drift = 8f + (i % 3) * 2.2f,
                Delay = i * 0.22f,
                Frame = i % frames.Length,
                Origin = new Vector3((i - 3.5f) * 7f, (i % 3) * 3f, 0f),
            };
        }
        return plume;
    }

    private void Update()
    {
        if (_wisps == null || _frames == null)
            return;
        for (var i = 0; i < _wisps.Length; i++)
        {
            var w = _wisps[i];
            if (w.Transform == null || w.Renderer == null)
                continue;
            w.Age += Time.deltaTime;
            var t = w.Age - w.Delay;
            if (t < 0f)
            {
                w.Renderer.color = new Color(0.9f, 0.94f, 0.97f, 0f);
                _wisps[i] = w;
                continue;
            }
            if (t >= w.Life)
            {
                w.Age = 0f;
                w.Delay = 0.05f;
                w.Frame = (w.Frame + 1) % _frames.Length;
                w.Renderer.sprite = _frames[w.Frame];
                w.Origin = new Vector3(((i * 17) % 11) - 5f, (i % 2) * 4f, 0f);
                w.Renderer.color = new Color(0.9f, 0.94f, 0.97f, 0f);
                _wisps[i] = w;
                continue;
            }
            var u = Mathf.Clamp01(t / w.Life);
            float alpha;
            if (u < 0.28f)
                alpha = Mathf.SmoothStep(0f, 0.34f, u / 0.28f);
            else if (u < 0.58f)
                alpha = 0.34f;
            else
                alpha = Mathf.SmoothStep(0.34f, 0f, (u - 0.58f) / 0.42f);
            var scale = Mathf.Lerp(0.22f, 1.18f, Mathf.SmoothStep(0f, 1f, u));
            w.Transform.localPosition = w.Origin + new Vector3(
                Mathf.Sin((Time.time + i) * 0.7f) * w.Drift * u,
                w.Rise * u,
                0f);
            w.Transform.localScale = Vector3.one * scale;
            w.Renderer.color = new Color(0.9f, 0.94f, 0.97f, alpha);
            _wisps[i] = w;
        }
    }
}
