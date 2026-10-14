package net.abyssaldescent.item.effect;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.WeakHashMap;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModEffects;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** The library of weapon mechanics. */
public final class Effects {
	private Effects() {
	}

	static float proc(float chance) {
		return (float) (chance * AdConfig.get().items.procChanceMultiplier);
	}

	/** Damage dealt by a dungeon weapon (its hits, projectiles and procs), scaled by the configured multiplier. */
	public static float weaponDamage(float damage) {
		return (float) (damage * AdConfig.get().items.weaponDamageMultiplier);
	}

	/** A tooltip number: whole values without a decimal point, others to at most two places. */
	static Object num(double value) {
		if (value == Math.rint(value)) {
			return (int) value;
		}
		return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
	}

	/**
	 * A proc's extra hit on a foe. The swing's own sweep has usually just hurt that foe, and its hurt cooldown would
	 * otherwise swallow all or part of the proc, so the cooldown is cleared first.
	 */
	static void procHurt(ServerLevel level, LivingEntity victim, DamageSource source, float damage) {
		victim.invulnerableTime = 0;
		victim.hurtServer(level, source, damage);
	}

	/** True for things a player's weapon effects may hurt (monsters, and anything hostile to the attacker). */
	static boolean isHostile(LivingEntity attacker, LivingEntity other) {
		if (other == attacker || !other.isAlive() || other.isSpectator()) {
			return false;
		}
		if (attacker instanceof Player) {
			return other instanceof Enemy || other instanceof net.minecraft.world.entity.Mob mob && mob.getTarget() == attacker;
		}
		return other instanceof Player;
	}

