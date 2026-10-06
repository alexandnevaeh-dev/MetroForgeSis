using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
[DefaultExecutionOrder(-1000)]
public class HealingInputFeed : MonoBehaviour {
 public Keyboard Keyboard;
 public bool Held;
 void Update(){if(Keyboard==null)return;InputSystem.QueueStateEvent(Keyboard,Held?new KeyboardState(Key.H):new KeyboardState());InputSystem.Update();}
}
