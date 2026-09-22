using UnityEngine;

// Room-owned anchor: room caching also disables targeting and its marker.
public class WraithAnchor : MonoBehaviour
{
    private Material markerMaterial;
    private void Start()
    {
        var shader = Shader.Find("Sprites/Default");
        if (shader == null) return;
        var marker = gameObject.AddComponent<LineRenderer>();
        markerMaterial = new Material(shader);
        marker.sharedMaterial = markerMaterial;
        marker.useWorldSpace = false;
        marker.loop = true;
        marker.positionCount = 4;
        marker.widthMultiplier = 2f;
        marker.startColor = marker.endColor = new Color(0.45f, 0.85f, 0.8f, 1f);
        marker.sortingOrder = 24;
        marker.SetPosition(0, new Vector3(0, 10, 0));
        marker.SetPosition(1, new Vector3(7, 0, 0));
        marker.SetPosition(2, new Vector3(0, -10, 0));
        marker.SetPosition(3, new Vector3(-7, 0, 0));
    }
    private void OnDestroy()
    {
        if (markerMaterial != null) Destroy(markerMaterial);
    }
}
