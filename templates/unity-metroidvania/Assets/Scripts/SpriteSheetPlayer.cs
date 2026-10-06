using System.Collections.Generic;
using System.IO;
using UnityEngine;

public class SpriteSheetPlayer : MonoBehaviour
{
    [SerializeField] private SpriteRenderer spriteRenderer;

    private readonly Dictionary<string, Sprite[]> _clips = new Dictionary<string, Sprite[]>();
    private readonly Dictionary<string, float> _fps = new Dictionary<string, float>();
    private readonly Dictionary<string, bool> _loop = new Dictionary<string, bool>();
    private readonly Dictionary<string, int> _impactFrames = new Dictionary<string, int>();
    private string _current;
    private float _elapsed;
    private int _frame;
    private bool _facingRight = true;

    public string CurrentClip => _current;
    public int CurrentFrame => _frame;
    public float GroundContactInset { get; private set; }
    public bool HasClip(string clip) => _clips.ContainsKey(clip);
    public float ClipDuration(string clip) => _clips.TryGetValue(clip, out var frames)
        ? frames.Length / ValidFps(_fps.TryGetValue(clip, out var fps) ? fps : 8f) : 0f;
    public float ClipImpactSeconds(string clip) => _clips.TryGetValue(clip, out var frames)
        ? (_impactFrames.TryGetValue(clip, out var frame) ? frame : frames.Length / 2) / ValidFps(_fps[clip]) : 0f;

    // Locomotion can follow physical speed without retiming attacks or jump anticipation.
    private float _playbackSpeed = 1f;
    public float PlaybackSpeed
    {
        get => _playbackSpeed;
        set => _playbackSpeed = float.IsNaN(value) || float.IsInfinity(value)
            ? 1f : Mathf.Clamp(value, 0f, 3f);
    }

    public bool FlipX
    {
        get => !_facingRight;
        set
        {
            _facingRight = !value;
            if (spriteRenderer != null)
                spriteRenderer.flipX = value;
        }
    }

    private void Awake()
    {
        if (spriteRenderer == null)
            spriteRenderer = GetComponent<SpriteRenderer>();
    }

    public void LoadClips(IEnumerable<GameplaySpriteClip> clips, string ownerId, string streamingRoot)
    {
        var t0 = Time.realtimeSinceStartup;
        _clips.Clear();
        _fps.Clear();
        _loop.Clear();
        _impactFrames.Clear();
        _current = null;
        _elapsed = 0f;
        _frame = 0;
        var sourceClips = new List<GameplaySpriteClip>(clips);
        GroundContactInset = MeasureGroundContact(sourceClips, ownerId, streamingRoot);
        foreach (var clip in sourceClips)
        {
            if (clip == null || clip.ownerId != ownerId || string.IsNullOrEmpty(clip.relativePath))
                continue;
            var fw = Mathf.Max(1, clip.frameWidth);
            var fh = Mathf.Max(1, clip.frameHeight);
            var pivot = new Vector2(clip.pivotX, clip.pivotY);
            // Honor explicit authored pivots. Legacy bottom-center strips share the
            // idle boot baseline across all poses, including airborne and attack poses.
            if (clip.pivotY == 0f && GroundContactInset > 0f)
                pivot.y = GroundContactInset * ValidPixelsPerUnit(clip.pixelsPerUnit) / fh;
            var frames = StreamingArtCache.GetSheet(streamingRoot, clip.relativePath, fw, fh, pivot, clip.smoothFiltering ? FilterMode.Bilinear : FilterMode.Point, clip.pixelsPerUnit);
            if (frames == null || frames.Length == 0)
                continue;
            var needed = Mathf.Max(1, clip.frameCount);
            if (frames.Length > needed)
            {
                var trimmed = new Sprite[needed];
                for (var i = 0; i < needed; i++)
                    trimmed[i] = frames[i];
                frames = trimmed;
            }
            _clips[clip.clip] = frames;
            _fps[clip.clip] = ValidFps(clip.fps);
            _loop[clip.clip] = clip.loop;
            _impactFrames[clip.clip] = clip.hasImpactFrame && clip.impactFrame >= 0 && clip.impactFrame < frames.Length
                ? clip.impactFrame : frames.Length / 2;
        }
        var ms = (Time.realtimeSinceStartup - t0) * 1000f;
        if (ms >= 2f)
            MainThreadProbe.Record("load_clips", ms, 0, ownerId);
    }

    private static float ValidPixelsPerUnit(float value) =>
        value > 0f && !float.IsNaN(value) && !float.IsInfinity(value) ? value : 1f;

