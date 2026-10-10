package net.earthscapes.entity;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.parrot.Parrot;
import net.minecraft.world.level.Level;

/** The toco toucan: flies between the treetops of the rainforest and perches on branches. */
public class Toucan extends Parrot {
	public Toucan(EntityType<? extends Toucan> type, Level level) {
		super(type, level);
	}

	@Override
	public boolean setEntityOnShoulder(ServerPlayer player) {
		// far too big a bill to ride on a shoulder
		return false;
	}

	@Override
	public float getVoicePitch() {
		return super.getVoicePitch() * 0.75F;
	}
}
