using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public sealed class NpcDialogueUI : MonoBehaviour
{
    GameBootstrap game;
    Canvas canvas;
    float fontScale;
    int viewportWidth, viewportHeight;
    readonly Dictionary<UnityEngine.UI.Text,int> fontPixels = new Dictionary<UnityEngine.UI.Text,int>();
    DialogueConversation conversation;
    readonly List<NpcActor> actors = new List<NpcActor>();
    readonly List<GameObject> choiceRows = new List<GameObject>();
    GameObject panel;
    GameObject bodyView, choicesView;
    Button close;
    Transform choiceContent;
    Text heading, body, prompt;
    Button next;
    NpcActor speaker;
    PlayerActor blockedPlayer;
    float previousTimeScale;
    bool eHeld, escapeHeld, ownsPause;
    int closedAtFrame = -1;
    GameObject previousSelection, lastSelection;
    public bool IsOpen => conversation != null && conversation.IsOpen;
    public bool BlocksTitleReturn => IsOpen || closedAtFrame == Time.frameCount;
    public string CurrentText => conversation?.Line?.text;
    public int ChoiceCount => conversation?.Line?.choices?.Length ?? 0;
    public int OpenCount { get; private set; }
    public void Register(NpcActor actor) { if(actor != null && !actors.Contains(actor)) actors.Add(actor); }
    public void Initialize(GameBootstrap owner)
    {
        canvas = GetComponent<Canvas>();
        game = owner; conversation = new DialogueConversation(owner.Pack.dialogues);
        prompt = Label("TalkPrompt", transform, 18); Place(prompt.rectTransform,.28f,.02f,.72f,.09f);
        prompt.alignment = TextAnchor.MiddleCenter;
        panel = Box("DialoguePanel", transform, new Color(.08f,.065f,.05f,.98f));
        Rect(panel).anchorMin = Rect(panel).anchorMax = new Vector2(.5f,0);
        Rect(panel).pivot = new Vector2(.5f,0);
        heading = Label("Speaker",panel.transform,22); Place(heading.rectTransform,.04f,.83f,.72f,.97f);
        bodyView = Box("DialogueBody",panel.transform,Color.clear);
        var bodyScroll = bodyView.AddComponent<UnityEngine.UI.ScrollRect>();bodyScroll.horizontal = false;bodyScroll.movementType = UnityEngine.UI.ScrollRect.MovementType.Clamped;
        var bodyViewport = Box("Viewport",bodyView.transform,Color.white);Place(Rect(bodyViewport),0,0,1,1);bodyViewport.GetComponent<UnityEngine.UI.Image>().color=Color.clear;bodyViewport.AddComponent<UnityEngine.UI.RectMask2D>();
        body = Label("DialogueText",bodyViewport.transform,18);
        body.rectTransform.anchorMin = new Vector2(0,1);body.rectTransform.anchorMax = Vector2.one;body.rectTransform.pivot = new Vector2(.5f,1);body.rectTransform.offsetMin = body.rectTransform.offsetMax = Vector2.zero;
        body.gameObject.AddComponent<UnityEngine.UI.ContentSizeFitter>().verticalFit = UnityEngine.UI.ContentSizeFitter.FitMode.PreferredSize;
        bodyScroll.content = body.rectTransform;bodyScroll.viewport = Rect(bodyViewport);
        body.alignment = TextAnchor.UpperLeft;
        var scrollGo = Box("DialogueChoices",panel.transform,new Color(.12f,.10f,.08f,1));
        choicesView = scrollGo;
        Place(Rect(scrollGo),.04f,.16f,.96f,.52f);
        var scroll = scrollGo.AddComponent<ScrollRect>(); scroll.horizontal = false;
        var viewport = Box("Viewport",scrollGo.transform,Color.white);Place(Rect(viewport),0,0,1,1);viewport.GetComponent<UnityEngine.UI.Image>().color=Color.clear;viewport.AddComponent<UnityEngine.UI.RectMask2D>();
        var content = new GameObject("Choices",typeof(RectTransform)); content.transform.SetParent(viewport.transform,false);
        var contentRect = Rect(content); contentRect.anchorMin = new Vector2(0,1);contentRect.anchorMax = Vector2.one;contentRect.pivot = new Vector2(.5f,1);contentRect.offsetMin = contentRect.offsetMax = Vector2.zero;
        var layout = content.AddComponent<VerticalLayoutGroup>(); layout.spacing = 8;layout.childControlHeight = true;layout.childForceExpandHeight = false;layout.childControlWidth = true;layout.childForceExpandWidth = true;
        content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
        choiceContent = content.transform; scroll.content = contentRect; scroll.viewport = Rect(viewport);scroll.movementType = UnityEngine.UI.ScrollRect.MovementType.Clamped;
        next = ActionButton("Next",panel.transform,"Continue · E",Advance); Place(Rect(next.gameObject),.68f,.02f,.96f,.14f);
        close = ActionButton("Close",panel.transform,"Close · Esc",Close);Place(Rect(close.gameObject),.75f,.85f,.96f,.97f);
        panel.SetActive(false);
    }
    NpcActor Nearest()
    {
        if(game == null || game.Player == null) return null;
        NpcActor result = null; float best = 96f * 96f;
        foreach(var actor in actors)
        {
            if(actor == null || !actor.isActiveAndEnabled) continue;
            float distance = ((Vector2)actor.transform.position - (Vector2)game.Player.transform.position).sqrMagnitude;
            if(distance < best) {best = distance; result = actor;}
        }
        return result;
    }
    void Update()
    {
        RefreshFontScale();
        bool e = false, escape = false;
#if ENABLE_INPUT_SYSTEM
        var keyboard = Keyboard.current;
        if(keyboard != null) { e = keyboard.eKey.isPressed; escape = keyboard.escapeKey.isPressed; }
#else
        e = Input.GetKey(KeyCode.E); escape = Input.GetKey(KeyCode.Escape);
#endif
        if(IsOpen && (game == null || game.Player != blockedPlayer || blockedPlayer == null || blockedPlayer.Dead || game.OnTitleScreen || speaker == null || !speaker.isActiveAndEnabled)) Close();
        if(escape && !escapeHeld && IsOpen) Close();
        else if(e && !eHeld) { if(IsOpen) Advance(); else Interact(); }
        eHeld = e; escapeHeld = escape;
        if(prompt != null) {
            var nearby = !IsOpen && game != null && game.Player != null && !game.Player.InputBlocked && !game.OnTitleScreen ? Nearest() : null;
            prompt.text = nearby != null ? "E · Talk to " + nearby.Definition.name : "";
        }
    }
    public bool Interact()
    {
        if(IsOpen || game == null || game.Player == null || game.Player.Dead || game.Player.InputBlocked || game.OnTitleScreen) return false;
        var actor = Nearest(); if(actor == null) return false;
        bool opened = false;
        foreach(var id in actor.Definition.dialogueIds ?? Array.Empty<string>()) if(conversation.Open(id)) {opened = true;break;}
        if(!opened) return false;
        previousSelection = UnityEngine.EventSystems.EventSystem.current?.currentSelectedGameObject;
        speaker = actor;blockedPlayer = game.Player;blockedPlayer.InputBlocked = true;
        previousTimeScale = Time.timeScale;ownsPause = true;Time.timeScale = 0;panel.SetActive(true);panel.transform.SetAsLastSibling();OpenCount++;Refresh();return true;
    }
    public void Advance() { if(!IsOpen)return;conversation.Advance();if(IsOpen)Refresh();else Close(); }
    public bool Choose(int index)
    {
        // Quest/shop actions remain unavailable until their authoritative runtimes exist.
        if(!conversation.Choose(index,null)) return false;
        if(IsOpen)Refresh();else Close();return true;
    }
    void Refresh()
    {
        heading.text = conversation.Line.speaker ?? speaker.Definition.name;
        body.text = conversation.Line.text;
        foreach(var row in choiceRows) {foreach(var label in row.GetComponentsInChildren<UnityEngine.UI.Text>())fontPixels.Remove(label);row.SetActive(false);Destroy(row);} choiceRows.Clear();
        var choices = conversation.Line.choices ?? Array.Empty<GameplayDialogueChoice>();
        choicesView.SetActive(choices.Length > 0);
        next.gameObject.SetActive(choices.Length == 0);
        for(int i = 0;i < choices.Length;i++) {
            int index = i;var choice = choices[i];var button = ActionButton("Choice"+i,choiceContent,choice.text,()=>Choose(index));
            button.gameObject.AddComponent<LayoutElement>().preferredHeight = 48 / Mathf.Max(.1f,canvas.scaleFactor);
            button.interactable = string.IsNullOrEmpty(choice.action);
            if(!button.interactable) button.GetComponentInChildren<Text>().text += " · unavailable";
            choiceRows.Add(button.gameObject);
        }
        LayoutPanel();
        var enabled = new List<UnityEngine.UI.Button>();
        foreach(var row in choiceRows) {var button=row.GetComponent<UnityEngine.UI.Button>();if(button.interactable)enabled.Add(button);}
        for(int i=0;i<enabled.Count;i++) {
            var navigation=new UnityEngine.UI.Navigation {mode=UnityEngine.UI.Navigation.Mode.Explicit,selectOnUp=enabled[(i+enabled.Count-1)%enabled.Count],selectOnDown=enabled[(i+1)%enabled.Count]};
            enabled[i].navigation=navigation;
        }
        var focus=choices.Length==0?next:enabled.Count>0?enabled[0]:close;
        UnityEngine.EventSystems.EventSystem.current?.SetSelectedGameObject(focus.gameObject);
        lastSelection=null;
    }
    public void Close()
    {
        conversation?.Close();if(panel != null)panel.SetActive(false);
        var events=UnityEngine.EventSystems.EventSystem.current;
        if(panel!=null&&events!=null&&events.currentSelectedGameObject!=null&&events.currentSelectedGameObject.transform.IsChildOf(panel.transform))
            events.SetSelectedGameObject(previousSelection!=null&&previousSelection.activeInHierarchy?previousSelection:null);
        previousSelection=null;lastSelection=null;
        if(blockedPlayer != null) blockedPlayer.InputBlocked = false;
        if(ownsPause) { Time.timeScale = previousTimeScale; closedAtFrame = Time.frameCount; }
        ownsPause = false;
        blockedPlayer = null;speaker = null;
    }
    void OnDisable(){Close();}
    void OnDestroy(){Close();}
    void RefreshFontScale()
    {
        float scale=Mathf.Max(.1f,canvas!=null?canvas.scaleFactor:1f);
        if(Mathf.Approximately(fontScale,scale)&&viewportWidth==Screen.width&&viewportHeight==Screen.height)return;
        fontScale=scale;
        viewportWidth=Screen.width;viewportHeight=Screen.height;
        foreach(var entry in fontPixels)if(entry.Key!=null)entry.Key.fontSize=Mathf.Clamp(Mathf.RoundToInt(entry.Value/scale),12,96);
        if(IsOpen)LayoutPanel();
    }
    void LayoutPanel()
    {
        float scale=Mathf.Max(.1f,canvas.scaleFactor);
        Rect(panel).sizeDelta = new Vector2(Mathf.Min(Screen.width*.84f,960f)/scale,160f/scale);
        Rect(panel).anchoredPosition = new Vector2(0,24f/scale);
        PixelBox(heading.rectTransform,16,28,16,140,scale);
        PixelBox(Rect(bodyView),56,24,16,16,scale);
        Canvas.ForceUpdateCanvases();
        float choices = ChoiceCount > 0 ? Mathf.Min(144f,ChoiceCount*48f+(ChoiceCount-1)*8f) : 0f;
        float fixedHeight=16+28+12+12+40+16+(choices>0?choices+12:0);
        float bodyHeight=Mathf.Clamp(body.preferredHeight*scale,24f,Mathf.Max(24f,Mathf.Min(120f,Screen.height*.6f-fixedHeight)));
        float height=fixedHeight+bodyHeight;
        Rect(panel).sizeDelta = new Vector2(Rect(panel).sizeDelta.x,height/scale);
        PixelBox(Rect(bodyView),56,bodyHeight,16,16,scale);
        if(choices>0)PixelBox(Rect(choicesView),56+bodyHeight+12,choices,16,16,scale);
        choiceContent.GetComponent<UnityEngine.UI.VerticalLayoutGroup>().spacing=8/scale;
        foreach(var row in choiceRows)row.GetComponent<UnityEngine.UI.LayoutElement>().preferredHeight=48/scale;
        CornerBox(Rect(next.gameObject),false,180,40,scale);
        CornerBox(Rect(close.gameObject),true,108,32,scale);
    }
    static void PixelBox(RectTransform rect,float top,float height,float left,float right,float scale)
    {rect.anchorMin=new Vector2(0,1);rect.anchorMax=Vector2.one;rect.pivot=new Vector2(.5f,1);rect.offsetMin=new Vector2(left/scale,-(top+height)/scale);rect.offsetMax=new Vector2(-right/scale,-top/scale);}
    static void CornerBox(RectTransform rect,bool top,float width,float height,float scale)
    {rect.anchorMin=rect.anchorMax=new Vector2(1,top?1:0);rect.pivot=new Vector2(1,top?1:0);rect.anchoredPosition=new Vector2(-16/scale,(top?-16:16)/scale);rect.sizeDelta=new Vector2(width/scale,height/scale);}
    void LateUpdate()
    {
        var selected=UnityEngine.EventSystems.EventSystem.current?.currentSelectedGameObject;
        if(!IsOpen||selected==null||selected==lastSelection||!selected.transform.IsChildOf(choiceContent))return;
        lastSelection=selected;
        Canvas.ForceUpdateCanvases();
        var scroll=choicesView.GetComponent<UnityEngine.UI.ScrollRect>();var viewport=scroll.viewport;
        var bounds=RectTransformUtility.CalculateRelativeRectTransformBounds(viewport,selected.transform);
        var position=scroll.content.anchoredPosition;
        if(bounds.min.y<viewport.rect.yMin)position.y+=viewport.rect.yMin-bounds.min.y;
        if(bounds.max.y>viewport.rect.yMax)position.y-=bounds.max.y-viewport.rect.yMax;
        position.y=Mathf.Clamp(position.y,0,Mathf.Max(0,scroll.content.rect.height-viewport.rect.height));
        scroll.content.anchoredPosition=position;scroll.velocity=Vector2.zero;
    }
    static RectTransform Rect(GameObject go) => go.GetComponent<RectTransform>();
    static void Place(RectTransform rect,float x0,float y0,float x1,float y1){rect.anchorMin=new Vector2(x0,y0);rect.anchorMax=new Vector2(x1,y1);rect.offsetMin=rect.offsetMax=Vector2.zero;}
    static GameObject Box(string name,Transform parent,Color color){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);go.AddComponent<Image>().color=color;return go;}
    Text Label(string name,Transform parent,int size){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var label=go.AddComponent<Text>();label.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");fontPixels[label]=size;label.fontSize=Mathf.Clamp(Mathf.RoundToInt(size/Mathf.Max(.1f,canvas!=null?canvas.scaleFactor:1f)),12,96);label.color=new Color(.96f,.91f,.78f);label.raycastTarget=false;return label;}
    Button ActionButton(string name,Transform parent,string text,Action action){var go=Box(name,parent,Color.white);var button=go.AddComponent<UnityEngine.UI.Button>();button.targetGraphic=go.GetComponent<UnityEngine.UI.Image>();var colors=button.colors;colors.normalColor=new Color(.28f,.23f,.17f);colors.highlightedColor=new Color(.40f,.32f,.20f);colors.selectedColor=new Color(.42f,.33f,.19f);colors.pressedColor=new Color(.32f,.26f,.16f);colors.disabledColor=new Color(.16f,.14f,.11f);button.colors=colors;button.onClick.AddListener(()=>action());var label=Label("Label",go.transform,16);label.text=text;label.alignment=TextAnchor.MiddleCenter;Place(label.rectTransform,0,0,1,1);return button;}
}
