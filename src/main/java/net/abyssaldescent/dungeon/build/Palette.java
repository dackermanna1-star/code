package net.abyssaldescent.dungeon.build;

import java.util.ArrayList;
import java.util.List;
import net.abyssaldescent.util.Seeds;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/** Weighted block choice driven by a positional hash, so variation is stable regardless of painting order. */
public final class Palette {
	private final List<BlockState> states = new ArrayList<>();
	private final List<Float> cumulative = new ArrayList<>();
	private final long salt;
	private float total;

	public Palette(long salt) {
		this.salt = salt;
	}

	public static Palette of(long salt) {
		return new Palette(salt);
	}

	public Palette add(Block block, float weight) {
		return add(block.defaultBlockState(), weight);
	}

	public Palette add(BlockState state, float weight) {
		total += weight;
		states.add(state);
		cumulative.add(total);
		return this;
	}

	public BlockState pick(int x, int y, int z) {
		if (states.size() == 1) {
			return states.get(0);
		}
		float roll = Seeds.hash01(salt, x, y, z) * total;
		for (int i = 0; i < states.size(); i++) {
			if (roll < cumulative.get(i)) {
				return states.get(i);
			}
		}
		return states.get(states.size() - 1);
	}
}
