// ============================================================
// CHAPTER FIVE — Canal Days
// Friday, October 11, 1991
// ============================================================
VAR festival_stops = 0

=== ch5 ===
@chapter Chapter Five :: Canal Days :: Friday, October 11, 1991
@bg downtown festival
@fx clear
@amb festival
@music festival
@ctx The Canal Days festival downtown at dusk: lights strung across Center Street, booths, a brass band. Gus is there with Mom and Mémère.
Downtown has been turned inside out. Strings of bulbs zigzag over Center Street. Maroon and gold bunting on every lamppost. Booths with striped awnings selling cider donuts and fried dough and raffle tickets for a riding mower.
The high school band plays something that might be "Louie Louie" if you're generous.
Everybody in Derry is here. Everybody's smiling. It's the most beautiful, normal thing you've ever seen, and it makes the back of your neck crawl.
@show mom smile left
@show memere neutral right
Mémère insisted on coming. She walks with her cane on one side and your arm on the other, in her good church coat, her brass lantern pinned on the collar.
@show constance smile center
CONSTANCE(smile): Yvette! Oh, look at you. And Claire. Welcome home, Claire. It's been far too long.
MOM(smile): Constance. You haven't aged a day. What's your secret?
CONSTANCE(smile): Community.
Mémère's hand tightens on your arm until it hurts.
MEMERE(angry): Pas celle-là, Constance. Not this one. You hear me?
CONSTANCE(neutral): Yvette, dear. You're confused.
MEMERE(angry): I was never confused a day in my life. Not one day. *You* were the one who—
MOM(worried): Okay! Ma. Cider donuts. Come on. Let's get you a donut. Constance, so good to see you—
Mrs. Ashgrove's eyes follow your grandmother as your mother steers her away. Then they come back to you, and stay there, warm and pleasant and measuring.
CONSTANCE(smile): Enjoy the Float, Augusta. It's a very special night.
~ suspicion += 1
@hide all
-> ch5_fair