	static List<LivingEntity> hostilesNear(ServerLevel level, LivingEntity attacker, Vec3 center, double radius) {
		List<LivingEntity> list = new ArrayList<>();
		for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, new AABB(center, center).inflate(radius))) {
			if (isHostile(attacker, e) && e.position().distanceTo(center) <= radius + e.getBbWidth() * 0.5) {
				list.add(e);
			}
		}
		return list;
	}

	static DamageSource effectSource(ServerLevel level, LivingEntity attacker) {
		return attacker instanceof Player player ? level.damageSources().playerAttack(player) : level.damageSources().mobAttack(attacker);
	}

	// ------------------------------------------------------------------ melee

	/** +X% damage against undead. */
	public record UndeadBane(float bonus) implements WeaponEffect {
		@Override
		public String id() {
			return "undead_bane";
		}

		@Override
		public Object[] args() {
			return new Object[] {Math.round(bonus * 100)};
		}

		@Override
		public float damageBonus(LivingEntity attacker, Entity target, float baseDamage) {
			return target.getType().is(EntityTypeTags.UNDEAD) ? baseDamage * bonus : 0.0F;
		}
	}

	/** Extra damage for each point of the target's armour, up to a cap. */
	public record Sunder(float perArmor, float max) implements WeaponEffect {
		@Override
		public String id() {
			return "sunder";
		}

		@Override
		public Object[] args() {
			return new Object[] {num(perArmor), num(max)};
		}

		@Override
		public float damageBonus(LivingEntity attacker, Entity target, float baseDamage) {
			if (!(target instanceof LivingEntity living)) {
				return 0.0F;
			}
			// Scaled by swing strength like the weapon's own damage, so spam-clicking never beats a charged swing.
			// Vanilla passes a player's attack damage already scaled by charge; the ratio recovers that scale.
			float scale = 1.0F;
			if (attacker instanceof Player) {
				double full = attacker.getAttributeValue(Attributes.ATTACK_DAMAGE);
				scale = full > 0 ? Mth.clamp((float) (baseDamage / full), 0.0F, 1.0F) : 1.0F;
			}
			return Math.min(max, living.getArmorValue() * perArmor) * scale;
		}

		@Override
		public void onHit(HitContext ctx) {
			if (ctx.target().getArmorValue() >= 6 && ctx.fullCharge()) {
				ctx.level().sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.IRON_BLOCK.defaultBlockState()), ctx.target().getX(),
					ctx.target().getY() + ctx.target().getBbHeight() * 0.6, ctx.target().getZ(), 8, 0.2, 0.3, 0.2, 0.1);
			}
		}
	}

	/** Critical hits make the target bleed. */
	public record Bleed(int ticks) implements WeaponEffect {
		@Override
		public String id() {
			return "bleed";
		}

		@Override
		public Object[] args() {
			return new Object[] {num(ticks / 20.0)};
		}

		@Override
		public void onHit(HitContext ctx) {
			if (!ctx.crit()) {
				return;
			}
			int duration = ticks;
			if (ctx.attacker() instanceof Player player && net.abyssaldescent.item.relic.Relics.isActive(player, net.abyssaldescent.item.relic.RelicKind.BLOOD_SIGIL)) {
				duration = duration * 3 / 2;
			}
			ctx.target().addEffect(new MobEffectInstance(ModEffects.BLEEDING, duration, 0), ctx.attacker());
			ctx.level().sendParticles(ModParticles.BLEED_DRIP, ctx.target().getX(), ctx.target().getY() + ctx.target().getBbHeight() * 0.7,
				ctx.target().getZ(), 8, 0.2, 0.2, 0.2, 0.05);
			ctx.level().playSound(null, ctx.target().getX(), ctx.target().getY(), ctx.target().getZ(), ModSounds.BLEED, SoundSource.PLAYERS, 0.7F,
				1.0F + ctx.level().random.nextFloat() * 0.2F);
		}
	}

	/** Fully charged hits may burst soul fire around the target. */
	public record SoulFlare(float chance, float damage, double radius) implements WeaponEffect {
		@Override
		public String id() {
			return "soul_flare";
		}

		@Override
		public Object[] args() {
			return new Object[] {Math.round(chance * 100), num(damage)};
		}

		@Override
		public void onHit(HitContext ctx) {
			if (!ctx.fullCharge() || ctx.level().random.nextFloat() >= proc(chance)) {
				return;
			}
			Vec3 c = ctx.target().position().add(0, ctx.target().getBbHeight() * 0.5, 0);
			for (LivingEntity e : hostilesNear(ctx.level(), ctx.attacker(), c, radius)) {
				if (e != ctx.target()) {
					procHurt(ctx.level(), e, ctx.level().damageSources().source(ModDamageTypes.SOUL_MAGIC, ctx.attacker()), weaponDamage(damage));
				}
			}
			ctx.level().sendParticles(ParticleTypes.SOUL_FIRE_FLAME, c.x, c.y, c.z, 36, radius * 0.4, 0.4, radius * 0.4, 0.08);
			ctx.level().sendParticles(ModParticles.SHOCK_RING, ctx.target().getX(), ctx.target().getY() + 0.05, ctx.target().getZ(), 1, 0, 0, 0, 0);
			ctx.level().playSound(null, c.x, c.y, c.z, ModSounds.SOUL_FLARE, SoundSource.PLAYERS, 1.0F, 1.1F);
		}
	}

	/** Lightning arcs from the target to nearby enemies, weakening with each jump. */
	public record ChainLightning(float chance, int jumps, float damage, double range) implements WeaponEffect {
		/** Damage lost per jump after the first. */
		static final float FALLOFF = 0.15F;

		@Override
		public String id() {
			return "chain_lightning";
		}

		@Override
		public Object[] args() {
			return new Object[] {Math.round(chance * 100), jumps, num(damage), Math.round(FALLOFF * 100)};
		}

		@Override
		public void onHit(HitContext ctx) {
			if (!ctx.fullCharge() || ctx.level().random.nextFloat() >= proc(chance)) {
				return;
			}
			chain(ctx.level(), ctx.attacker(), ctx.target(), jumps, weaponDamage(damage), range);
		}

		public static void chain(ServerLevel level, LivingEntity attacker, LivingEntity first, int jumps, float damage, double range) {
			Set<LivingEntity> hit = new HashSet<>();
			hit.add(first);
			LivingEntity current = first;
			DamageSource source = level.damageSources().source(ModDamageTypes.CHAIN_LIGHTNING, attacker);
			for (int i = 0; i < jumps; i++) {
				LivingEntity next = null;
				double best = range * range;
				for (LivingEntity e : hostilesNear(level, attacker, current.position(), range)) {
					double d = e.distanceToSqr(current);
					if (!hit.contains(e) && d < best) {
						best = d;
						next = e;
					}
				}
				if (next == null) {
					break;
				}
				arc(level, current.position().add(0, current.getBbHeight() * 0.6, 0), next.position().add(0, next.getBbHeight() * 0.6, 0));
				procHurt(level, next, source, damage * (1.0F - i * FALLOFF));
				hit.add(next);
				current = next;
			}
			level.playSound(null, first.getX(), first.getY(), first.getZ(), ModSounds.CHAIN_LIGHTNING, SoundSource.PLAYERS, 1.0F,
				1.0F + level.random.nextFloat() * 0.3F);
		}

		/** A jagged line of sparks between two points. */
		static void arc(ServerLevel level, Vec3 from, Vec3 to) {
			Vec3 delta = to.subtract(from);
			int steps = Math.max(4, (int) (delta.length() * 4));
			for (int s = 0; s <= steps; s++) {
				double t = s / (double) steps;
				double jitter = s == 0 || s == steps ? 0 : 0.18;
				Vec3 p = from.add(delta.scale(t)).add((level.random.nextDouble() - 0.5) * jitter, (level.random.nextDouble() - 0.5) * jitter,
					(level.random.nextDouble() - 0.5) * jitter);
				level.sendParticles(ModParticles.ARC_SPARK, p.x, p.y, p.z, 1, 0, 0, 0, 0);
			}
			level.sendParticles(ParticleTypes.ELECTRIC_SPARK, to.x, to.y, to.z, 6, 0.2, 0.2, 0.2, 0.2);
		}
	}

	/** Falling critical hits send out a shockwave around the target. */
	public record GraveSlam(float damage, double radius) implements WeaponEffect {
		@Override
		public String id() {
			return "grave_slam";
		}

		@Override
		public Object[] args() {
			return new Object[] {num(damage), num(radius)};
		}

		@Override
		public void onHit(HitContext ctx) {
			if (!ctx.crit()) {
				return;
			}
			Vec3 c = ctx.target().position();
			for (LivingEntity e : hostilesNear(ctx.level(), ctx.attacker(), c, radius)) {
				if (e != ctx.target()
					&& e.hurtServer(ctx.level(), ctx.level().damageSources().source(ModDamageTypes.SHOCKWAVE, ctx.attacker()), weaponDamage(damage))) {
					Vec3 push = e.position().subtract(c).normalize();
					e.push(push.x * 0.6, 0.3, push.z * 0.6);
				}
			}
			ctx.level().sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, ctx.level().getBlockState(ctx.target().blockPosition().below())), c.x,
				c.y + 0.1, c.z, 30, radius * 0.5, 0.05, radius * 0.5, 0.15);
			ctx.level().sendParticles(ModParticles.SHOCK_RING, c.x, c.y + 0.05, c.z, 1, 0, 0, 0, 0);
			ctx.level().playSound(null, c.x, c.y, c.z, ModSounds.SHOCKWAVE, SoundSource.PLAYERS, 1.0F, 1.0F);
		}
	}

	/** Fully charged critical hits release a soul-fire wave in front of the wielder. */
	public record Soulreaver(float damage, double length) implements WeaponEffect {
		@Override
		public String id() {
			return "soulreaver";
		}

		@Override
		public Object[] args() {
			return new Object[] {num(damage), num(length)};
		}

		@Override
		public void onHit(HitContext ctx) {
			if (!ctx.crit() || !ctx.fullCharge()) {
				return;
			}
			LivingEntity attacker = ctx.attacker();
			Vec3 dir = attacker.getLookAngle().multiply(1, 0, 1).normalize();
			Vec3 start = attacker.position().add(0, 0.3, 0);
			Set<LivingEntity> hit = new HashSet<>();
			for (double d = 1.0; d <= length; d += 0.5) {
				Vec3 p = start.add(dir.scale(d));
				ctx.level().sendParticles(ParticleTypes.SOUL_FIRE_FLAME, p.x, p.y, p.z, 4, 0.35, 0.15, 0.35, 0.02);
				if (((int) (d * 2)) % 2 == 0) {
					ctx.level().sendParticles(ModParticles.SOUL_EMBER, p.x, p.y + 0.4, p.z, 2, 0.2, 0.3, 0.2, 0.02);
				}
				for (LivingEntity e : hostilesNear(ctx.level(), attacker, p, 1.3)) {
					if (hit.add(e) && e != ctx.target()) {
						e.hurtServer(ctx.level(), ctx.level().damageSources().source(ModDamageTypes.SOUL_MAGIC, attacker), weaponDamage(damage));
					}
				}
			}
			ctx.level().playSound(null, attacker.getX(), attacker.getY(), attacker.getZ(), ModSounds.SOUL_FLARE, SoundSource.PLAYERS, 1.2F, 0.8F);
		}
	}

	/** Kills draw the victim's soul back into the wielder, healing them. */
	public record ReapSouls(float heal) implements WeaponEffect {
		@Override
		public String id() {
			return "reap_souls";
		}

		@Override
		public Object[] args() {
			return new Object[] {num(heal)};
		}

		@Override
		public void onKill(HitContext ctx) {
			LivingEntity attacker = ctx.attacker();
			attacker.heal(heal);
			Vec3 from = ctx.target().position().add(0, ctx.target().getBbHeight() * 0.6, 0);
			Vec3 to = attacker.position().add(0, 1.0, 0);
			Vec3 delta = to.subtract(from);
			for (int i = 0; i <= 10; i++) {
				Vec3 p = from.add(delta.scale(i / 10.0)).add(0, Math.sin(i / 10.0 * Math.PI) * 0.6, 0);
				ctx.level().sendParticles(ParticleTypes.SOUL, p.x, p.y, p.z, 1, 0.02, 0.02, 0.02, 0.0);
			}
			ctx.level().sendParticles(ModParticles.SOUL_EMBER, to.x, to.y, to.z, 10, 0.3, 0.4, 0.3, 0.02);
		}
	}

	// ------------------------------------------------------------------ projectiles

	/** Arrows pierce several enemies and burn with a soul trail. */
	public record SoulPierce(int pierce, double bonusDamage) implements WeaponEffect {
		@Override
		public String id() {
			return "soul_pierce";
		}

		@Override
		public Object[] args() {
			return new Object[] {pierce};
		}

		@Override
		public void onProjectileLaunch(Projectile projectile, LivingEntity shooter, ItemStack weapon) {
			if (projectile instanceof AbstractArrow arrow) {
				((net.abyssaldescent.mixin.AbstractArrowAccessor) arrow).abyssal_descent$setPierceLevel((byte) Math.max(arrow.getPierceLevel(), pierce));
				arrow.setBaseDamage(((net.abyssaldescent.mixin.AbstractArrowAccessor) arrow).abyssal_descent$getBaseDamage() + bonusDamage);
			}
		}

		@Override
		public void onProjectileHit(ServerLevel level, Projectile projectile, @Nullable Entity hit, Vec3 at, @Nullable LivingEntity owner) {
			level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, at.x, at.y, at.z, 8, 0.15, 0.15, 0.15, 0.03);
		}
	}

	/** Bolts burst into bone shrapnel on impact, once per bolt. */
	public record BoneShrapnel(float damage, double radius) implements WeaponEffect {
		/** Bolts that already burst: one bounced off a shield or a foe in its hurt cooldown would burst again where it lands. */
		private static final Set<Projectile> BURST = Collections.newSetFromMap(new WeakHashMap<>());

		@Override
		public String id() {
			return "bone_shrapnel";
		}

		@Override
		public Object[] args() {
			return new Object[] {num(damage), num(radius)};
		}

		@Override
		public void onProjectileHit(ServerLevel level, Projectile projectile, @Nullable Entity hit, Vec3 at, @Nullable LivingEntity owner) {
			if (owner == null || !BURST.add(projectile)) {
				return;
			}
			for (LivingEntity e : hostilesNear(level, owner, at, radius)) {
				if (e != hit) {
					e.hurtServer(level, level.damageSources().source(ModDamageTypes.SHOCKWAVE, projectile, owner), weaponDamage(damage));
				}
			}
			level.sendParticles(ModParticles.BONE_SHARD, at.x, at.y, at.z, 14, 0.1, 0.1, 0.1, 0.35);
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), at.x, at.y, at.z, 10, 0.2, 0.2, 0.2, 0.1);
			level.playSound(null, at.x, at.y, at.z, ModSounds.BONE_SHRAPNEL, SoundSource.PLAYERS, 1.0F, 1.0F + level.random.nextFloat() * 0.2F);
		}
	}
}
