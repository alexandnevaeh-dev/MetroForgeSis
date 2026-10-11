using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>Plans QA movement over authored support spans and stair flights without changing geometry.
/// A proposed route still requires native input/collision validation.</summary>
public static class AuthoredSurfaceRoutePlanner
{
    private const float LandingMargin = 12f;
    private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);

    public static List<GameplayStairFlight> Plan(GameplayRoom room, GameplayDoor door,
        Vector2 start, GameplayMovement movement, float colliderHeight)
    {
        if (room == null || door == null || movement == null || !Finite(start.x) || !Finite(start.y) ||
            !Finite(movement.walkSpeed) || !Finite(movement.jumpHeight) || !Finite(movement.gravity) ||
            movement.walkSpeed <= 0f || movement.jumpHeight <= LandingMargin || movement.gravity <= 0f ||
            !Finite(colliderHeight) || colliderHeight <= 0f || room.solids == null || room.stairFlights == null ||
            !Finite(door.x) || !Finite(door.y) || !Finite(door.width) || !Finite(door.height)) return null;
        var usableRise = movement.jumpHeight - LandingMargin;
        float HorizontalReach(float rise)
        {
            if (rise < 0f || rise > usableRise) return -1f;
            // A higher landing shortens the descending part of the jump.
            var up = Mathf.Sqrt(2f * usableRise / movement.gravity);
            var down = Mathf.Sqrt(2f * (usableRise - rise) / movement.gravity);
            return movement.walkSpeed * (up + down);
        }
        bool FloorLink(Vector2 a, Vector2 b)
        {
            if (Mathf.Abs(a.y - b.y) > 8f) return false;
            var spans = new List<GameplayRect>();
            foreach (var solid in room.solids)
                if (solid != null && Finite(solid.x) && Finite(solid.y) && Finite(solid.width) &&
                    solid.width > 0f && Mathf.Abs(solid.y - b.y) < .5f) spans.Add(solid);
            spans.Sort((aSpan, bSpan) => aSpan.x.CompareTo(bSpan.x));
            var left = Mathf.Min(a.x, b.x); var right = Mathf.Max(a.x, b.x);
            var reach = left; var begun = false;
            foreach (var span in spans)
            {
                if (span.x + span.width < left) continue;
                if (!begun)
                {
                    if (span.x > left + 1f) return false;
                    begun = true; reach = span.x + span.width;
                }
                else
                {
                    if (span.x - reach > HorizontalReach(0f)) return false;
                    reach = Mathf.Max(reach, span.x + span.width);
                }
                if (reach >= right) return true;
            }
            return false;
        }
        bool Connect(Vector2 a, Vector2 b)
        {
            if (Vector2.Distance(a, b) < 12f || FloorLink(a, b)) return true;
            var rise = a.y - b.y;
            return rise >= 0f && Mathf.Abs(a.x - b.x) <= HorizontalReach(rise);
        }
        bool Goal(Vector2 end)
        {
            var floor = door.spatial != null && door.spatial.authored ? door.spatial.floorY : room.floorTop;
            if (door.direction != "up" && (!Finite(floor) || end.y > floor + 8f)) return false;
            var x = door.x + door.width * .5f;
            if(door.direction != "up" && end.y < floor - 8f)
            {
                var supported=false;foreach(var solid in room.solids)if(solid!=null&&Mathf.Abs(solid.y-floor)<.5f&&x>=solid.x+12f&&x<=solid.x+solid.width-12f)supported=true;
                // Step off an upper landing into a real lower support; no extra jump assumed.
                var dropReach=movement.walkSpeed*Mathf.Sqrt(2f*(floor-end.y)/movement.gravity);
                return supported&&Mathf.Abs(end.x-x)<=dropReach;
            }
            var contactFoot = door.y + door.height + colliderHeight;
            if (end.y - contactFoot > usableRise) return false;
            return FloorLink(end, new Vector2(x, end.y)) ||
                Mathf.Abs(end.x - x) <= HorizontalReach(Mathf.Max(0f, end.y - contactFoot));
        }
        if (Goal(start)) return new List<GameplayStairFlight>();
        bool Valid(GameplayStairFlight flight) => flight != null && Finite(flight.from.x) && Finite(flight.from.y) &&
            Finite(flight.to.x) && Finite(flight.to.y) && flight.to.y < flight.from.y;
        var queue = new Queue<int>();
        var paths = new Dictionary<int, List<GameplayStairFlight>>();
        var initial = new List<int>();
        for (var i = 0; i < room.stairFlights.Length; i++)
            if (Valid(room.stairFlights[i]) && Connect(start, room.stairFlights[i].from)) initial.Add(i);
        initial.Sort((a, b) => Mathf.Abs(start.x - room.stairFlights[a].from.x)
            .CompareTo(Mathf.Abs(start.x - room.stairFlights[b].from.x)));
        foreach (var i in initial)
        {
            paths[i] = new List<GameplayStairFlight> { room.stairFlights[i] }; queue.Enqueue(i);
        }
        while (queue.Count > 0)
        {
            var i = queue.Dequeue(); var flight = room.stairFlights[i];
            if (Goal(flight.to)) return paths[i];
            for (var j = 0; j < room.stairFlights.Length; j++)
            {
                var next = room.stairFlights[j];
                if (paths.ContainsKey(j) || !Valid(next) || next.to.y >= flight.to.y - 12f || !Connect(flight.to, next.from)) continue;
                var path = new List<GameplayStairFlight>(paths[i]) { next }; paths[j] = path; queue.Enqueue(j);
            }
        }
        return null;
    }
}
