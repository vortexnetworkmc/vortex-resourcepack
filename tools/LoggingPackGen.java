import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * Generates the logging assets of the vortex-skyblock pack (logging module 1.0, docs/design/logging.md): for each custom
 * tree a sapling item, a bark + log-top texture and a foliage texture (block models used by the server's overlays on the
 * tree blocks), and the five drops (Resin, Ward Sap, Wardfruit, Heartwood, Spawner Essence), as recolours of the vanilla
 * 16x16 art, plus the item definitions selecting on the custom_model_data strings the logging module puts on its items
 * ("vortex:logging/sapling/&lt;tree&gt;", "vortex:logging/log/&lt;tree&gt;", "vortex:logging/leaves/&lt;tree&gt;",
 * "vortex:logging/&lt;drop&gt;") with the unchanged vanilla definition as the fallback (same technique as the ore / crop overlays).
 *
 *     java LoggingPackGen.java <vanilla assets/minecraft dir> <pack root>
 */
public class LoggingPackGen {
   static Path vanilla, pack;
   static final Map<String, Map<String, String>> CASES = new LinkedHashMap<>();

   /** A tree: id, vanilla log / leaves / sapling, bark colour, foliage colour, sapling colour. */
   record Tree(String id, String log, String leaves, String sapling, int bark, int foliage, int sprout) {
   }

   static final List<Tree> TREES = List.of(
      new Tree("applewood", "oak_log", "oak_leaves", "oak_sapling", 0x8B5A2B, 0x5DBB3F, 0x6BCB3F),
      new Tree("silver_birch", "birch_log", "birch_leaves", "birch_sapling", 0xE4E6EE, 0xB8D8A0, 0xC8E0B0),
      new Tree("alpine", "spruce_log", "spruce_leaves", "spruce_sapling", 0x4A3420, 0x2E5E4E, 0x2E6E56),
      new Tree("willow", "dark_oak_log", "mangrove_leaves", "dark_oak_sapling", 0x5B4A3A, 0x86B86A, 0x88B070),
      new Tree("cherry_blossom", "cherry_log", "cherry_leaves", "cherry_sapling", 0x5A2E2E, 0xF7A8C8, 0xF7A8C8),
      new Tree("ironbark", "pale_oak_log", "pale_oak_leaves", "pale_oak_sapling", 0x8A8F96, 0x9AA39A, 0xA0A8A0),
      new Tree("elder_jungle", "jungle_log", "jungle_leaves", "jungle_sapling", 0x6B4E1E, 0x3E8E2E, 0x4E9E2E),
      new Tree("soulwood", "crimson_stem", "nether_wart_block", "crimson_fungus", 0x6A1E3A, 0xB02040, 0xC03050),
      new Tree("christmas_tree", "spruce_log", "spruce_leaves", "spruce_sapling", 0x5A3A22, 0x1E6B34, 0x2E8B44));

   public static void main(String[] args) throws Exception {
      vanilla = Path.of(args[0]);
      pack = Path.of(args[1]);
      for (Tree t : TREES) {
         tree(t);
      }

      drop("resin", "resin_clump", "item/resin_clump", 0xF0A030, 0.6);
      drop("ward_sap", "honeycomb", "item/honeycomb", 0x5FE0D0, 0.8);
      drop("wardfruit", "apple", "item/apple", 0x40C8FF, 0.85);
      drop("heartwood", "creaking_heart", "block/stripped_cherry_log_top", 0xD02830, 0.8);
      drop("spawner_essence", "ghast_tear", "item/ghast_tear", 0xD050FF, 0.85);
      writeItemDefinitions();
      System.out.println("done: " + CASES.size() + " item definitions");
   }