    private static float MeasureGroundContact(List<GameplaySpriteClip> clips, string ownerId, string root)
    {
        GameplaySpriteClip grounded = null;
        foreach (var clip in clips)
        {
            if (clip == null || clip.ownerId != ownerId || clip.pivotY != 0f) continue;
            if (clip.clip == "idle") { grounded = clip; break; }
            if (clip.clip == "walk") grounded = clip;
        }
        if (grounded == null) return 0f;
        var texture = StreamingArtCache.GetTexture(root, grounded.relativePath,
            grounded.smoothFiltering ? FilterMode.Bilinear : FilterMode.Point, TextureWrapMode.Clamp);
        if (texture == null) return 0f;
        var width = Mathf.Clamp(grounded.frameWidth, 1, texture.width);
        var height = Mathf.Clamp(grounded.frameHeight, 1, texture.height);
        var bottom = texture.height - height;
        var pixels = texture.GetPixels32();
        for (var y = 0; y < height / 2; y++)
            for (var x = 0; x < width; x++)
                if (pixels[(bottom + y) * texture.width + x].a >= 31)
                    return Mathf.Clamp(y / ValidPixelsPerUnit(grounded.pixelsPerUnit), 0f, 6f);
        return 0f;
    }

    public void Play(string clip, bool restart = false)
    {
        if (string.IsNullOrEmpty(clip) || !_clips.ContainsKey(clip))
            clip = FallbackClip(clip);
        if (clip == _current && !restart)
            return;
        // Preserve the contact phase between looping walk/run cycles.
        // Explicit restarts and action clips still begin at frame zero.
        var phase = 0f;
        var preserveGait = !restart && IsGait(_current) && IsGait(clip)
            && _clips.ContainsKey(_current)
            && _loop.TryGetValue(_current, out var previousLoop) && previousLoop
            && _loop.TryGetValue(clip, out var nextLoop) && nextLoop;
        if (preserveGait)
            phase = (_frame + _elapsed * ValidFps(_fps[_current])) / _clips[_current].Length;
        _current = clip;
        _elapsed = 0f;
        _frame = 0;
        if (preserveGait)
        {
            var position = Mathf.Repeat(phase, 1f) * _clips[clip].Length;
            _frame = Mathf.FloorToInt(position);
            _elapsed = (position - _frame) / ValidFps(_fps[clip]);
        }
        ApplyFrame();
    }

    private static bool IsGait(string clip) => clip == "walk" || clip == "run";

    private string FallbackClip(string requested)
    {
        if (requested == "run" && _clips.ContainsKey("walk")) return "walk";
        if (requested == "walk" && _clips.ContainsKey("run")) return "run";
        if (requested == "wall_slide" && _clips.ContainsKey("fall")) return "fall";
        if (requested == "jump_start" && _clips.ContainsKey("jump")) return "jump";
        if (requested == "land" && _clips.ContainsKey("idle")) return "idle";
        if (_clips.ContainsKey("idle")) return "idle";
        foreach (var key in _clips.Keys)
            return key;
        return requested;
    }

    private static float ValidFps(float fps) =>
        fps > 0f && !float.IsNaN(fps) && !float.IsInfinity(fps) ? fps : 8f;

    private void Update() => Advance(Time.deltaTime);

    private void Advance(float deltaTime)
    {
        if (string.IsNullOrEmpty(_current) || !_clips.TryGetValue(_current, out var frames) || frames.Length <= 1)
            return;
        if (deltaTime < 0f || float.IsNaN(deltaTime) || float.IsInfinity(deltaTime))
            return;
        var fps = ValidFps(_fps.TryGetValue(_current, out var value) ? value : 8f);
        // Constant-time advancement also handles long frames and very fast authored clips.
        double frameTime = 1.0 / fps;
        double elapsed = _elapsed + (double)deltaTime * _playbackSpeed;
        double advanced = System.Math.Floor(elapsed / frameTime);
        _elapsed = (float)(elapsed % frameTime);
        if (advanced >= 1)
        {
            bool loop = _loop.TryGetValue(_current, out var looping) && looping;
            _frame = loop ? (int)((_frame + advanced % frames.Length) % frames.Length)
                : (int)System.Math.Min(frames.Length - 1, _frame + advanced);
        }
        ApplyFrame();
    }

    private void ApplyFrame()
    {
        if (spriteRenderer == null || string.IsNullOrEmpty(_current))
            return;
        if (!_clips.TryGetValue(_current, out var frames) || frames.Length == 0)
            return;
        spriteRenderer.sprite = frames[Mathf.Clamp(_frame, 0, frames.Length - 1)];
    }
}
