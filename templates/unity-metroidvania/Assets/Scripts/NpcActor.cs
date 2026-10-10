using UnityEngine;

public sealed class NpcActor : MonoBehaviour
{
    public GameplayNpc Definition { get; private set; }
    public static NpcActor Create(GameplayNpc definition, float height, Transform parent, GameplaySpriteClip[] clips, string streamingRoot, NpcDialogueUI dialogue)
    {
        if(definition == null || string.IsNullOrEmpty(definition.id)) return null;
        var go = new GameObject("NPC_" + definition.id);
        go.transform.SetParent(parent, false);
        go.transform.position = Coord.FromGodot(definition.x, definition.y, height);
        var renderer = go.AddComponent<SpriteRenderer>(); renderer.sortingOrder = 8;
        var animation = go.AddComponent<SpriteSheetPlayer>();
        animation.LoadClips(clips, definition.spriteId ?? definition.definitionId ?? definition.id, streamingRoot);
        animation.Play("idle", true);
        var actor = go.AddComponent<NpcActor>(); actor.Definition = definition;
        dialogue?.Register(actor);
        return actor;
    }
}
