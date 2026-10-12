package com.mineception.block;

import com.mineception.dream.EditBudget;
import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/** Save-file and network codecs for {@link LaptopData}. */
public final class LaptopDataCodecs {
	/** One level's edits as parallel arrays of cell indices and block ids. */
	private record Level(int[] indices, byte[] blocks) {
		static final Codec<Level> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			Codec.INT_STREAM.xmap(IntStream::toArray, IntStream::of).fieldOf("cells").forGetter(Level::indices),
			Codec.BYTE_BUFFER.xmap(LaptopDataCodecs::toArray, ByteBuffer::wrap).fieldOf("blocks").forGetter(Level::blocks)
		).apply(instance, Level::new));
	}

	public static final Codec<LaptopData> CODEC = RecordCodecBuilder.create(instance -> instance.group(
		Codec.LONG.fieldOf("seed").forGetter(LaptopData::seed),
		Level.CODEC.listOf().optionalFieldOf("levels", List.of()).forGetter(LaptopDataCodecs::levels)
	).apply(instance, LaptopDataCodecs::fromLevels));

	public static final StreamCodec<ByteBuf, LaptopData> STREAM_CODEC = StreamCodec.of(LaptopDataCodecs::write, LaptopDataCodecs::read);

	/**
	 * Edits a laptop received since clients last got its whole data, sent to the players watching it instead of the
	 * whole data (which can be tens of kilobytes) after every edit.
	 *
	 * @param seed   seed of the data the edits apply to; a client holding other data ignores them
	 * @param depths level of each edit (1..4)
	 * @param cells  cell index of each edit
	 * @param blocks new block id of each edit
	 */
	public record Delta(long seed, byte[] depths, int[] cells, byte[] blocks) {
		/** Most edits one delta carries. */
		public static final int MAX_EDITS = 1024;

		public static final Codec<Delta> CODEC = RecordCodecBuilder.<Delta>create(instance -> instance.group(
			Codec.LONG.fieldOf("seed").forGetter(Delta::seed),
			Codec.BYTE_BUFFER.xmap(LaptopDataCodecs::toArray, ByteBuffer::wrap).fieldOf("depths").forGetter(Delta::depths),
			Codec.INT_STREAM.xmap(IntStream::toArray, IntStream::of).fieldOf("cells").forGetter(Delta::cells),
			Codec.BYTE_BUFFER.xmap(LaptopDataCodecs::toArray, ByteBuffer::wrap).fieldOf("blocks").forGetter(Delta::blocks)
		).apply(instance, Delta::new)).validate(delta -> delta.depths.length == delta.cells.length
			&& delta.cells.length == delta.blocks.length && delta.cells.length <= MAX_EDITS
			? DataResult.success(delta) : DataResult.error(() -> "Malformed laptop delta"));

		/** A delta of one edit. */
		public static Delta of(long seed, int depth, int index, MiniBlock block) {
			return new Delta(seed, new byte[]{(byte) depth}, new int[]{index}, new byte[]{(byte) block.id});
		}

		/**
		 * {@code data} with these edits recorded (a new object; {@code data} is not changed), dropping edits a player could
		 * not have made and edits past the {@link EditBudget} just like decoding whole data does.
		 */
		public LaptopData applyTo(LaptopData data) {
			LaptopData result = data.copy();
			int count = Math.min(cells.length, Math.min(depths.length, blocks.length));
			for (int i = 0; i < count; i++) {
				int id = blocks[i] & 0xFF;
				if (MiniBlock.isValidId(id) && plausible(cells[i], MiniBlock.byId(id))) {
					EditBudget.record(result, depths[i], cells[i], MiniBlock.byId(id));
				}
			}
			return result;
		}
	}

	private LaptopDataCodecs() {
	}

	private static byte[] toArray(ByteBuffer buffer) {
		ByteBuffer copy = buffer.duplicate();
		byte[] bytes = new byte[copy.remaining()];
		copy.get(bytes);
		return bytes;
	}

	private static List<Level> levels(LaptopData data) {
		List<Level> levels = new ArrayList<>(Theme.DEPTHS);
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			Map<Integer, Byte> edits = data.edits(depth);
			int[] indices = new int[edits.size()];
			byte[] blocks = new byte[edits.size()];
			int i = 0;
			for (Map.Entry<Integer, Byte> entry : edits.entrySet()) {
				indices[i] = entry.getKey();
				blocks[i] = entry.getValue();
				i++;
			}
			levels.add(new Level(indices, blocks));
		}
		return levels;
	}

	private static LaptopData fromLevels(long seed, List<Level> levels) {
		LaptopData data = new LaptopData(seed);
		for (int i = 0; i < Math.min(levels.size(), Theme.DEPTHS); i++) {
			Level level = levels.get(i);
			int count = Math.min(level.indices().length, level.blocks().length);
			for (int j = 0; j < count; j++) {
				int id = level.blocks()[j] & 0xFF;
				int index = level.indices()[j];
				if (MiniBlock.isValidId(id) && plausible(index, MiniBlock.byId(id))) {
					EditBudget.record(data, i + 1, index, MiniBlock.byId(id));
				}
			}
		}
		return data;
	}

	/**
	 * Only edits a player could have made survive decoding: breaking (air) or placing a hotbar block, never on the
	 * bedrock floor. Item components can come from creative-mode clients, so stray laptops or bedrock holes are dropped.
	 * Edits beyond the laptop's {@link EditBudget} are dropped too. Edits covering a level's own laptop can only be told
	 * apart once the level is generated, which is too costly here; the block entity removes those
	 * ({@link com.mineception.dream.EditRules#withoutProtectedEdits}).
	 */
	private static boolean plausible(int index, MiniBlock block) {
		return index >= 0 && index < MiniWorld.VOLUME && MiniWorld.indexY(index) > 0
			&& (block == MiniBlock.AIR || block.placeable());
	}

	private static void write(ByteBuf buf, LaptopData data) {
		buf.writeLong(data.seed());
		for (Level level : levels(data)) {
			ByteBufCodecs.VAR_INT.encode(buf, level.indices().length);
			for (int i = 0; i < level.indices().length; i++) {
				ByteBufCodecs.VAR_INT.encode(buf, level.indices()[i]);
				buf.writeByte(level.blocks()[i]);
			}
		}
	}

	private static LaptopData read(ByteBuf buf) {
		long seed = buf.readLong();
		List<Level> levels = new ArrayList<>(Theme.DEPTHS);
		int total = 0;
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			int count = ByteBufCodecs.VAR_INT.decode(buf);
			if (count < 0 || count > LaptopData.MAX_EDITS_PER_DEPTH || count > EditBudget.MAX_EDITS - total) {
				throw new IllegalArgumentException("Too many laptop edits: " + count + " after " + total);
			}
			total += count;
			int[] indices = new int[count];
			byte[] blocks = new byte[count];
			for (int i = 0; i < count; i++) {
				indices[i] = ByteBufCodecs.VAR_INT.decode(buf);
				blocks[i] = buf.readByte();
			}
			levels.add(new Level(indices, blocks));
		}
		return fromLevels(seed, levels);
	}
}
