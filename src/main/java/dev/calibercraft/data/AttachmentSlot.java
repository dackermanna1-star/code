package dev.calibercraft.data;

import com.mojang.serialization.Codec;
import net.minecraft.util.StringRepresentable;

/**
 * Attachment slots. {@link #modelIndex} is the custom-model-data string index the item model definitions
 * select on (index 0 is the skin). Quick-detach slots may be changed in the field when the server allows it;
 * the others require a gunsmith bench.
 */
public enum AttachmentSlot implements StringRepresentable {
	OPTIC("optic", 1, true),
	MUZZLE("muzzle", 2, true),
	BARREL("barrel", 3, false),
	GRIP("grip", 4, true),
	STOCK("stock", 5, false),
	MAGAZINE("magazine", 6, true),
	TACTICAL("tactical", 7, true),
	CHARM("charm", 8, true);

	public static final Codec<AttachmentSlot> CODEC = StringRepresentable.fromEnum(AttachmentSlot::values);
	public static final int MODEL_DATA_SIZE = 9;

	private final String name;
	public final int modelIndex;
	public final boolean quickDetach;

	AttachmentSlot(String name, int modelIndex, boolean quickDetach) {
		this.name = name;
		this.modelIndex = modelIndex;
		this.quickDetach = quickDetach;
	}

	public String translationKey() {
		return "calibercraft.slot." + name;
	}

	@Override
	public String getSerializedName() {
		return name;
	}
}
