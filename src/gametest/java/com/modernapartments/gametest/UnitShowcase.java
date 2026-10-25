package com.modernapartments.gametest;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.Canvas;
import com.modernapartments.build.ConnectionResolver;
import com.modernapartments.build.interior.InteriorStyle;
import com.modernapartments.build.interior.UnitBuilder;
import com.modernapartments.build.interior.UnitBuilder.Type;
import com.modernapartments.registry.ModBlocks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Block;

/** Test floors with one of every unit type on both sides of a corridor. */
final class UnitShowcase {
	record Placed(String label, int x0, int z0, int w, int d, Direction front, int h) {
	}

	static final int CORRIDOR_Z = 26;

	private UnitShowcase() {
	}

	static Block b(String id) {
		return ModBlocks.get(id);
	}

	static BlockBuffer build(long seed, List<Placed> out, boolean lofts) {
		BlockBuffer buf = new BlockBuffer(lofts ? 70 : 104, 12, 60, 0);
		Canvas c = new Canvas(buf);
		UnitBuilder.Facade brick = new UnitBuilder.Facade(b("drywall_white"), b("brick_red"), b("limestone"), b("window_glass"),
			null, 0, UnitBuilder.WindowStyle.STANDARD, false, false);
		UnitBuilder.Facade glass = new UnitBuilder.Facade(b("drywall_white"), b("mullion_black"), b("facade_panel_white"),
			b("curtain_wall_blue"), b("mullion_black"), 2, UnitBuilder.WindowStyle.TALL, true, true);
		UnitBuilder.Facade loft = new UnitBuilder.Facade(b("brick_exposed"), b("brick_red"), b("brick_charcoal"), b("factory_window"),
			null, 0, UnitBuilder.WindowStyle.TALL, false, false);
		UnitBuilder.Balcony balcony = new UnitBuilder.Balcony(2, b("pavers_gray"), ModBlocks.GLASS_RAILING);
		UnitBuilder.Balcony terrace = new UnitBuilder.Balcony(3, b("pool_deck"), ModBlocks.GLASS_RAILING);
		c.fill(0, 0, CORRIDOR_Z, buf.sizeX - 1, 0, CORRIDOR_Z + 2, b("terrazzo"));
		int n = 0;
		if (lofts) {
			int x = 2;
			for (int i = 0; i < 4; i++) {
				int w = 13 + i % 2 * 2;
				UnitBuilder.Spec spec = new UnitBuilder.Spec(Type.LOFT, w, 16, 8, loft).number("L" + (i + 1))
					.theme(InteriorStyle.Theme.INDUSTRIAL).seeds(seed + i * 31L, seed * 7 + i).shell(b("brick_exposed"),
						ModBlocks.DOORS.get(ModBlocks.DoorStyle.STEEL)).balcony(i % 2 == 0 ? new UnitBuilder.Balcony(1, b("polished_concrete"),
						ModBlocks.METAL_RAILING) : null);
				Direction front = i < 2 ? Direction.NORTH : Direction.SOUTH;
				int xx = i < 2 ? x + i * (w + 3) : x + (i - 2) * (w + 3);
				int z0 = front == Direction.NORTH ? CORRIDOR_Z + 4 : CORRIDOR_Z - 1 - 16;
				UnitBuilder.build(c.frame(xx, 0, z0, w, 16, front, i == 1), spec);
				out.add(new Placed("loft" + i, xx, z0, w, 16, front, 8));
			}
		} else {
			Object[][] south = {{Type.STUDIO, 9, 11}, {Type.ONE_BED, 13, 12}, {Type.TWO_BED, 19, 12}, {Type.PENTHOUSE, 28, 13},
				{Type.STUDIO, 10, 12}, {Type.ONE_BED, 14, 13}};
			Object[][] north = {{Type.ONE_BED, 12, 12}, {Type.TWO_BED, 20, 13}, {Type.TWO_BED, 18, 12}, {Type.STUDIO, 8, 11},
				{Type.ONE_BED, 15, 12}, {Type.TWO_BED, 21, 13}};
			InteriorStyle.Theme[] themes = InteriorStyle.Theme.values();
			for (int side = 0; side < 2; side++) {
				Object[][] row = side == 0 ? south : north;
				Direction front = side == 0 ? Direction.NORTH : Direction.SOUTH;
				int x = 2;
				for (Object[] u : row) {
					Type type = (Type) u[0];
					int w = (Integer) u[1];
					int d = (Integer) u[2];
					if (x + w + 1 >= buf.sizeX) {
						break;
					}
					boolean full = type == Type.PENTHOUSE || n % 3 == 2;
					UnitBuilder.Spec spec = new UnitBuilder.Spec(type, w, d, 4, full ? glass : brick).number(String.valueOf(101 + n))
						.theme(themes[n % themes.length]).seeds(seed + n * 1000L, seed ^ (n * 7919L))
						.balcony(type == Type.PENTHOUSE ? terrace : n % 2 == 0 ? balcony : null)
						.exterior(x == 2, false);
					int z0 = front == Direction.NORTH ? CORRIDOR_Z + 4 : CORRIDOR_Z - 1 - d;
					UnitBuilder.build(c.frame(x, 0, z0, w, d, front, n % 2 == 1), spec);
					out.add(new Placed(type + " " + spec.number + " " + spec.theme, x, z0, w, d, front, 4));
					x += w + 1;
					n++;
				}
			}
		}
		ConnectionResolver.resolve(buf);
		return buf;
	}

	static List<Placed> placedList() {
		return new ArrayList<>();
	}
}
