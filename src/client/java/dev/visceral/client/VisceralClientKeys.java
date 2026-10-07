package dev.visceral.client;

import dev.visceral.blood.BloodType;
import dev.visceral.client.ragdoll.Ragdoll;
import dev.visceral.client.ragdoll.RagdollFrame;
import dev.visceral.wound.Wound;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;

/** Extra data carried on vanilla render states from extraction to submission. */
public final class VisceralClientKeys {
	public static final RenderStateDataKey<WoundRenderInfo> WOUNDS = RenderStateDataKey.create(() -> "visceral:wounds");
	/** Per-frame bone transforms of a simulated ragdoll. */
	public static final RenderStateDataKey<RagdollFrame> RAGDOLL_FRAME = RenderStateDataKey.create(() -> "visceral:ragdoll_frame");
	/** A ragdoll waiting for its first render to capture the death pose. */
	public static final RenderStateDataKey<Ragdoll> RAGDOLL_PENDING = RenderStateDataKey.create(() -> "visceral:ragdoll_pending");

	private VisceralClientKeys() {
	}

	/**
	 * @param gameTime partial-tick accurate game time, for ageing wounds smoothly
	 */
	public record WoundRenderInfo(int entityId, List<Wound> wounds, BloodType blood, float gameTime, boolean dead) {
	}
}
