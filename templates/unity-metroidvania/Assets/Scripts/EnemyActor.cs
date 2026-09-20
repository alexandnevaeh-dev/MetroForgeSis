using UnityEngine;

[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(BoxCollider2D))]
public class EnemyActor : MonoBehaviour
{
    public string EnemyId;
    public float Health = 30f;
    public float Damage = 8f;
    public float WalkSpeed = 40f;
    public static int HurtCallCount;
    public string CurrentClip => _animator != null ? _animator.CurrentClip : "";

    private Rigidbody2D _body;
    private SpriteSheetPlayer _animator;
    private float _dir = -1f;
    private float _attackCooldown;
    private float _clipLock;
    private bool _dead;
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
        _animator?.Play("idle", true);
        if (_body != null)
            _body.linearVelocity = Vector2.zero;
    }

    private void Update()
    {
        if (_dead)
            return;
        _attackCooldown = Mathf.Max(0f, _attackCooldown - Time.deltaTime);
        _clipLock = Mathf.Max(0f, _clipLock - Time.deltaTime);
        if (_player == null || _player.Dead)
        {
            if (_clipLock <= 0f)
                _animator?.Play("idle");
            return;
        }

        var delta = _player.transform.position.x - transform.position.x;
        if (Mathf.Abs(delta) < 42f && _attackCooldown <= 0f)
        {
            _attackCooldown = 0.8f;
            _clipLock = 0.4f;
            _animator?.Play("attack", true);
            _player.Hurt(Damage);
            return;
        }

        _dir = delta >= 0f ? 1f : -1f;
        if (_animator != null)
            _animator.FlipX = _dir < 0f;
        if (_clipLock <= 0f)
            _animator?.Play("walk");
    }

    private void FixedUpdate()
    {
        if (_dead)
        {
            _body.linearVelocity = Vector2.zero;
            return;
        }
        _body.linearVelocity = new Vector2(_dir * WalkSpeed, _body.linearVelocity.y);
    }

    public void Hurt(float amount)
    {
        if (_dead)
            return;
        MainThreadProbe.EnemyHurtMarker.Begin();
        HurtCallCount++;
        Health -= amount;
        _clipLock = 0.25f;
        _animator?.Play("hurt", true);
        if (Health <= 0f)
        {
            _dead = true;
            _clipLock = 2f;
            _animator?.Play("death", true);
            Destroy(gameObject, 0.6f);
        }
        MainThreadProbe.EnemyHurtMarker.End();
    }
}
