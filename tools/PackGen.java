import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * Generates the prestige crop assets of the vortex-skyblock pack (crops 1.7, economy-version 4): for each of the nine
 * prestige crops a seed texture, a product texture (or retextured block model) and a sparkle overlay, as clean recolours
 * of the vanilla 16x16 art, plus the item definitions that select on the custom_model_data strings the crops module puts
 * on its items ("vortex:crop_seed/<id>", "vortex:crop/<id>", "vortex:crop_overlay/<id>") with the vanilla model as the
 * fallback (same technique as the ore overlays).
 *
 *     java PackGen.java <vanilla assets/minecraft dir> <pack root>
 */
public class PackGen {
   record Look(int rgb, double strength) {
   }

   static Path vanilla, pack;
   /** vanilla item -> cases (custom_model_data string -> model) */
   static final Map<String, Map<String, String>> CASES = new LinkedHashMap<>();
   /** vanilla item -> its vanilla model (the fallback) */
   static final Map<String, String> FALLBACK = new LinkedHashMap<>();

   public static void main(String[] args) throws Exception {
      vanilla = Path.of(args[0]);
      pack = Path.of(args[1]);
      // id, seed item, product item, colour of the crop
      crop2d("golden_wheat", "wheat_seeds", "wheat_seeds", "wheat", "wheat", 0xF5C518);
      crop2d("frost_melon", "melon_seeds", "melon_seeds", "melon_slice", "melon_slice", 0x7FDBFF);
      cropMoonPumpkin(0xDDE6FF);
      crop2d("crystal_cane", "sugar_cane", "sugar_cane", "sugar_cane", "sugar_cane", 0x3FE0D0);
      cropStarCactus(0xFFD23F);
      crop2d("sunroot", "carrot", "beetroot_seeds", "carrot", "carrot", 0xFFB300);
      crop2d("glow_bamboo", "bamboo", "bamboo", "bamboo", "bamboo", 0xB8FF3C);
      crop2d("ember_wart", "nether_wart", "pumpkin_seeds", "nether_wart", "nether_wart", 0xFF5A1F);
      cropVoidChorus(0x7A3CFF);
      writeItemDefinitions();
      System.out.println("done");
   }

   // ---- images ----

   static BufferedImage read(String rel) throws IOException {
      BufferedImage src = ImageIO.read(vanilla.resolve("textures").resolve(rel + ".png").toFile());
      BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
      out.getGraphics().drawImage(src, 0, 0, null);
      return out;
   }

   static void write(BufferedImage img, String rel) throws IOException {
      File f = pack.resolve("assets/vortex/textures").resolve(rel + ".png").toFile();
      f.getParentFile().mkdirs();
      ImageIO.write(img, "png", f);
   }

   /**
    * Recolours an image towards rgb keeping its shading: each pixel's luminance (relative to the image's mean) times the
    * target colour, blended with the original by strength.
    */
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

