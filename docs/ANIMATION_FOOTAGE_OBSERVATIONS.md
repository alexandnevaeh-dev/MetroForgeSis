# Aria of Sorrow: first reference-footage observation

Source: Kriole, Castlevania: Aria of Sorrow, 100% souls TAS, linked in [the TASVideos publication discussion](https://tasvideos.org/Forum/Topics/10127?CurrentPage=2&Highlight=247739).
Direct reference: https://archive.org/download/KriolesGbaCastlevaniaAriaOfSorrow100SoulsIn2547.05/castlevaniaariaofsorrow-tasv2-100souls-kriole.mp4

Downloaded to E:/Metroforge/Recovery-Audit/animation-reference-v1/aria-kriole.mp4. Size98537949bytes, decoded240x160, duration1675.707755s. Source recording includes overlays and TAS techniques. Media remains outside the source repository.

Inspected overview.png (15-second intervals,15-180s) and motion-119s.png (12 requested seek times,119.000-119.917s). Browser video seeking samples encoded pictures; these are NOT proven consecutive source/emulator frames. Repeated pictures in early samples must not be read as an authored hold without checking presentation timestamps. Exact FPS, hitbox times and input latency were not measured. Source aspect ratio retained in corrected captures; no interpolation-generated frames.

Visible observations:
- In the119s sequence the character moves down stairs and onto a flat floor. At119.333 the leading arm/weapon extends, while later poses draw the upper body into a more compact silhouette. The legs and coat shape change independently rather than translating a single rigid picture.
- At119.500-119.583 multiple character-like silhouettes overlap. These may include an effect/afterimage; do not segment them as additional anatomy or use them as clean rig references.
- At119.667-119.917 the outline alternates between extended and compact poses while the coat trails. Camera/world movement and TAS actions prevent a reliable foot-slip or stride calculation from these samples alone.
- The hallway repeats window/arch/column bays, but stairs, statue niches and changes in elevation create identifiable subspaces. Floor contact surfaces remain distinct from distant architectural detail.

MetroForge application:
1. Author clean whole-body contact/extension/recovery poses before secondary cloth/effects. Keep upper-body, arms and head involved; retain weapon grip and limb volume.
2. Review a no-effects version of every animation for anatomy; then composite trails separately. Never bake an afterimage into a character's persistent silhouette.
3. Capture continuous unedited sequences of ordinary walk/run, jump/land and attack with fixed timestamps before choosing numerical cadence or cancel windows.
4. Build long rooms from coherent architectural bays with landmarks and elevation changes. Do not stretch a single background over a long room.

This is reference analysis, not new MetroForge gameplay or proof of its animation quality. Other user-supplied footage sources remain queued; channel names alone do not identify verified clips.

## Decoded presentation timestamp follow-up

A requestVideoFrameCallback capture at quarter-speed initially began at119.200s and skipped one presented callback. That attempt is preserved as presented-frames-startup-gap.json. Repeating with pre-roll from118s captured45presented pictures across119.000-119.983333s with consecutive presentedFrames counters. Media-time deltas ranged from0.016666s to0.150s. Thus this browser presentation trace is not a uniform60-picture-per-second sequence. Consecutive presentation counters alone do not prove all original emulator frames were encoded or decoded. Use recorded timestamps, not screenshot index/60, for visible-time observations. No game input latency, active-hitbox duration or authored sprite cadence can be inferred from this trace alone.

Evidence: E:/Metroforge/Recovery-Audit/animation-reference-v1/presented-frames.json, continuity.json, presented-motion-119s.png and extract-presented.cjs. This improves the auditability of the reference study without changing MetroForge gameplay or approving its animation.