   static void tree(Tree t) throws IOException {
      String logBase = t.log;
      String side = logBase, top = logBase + "_top";
      write(tint(read("block/" + side), t.bark, 0.8), "block/logging/" + t.id + "_log");
      write(tint(read("block/" + top), t.bark, 0.55), "block/logging/" + t.id + "_log_top");
      json("assets/vortex/models/block/logging/" + t.id + "_log.json", "{ \"parent\": \"minecraft:block/cube_column\", \"textures\": { \"end\": \"vortex:block/logging/"
         + t.id + "_log_top\", \"side\": \"vortex:block/logging/" + t.id + "_log\" } }");
      addCase(t.log, "vortex:logging/log/" + t.id, "vortex:block/logging/" + t.id + "_log");
      BufferedImage leaves = read("block/" + t.leaves);
      BufferedImage fol = tint(leaves, t.foliage, 0.9);
      if (t.id.equals("applewood")) {
         fol = dots(fol, 0xD02020, 11);    // apples in the crown
      } else if (t.id.equals("christmas_tree")) {
         fol = dots(fol, 0xFFE040, 23);    // fairy lights
      }

      write(fol, "block/logging/" + t.id + "_leaves");
      json("assets/vortex/models/block/logging/" + t.id + "_leaves.json", "{ \"parent\": \"minecraft:block/cube_all\", \"textures\": { \"all\": \"vortex:block/logging/"
         + t.id + "_leaves\" } }");
      addCase(t.leaves, "vortex:logging/leaves/" + t.id, "vortex:block/logging/" + t.id + "_leaves");
      write(tint(read((t.sapling.endsWith("fungus") ? "block/" : "block/") + t.sapling), t.sprout, 0.85), "item/logging/sapling/" + t.id);
      json("assets/vortex/models/item/logging/sapling/" + t.id + ".json", "{ \"parent\": \"minecraft:item/generated\", \"textures\": { \"layer0\": "
         + "\"vortex:item/logging/sapling/" + t.id + "\" } }");
      addCase(t.sapling, "vortex:logging/sapling/" + t.id, "vortex:item/logging/sapling/" + t.id);
   }

   static void drop(String id, String item, String art, int rgb, double k) throws IOException {
      BufferedImage img = tint(read(art), rgb, k);
      if (art.startsWith("block/")) {
         img = round(img);
      }

      write(img, "item/logging/" + id);
      json("assets/vortex/models/item/logging/" + id + ".json", "{ \"parent\": \"minecraft:item/generated\", \"textures\": { \"layer0\": \"vortex:item/logging/" + id
         + "\" } }");
      addCase(item, "vortex:logging/" + id, "vortex:item/logging/" + id);
   }

   // ---- images ----

   static BufferedImage read(String rel) throws IOException {
      BufferedImage src = ImageIO.read(vanilla.resolve("textures").resolve(rel + ".png").toFile());
      // animated textures (crimson stem, fungus): first 16x16 frame
      int w = src.getWidth(), h = Math.min(src.getHeight(), w);
      BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
      out.getGraphics().drawImage(src, 0, 0, null);
      return out;
   }

   static void write(BufferedImage img, String rel) throws IOException {
      File f = pack.resolve("assets/vortex/textures").resolve(rel + ".png").toFile();
      f.getParentFile().mkdirs();
      ImageIO.write(img, "png", f);
   }

   static BufferedImage tint(BufferedImage src, int rgb, double strength) {
      BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
      double sum = 0;
      int n = 0;
      for (int y = 0; y < src.getHeight(); y++) {
         for (int x = 0; x < src.getWidth(); x++) {
            int p = src.getRGB(x, y);
            if ((p >>> 24) > 0) {
               sum += lum(p);
               n++;
            }
         }
      }

      double mean = n == 0 ? 0.5 : sum / n;
      int tr = rgb >> 16 & 255, tg = rgb >> 8 & 255, tb = rgb & 255;
      for (int y = 0; y < src.getHeight(); y++) {
         for (int x = 0; x < src.getWidth(); x++) {
            int p = src.getRGB(x, y);
            int a = p >>> 24;
            if (a == 0) {
               continue;
            }

            double k = Math.min(1.6, lum(p) / Math.max(0.05, mean));
            int r = blend(p >> 16 & 255, clamp(tr * k), strength), g = blend(p >> 8 & 255, clamp(tg * k), strength), b = blend(p & 255, clamp(tb * k), strength);
            out.setRGB(x, y, a << 24 | r << 16 | g << 8 | b);
         }
      }

      return out;
   }

