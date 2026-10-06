using System;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif
public sealed class InventoryPanelUI : MonoBehaviour
{
 GameBootstrap game;Action save;GameObject panel;UnityEngine.UI.Text summary;
 readonly UnityEngine.UI.Text[] labels=new UnityEngine.UI.Text[6];
 readonly UnityEngine.UI.Button[] actions=new UnityEngine.UI.Button[6];
 readonly UnityEngine.UI.Text[] actionLabels=new UnityEngine.UI.Text[6];
 InventoryCount[] owned=Array.Empty<InventoryCount>();int page;bool held;float priorTimeScale=1;
 UnityEngine.UI.Button previous,next;PlayerActor blockedPlayer;
 public bool IsOpen => panel!=null&&panel.activeSelf;
 public void Initialize(GameBootstrap owner,Action saveProgress)
 {
  game=owner;save=saveProgress;
  panel=Box("InventoryPanel",transform,new Color(0.055f,0.065f,0.085f,0.98f));
  Rect(panel).anchorMin=new Vector2(0.08f,0.10f);Rect(panel).anchorMax=new Vector2(0.92f,0.90f);Rect(panel).offsetMin=Rect(panel).offsetMax=Vector2.zero;
  var title=Label("Heading",panel.transform,"INVENTORY",24);Place(title.rectTransform,0.04f,0.86f,0.7f,0.98f);
  summary=Label("Loadout",panel.transform,"",14);Place(summary.rectTransform,0.04f,0.73f,0.96f,0.87f);
  var close=Button("Close",panel.transform,"Close · I",Close);Place(Rect(close.gameObject),0.75f,0.88f,0.96f,0.97f);
  for(int i=0;i<labels.Length;i++){
   int index=i;
   var row=Box("InventoryRow"+i,panel.transform,new Color(0.13f,0.15f,0.19f,1));
   float top=0.72f-i*0.095f;Place(Rect(row),0.04f,top-0.082f,0.96f,top);
   labels[i]=Label("Item",row.transform,"",16);Place(labels[i].rectTransform,0.025f,0,0.71f,1);
   actions[i]=Button("Action",row.transform,"",()=>Activate(index));Place(Rect(actions[i].gameObject),0.74f,0.1f,0.98f,0.9f);
   actionLabels[i]=actions[i].GetComponentInChildren<UnityEngine.UI.Text>();
  }
  previous=Button("Previous",panel.transform,"Previous",()=>{page--;Refresh();});Place(Rect(previous.gameObject),0.04f,0.025f,0.25f,0.115f);
  next=Button("Next",panel.transform,"Next",()=>{page++;Refresh();});Place(Rect(next.gameObject),0.75f,0.025f,0.96f,0.115f);
  var hint=Label("Hint",panel.transform,"Game paused",14);Place(hint.rectTransform,0.30f,0.025f,0.70f,0.115f);
  panel.SetActive(false);
 }
 void Update(){
  bool pressed=Input.GetKey(KeyCode.I);
#if ENABLE_INPUT_SYSTEM
  pressed|=Keyboard.current!=null&&Keyboard.current.iKey.isPressed;
#endif
  if(pressed&&!held){if(IsOpen)Close();else Open();}held=pressed;
  if(IsOpen&&(game==null||game.Player==null||game.OnTitleScreen))Close();
 }
 public void Open(){if(panel==null||IsOpen||game==null||game.Player==null||game.Player.Dead||game.OnTitleScreen)return;blockedPlayer=game.Player;blockedPlayer.InputBlocked=true;priorTimeScale=Time.timeScale;Time.timeScale=0;page=0;panel.SetActive(true);panel.transform.SetAsLastSibling();Refresh();}
 public void Close(){if(!IsOpen)return;panel.SetActive(false);Time.timeScale=priorTimeScale;if(blockedPlayer!=null)blockedPlayer.InputBlocked=false;blockedPlayer=null;}
 void OnDisable(){Close();}
 void OnDestroy(){if(blockedPlayer!=null){blockedPlayer.InputBlocked=false;Time.timeScale=priorTimeScale;}}
 void Refresh(){
  if(game.Player==null)return;var inventory=game.Player.Inventory;owned=inventory.Capture().items;page=Mathf.Clamp(page,0,Mathf.Max(0,(owned.Length-1)/6));
  summary.text="Weapon: "+Display(inventory.Equipped("weapon"))+"   Armor: "+Display(inventory.Equipped("armor"))+"\nCharm: "+Display(inventory.Equipped("charm"))+"   HP "+game.Player.Health.ToString("0")+" / "+game.Player.MaxHealth.ToString("0");
  for(int i=0;i<6;i++){
   int index=page*6+i;labels[i].transform.parent.gameObject.SetActive(index<owned.Length);if(index>=owned.Length)continue;
   var entry=owned[index];string category=inventory.Category(entry.id);bool equipment=category=="weapon"||category=="armor"||category=="charm";
   labels[i].text=Display(entry.id)+"  ×"+entry.count+"  ("+inventory.StackCount(entry.id)+" stacks, "+inventory.StackLimit(entry.id)+" per stack)";actionLabels[i].text=equipment?(inventory.Equipped(category)==entry.id?"Unequip":"Equip"):category=="consumable"?"Use":"Stored";
   actions[i].interactable=equipment||category=="consumable";
  }
  if(owned.Length==0)summary.text+="\nNo items collected yet.";
  previous.interactable=page>0;next.interactable=(page+1)*6<owned.Length;
 }
 string Display(string id){return string.IsNullOrEmpty(id)?"None":game.Player.Inventory.Name(id);}
 void Activate(int row){int index=page*6+row;if(index>=owned.Length||game.Player==null)return;var inventory=game.Player.Inventory;string id=owned[index].id,category=inventory.Category(id);
  if(category=="consumable")game.Player.UseConsumable(id);
  else{bool changed=inventory.Equipped(category)==id?inventory.Unequip(category):inventory.Equip(id);if(changed)save?.Invoke();}
  Refresh();
 }
 static RectTransform Rect(GameObject go)=>go.GetComponent<RectTransform>();
 static void Place(RectTransform rt,float x0,float y0,float x1,float y1){rt.anchorMin=new Vector2(x0,y0);rt.anchorMax=new Vector2(x1,y1);rt.offsetMin=rt.offsetMax=Vector2.zero;}
 static GameObject Box(string name,Transform parent,Color color){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);go.AddComponent<UnityEngine.UI.Image>().color=color;return go;}
 static UnityEngine.UI.Text Label(string name,Transform parent,string text,int size){var go=new GameObject(name,typeof(RectTransform));go.transform.SetParent(parent,false);var label=go.AddComponent<UnityEngine.UI.Text>();label.font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");label.text=text;label.fontSize=size;label.color=new Color(0.93f,0.95f,0.98f);label.alignment=TextAnchor.MiddleLeft;label.raycastTarget=false;return label;}
 static UnityEngine.UI.Button Button(string name,Transform parent,string text,Action clicked){var go=Box(name,parent,new Color(0.25f,0.29f,0.35f));var button=go.AddComponent<UnityEngine.UI.Button>();button.onClick.AddListener(()=>clicked());var label=Label("Label",go.transform,text,14);label.alignment=TextAnchor.MiddleCenter;Place(label.rectTransform,0,0,1,1);return button;}
}
