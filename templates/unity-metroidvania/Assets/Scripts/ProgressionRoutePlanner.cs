using System;
using System.Collections.Generic;

/// <summary>Chooses reachable earned-progression goals without bypassing door or boss locks.</summary>
public static class ProgressionRoutePlanner
{
    public static GameplayDoor NextDoor(GameplayPack pack,string current,ISet<string> owned,Func<GameplayRoom,bool> bossDefeated)
    {
        var rooms=new Dictionary<string,GameplayRoom>();
        foreach(var room in pack.rooms)rooms.Add(room.id,room);
        if(!rooms.ContainsKey(current))return null;
        var queue=new Queue<string>();queue.Enqueue(current);
        var first=new Dictionary<string,GameplayDoor>();first[current]=null;
        GameplayDoor bossGoal=null,victoryGoal=null;
        while(queue.Count>0)
        {
            var room=rooms[queue.Dequeue()];
            var blocked=room.enemy!=null&&room.enemy.isBoss&&!bossDefeated(room);
            if(room.id!=current)
            {
                foreach(var pickup in room.abilityPickups??(room.abilityPickup!=null?new[]{room.abilityPickup}:Array.Empty<GameplayActor>()))
                    if(pickup!=null&&!string.IsNullOrEmpty(pickup.id)&&!owned.Contains(pickup.id))return first[room.id];
                if(blocked&&bossGoal==null)bossGoal=first[room.id];
                if(room.victory&&victoryGoal==null)victoryGoal=first[room.id];
            }
            if(blocked)continue;
            foreach(var door in room.doors??Array.Empty<GameplayDoor>())
            {
                if(door==null||!rooms.ContainsKey(door.targetRoomId)||first.ContainsKey(door.targetRoomId))continue;
                var allowed=true;foreach(var ability in door.requirements??Array.Empty<string>())if(!owned.Contains(ability)){allowed=false;break;}
                if(!allowed)continue;
                first[door.targetRoomId]=room.id==current?door:first[room.id];queue.Enqueue(door.targetRoomId);
            }
        }
        return bossGoal??victoryGoal;
    }
}
