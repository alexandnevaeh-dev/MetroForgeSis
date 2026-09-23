using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class EmberSeal : MonoBehaviour
{
    [SerializeField, Min(0.1f)] private float fullChargeSeconds = 0.8f;
    [SerializeField, Min(0f)] private float cooldownSeconds = 3f;
    private PlayerActor owner;
    private float charge;
    private float cooldown;
    private LineRenderer sealRing;
    private Material sealMaterial;
    private float flashRemaining;
    private float flashRadius;
    private Vector2 flashOrigin;
    public float CurrentRadius => Mathf.Lerp(60f, 150f, ChargeFraction);
    public bool IsCharging { get; private set; }
    public float ChargeFraction => Mathf.Clamp01(charge / Mathf.Max(0.1f, fullChargeSeconds));
    public int LastBurstHits { get; private set; }

    public void Initialize(PlayerActor player) => owner = player;
    private bool CanChannel() => isActiveAndEnabled && owner != null && !owner.Dead && !owner.InputBlocked &&
        owner.Abilities.Contains("ember_seal") && !owner.IsDashing &&
        !(owner.GetComponent<WraithChain>()?.IsPulling ?? false);

    public bool BeginCharge()
    {
        if (!CanChannel() || IsCharging || cooldown > 0f) return false;
        charge = 0f;
        IsCharging = true;
        return true;
    }

    public void Cancel()
    {
        IsCharging = false;
        charge = 0f;
        flashRemaining = 0f;
        if (sealRing != null) sealRing.enabled = false;
    }

    private void LateUpdate()
    {
        if (!IsCharging && flashRemaining <= 0f) return;
        if (sealRing == null)
        {
            var shader = Shader.Find("Sprites/Default");
            if (shader == null) return;
            var visual = new GameObject("Ember Seal Range");
            visual.transform.SetParent(transform, false);
            sealRing = visual.AddComponent<LineRenderer>();
            sealMaterial = new Material(shader);
            sealRing.sharedMaterial = sealMaterial;
            sealRing.useWorldSpace = true;
            sealRing.loop = true;
            sealRing.positionCount = 64;
            sealRing.sortingOrder = 26;
        }
        sealRing.enabled = true;
        var center = IsCharging ? (Vector2)transform.position + new Vector2(0, 24) : flashOrigin;
        var radius = IsCharging ? CurrentRadius : flashRadius;
        var alpha = IsCharging ? Mathf.Lerp(0.25f, 0.85f, ChargeFraction) : flashRemaining / 0.25f;
        sealRing.startColor = sealRing.endColor = new Color(1f, 0.36f, 0.08f, alpha);
        sealRing.widthMultiplier = IsCharging ? 1.5f + ChargeFraction * 1.5f : 5f * alpha;
        for (var i = 0; i < sealRing.positionCount; i++)
        {
            var angle = i * Mathf.PI * 2f / sealRing.positionCount;
            sealRing.SetPosition(i, center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * radius);
        }
        if (!IsCharging)
        {
            flashRemaining = Mathf.Max(0f, flashRemaining - Time.deltaTime);
            if (flashRemaining <= 0f) sealRing.enabled = false;
        }
    }

    private void OnDestroy()
    {
        if (sealMaterial != null) Destroy(sealMaterial);
    }
    private void OnDisable() => Cancel();

    public bool ReleaseCharge()
    {
        if (!IsCharging) return false;
        if (!CanChannel() || charge < 0.2f) { Cancel(); return false; }
        var strength = ChargeFraction;
        Cancel();
        cooldown = Mathf.Max(0f, cooldownSeconds);
        LastBurstHits = 0;
        var origin = (Vector2)owner.transform.position + new Vector2(0, 24);
        var radius = Mathf.Lerp(60f, 150f, strength);
        flashOrigin = origin;
        flashRadius = radius;
        flashRemaining = 0.25f;
        var damaged = new HashSet<EnemyActor>();
        foreach (var collider in Physics2D.OverlapCircleAll(origin, radius))
        {
            var enemy = collider.GetComponentInParent<EnemyActor>();
            if (enemy == null || enemy.Health <= 0f || damaged.Contains(enemy)) continue;
            var point = collider.ClosestPoint(origin);
            var delta = point - origin;
            var blocked = false;
            foreach (var hit in Physics2D.RaycastAll(origin, delta.normalized, delta.magnitude))
                if (!hit.collider.isTrigger && hit.collider.GetComponentInParent<EnemyActor>() == null &&
                    hit.collider.GetComponentInParent<PlayerActor>() != owner)
                { blocked = true; break; }
            if (blocked) continue;
            damaged.Add(enemy);
            enemy.Hurt(Mathf.Lerp(20f, 60f, strength));
            LastBurstHits++;
        }
        return true;
    }

    private void Update()
    {
        cooldown = Mathf.Max(0f, cooldown - Time.deltaTime);
        if (IsCharging && !CanChannel()) Cancel();
        if (IsCharging) charge = Mathf.Min(Mathf.Max(0.1f, fullChargeSeconds), charge + Time.deltaTime);
        var pressed = Input.GetKeyDown(KeyCode.Q);
        var released = Input.GetKeyUp(KeyCode.Q);
#if ENABLE_INPUT_SYSTEM
        pressed |= Keyboard.current != null && Keyboard.current.qKey.wasPressedThisFrame;
        released |= Keyboard.current != null && Keyboard.current.qKey.wasReleasedThisFrame;
#endif
        if (pressed) BeginCharge();
        if (released) ReleaseCharge();
    }
}
