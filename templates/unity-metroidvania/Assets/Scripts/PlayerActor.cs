using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(BoxCollider2D))]
public class PlayerActor : MonoBehaviour
{
    public GameplayPack Pack;
    public System.Action OnDied;
    public System.Action<string> OnAbilityUnlocked;
    public System.Action OnVictoryReached;
    public System.Action OnCheckpoint;
    public System.Action<Collider2D> OnCheckpointHit;

    [SerializeField] private SpriteSheetPlayer animator;

    private Rigidbody2D _body;
    private WraithChain _wraithChain;
    private EmberSeal _emberSeal;
    private BoxCollider2D _hurt;
    private BoxCollider2D _hit;
    private float _coyote;
    private float _jumpBuffer;
    private float _attackCooldown;
    private float _comboWindow;
    private int _comboStep;
    private float _invuln;
    private float _dashTime;
    private float _dashCooldown;
    private bool _veilStep;
    public bool IsDashing => _dashTime > 0f;
    public bool IsVeilStepping => _veilStep && _dashTime > 0f;
    private bool _grounded;
    private bool _wasGrounded;
    private bool _airJumpUsed;
    private readonly ContactPoint2D[] _wallContacts = new ContactPoint2D[8];
    public bool IsWallSliding { get; private set; }
    private float _clipLock;
    private float _health = 100f;
    private readonly HashSet<EnemyActor> _hitThisSwing = new HashSet<EnemyActor>();
    public readonly HashSet<string> Abilities = new HashSet<string>();
    public int LastSwingUniqueHits { get; private set; }

    public float Health => _health;
    public float MaxHealth => Pack != null && Pack.combat != null && Pack.combat.maxHealth > 0f ? Pack.combat.maxHealth : 100f;
    public bool Dead { get; private set; }
    public string CurrentClip => animator != null ? animator.CurrentClip : "";

    public void Revive(float health = -1f)
    {
        Dead = false;
        IsWallSliding = false;
        _airJumpUsed = false;
        _jumpBuffer = 0f;
        _coyote = 0f;
        _health = health > 0f ? health : MaxHealth;
        _invuln = 0.4f;
        _dashTime = 0f;
        _veilStep = false;
        _wraithChain?.Cancel();
        _emberSeal?.Cancel();
        _clipLock = 0f;
        animator?.Play("idle", true);
    }

    private void Awake()
    {
        _body = GetComponent<Rigidbody2D>();
        _wraithChain = GetComponent<WraithChain>() ?? gameObject.AddComponent<WraithChain>();
        _wraithChain.Initialize(this);
        _emberSeal = GetComponent<EmberSeal>() ?? gameObject.AddComponent<EmberSeal>();
        _emberSeal.Initialize(this);
        _body.freezeRotation = true;
        _body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
        _body.interpolation = RigidbodyInterpolation2D.Interpolate;
        _hurt = GetComponent<BoxCollider2D>();
        _hurt.size = new Vector2(24f, 48f);
        _hurt.offset = new Vector2(0f, 24f);
        var hitGo = new GameObject("Hitbox");
        hitGo.transform.SetParent(transform, false);
        hitGo.transform.localPosition = new Vector3(28f, 24f, 0f);
        _hit = hitGo.AddComponent<BoxCollider2D>();
        _hit.isTrigger = true;
        _hit.size = new Vector2(36f, 28f);
        _hit.enabled = false;
        if (animator == null)
            animator = GetComponent<SpriteSheetPlayer>();
    }

    public void Configure(GameplayPack pack, SpriteSheetPlayer sheet)
    {
        Pack = pack;
        animator = sheet;
        Physics2D.gravity = new Vector2(0f, -pack.movement.gravity);
        _health = MaxHealth;
        Dead = false;
    }

    public void GrantAbility(string id)
    {
        if (string.IsNullOrEmpty(id) || !Abilities.Add(id))
            return;
        OnAbilityUnlocked?.Invoke(id);
    }

    private void Update()
    {
        if (Dead || Pack == null)
            return;
        var move = ReadMove();
        var jumpPressed = ReadButton("jump");
        var attackPressed = ReadButton("attack");
        var dashPressed = ReadButton("dash");
        var run = ReadRun();

        if (_grounded)
            _coyote = Pack.movement.coyoteTime;
        else
            _coyote = Mathf.Max(0f, _coyote - Time.deltaTime);

        if (jumpPressed)
            _jumpBuffer = Pack.movement.jumpBufferTime;
        else
            _jumpBuffer = Mathf.Max(0f, _jumpBuffer - Time.deltaTime);

        _attackCooldown = Mathf.Max(0f, _attackCooldown - Time.deltaTime);
        _comboWindow = Mathf.Max(0f, _comboWindow - Time.deltaTime);
        _invuln = Mathf.Max(0f, _invuln - Time.deltaTime);
        _dashCooldown = Mathf.Max(0f, _dashCooldown - Time.deltaTime);
        if (_dashTime > 0f)
            _dashTime -= Time.deltaTime;
        _clipLock = Mathf.Max(0f, _clipLock - Time.deltaTime);

        if (attackPressed && _attackCooldown <= 0f && !_emberSeal.IsCharging)
            PerformAttack();

        if (dashPressed)
            TryDash(move.x != 0f ? move.x : animator != null && animator.FlipX ? -1f : 1f);

        if (move.x != 0f && animator != null)
            animator.FlipX = move.x < 0f;
        AlignHitbox();

        if (!_wasGrounded && _grounded && _clipLock <= 0f)
            LockClip("land", 0.15f);

        if (_clipLock <= 0f)
        {
            if (!_grounded)
                animator?.Play(_body.linearVelocity.y > 20f ? "jump" : "fall");
            else if (Mathf.Abs(_body.linearVelocity.x) > 20f)
                animator?.Play(run ? "run" : "walk");
            else
                animator?.Play("idle");
        }
        _wasGrounded = _grounded;
    }

