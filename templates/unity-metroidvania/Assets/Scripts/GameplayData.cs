using System;
using UnityEngine;

[Serializable]
public class GameplayRect
{
    public bool oneWay;
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
    public float pixelsPerUnit = 1f;
    public bool smoothFiltering;
    public float fps;
    public bool loop;
    public int impactFrame = -1;
    public bool hasImpactFrame;
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
    public GameplaySpatialPort spatial;
    public string[] requirements;
    public bool optional;
}

[Serializable]
public class GameplaySpatialPort
{
    public bool authored;
    public float floorY;
    public float arrivalX;
    public bool hasArrivalX;
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
    public float attackWindupSeconds;
    public float attackRecoverySeconds;
    public float attackCooldownSeconds;
    public bool isBoss;
    public string name;
    public GameplayBossPhase[] bossPhases;
}

[Serializable]
public class GameplayBossPhase
{
    public int phase;
    public float healthThreshold;
    public string[] attacks;
    public float telegraphDuration;
    public float recoveryWindow;
}

[Serializable]
public class GameplayBackgrounds
{
    public string interior;
    public float[] interiorTint;
    public bool farCameraRelative;
    public float farParallax = 0.1f;
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
public class GameplayStairFlight
{
    public Vector2 from;
    public Vector2 to;
    public float thickness;
    public bool oneWay;
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
    public GameplayStairFlight[] stairFlights;
    public GameplayDoor[] doors;
    public GameplayGate[] gates;
    public GameplayNpc[] npcs;
    public GameplayActor enemy;
    public GameplayActor abilityPickup;
    public GameplayActor[] abilityPickups;
    public GameplayCheckpoint[] grappleAnchors;
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
    public float groundSlamSpeed = 900f;
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
    public GameplayDialogue[] dialogues;
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

[Serializable] public class GameplayNpc {public string id,definitionId,spriteId,name,role,shopId;public float x,y;public string[] dialogueIds,questIds;}
[Serializable] public class GameplayDialogue {public string id;public GameplayDialogueLine[] lines;}
[Serializable] public class GameplayDialogueLine {public string speaker,text,portrait,voicePath;public GameplayDialogueChoice[] choices;}
[Serializable] public class GameplayDialogueChoice {public string id,text,nextDialogueId,action;public bool end;}
