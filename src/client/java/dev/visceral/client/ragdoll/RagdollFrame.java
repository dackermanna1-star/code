package dev.visceral.client.ragdoll;

import java.util.Map;
import org.joml.Matrix4f;

/**
 * Camera-relative world transform of every model part the ragdoll drives, for one rendered frame.
 * Keyed by model path ({@code "/head"}, {@code "/body/left_arm"}...) so the same frame also poses
 * armor, wool and other layer models that share the entity's part names.
 */
public final class RagdollFrame {
	private final Map<String, Matrix4f> targets;

	RagdollFrame(Map<String, Matrix4f> targets) {
		this.targets = targets;
	}

	public Matrix4f target(String path) {
		return this.targets.get(path);
	}

	public boolean isEmpty() {
		return this.targets.isEmpty();
	}
}
