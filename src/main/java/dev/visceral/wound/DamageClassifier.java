package dev.visceral.wound;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Turns a {@link DamageSource} into physical hits: what kind of wound, where on the bounding box it
 * landed and which way the blow was travelling.
 */
public final class DamageClassifier {
	private static final Set<EntityType<?>> BITERS = Set.of(
		EntityType.WOLF, EntityType.SPIDER, EntityType.CAVE_SPIDER, EntityType.SILVERFISH, EntityType.ENDERMITE, EntityType.FOX,
		EntityType.AXOLOTL, EntityType.PHANTOM, EntityType.HOGLIN, EntityType.ZOGLIN, EntityType.DOLPHIN, EntityType.RAVAGER,
		EntityType.RABBIT, EntityType.NAUTILUS, EntityType.ZOMBIE_NAUTILUS, EntityType.ZOMBIE_HORSE, EntityType.CAMEL_HUSK,
		EntityType.GUARDIAN, EntityType.ELDER_GUARDIAN, EntityType.LLAMA, EntityType.TRADER_LLAMA, EntityType.HUSK, EntityType.DROWNED,
		EntityType.ZOMBIE, EntityType.ZOMBIE_VILLAGER
	);
	private static final Set<EntityType<?>> CLAWERS = Set.of(
		EntityType.POLAR_BEAR, EntityType.CAT, EntityType.OCELOT, EntityType.PANDA, EntityType.CREAKING
	);
	private static final Set<EntityType<?>> STINGERS = Set.of(EntityType.BEE, EntityType.PUFFERFISH);

	private DamageClassifier() {
	}

	/** A single physical impact. {@code point} lies on the victim's bounding box, {@code dir} is normalized. */
	public record Hit(WoundType type, Vec3 point, Vec3 dir, float severity, float roll, boolean explosion) {
	}

