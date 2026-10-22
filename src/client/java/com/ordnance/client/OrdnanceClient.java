package com.ordnance.client;

import com.ordnance.ClientBridge;
import com.ordnance.Ordnance;
import com.ordnance.client.fx.CameraShake;
import com.ordnance.client.fx.ExplosionEffects;
import com.ordnance.client.fx.FxScheduler;
import com.ordnance.client.fx.HeatHaze;
import com.ordnance.client.fx.Recoil;
import com.ordnance.client.fx.ScreenEffects;
import com.ordnance.client.fx.SmokeVolumes;
import com.ordnance.client.fx.StrikeMarkers;
import com.ordnance.client.fx.WeaponEffects;
import com.ordnance.client.hud.WeaponHud;
import com.ordnance.client.particle.OrdnanceRenderTypes;
import com.ordnance.client.particle.ParticleBudget;
import com.ordnance.client.particle.ParticleSprites;
import com.ordnance.client.render.DebrisEntityRenderer;
import com.ordnance.client.render.ProjectileItemRenderer;
import com.ordnance.client.sound.EntityLoopSound;
import com.ordnance.entity.HypersonicMissileEntity;
import com.ordnance.entity.RocketEntity;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModBlocks;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModSounds;
import com.ordnance.weapon.GrenadeLauncherItem;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.render.BlockRenderLayer;
import net.minecraft.client.util.InputUtil;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.Entity;
import net.minecraft.sound.SoundCategory;
import org.lwjgl.glfw.GLFW;

/** Client entrypoint: particles, renderers, effects, HUD, sounds and input. */
public final class OrdnanceClient implements ClientModInitializer {
	public static final KeyBinding.Category CATEGORY = KeyBinding.Category.create(Ordnance.id("arsenal"));
	private static KeyBinding fireModeKey;
	private static ClientWorld lastWorld;

	@Override
	public void onInitializeClient() {
		OrdnanceRenderTypes.init();
		ParticleSprites.register();
		ClientBridge.install(WeaponEffects.INSTANCE);

		EntityRendererRegistry.register(ModEntities.GRENADE, ctx -> new ProjectileItemRenderer<>(ctx, 0.6F, ProjectileItemRenderer.Mode.TUMBLE, false));
		EntityRendererRegistry.register(ModEntities.LAUNCHER_GRENADE, ctx -> new ProjectileItemRenderer<>(ctx, 0.55F, ProjectileItemRenderer.Mode.ALIGN, false));
		EntityRendererRegistry.register(ModEntities.ROCKET, ctx -> new ProjectileItemRenderer<>(ctx, 1.0F, ProjectileItemRenderer.Mode.ALIGN, true));
		EntityRendererRegistry.register(ModEntities.HYPERSONIC_MISSILE, ctx -> new ProjectileItemRenderer<>(ctx, 3.0F, ProjectileItemRenderer.Mode.ALIGN, true));
		EntityRendererRegistry.register(ModEntities.DEBRIS, DebrisEntityRenderer::new);

		BlockRenderLayerMap.putBlock(ModBlocks.BURNING_FUEL, BlockRenderLayer.CUTOUT);
		BlockRenderLayerMap.putBlock(ModBlocks.ASH_LAYER, BlockRenderLayer.CUTOUT);

		ClientPlayNetworking.registerGlobalReceiver(OrdnanceNetworking.ExplosionFx.ID, (payload, context) -> {
			ClientWorld world = context.client().world;
			if (world != null) {
				ExplosionEffects.play(world, payload.pos(), payload.explosionProfile(), payload.scale(), payload.normal(), payload.seed());
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(OrdnanceNetworking.Knockback.ID, (payload, context) -> context.player().addVelocityInternal(payload.velocity()));
		ClientPlayNetworking.registerGlobalReceiver(OrdnanceNetworking.MuzzleFlash.ID, (payload, context) -> {
			ClientWorld world = context.client().world;
			Entity shooter = world == null ? null : world.getEntityById(payload.entityId());
			if (shooter != null) {
				WeaponEffects.remoteMuzzleFlash(world, shooter, payload.weaponKind());
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(OrdnanceNetworking.StrikeWarning.ID, (payload, context) -> StrikeMarkers.warn(payload.target(), payload.ticksToImpact()));

		HudElementRegistry.addFirst(Ordnance.id("screen_effects"), ScreenEffects::render);
		HudElementRegistry.attachElementAfter(VanillaHudElements.HOTBAR, Ordnance.id("weapon_hud"), WeaponHud::render);

		fireModeKey = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.ordnance.fire_mode", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_V, CATEGORY));

		ClientTickEvents.END_CLIENT_TICK.register(OrdnanceClient::tick);
		ClientEntityEvents.ENTITY_LOAD.register(OrdnanceClient::onEntityLoad);
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> reset());
	}

	private static void tick(MinecraftClient client) {
		if (client.world != lastWorld) {
			lastWorld = client.world;
			reset();
		}

		if (client.world == null || client.isPaused()) {
			return;
		}

		FxScheduler.tick();
		CameraShake.tick();
		SmokeVolumes.tick();
		ScreenEffects.tick();
		HeatHaze.tick(client);
		StrikeMarkers.tick(client);
		WeaponEffects.tick(client);
		if (client.player != null) {
			Recoil.tick(client.player);
		}

		while (fireModeKey.wasPressed()) {
			if (client.player != null && client.player.getMainHandStack().getItem() instanceof GrenadeLauncherItem) {
				ClientPlayNetworking.send(OrdnanceNetworking.CycleFireMode.INSTANCE);
			}
		}

		if (client.world.getTime() % 40L == 0L) {
			ParticleBudget.reconcile(client);
		}
	}

	private static void onEntityLoad(Entity entity, ClientWorld world) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (entity instanceof RocketEntity) {
			client.getSoundManager().play(new EntityLoopSound(entity, ModSounds.ROCKET_MOTOR, SoundCategory.NEUTRAL, 1.4F, 1.0F, e -> true));
		} else if (entity instanceof HypersonicMissileEntity) {
			client.getSoundManager().play(new EntityLoopSound(entity, ModSounds.MISSILE_INCOMING, SoundCategory.HOSTILE, 8.0F, 1.0F, e -> true));
		}
	}

	private static void reset() {
		FxScheduler.clear();
		CameraShake.reset();
		SmokeVolumes.clear();
		ScreenEffects.reset();
		HeatHaze.clear();
		StrikeMarkers.clear();
		WeaponEffects.clear();
		Recoil.reset();
		ParticleBudget.reset();
	}
}
