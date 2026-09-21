using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class WraithChain : MonoBehaviour
{
    [SerializeField, Min(1f)] private float range = 480f;
    [SerializeField, Min(1f)] private float speed = 620f;
    [SerializeField, Min(0.05f)] private float maximumPullSeconds = 1.2f;
    private PlayerActor owner;
    private Rigidbody2D body;
    private WraithAnchor target;
    private float remaining;
    private float cooldown;
    private readonly RaycastHit2D[] hits = new RaycastHit2D[8];
    private ContactFilter2D filter;
    private LineRenderer chainVisual;
    private Material chainMaterial;

    private void EnsureVisual()
    {
        if (chainVisual != null) return;
        var shader = Shader.Find("Sprites/Default");
        if (shader == null) return;
        var visual = new GameObject("Wraith Chain Visual");
        visual.transform.SetParent(transform, false);
        chainVisual = visual.AddComponent<LineRenderer>();
        chainMaterial = new Material(shader);
        chainVisual.sharedMaterial = chainMaterial;
        chainVisual.useWorldSpace = true;
        chainVisual.positionCount = 9;
        chainVisual.startWidth = 3f;
        chainVisual.endWidth = 1.2f;
        chainVisual.startColor = new Color(0.95f, 0.55f, 0.2f, 0.95f);
        chainVisual.endColor = new Color(0.45f, 0.85f, 0.8f, 0.8f);
        chainVisual.sortingOrder = 25;
        chainVisual.enabled = false;
    }

    private void LateUpdate()
    {
        if (!IsPulling) return;
        EnsureVisual();
        if (chainVisual == null) return;
        chainVisual.enabled = true;
        var start = transform.position + new Vector3(0f, 24f, 0f);
        var end = target.transform.position;
        var perpendicular = Vector3.Cross((end - start).normalized, Vector3.forward);
        for (var i = 0; i < chainVisual.positionCount; i++)
        {
            var t = i / (float)(chainVisual.positionCount - 1);
            var ripple = Mathf.Sin(t * Mathf.PI * 6f - Time.time * 18f) * Mathf.Sin(t * Mathf.PI) * 2f;
            chainVisual.SetPosition(i, Vector3.Lerp(start, end, t) + perpendicular * ripple);
        }
    }

    private void OnDestroy()
    {
        if (chainMaterial != null) Destroy(chainMaterial);
    }
    public bool IsPulling => target != null;

    public void Initialize(PlayerActor player)
    {
        owner = player;
        body = player.GetComponent<Rigidbody2D>();
        filter = new ContactFilter2D { useTriggers = false };
        filter.SetLayerMask(Physics2D.DefaultRaycastLayers);
    }

    public bool TryAttach(WraithAnchor anchor)
    {
        if (!isActiveAndEnabled || owner == null || owner.Dead || owner.IsDashing || !owner.Abilities.Contains("grapple") ||
            anchor == null || !anchor.isActiveAndEnabled || IsPulling || cooldown > 0f)
            return false;
        var origin = body.position + new Vector2(0f, 24f);
        var delta = (Vector2)anchor.transform.position - origin;
        if (delta.magnitude < 24f || delta.magnitude > range)
            return false;
        foreach (var hit in Physics2D.RaycastAll(origin, delta.normalized, delta.magnitude - 12f))
            if (hit.collider != null && !hit.collider.isTrigger && hit.rigidbody != body)
                return false;
        target = anchor;
        remaining = maximumPullSeconds;
        cooldown = maximumPullSeconds + 0.3f;
        return true;
    }

    public void Cancel()
    {
        target = null;
        remaining = 0f;
        if (chainVisual != null) chainVisual.enabled = false;
    }

    private void OnDisable() => Cancel();

    private void Update()
    {
        cooldown = Mathf.Max(0f, cooldown - Time.deltaTime);
        if (owner == null || owner.Dead) { Cancel(); return; }
        var pressed = Input.GetKeyDown(KeyCode.L);
#if ENABLE_INPUT_SYSTEM
        pressed |= Keyboard.current != null && Keyboard.current.lKey.wasPressedThisFrame;
#endif
        if (!pressed) return;
        if (IsPulling) { Cancel(); return; }
        WraithAnchor nearest = null;
        var best = range * range;
        foreach (var anchor in FindObjectsByType<WraithAnchor>(FindObjectsSortMode.None))
        {
            var distance = ((Vector2)anchor.transform.position - body.position - new Vector2(0f, 24f)).sqrMagnitude;
            if (distance < best) { nearest = anchor; best = distance; }
        }
        if (nearest != null) TryAttach(nearest);
    }

    private void FixedUpdate()
    {
        if (!IsPulling) return;
        if (owner == null || owner.Dead || !target.isActiveAndEnabled) { Cancel(); return; }
        remaining -= Time.fixedDeltaTime;
        var delta = (Vector2)target.transform.position - body.position - new Vector2(0f, 24f);
        if (remaining <= 0f || delta.magnitude <= 16f) { Cancel(); body.linearVelocity *= 0.35f; return; }
        var travel = Mathf.Min(speed * Time.fixedDeltaTime, delta.magnitude - 12f);
        if (body.Cast(delta.normalized, filter, hits, travel) > 0) { Cancel(); body.linearVelocity = Vector2.zero; return; }
        body.linearVelocity = delta.normalized * (travel / Time.fixedDeltaTime);
    }
}
