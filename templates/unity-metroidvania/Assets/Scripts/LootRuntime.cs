using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
[Serializable] public class LootEnemySource { public string id; public string lootTableId; }
[Serializable] public class LootEnemyCatalog { public LootEnemySource[] enemies; }
public sealed class LootRuntime
{
 readonly Dictionary<string,LootTable> tables = new Dictionary<string,LootTable>();
 readonly Dictionary<string,string> sources = new Dictionary<string,string>();
 readonly HashSet<string> items = new HashSet<string>();
 readonly System.Random random = new System.Random();
 public LootRuntime(string root)
 {
  var lootPath=Path.Combine(root,"data","loot","loot_tables.json");
  if(!File.Exists(lootPath))return;
  var catalog=JsonUtility.FromJson<LootCatalog>(File.ReadAllText(lootPath));
  var itemCatalog=JsonUtility.FromJson<InventoryCatalog>(File.ReadAllText(Path.Combine(root,"data","items","items.json")));
  foreach(var item in itemCatalog.items??Array.Empty<InventoryItem>())items.Add(item.id);
  foreach(var table in catalog.tables??Array.Empty<LootTable>()){
   GameplayLoot.Roll(table,items,()=>0); // Validate the complete catalog before any death can award items.
   tables.Add(table.id,table);
  }
  var enemyPath=Path.Combine(root,"data","enemies","enemies.json");
  if(!File.Exists(enemyPath))return;
  var enemies=JsonUtility.FromJson<LootEnemyCatalog>(File.ReadAllText(enemyPath));
  foreach(var enemy in enemies.enemies??Array.Empty<LootEnemySource>()){
   if(string.IsNullOrEmpty(enemy.lootTableId))continue;
   if(!tables.ContainsKey(enemy.lootTableId))throw new ArgumentException("Unknown enemy loot table: "+enemy.lootTableId);
   sources.Add(enemy.id,enemy.lootTableId);
  }
 }
 public void Spawn(EnemyActor enemy, Action collected)
 {
  if(enemy==null||!sources.TryGetValue(enemy.EnemyId,out var tableId))return;
  var drops=GameplayLoot.Roll(tables[tableId],items,random.NextDouble);
  for(int i=0;i<drops.Count;i++){
   var go=new GameObject("Loot_"+drops[i].itemId);
   go.transform.SetParent(enemy.transform.parent,false);
   go.transform.position=enemy.transform.position+new Vector3((i-(drops.Count-1)*0.5f)*20f,12f,0f);
   var pickup=go.AddComponent<InventoryPickup>();
   pickup.Configure(drops[i].itemId,drops[i].quantity,collected);
  }
 }
}
public sealed class InventoryPickup : MonoBehaviour
{
 string itemId;int quantity;bool claimed;Action collected;Sprite icon;
 public void Configure(string id,int amount,Action onCollected)
 {
  itemId=id;quantity=amount;collected=onCollected;
  var collider=gameObject.AddComponent<BoxCollider2D>();collider.isTrigger=true;collider.size=new Vector2(16,16);
  var body=gameObject.AddComponent<Rigidbody2D>();body.bodyType=RigidbodyType2D.Kinematic;body.gravityScale=0;
  // Temporary pickup marker until authored inventory icons are available.
  var renderer=gameObject.AddComponent<SpriteRenderer>();
  icon=Sprite.Create(Texture2D.whiteTexture,new Rect(0,0,1,1),new Vector2(0.5f,0.5f),1);
  renderer.sprite=icon;renderer.drawMode=SpriteDrawMode.Sliced;renderer.size=new Vector2(10,10);renderer.color=new Color(0.9f,0.65f,0.25f);renderer.sortingOrder=15;
 }
 void OnTriggerEnter2D(Collider2D other)
 {
  if(claimed)return;
  var player=other.GetComponentInParent<PlayerActor>();
  if(player==null||player.Dead)return;
  claimed=true;
  if(!player.Inventory.Grant(itemId,quantity)){claimed=false;return;}
  GetComponent<Collider2D>().enabled=false;
  Destroy(gameObject);
  collected?.Invoke();
 }
 void OnDestroy(){if(icon!=null)Destroy(icon);}
}
