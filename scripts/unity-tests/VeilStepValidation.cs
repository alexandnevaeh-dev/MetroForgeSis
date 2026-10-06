#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
public static class VeilStepValidation {
 public static void Run() { EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single); EditorApplication.EnterPlaymode(); }
}
#endif
