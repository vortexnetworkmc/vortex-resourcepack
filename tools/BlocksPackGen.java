import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * Generates the placeable custom blocks of the vortex-skyblock pack (owner-approved 2026-11-10): the Vortex Workbench
 * (recipes module 1.1, a crafting table that opens the Recipe Book) and the Dungeon Forge block (gear module 1.1, a
 * smithing table that opens the Dungeon Forge), as recolours of the vanilla 16x16 art. Same technique as the ore
 * overlays: the item (in the hand) and the placed block's overlay display are the vanilla block item with a
 * custom_model_data string ("vortex:workbench", "vortex:dungeon_forge"); assets/minecraft/items/crafting_table.json and
 * smithing_table.json select on it and fall back to the unchanged vanilla model, so plain crafting / smithing tables and
 * players without the pack see vanilla.
 *
 *     java BlocksPackGen.java <vanilla assets/minecraft dir> <pack root>
 */
public class BlocksPackGen {
   static Path vanilla, pack;

   public static void main(String[] args) throws Exception {
      vanilla = Path.of(args[0]);
      pack = Path.of(args[1]);
      // Vortex Workbench: deep violet wood, a gold work surface
      write(tint(read("block/crafting_table_front"), 0x6B3FA8, 0.62), "block/workbench_front");
      write(tint(read("block/crafting_table_side"), 0x6B3FA8, 0.62), "block/workbench_side");
      write(accent(tint(read("block/crafting_table_top"), 0xE0B040, 0.55), 0x7FE8FF), "block/workbench_top");
      write(tint(read("block/oak_planks"), 0x4A2C78, 0.6), "block/workbench_bottom");
      json("assets/vortex/models/block/workbench.json", "{\n  \"parent\": \"minecraft:block/cube\",\n  \"textures\": {\n"
         + "    \"down\": \"vortex:block/workbench_bottom\",\n    \"east\": \"vortex:block/workbench_side\",\n    \"north\": \"vortex:block/workbench_front\",\n"
         + "    \"particle\": \"vortex:block/workbench_front\",\n    \"south\": \"vortex:block/workbench_side\",\n    \"up\": \"vortex:block/workbench_top\",\n"
         + "    \"west\": \"vortex:block/workbench_front\"\n  }\n}");
      // Dungeon Forge: void-purple iron, an ember-glowing anvil top
      write(tint(read("block/smithing_table_front"), 0x4B2470, 0.62), "block/dungeon_forge_front");
      write(tint(read("block/smithing_table_side"), 0x4B2470, 0.62), "block/dungeon_forge_side");
      write(tint(read("block/smithing_table_top"), 0xFF7A2A, 0.5), "block/dungeon_forge_top");
      write(tint(read("block/smithing_table_bottom"), 0x2E1648, 0.6), "block/dungeon_forge_bottom");
      json("assets/vortex/models/block/dungeon_forge.json", "{\n  \"parent\": \"minecraft:block/cube\",\n  \"textures\": {\n"
         + "    \"down\": \"vortex:block/dungeon_forge_bottom\",\n    \"east\": \"vortex:block/dungeon_forge_side\",\n    \"north\": \"vortex:block/dungeon_forge_front\",\n"
         + "    \"particle\": \"vortex:block/dungeon_forge_front\",\n    \"south\": \"vortex:block/dungeon_forge_front\",\n    \"up\": \"vortex:block/dungeon_forge_top\",\n"
         + "    \"west\": \"vortex:block/dungeon_forge_side\"\n  }\n}");
      Map<String, String> wb = new LinkedHashMap<>();
      wb.put("vortex:workbench", "vortex:block/workbench");
      definition("crafting_table", wb);
      Map<String, String> fg = new LinkedHashMap<>();
      fg.put("vortex:dungeon_forge", "vortex:block/dungeon_forge");
      definition("smithing_table", fg);
      System.out.println("done: workbench + dungeon_forge (8 textures, 2 models, 2 item definitions)");
   }

   // ---- images (as LoggingPackGen) ----

   static BufferedImage read(String rel) throws IOException {
      BufferedImage src = ImageIO.read(vanilla.resolve("textures").resolve(rel + ".png").toFile());
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

   /** A small glowing rune in the middle of the work surface (the "vortex" mark). */
   static BufferedImage accent(BufferedImage img, int rgb) {
      int[][] dots = {{7, 6}, {8, 6}, {6, 7}, {9, 8}, {6, 8}, {9, 7}, {7, 9}, {8, 9}};
      for (int[] d : dots) {
         img.setRGB(d[0], d[1], 0xFF000000 | rgb);
      }

      return img;
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

   /** The vanilla item definition of item wrapped in a select on custom_model_data (only our own file may be rewritten). */
   static void definition(String item, Map<String, String> cases) throws IOException {
      Path target = pack.resolve("assets/minecraft/items/" + item + ".json");
      if (Files.exists(target) && !Files.readString(target).contains("\"vortex:workbench\"") && !Files.readString(target).contains("\"vortex:dungeon_forge\"")) {
         throw new IllegalStateException(item + ".json already exists in the pack (not ours): merge by hand");
      }

      String vanillaDef = Files.readString(vanilla.resolve("items/" + item + ".json"), StandardCharsets.UTF_8);
      String fallback = vanillaDef.replaceAll("(?s)^\\s*\\{\\s*\"model\"\\s*:\\s*", "").replaceAll("(?s)}\\s*$", "").trim();
      StringBuilder sb = new StringBuilder();
      sb.append("{\n  \"model\": {\n    \"type\": \"minecraft:select\",\n    \"property\": \"minecraft:custom_model_data\",\n    \"index\": 0,\n    \"cases\": [\n");
      int i = 0;
      for (Map.Entry<String, String> c : cases.entrySet()) {
         sb.append("      {\n        \"when\": \"").append(c.getKey()).append("\",\n        \"model\": {\n          \"type\": \"minecraft:model\",\n          \"model\": \"")
            .append(c.getValue()).append("\"\n        }\n      }").append(++i < cases.size() ? ",\n" : "\n");
      }

      sb.append("    ],\n    \"fallback\": ").append(fallback.replace("\n", "\n    ")).append("\n  }\n}");
      json("assets/minecraft/items/" + item + ".json", sb.toString());
   }
}
