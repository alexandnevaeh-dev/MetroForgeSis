using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
#endif

// Explicitly staged physics fixture, separate from campaign traversal acceptance.
public class GroundSlamValidationDriver : MonoBehaviour
{
    [Serializable] public class Check { public string name; public bool passed; public string detail; }
    [Serializable] public class Result { public string scope = "Isolated Unity physics/lifecycle fixture; positioning and ability grants are setup, not traversal"; public int checks; public int failures; public Check[] results; }
    private readonly List<Check> _checks = new List<Check>();
    private PlayerActor _player;
    private Rigidbody2D _body;
    private GameObject _floor;
#if ENABLE_INPUT_SYSTEM
    private Keyboard _keyboard;
#endif
    private bool Slamming => (bool?)(typeof(PlayerActor).GetProperty("IsGroundSlamming")?.GetValue(_player)) ?? false;
    private bool Activate() => (bool?)(typeof(PlayerActor).GetMethod("TryGroundSlam")?.Invoke(_player, null)) ?? false;
    private void CheckThat(string name, bool ok, string detail = "")
    {
        _checks.Add(new Check { name = name, passed = ok, detail = detail });
        Debug.Log("SLAM_CHECK " + name + " " + (ok ? "PASS" : "FAIL") + " " + detail);
    }
    private IEnumerator Airborne()
    {
        _player.InputBlocked = false;
        _player.Revive();
        _body.position = new Vector2(5000f, 400f);
        _body.linearVelocity = Vector2.zero;
        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();
    }
    private IEnumerator Start()
    {
        var game = GetComponent<GameBootstrap>();
        while (game?.Pack == null) yield return null;
        _floor = new GameObject("GroundSlamFixtureFloor");
        _floor.transform.position = new Vector3(5000f, -16f, 0f);
        _floor.AddComponent<BoxCollider2D>().size = new Vector2(512f, 32f);
        var actor = new GameObject("GroundSlamFixturePlayer");
        actor.transform.position = new Vector3(5000f, 400f, 0f);
        _player = actor.AddComponent<PlayerActor>();
        _player.Configure(game.Pack, null);
        _body = actor.GetComponent<Rigidbody2D>();
        yield return Airborne();
        CheckThat("locked ability rejected", !Activate() && !Slamming);
        _player.GrantAbility("ground_slam");
        CheckThat("airborne unlock activates", Activate() && Slamming);
        CheckThat("repeated activation rejected", Slamming && !Activate());
        _body.linearVelocity = new Vector2(150f, 0f);
        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();
        var velocity = _body.linearVelocity;
        CheckThat("vertical slam controls physics", Mathf.Abs(velocity.x) < 1f && velocity.y < -850f, velocity.ToString());
        _player.GrantAbility("dash");
        CheckThat("dash overlap rejected", Slamming && !_player.TryDash(1f));
        var slamBeforeLanding = Slamming;
        yield return new WaitForSeconds(1f);
        CheckThat("real floor collision ends slam", slamBeforeLanding && !Slamming && Mathf.Abs(_body.position.y) < 2f, _body.position.ToString());
        CheckThat("grounded activation rejected", !Activate());
        yield return Airborne();
        var activeBeforeBlock = Activate() && Slamming;
        _player.InputBlocked = true;
        CheckThat("input blocking cancels slam", activeBeforeBlock && !Slamming && !Activate());
        yield return Airborne();
        var activeBeforeDeath = Activate() && Slamming;
        _player.Defeat();
        CheckThat("death cancels and blocks slam", activeBeforeDeath && !Slamming && !Activate());
        _player.Revive();
        CheckThat("revive resets slam", !Slamming);
        yield return Airborne();
#if ENABLE_INPUT_SYSTEM
        _keyboard = InputSystem.AddDevice<Keyboard>("MetroForgeSlamFixture");
        var inputActivated = false;
        for (var frame = 0; frame < 8; frame++)
        {
            InputSystem.QueueStateEvent(_keyboard, new KeyboardState(Key.S));
            yield return null;
            inputActivated |= Slamming;
        }
        InputSystem.QueueStateEvent(_keyboard, new KeyboardState());
        yield return null;
        CheckThat("real S input activates slam", inputActivated);
#else
        CheckThat("real S input activates slam", false, "Input System unavailable");
#endif
        var failures = _checks.FindAll(check => !check.passed).Count;
        var directory = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "qa");
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "ground-slam-result.json"), JsonUtility.ToJson(new Result { checks = _checks.Count, failures = failures, results = _checks.ToArray() }, true));
        Destroy(actor);
        Destroy(_floor);
        yield return null;
        Application.Quit(failures == 0 ? 0 : 1);
    }
    private void OnDestroy()
    {
#if ENABLE_INPUT_SYSTEM
        if (_keyboard != null && _keyboard.added) InputSystem.RemoveDevice(_keyboard);
#endif
    }
}
