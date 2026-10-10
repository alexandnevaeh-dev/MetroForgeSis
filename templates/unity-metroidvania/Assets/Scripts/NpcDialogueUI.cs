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
    DialogueConversation conversation;
    readonly List<NpcActor> actors = new List<NpcActor>();
    readonly List<GameObject> choiceRows = new List<GameObject>();
    GameObject panel;
    Transform choiceContent;
    Text heading, body, prompt;
    Button next;
    NpcActor speaker;
    PlayerActor blockedPlayer;
    float previousTimeScale;
    bool eHeld, escapeHeld, ownsPause;
    int closedAtFrame = -1;
    public bool IsOpen => conversation != null && conversation.IsOpen;
    public bool BlocksTitleReturn => IsOpen || closedAtFrame == Time.frameCount;
    public string CurrentText => conversation?.Line?.text;
    public int ChoiceCount => conversation?.Line?.choices?.Length ?? 0;
    public int OpenCount { get; private set; }
    public void Register(NpcActor actor) { if(actor != null && !actors.Contains(actor)) actors.Add(actor); }
    public void Initialize(GameBootstrap owner)
    {
        game = owner; conversation = new DialogueConversation(owner.Pack.dialogues);
        prompt = Label("TalkPrompt", transform, 18); Place(prompt.rectTransform,.28f,.02f,.72f,.09f);
        prompt.alignment = TextAnchor.MiddleCenter;
        panel = Box("DialoguePanel", transform, new Color(.08f,.065f,.05f,.98f));
        Place(Rect(panel),.08f,.10f,.92f,.58f);
        heading = Label("Speaker",panel.transform,22); Place(heading.rectTransform,.04f,.83f,.72f,.97f);
        body = Label("DialogueText",panel.transform,18); Place(body.rectTransform,.04f,.54f,.96f,.82f);
        body.alignment = TextAnchor.UpperLeft;
        var scrollGo = Box("DialogueChoices",panel.transform,new Color(.12f,.10f,.08f,1));
        Place(Rect(scrollGo),.04f,.16f,.96f,.52f);
        scrollGo.AddComponent<Mask>().showMaskGraphic = true;
        var scroll = scrollGo.AddComponent<ScrollRect>(); scroll.horizontal = false;
        var content = new GameObject("Choices",typeof(RectTransform)); content.transform.SetParent(scrollGo.transform,false);
        var contentRect = Rect(content); contentRect.anchorMin = new Vector2(0,1);contentRect.anchorMax = Vector2.one;contentRect.pivot = new Vector2(.5f,1);contentRect.offsetMin = contentRect.offsetMax = Vector2.zero;
        var layout = content.AddComponent<VerticalLayoutGroup>(); layout.spacing = 4;layout.childControlHeight = true;layout.childForceExpandHeight = false;layout.childControlWidth = true;layout.childForceExpandWidth = true;
        content.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
        choiceContent = content.transform; scroll.content = contentRect; scroll.viewport = Rect(scrollGo);
        next = ActionButton("Next",panel.transform,"Continue · E",Advance); Place(Rect(next.gameObject),.68f,.02f,.96f,.14f);
        var close = ActionButton("Close",panel.transform,"Close · Esc",Close);Place(Rect(close.gameObject),.75f,.85f,.96f,.97f);
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
        foreach(var row in choiceRows) {row.SetActive(false);Destroy(row);} choiceRows.Clear();
        var choices = conversation.Line.choices ?? Array.Empty<GameplayDialogueChoice>();
        next.gameObject.SetActive(choices.Length == 0);
        for(int i = 0;i < choices.Length;i++) {
            int index = i;var choice = choices[i];var button = ActionButton("Choice"+i,choiceContent,choice.text,()=>Choose(index));
            button.gameObject.AddComponent<LayoutElement>().preferredHeight = 44;
            button.interactable = string.IsNullOrEmpty(choice.action);
            if(!button.interactable) button.GetComponentInChildren<Text>().text += " · unavailable";
            choiceRows.Add(button.gameObject);
        }
    }
    public void Close()
    {
        conversation?.Close();if(panel != null)panel.SetActive(false);
        if(blockedPlayer != null) blockedPlayer.InputBlocked = false;
        if(ownsPause) { Time.timeScale = previousTimeScale; closedAtFrame = Time.frameCount; }
        ownsPause = false;
        blockedPlayer = null;speaker = null;
    }
    void OnDisable(){Close();}
    void OnDestroy(){Close();}
    static RectTransform Rect(GameObject go) => go.GetComponent<RectTransform>();
    static void Place(RectTransform rect,float x0,float y0,float x1,float y1){rect.anchorMin=new Vector2(x0,y0);rect.anchorMax=new Vector2(x1,y1);rect.offsetMin=rect.offsetMax=Vector2.zero;}
    static GameObject Box(string name,Transform parent,Color color){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);go.AddComponent<Image>().color=color;return go;}
    static Text Label(string name,Transform parent,int size){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var label=go.AddComponent<Text>();label.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");label.fontSize=size;label.color=new Color(.96f,.91f,.78f);label.raycastTarget=false;return label;}
    static Button ActionButton(string name,Transform parent,string text,Action action){var go=Box(name,parent,new Color(.28f,.23f,.17f));var button=go.AddComponent<Button>();button.onClick.AddListener(()=>action());var label=Label("Label",go.transform,16);label.text=text;label.alignment=TextAnchor.MiddleCenter;Place(label.rectTransform,0,0,1,1);return button;}
}
