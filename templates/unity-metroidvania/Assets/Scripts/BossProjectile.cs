using UnityEngine;

public sealed class BossProjectile : MonoBehaviour
{
    public float Damage;
    public EnemyActor Owner;
    private float _life = 3f;
    private void Update() { _life -= Time.deltaTime; if (_life <= 0f || Owner == null || Owner.Dead) Destroy(gameObject); }
    private void OnDisable() { Destroy(gameObject); }
    private void OnTriggerEnter2D(Collider2D other)
    {
        if (other.isTrigger || other.GetComponentInParent<EnemyActor>() != null) return;
        var player = other.GetComponentInParent<PlayerActor>();
        if (player != null) player.Hurt(Damage);
        Destroy(gameObject);
    }
}
