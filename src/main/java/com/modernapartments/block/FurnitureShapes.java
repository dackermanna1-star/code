package com.modernapartments.block;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.modernapartments.ModernApartments;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Collision/outline shapes for furniture, loaded from {@code /modernapartments/furniture_shapes.json}.
 * The file is generated from the same box geometry as the block models (tools/assetgen), so hitboxes
 * always match what is rendered. Boxes are authored facing north and rotated here.
 */
public final class FurnitureShapes {
	private static final String RESOURCE = "/modernapartments/furniture_shapes.json";
	private static final VoxelShape FALLBACK = Block.box(3, 0, 3, 13, 10, 13);
	private static final Map<String, List<double[]>> TEMPLATES = new HashMap<>();
	private static final Map<String, Map<String, String>> BLOCK_SHAPES = new HashMap<>();
	private static final Map<String, VoxelShape> CACHE = new ConcurrentHashMap<>();

	static {
		load();
	}

	private FurnitureShapes() {
	}

	private static void load() {
		try (InputStream in = FurnitureShapes.class.getResourceAsStream(RESOURCE)) {
			if (in == null) {
				ModernApartments.LOGGER.error("Missing {}; furniture will use fallback shapes", RESOURCE);
				return;
			}
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("templates").entrySet()) {
				List<double[]> boxes = new ArrayList<>();
				for (JsonElement b : e.getValue().getAsJsonArray()) {
					JsonArray a = b.getAsJsonArray();
					boxes.add(new double[] {a.get(0).getAsDouble(), a.get(1).getAsDouble(), a.get(2).getAsDouble(),
						a.get(3).getAsDouble(), a.get(4).getAsDouble(), a.get(5).getAsDouble()});
				}
				TEMPLATES.put(e.getKey(), boxes);
			}
			for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("blocks").entrySet()) {
				Map<String, String> keys = new HashMap<>();
				for (Map.Entry<String, JsonElement> k : e.getValue().getAsJsonObject().getAsJsonObject("shapes").entrySet()) {
					keys.put(k.getKey(), k.getValue().getAsString());
				}
				BLOCK_SHAPES.put(e.getKey(), keys);
			}
		} catch (Exception ex) {
			ModernApartments.LOGGER.error("Failed to read furniture shapes", ex);
		}
	}

	/** Shape for a block id + model key, rotated so the furniture front points to {@code facing}. */
	public static VoxelShape get(String blockId, String key, Direction facing) {
		Map<String, String> keys = BLOCK_SHAPES.get(blockId);
		String template = keys == null ? null : keys.get(key);
		if (template == null) {
			return FALLBACK;
		}
		return CACHE.computeIfAbsent(template + "/" + facing.getName(), k -> build(TEMPLATES.get(template), facing));
	}

	private static VoxelShape build(List<double[]> boxes, Direction facing) {
		if (boxes == null || boxes.isEmpty()) {
			return FALLBACK;
		}
		VoxelShape shape = Shapes.empty();
		for (double[] b : boxes) {
			double[] r = rotate(b, facing);
			shape = Shapes.or(shape, Block.box(r[0], r[1], r[2], r[3], r[4], r[5]));
		}
		return shape.optimize();
	}

	/** Rotates a north-facing box (pixel units) around the block centre, matching blockstate y-rotation. */
	static double[] rotate(double[] b, Direction facing) {
		double x1 = b[0], y1 = b[1], z1 = b[2], x2 = b[3], y2 = b[4], z2 = b[5];
		return switch (facing) {
			case EAST -> new double[] {16 - z2, y1, x1, 16 - z1, y2, x2};
			case SOUTH -> new double[] {16 - x2, y1, 16 - z2, 16 - x1, y2, 16 - z1};
			case WEST -> new double[] {z1, y1, 16 - x2, z2, y2, 16 - x1};
			default -> b;
		};
	}
}
