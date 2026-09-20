using System;
using UnityEngine;

[Serializable]
public class GameplayRect
{
    public string name;
    public float x;
    public float y;
    public float width;
    public float height;
}

[Serializable]
public class GameplaySpriteClip
{
    public string ownerId;
    public string clip;
    public string relativePath;
    public int frameWidth;
    public int frameHeight;
    public int frameCount;
    public float fps;
    public bool loop;
    public float pivotX;
    public float pivotY;
}

[Serializable]
public class GameplayDoor
{
    public string direction;
    public string targetRoomId;
    public float x;
    public float y;
    public float width;
    public float height;
    public string spawnSide;
    public string[] requirements;
    public bool optional;
}

[Serializable]
public class GameplayGate
{
    public string requiredAbility;
    public float x;
    public float y;
    public float width;
    public float height;
    public string targetRoomId;
}

[Serializable]
public class GameplayActor
{
    public string id;
    public float x;
    public float y;
    public float health;
    public float damage;
    public string movement;
    public string combat;
}

[Serializable]
public class GameplayBackgrounds
{
    public string far;
    public string mid;
    public string near;
    public string foreground;
}

[Serializable]
public class GameplayCheckpoint
{
    public float x;
    public float y;
}

[Serializable]
public class GameplayRoom
{
    public string id;
    public int index;
    public float width;
    public float height;
    public string biomeId;
    public string archetype;
    public float tileSize;
    public float floorTop;
    public float spawnX;
    public float spawnY;
    public GameplayRect[] solids;
    public GameplayDoor[] doors;
    public GameplayGate[] gates;
    public GameplayActor enemy;
    public GameplayActor abilityPickup;
    public GameplayCheckpoint checkpoint;
    public bool victory;
    public GameplayBackgrounds backgrounds;
}

[Serializable]
public class GameplayMovement
{
    public float walkSpeed;
    public float runSpeed;
    public float jumpHeight;
    public float gravity;
    public float coyoteTime;
    public float jumpBufferTime;
    public float acceleration;
    public float deceleration;
    public float airAcceleration;
    public float maxFallSpeed;
    public float dashSpeed;
    public float dashDuration;
    public float dashCooldown;
}

[Serializable]
public class GameplayCombat
{
    public float attackDamage;
    public float invulnerableSeconds;
    public float hitboxSeconds;
    public float comboWindowMul;
    public float cooldownMul;
    public float maxHealth;
}

[Serializable]
public class GameplayAbility
{
    public string id;
    public string name;
}

[Serializable]
public class GameplayPack
{
    public string version;
    public string title;
    public int seed;
    public float tileSize;
    public GameplayMovement movement;
    public GameplayCombat combat;
    public string startRoomId;
    public string victoryRoomId;
    public GameplayAbility[] abilities;
    public GameplayRoom[] rooms;
    public GameplaySpriteClip[] sprites;
}

public static class Coord
{
    public static Vector2 FromGodot(float x, float y, float roomHeight)
    {
        return new Vector2(x, roomHeight - y);
    }

    public static Vector2 RectCenter(GameplayRect rect, float roomHeight)
    {
        return FromGodot(rect.x + rect.width * 0.5f, rect.y + rect.height * 0.5f, roomHeight);
    }
}
