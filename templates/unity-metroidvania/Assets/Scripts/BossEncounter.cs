using System;

/// <summary>Boss timing and phase rules. Health remains owned by EnemyActor.</summary>
public sealed class BossEncounter
{
    public enum Stage { Idle, Approach, Telegraph, Attack, Recovery, Hurt, Defeated }
    private readonly GameplayBossPhase[] _phases;
    private int _phaseIndex;
    private int _attackIndex;
    private float _timer;
    private float _lastHealth = float.NaN;
    private float _configuredAttackDuration = 0.8f;
    private float _configuredImpactDelay = 0.4f;
    private float _activeAttackDuration;
    private float _activeImpactDelay;
    private bool _impactDelivered;
    public float StageDuration { get; private set; }
    public Stage State { get; private set; }
    public int PhaseNumber => CurrentPhase.phase;
    public int PhaseChanges { get; private set; }
    public int AttacksExecuted { get; private set; }
    public bool AttackReady { get; private set; }
    public string CurrentAttack { get; private set; }
    public GameplayBossPhase CurrentPhase => _phases[_phaseIndex];
    public string NextAttack => CurrentPhase.attacks[_attackIndex % CurrentPhase.attacks.Length];

    public BossEncounter(GameplayBossPhase[] phases)
    {
        _phases = phases != null && phases.Length > 0 ? (GameplayBossPhase[])phases.Clone()
            : new[] { new GameplayBossPhase { phase = 1, healthThreshold = 1f,
                attacks = new[] { "slam" }, telegraphDuration = 0.8f, recoveryWindow = 1.2f } };
        foreach (var phase in _phases)
            if (phase == null || phase.attacks == null || phase.attacks.Length == 0)
                throw new ArgumentException("Boss phases require at least one attack.");
        Array.Sort(_phases, (a, b) => a.phase.CompareTo(b.phase));
        Reset();
    }

    public void Reset()
    {
        _phaseIndex = _attackIndex = PhaseChanges = AttacksExecuted = 0;
        State = Stage.Idle;
        _timer = 0.6f;
        StageDuration = _timer;
        _lastHealth = float.NaN;
        CurrentAttack = null;
        AttackReady = false;
        _impactDelivered = false;
    }

    public void ConfigureAttack(float duration, float impactDelay)
    {
        _configuredAttackDuration = Duration(duration, 0.8f);
        _configuredImpactDelay = !float.IsNaN(impactDelay) && !float.IsInfinity(impactDelay) && impactDelay >= 0f
            ? Math.Min(impactDelay, _configuredAttackDuration) : _configuredAttackDuration * 0.5f;
    }

    private void Enter(Stage state, float duration)
    {
        State = state;
        StageDuration = _timer = duration;
    }

    private void Impact()
    {
        if (_impactDelivered) return;
        _impactDelivered = AttackReady = true;
        AttacksExecuted++;
    }

    public void Tick(float deltaTime, float health, float maxHealth, bool targetAvailable, bool inRange)
    {
        AttackReady = false;
        if (float.IsNaN(deltaTime) || float.IsInfinity(deltaTime) || deltaTime <= 0f) return;
        if (State == Stage.Defeated) return;
        if (health <= 0f) { State = Stage.Defeated; return; }
        var ratio = maxHealth > 0f ? health / maxHealth : 1f;
        var nextPhase = _phaseIndex;
        for (var i = _phaseIndex + 1; i < _phases.Length; i++)
            if (ratio <= _phases[i].healthThreshold) nextPhase = i;
        var damaged = !float.IsNaN(_lastHealth) && health < _lastHealth;
        _lastHealth = health;
        if (nextPhase != _phaseIndex)
        {
            PhaseChanges += nextPhase - _phaseIndex;
            _phaseIndex = nextPhase;
            _attackIndex = 0;
            Enter(Stage.Idle, 0.45f);
            CurrentAttack = null;
        }
        else if (damaged && State != Stage.Telegraph && State != Stage.Attack)
        {
            Enter(Stage.Hurt, 0.35f);
        }
        if (!targetAvailable) { Enter(Stage.Idle, 0.6f); return; }
        _timer = Math.Max(0f, _timer - deltaTime);
        switch (State)
        {
            case Stage.Idle:
            case Stage.Approach:
                State = inRange ? Stage.Idle : Stage.Approach;
                if (inRange && _timer <= 0f)
                {
                    CurrentAttack = NextAttack;
                    _attackIndex++;
                    Enter(Stage.Telegraph, Duration(CurrentPhase.telegraphDuration, 0.8f));
                }
                break;
            case Stage.Telegraph:
                if (_timer <= 0f)
                {
                    _activeAttackDuration = _configuredAttackDuration;
                    _activeImpactDelay = _configuredImpactDelay;
                    _impactDelivered = false;
                    Enter(Stage.Attack, _activeAttackDuration);
                    if (_activeImpactDelay == 0f) Impact();
                }
                break;
            case Stage.Attack:
                if (!_impactDelivered && _timer <= _activeAttackDuration - _activeImpactDelay) Impact();
                if (_timer <= 0f) Enter(Stage.Recovery, Duration(CurrentPhase.recoveryWindow, 1.2f));
                break;
            case Stage.Recovery:
            case Stage.Hurt:
                if (_timer <= 0f) Enter(Stage.Idle, 0.2f);
                break;
        }
    }

    private static float Duration(float value, float fallback) =>
        value > 0f && !float.IsNaN(value) && !float.IsInfinity(value) ? Math.Min(value, 10f) : fallback;
}
