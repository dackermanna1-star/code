package com.gojosatoru;

import com.gojosatoru.entity.OrbTracker;
import com.gojosatoru.network.GojoNetwork;
import com.gojosatoru.power.DomainManager;
import com.gojosatoru.power.GojoPowers;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GojoMod implements ModInitializer {
    public static final String MOD_ID = "gojo";
    public static final Logger LOG = LoggerFactory.getLogger("Gojo Satoru");

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(MOD_ID, path);
    }

    @Override
    public void onInitialize() {
        GojoRegistry.init();
        GojoNetwork.init();
        GojoPowers.init();
        DomainManager.init();
        OrbTracker.init();
        LOG.info("Throughout Heaven and Earth, I alone am the honored one.");
    }
}
