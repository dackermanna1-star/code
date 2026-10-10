package net.earthscapes.entity.goal;

import net.earthscapes.entity.EsAnimal;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;

/** Predators pick their natural prey when hungry, then rest for a while after the hunt. */
public class HuntGoal extends NearestAttackableTargetGoal<LivingEntity> {
	private final EsAnimal hunter;

	public HuntGoal(EsAnimal hunter, TagKey<EntityType<?>> prey) {
		super(hunter, LivingEntity.class, 100, true, false, (target, level) -> target.getType().is(prey));
		this.hunter = hunter;
	}

	@Override
	public boolean canUse() {
		return !this.hunter.isBaby() && this.hunter.isHungry() && super.canUse();
	}

	@Override
	public void stop() {
		super.stop();
		this.hunter.sated();
	}
}
