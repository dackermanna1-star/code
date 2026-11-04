"""Master shot list. Global frame 1 = film time 0.0 s. 24 fps."""
FPS = 24

# (shot_id, sequence/world, duration seconds, description)
SHOTS = [
    # 1. THE BEGINNING - SPAWN (0:00-0:35)
    ("A1", "overworld", 7.0, "Sunrise aerial over the meadow, title"),
    ("A2", "overworld", 4.0, "Steve spawns in a shimmer of light"),
    ("A3", "overworld", 5.0, "Close-up: Steve looks around"),
    ("A4", "overworld", 5.0, "Over the shoulder: Steve examines his blocky hands"),
    ("A5", "overworld", 7.0, "Crane reveal of the enormous world"),
    ("A6", "overworld", 7.0, "Steve starts walking toward the hills"),
    # 2. INTO THE WORLD (0:35-1:15)
    ("B1", "overworld", 6.0, "Tracking through the forest"),
    ("B2", "overworld", 5.0, "Hopping across the river stones"),
    ("B3", "overworld", 5.0, "Low-angle hero shot climbing the hill"),
    ("B4", "overworld", 6.0, "Village establishing shot"),
    ("B5", "overworld", 5.0, "The weaponsmith hands Steve an iron sword"),
    ("B6", "overworld", 7.0, "Time-lapse: walking on as the day passes"),
    ("B7", "overworld", 3.5, "Dusk silhouette on the ridge"),
    ("B8", "overworld", 2.5, "Over the shoulder: the dark forest ahead"),
    # 3. THE FIRST PERILS (1:15-2:00)
    ("C1", "night", 5.0, "Night forest, Steve moves cautiously"),
    ("C2", "night", 4.0, "A zombie emerges behind him"),
    ("C3", "night", 6.0, "Running through the trees, zombies chasing"),
    ("C4", "night", 2.0, "A skeleton draws and fires"),
    ("C5", "night", 2.0, "Arrow thunks into the tree beside Steve"),
    ("C6", "night", 6.0, "Steve fights back with the sword"),
    ("C7", "night", 4.0, "Lightning reveals a cave; Steve runs inside"),
    ("C8", "cave", 6.0, "Dark tunnels lit by glowing ores"),
    ("C9", "cave", 5.0, "Diamonds glint on Steve's face"),
    ("C10", "cave", 5.0, "The floor gives way above a lava ravine - narrow escape"),
    # 4. THE LONG JOURNEY (2:00-2:40)
    ("D1", "snow", 6.0, "Emerging from the cave into a vast landscape"),
    ("D2", "snow", 4.0, "Aerial: tiny figure crossing a snowy mountain in a blizzard"),
    ("D3", "snow", 3.0, "Close: trudging through the blizzard"),
    ("D4", "desert", 4.0, "Extreme wide: desert under a scorching sun"),
    ("D5", "desert", 3.0, "Close: exhausted in the heat"),
    ("D6", "jungle", 4.0, "Pushing through the dense jungle"),
    ("D7", "jungle", 3.0, "Aerial over the jungle canopy"),
    ("D8", "edge", 5.0, "Extreme wide: the desolate plain"),
    ("D9", "edge", 3.0, "Close: the worn sword, tired steps"),
    ("D10", "edge", 5.0, "Strange shapes appear on the horizon"),
    # 5. THE WORLD BEGINS TO BREAK (2:40-3:20)
    ("E1", "edge", 8.0, "Walking among impossible stretched pillars"),
    ("E2", "edge", 8.0, "Broken chunks and gathering fog"),
    ("E3", "edge", 8.0, "Climbing the ridge"),
    ("E4", "edge", 5.0, "Close: Steve pauses at the edge"),
    ("E5", "edge", 11.0, "Over the shoulder: the endless wall of distorted terrain"),
    # 6. THE FAR LANDS (3:20-4:20)
    ("F1", "farlands", 10.0, "The Far Lands revealed"),
    ("F2", "farlands", 8.0, "Steve walks toward the colossal boundary"),
    ("F3", "farlands", 6.0, "Close: looking up in awe"),
    ("F4", "farlands", 8.0, "Climbing the ridge for a better view"),
    ("F5", "farlands", 14.0, "Camera circles Steve on the ridge"),
    ("F6", "farlands", 14.0, "Pulling far back - incomprehensible scale"),
    # 7. THE ENDING (4:20-4:45)
    ("G1", "farlands", 6.0, "Steve steps closer; a low rumble"),
    ("G2", "farlands", 6.0, "Something moves between the formations"),
    ("G3", "farlands", 8.0, "Push into the mysterious fog; fade to black"),
    ("G4", "black", 6.0, "THE END... OR THE BEGINNING?"),
]


def frames():
    """Return {shot_id: (start_frame, end_frame, seq)} with global frame numbers (1-based)."""
    out = {}
    f = 1
    for sid, seq, dur, _ in SHOTS:
        n = int(round(dur * FPS))
        out[sid] = (f, f + n - 1, seq)
        f += n
    return out


def total_frames():
    return sum(int(round(d * FPS)) for _, _, d, _ in SHOTS)


def seq_shots(seq):
    fr = frames()
    return [(sid, fr[sid][0], fr[sid][1]) for sid, s, _, _ in SHOTS if s == seq]


def start_time(sid):
    return (frames()[sid][0] - 1) / FPS


if __name__ == "__main__":
    fr = frames()
    for sid, seq, dur, desc in SHOTS:
        f0, f1, _ = fr[sid]
        t = (f0 - 1) / FPS
        print(f"{sid:4s} {seq:10s} {int(t // 60)}:{t % 60:05.2f}  {dur:5.1f}s  f{f0}-{f1}  {desc}")
    print("total", total_frames(), "frames =", total_frames() / FPS, "s")
