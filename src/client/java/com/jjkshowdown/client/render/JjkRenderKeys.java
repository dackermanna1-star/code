package com.jjkshowdown.client.render;

import com.jjkshowdown.client.ClientState;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;

/** Extra data attached to vanilla entity render states (Fabric render-state data API). */
public final class JjkRenderKeys {
	/** Sorcerer visual state for the entity being rendered (pose, flags, character). */
	public static final RenderStateDataKey<VisualData> VISUAL = RenderStateDataKey.create(() -> "jjkshowdown:visual");

	public record VisualData(ClientState.Visual visual, float poseTicks, float poseProgress, float age) {
	}

	private JjkRenderKeys() {
	}
}
