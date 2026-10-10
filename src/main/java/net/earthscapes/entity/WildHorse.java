package net.earthscapes.entity;

import net.earthscapes.registry.EsEntities;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.equine.AbstractHorse;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/**
 * Wild equids: the plains zebra of the savanna and Przewalski's horse (takhi) of the steppe. They
 * behave like horses, but are wilder and harder to tame; zebras call with a donkey-like bark.
 */
public class WildHorse extends AbstractHorse {
	public WildHorse(EntityType<? extends WildHorse> type, Level level) {
		super(type, level);
	}

	private boolean isZebra() {
		return this.getType() == EsEntities.ZEBRA;
	}

	@Override
	protected void randomizeAttributes(RandomSource random) {
		this.getAttribute(Attributes.MAX_HEALTH).setBaseValue(generateMaxHealth(random::nextInt));
		this.getAttribute(Attributes.MOVEMENT_SPEED).setBaseValue(generateSpeed(random::nextDouble));
		this.getAttribute(Attributes.JUMP_STRENGTH).setBaseValue(generateJumpStrength(random::nextDouble));
	}

	@Override
	public int getMaxTemper() {
		return this.isZebra() ? 160 : 130;
	}

	@Override
	protected SoundEvent getAmbientSound() {
		return this.isZebra() ? SoundEvents.DONKEY_AMBIENT : SoundEvents.HORSE_AMBIENT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return this.isZebra() ? SoundEvents.DONKEY_DEATH : SoundEvents.HORSE_DEATH;
	}

	@Override
	protected @Nullable SoundEvent getEatingSound() {
		return this.isZebra() ? SoundEvents.DONKEY_EAT : SoundEvents.HORSE_EAT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return this.isZebra() ? SoundEvents.DONKEY_HURT : SoundEvents.HORSE_HURT;
	}

	@Override
	protected SoundEvent getAngrySound() {
		return this.isZebra() ? SoundEvents.DONKEY_ANGRY : SoundEvents.HORSE_ANGRY;
	}

	@Override
	public float getVoicePitch() {
		return super.getVoicePitch() * (this.isZebra() ? 1.15F : 1.0F);
	}

	@Override
	public boolean canMate(Animal partner) {
		return partner != this && partner instanceof WildHorse other && partner.getType() == this.getType() && this.canParent() && other.canParent();
	}

	@Override
	public @Nullable AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
		@SuppressWarnings("unchecked")
		WildHorse foal = ((EntityType<? extends WildHorse>) this.getType()).create(level, EntitySpawnReason.BREEDING);
		if (foal != null) {
			this.setOffspringAttributes(partner, foal);
		}
		return foal;
	}
}
