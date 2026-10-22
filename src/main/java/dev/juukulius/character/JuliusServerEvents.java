package dev.juukulius.character;

import dev.juukulius.combat.CombatRules;
import dev.juukulius.config.JuliusServerConfig;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.Vec3;

/** Lifecycle wiring: ticking, join/leave sync, death and respawn rules, and damage interception. */
public final class JuliusServerEvents {
	private JuliusServerEvents() {
	}

	public static void init() {
		ServerLifecycleEvents.SERVER_STARTING.register(server -> {
			JuliusServerConfig.load();
			JuliusServer.clearAll();
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> JuliusServer.clearAll());
		ServerTickEvents.END_SERVER_TICK.register(JuliusServer::tickServer);

		ServerPlayerEvents.JOIN.register(player -> {
			JuliusNetworking.sendRules(player);
			JuliusServer.forceSync(player);
		});
		ServerPlayerEvents.LEAVE.register(JuliusServer::forget);

		// Death: Julius reverts on the spot, the ultimate ends; cooldowns survive so dying is never a reset.
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (entity instanceof ServerPlayer player) {
				JuliusData data = JuliusAttachments.data(player);
				if (data.transformed) {
					JuliusServer.revert(player, data, JuliusServer.state(player), true);
				}
			}
		});
		ServerPlayerEvents.COPY_FROM.register((oldPlayer, newPlayer, alive) -> {
			JuliusData copy = JuliusAttachments.data(oldPlayer).copy();
			if (!alive) {
				copy.transformed = false;
				copy.spiritsOut = true;
				copy.ultimateTicks = 0;
				copy.mana = CombatRules.MANA_AFTER_DEATH;
			}

			newPlayer.setAttached(JuliusAttachments.DATA, copy);
			JuliusServer.forget(oldPlayer);
		});
		ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> JuliusServer.forceSync(newPlayer));

		ServerLivingEntityEvents.ALLOW_DAMAGE.register(JuliusServerEvents::allowDamage);
	}

	private static boolean allowDamage(LivingEntity entity, DamageSource source, float amount) {
		if (!(entity instanceof ServerPlayer player)) {
			return true;
		}

		JuliusData data = JuliusAttachments.data(player);
		if (!data.transformed) {
			return true;
		}

		ActionState state = JuliusServer.state(player);
		if (source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			return true;
		}

		// Al Cranvel's awakening cannot be interrupted.
		if (state.invulnerableTicks > 0) {
			return false;
		}

		long gameTime = player.level().getGameTime();
		if (state.barrierEnd > gameTime && (source.is(DamageTypeTags.IS_PROJECTILE) || source.getDirectEntity() instanceof Projectile)) {
			// The six-element wall of Al Clauzeria repels projectiles and magic.
			Vec3 at = source.getDirectEntity() != null ? source.getDirectEntity().position() : player.getEyePosition();
			JuliusNetworking.sendFx(player.level(), FxType.BARRIER_BLOCK, player, at, at.subtract(player.getEyePosition()).normalize(), 0xFFFFFF, 1.0F);
			JuliusServer.playSoundAt(player.level(), at, JuliusSounds.BARRIER, 0.6F, 1.4F);
			return false;
		}

		// Aro cushions falls (canon: Julius uses Aro "as a propeller and cushion").
		if (source.is(DamageTypeTags.IS_FALL) && data.spiritsOut && JuliusServerConfig.get().aroFallCushion) {
			float cost = Math.max(2.0F, amount * 1.5F);
			if (data.mana >= cost) {
				JuliusServer.spendMana(data, state, cost);
				JuliusNetworking.sendFx(player.level(), FxType.CUSHION, player, player.position(), Vec3.ZERO, Spirit.ARO.color, Math.min(3.0F, amount / 4.0F));
				JuliusServer.playSoundAt(player.level(), player.position(), JuliusSounds.CUSHION, 0.9F, 1.0F);
				return false;
			}
		}

		return true;
	}
}
