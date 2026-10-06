package com.laptopcraft.client.net;

import com.laptopcraft.client.os.AccountViewImpl;
import com.laptopcraft.client.os.ClientLaptopSession;
import com.laptopcraft.client.os.LaptopScreen;
import com.laptopcraft.network.ModPayloads;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;

/**
 * Client-side packet handlers: opening the laptop screen, account snapshots and notifications.
 * Fabric runs these handlers on the render thread.
 */
public final class ClientNetworking {
	private ClientNetworking() {
	}

	public static void init() {
		ClientPlayNetworking.registerGlobalReceiver(ModPayloads.OpenLaptop.TYPE, (payload, context) -> {
			Minecraft mc = context.client();
			ClientLaptopSession session = ClientLaptopSession.openOnline(payload.pos(), payload.osData(), payload.account(), payload.ownerName());
			if (mc.screen instanceof LaptopScreen open && open.session() == session) {
				return;
			}
			mc.setScreen(new LaptopScreen(session, null));
		});
		ClientPlayNetworking.registerGlobalReceiver(ModPayloads.AccountSync.TYPE,
				(payload, context) -> AccountViewImpl.online().update(payload.account()));
		ClientPlayNetworking.registerGlobalReceiver(ModPayloads.Notify.TYPE, (payload, context) -> handleNotify(context.client(), payload));
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> client.execute(ClientLaptopSession::clearAll));
	}

	private static void handleNotify(Minecraft mc, ModPayloads.Notify n) {
		if ("error".equals(n.icon())) {
			AccountViewImpl.online().reportError(n.message());
		}
		if (mc.screen instanceof LaptopScreen screen && !screen.session().offline()) {
			screen.os().notify(n.icon(), n.title(), n.message());
			return;
		}
		mc.getToastManager().addToast(new LaptopToast(n.icon(), n.title(), n.message()));
	}
}
