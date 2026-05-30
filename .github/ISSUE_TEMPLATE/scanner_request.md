---
name: Game Scanner Request
about: Propose path configurations or scanning rules for a new Unity game.
title: "[GAME SCANNER] "
labels: game-scanner, enhancement
assignees: ''

---

**Proposed Game Title**
Provide the official name of the Unity game (e.g. *Risk of Rain 2*, *Phasmophobia*).

**Official Steam AppID**
If this game is on Steam, provide its Steam AppID (helps fetch banners dynamically):
- AppID: `[e.g. 632360]`

**Asset File Structure**
Where are transparent assets stored inside the game folder? (e.g. `.png` textures under `Bundles/`, `items/` companion JSONs):
- Directory Path: `[e.g. <Game>_Data/StreamingAssets/]`
- Loose Image files: [Yes / No]
- Rarity/Specs companion JSON files: [Yes / No]

**Alternate Workshop or AppData Paths**
Does the game load community assets from a Workshop AppID folder or save local thumbnails inside AppData?
- Workshop AppID: `[e.g. <AppID>]`
- AppData\LocalLow Path: `[e.g. AppData\LocalLow\<Developer>\<GameName>]`

**Additional Context**
Add any other details, developer directories, or screenshots of the folder hierarchy here.
