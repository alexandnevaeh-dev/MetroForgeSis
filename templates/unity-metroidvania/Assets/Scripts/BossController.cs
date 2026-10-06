using System;
using UnityEngine;

/// <summary>Integrates the boss encounter with the shared damage, sprite and physics systems.</summary>
public sealed class BossController : MonoBehaviour
{
    private EnemyActor _enemy;
    private SpriteSheetPlayer _animator;
    private SpriteRenderer _renderer;
    private Rigidbody2D _body;
    private PlayerActor _player;
    private GameplayActor _spec;
    private BossEncounter _encounter;
    private float _arenaWidth;
    private float _direction = -1f;
    private Color _baseTint;
    private Sprite _projectileSprite;
    private readonly RaycastHit2D[] _floorHits = new RaycastHit2D[8];
    public BossEncounter Encounter => _encounter;
    public string DisplayName => string.IsNullOrEmpty(_spec?.name) ? "Reliquary Guardian" : _spec.name;
    public float Health => _enemy != null ? _enemy.Health : 0f;
    public float MaxHealth => _spec != null ? _spec.health : 1f;
    public Action<int> OnPhaseChanged;
    public Action OnAttackExecuted;

    public void Configure(EnemyActor enemy, GameplayActor spec, PlayerActor player, float arenaWidth)
    {
        _enemy = enemy;
        _spec = spec;
        _player = player;
        _arenaWidth = arenaWidth;
        _body = GetComponent<Rigidbody2D>();
        _animator = GetComponent<SpriteSheetPlayer>();
        _renderer = GetComponent<SpriteRenderer>();
        _baseTint = _renderer.color;
        _enemy.ExternallyControlled = true;
        var collider = GetComponent<BoxCollider2D>();
        collider.size = new Vector2(48f, 72f);
        collider.offset = new Vector2(0f, 36f);
        _encounter = new BossEncounter(spec.bossPhases);
        _projectileSprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 4f);
    }

    public void ResetEncounter(PlayerActor player)
    {
        _player = player;
        _encounter?.Reset();
        _renderer.color = _baseTint;
        _body.linearVelocity = Vector2.zero;
    }

    private void Update()
    {
        if (_encounter == null || Time.timeScale <= 0f) return;
        var available = _player != null && !_player.Dead && !_player.InputBlocked;
        var delta = available ? _player.transform.position.x - transform.position.x : 0f;
        var range = _encounter.NextAttack == "projectile" ? 360f : _encounter.NextAttack == "area_burst" ? 170f : 90f;
        var oldPhase = _encounter.PhaseNumber;
        if (_encounter.State == BossEncounter.Stage.Telegraph)
        {
            var attackClip = AttackClip(_encounter.CurrentAttack);
            _encounter.ConfigureAttack(_animator.ClipDuration(attackClip), _animator.ClipImpactSeconds(attackClip));
        }
        _encounter.Tick(Time.deltaTime, _enemy.Health, _spec.health, available, Mathf.Abs(delta) <= range);
        if (oldPhase != _encounter.PhaseNumber) OnPhaseChanged?.Invoke(_encounter.PhaseNumber);
        if (_encounter.State == BossEncounter.Stage.Idle || _encounter.State == BossEncounter.Stage.Approach)
            _direction = delta >= 0f ? 1f : -1f;
        _animator.FlipX = _direction < 0f;
        var state = _encounter.State;
        var clip = state == BossEncounter.Stage.Telegraph ? "telegraph"
            : state == BossEncounter.Stage.Attack ? AttackClip(_encounter.CurrentAttack)
            : state == BossEncounter.Stage.Recovery ? "recovery"
            : state == BossEncounter.Stage.Hurt ? "hurt"
            : state == BossEncounter.Stage.Defeated ? "death"
            : state == BossEncounter.Stage.Approach ? (_encounter.PhaseNumber > 1 ? "run" : "walk") : "idle";
        if (!_animator.HasClip(clip)) clip = state == BossEncounter.Stage.Attack ? "attack" : state == BossEncounter.Stage.Approach ? "walk" : "idle";
        _animator.Play(clip);
        if (_encounter.AttackReady) { ExecuteAttack(); OnAttackExecuted?.Invoke(); }
        _animator.PlaybackSpeed = state == BossEncounter.Stage.Approach ? Mathf.Clamp(Mathf.Abs(_body.linearVelocity.x) / 65f, 0.15f, 1.6f) : 1f;
        if ((state == BossEncounter.Stage.Telegraph || state == BossEncounter.Stage.Recovery || state == BossEncounter.Stage.Hurt)
            && _encounter.StageDuration > 0f)
            _animator.PlaybackSpeed = _animator.ClipDuration(clip) / _encounter.StageDuration;
        _renderer.color = state == BossEncounter.Stage.Telegraph
            ? Color.Lerp(_baseTint, new Color(0.5f, 1f, 1f, 1f), 0.35f + 0.2f * Mathf.Sin(Time.time * 12f)) : _baseTint;
    }

    private string AttackClip(string attack)
    {
        var clip = attack == "projectile" ? "attack_projectile" : attack == "area_burst" ? "attack_burst" : "attack";
        return _animator.HasClip(clip) ? clip : "attack";
    }

    private void FixedUpdate()
    {
        if (_encounter == null) return;
        if (_enemy.Dead) { _body.linearVelocity = Vector2.zero; return; }
        var speed = _encounter.State == BossEncounter.Stage.Approach ? _direction * (_encounter.PhaseNumber > 1 ? 90f : 65f) : 0f;
        if (_body.position.x < 56f && speed < 0f || _body.position.x > _arenaWidth - 56f && speed > 0f) speed = 0f;
        if (speed != 0f && !HasFloorAhead(_body.position + Vector2.right * _direction * 32f)) speed = 0f;
        _body.linearVelocity = new Vector2(speed, _body.linearVelocity.y);
    }

    private bool HasFloorAhead(Vector2 feet)
    {
        var filter = new ContactFilter2D { useTriggers = false };
        var count = Physics2D.Raycast(feet + Vector2.up * 4f, Vector2.down, filter, _floorHits, 16f);
        for (var i = 0; i < count; i++)
            if (_floorHits[i].collider.GetComponentInParent<EnemyActor>() == null && _floorHits[i].collider.GetComponentInParent<PlayerActor>() == null) return true;
        return false;
    }

    private void ExecuteAttack()
    {
        if (_player == null || _player.Dead) return;
        if (_encounter.CurrentAttack == "projectile")
        {
            var origin = (Vector2)transform.position + new Vector2(_direction * 30f, 38f);
            var direction = ((Vector2)_player.transform.position + Vector2.up * 24f - origin).normalized;
            FireProjectile(origin, direction);
        }
        else if (_encounter.CurrentAttack == "area_burst")
        {
            for (var i = 0; i < 5; i++)
            {
                var angle = (25f + i * 32.5f) * Mathf.Deg2Rad;
                FireProjectile((Vector2)transform.position + Vector2.up * 32f, new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)));
            }
        }
        else
        {
            var delta = (Vector2)_player.transform.position - (Vector2)transform.position;
            if (Mathf.Abs(delta.x) <= 110f && Mathf.Abs(delta.y) <= 90f && delta.x * _direction >= -4f) _player.Hurt(_enemy.Damage);
        }
    }

    private void FireProjectile(Vector2 origin, Vector2 direction)
    {
        var go = new GameObject("StormglassBolt");
        go.transform.SetParent(transform.parent, false);
        go.transform.position = origin;
        go.transform.localScale = Vector3.one * 10f;
        var renderer = go.AddComponent<SpriteRenderer>();
        renderer.sprite = _projectileSprite;
        renderer.color = new Color(0.25f, 0.95f, 1f, 1f);
        renderer.sortingOrder = 12;
        var body = go.AddComponent<Rigidbody2D>();
        body.bodyType = RigidbodyType2D.Kinematic;
        body.gravityScale = 0f;
        body.linearVelocity = direction * 220f;
        var collider = go.AddComponent<CircleCollider2D>();
        collider.isTrigger = true;
        collider.radius = 0.45f;
        var bolt = go.AddComponent<BossProjectile>();
        bolt.Damage = _enemy.Damage;
        bolt.Owner = _enemy;
    }

    private void OnDestroy() { if (_projectileSprite != null) Destroy(_projectileSprite); }
}
