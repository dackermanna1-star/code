package dev.portalgun.dimension;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import java.util.List;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Dimension-wide rules that the data pack cannot express: altered gravity, lightning storms,
 * water breathing, creeping darkness and so on. Configured by the "effects" list in the content spec.
 */
public final class DimensionEffects {
	private static final Identifier GRAVITY_ID = PortalGunMod.id("dimension_gravity");
	private static final Identifier JUMP_ID = PortalGunMod.id("dimension_jump");
	private static final Identifier FALL_ID = PortalGunMod.id("dimension_fall");

	private DimensionEffects() {
	}

	public static void init() {
		ServerTickEvents.END_WORLD_TICK.register(DimensionEffects::tickLevel);
	}

	private static void tickLevel(ServerLevel level) {
		ContentSpec.DimensionInfo info = Destinations.info(level.dimension().identifier());
		List<String> effects = info != null ? info.effects : List.of();
		for (ServerPlayer player : level.players()) {
			applyGravity(player, effects);
			if (effects.isEmpty() || player.isSpectator()) {
				continue;
			}
			if (effects.contains("water_breathing") && player.isUnderWater() && player.tickCount % 40 == 0) {
				player.addEffect(new MobEffectInstance(MobEffects.WATER_BREATHING, 100, 0, true, false, true));
			}
			if (effects.contains("darkness") && player.tickCount % 200 == 0 && level.random.nextInt(3) == 0
				&& level.getMaxLocalRawBrightness(player.blockPosition()) < 8) {
				player.addEffect(new MobEffectInstance(MobEffects.DARKNESS, 120, 0, true, false, false));
			}
			if (effects.contains("lightning") && level.random.nextInt(260) == 0) {
				strikeNear(level, player);
			}
			if (effects.contains("glitch") && level.random.nextInt(900) == 0 && !player.isCreative()) {
				double dx = (level.random.nextDouble() - 0.5) * 6;
				double dz = (level.random.nextDouble() - 0.5) * 6;
				BlockPos target = BlockPos.containing(player.getX() + dx, player.getY(), player.getZ() + dz);
				if (dev.portalgun.travel.SafeSpotFinder.isStandable(level, target)) {
					player.teleportTo(target.getX() + 0.5, target.getY(), target.getZ() + 0.5);
					player.addEffect(new MobEffectInstance(MobEffects.NAUSEA, 60, 0, true, false, false));
				}
			}
			if (effects.contains("heat") && player.tickCount % 100 == 0 && !player.hasEffect(MobEffects.FIRE_RESISTANCE)
				&& level.random.nextInt(4) == 0) {
				player.addEffect(new MobEffectInstance(MobEffects.HUNGER, 120, 0, true, false, true));
			}
		}
	}

	private static void applyGravity(ServerPlayer player, List<String> effects) {
		double gravity = 0;
		double jump = 0;
		double fall = 0;
		if (effects.contains("low_gravity")) {
			gravity = -0.6;
			jump = 0.35;
			fall = -0.7;
		} else if (effects.contains("floaty")) {
			gravity = -0.4;
			jump = 0.15;
			fall = -0.5;
		} else if (effects.contains("high_gravity")) {
			gravity = 0.35;
			jump = -0.15;
			fall = 0.3;
		}
		setModifier(player, Attributes.GRAVITY, GRAVITY_ID, gravity);
		setModifier(player, Attributes.JUMP_STRENGTH, JUMP_ID, jump);
		setModifier(player, Attributes.FALL_DAMAGE_MULTIPLIER, FALL_ID, fall);
	}

	private static void setModifier(ServerPlayer player, Holder<Attribute> attribute, Identifier id, double amount) {
		AttributeInstance inst = player.getAttribute(attribute);
		if (inst == null) {
			return;
		}
		AttributeModifier current = inst.getModifier(id);
		if (amount == 0) {
			if (current != null) {
				inst.removeModifier(id);
			}
			return;
		}
		if (current == null || current.amount() != amount) {
			inst.removeModifier(id);
			inst.addTransientModifier(new AttributeModifier(id, amount, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
		}
	}

	private static void strikeNear(ServerLevel level, ServerPlayer player) {
		int x = player.getBlockX() + level.random.nextInt(48) - 24;
		int z = player.getBlockZ() + level.random.nextInt(48) - 24;
		if (Math.abs(x - player.getBlockX()) < 6 && Math.abs(z - player.getBlockZ()) < 6) {
			return;
		}
		int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
		LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level, EntitySpawnReason.EVENT);
		if (bolt != null) {
			bolt.setPos(x + 0.5, y, z + 0.5);
			bolt.setVisualOnly(level.random.nextInt(3) != 0);
			level.addFreshEntity(bolt);
		}
	}
}
