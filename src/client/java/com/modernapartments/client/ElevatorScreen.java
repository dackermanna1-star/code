package com.modernapartments.client;

import com.modernapartments.network.ElevatorFloorsPayload;
import com.modernapartments.network.ElevatorTravelPayload;
import java.util.List;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;

/** Elevator floor panel: one button per floor, highest floors at the top like a real panel. */
public class ElevatorScreen extends Screen {
	private static final int BUTTON = 28;
	private static final int GAP = 4;
	private final ElevatorFloorsPayload payload;

	public ElevatorScreen(ElevatorFloorsPayload payload) {
		super(Component.translatable("screen.modernapartments.elevator"));
		this.payload = payload;
	}

	@Override
	protected void init() {
		List<ElevatorFloorsPayload.Floor> floors = payload.floors();
		int columns = Math.max(1, Math.min(6, (int) Math.ceil(floors.size() / 8.0)));
		int rows = (int) Math.ceil(floors.size() / (double) columns);
		int totalW = columns * (BUTTON + GAP) - GAP;
		int totalH = rows * (BUTTON - 6 + GAP) - GAP;
		int left = (width - totalW) / 2;
		int top = Math.max(40, (height - totalH) / 2);
		for (int i = 0; i < floors.size(); i++) {
			ElevatorFloorsPayload.Floor floor = floors.get(floors.size() - 1 - i);
			int col = i % columns;
			int row = i / columns;
			boolean here = floor.y() == payload.currentY();
			Button button = Button.builder(Component.literal(here ? "[" + floor.label() + "]" : floor.label()), b -> {
					ClientPlayNetworking.send(new ElevatorTravelPayload(new BlockPos(payload.column().getX(), floor.y(), payload.column().getZ())));
					onClose();
				})
				.bounds(left + col * (BUTTON + GAP), top + row * (BUTTON - 6 + GAP), BUTTON, BUTTON - 6)
				.build();
			button.active = !here;
			addRenderableWidget(button);
		}
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		super.render(graphics, mouseX, mouseY, partialTick);
		graphics.drawCenteredString(font, title, width / 2, 18, 0xFFFFFFFF);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
