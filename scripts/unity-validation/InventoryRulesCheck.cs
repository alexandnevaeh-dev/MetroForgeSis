using System;
class InventoryRulesCheck {
 static void Check(bool value) { if(!value) throw new Exception("Inventory rule failed"); }
 static void Main() {
  var armor=new InventoryItem{id="mail",category="armor",effects=new[]{new InventoryEffect{type="armor",value=25}}};
  var blade=new InventoryItem{id="blade",category="weapon",effects=new[]{new InventoryEffect{type="attack",value=8}}};
  var inventory=new GameplayInventory(new[]{armor,blade});
  Check(inventory.Grant("mail",3));Check(inventory.Count("mail")==3);Check(inventory.Effect("armor")==25);
  Check(inventory.Unequip("armor"));Check(inventory.Effect("armor")==0);Check(inventory.Equip("mail"));
  Check(inventory.Grant("blade",2));Check(inventory.Effect("attack")==8);
  Check(!inventory.Grant("missing",1));Check(!inventory.Grant("mail",-1));Check(!inventory.Equip("missing"));
  Check(!inventory.Grant("mail",int.MaxValue));Check(inventory.Count("mail")==3);
  bool rejected=false;try {new GameplayInventory(new[]{armor,armor});}catch(ArgumentException){rejected=true;}Check(rejected);
  inventory.Unequip("armor");var saved=inventory.Capture();
  var restored=new GameplayInventory(new[]{armor,blade});restored.Restore(saved);
  Check(restored.Count("mail")==3);Check(restored.Equipped("armor")=="");Check(restored.Effect("attack")==8);
  bool invalidSave=false;try { restored.Restore(new InventorySave{items=new[]{new InventoryCount{id="mail",count=-1}}}); }catch(ArgumentException){invalidSave=true;}
  Check(invalidSave);Check(restored.Count("mail")==3);
  restored.Restore(null);Check(restored.Count("mail")==0);Check(restored.Effect("attack")==0);
  Console.WriteLine("UNITY_INVENTORY_RULES_PASS");
 }
}
