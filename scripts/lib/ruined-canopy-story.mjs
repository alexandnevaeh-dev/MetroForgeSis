// Original story and gameplay definitions. Reused by the generated test world.
export const CANOPY_SPELLS={version:1,autoStartQuests:['story_return_seed'],spells:[
  {id:'seedflare',name:'Seedflare',cost:18,cooldown:1.2,description:'An ember carried through the grove. Q fires a seed of light that bursts against an enemy or wall.'},
  {id:'rootward',name:'Rootward',cost:25,cooldown:7,description:'The old oath made tangible. R raises bark armor for 2.5 seconds, reducing incoming damage.'},
  {id:'bloomstep',name:'Bloomstep',cost:20,cooldown:4,description:'The garden remembers your footsteps. F makes an extended invulnerable dash along your facing, stopping at solid terrain.'},
]};
export const CANOPY_LORE={title:'The Ruined Canopy: The Verdant Oath',
  premise:'Aster carries the First Seed through the last inhabited woodland. The Hollow Crown was once its protector; the silence of the bells bound it to an oath that no living voice can release.',
  factions:[{name:'The Seedbearers',belief:'A living promise must be renewed, never enforced forever.'},{name:'The Bellwrights',belief:'Memory is a shared duty. Their silence allowed the Crown to keep an impossible oath.'},{name:'The Lastlight Keepers',belief:'Sanctuary means sheltering the stranger, even when the forest is afraid.'}],
  locations:[{id:'canopy_hamlet',history:'The final refuge built beside the old root road. Its lamps are tended by Iri.'},{id:'canopy_archive',history:'Soren keeps the broken bells and the testimonies of those who asked the Crown never to let them die.'},{id:'canopy_observatory',history:'The Seedbearers once read the sun here; a preserved ember teaches Seedflare.'},{id:'canopy_gardens',history:'Water drowned the gardens when their keeper tried to shelter every root from the same storm.'},{id:'canopy_cistern',history:'A working of the first oath survives in these living waterworks: Rootward.'},{id:'canopy_moonwell',history:'The well preserves footsteps of a garden that no longer exists. Its memory teaches Bloomstep.'}],
  arc:['Find the Verdant Disc and reconnect the root roads.','Meet the last inhabitants, learn the three living words, and recover two testimonies.','Return the First Seed to the Hollow Crown and release its impossible oath.'],productionApproved:false};

export function addCanopyStory(content){
  for(const spell of CANOPY_SPELLS.spells)content.items.push({id:spell.id,name:spell.name,description:spell.description,category:'key',stackable:false,maxStack:1,value:0,effects:[]});
  content.items.push(
    {id:'memory_bell',name:'The Silent Bell Testimony',description:'We asked the Crown for one more spring. Then another. We stopped ringing the bells because their answer frightened us.',category:'quest',stackable:false,maxStack:1,value:0,effects:[]},
    {id:'memory_crown',name:'The Crownkeeper Testimony',description:'The guardian did not betray us. We left it holding a promise that had no ending. Bring a living seed, not another chain.',category:'quest',stackable:false,maxStack:1,value:0,effects:[]},
  );
  content.npcs=[
    {id:'npc_000',name:'Mira of the Roots',role:'lore',roomId:'overworld',dialogueIds:['dlg_npc_000_lore'],questIds:[]},
    {id:'npc_001',name:'Iri, Lastlight Keeper',role:'quest_giver',roomId:'canopy_hamlet',dialogueIds:['story_living_words_offer'],questIds:['story_living_words']},
    {id:'npc_002',name:'Soren, Bellwright',role:'quest_giver',roomId:'canopy_archive',dialogueIds:['story_oath_memory_offer'],questIds:['story_oath_memory']},
  ];
  content.quests=[
    {id:'story_return_seed',name:'The First Seed',description:'Release the Hollow Crown from the oath that has outlived its people.',prerequisites:[],objectives:[{id:'release',type:'BossKill',target:'boss_final',count:1,description:'Face the Hollow Crown'}],rewards:[]},
    {id:'story_living_words',name:'Three Living Words',description:'Iri believes the old workings can protect the living again.',prerequisites:[],objectives:CANOPY_SPELLS.spells.map(spell=>({id:spell.id,type:'Collect',target:spell.id,count:1,description:'Learn '+spell.name})),rewards:[{type:'currency',id:'scrap',amount:50}]},
    {id:'story_oath_memory',name:'The Oath We Broke',description:'Recover the testimonies of the bellwrights and the crownkeeper.',prerequisites:[],objectives:[{id:'bell',type:'Collect',target:'memory_bell',count:1,description:'Recover the bell testimony'},{id:'crown',type:'Collect',target:'memory_crown',count:1,description:'Recover the crown testimony'}],rewards:[{type:'currency',id:'scrap',amount:30}]},
  ];
  content.dialogues=[{id:'dlg_npc_000_lore',lines:[
    {speaker:'Mira',text:'The amber road remembers every Seedbearer. Follow it to the First Seed shrine, beyond the aqueduct. The Verdant Disc will open the living vine seals.'},
    {speaker:'Mira',text:'Lastlight Hamlet still keeps its lamps burning. Iri knows the living words. Soren keeps the bells we stopped ringing. Listen before you judge the Crown.'},
  ]}];
  for(const [id,speaker,offer,active,complete] of [
    ['story_living_words','Iri','We cannot rebuild a refuge with fear. An ember sleeps in Emberwatch; an oath survives in the Root Cistern; the Moonwell remembers how to move without breaking a root. Will you bring those living words home?','Seedflare is a light, Rootward a promise, Bloomstep a memory. Let none of them become another chain.','Three living words, spoken again. Keep their power close. The next stranger on the root road may need it more than we do.'],
    ['story_oath_memory','Soren','The bells did not fall silent because the guardian failed. We silenced them. Two testimonies survived: one here, one in Emberwatch. Will you listen to what we could not say?','One testimony lies beside the archive pool. The crownkeeper left the other below Emberwatch. Read them both before you enter the Crown court.','We asked for one more spring until there was no ending left to the oath. Take the First Seed to the guardian. Let it choose to rest.'],
  ])content.dialogues.push(
    {id:id+'_offer',lines:[{speaker,text:offer,choices:[{id:id+'_accept',text:'I will carry the story forward.',action:'accept_quest',end:true},{id:id+'_later',text:'Let me return when I am ready.',end:true}]}]},
    {id:id+'_active',lines:[{speaker,text:active}]},{id:id+'_complete',lines:[{speaker,text:complete}]},
  );
}
