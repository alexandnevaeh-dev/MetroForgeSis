using System;
using System.Collections.Generic;
using System.Text;
using Unity.Profiling;
using UnityEngine;

/// <summary>
/// Named main-thread spans for hitch diagnosis. Not a smoothness claim.
/// </summary>
public static class MainThreadProbe
{
    public static readonly ProfilerMarker EnemySpawnMarker = new ProfilerMarker("Foundry.EnemySpawn");
    public static readonly ProfilerMarker EnemyHurtMarker = new ProfilerMarker("Foundry.EnemyHurt");
    public static readonly ProfilerMarker PlayerHurtMarker = new ProfilerMarker("Foundry.PlayerHurt");
    public static readonly ProfilerMarker PlayerDeathMarker = new ProfilerMarker("Foundry.PlayerDeath");
    public static readonly ProfilerMarker RespawnMarker = new ProfilerMarker("Foundry.Respawn");
    public static readonly ProfilerMarker SaveMarker = new ProfilerMarker("Foundry.WriteSave");
    public static readonly ProfilerMarker RoomLoadMarker = new ProfilerMarker("Foundry.LoadRoom");
    public static readonly ProfilerMarker ArtMissMarker = new ProfilerMarker("Foundry.ArtCacheMiss");

    private static readonly List<string> Lines = new List<string>(256);
    private static readonly Dictionary<string, float> LastMs = new Dictionary<string, float>();

    public static string LastName { get; private set; } = "";
    public static float LastMsValue { get; private set; }

    public static void Reset()
    {
        Lines.Clear();
        LastMs.Clear();
        LastName = "";
        LastMsValue = 0f;
    }

    public static void Span(string name, Action action)
    {
        var gc0 = GC.CollectionCount(0);
        var t0 = Time.realtimeSinceStartup;
        action();
        Record(name, (Time.realtimeSinceStartup - t0) * 1000f, GC.CollectionCount(0) - gc0, "");
    }

    public static void Record(string name, float ms, int gc0Delta, string extra)
    {
        LastName = name;
        LastMsValue = ms;
        LastMs[name] = ms;
        if (ms < 0.5f && gc0Delta == 0 && string.IsNullOrEmpty(extra))
            return;
        var line = "{\"t\":" + Time.unscaledTime.ToString("0.###") +
                   ",\"name\":\"" + name.Replace("\"", "'") +
                   "\",\"ms\":" + ms.ToString("0.###") +
                   ",\"gc0Delta\":" + gc0Delta +
                   ",\"extra\":\"" + (extra ?? "").Replace("\"", "'") + "\"}\n";
        Lines.Add(line);
        Debug.Log("FOUNDRY_SPAN " + name + " ms=" + ms.ToString("0.0") + " gc0=" + gc0Delta + " " + extra);
    }

    public static float GetLast(string name)
    {
        return LastMs.TryGetValue(name, out var ms) ? ms : 0f;
    }

    public static string Dump()
    {
        var sb = new StringBuilder();
        for (var i = 0; i < Lines.Count; i++)
            sb.Append(Lines[i]);
        return sb.ToString();
    }
}
