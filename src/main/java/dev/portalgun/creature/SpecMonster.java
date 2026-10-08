package dev.portalgun.creature;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.level.Level;

/** Hostile spec creatures: an {@link Enemy}, so golems fight them and they leave in peaceful. */
public class SpecMonster extends SpecCreature implements Enemy {
	public SpecMonster(EntityType<? extends SpecCreature> type, Level level) {
		super(type, level);
	}
}
