using UnityEngine;

[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(BoxCollider2D))]
public class EnemyActor : MonoBehaviour
{
    public string EnemyId;
    public System.Action<EnemyActor> OnDefeated;
    public float Health = 30f;
    public float Damage = 8f;
    public float WalkSpeed = 40f;
    public static int HurtCallCount;
    public string CurrentClip => _animator != null ? _animator.CurrentClip : "";
    public bool Dead => _dead;
    public bool ExternallyControlled { get; set; }

    private Rigidbody2D _body;
    private SpriteSheetPlayer _animator;
    private float _dir = -1f;
    private float _attackCooldown;
    private float _clipLock;
    private float _attackWindup;
    private float _windupSeconds = 0.24f;
    private float _recoverySeconds = 0.21f;
    private float _cooldownSeconds = 0.8f;
    private bool _attackPending;
    public bool WindingUp => _attackPending;
    private bool _dead;
    private bool stationary;
    private PlayerActor _player;

    private void Awake()
    {
        _body = GetComponent<Rigidbody2D>();
        _body.freezeRotation = true;
        _animator = GetComponent<SpriteSheetPlayer>();
        var box = GetComponent<BoxCollider2D>();
        box.size = new Vector2(28f, 28f);
        box.offset = new Vector2(0f, 14f);
    }

    public void ConfigureMovement(string movement)
    {
        stationary = string.Equals(movement, "stationary", System.StringComparison.OrdinalIgnoreCase);
        _body.linearVelocity = Vector2.zero;
        _body.bodyType = stationary ? RigidbodyType2D.Static : RigidbodyType2D.Dynamic;
    }

    public void ConfigureAttack(float windupSeconds, float recoverySeconds, float cooldownSeconds)
    {
        // Missing legacy JSON fields deserialize to zero; preserve the default cadence.
        _windupSeconds = ValidDuration(windupSeconds, 0.24f, 10f);
        _recoverySeconds = ValidDuration(recoverySeconds, 0.21f, 10f);
        _cooldownSeconds = Mathf.Max(_windupSeconds + _recoverySeconds, ValidDuration(cooldownSeconds, 0.8f, 60f));
        _attackPending = false;
    }

    private static float ValidDuration(float value, float fallback, float maximum)
    {
        return float.IsNaN(value) || float.IsInfinity(value) || value <= 0f ? fallback : Mathf.Clamp(value, 0.01f, maximum);
    }

    public void Bind(PlayerActor player)
    {
        _player = player;
    }

    public void ResetCombat(float health)
    {
        _dead = false;
        Health = health;
        _clipLock = 0f;
        _attackCooldown = 0f;
        _attackPending = false;
        _attackWindup = 0f;
        _animator?.Play("idle", true);
        if (_body != null)
            _body.linearVelocity = Vector2.zero;
    }

    private void Update()
    {
        if (Time.timeScale <= 0f) return;
        if (_dead)
            return;
        _attackCooldown = Mathf.Max(0f, _attackCooldown - Time.deltaTime);
        _clipLock = Mathf.Max(0f, _clipLock - Time.deltaTime);
        if (ExternallyControlled) return;
        if (_player == null || _player.Dead)
        {
            _attackPending = false;
            if (_clipLock <= 0f)
                _animator?.Play("idle");
            return;
        }

        var delta = _player.transform.position.x - transform.position.x;
        var attackOffset = (Vector2)_player.transform.position + new Vector2(0, 24) -
            ((Vector2)transform.position + new Vector2(0, 14));
        if (_attackPending)
        {
            _attackWindup = Mathf.Max(0f, _attackWindup - Time.deltaTime);
            if (_attackWindup <= 0f)
            {
                _attackPending = false;
                // Recheck at impact so moving out of reach avoids the committed swing.
                if (attackOffset.sqrMagnitude < 42f * 42f && delta * _dir >= -4f)
                    _player.Hurt(Damage);
            }
            return;
        }
        if (attackOffset.sqrMagnitude < 42f * 42f && _attackCooldown <= 0f && _clipLock <= 0f)
        {
            _attackCooldown = _cooldownSeconds;
            _clipLock = _windupSeconds + _recoverySeconds;
            _attackPending = true;
            _attackWindup = _windupSeconds;
            _dir = delta >= 0f ? 1f : -1f;
            if (_animator != null) _animator.FlipX = _dir < 0f;
            _animator?.Play("attack", true);
            return;
        }

        _dir = delta >= 0f ? 1f : -1f;
        if (_animator != null)
            _animator.FlipX = _dir < 0f;
        if (_clipLock <= 0f)
            _animator?.Play(stationary ? "idle" : "walk");
    }

    private void OnDisable() { _attackPending = false; }

    private void FixedUpdate()
    {
        if (ExternallyControlled) return;
        if (stationary) return;
        if (_dead)
        {
            _body.linearVelocity = Vector2.zero;
            return;
        }
        var speed = (_attackPending || _clipLock > 0f || _player == null || _player.Dead) ? 0f : _dir * WalkSpeed;
        var feet = _body.position;
        // Ground chasers stop before a drop, but retain gravity while airborne.
        var lookAhead = 16f + Mathf.Abs(speed) * Time.fixedDeltaTime;
        if (HasFloor(feet) && !HasFloor(feet + Vector2.right * _dir * lookAhead)) speed = 0f;
        _body.linearVelocity = new Vector2(speed, _body.linearVelocity.y);
    }

    private bool HasFloor(Vector2 feet)
    {
        foreach (var hit in Physics2D.RaycastAll(feet + Vector2.up * 4f, Vector2.down, 12f))
            if (!hit.collider.isTrigger && hit.collider.GetComponentInParent<EnemyActor>() == null &&
                hit.collider.GetComponentInParent<PlayerActor>() == null) return true;
        return false;
    }

    public void Hurt(float amount)
    {
        if (_dead || amount <= 0f || float.IsNaN(amount) || float.IsInfinity(amount))
            return;
        MainThreadProbe.EnemyHurtMarker.Begin();
        HurtCallCount++;
        Health -= amount;
        _attackPending = false;
        _clipLock = 0.25f;
        if (!ExternallyControlled) _animator?.Play("hurt", true);
        if (Health <= 0f)
        {
            _dead = true;
            // Keep the final grounded pose fixed after disabling combat colliders.
            _body.linearVelocity = Vector2.zero;
            _body.simulated = false;
            OnDefeated?.Invoke(this);
            _clipLock = 2f;
            _animator?.Play("death", true);
            foreach (var collider in GetComponentsInChildren<Collider2D>()) collider.enabled = false;
            Destroy(gameObject, Mathf.Max(0.6f, _animator != null ? _animator.ClipDuration("death") : 0f));
        }
        MainThreadProbe.EnemyHurtMarker.End();
    }
}
