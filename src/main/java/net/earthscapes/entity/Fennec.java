package net.earthscapes.entity;

import net.earthscapes.registry.EsEntities;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.fox.Fox;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/** The fennec fox: a tiny, big-eared desert fox that sleeps through the heat of the day. */
public class Fennec extends Fox {
	public Fennec(EntityType<? extends Fennec> type, Level level) {
		super(type, level);
	}

	@Override
	public @Nullable Fox getBreedOffspring(ServerLevel level, AgeableMob partner) {
		return EsEntities.FENNEC.create(level, EntitySpawnReason.BREEDING);
	}

	@Override
	public float getVoicePitch() {
		return super.getVoicePitch() * 1.3F;
	}
}
