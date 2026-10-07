package com.laptopcraft.client.web.sites.blocktube;

import com.laptopcraft.client.web.PlaceholderSite;
import com.laptopcraft.client.web.WebPage;
import com.laptopcraft.client.web.WebUrl;
import java.util.List;

/** BlockTube (blocktube.mc) — procedurally animated videos. */
public class BlockTubeSite extends PlaceholderSite {
	public BlockTubeSite() {
		super("blocktube.mc", "BlockTube", "Broadcast your blocks. Creeper dances, speedruns and 10-hour campfires.", "blocktube", "blocktube_logo", 0xFFFF0033,
				List.of("video", "videos", "watch", "music", "youtube", "speedrun", "tutorial", "creeper", "cats", "stream"));
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new BlockTubePage(this, url);
	}
}