	/** @return the hits caused by this damage, empty if it leaves no physical trace (magic, drowning, starvation...) */
	public static List<Hit> classify(LivingEntity victim, DamageSource source, float damage, RandomSource random) {
		float severity = Mth.clamp(damage / 6.0F, 0.12F, 2.5F);
		AABB box = victim.getBoundingBox();
		Entity direct = source.getDirectEntity();
		Entity attacker = source.getEntity();
		List<Hit> hits = new ArrayList<>(1);

		if (source.is(DamageTypeTags.IS_EXPLOSION)) {
			Vec3 center = source.getSourcePosition() != null ? source.getSourcePosition() : box.getCenter().add(0, -1, 0);
			int count = 2 + random.nextInt(Math.min(4, 1 + (int) (damage / 5.0F)));
			for (int i = 0; i < count; i++) {
				Vec3 target = randomPointFacing(box, center, random);
				Vec3 dir = safeNormalize(target.subtract(center), random);
				WoundType type = switch (random.nextInt(5)) {
					case 0 -> WoundType.BURN;
					case 1, 2 -> WoundType.CUT;
					default -> WoundType.BRUISE;
				};
				hits.add(new Hit(type, target, dir, Math.min(2.5F, severity * (0.6F + random.nextFloat() * 0.6F)), randomRoll(random), true));
			}
			return hits;
		}

		if (source.is(DamageTypeTags.IS_FIRE) || source.is(DamageTypeTags.IS_LIGHTNING) || source.is(DamageTypes.HOT_FLOOR)
			|| source.is(DamageTypes.FIREWORKS)) {
			Vec3 dir;
			Vec3 point;
			if (direct instanceof Projectile projectile) {
				dir = projectileDirection(projectile, box, random);
				point = clipOrNearest(box, projectile.position().subtract(dir.scale(2.0)), dir);
			} else if (source.is(DamageTypes.HOT_FLOOR) || source.is(DamageTypes.LAVA)) {
				point = new Vec3(Mth.lerp(random.nextFloat(), box.minX, box.maxX), box.minY + box.getYsize() * random.nextFloat() * 0.4, Mth.lerp(random.nextFloat(), box.minZ, box.maxZ));
				dir = new Vec3(0, 1, 0);
				point = clipOrNearest(box, point.subtract(0, 1, 0), dir);
			} else {
				Hit random1 = randomSideHit(WoundType.BURN, box, severity, random);
				point = random1.point;
				dir = random1.dir;
			}
			hits.add(new Hit(WoundType.BURN, point, dir, severity, randomRoll(random), false));
			return hits;
		}

		if (source.is(DamageTypeTags.IS_FALL) || source.is(DamageTypes.STALAGMITE)) {
			WoundType type = source.is(DamageTypes.STALAGMITE) ? WoundType.PUNCTURE : WoundType.BRUISE;
			Vec3 point = new Vec3(Mth.lerp(0.3F + random.nextFloat() * 0.4F, box.minX, box.maxX), box.minY, Mth.lerp(0.3F + random.nextFloat() * 0.4F, box.minZ, box.maxZ));
			hits.add(new Hit(type, point, new Vec3(0, 1, 0), severity, randomRoll(random), false));
			return hits;
		}

		if (source.is(DamageTypes.FALLING_BLOCK) || source.is(DamageTypes.FALLING_ANVIL) || source.is(DamageTypes.FALLING_STALACTITE)) {
			WoundType type = source.is(DamageTypes.FALLING_STALACTITE) ? WoundType.PUNCTURE : WoundType.BRUISE;
			Vec3 point = new Vec3(Mth.lerp(0.35F + random.nextFloat() * 0.3F, box.minX, box.maxX), box.maxY, Mth.lerp(0.35F + random.nextFloat() * 0.3F, box.minZ, box.maxZ));
			hits.add(new Hit(type, point, new Vec3(0, -1, 0), severity, randomRoll(random), false));
			return hits;
		}

		if (source.is(DamageTypes.FLY_INTO_WALL)) {
			Vec3 motion = victim.getDeltaMovement();
			Vec3 dir = motion.lengthSqr() > 1.0E-4 ? motion.normalize() : victim.getLookAngle();
			hits.add(new Hit(WoundType.BRUISE, clipOrNearest(box, box.getCenter().subtract(dir.scale(3.0)), dir.reverse()), dir.reverse(), severity, randomRoll(random), false));
			return hits;
		}

		if (source.is(DamageTypes.CACTUS) || source.is(DamageTypes.SWEET_BERRY_BUSH)) {
			hits.add(randomSideHit(WoundType.CUT, box, Math.min(severity, 0.3F), random));
			return hits;
		}

		if (source.is(DamageTypes.CRAMMING) || source.is(DamageTypes.IN_WALL) || source.is(DamageTypes.SONIC_BOOM)) {
			Hit hit = randomSideHit(WoundType.BRUISE, box, severity, random);
			if (source.is(DamageTypes.SONIC_BOOM) && attacker != null) {
				Vec3 dir = safeNormalize(box.getCenter().subtract(attacker.getEyePosition()), random);
				hit = new Hit(WoundType.BRUISE, clipOrNearest(box, box.getCenter().subtract(dir.scale(3.0)), dir), dir, severity, randomRoll(random), true);
			}
			hits.add(hit);
			return hits;
		}

		if (direct instanceof Projectile projectile) {
			WoundType type = projectileWound(projectile);
			if (type == null) {
				return hits;
			}
			Vec3 dir = projectileDirection(projectile, box, random);
			Vec3 point = clipOrNearest(box, projectile.position().subtract(dir.scale(2.5)), dir);
			hits.add(new Hit(type, point, dir, severity, randomRoll(random), false));
			return hits;
		}

		if (direct != null && direct.getType() == EntityType.EVOKER_FANGS) {
			Vec3 point = new Vec3(Mth.lerp(0.3F + random.nextFloat() * 0.4F, box.minX, box.maxX), box.minY + 0.1, Mth.lerp(0.3F + random.nextFloat() * 0.4F, box.minZ, box.maxZ));
			Vec3 dir = new Vec3(random.nextFloat() - 0.5F, 0.4, random.nextFloat() - 0.5F).normalize();
			hits.add(new Hit(WoundType.BITE, clipOrNearest(box, point.subtract(dir.scale(2.0)), dir), dir, severity, randomRoll(random), false));
			return hits;
		}

		boolean melee = source.is(DamageTypes.PLAYER_ATTACK) || source.is(DamageTypes.MOB_ATTACK) || source.is(DamageTypes.MOB_ATTACK_NO_AGGRO)
			|| source.is(DamageTypes.STING) || source.is(DamageTypes.SPEAR) || source.is(DamageTypes.MACE_SMASH) || source.is(DamageTypes.THORNS);
		if (melee && direct != null) {
			WoundType type;
			if (source.is(DamageTypes.THORNS)) {
				type = WoundType.PUNCTURE;
				severity = Math.min(severity, 0.5F);
			} else if (source.is(DamageTypes.MACE_SMASH)) {
				type = WoundType.BRUISE;
			} else if (source.is(DamageTypes.SPEAR)) {
				type = WoundType.PUNCTURE;
			} else {
				ItemStack weapon = source.getWeaponItem();
				type = weapon != null && !weapon.isEmpty() ? fromWeapon(weapon) : natural(direct);
			}
			Vec3 eye = direct.getEyePosition();
			Vec3 look = direct.getViewVector(1.0F);
			Optional<Vec3> clip = box.inflate(0.05).clip(eye, eye.add(look.scale(10.0)));
			Vec3 point;
			Vec3 dir;
			if (clip.isPresent()) {
				point = clip.get();
				dir = look;
			} else {
				Vec3 aim = new Vec3(box.getCenter().x, Mth.clamp(eye.y, box.minY + 0.1, box.maxY - 0.1), box.getCenter().z);
				dir = safeNormalize(aim.subtract(eye), random);
				point = clipOrNearest(box, eye, dir);
			}
			hits.add(new Hit(type, point, dir, severity, rollFor(type, random), false));
			return hits;
		}

		return hits;
	}

