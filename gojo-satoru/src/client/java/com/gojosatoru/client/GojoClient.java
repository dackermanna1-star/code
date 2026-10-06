package com.gojosatoru.client;

import com.gojosatoru.GojoMod;
import com.gojosatoru.GojoRegistry;
import com.gojosatoru.client.hud.GojoHud;
import com.gojosatoru.client.particle.GlowParticle;
import com.gojosatoru.client.render.OrbRenderer;
import com.gojosatoru.client.render.SixEyesLayer;
import com.gojosatoru.network.GojoNetwork.DomainPayload;
import com.gojosatoru.network.GojoNetwork.EffectPayload;
import com.gojosatoru.network.GojoNetwork.StatsPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;

public class GojoClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        GojoKeys.init();
        ClientTickEvents.END_CLIENT_TICK.register(minecraft -> {
            GojoKeys.tick(minecraft);
            ClientGojo.tick(minecraft);
        });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, minecraft) -> ClientGojo.reset());

        ClientPlayNetworking.registerGlobalReceiver(StatsPayload.TYPE, (payload, context) -> ClientGojo.onStats(payload));
        ClientPlayNetworking.registerGlobalReceiver(EffectPayload.TYPE, (payload, context) -> ClientEffects.play(payload));
        ClientPlayNetworking.registerGlobalReceiver(DomainPayload.TYPE, (payload, context) -> ClientGojo.onDomain(payload));

        EntityRendererRegistry.register(GojoRegistry.BLUE, context -> new OrbRenderer<>(context, OrbRenderer.Style.BLUE));
        EntityRendererRegistry.register(GojoRegistry.RED, context -> new OrbRenderer<>(context, OrbRenderer.Style.RED));
        EntityRendererRegistry.register(GojoRegistry.HOLLOW_PURPLE, context -> new OrbRenderer<>(context, OrbRenderer.Style.PURPLE));

        LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
            if (renderer instanceof AvatarRenderer<?> avatar) {
                helper.register(new SixEyesLayer(avatar));
            }
        });

        ParticleFactoryRegistry.getInstance().register(GojoRegistry.GLOW, GlowParticle.Provider::new);
        HudElementRegistry.addLast(GojoMod.id("hud"), GojoHud::render);
    }
}
