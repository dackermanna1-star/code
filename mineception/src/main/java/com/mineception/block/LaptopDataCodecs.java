package com.mineception.block;

import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.Theme;
import com.mojang.serialization.Codec;
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
				if (MiniBlock.isValidId(id)) {
					data.putEdit(i + 1, level.indices()[j], MiniBlock.byId(id));
				}
			}
		}
		return data;
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
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			int count = ByteBufCodecs.VAR_INT.decode(buf);
			if (count < 0 || count > LaptopData.MAX_EDITS_PER_DEPTH) {
				throw new IllegalArgumentException("Too many laptop edits: " + count);
			}
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
