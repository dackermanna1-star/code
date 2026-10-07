package com.laptopcraft.client.os;

/** Sample files for the offline dev laptop so Files/Notepad/desktop have something to show. */
final class OfflineFiles {
	private OfflineFiles() {
	}

	static void seed(OSDataImpl data) {
		data.writeText("Welcome.txt", """
				Welcome to CubeOS!

				- Double-click icons on the desktop to open apps.
				- Right-click the desktop for more options.
				- Drag windows by their title bar; drag the edges to resize.
				- Drag a window to the top edge to maximize it, or to the left/right edge to snap it.
				- Press the Start button (or the Windows/Super key) and just type to search.

				Have fun exploring the internet: try emerazon.mc and endereats.mc!""");
		data.writeText("Shopping list.txt", """
				Shopping list
				- 3 carrots (for the pig, not for me)
				- top hat (fancy)
				- a painting for the living room
				- pizza on Friday""");
		data.writeText("Diary.txt", """
				Day 1: Punched a tree. The tree did not punch back. Victory.
				Day 2: A creeper blew up my door. Ordered a new one on Emerazon.
				Day 3: Bought this laptop. Best decision ever.""");
		data.flush();
	}
}
