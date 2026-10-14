package net.abyssaldescent.item.combat;

import net.abyssaldescent.dungeon.loot.LootDrops;
import net.abyssaldescent.dungeon.loot.LootRoller;
import net.abyssaldescent.entity.MobInfo;
import net.abyssaldescent.item.armor.ArmorSets;
import net.abyssaldescent.item.relic.RelicKind;
import net.abyssaldescent.item.relic.Relics;
import net.abyssaldescent.registry.ModAttachments;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.phys.Vec3;

/** Hooks equipment mechanics into vanilla combat events. */
public final class CombatEvents {
	private CombatEvents() {
	}

	/** Must run before {@code RunEvents.init()} so Deathward gets a chance before a dungeon defeat. */
	public static void init() {
		AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
			if (!level.isClientSide()) {
				CombatState.capture(player);
			}
			return InteractionResult.PASS;
		});

		ServerTickEvents.END_SERVER_TICK.register(server -> {
			if (server.getTickCount() % 10 != 0) {
				return;
			}
			for (ServerPlayer player : server.getPlayerList().getPlayers()) {
				Relics.tick(player);
				ArmorSets.tick(player);
			}
		});

		ServerLivingEntityEvents.ALLOW_DEATH.register((entity, source, amount) -> {
			if (entity instanceof ServerPlayer player && !source.is(DamageTypes.GENERIC_KILL) && ArmorSets.tryDeathward(player)) {
				return false;
			}
			return true;
		});

		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (!(entity.level() instanceof ServerLevel level) || !(source.getEntity() instanceof ServerPlayer killer)) {
				return;
			}
			ArmorSets.onKill(killer, entity);
			if (Relics.isActive(killer, RelicKind.CRACKED_PHYLACTERY) && level.random.nextFloat() < 0.2F) {
				killer.heal(3.0F);
				level.sendParticles(ParticleTypes.HEART, killer.getX(), killer.getY() + 2.0, killer.getZ(), 2, 0.3, 0.1, 0.3, 0.0);
			}
			MobInfo info = entity.getAttached(ModAttachments.MOB_INFO);
			if (info != null && info.elite()) {
				LootDrops.fountain(level, entity.position().add(0, 0.6, 0), LootRoller.rollEliteDrop(killer, info.floor()), killer);
			}
		});

		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> Relics.forget(handler.player));
	}

	public static Vec3 center(net.minecraft.world.entity.Entity entity) {
		return entity.position().add(0, entity.getBbHeight() * 0.5, 0);
	}
}
