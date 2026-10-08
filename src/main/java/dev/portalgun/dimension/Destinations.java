package dev.portalgun.dimension;

import dev.portalgun.content.ContentSpec;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.Identifier;
import org.jetbrains.annotations.Nullable;

/** Every place the portal gun can dial: home, the two vanilla dimensions and the 50 generated ones. */
public final class Destinations {
	public static final Identifier HOME = Identifier.withDefaultNamespace("overworld");
	private static List<Destination> all;
	private static Map<Identifier, Destination> byId;
	private static Map<Identifier, ContentSpec.DimensionInfo> infoById;

	private Destinations() {
	}

	private static void build() {
		List<Destination> list = new ArrayList<>();
		Map<Identifier, ContentSpec.DimensionInfo> infos = new LinkedHashMap<>();
		list.add(new Destination(HOME, "C-137", "Home", "Good old Overworld",
			"The dimension you started in. Dial it whenever you want to go home - the gun remembers where you left.", 0x7CC25A, 1, true));
		list.add(new Destination(Identifier.withDefaultNamespace("the_nether"), "N-666", "The Nether", "Fire, lava and ghasts",
			"Vanilla's hell dimension. Arrive inside the cavern, not in a portal frame.", 0xC23A2B, 4, true));
		list.add(new Destination(Identifier.withDefaultNamespace("the_end"), "E-000", "The End", "Islands in the void",
			"Vanilla's end dimension. You will arrive on the obsidian platform - bring a bow.", 0xD8D49A, 5, true));
		for (ContentSpec.DimensionInfo info : ContentSpec.get().dimensions) {
			Identifier id = Identifier.fromNamespaceAndPath("portalgun", info.id);
			list.add(new Destination(id, info.code, info.name, info.tagline, info.description, parseColor(info.color), info.danger, false));
			infos.put(id, info);
		}
		Map<Identifier, Destination> map = new LinkedHashMap<>();
		for (Destination d : list) {
			map.put(d.id(), d);
		}
		all = Collections.unmodifiableList(list);
		byId = map;
		infoById = infos;
	}

	public static List<Destination> all() {
		if (all == null) {
			build();
		}
		return all;
	}

	public static @Nullable Destination get(Identifier id) {
		all();
		return byId.get(id);
	}

	/** Generated-dimension metadata, or null for vanilla dimensions. */
	public static @Nullable ContentSpec.DimensionInfo info(Identifier id) {
		all();
		return infoById.get(id);
	}

	public static Destination getOrHome(Identifier id) {
		Destination d = get(id);
		return d != null ? d : get(HOME);
	}

	public static int parseColor(String hex) {
		if (hex == null) {
			return 0x7CC25A;
		}
		String s = hex.startsWith("#") ? hex.substring(1) : hex;
		try {
			return Integer.parseInt(s, 16) & 0xFFFFFF;
		} catch (NumberFormatException e) {
			return 0x7CC25A;
		}
	}
}
