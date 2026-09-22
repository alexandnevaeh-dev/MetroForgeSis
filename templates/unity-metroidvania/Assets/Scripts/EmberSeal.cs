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
    public bool IsCharging { get; private set; }
    public float ChargeFraction => Mathf.Clamp01(charge / Mathf.Max(0.1f, fullChargeSeconds));
    public int LastBurstHits { get; private set; }

    public void Initialize(PlayerActor player) => owner = player;
    private bool CanChannel() => isActiveAndEnabled && owner != null && !owner.Dead &&
        owner.Abilities.Contains("ember_seal") && !owner.IsDashing &&
        !(owner.GetComponent<WraithChain>()?.IsPulling ?? false);

    public bool BeginCharge()
    {
        if (!CanChannel() || IsCharging || cooldown > 0f) return false;
        charge = 0f;
        IsCharging = true;
        return true;
    }

    public void Cancel() { IsCharging = false; charge = 0f; }
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
