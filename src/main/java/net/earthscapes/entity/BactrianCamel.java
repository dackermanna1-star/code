package net.earthscapes.entity;

import net.earthscapes.registry.EsEntities;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.camel.Camel;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/** The two-humped Bactrian camel of the Gobi; rideable like the dromedary. */
public class BactrianCamel extends Camel {
	public BactrianCamel(EntityType<? extends BactrianCamel> type, Level level) {
		super(type, level);
	}

	@Override
	public @Nullable Camel getBreedOffspring(ServerLevel level, AgeableMob partner) {
		return EsEntities.BACTRIAN_CAMEL.create(level, EntitySpawnReason.BREEDING);
	}
}
