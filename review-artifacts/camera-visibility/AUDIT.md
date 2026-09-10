# Camera-visibility audit (during play)

Each required target (elevated platform landing, room-transition destination, weak-floor hazard) was checked by placing the player at the **approach**, **jump apex**, and **landing**, then reading the REAL gameplay camera (the player's `CameraDirector`, the same path both capture systems use). `intersects` = the target is on-screen in the camera view; `fully` = the whole target rect is enclosed.

Captured via `tools/camera_visibility_audit.gd` against the tested slice.
**Totals: 84 checks — 0 not-visible, 68 fully-in-view, 16 partial (all partials are room-exit doors at the frame edge; the exit is on-screen).**


## room_000
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Platform_2 | approach | yes | yes |
| Platform_2 | apex | yes | yes |
| Platform_2 | landing | yes | yes |
| Transition_right_room_001 | approach | yes | partial |

## room_001
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Platform_2 | approach | yes | yes |
| Platform_2 | apex | yes | yes |
| Platform_2 | landing | yes | yes |
| Platform_3 | approach | yes | yes |
| Platform_3 | apex | yes | yes |
| Platform_3 | landing | yes | yes |
| Transition_left_room_000 | approach | yes | partial |
| Transition_right_room_002 | approach | yes | partial |

## room_002
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_left_room_001 | approach | yes | partial |
| Transition_right_room_003 | approach | yes | partial |

## room_003
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_left_room_002 | approach | yes | yes |
| Transition_right_room_004 | approach | yes | yes |

## room_004
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_left_room_003 | approach | yes | partial |
| Transition_right_room_005 | approach | yes | partial |

## room_005
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_left_room_004 | approach | yes | partial |
| Transition_right_room_006 | approach | yes | partial |

## room_006
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_right_room_007 | approach | yes | partial |
| Transition_left_room_005 | approach | yes | partial |

## room_007
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Transition_left_room_006 | approach | yes | partial |
| Transition_right_room_008 | approach | yes | partial |

## room_008
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_left_room_007 | approach | yes | partial |
| Transition_right_room_009 | approach | yes | partial |

## room_009
| target | phase | on-screen | fully-in-view |
|---|---|---|---|
| Platform_0 | approach | yes | yes |
| Platform_0 | apex | yes | yes |
| Platform_0 | landing | yes | yes |
| Platform_1 | approach | yes | yes |
| Platform_1 | apex | yes | yes |
| Platform_1 | landing | yes | yes |
| Transition_left_room_008 | approach | yes | partial |
