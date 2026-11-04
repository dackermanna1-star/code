"""Voiceover script for the short. Each line drives one 'beat' of the animation.
`pad` = seconds of breathing room added after the line (for visuals / SFX hits)."""
LINES = [
    ("hook",     "Your elevator drops... and slams to a stop between floors.", 0.7),
    ("buttons",  "You smash every button. Hit the alarm. Nothing.", 0.35),
    ("phone",    "Your phone? No signal. Three percent battery.", 0.45),
    ("brakes",   "Good news: you won't fall. Elevators have multiple steel cables and emergency brakes.", 0.4),
    ("thirst",   "The real danger... is thirst.", 0.6),
    ("day1",     "Day one: you're bored, starving, and you really need a bathroom.", 0.25),
    ("corner",   "So... that corner is now the bathroom.", 0.6),
    ("day2",     "Day two: no water means pounding headaches, dizziness, and cracked lips.", 0.3),
    ("air",      "The air gets hot and stale, but elevators aren't airtight, so you won't suffocate.", 0.3),
    ("day3",     "Day three: you're weak and confused. Most people only survive about three days without water.", 0.5),
    ("light",    "Then... a crack of light.", 0.7),
    ("rescue",   "A rescue crew pries the doors open, and hands you water.", 0.7),
    ("madeit",   "You made it. And from now on...", 0.2),
    ("stairs",   "you're taking the stairs.", 2.8),
]
FPS = 30
LEAD_IN = 0.15   # seconds before first word (hook hits on frame 1)
