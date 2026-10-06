extends Node

signal game_started
signal game_completed
signal player_died
signal player_respawned
signal ability_acquired(ability_id: String)
signal boss_defeated(boss_id: String)
signal room_entered(room_id: String)
signal enemy_killed(enemy_id: String)
signal item_collected(item_id: String)
signal npc_talked(npc_id: String)
signal save_triggered
signal room_discovered(room_id: String)
signal object_activated(object_id: String)
signal object_interacted(object_id: String)
signal dialogue_choice_made(choice_id: String)
signal quest_updated(quest_id: String)
signal equipment_changed(slot: String, item_id: String)