	private static WoundType fromWeapon(ItemStack stack) {
		if (stack.is(ItemTags.SWORDS) || stack.is(ItemTags.HOES) || stack.is(Items.SHEARS)) {
			return WoundType.CUT;
		}
		if (stack.is(ItemTags.AXES)) {
			return WoundType.GASH;
		}
		if (stack.is(ItemTags.SPEARS) || stack.is(Items.TRIDENT) || stack.is(ItemTags.PICKAXES)) {
			return WoundType.PUNCTURE;
		}
		return WoundType.BRUISE;
	}

	private static WoundType natural(Entity attacker) {
		EntityType<?> type = attacker.getType();
		if (STINGERS.contains(type)) {
			return WoundType.PUNCTURE;
		}
		if (CLAWERS.contains(type)) {
			return WoundType.CLAW;
		}
		if (BITERS.contains(type)) {
			// Zombies mostly claw and bite at you.
			return type == EntityType.ZOMBIE || type == EntityType.HUSK || type == EntityType.DROWNED || type == EntityType.ZOMBIE_VILLAGER
				? (attacker.getRandom().nextBoolean() ? WoundType.BITE : WoundType.BRUISE)
				: WoundType.BITE;
		}
		return WoundType.BRUISE;
	}

	private static WoundType projectileWound(Projectile projectile) {
		EntityType<?> type = projectile.getType();
		if (projectile instanceof AbstractArrow) {
			return WoundType.PUNCTURE;
		}
		if (type == EntityType.FIREBALL || type == EntityType.SMALL_FIREBALL || type == EntityType.DRAGON_FIREBALL || type == EntityType.WITHER_SKULL
			|| type == EntityType.FIREWORK_ROCKET) {
			return WoundType.BURN;
		}
		if (type == EntityType.LLAMA_SPIT || type == EntityType.EGG) {
			return null;
		}
		return WoundType.BRUISE;
	}

	private static float rollFor(WoundType type, RandomSource random) {
		float sign = random.nextBoolean() ? 1.0F : -1.0F;
		return switch (type) {
			case CUT -> sign * Mth.DEG_TO_RAD * (10.0F + random.nextFloat() * 50.0F);
			case GASH -> sign * Mth.DEG_TO_RAD * (55.0F + random.nextFloat() * 35.0F);
			case CLAW -> sign * Mth.DEG_TO_RAD * (50.0F + random.nextFloat() * 30.0F);
			default -> randomRoll(random);
		};
	}

	private static float randomRoll(RandomSource random) {
		return random.nextFloat() * Mth.TWO_PI;
	}

	private static Vec3 projectileDirection(Projectile projectile, AABB box, RandomSource random) {
		Vec3 motion = projectile.getDeltaMovement();
		if (motion.lengthSqr() > 1.0E-6) {
			return motion.normalize();
		}
		return safeNormalize(box.getCenter().subtract(projectile.position()), random);
	}

	private static Hit randomSideHit(WoundType type, AABB box, float severity, RandomSource random) {
		float angle = random.nextFloat() * Mth.TWO_PI;
		Vec3 dir = new Vec3(Mth.cos(angle), (random.nextFloat() - 0.5F) * 0.3F, Mth.sin(angle)).normalize();
		Vec3 center = new Vec3(box.getCenter().x, box.minY + box.getYsize() * (0.15 + random.nextFloat() * 0.75), box.getCenter().z);
		Vec3 point = clipOrNearest(box, center.subtract(dir.scale(3.0)), dir);
		return new Hit(type, point, dir, severity, randomRoll(random), false);
	}

	private static Vec3 randomPointFacing(AABB box, Vec3 from, RandomSource random) {
		Vec3 center = box.getCenter();
		Vec3 jitter = new Vec3(
			(random.nextFloat() - 0.5F) * box.getXsize() * 0.8,
			(random.nextFloat() - 0.5F) * box.getYsize() * 0.8,
			(random.nextFloat() - 0.5F) * box.getZsize() * 0.8
		);
		Vec3 target = center.add(jitter);
		Vec3 dir = safeNormalize(target.subtract(from), random);
		return clipOrNearest(box, target.subtract(dir.scale(4.0)), dir);
	}

	/** First intersection of the ray with the box, or the point of the box closest to the ray. */
	static Vec3 clipOrNearest(AABB box, Vec3 origin, Vec3 dir) {
		Optional<Vec3> clip = box.clip(origin, origin.add(dir.scale(16.0)));
		if (clip.isPresent()) {
			return clip.get();
		}
		Vec3 center = box.getCenter();
		double t = Math.max(0.0, center.subtract(origin).dot(dir));
		Vec3 closest = origin.add(dir.scale(t));
		return new Vec3(
			Mth.clamp(closest.x, box.minX, box.maxX),
			Mth.clamp(closest.y, box.minY, box.maxY),
			Mth.clamp(closest.z, box.minZ, box.maxZ)
		);
	}

	private static Vec3 safeNormalize(Vec3 vec, RandomSource random) {
		double length = vec.length();
		if (length < 1.0E-5) {
			float angle = random.nextFloat() * Mth.TWO_PI;
			return new Vec3(Mth.cos(angle), 0, Mth.sin(angle));
		}
		return vec.scale(1.0 / length);
	}
}
