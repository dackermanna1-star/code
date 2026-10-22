package dev.juukulius.client.anim;

import java.util.Locale;
import org.jspecify.annotations.Nullable;

/**
 * Animatable bones. The six humanoid parts map to {@link net.minecraft.client.model.HumanoidModel} parts; ROOT moves the
 * whole body around the feet; ITEM offsets the held sword relative to the hand; FP_MAIN / FP_OFF drive the first-person
 * sword hand and casting hand.
 */
public enum Bone {
	HEAD,
	BODY,
	RIGHT_ARM,
	LEFT_ARM,
	RIGHT_LEG,
	LEFT_LEG,
	ROOT,
	ITEM,
	FP_MAIN,
	FP_OFF;

	public static final Bone[] MODEL_BONES = {HEAD, BODY, RIGHT_ARM, LEFT_ARM, RIGHT_LEG, LEFT_LEG};
	public static final int COUNT = values().length;

	public static @Nullable Bone byName(String name) {
		try {
			return valueOf(name.toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException e) {
			return null;
		}
	}
}
