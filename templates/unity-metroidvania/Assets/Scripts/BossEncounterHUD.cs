using UnityEngine;

/// <summary>A compact encounter display on the existing gameplay canvas.</summary>
public sealed class BossEncounterHUD : MonoBehaviour
{
    private GameBootstrap _game;
    private BossController _boss;
    private GameObject _panel;
    private RectTransform _fill;
    private UnityEngine.UI.Image _fillImage;
    private UnityEngine.UI.Text _name;
    private UnityEngine.UI.Text _phase;
    private float _displayFraction;
    public bool Visible => _panel != null && _panel.activeSelf;
    public float TargetFraction { get; private set; }
    public RectTransform PanelRect => _panel != null ? _panel.GetComponent<RectTransform>() : null;

    public void Initialize(GameBootstrap game, Font font)
    {
        _game = game;
        _panel = new GameObject("BossEncounterPanel", typeof(RectTransform));
        _panel.transform.SetParent(transform, false);
        var panel = _panel.GetComponent<RectTransform>();
        panel.anchorMin = new Vector2(0.18f, 0f);
        panel.anchorMax = new Vector2(0.82f, 0f);
        panel.pivot = new Vector2(0.5f, 0f);
        panel.anchoredPosition = new Vector2(0f, 24f);
        panel.sizeDelta = new Vector2(0f, 58f);
        var back = _panel.AddComponent<UnityEngine.UI.Image>();
        back.color = new Color(0.035f, 0.045f, 0.07f, 0.94f);
        back.raycastTarget = false;
        _name = Label("BossName", font, TextAnchor.MiddleLeft, new Color(0.94f, 0.89f, 0.76f), 18);
        _phase = Label("BossPhase", font, TextAnchor.MiddleRight, new Color(0.35f, 0.9f, 0.93f), 14);
        var track = new GameObject("HealthTrack", typeof(RectTransform));
        track.transform.SetParent(_panel.transform, false);
        var trackRect = track.GetComponent<RectTransform>();
        trackRect.anchorMin = new Vector2(0f, 0f);
        trackRect.anchorMax = new Vector2(1f, 0f);
        trackRect.pivot = new Vector2(0.5f, 0f);
        trackRect.anchoredPosition = new Vector2(0f, 10f);
        trackRect.sizeDelta = new Vector2(-24f, 9f);
        var trackImage = track.AddComponent<UnityEngine.UI.Image>();
        trackImage.color = new Color(0.14f, 0.18f, 0.22f, 1f);
        trackImage.raycastTarget = false;
        var fill = new GameObject("HealthFill", typeof(RectTransform));
        fill.transform.SetParent(track.transform, false);
        _fill = fill.GetComponent<RectTransform>();
        _fill.anchorMin = Vector2.zero;
        _fill.anchorMax = Vector2.one;
        _fill.offsetMin = _fill.offsetMax = Vector2.zero;
        _fillImage = fill.AddComponent<UnityEngine.UI.Image>();
        _fillImage.raycastTarget = false;
        _panel.SetActive(false);
    }

    private UnityEngine.UI.Text Label(string name, Font font, TextAnchor alignment, Color color, int size)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.transform.SetParent(_panel.transform, false);
        var text = go.AddComponent<UnityEngine.UI.Text>();
        text.font = font;
        text.fontSize = size;
        text.alignment = alignment;
        text.color = color;
        text.raycastTarget = false;
        var rect = text.rectTransform;
        rect.anchorMin = new Vector2(0f, 0.4f);
        rect.anchorMax = Vector2.one;
        rect.offsetMin = new Vector2(12f, 0f);
        rect.offsetMax = new Vector2(-12f, -4f);
        // Reserve independent halves so longer authored names cannot collide with the phase.
        if (alignment == TextAnchor.MiddleLeft) rect.anchorMax = new Vector2(0.72f, 1f);
        else rect.anchorMin = new Vector2(0.72f, 0.4f);
        return text;
    }

    private void LateUpdate()
    {
        if (_game == null || _panel == null) return;
        var current = _game.Boss;
        var visible = !_game.OnTitleScreen && !_game.Victory && current != null && current.Health > 0f;
        _panel.SetActive(visible);
        if (!visible) { _boss = null; TargetFraction = 0f; return; }
        TargetFraction = Mathf.Clamp01(current.Health / Mathf.Max(1f, current.MaxHealth));
        if (_boss != current) { _boss = current; _displayFraction = TargetFraction; }
        _displayFraction = Mathf.MoveTowards(_displayFraction, TargetFraction, Time.unscaledDeltaTime * 2f);
        _fill.anchorMax = new Vector2(_displayFraction, 1f);
        _name.text = current.DisplayName;
        var phase = current.Encounter.PhaseNumber;
        _phase.text = phase == 1 ? "Phase I" : phase == 2 ? "Phase II" : "Phase " + phase;
        _fillImage.color = phase > 1 ? new Color(0.94f, 0.59f, 0.24f, 1f) : new Color(0.27f, 0.8f, 0.83f, 1f);
    }
}
