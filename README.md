# Vortex Skyblock resource pack (branch `skyblock`)

This branch is ONLY for the Vortex Skyblock server (Folia 26.1.2, pack format 84; 26.3 clients via ViaVersion, format
97.1, are inside the range too). It shares no history with `main`, which holds the Prisons (1.12.2) pack
`vortex-skins.zip`; Prisons is unaffected by anything here.

- `vortex-skyblock.zip`: the built pack the Skyblock server offers to players (prompted, not forced).
- `assets/`, `pack.mcmeta`: the sources.

How the custom ores work (mining module, `look.mode: overlay`):

- Every ore node is a distinct vanilla block (amethyst block, raw gold block, emerald block, lapis block, redstone block,
  obsidian, calcite, glowstone, crying obsidian, end stone bricks; depleted = smooth basalt). That is what players
  without this pack and Bedrock players see. No vanilla block is retextured (no blockstate overrides).
- On top of each node the server puts an item display, a hair larger than the block, holding the same vanilla block
  item with a `custom_model_data` string: `vortex:ore/<ore>` or `vortex:ore/<ore>_depleted`.
- `assets/minecraft/items/<vanilla item>.json` selects on that string (`minecraft:select` on
  `minecraft:custom_model_data`) and falls back to the unchanged vanilla definition, so the pack draws the custom ore
  (`vortex:block/ore/<ore>[_depleted]`) and everything else stays vanilla.
- Items use the same mechanism: ore drops `vortex:item/<ore>` (on their vanilla item, e.g. amethyst shard), Ore Seeds
  `vortex:seed/<ore>` (on the ore's vanilla block), Dungeon Shards `vortex:shard/<zone>` (amethyst shard). Without the
  pack they are the plain vanilla items, never a missing texture.
- `assets/vortex/items/*` are the old `item_model` definitions, kept only so items made by mining 1.0/1.1 still render
  for pack users until the server rebuilds them (it does on join).

How the prestige crops look (crops module 1.7, economy-version 4: Golden Wheat, Frost Melon, Moon Pumpkin, Crystal Cane,
Star Cactus, Sunroot, Glow Bamboo, Ember Wart, Void Chorus):

- Every prestige seed and crop is its vanilla item (wheat seeds, melon slice, pumpkin, sugar cane, cactus, carrot, bamboo,
  nether wart, chorus flower / fruit...) with a `custom_model_data` string: seeds `vortex:crop_seed/<crop>`, crops
  `vortex:crop/<crop>`. `assets/minecraft/items/<vanilla item>.json` selects on it and falls back to the vanilla model.
- Overlays: near a player who loaded this pack the server puts one item display on each prestige plant (hidden from
  everyone else), holding the crop's seed item with `vortex:crop_overlay/<crop>`: a sparkle cross
  (`vortex:block/crop_overlay/<crop>`, parent `minecraft:block/cross`) over the vanilla plant. The plants themselves stay
  untouched vanilla blocks.
- Moon Pumpkin and Star Cactus use the vanilla pumpkin / cactus block models with recoloured textures, the Void Chorus
  seed the chorus flower model; everything else is a flat 16x16 recolour of the vanilla art.
- `tools/PackGen.java` made them from the vanilla 26.x art: `java tools/PackGen.java <vanilla assets/minecraft> .`
  (it refuses to overwrite an item definition that already exists).

The ore textures are generated placeholders; replace PNGs with final art and rebuild the zip:

    rm -f vortex-skyblock.zip && "C:/Program Files/Java/jdk-26.0.1/bin/jar.exe" --create --no-manifest --file vortex-skyblock.zip pack.mcmeta assets

then put the zip's sha1 into the server's `ResPack.yml`.