    // Phase is the registered ability used by Ashen Covenant's Veil Step.
    // It protects against damage during movement without disabling solid collisions.
    public bool TryDash(float direction)
    {
        if (Dead || Pack == null || _body == null || (_wraithChain != null && _wraithChain.IsPulling) || _dashCooldown > 0f || _dashTime > 0f)
            return false;
        if (!Abilities.Contains("dash") && !Abilities.Contains("phase"))
            return false;
        if (float.IsNaN(direction) || float.IsInfinity(direction) || Mathf.Approximately(direction, 0f))
            return false;
        _veilStep = Abilities.Contains("phase");
        _dashTime = Mathf.Max(0.01f, Pack.movement.dashDuration);
        _dashCooldown = Mathf.Max(_dashTime, Pack.movement.dashCooldown);
        var facing = Mathf.Sign(direction);
        if (animator != null)
            animator.FlipX = facing < 0f;
        _body.linearVelocity = new Vector2(facing * Pack.movement.dashSpeed, 0f);
        LockClip("dash", _dashTime);
        return true;
    }

    private void LockClip(string clip, float seconds)
    {
        animator?.Play(clip, true);
        _clipLock = Mathf.Max(_clipLock, seconds);
    }

    private void FixedUpdate()
    {
        IsWallSliding = false;
        if (Dead || Pack == null || (_wraithChain != null && _wraithChain.IsPulling))
            return;
        var move = ReadMove();
        var run = ReadRun();
        var target = move.x * (run ? Pack.movement.runSpeed : Pack.movement.walkSpeed);
        var accel = _grounded ? Pack.movement.acceleration : Pack.movement.airAcceleration;
        var vx = _dashTime > 0f
            ? _body.linearVelocity.x
            : Mathf.MoveTowards(_body.linearVelocity.x, target, accel * Time.fixedDeltaTime);
        var vy = Mathf.Max(-Pack.movement.maxFallSpeed, _body.linearVelocity.y);
        var groundJump = _coyote > 0f;
        var airJump = !_grounded && !_airJumpUsed && Abilities.Contains("double_jump");
        if (_jumpBuffer > 0f && (groundJump || airJump))
        {
            var jumpV = Mathf.Sqrt(2f * Pack.movement.gravity * Pack.movement.jumpHeight);
            vy = jumpV;
            if (!groundJump) _airJumpUsed = true;
            _grounded = false;
            _jumpBuffer = 0f;
            _coyote = 0f;
            LockClip("jump_start", 0.12f);
        }
        if (!_grounded && vy < 0f && _dashTime <= 0f && Mathf.Abs(move.x) > 0.1f && Abilities.Contains("wall_slide"))
        {
            var count = _body.GetContacts(_wallContacts);
            for (var i = 0; i < count; i++)
            {
                var normal = _wallContacts[i].normal;
                if (Mathf.Abs(normal.x) > 0.8f && normal.x * move.x < 0f)
                {
                    // Counter the coming gravity step so actual descent remains capped.
                    vy = Mathf.Max(vy, -90f + Pack.movement.gravity * Time.fixedDeltaTime);
                    IsWallSliding = true;
                    break;
                }
            }
        }
        _body.linearVelocity = new Vector2(vx, vy);
    }

    private void PerformAttack()
    {
        if (_comboWindow <= 0f)
            _comboStep = 0;
        _comboStep = Mathf.Min(_comboStep + 1, 3);
        var clip = _comboStep == 1 ? "attack" : _comboStep == 2 ? "attack_2" : "attack_3";
        var duration = 0.4f;
        LockClip(clip, 0.38f);
        _attackCooldown = duration * Pack.combat.cooldownMul;
        _comboWindow = duration * Pack.combat.comboWindowMul;
        _hitThisSwing.Clear();
        LastSwingUniqueHits = 0;
        AlignHitbox();
        _hit.enabled = true;
        ApplyHitOverlaps();
        Invoke(nameof(DisableHit), Pack.combat.hitboxSeconds);
    }

    private void AlignHitbox()
    {
        if (_hit == null)
            return;
        var x = animator != null && animator.FlipX ? -28f : 28f;
        _hit.transform.localPosition = new Vector3(x, 24f, 0f);
    }

