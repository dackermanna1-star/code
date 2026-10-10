package net.earthscapes.entity;

import net.earthscapes.registry.EsEntities;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.dolphin.Dolphin;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/** The pink Amazon river dolphin (boto) of the great rivers and flooded forests. */
public class RiverDolphin extends Dolphin {
	public RiverDolphin(EntityType<? extends RiverDolphin> type, Level level) {
		super(type, level);
	}

	@Override
	public @Nullable Dolphin getBreedOffspring(ServerLevel level, AgeableMob partner) {
		return EsEntities.RIVER_DOLPHIN.create(level, EntitySpawnReason.BREEDING);
	}
}