// ------------------------------------------------------------
=== ch5_fair ===
@bg downtown festival
@ctx Wandering the Canal Days festival before the Lantern Float. Gus can visit two people.
{festival_stops:
- 0: Your mother parks Mémère on a bench with a donut and a cup of cider and says *Go, be fourteen, I've got her.* You have maybe an hour before the Float.
- 1: The light's almost gone. The band is tuning up for the Float.
}
* {teddy >= 0} [Find Teddy at the lantern booth. #friendly]
    -> f_teddy
* {cal >= 1} [Find Cal, watching the crowd from the bank steps. #look]
    -> f_cal
* [Find Wes. #kind]
    -> f_wes
* {sloane >= 1} [Find Sloane behind the bandstand. #probe]
    -> f_sloane
* [Watch the band on the bandstand. #look]
    -> f_band

= next
~ festival_stops += 1
{festival_stops >= 2:
    -> ch5_float
- else:
    -> ch5_fair
}

= f_teddy
@show teddy grin center
@ctx At the Lantern Society booth, Teddy is buying paper lanterns for the Float. People write the names of people they've lost on them.
TEDDY(grin): GUS. Lantern. You need a lantern. You write a name on it, of somebody you lost, and you float it. It's very Lutheran but in a nice way.
She already bought you one. A paper lantern on a little wooden raft, with a candle stub inside.
TEDDY(neutral): I'm doing my Grandma Nkem. She died when I was eleven. She'd hate this. She'd say it's a fire hazard.
She writes NKEM OKAFOR in her careful square capitals and draws a tiny star next to it.
TEDDY(neutral): You? Who're you writing?
* {knows_june} [Write "June." #honest]
    You write JUNE in the biggest letters that will fit.
    TEDDY(sad): ...Yeah. Yeah. Good.
    ~ wrote_june = true
    ~ teddy += 1
* [Write "Grandpa Henri." #kind]
    You write HENRI THIBODEAU, {ch3_memere.grandpa:a man who held you once while you screamed.|a grandfather you don't remember.}
* [Leave it blank. #silent]
    You leave it blank. Teddy doesn't push.
    TEDDY(neutral): Blank's allowed. Blank can mean a lot of people.
- @hide teddy
-> next

= f_cal
@show cal neutral center
@ctx Cal is watching the Lantern Society members in the festival crowd and pointing out who wears the brass lantern pin.
Cal is sitting on the steps of the Kenduskeag Savings Bank with his notebook, watching the crowd like a birdwatcher.
CAL(neutral): Count the pins.
He points with his pencil, discreetly. A lantern on Principal Fenwick's lapel. On Mrs. Fennimore's cardigan. On Officer Lindqvist's uniform, just above the badge. On a doctor, a pastor, the woman who runs the hospital nursing staff.
CAL(flat): Eleven of them. All here. All watching the canal.
CAL(thinking): And the Keeper's Lamp isn't in its case. It was there this morning when I left for school. It wasn't there at four.
~ clue(society_pins)
{told_cal:
    CAL(neutral): Tomorrow night I'm going up there. To the Standpipe. I've waited five years to see it again with my eyes open. With a camera, this time.
    GUS: A camera?
    CAL(flat): Proof, Gus. If I can prove it, they can't make anyone forget.
}
~ cal += 1
@hide cal
-> next

= f_wes
@show wes smile center
@ctx Wes is at Canal Days with his foster parents, the Dunmores. He's excited about meeting his mother tomorrow night at the Standpipe.
Wes is standing next to the Dunmores at the ring-toss booth: a big tired man in a Bruins cap and a small tired woman holding a toddler on her hip. Mrs. Dunmore smiles at you the way people smile at foster kids' friends, surprised and grateful.
Wes sees you and comes over. He's wearing a clean flannel. He combed his buzz cut, which isn't possible, but he did it.
WES(smile): Tomorrow.
{warned_wes:
    WES(neutral): Don't say it. I know what you think. I heard you.
}
* ["If you go, and you hear me call your name, you stop. Promise me." #honest]
    {wes >= 3:
        WES(thinking): ...That's a weird thing to ask.
        GUS: Promise.
        WES(neutral): Okay. If I hear you, I'll stop. I promise.
        He holds out his pinky, embarrassed, like a little kid. You hook it.
        ~ wes_stops = true
        @remember wes He promised to stop if he heard you.
    - else:
        WES(flat): I'm not promising you anything. You're not my mom.
    }
* ["I hope she comes." #kind]
    WES(smile): Yeah. Me too.
    WES(sad): I keep thinking about what I'll say. Nine years. What do you say?
    ~ wes += 1
* (proof) {saw_note && Clues ? broken_e} ["Wes, the note was typed on the Lantern Society's typewriter. Same chipped 'e'." #confront]
    WES(angry): What?
    GUS: Every *e* on your note has a chip in it. {saw_minutes:The Society's minutes have the same chip.|So does Mrs. Ashgrove's typed history of the Society.} Somebody in the Society wrote that note, Wes. Not your mom.
    WES(afraid): ...
    WES(angry): Why would they — why would anybody — that's insane, Gus. That's *insane.*
    But his hand goes to his pocket, to the note, and stays there. And he doesn't walk away.
    ~ warned_wes = true
- @show brett smirk right
Brett Lindqvist strolls past with Dougie and a candy apple, and doesn't stop walking, and doesn't look at you. Just at Wes.
BRETT(smirk): Big night tomorrow, Pike. Don't be late.
Wes doesn't hear it, or pretends not to. You hear it.
~ brett_present = true
@hide all
-> next

= f_sloane
@show sloane worried center
@ctx Sloane, in her cheer uniform, is alone behind the bandstand looking shaken. She warns Gus about tomorrow night.
Sloane is behind the bandstand in her cheer uniform, alone, her pom-poms on the ground at her feet like two dead animals.
SLOANE(flat): Don't look at me. I just did a toe-touch in front of my entire town and my mother clapped like a metronome.
SLOANE(afraid): Tomorrow night. Stay inside. Please.
{told_sloane:
    SLOANE(flat): I'm saying please again. That's twice. Don't make me say it three times.
- else:
    SLOANE(flat): I don't say please. Remember that I said it.
}
{sloane >= 3:
    SLOANE(neutral): ...And if you're stupid enough not to — and you are, I can tell, you've got that face — there's a path up the back of the hill. Through the old part of Mount Hope cemetery. They don't watch it. They think nobody knows it.
    SLOANE(flat): I know it. I've known it since I was eight.
    ~ sloane += 1
}
* ["Come with me." #honest]
    {sloane >= 4 || (told_sloane && sloane >= 3):
        SLOANE(afraid): ...
        SLOANE(flat): If I'm there, it's not because of you. It's because somebody has to make sure you don't die doing something stupid in front of my mother.
        ~ ally_sloane = true
    - else:
        SLOANE(angry): Are you insane? No. *No.* I'm going to be in bed, with the lights off, like a person who wants to turn fifteen.
    }
* ["What do you know, Sloane?" #probe]
    SLOANE(cry): Enough to be in bed by eight.
    She picks up her pom-poms and goes back around the bandstand, and you hear the crowd cheer for her, and she's smiling, perfectly, every tooth.
- @hide sloane
-> next

= f_band
@ctx The Static Hours, Nate's band, are playing on the Canal Days bandstand.
The Static Hours are on the bandstand: Nate on guitar in his beanie, a drummer with one cymbal, a bass player who looks about twelve. They play two fast songs to polite applause.
Then Nate steps up to the mic.
@show nate sad center
{played_nate:
    NATE(sad): This next one's called "Girl in the Static." It's for — it's for June. I don't know who that is. I'm sorry. But this one's for her.
- else:
    NATE(smile): This next one's called "Girl in the Static." It's for anybody who misses somebody and doesn't know who. Which, in Derry, is probably all of you.
}
He plays it slow. Somewhere behind you, a woman starts crying, and then a man, and then more people, all over the crowd, quietly, in the middle of the funnel cakes and the raffle tickets, and none of them know why.
@hide nate
-> next

// ------------------------------------------------------------
=== ch5_float ===
@bg canal lanterns
@amb canal
@music june
@weather none
@ctx The Lantern Float at nightfall: hundreds of paper lanterns floating on the canal. Gus floats hers with someone she chooses.
At full dark, the band stops, and the whole town goes down to the canal.
@cg cg_lanterns
Hundreds of people, all at once, bending down to the black water and letting go.
The lanterns drift out from the walls and turn slowly in the current and float away under the bridge, little houses of light, and the reflection doubles every one of them, and for a minute the canal is a river of fire.
Nobody talks. The whole town of Derry stands along the railings, holding its breath.
It is the most beautiful thing you have ever seen. Mémère was right.
@cg off
{not ch5_fair.f_teddy:
    You bought a lantern at the Society booth for a dollar. You still haven't written anything on it.
}
@ctx At the Lantern Float on the canal. Gus is choosing who to stand with as she lets her lantern go.
* {teddy >= 2} [Float your lantern with Teddy. #friendly]
    ~ float_with = "teddy"
    @show teddy smile center
    You and Teddy kneel at the edge and set your lanterns down side by side. {ch5_fair.f_teddy:Hers says NKEM.|Hers says NKEM OKAFOR, in careful square capitals. "My grandma," she says.} They bump into each other going out, like they're saying hi.
    TEDDY(sad): She'd hate this. She'd love this. Both.
    {teddy_spark >= 2:
        She leans her head on your shoulder. Just for a second. Just long enough.
        ~ teddy_spark += 1
    }
    ~ teddy += 1
* {wes >= 3} [Float your lantern with Wes. #kind]
    ~ float_with = "wes"
    @show wes neutral center
    Wes didn't buy a lantern. He doesn't know whose name to write. You hand him yours, and he looks at it for a long time, and then he writes, very small, in the corner: THE ADMIRAL.
    WES(smirk): What? He's gonna die someday. He's a cat. Pre-grieving.
    {wes_spark >= 2:
        When he gives it back his fingers stay on yours a second too long, and neither of you mentions it.
        ~ wes_spark += 1
    }
    ~ wes += 1
* {sloane >= 3} [Find Sloane at the railing. #flirt]
    ~ float_with = "sloane"
    @show sloane neutral center
    Sloane is at the railing a little apart from her mother, still in her uniform, a lantern in her hands with nothing written on it.
    SLOANE(neutral): I never know what to write. My mother writes "For Derry." Every year. Like the town died.
    You let your lanterns go together. Hers goes out first, blank and bright.
    {sloane_spark >= 2:
        SLOANE(blush): Don't read into this.
        GUS: Into what?
        SLOANE(smirk): Exactly.
        ~ sloane_spark += 1
    }
    ~ sloane += 1
* [Stand with Mom and Mémère. #kind]
    ~ float_with = "family"
    @show mom sad left
    @show memere sad right
    Your mother stands behind the bench where Mémère is sitting, her hands on Mémère's shoulders. Mémère is crying without making any sound, her lips moving: *jamais je ne t'oublierai.*
    MOM(sad): Every year she cries at this. Every year. I used to think it was the most beautiful thing in the world. Now I just think she's sad.
    ~ mom += 1
    ~ mem += 1
* [Let it go alone. #silent]
    ~ float_with = "alone"
    You kneel at the edge of the canal by yourself and set it down on the water and give it a little push, and watch it go.
- @hide all
@ctx At the Lantern Float, Gus notices one lantern drifting upstream against the current, glowing green.
Then you see it.
All the lanterns are drifting east, under the bridge, the way the water goes.
All but one.
One lantern is going the other way. Upstream. Against the current, slowly, steadily, like something is pulling it on a string. And its light isn't yellow like the others. It's green. A sick, pale, underwater green.
{wrote_june:
    It's yours. You can read the letters on its side as it passes, glowing through the paper. JUNE.
- else:
    There's a name on it. You can't read it. The letters keep almost making sense.
}
Nobody else seems to see it. They're all looking the other way, at the hundreds going east.
~ clue(upstream_lantern)
* [Watch where it goes. #look]
    It goes under the old stone footbridge and out the far side, toward the edge of downtown, toward the hill, toward the ring of broken stone you can just see against the stars.
    Then it goes out.
* [Look away. #silent]
    You look away. You count to ten. When you look back, it's gone.
- -> ch5_tent

// ------------------------------------------------------------
=== ch5_tent ===
@bg downtown night
@amb town
@music tension
@ctx After the Lantern Float, Gus sees Lantern Society members (Mrs. Ashgrove, Principal Fenwick, Officer Lindqvist, the librarian) go into the Society's tent behind Town Hall.
After the Float the crowd breaks up fast — faster than it should. Booths closing. Bulbs coming down. People walking home with their heads down like it's raining, and it isn't.
Across the square you see Mrs. Ashgrove slip behind the Town Hall, into the Lantern Society tent. Principal Fenwick follows. Then Officer Lindqvist. Then Mrs. Fennimore from the library, in her teal cardigan, looking both ways first.
* [Follow them. Get close enough to hear. #confront]
    -> sneak
* [Go home. Whatever they're doing, you don't want to know. #leave]
    -> ch5_calls

= sneak
@ctx Gus is sneaking up behind the Lantern Society tent to eavesdrop on the members inside.
You go around the long way, behind the bank, through the alley that smells like fry oil and cat. The tent glows from inside like a paper lantern. Shadows move on the canvas.
You crouch behind a stack of folding chairs, close enough to touch the canvas.
CONSTANCE: —the Pike boy. The Dunmores won't make a fuss. The state will lose the file. They always do.
FENWICK: And Brett delivered the letter?
OFFICER: Brett delivered the letter. Brett thinks it's a prank. Brett thinks the kid gets scared and runs off to Bangor.
FENWICK: Ha. Well. In a sense.
~ overheard_society = true
~ knows_wes_target = true
~ clue(overheard)
LIBRARIAN: And the Brennan girl?
A pause. You stop breathing.
CONSTANCE: She's asking questions. Like the other one did. Yvette's line has always been... sensitive.
{told_librarian == "society" || told_librarian == "quiet":
    LIBRARIAN: She came into my library asking about it, Constance. By name.
}
CONSTANCE: Next year, perhaps. If she keeps asking. We'll see how she sleeps tomorrow.
* [Stay perfectly still. #silent #timed:6]
    You don't move. You don't breathe. A shadow comes toward the canvas wall — right toward you — and stops, and turns away.
    {suspicion >= 4:
        -> caught
    }
    When the voices go back to Float receipts and next year's committee, you back away down the alley, one step at a time, and run.
    -> ch5_calls
* [Back away now, before they come out. #leave #default]
    You back away down the alley, one slow step at a time. A folding chair shifts. You freeze. Inside the tent, the talking stops.
    {suspicion >= 3:
        -> caught
    }
    Then it starts again. You run.
    -> ch5_calls

= caught
@show constance smile center
A flashlight beam hits you full in the face.
OFFICER: Well. You lost, young lady?
Mrs. Ashgrove steps out behind him, her camel coat buttoned to the throat. She doesn't look surprised. She looks like a woman whose prediction has come true.
CONSTANCE(smile): Augusta. Did you enjoy the Float?
CONSTANCE(neutral): Officer Lindqvist will see you home. Get home safe, dear. And have an early night tomorrow.
CONSTANCE(smile): Everybody does.
~ caught_at_tent = true
~ suspicion += 2
@hide constance
-> ch5_calls

// ------------------------------------------------------------
=== ch5_calls ===
@bg kitchen night
@amb house
@music stop 3
@ctx Friday night at home after Canal Days. Gus uses the kitchen phone to call friends about tomorrow night, Quiet Night, and whether they'll help.
Home. Mémère asleep. Your mother asleep — early, for her, 9:30, saying she's "just wiped." The house ticking.
You sit on the kitchen floor with the phone in your lap and the cord stretched taut.
Tomorrow night.
{knows_wes_target:
    THINK: Wes. They chose Wes. And tomorrow night, at the Standpipe, he's going to walk into the light thinking it's his mother.
- else:
    {saw_note:
        THINK: Wes is going up to the Standpipe tomorrow night. On Quiet Night. Because a typed note told him to.
    - else:
        THINK: Tomorrow is Quiet Night. Something happens. Something always happens.
    }
}
-> calls

= calls
@ctx Gus is deciding who to call for help tomorrow night.
* {teddy >= 1} [Call Teddy. #friendly]
    -> call_teddy
* {cal >= 1} [Call Cal. #ask]
    -> call_cal
* {wes >= 1} [Call Wes at the Dunmores'. #kind]
    -> call_wes
* [Hang up the phone. Go to bed. #leave]
    -> ch5_end

= call_teddy
@sfx phone_pickup
PHONE(teddy): Okafor residence, Theodora speaking, my mom makes me say that—
@ctx Gus is on the phone with Teddy, asking her to come out on Quiet Night to help stop something at the Standpipe.
* ["Teddy. I need you tomorrow night." #honest]
    -> teddy_ask
* ["Never mind. Just wanted to hear a voice." #deflect]
    PHONE(teddy): Aw. I have a great voice. Listen to it. Hello. Hello. It's a good voice.
    You laugh, and she laughs, and you don't ask her.
    -> calls

= teddy_ask
{teddy >= 4 || (told_teddy && teddy >= 3):
    PHONE(teddy): ...Quiet Night.
    PHONE(teddy): Okay. Okay. Yes. Obviously yes. I've been waiting for you to ask since forever. I have walkie-talkies. Real ones. Two-mile range. I'll meet you at the corner of Larch at nine.
    PHONE(teddy): If I die, I'm haunting you. Specifically you.
    ~ ally_teddy = true
    @remember teddy She said yes.
- else:
    PHONE(teddy): Gus... nobody goes out on Quiet Night. My parents would — I mean, they'd be asleep, but they'd *know.* Somehow. And I don't even know what you're — what are we even doing?
    PHONE(teddy): I'm sorry. I'm sorry. I can't.
}
-> calls

= call_cal
@sfx phone_pickup
PHONE(cal): Ashgrove residence.
GUS: Cal. It's me.
PHONE(cal): ...Gus. My mother's in the next room. Talk quietly.
@ctx Gus is on the phone with Cal, asking him to help tomorrow night at the Standpipe.
{cal >= 4 || told_cal:
    PHONE(cal): I'm going up there tomorrow regardless. With my father's Nikon and a flash. If you're coming, come. Cemetery path, nine-thirty.
    PHONE(cal): And Gus — if something happens. If I see it again. Make sure I write it down after. Make sure I don't forget.
    ~ ally_cal = true
    @remember cal You'll go up the hill together.
- else:
    PHONE(cal): I'll be watching. That's what I do. I watch and I write it down. Don't expect anything more from me.
    PHONE(cal): ...Be careful. That's all.
}
-> calls

= call_wes
@sfx phone_pickup
PHONE(wes): ...Hello?
GUS: Wes. It's Gus.
PHONE(wes): It's late. Mrs. Dunmore's gonna kill me. What?
@ctx Gus is on the phone with Wes, trying to talk him out of going to the Standpipe tomorrow night to meet his "mother."
* ["Please don't go tomorrow." #honest]
    {wes >= 5 && warned_wes:
        PHONE(wes): ...
        PHONE(wes): You really think something's gonna happen. Like, really.
        GUS: I know it is.
        PHONE(wes): ...Okay. Okay, Gus. I won't go. I'll stay in. I'll — I'll watch TV with the Dunmores. Happy?
        GUS: Yeah.
        PHONE(wes): You owe me. If my mom shows up and I'm not there, you owe me forever.
        ~ wes_promised = true
        @remember wes He said he wouldn't go.
    - else:
        PHONE(wes): I'm going, Gus. I'm going. Don't call me again about it.
        @sfx phone_hangup
    }
* ["Just — be careful. Okay?" #kind]
    PHONE(wes): ...Yeah. Okay. You too, {bully_choice == "fight" && brett_steps == "sarcastic":Grandpa|Brennan}.
- -> calls

// ------------------------------------------------------------
=== ch5_end ===
@bg gus_room night
@amb night
@ctx Gus prepares for Quiet Night tomorrow, gathering her flashlight and tapes.
You lay it all out on your bed like a soldier before a battle, which is a stupid thing to think and you think it anyway.
Your recorder, with fresh batteries from the junk drawer. Your flashlight. The bedtime tape. {recorded_wes:Wes's tape, the one from the Barrens: *I'm not going anywhere this time.*} {Clues ? rules:Hannah's rules, written on the back of your hand in ballpoint: EYES. BREATH. DON'T ANSWER.}
Through the wall, Mémère is singing in her sleep.
@wait 1
@fx blackout
@wait 1.5
-> ch6