   /** A seed drawn from the same art as its crop: a smaller cutting (11x11, nearest neighbour) at the bottom left. */
   static BufferedImage cutting(BufferedImage src) {
      BufferedImage out = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
      for (int y = 0; y < 11; y++) {
         for (int x = 0; x < 11; x++) {
            out.setRGB(x + 1, y + 4, src.getRGB(x * 16 / 11, y * 16 / 11));
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

   /** A few bright sparkle pixels on opaque pixels (the prestige glint, also visible without the enchant glint). */
   static BufferedImage sparkle(BufferedImage img, int rgb, long seed) {
      java.util.Random r = new java.util.Random(seed);
      List<int[]> opaque = new ArrayList<>();
      for (int y = 0; y < img.getHeight(); y++) {
         for (int x = 0; x < img.getWidth(); x++) {
            if ((img.getRGB(x, y) >>> 24) > 200) {
               opaque.add(new int[]{x, y});
            }
         }
      }

      int light = 0xFF000000 | blendRgb(rgb, 0xFFFFFF, 0.7);
      for (int i = 0; i < Math.min(4, opaque.size() / 12); i++) {
         int[] p = opaque.get(r.nextInt(opaque.size()));
         img.setRGB(p[0], p[1], light);
      }

      return img;
   }

   static int blendRgb(int a, int b, double t) {
      return blend(a >> 16 & 255, b >> 16 & 255, t) << 16 | blend(a >> 8 & 255, b >> 8 & 255, t) << 8 | blend(a & 255, b & 255, t);
   }

   /** A 16x16 sparkle overlay for the cross model: small four-point stars in the crop's colour, the rest transparent. */
   static BufferedImage overlay(int rgb, long seed) {
      BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
      java.util.Random r = new java.util.Random(seed);
      int core = 0xF0000000 | blendRgb(rgb, 0xFFFFFF, 0.55), arm = 0xA0000000 | rgb;
      int[][] spots = {{3, 3}, {11, 2}, {7, 7}, {2, 11}, {12, 10}, {6, 13}};
      for (int[] s : spots) {
         int x = Math.max(1, Math.min(14, s[0] + r.nextInt(3) - 1)), y = Math.max(1, Math.min(14, s[1] + r.nextInt(3) - 1));
         img.setRGB(x, y, core);
         if (r.nextBoolean()) {
            img.setRGB(x - 1, y, arm);
            img.setRGB(x + 1, y, arm);
            img.setRGB(x, y - 1, arm);
            img.setRGB(x, y + 1, arm);
         }
      }

      return img;
   }

   // ---- models / definitions ----

   static void json(String rel, String body) throws IOException {
      Path p = pack.resolve(rel);
      Files.createDirectories(p.getParent());
      Files.writeString(p, body + "\n", StandardCharsets.UTF_8);
   }

   static void flatModel(String model, String texture) throws IOException {
      json("assets/vortex/models/" + model + ".json", "{ \"parent\": \"minecraft:item/generated\", \"textures\": { \"layer0\": \"vortex:" + texture + "\" } }");
   }

   static void overlayModel(String id, int rgb) throws IOException {
      write(overlay(rgb, id.hashCode()), "block/crop_overlay/" + id);
      json("assets/vortex/models/block/crop_overlay/" + id + ".json",
         "{ \"parent\": \"minecraft:block/cross\", \"textures\": { \"cross\": \"vortex:block/crop_overlay/" + id + "\" } }");
   }

   static void addCase(String item, String when, String model) {
      CASES.computeIfAbsent(item, k -> new LinkedHashMap<>()).put(when, model);
   }

   /** A crop whose seed and product are flat items: tinted vanilla item art. */
   static void crop2d(String id, String seedItem, String seedArt, String productItem, String productArt, int rgb) throws IOException {
      BufferedImage seed = tint(read("item/" + seedArt), blendRgb(rgb, 0x404040, 0.25), 0.75);
      write(seedArt.equals(productArt) ? cutting(seed) : seed, "item/crop_seed/" + id);
      flatModel("item/crop_seed/" + id, "item/crop_seed/" + id);
      addCase(seedItem, "vortex:crop_seed/" + id, "vortex:item/crop_seed/" + id);
      write(sparkle(tint(read("item/" + productArt), rgb, 0.85), rgb, id.hashCode()), "item/crop/" + id);
      flatModel("item/crop/" + id, "item/crop/" + id);
      addCase(productItem, "vortex:crop/" + id, "vortex:item/crop/" + id);
      overlayModel(id, rgb);
      addCase(seedItem, "vortex:crop_overlay/" + id, "vortex:block/crop_overlay/" + id);
   }

   /** Moon Pumpkin: flat seeds; the product is the pumpkin block model with pale moonlit textures. */
   static void cropMoonPumpkin(int rgb) throws IOException {
      String id = "moon_pumpkin";
      write(tint(read("item/pumpkin_seeds"), rgb, 0.7), "item/crop_seed/" + id);
      flatModel("item/crop_seed/" + id, "item/crop_seed/" + id);
      addCase("pumpkin_seeds", "vortex:crop_seed/" + id, "vortex:item/crop_seed/" + id);
      write(sparkle(tint(read("block/pumpkin_side"), rgb, 0.85), rgb, 7), "block/crop/moon_pumpkin_side");
      write(tint(read("block/pumpkin_top"), rgb, 0.85), "block/crop/moon_pumpkin_top");
      json("assets/vortex/models/item/crop/" + id + ".json", "{ \"parent\": \"minecraft:block/pumpkin\", \"textures\": { \"end\": \"vortex:block/crop/moon_pumpkin_top\", "
         + "\"side\": \"vortex:block/crop/moon_pumpkin_side\" } }");
      addCase("pumpkin", "vortex:crop/" + id, "vortex:item/crop/" + id);
      overlayModel(id, rgb);
      addCase("pumpkin_seeds", "vortex:crop_overlay/" + id, "vortex:block/crop_overlay/" + id);
   }

   /** Star Cactus: the cactus block model, a soft gold for the cutting (seed), bright gold with sparkles for the crop. */
   static void cropStarCactus(int rgb) throws IOException {
      String id = "star_cactus";
      for (String[] v : new String[][]{{"crop_seed", "0.5"}, {"crop", "0.85"}}) {
         double k = Double.parseDouble(v[1]);
         for (String part : List.of("side", "top", "bottom")) {
            BufferedImage img = tint(read("block/cactus_" + part), rgb, k);
            write(v[0].equals("crop") && part.equals("side") ? sparkle(img, rgb, 11) : img, "block/" + v[0] + "/star_cactus_" + part);
            if (!part.equals("bottom")) {
               json("assets/vortex/textures/block/" + v[0] + "/star_cactus_" + part + ".png.mcmeta", "{ \"texture\": { \"alpha_cutoff_bias\": 0.1 } }");
            }
         }

         String t = "vortex:block/" + v[0] + "/star_cactus_";
         json("assets/vortex/models/item/" + v[0] + "/" + id + ".json", "{ \"parent\": \"minecraft:block/cactus\", \"textures\": { \"particle\": \"" + t + "side\", "
            + "\"bottom\": \"" + t + "bottom\", \"top\": \"" + t + "top\", \"side\": \"" + t + "side\" } }");
         addCase("cactus", "vortex:" + v[0] + "/" + id, "vortex:item/" + v[0] + "/" + id);
      }

      overlayModel(id, rgb);
      addCase("cactus", "vortex:crop_overlay/" + id, "vortex:block/crop_overlay/" + id);
   }

   /** Void Chorus: the chorus flower block model in deep violet (seed), a violet chorus fruit (crop). */
   static void cropVoidChorus(int rgb) throws IOException {
      String id = "void_chorus";
      write(tint(read("block/chorus_flower"), rgb, 0.8), "block/crop_seed/void_chorus_flower");
      json("assets/vortex/models/item/crop_seed/" + id + ".json", "{ \"parent\": \"minecraft:block/chorus_flower\", \"textures\": { \"texture\": "
         + "\"vortex:block/crop_seed/void_chorus_flower\" } }");
      addCase("chorus_flower", "vortex:crop_seed/" + id, "vortex:item/crop_seed/" + id);
      write(sparkle(tint(read("item/chorus_fruit"), rgb, 0.85), 0xD8B4FF, 5), "item/crop/" + id);
      flatModel("item/crop/" + id, "item/crop/" + id);
      addCase("chorus_fruit", "vortex:crop/" + id, "vortex:item/crop/" + id);
      overlayModel(id, 0xC08CFF);
      addCase("chorus_flower", "vortex:crop_overlay/" + id, "vortex:block/crop_overlay/" + id);
   }

   /** assets/minecraft/items/<item>.json: a select on custom_model_data with the vanilla definition as the fallback. */
   static void writeItemDefinitions() throws IOException {
      for (Map.Entry<String, Map<String, String>> e : CASES.entrySet()) {
         String item = e.getKey();
         Path target = pack.resolve("assets/minecraft/items/" + item + ".json");
         if (Files.exists(target)) {
            throw new IllegalStateException(item + ".json already exists in the pack: merge by hand");
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

         sb.append("    ],\n    \"fallback\": ").append(indent(fallback)).append("\n  }\n}");
         json("assets/minecraft/items/" + item + ".json", sb.toString());
      }
   }

   static String indent(String json) {
      return json.replace("\n", "\n    ");
   }
}
