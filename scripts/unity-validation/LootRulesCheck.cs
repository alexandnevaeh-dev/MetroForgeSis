using System;
using System.Collections.Generic;
class LootRulesCheck {
 static void Check(bool value){if(!value)throw new Exception("Loot rule failed");}
 static void Main(){
  var table=new LootTable{id="test",name="Test",entries=new[]{new LootEntry{itemId="armor",chance=1,minQuantity=2,maxQuantity=4}}};
  var known=new HashSet<string>{"armor","vial"};
  Check(GameplayLoot.Roll(table,known,()=>0)[0].quantity==2);
  Check(GameplayLoot.Roll(table,known,()=>0.999999)[0].quantity==4);
  table.entries[0].chance=0.5;Check(GameplayLoot.Roll(table,known,()=>0.5).Count==0);
  table.entries[0].chance=0;Check(GameplayLoot.Roll(table,known,()=>{throw new Exception("Unexpected RNG");}).Count==0);
  table.entries[0].chance=1;table.entries[0].maxQuantity=2;
  Check(GameplayLoot.Roll(table,known,()=>{throw new Exception("Unexpected RNG");})[0].quantity==2);
  table.entries=new[]{table.entries[0],new LootEntry{itemId="vial",chance=1,minQuantity=1,maxQuantity=1}};
  Check(GameplayLoot.Roll(table,known,()=>0).Count==2);
  int calls=0;table.entries[1].itemId="missing";bool rejected=false;
  try{GameplayLoot.Roll(table,known,()=>{calls++;return 0;});}catch(ArgumentException){rejected=true;}Check(rejected&&calls==0);
  table.entries=new[]{new LootEntry{itemId="armor",chance=0.5,minQuantity=1,maxQuantity=1}};
  foreach(var value in new[]{double.NaN,double.PositiveInfinity,-0.1,1.0}){rejected=false;try{GameplayLoot.Roll(table,known,()=>value);}catch(ArgumentException){rejected=true;}Check(rejected);}
  Console.WriteLine("UNITY_LOOT_RULES_PASS");
 }
}
