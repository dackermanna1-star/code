package dev.juukulius.combat;

import dev.juukulius.character.ActionState;
import dev.juukulius.character.JuliusData;
import dev.juukulius.character.JuliusServer;
import dev.juukulius.entity.FirestormEntity;
import dev.juukulius.entity.SpiritBoltEntity;
import dev.juukulius.entity.StoneSpikeEntity;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The six spirits' arts. Each spirit has a primary art and a combination art (sneak + art key):
 * <ul>
 *     <li>Ia (fire): Flame Burst, an exploding fire orb / Ul Gora, Ia and Aro's spiralling firestorm (canon)</li>
 *     <li>Kua (water): Tide Lance, a piercing water lance with a restorative veil / Healing Water (canon: Kua heals)</li>
 *     <li>Aro (wind): Gale Step, a cutting high-speed dash (canon: Aro as propeller) / El Fura, a wind pressure blast (canon)</li>
 *     <li>Iku (earth): Stone Spires, a line of erupting spikes / Ground Shatter, a quake around Julius</li>
 *     <li>In (yang): Radiant Burst, a beam of light plus a brief ward / Strength Enhancement (canon: In boosts strength and agility)</li>
 *     <li>Nes (yin): Umbral Bolt, a slowing and weakening orb / Yin Seal, binding one target (canon-inspired yin seal)</li>
 * </ul>
 * Cost, cooldown and lock are paid by {@link JuliusServer#beginAbility} before {@link #cast} runs.
 */
public final class SpiritArts {
	private SpiritArts() {
	}

	/** Executes an art that has already been paid for. Returns false when it had no valid target (refunded). */
	public static boolean cast(ServerPlayer player, JuliusData data, ActionState state, Ability ability) {
		ServerLevel level = player.level();
		Spirit spirit = ArtFeedback.spiritOf(ability);
		Vec3 look = player.getLookAngle();
		Vec3 hand = ArtFeedback.castPoint(player);
		float power = data.ultimateActive() ? 1.25F : 1.0F;

		boolean success = switch (ability) {
			case IA_FLAME_BURST -> {
				level.addFreshEntity(new SpiritBoltEntity(level, player, hand, look, SpiritBoltEntity.Kind.FLAME, power));
				yield true;
			}
			case UL_GORA -> {
				Vec3 flat = flatLook(player);
				Vec3 start = groundAt(level, player.position().add(flat.scale(2.2)), player.getY());
				level.addFreshEntity(new FirestormEntity(level, player, start, flat, power));
				yield true;
			}
			case KUA_TIDE_LANCE -> {
				level.addFreshEntity(new SpiritBoltEntity(level, player, hand, look, SpiritBoltEntity.Kind.TIDE, power));
				player.clearFire();
				player.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 60, 0, false, false, true), player);
				yield true;
			}
			case KUA_HEALING_WATER -> {
				healingWater(player, power);
				yield true;
			}
			case ARO_GALE_STEP -> {
				state.dashTicks = ArtFeedback.GALE_STEP_TICKS + 2;
				state.dashDirection = flatLook(player);
				state.dashHits.clear();
				player.resetFallDistance();
				yield true;
			}
			case EL_FURA -> {
				elFura(player, look, power);
				yield true;
			}
			case IKU_STONE_SPIRES -> {
				Vec3 flat = flatLook(player);
				for (int i = 0; i < 7; i++) {
					int index = i;
					state.schedule(1 + i * 2, () -> spawnSpire(player, flat, index, power));
				}

				yield true;
			}
			case IKU_GROUND_SHATTER -> {
				groundShatter(player, power);
				yield true;
			}
			case IN_RADIANT_BURST -> {
				radiantBurst(player, look, power);
				yield true;
			}
			case IN_STRENGTH_ENHANCEMENT -> {
				int duration = data.ultimateActive() ? 260 : 200;
				player.addEffect(new MobEffectInstance(MobEffects.STRENGTH, duration, 0, false, true, true), player);
				player.addEffect(new MobEffectInstance(MobEffects.SPEED, duration, 0, false, true, true), player);
				player.addEffect(new MobEffectInstance(MobEffects.HASTE, duration, 0, false, true, true), player);
				yield true;
			}
			case NES_UMBRAL_BOLT -> {
				level.addFreshEntity(new SpiritBoltEntity(level, player, hand, look, SpiritBoltEntity.Kind.UMBRA, power));
				yield true;
			}
			case NES_YIN_SEAL -> yinSeal(player, power);
			default -> false;
		};

		if (success) {
			SoundEvent sound = ArtFeedback.castSound(ability);
			if (sound != null) {
				JuliusServer.playSound(player, sound, 0.9F, 1.0F, player);
			}

			FxType castFx = ArtFeedback.castFx(ability);
			if (castFx != null) {
				Vec3 fxPos = castFx == FxType.CAST_CIRCLE ? hand : player.position();
				float fxPower = castFx == FxType.CAST_CIRCLE ? 0.55F : 1.0F;
				JuliusNetworking.sendFx(level, castFx, player, fxPos, look, spirit.color, fxPower, player);
			}
		}

		return success;
	}

	// ------------------------------------------------------------------------------------------------ Kua

	private static void healingWater(ServerPlayer player, float power) {
		ServerLevel level = player.level();
		player.heal(6.0F * power);
		player.clearFire();
		player.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 100, 1, false, true, true), player);
		for (LivingEntity ally : level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(6.0), entity -> isAlly(player, entity))) {
			ally.heal(4.0F * power);
			ally.clearFire();
			ally.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 100, 0, false, true, true), player);
			JuliusNetworking.sendFx(level, FxType.HIT_SPARK, ally, ally.getBoundingBox().getCenter(), Vec3.ZERO, Spirit.KUA.color, 1.0F);
		}
	}

	private static boolean isAlly(ServerPlayer player, LivingEntity entity) {
		if (entity == player || !entity.isAlive()) {
			return false;
		}

		if (entity instanceof OwnableEntity ownable && ownable.getOwnerReference() != null
			&& ownable.getOwnerReference().getUUID().equals(player.getUUID())) {
			return true;
		}

		return entity instanceof Player other && !other.isSpectator() && (player.isAlliedTo(other) || !CombatUtil.canHarm(player, other));
	}

	// ------------------------------------------------------------------------------------------------ Aro

	/** Each tick of Gale Step cuts enemies near Julius's path with gusts. */
	public static void tickGaleStep(ServerPlayer player, JuliusData data, ActionState state) {
		state.dashTicks--;
		ServerLevel level = player.level();
		player.resetFallDistance();
		float damage = 5.0F * (data.ultimateActive() ? 1.25F : 1.0F);
		Vec3 center = player.getBoundingBox().getCenter();
		for (LivingEntity target : CombatUtil.targetsInSphere(player, center, 1.9)) {
			if (state.dashHits.add(target.getId()) && CombatUtil.damage(player, target, JuliusDamageTypes.SPIRIT_ART, player, damage)) {
				Vec3 away = CombatUtil.horizontalDirection(center, target.position(), state.dashDirection);
				Vec3 push = away.add(state.dashDirection.scale(0.6)).normalize();
				CombatUtil.knockback(target, push, 0.95, 0.25);
				JuliusNetworking.sendFx(level, FxType.HIT_SPARK, target, target.getBoundingBox().getCenter(), state.dashDirection, Spirit.ARO.color, 1.0F);
			}
		}
	}

	private static void elFura(ServerPlayer player, Vec3 look, float power) {
		ServerLevel level = player.level();
		Vec3 origin = player.getEyePosition().add(0.0, -0.4, 0.0);
		for (LivingEntity target : CombatUtil.targetsInCone(player, origin, look, 7.5 * power, 32.0)) {
			double distance = target.position().distanceTo(player.position());
			float falloff = (float) Math.max(0.55, 1.0 - distance / 12.0);
			if (CombatUtil.damage(player, target, JuliusDamageTypes.SPIRIT_ART, player, 7.0F * falloff * power)) {
				CombatUtil.knockback(target, look, 2.1 * falloff, 0.38);
				JuliusNetworking.sendFx(level, FxType.HIT_SPARK, target, target.getBoundingBox().getCenter(), look, Spirit.ARO.color, 1.0F);
			}
		}
	}

	// ------------------------------------------------------------------------------------------------ Iku

	private static void spawnSpire(ServerPlayer player, Vec3 flat, int index, float power) {
		ServerLevel level = player.level();
		Vec3 target = player.position().add(flat.scale(1.7 + index * 1.25));
		Vec3 ground = findGround(level, target, player.getY());
		if (ground == null) {
			return;
		}

		float size = 0.85F + index * 0.07F;
		level.addFreshEntity(new StoneSpikeEntity(level, player, ground, size * power, player.getRandom().nextFloat() * 360.0F));
		JuliusNetworking.sendFx(level, FxType.STONE_SPIRE, null, ground, flat, Spirit.IKU.color, size);
	}

	private static void groundShatter(ServerPlayer player, float power) {
		ServerLevel level = player.level();
		Vec3 center = player.position();
		double radius = 4.6 * power;
		for (LivingEntity target : CombatUtil.targetsInSphere(player, center.add(0.0, 0.5, 0.0), radius)) {
			double distance = target.position().distanceTo(center);
			float falloff = (float) Math.max(0.5, 1.0 - distance / (radius * 2.0));
			if (CombatUtil.damage(player, target, JuliusDamageTypes.SPIRIT_ART, player, 8.0F * falloff * power)) {
				CombatUtil.knockback(target, CombatUtil.horizontalDirection(center, target.position(), flatLook(player)), 0.6, 0.68);
				target.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 50, 0), player);
			}
		}
	}

	// ------------------------------------------------------------------------------------------------ In

	private static void radiantBurst(ServerPlayer player, Vec3 look, float power) {
		ServerLevel level = player.level();
		Vec3 origin = player.getEyePosition();
		for (LivingEntity target : CombatUtil.targetsInCone(player, origin, look, 10.0 * power, 16.0)) {
			float damage = 8.0F * power * (target.getType().is(EntityTypeTags.SENSITIVE_TO_SMITE) ? 1.5F : 1.0F);
			if (CombatUtil.damage(player, target, JuliusDamageTypes.SPIRIT_ART, player, damage)) {
				CombatUtil.knockback(target, look, 0.6, 0.1);
				target.addEffect(new MobEffectInstance(MobEffects.GLOWING, 60, 0), player);
				JuliusNetworking.sendFx(level, FxType.HIT_SPARK, target, target.getBoundingBox().getCenter(), look, Spirit.IN.accent, 1.0F);
			}
		}

		// A brief protective ward of yang light.
		player.addEffect(new MobEffectInstance(MobEffects.ABSORPTION, 120, 0, false, true, true), player);
		player.addEffect(new MobEffectInstance(MobEffects.RESISTANCE, 60, 0, false, true, true), player);
	}

	// ------------------------------------------------------------------------------------------------ Nes

	private static boolean yinSeal(ServerPlayer player, float power) {
		ServerLevel level = player.level();
		LivingEntity target = CombatUtil.raycastTarget(player, 14.0, 0.9);
		if (target == null) {
			return false;
		}

		CombatUtil.damage(player, target, JuliusDamageTypes.SPIRIT_YIN, player, 3.0F * power);
		int duration = Math.round(50 * power);
		target.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, duration, 5, false, true, true), player);
		target.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, duration + 40, 1, false, true, true), player);
		target.addEffect(new MobEffectInstance(MobEffects.MINING_FATIGUE, duration + 40, 1, false, true, true), player);
		Vec3 motion = target.getDeltaMovement();
		target.setDeltaMovement(0.0, Math.min(0.0, motion.y), 0.0);
		target.hurtMarked = true;
		JuliusNetworking.sendFx(level, FxType.YIN_SEAL, target, target.position(), Vec3.ZERO, Spirit.NES.color, (float) duration);
		JuliusServer.playSoundAt(level, target.position(), JuliusSounds.YIN_SEAL, 1.0F, 1.0F);
		return true;
	}

	// ------------------------------------------------------------------------------------------------ geometry

	public static Vec3 flatLook(Player player) {
		Vec3 look = player.getLookAngle();
		Vec3 flat = new Vec3(look.x, 0.0, look.z);
		return flat.lengthSqr() < 1.0E-6 ? Vec3.directionFromRotation(0.0F, player.getYRot()) : flat.normalize();
	}

	/** The standing surface near {@code around} within a few blocks of {@code referenceY}, or null. */
	public static @Nullable Vec3 findGround(Level level, Vec3 around, double referenceY) {
		BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
		int baseY = (int) Math.floor(referenceY);
		int x = (int) Math.floor(around.x);
		int z = (int) Math.floor(around.z);
		for (int dy = 2; dy >= -4; dy--) {
			cursor.set(x, baseY + dy - 1, z);
			if (level.getBlockState(cursor).isFaceSturdy(level, cursor, Direction.UP)) {
				BlockPos above = cursor.above();
				if (level.getBlockState(above).getCollisionShape(level, above).isEmpty()) {
					return new Vec3(around.x, baseY + dy, around.z);
				}
			}
		}

		return null;
	}

	public static Vec3 groundAt(Level level, Vec3 around, double referenceY) {
		Vec3 ground = findGround(level, around, referenceY);
		return ground != null ? ground : new Vec3(around.x, referenceY, around.z);
	}
}
