package dev.portalgun.travel;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.entity.PortalEntity;
import dev.portalgun.registry.ModAttachments;
import dev.portalgun.registry.ModCriteria;
import dev.portalgun.registry.ModSounds;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Moves entities through portals and keeps the paired return portal in sync. */
public final class PortalTravel {
	public static final int COOLDOWN = 50;

	private PortalTravel() {
	}

	public static void travel(PortalEntity portal, Entity entity) {
		ServerLevel from = (ServerLevel) portal.level();
		Identifier destId = portal.getDestination();
		ServerLevel to = from.getServer().getLevel(net.minecraft.resources.ResourceKey.create(net.minecraft.core.registries.Registries.DIMENSION, destId));
		if (to == null) {
			if (entity instanceof ServerPlayer player) {
				player.displayClientMessage(Component.translatable("message.portalgun.unknown_dimension", destId.toString()).withStyle(ChatFormatting.RED), true);
				player.setPortalCooldown(COOLDOWN);
			}
			return;
		}

		Vec3 arrival = portal.getArrival();
		float yaw = portal.getArrivalYaw();
		boolean platform = false;
		if (arrival == null) {
			Vec3 near = memoryOrScaled(entity, from, to);
			SafeSpotFinder.Spot spot = SafeSpotFinder.find(to, near);
			arrival = spot.pos();
			platform = spot.builtPlatform();
			yaw = portal.getFacing().getAxis().isHorizontal() ? portal.getFacing().getOpposite().toYRot() : entity.getYRot();
			portal.setArrival(arrival, yaw);
		}

		// Make sure there is a partner portal standing behind the arrival point.
		PortalEntity partner = findPartner(portal, to);
		if (partner == null && !portal.isReturnPortal()) {
			partner = openReturnPortal(portal, from, to, arrival, yaw);
		} else if (partner != null) {
			partner.keepOpen(20 * 12);
		}
		portal.keepOpen(20 * 8);

		if (entity instanceof ServerPlayer player) {
			rememberDeparture(player, from);
		}

		Vec3 velocity = entity instanceof ItemEntity ? Vec3.directionFromRotation(0, yaw).scale(0.2) : Vec3.ZERO;
		final boolean builtPlatform = platform;
		Vec3 finalArrival = arrival;
		from.playSound(null, entity.getX(), entity.getY(), entity.getZ(), ModSounds.PORTAL_TRAVEL, SoundSource.PLAYERS, 1.0F, 1.0F);
		Entity moved = entity.teleport(new TeleportTransition(to, finalArrival, velocity, yaw, entity.getXRot(), e -> {
			e.setPortalCooldown(COOLDOWN);
			e.placePortalTicket(BlockPos.containing(e.position()));
			to.playSound(null, e.getX(), e.getY(), e.getZ(), ModSounds.PORTAL_TRAVEL, SoundSource.PLAYERS, 1.0F, 1.1F);
			if (e instanceof ServerPlayer p) {
				onPlayerArrived(p, to, builtPlatform);
			}
		}));
		if (moved != null && moved != entity) {
			moved.setPortalCooldown(COOLDOWN);
		}
	}

	private static Vec3 memoryOrScaled(Entity entity, ServerLevel from, ServerLevel to) {
		if (entity instanceof ServerPlayer player) {
			Map<Identifier, Vec3> mem = player.getAttached(ModAttachments.LAST_LOCATIONS);
			if (mem != null) {
				Vec3 last = mem.get(to.dimension().identifier());
				if (last != null) {
					return last;
				}
			}
		}
		double scale = from.dimensionType().coordinateScale() / to.dimensionType().coordinateScale();
		double x = Mth.clamp(entity.getX() * scale, -29_000_000, 29_000_000);
		double z = Mth.clamp(entity.getZ() * scale, -29_000_000, 29_000_000);
		ContentSpec.DimensionInfo info = Destinations.info(to.dimension().identifier());
		double y = info != null ? info.arrivalY : entity.getY();
		return new Vec3(x, y, z);
	}

	private static void rememberDeparture(ServerPlayer player, ServerLevel from) {
		Map<Identifier, Vec3> mem = new HashMap<>(player.getAttachedOrCreate(ModAttachments.LAST_LOCATIONS));
		mem.put(from.dimension().identifier(), player.position());
		player.setAttached(ModAttachments.LAST_LOCATIONS, mem);
	}

	private static void onPlayerArrived(ServerPlayer player, ServerLevel to, boolean builtPlatform) {
		Identifier dim = to.dimension().identifier();
		player.addEffect(new MobEffectInstance(MobEffects.RESISTANCE, 60, 3, false, false, true));
		ContentSpec.DimensionInfo info = Destinations.info(dim);
		if (builtPlatform || (info != null && "void".equals(info.arrival))) {
			player.addEffect(new MobEffectInstance(MobEffects.SLOW_FALLING, 20 * 8, 0, false, false, true));
		}
		Destination d = Destinations.get(dim);
		if (d != null) {
			player.connection.send(new net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket(8, 50, 16));
			player.connection.send(new net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket(
				Component.literal(d.name()).withStyle(s -> s.withColor(d.color()))));
			player.connection.send(new net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket(
				Component.literal("Dimension " + d.code() + "  -  " + d.tagline()).withStyle(ChatFormatting.GRAY)));
			to.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.DIMENSION_ARRIVE, SoundSource.AMBIENT, 0.8F, 1.0F);
		}
		if (info != null) {
			Set<Identifier> visited = new HashSet<>(player.getAttachedOrCreate(ModAttachments.VISITED));
			if (visited.add(dim)) {
				player.setAttached(ModAttachments.VISITED, visited);
			}
			ModCriteria.VISITED.trigger(player, dim, visited.size());
		}
	}

	private static @Nullable PortalEntity findPartner(PortalEntity portal, ServerLevel other) {
		if (portal.getPartner() == null) {
			return null;
		}
		Entity e = other.getEntity(portal.getPartner());
		return e instanceof PortalEntity p && p.isAlive() && !p.isClosing() ? p : null;
	}

	private static PortalEntity openReturnPortal(PortalEntity portal, ServerLevel from, ServerLevel to, Vec3 arrival, float yaw) {
		// The return portal stands just behind where travellers appear, facing them.
		Direction facing = Direction.fromYRot(yaw);
		Vec3 back = Vec3.atLowerCornerOf(facing.getOpposite().getUnitVec3i());
		Vec3 center = new Vec3(arrival.x + back.x * 1.15, arrival.y + PortalEntity.HEIGHT / 2 + 0.02, arrival.z + back.z * 1.15);
		PortalEntity ret = PortalEntity.create(to, center, facing, from.dimension().identifier(), null);
		ret.setReturnPortal(true);
		Vec3 home = portal.getReturnArrival();
		if (home == null) {
			home = portal.position();
		}
		ret.setArrival(home, portal.getReturnYaw());
		ret.setPartner(portal.getUUID());
		ret.setLife(PortalEntity.DEFAULT_LIFE);
		to.addFreshEntity(ret);
		portal.setPartner(ret.getUUID());
		PortalGunMod.LOGGER.debug("Opened return portal in {} at {}", to.dimension().identifier(), center);
		return ret;
	}
}
