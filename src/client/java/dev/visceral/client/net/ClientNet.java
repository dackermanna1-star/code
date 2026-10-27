package dev.visceral.client.net;

import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.fx.BloodFx;
import dev.visceral.client.input.CombatInput;
import dev.visceral.client.camera.ShoulderCamera;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import dev.visceral.state.PhysState;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

/** Client payload handlers. Handlers run on the render thread. */
public final class ClientNet {
	/** Server switches; defaults allow everything until the server says otherwise. */
	public static boolean serverMeleeOverhaul = false;
	public static boolean serverPhysics = true;
	public static int serverMaxGore = 2;
	public static boolean serverFinishers = true;
	public static boolean serverPresent;

	private ClientNet() {
	}

	public static void init() {
		ClientPlayNetworking.registerGlobalReceiver(Payloads.ServerSettings.TYPE, (p, ctx) -> {
			serverPresent = true;
			serverMeleeOverhaul = p.meleeOverhaul();
			serverPhysics = p.physicalReactions();
			serverMaxGore = p.maxGoreLevel();
			serverFinishers = p.finishers();
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.PhysStateSync.TYPE, (p, ctx) -> {
			Entity e = ctx.client().level == null ? null : ctx.client().level.getEntity(p.entityId());
			if (!(e instanceof LivingEntity le)) return;
			CombatState cs = VisceralEntity.getOrCreate(le);
			PhysState before = cs.state;
			cs.state = PhysState.byId(p.state());
			cs.stateTicks = p.ticks();
			cs.stateDuration = p.duration();
			cs.dirX = p.dirX();
			cs.dirZ = p.dirZ();
			cs.force = p.force();
			cs.crawling = (p.flags() & Payloads.PhysStateSync.FLAG_CRAWL) != 0;
			cs.failedAttempt = (p.flags() & Payloads.PhysStateSync.FLAG_FAIL) != 0;
			if (before != cs.state) le.refreshDimensions();
			EntityAnimator.getOrCreate(le).onStateSync(p);
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.Impact.TYPE, (p, ctx) -> {
			Minecraft mc = ctx.client();
			if (mc.level == null) return;
			Entity e = mc.level.getEntity(p.entityId());
			if (e instanceof LivingEntity le) {
				EntityAnimator.getOrCreate(le).onImpact(p);
				BloodFx.onImpact(le, p);
				ShoulderCamera.onImpact(le, p);
			}
			if (p.attackerId() >= 0 && p.has(Payloads.Impact.FLAG_MELEE)) {
				Entity attacker = mc.level.getEntity(p.attackerId());
				if (attacker instanceof LivingEntity la) {
					EntityAnimator.getOrCreate(la).onOwnHitLanded(p.has(Payloads.Impact.FLAG_HEAVY));
					if (attacker == mc.player) CombatInput.onHitConfirmed(p);
				}
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.PlayAnim.TYPE, (p, ctx) -> {
			Minecraft mc = ctx.client();
			if (mc.level == null) return;
			Entity e = mc.level.getEntity(p.entityId());
			if (e instanceof LivingEntity le && e != mc.player) EntityAnimator.getOrCreate(le).onPlayAnim(p.attackId(), p.timeScale());
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			serverPresent = false;
			serverMeleeOverhaul = false;
			serverPhysics = true;
			serverMaxGore = 2;
		});
	}

	public static boolean meleeEnabled() {
		return serverPresent && serverMeleeOverhaul;
	}

	public static void sendAttack(int attackId, int targetId, int comboStep) {
		if (ClientPlayNetworking.canSend(Payloads.AttackRequest.TYPE)) {
			ClientPlayNetworking.send(new Payloads.AttackRequest(attackId, targetId, comboStep));
		}
	}
}