   /** A few coloured dots on opaque pixels (apples, lights). */
   static BufferedImage dots(BufferedImage img, int rgb, long seed) {
      java.util.Random r = new java.util.Random(seed);
      for (int i = 0; i < 6; i++) {
         int x = 1 + r.nextInt(14), y = 1 + r.nextInt(14);
         if ((img.getRGB(x, y) >>> 24) > 100) {
            img.setRGB(x, y, 0xFF000000 | rgb);
         }
      }

      return img;
   }

   /** A round cut of a square block texture (the Heartwood: a disc of tree rings). */
   static BufferedImage round(BufferedImage src) {
      BufferedImage out = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
      for (int y = 0; y < 16; y++) {
         for (int x = 0; x < 16; x++) {
            double dx = x - 7.5, dy = y - 7.5;
            if (dx * dx + dy * dy <= 7.2 * 7.2) {
               out.setRGB(x, y, src.getRGB(x * src.getWidth() / 16, y * src.getHeight() / 16));
            }
         }
      }

      return out;
   }

   static double lum(int p) {
      return (0.299 * (p >> 16 & 255) + 0.587 * (p >> 8 & 255) + 0.114 * (p & 255)) / 255.0;
   }

   static int clamp(double v) {
      return (int)Math.max(0, Math.min(255, Math.round(v)));
   }

   static int blend(int a, int b, double t) {
      return clamp(a + (b - a) * t);
   }

   // ---- models / definitions ----

   static void json(String rel, String body) throws IOException {
      Path p = pack.resolve(rel);
      Files.createDirectories(p.getParent());
      Files.writeString(p, body + "\n", StandardCharsets.UTF_8);
   }

   static void addCase(String item, String when, String model) {
      CASES.computeIfAbsent(item, k -> new LinkedHashMap<>()).put(when, model);
   }

   static void writeItemDefinitions() throws IOException {
      for (Map.Entry<String, Map<String, String>> e : CASES.entrySet()) {
         String item = e.getKey();
         Path target = pack.resolve("assets/minecraft/items/" + item + ".json");
         if (Files.exists(target) && !Files.readString(target).contains("vortex:logging/")) {
            throw new IllegalStateException(item + ".json already exists in the pack (not ours): merge by hand");
         }

         String vanillaDef = Files.readString(vanilla.resolve("items/" + item + ".json"), StandardCharsets.UTF_8);
         String fallback = vanillaDef.replaceAll("(?s)^\\s*\\{\\s*\"model\"\\s*:\\s*", "").replaceAll("(?s)}\\s*$", "").trim();
         StringBuilder sb = new StringBuilder();
         sb.append("{\n  \"model\": {\n    \"type\": \"minecraft:select\",\n    \"property\": \"minecraft:custom_model_data\",\n    \"index\": 0,\n    \"cases\": [\n");
         int i = 0;
         for (Map.Entry<String, String> c : e.getValue().entrySet()) {
            sb.append("      {\n        \"when\": \"").append(c.getKey()).append("\",\n        \"model\": {\n          \"type\": \"minecraft:model\",\n          \"model\": \"")
               .append(c.getValue()).append("\"\n        }\n      }").append(++i < e.getValue().size() ? ",\n" : "\n");
         }

         sb.append("    ],\n    \"fallback\": ").append(fallback.replace("\n", "\n    ")).append("\n  }\n}");
         json("assets/minecraft/items/" + item + ".json", sb.toString());
      }
   }
}
