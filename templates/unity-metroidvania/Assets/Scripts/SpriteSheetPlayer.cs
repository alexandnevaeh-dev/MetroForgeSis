using System.Collections.Generic;
using System.IO;
using UnityEngine;

public class SpriteSheetPlayer : MonoBehaviour
{
    [SerializeField] private SpriteRenderer spriteRenderer;

    private readonly Dictionary<string, Sprite[]> _clips = new Dictionary<string, Sprite[]>();
    private readonly Dictionary<string, float> _fps = new Dictionary<string, float>();
    private readonly Dictionary<string, bool> _loop = new Dictionary<string, bool>();
    private string _current;
    private float _elapsed;
    private int _frame;
    private bool _facingRight = true;

    public string CurrentClip => _current;

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
        _current = null;
        _elapsed = 0f;
        _frame = 0;
        foreach (var clip in clips)
        {
            if (clip == null || clip.ownerId != ownerId || string.IsNullOrEmpty(clip.relativePath))
                continue;
            var fw = Mathf.Max(1, clip.frameWidth);
            var fh = Mathf.Max(1, clip.frameHeight);
            var pivot = new Vector2(clip.pivotX, clip.pivotY);
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
            _fps[clip.clip] = clip.fps > 0 ? clip.fps : 8f;
            _loop[clip.clip] = clip.loop;
        }
        var ms = (Time.realtimeSinceStartup - t0) * 1000f;
        if (ms >= 2f)
            MainThreadProbe.Record("load_clips", ms, 0, ownerId);
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
            phase = (_frame + _elapsed * Mathf.Max(1f, _fps[_current])) / _clips[_current].Length;
        _current = clip;
        _elapsed = 0f;
        _frame = 0;
        if (preserveGait)
        {
            var position = Mathf.Repeat(phase, 1f) * _clips[clip].Length;
            _frame = Mathf.FloorToInt(position);
            _elapsed = (position - _frame) / Mathf.Max(1f, _fps[clip]);
        }
        ApplyFrame();
    }

    private static bool IsGait(string clip) => clip == "walk" || clip == "run";

    private string FallbackClip(string requested)
    {
        if (requested == "run" && _clips.ContainsKey("walk")) return "walk";
        if (requested == "walk" && _clips.ContainsKey("run")) return "run";
        if (requested == "jump_start" && _clips.ContainsKey("jump")) return "jump";
        if (requested == "land" && _clips.ContainsKey("idle")) return "idle";
        if (_clips.ContainsKey("idle")) return "idle";
        foreach (var key in _clips.Keys)
            return key;
        return requested;
    }

    private void Update()
    {
        if (string.IsNullOrEmpty(_current) || !_clips.TryGetValue(_current, out var frames) || frames.Length <= 1)
            return;
        var fps = _fps.TryGetValue(_current, out var value) ? value : 8f;
        _elapsed += Time.deltaTime * _playbackSpeed;
        var frameTime = 1f / Mathf.Max(1f, fps);
        while (_elapsed >= frameTime)
        {
            _elapsed -= frameTime;
            _frame++;
            if (_frame >= frames.Length)
                _frame = _loop.TryGetValue(_current, out var loop) && loop ? 0 : frames.Length - 1;
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
