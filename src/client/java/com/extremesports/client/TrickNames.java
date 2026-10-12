package com.extremesports.client;

import com.extremesports.sport.SportType;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.TrickCategory;
import com.extremesports.trick.TrickDef;
import com.extremesports.trick.Tricks;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;

/** Builds display names like "Nollie BS 360 Kickflip + Melon" for combo entries. */
public final class TrickNames {
	private TrickNames() {
	}

	public static MutableComponent trick(String id, int multiple) {
		MutableComponent name = Component.translatable("trick.extremesports." + id);
		if (multiple == 2) {
			return Component.translatable("trick.extremesports.double", name);
		}
		if (multiple >= 3) {
			return Component.translatable("trick.extremesports.triple", name);
		}
		return name;
	}

	public static MutableComponent entry(ComboEntry entry) {
		MutableComponent result = Component.empty();
		boolean first = true;
		SportType sport = SportType.SKATEBOARD;
		if (!entry.tricks().isEmpty()) {
			TrickDef def = Tricks.byId(entry.tricks().getFirst());
			if (def != null) {
				sport = def.sport();
			}
		}
		if (entry.kind() == ComboEntry.Kind.AIR) {
			if (entry.nollie()) {
				result.append(Component.translatable("trick.extremesports.prefix.nollie")).append(" ");
			} else if (entry.fakie()) {
				result.append(Component.translatable("trick.extremesports.prefix.fakie")).append(" ");
			}
			if (entry.spin() >= 180) {
				if (sport == SportType.SKATEBOARD && entry.spinSign() != 0) {
					result.append(Component.translatable(entry.spinSign() > 0 ? "trick.extremesports.prefix.fs" : "trick.extremesports.prefix.bs")).append(" ");
				}
				result.append(String.valueOf(entry.spin()));
				first = false;
			}
			boolean hasOther = false;
			for (String id : entry.tricks()) {
				TrickDef def = Tricks.byId(id);
				if (def != null && def.category() != TrickCategory.OLLIE) {
					hasOther = true;
					break;
				}
			}
			for (int i = 0; i < entry.tricks().size(); i++) {
				String id = entry.tricks().get(i);
				TrickDef def = Tricks.byId(id);
				if (def == null || def.category() == TrickCategory.OLLIE && (hasOther || entry.spin() >= 180)) {
					continue;
				}
				if (!first) {
					result.append(def.category() == TrickCategory.GRAB ? " + " : " ");
				}
				result.append(trick(id, entry.multiples().get(i)));
				first = false;
			}
			return result;
		}
		for (int i = 0; i < entry.tricks().size(); i++) {
			result.append(trick(entry.tricks().get(i), 1));
		}
		return result;
	}
}
