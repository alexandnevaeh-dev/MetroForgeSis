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
  var vial=new InventoryItem{id="vial",category="consumable",effects=new[]{new InventoryEffect{type="heal",value=30}}};
  var consumables=new GameplayInventory(new[]{vial});Check(consumables.Grant("vial",2));
  float healed;Check(!consumables.TryConsumeHealing("vial",0,out healed));Check(consumables.Count("vial")==2);
  Check(consumables.TryConsumeHealing("vial",10,out healed));Check(healed==10&&consumables.Count("vial")==1);
  Check(!consumables.TryConsumeHealing("vial",float.NaN,out healed));Check(consumables.Count("vial")==1);
  Check(consumables.TryConsumeHealing("vial",40,out healed));Check(healed==30&&consumables.Count("vial")==0);
  Check(!consumables.TryConsumeHealing("vial",40,out healed));Check(consumables.Capture().items.Length==0);
  var stackItem=new InventoryItem{id="stack",category="material",maxStack=5};
  var stacks=new GameplayInventory(new[]{stackItem});Check(stacks.Grant("stack",12));
  Check(stacks.StackCount("stack")==3&&stacks.StackQuantity("stack",0)==5&&stacks.StackQuantity("stack",2)==2);
  Check(stacks.StackQuantity("stack",3)==0&&stacks.StackQuantity("stack",-1)==0&&stacks.StackCount("missing")==0);
  var stackSave=stacks.Capture();
  var resized=new GameplayInventory(new[]{new InventoryItem{id="stack",category="material",maxStack=4}});resized.Restore(stackSave);
  Check(resized.Count("stack")==12&&resized.StackCount("stack")==3&&resized.StackQuantity("stack",2)==4);
  var huge=new GameplayInventory(new[]{new InventoryItem{id="huge",maxStack=int.MaxValue}});Check(huge.Grant("huge",int.MaxValue));
  Check(huge.StackCount("huge")==1&&huge.StackQuantity("huge",0)==int.MaxValue);
  Console.WriteLine("UNITY_INVENTORY_RULES_PASS");
 }
}