    private void ApplyHitOverlaps()
    {
        if (_hit == null || Pack == null)
            return;
        var hits = Physics2D.OverlapBoxAll(_hit.transform.position, _hit.size, 0f);
        foreach (var col in hits)
        {
            if (col == null || col == _hit || col == _hurt)
                continue;
            var enemy = col.GetComponent<EnemyActor>() ?? col.GetComponentInParent<EnemyActor>();
            TryHit(enemy);
        }
    }

    private void TryHit(EnemyActor enemy)
    {
        if (enemy == null || Pack == null)
            return;
        if (!_hitThisSwing.Add(enemy))
            return;
        enemy.Hurt(Pack.combat.attackDamage);
        LastSwingUniqueHits = _hitThisSwing.Count;
    }

    private void DisableHit()
    {
        if (_hit != null)
            _hit.enabled = false;
        LastSwingUniqueHits = _hitThisSwing.Count;
    }

    private void OnCollisionStay2D(Collision2D collision)
    {
        foreach (var contact in collision.contacts)
        {
            if (contact.normal.y > 0.5f && _body.linearVelocity.y <= 0.1f)
            {
                _grounded = true;
                _airJumpUsed = false;
            }
        }
    }

    private void OnCollisionExit2D(Collision2D collision)
    {
        _grounded = false;
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Pickup"))
        {
            var pickup = other.GetComponent<AbilityPickup>();
            if (pickup != null)
            {
                GrantAbility(pickup.AbilityId);
                Destroy(other.gameObject);
            }
            return;
        }
        if (other.CompareTag("Checkpoint"))
        {
            var pulse = other.GetComponent<CheckpointPulse>() ?? other.GetComponentInParent<CheckpointPulse>();
            pulse?.Arm();
            OnCheckpointHit?.Invoke(other);
            OnCheckpoint?.Invoke();
            return;
        }
        if (other.CompareTag("Victory"))
        {
            OnVictoryReached?.Invoke();
            return;
        }
        if (_hit != null && _hit.enabled)
            TryHit(other.GetComponent<EnemyActor>() ?? other.GetComponentInParent<EnemyActor>());
    }

    public void Hurt(float amount)
    {
        MainThreadProbe.PlayerHurtMarker.Begin();
        if (Dead || _invuln > 0f || IsVeilStepping)
        {
            MainThreadProbe.PlayerHurtMarker.End();
            return;
        }
        _health -= amount;
        _invuln = Pack.combat.invulnerableSeconds;
        LockClip("hurt", 0.22f);
        if (_health <= 0f) Defeat();
        MainThreadProbe.PlayerHurtMarker.End();
    }

    // Environmental defeat bypasses temporary combat invulnerability.
    public void Defeat()
    {
        if (Dead) return;
        Dead = true;
        IsWallSliding = false;
        _health = 0f;
        _dashTime = 0f;
        _wraithChain?.Cancel();
        _emberSeal?.Cancel();
        _clipLock = 2f;
        animator?.Play("death", true);
        OnDied?.Invoke();
    }

    private static Vector2 ReadMove()
    {
        var x = 0f;
#if ENABLE_INPUT_SYSTEM
        foreach (var device in InputSystem.devices)
        {
            if (device is not Keyboard kb || !kb.enabled)
                continue;
            if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) x -= 1f;
            if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) x += 1f;
        }
#endif
        if (Mathf.Approximately(x, 0f))
            x = Input.GetAxisRaw("Horizontal");
        return new Vector2(x, 0f);
    }

    private static bool ReadRun()
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb != null && (kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed))
            return true;
#endif
        return Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);
    }

    private static bool ReadButton(string name)
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb != null)
        {
            if (name == "jump" && (kb.spaceKey.wasPressedThisFrame || kb.wKey.wasPressedThisFrame || kb.upArrowKey.wasPressedThisFrame))
                return true;
            if (name == "attack" && (kb.jKey.wasPressedThisFrame || kb.zKey.wasPressedThisFrame || kb.jKey.isPressed || kb.zKey.isPressed))
                return true;
            if (name == "dash" && (kb.kKey.wasPressedThisFrame || kb.leftShiftKey.wasPressedThisFrame))
                return true;
        }
#endif
        if (name == "jump")
            return Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.W) || Input.GetKeyDown(KeyCode.UpArrow);
        if (name == "attack")
            return Input.GetKeyDown(KeyCode.J) || Input.GetKeyDown(KeyCode.Z) || Input.GetButtonDown("Fire1");
        if (name == "dash")
            return Input.GetKeyDown(KeyCode.K) || Input.GetKeyDown(KeyCode.LeftShift);
        return false;
    }
}

public class AbilityPickup : MonoBehaviour
{
    public string AbilityId;
}

public class DoorSensor : MonoBehaviour
{
    public string TargetRoomId;
    public string SpawnSide;
    public string[] Requirements;
    public System.Action<DoorSensor> OnEnter;

    private void OnTriggerEnter2D(Collider2D other)
    {
        // Attack hitboxes are child colliders. Only the player's body may change rooms.
        if (other == null || other.GetComponent<PlayerActor>() == null)
            return;
        OnEnter?.Invoke(this);
    }
}

public class GateBlocker : MonoBehaviour
{
    public string RequiredAbility;
}
