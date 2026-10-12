package com.extremesports.server;

import com.extremesports.block.GateBlock;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;

/** Remembers where race gates are so courses can be assembled without scanning the world. */
public final class CourseRegistry extends SavedData {
	public record Gate(BlockPos pos, GateBlock.Type type, int course, int order) {
		static final Codec<Gate> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			BlockPos.CODEC.fieldOf("pos").forGetter(Gate::pos),
			Codec.STRING.xmap(GateBlock.Type::valueOf, GateBlock.Type::name).fieldOf("type").forGetter(Gate::type),
			Codec.INT.fieldOf("course").forGetter(Gate::course),
			Codec.INT.fieldOf("order").forGetter(Gate::order)
		).apply(instance, Gate::new));
	}

	private static final Codec<CourseRegistry> CODEC = Gate.CODEC.listOf().xmap(CourseRegistry::new, registry -> List.copyOf(registry.gates.values()));
	private static final SavedDataType<CourseRegistry> TYPE = new SavedDataType<>("extremesports_courses", CourseRegistry::new, CODEC, null);

	private final Map<BlockPos, Gate> gates = new HashMap<>();

	public CourseRegistry() {
	}

	private CourseRegistry(List<Gate> list) {
		for (Gate gate : list) {
			gates.put(gate.pos(), gate);
		}
	}

	public static CourseRegistry get(ServerLevel level) {
		return level.getDataStorage().computeIfAbsent(TYPE);
	}

	public void add(BlockPos pos, GateBlock.Type type, int course, int order) {
		gates.put(pos.immutable(), new Gate(pos.immutable(), type, course, order));
		setDirty();
	}

	public void remove(BlockPos pos) {
		if (gates.remove(pos) != null) {
			setDirty();
		}
	}

	public List<Gate> all() {
		return List.copyOf(gates.values());
	}

	public List<Gate> course(int course, GateBlock.Type type) {
		List<Gate> result = new ArrayList<>();
		for (Gate gate : gates.values()) {
			if (gate.course() == course && gate.type() == type) {
				result.add(gate);
			}
		}
		result.sort((a, b) -> Integer.compare(a.order(), b.order()));
		return result;
	}
}
