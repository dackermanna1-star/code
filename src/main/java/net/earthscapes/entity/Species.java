package net.earthscapes.entity;

import java.util.IdentityHashMap;
import java.util.Map;
import net.minecraft.core.Holder;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.biome.Biome;
import org.jspecify.annotations.Nullable;

/**
 * How one kind of {@link EsAnimal} behaves: what it eats, whether it lives in herds, flees from
 * people or predators, fights back or hunts, likes water, and how it sounds.
 */
public final class Species {
	private static final Map<EntityType<?>, Species> BY_TYPE = new IdentityHashMap<>();

	/** Picks the variant of a newly spawned animal (e.g. lion or lioness, by sex or by region). */
	@FunctionalInterface
	public interface VariantPicker {
		int pick(Holder<Biome> biome, RandomSource random);
	}

	TagKey<Item> food;
	float herdRadius;
	float shyDistance;
	boolean prey;
	boolean neutral;
	boolean swims;
	boolean grazes;
	@Nullable TagKey<EntityType<?>> hunts;
	boolean ambushesInWater;
	double fleeSpeed = 1.6;
	double chaseSpeed = 1.25;
	float actionChance;
	@Nullable SoundEvent ambient;
	@Nullable SoundEvent hurt;
	@Nullable SoundEvent death;
	@Nullable SoundEvent step;
	@Nullable SoundEvent action;
	float pitch = 1.0F;
	float volume = 1.0F;
	int ambientInterval = 120;
	@Nullable VariantPicker variants;

	public Species(TagKey<Item> food) {
		this.food = food;
	}

	public static Species of(EntityType<?> type) {
		return BY_TYPE.get(type);
	}

	public Species bind(EntityType<?> type) {
		BY_TYPE.put(type, this);
		return this;
	}

	/** Keeps within the given distance of the rest of its herd. */
	public Species herd(float radius) {
		this.herdRadius = radius;
		return this;
	}

	/** Runs from players that come closer than this, unless they sneak up on it. */
	public Species shy(float distance) {
		this.shyDistance = distance;
		return this;
	}

	/** Runs from predators. */
	public Species prey() {
		this.prey = true;
		return this;
	}

	/** Fights back when attacked, and the herd joins in. */
	public Species neutral() {
		this.neutral = true;
		return this;
	}

	/** Swims and wades instead of avoiding water. */
	public Species swims() {
		this.swims = true;
		return this;
	}

	/** Now and then lowers its head to graze. */
	public Species grazes() {
		this.grazes = true;
		return this;
	}

	/** Hunts animals of the given types when hungry. */
	public Species hunts(TagKey<EntityType<?>> prey) {
		this.hunts = prey;
		return this;
	}

	/** Attacks players at the water's edge. */
	public Species ambushesInWater() {
		this.ambushesInWater = true;
		return this;
	}

	public Species speeds(double flee, double chase) {
		this.fleeSpeed = flee;
		this.chaseSpeed = chase;
		return this;
	}

	public Species sounds(@Nullable SoundEvent ambient, @Nullable SoundEvent hurt, @Nullable SoundEvent death, @Nullable SoundEvent step) {
		this.ambient = ambient;
		this.hurt = hurt;
		this.death = death;
		this.step = step;
		return this;
	}

	public Species voice(float pitch, float volume, int ambientInterval) {
		this.pitch = pitch;
		this.volume = volume;
		this.ambientInterval = ambientInterval;
		return this;
	}

	/**
	 * A display played with some of its calls, such as an elephant raising its trunk, a hippo
	 * yawning or a lion roaring; the optional sound replaces the usual call.
	 */
	public Species action(float chance, @Nullable SoundEvent sound) {
		this.actionChance = chance;
		this.action = sound;
		return this;
	}

	public Species variants(VariantPicker picker) {
		this.variants = picker;
		return this;
	}
}
