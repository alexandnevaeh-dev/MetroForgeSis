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
signal save_triggered
