// ============================================================
// CHAPTER THREE — The Lay of the Land
// Saturday, September 7, 1991 — free roam
// ============================================================
=== function t3(a, b, c)
{
- visits == 0:
    ~ return a
- visits == 1:
    ~ return b
- else:
    ~ return c
}

=== ch3 ===
@chapter Chapter Three :: The Lay of the Land :: Saturday, September 7, 1991
@bg kitchen morning
@fx clear
@amb house
@music larch
@ctx Saturday morning. Mom is working a double shift. Gus has the whole day free to explore Derry.
There's a note on the refrigerator under a magnet shaped like a lobster.
\*G — Double shift, home by midnight. Mrs. Gagnon is checking on Mémère. $10 is for LUNCH, not tapes. (Tapes are allowed.) Explore! Make a friend! Don't go in the woods! Love, Mom. P.S. I know you're going to go in the woods.*
Mémère is asleep in her chair with the TV on. A man on Channel 2 is explaining how to get the most out of your fall mums.
You have ten dollars, a recorder, three blank-ish tapes, and the whole day.
{teddy >= 3 || lunch == "teddy":
    @sfx phone_ring
    The phone rings. You grab it before it wakes your grandmother.
    PHONE(teddy): Gus! It's Teddy! Okay so I got your number from the phone book, which, is that creepy? It felt creepy. There are four Thibodeaus. I called two wrong ones first. One of them was a man who sang to me.
    PHONE(teddy): Are you still coming tonight? My house? I have the radio thing to show you. My dad's making suya. You don't know what suya is. That's fine. You will.
    GUS: I'll be there.
    PHONE(teddy): YES. Okay. Seven. Bring your tape. The one with the voice. If you — if you still have it.
}
~ visits = 0
-> ch3_hub

=== ch3_hub ===
@hide all
{visits:
- 0: You step out onto Larch Street. The morning is cold and bright and smells like leaves and woodsmoke. Derry is all yours.
- 1: It's after noon. The sun has moved over to the other side of the town, and the shadows have changed their minds about which way to point.
- 2: The light's going gold and long. One more stop before dark.
}
@ctx Gus is choosing where to go in Derry on a free Saturday.
@map
* [Dot's Diner: pie, coffee, and every rumor in Derry. #map:diner]
    -> ch3_diner
* [Low Tide Records: used tapes, loud music, blank cassettes. #map:records]
    -> ch3_records
* [The public library: old newspapers on microfiche. #map:library]
    -> ch3_library
* [The Barrens: the woods and the stream behind Kansas Street. #map:barrens]
    -> ch3_barrens
* [The Standpipe: the ruin on the hill. #map:standpipe]
    -> ch3_standpipe
* [Bassey Park: the playground under Paul Bunyan. #map:park]
    -> ch3_park

=== ch3_next ===
~ visits += 1
{visits >= 3:
    -> ch3_evening
- else:
    -> ch3_hub
}

// ------------------------------------------------------------
=== ch3_diner ===
@bg diner {t3("day", "afternoon", "afternoon")}
@amb diner
@music town
@ctx Dot's Diner downtown. Dot Carrier, 64, warm and gossipy, is behind the counter. Gus is new in town.
Dot's Diner has twelve stools, six booths, a pie case like a jewelry store, and a jukebox that has been playing Patsy Cline since the Carter administration.
@show dot grin center
DOT(grin): Well, look at you! You're Yvette's granddaughter. You've got the chin. Sit, sit, sit.
DOT(smile): First slice is free for new people. Second slice is free for people I like. Third slice, you pay, because I'm not a charity, I'm a businesswoman, deah.
She cuts you a slab of blueberry pie the size of a paperback and pours you coffee you didn't ask for.
- (talk)
* [Ask about Quiet Night. #ask]
    DOT(laugh): Oh, Quiet Night! That's just an old Derry thing. Folks like an early night in October. It's — tradition, I guess. Like the Float.
    DOT(neutral): Bad for business, I'll tell you that. I close at seven. Everybody's home by eight.
    GUS: Why?
    DOT(thinking): Why? Well. Because... it's Quiet Night, hon.
    She says it like that's an answer, and then she looks briefly confused, like a woman who has walked into her own kitchen and can't remember what she came in for.
    -> talk
* [Ask about the Lantern Society. #ask]
    DOT(smile): Lovely ladies. And Dale Fenwick, he's in it, and the Lindqvists. They run Canal Days. The Float. They do the Christmas wreaths on the lampposts. Constance Ashgrove could organize a hurricane.
    DOT(neutral): Your grandmother was a big one in it, you know. For years.
    GUS: Why'd she quit?
    DOT(thinking): Did she? I don't — huh. I don't remember that. I'd have heard. I hear everything.
    -> talk
* {heard_radio} [Ask if she knows a Daniel Carrier. #probe]
    -> daniel
* [Ask about the flood in '85. #ask]
    DOT(sad): Oh, that was a terrible thing. Half of downtown went into the canal. The Standpipe came down. Folks lost businesses. Folks lost — well.
    DOT(neutral): Funny thing. I slept through the worst of it. Most of the town did. Woke up and the street was gone.
    DOT(smile): Anyway. That's Derry. Bad things happen, and then you make pie.
    -> talk
* [Eat your pie and listen to the room. #silent]
    -> listen

= daniel
~ asked_daniel = true
GUS: Do you know somebody named Daniel Carrier?
@sfx splash 0.5
The coffee pot slips out of Dot's hand and shatters on the floor behind the counter.
DOT(surprised): Oh! Oh, for — look at me.
She doesn't bend to clean it up. She stands there with her hand still curled around the shape of a handle that isn't there.
DOT(worried): No. No, I don't think so, hon. Carrier's my name, but there's no Daniel. I never had — I never had kids. It was just me and Lou, and Lou passed in '79.
DOT(cry): Isn't that funny. I'm crying. I don't — why am I crying?
She laughs, wiping her eyes with her apron, while coffee spreads across the floor toward the drain.
~ clue(daniel_carrier)
~ dot += 1
-> listen

= listen
@ctx Dot's Diner, mid-afternoon. Dot makes a grilled cheese nobody ordered.
{visits >= 1:
    At exactly 3:15 by the Coca-Cola clock, Dot stops in the middle of a sentence, goes to the grill, and makes a grilled cheese.
    She doesn't write a ticket. Nobody ordered it. White bread, two slices of American, cut corner to corner, the way you'd cut it for a kid. Two pickle spears. She sets it at the end of the counter in front of an empty stool.
    Twenty minutes later, cold, she scrapes it into the trash without looking at it.
- else:
    On the order wheel over the grill, among the tickets, there's one that's been there so long it's gone soft and brown. In Dot's handwriting: *3:15 — GC — pickles.*
    GUS: What's the 3:15 ticket?
    DOT(laugh): Oh, that! I make a grilled cheese at quarter past three. Every day. Have for twenty years.
}
* [Ask who it's for. #ask]
    DOT(smile): Nobody, hon. Isn't that silly? Just a habit. My doctor says it's a "tic." I say it's a grilled cheese.
    DOT(sad): Twenty years. You'd think I'd know why.
* [Say nothing. #silent]
    You don't ask. You just watch the empty stool at the end of the counter, and the plate in front of it, and the way Dot never once looks at it.
- ~ clue(dot_cheese)
DOT(smile): You come back, now. You're too skinny. Yvette always fed people. You come back and I'll feed you.
@hide dot
-> ch3_next

// ------------------------------------------------------------
=== ch3_records ===
@bg records day
@amb records
@music stop 2
@ctx Low Tide Records downtown. Nate Fortier, 23, kind and scruffy, runs the counter. His band's song is playing.
Low Tide Records is a long, narrow room that smells like cardboard and patchouli and old paper. Every inch of wall is posters. Somebody has written THE STATIC HOURS — LIVE AT THE ROCK HOUSE — OCT 4 on a flyer in marker and stapled it to the ceiling.
Behind the counter, a guy with long brown hair, a goatee, and a knit beanie is eating cereal out of a coffee mug.
@show nate smile center
NATE(smile): Hey. Welcome to Low Tide. Used tapes are a buck fifty, three bucks if they've got the case. New stuff's on the wall. Don't touch the Sonic Youth, it's not for sale, it's mine.
* ["Do you have blank tapes?" #ask]
    NATE(grin): A woman of taste. Maxell XLII, high bias, three-pack, five bucks. They're the good ones.
    You buy them. Your ten dollars becomes five, and the world becomes slightly better.
    NATE(smile): What do you record?
    GUS: Places. Sounds. Rain. Trains. Stuff people don't listen to.
    NATE(surprised): No way. That's — that's like what Eno does. Field recordings. That's real art, man.
    ~ nate += 1
* ["What's playing?" #ask]
    NATE(blush): Oh — uh. That's us, actually. My band. The Static Hours. We recorded it in my buddy's garage on a four-track.
    ~ nate += 1
* [(Dig through the used tapes.) #look]
    In the bin marked LOCAL — 50¢ you find a tape labeled in ballpoint: *DERRY HIGH TALENT SHOW 1983.* Somebody has scribbled out one act on the track list so hard the pen went through the paper.
    NATE(neutral): Oh, that stuff comes in from estate sales. Take it, it's free. Nobody wants it.
- @ctx Nate is playing his band's song "Girl in the Static" for Gus.
The song on the speakers changes. It's slow, just a guitar and a voice, a little out of tune in a way that sounds on purpose.
\*There's a girl in the static, between the stations at night. She knows the words to my songs. She won't tell me her name.*
NATE(neutral): This one's called "Girl in the Static." I wrote it two years ago. Woke up one morning and it was just there, the whole thing.
NATE(smile): It's about a girl I never met. Weird, right? Everybody's got one of those, I think. Somebody you miss and you don't know who.
~ clue(nate_song)
* {Clues ? locker_initials} ["Were you at Derry High in eighty-two?" #probe]
    NATE(thinking): Freshman year. Class of eighty-six. Why?
    GUS: There are initials scratched in my locker. J.B. plus N.F., eighty-two.
    NATE(laugh): N.F.! Could be me, I guess. Nate Fortier. But I didn't date anybody in high school, I was a — a very late bloomer, like, extremely—
    He stops. He puts his hand flat on his chest, over his heart, and frowns at nothing.
    NATE(worried): Huh. That's weird. Heartburn. I think I need to stop eating Lucky Charms for lunch.
    ~ clue(nate_jb)
    ~ nate += 1
* ["It's beautiful." #kind]
    NATE(blush): Thanks. Seriously. Nobody listens to the slow ones.
    NATE(smile): Hey — you should come to a show. All ages. Bring your recorder. You can tape us. Make us famous.
    ~ nate += 1
* ["I know what you mean. About missing somebody you don't know." #honest]
    NATE(surprised): ...Yeah?
    GUS: Yeah.
    He looks at you for a long moment, his spoon in the air, milk dripping.
    NATE(sad): Derry, man. This town.
    ~ nate += 2
- @hide nate
-> ch3_next

// ------------------------------------------------------------
=== ch3_library ===
@bg library {t3("day", "day", "evening")}
@amb library
@music mystery
@ctx The Derry Public Library. Mrs. Fennimore, a helpful librarian wearing a brass lantern pin, asks Gus what she's researching.
The Derry Public Library is two buildings, adult and children's, joined by a corridor made entirely of glass. Walking through it feels like walking through the inside of a held breath.
At the reference desk, a woman with a steel-grey bob and half-moon glasses looks up and smiles like she's been waiting all morning for you specifically.
@show librarian smile center
{Clues ? memere_society:
    There's a little brass lantern pinned to her cardigan.
}
LIBRARIAN(smile): Good morning, dear. You're new. I know all my regulars. What can I help you find?
* ["Old newspapers. October 1982." #honest]
    ~ told_librarian = "1982"
    ~ suspicion += 1
    LIBRARIAN(neutral): October 1982. Goodness. What's in October 1982?
    GUS: School project.
    LIBRARIAN(smile): Of course. Microfiche is in the back. The machine sticks. Hit it on the left side, gently, like a cat you're fond of.
* ["Anything about the Lantern Society." #ask]
    ~ told_librarian = "society"
    ~ suspicion += 2
    LIBRARIAN(smile): Oh, how nice. We have the Society's centennial booklet from 1981 — lots of lovely photographs. And the Canal Days programs.
    She touches the pin on her cardigan, almost tenderly.
    LIBRARIAN(neutral): May I ask who sent you?
    GUS: Nobody. School project.
    LIBRARIAN(smile): Of course.
* ["Quiet Night. Where it comes from." #probe]
    ~ told_librarian = "quiet"
    ~ suspicion += 2
    LIBRARIAN(flat): Quiet Night.
    LIBRARIAN(smile): That's just a bit of local color, dear. Folklore. I'm not sure there's anything written down.
    LIBRARIAN(neutral): What's your name?
    GUS: Gus. Brennan.
    LIBRARIAN(smile): Brennan. I'll remember that.
* ["Just browsing." #lie]
    ~ told_librarian = "nothing"
    LIBRARIAN(smile): Browsing is the noblest form of research. Microfiche is in the back if you get ambitious.
- @hide librarian
@ctx Gus is at the library's microfiche reader looking at old Derry News issues from October 1982.
The microfiche reader is a beige machine the size of a television with a screen that glows the green of an old aquarium. You feed it the reel for October 1982 and crank.
SATURDAY, OCTOBER 9, 1982: CANAL DAYS NEXT WEEKEND, LANTERN SOCIETY PROMISES "MOST BEAUTIFUL FLOAT YET."
TUESDAY, OCTOBER 12: Nothing about the Float. A Little League banquet.
WEDNESDAY, OCTOBER 13: Bake sale results. A lost beagle named Duke. Weather: clear and cold.
~ clue(library_1982)
* [Go back to the Canal Days coverage. Look at the photos. #look]
    The Friday before, a photo spread: paper lanterns on the canal, a hundred little flames on black water. A brass band. Mrs. Constance Ashgrove, twenty years younger and exactly as poised, handing a lantern to a little boy.
    And on the bridge, a group of teenagers leaning on the railing, grinning at the camera.
    The caption: *Derry High freshmen enjoy the Float: Paige Whitcomb, Nate Fortier, and*
    And a gap. A space where a name should be, with a smudge in it like the printer's ink ran.
    In the photo, between the girl with the big curled bangs and the boy with the shaggy hair, there's a third kid. Her arm around both of them. Her face is a pale blur, as if the film went bad only there, only on her.
    ~ clue(library_photo)
* [Look for October 1990. Last year. #probe]
    OCTOBER 13, 1990: a church supper. A letter to the editor complaining about leaf pickup. Weather: clear and cold.
    The same nothing. The same perfect, careful nothing.
- {lunch != "cal" && cal < 2:
    @show cal neutral center
    When you look up from the reader, Cal Ashgrove is standing at the end of your table with a stack of bound volumes, looking at your screen.
    CAL(neutral): October 1982. Interesting choice.
    CAL(thinking): Read the thirteenths. Every year. You'll see a pattern, if you look at nothing long enough.
    GUS: I've seen it.
    CAL(surprised): ...Have you.
    He sits down across from you without asking, which you're learning is how Cal asks.
    CAL(neutral): Then we should talk. Not here. Mrs. Fennimore has very good hearing, for a woman who claims to be deaf in one ear.
    ~ cal += 2
    @hide cal
}
-> ch3_next

// ------------------------------------------------------------
=== ch3_barrens ===
@bg barrens {t3("day", "day", "dusk")}
@amb creek
@music barrens
@ctx The Barrens, a wild overgrown ravine with a stream and a big concrete culvert. Wes Pike is there feeding a one-eyed stray cat he calls the Admiral.
The Barrens are a long tangle of woods and brush in a ravine behind Kansas Street, where the Kenduskeag runs shallow and brown over stones. Sumac gone red. Birches gone gold. A shopping cart lying on its side in the water like it drowned there.
On the far bank, a big concrete pipe sticks out of the hill — a culvert, round and black, a rusted grate hanging off it by one corner. Cold air comes out of it. You can feel it from across the stream.
Wes Pike is sitting on a fallen log, holding out a sardine to a gray cat with one eye.
@show wes flat center
{bully_choice == "walk":
    -> cold
}
{bully_choice == "fight" || bully_choice == "trick":
    -> warm
}
WES(neutral): Hey.
-> admiral

= cold
WES(flat): Oh. It's you.
He goes back to the cat.
* ["I'm sorry. About the other day. I should've done something." #honest]
    WES(neutral): ...
    WES(flat): Yeah. You should have.
    The cat eats the sardine. Wes wipes his fingers on his jeans.
    WES(neutral): ...Everybody walks away. You're not special. It's okay.
    ~ wes += 2
    @remember wes You came back and apologized.
* ["Free country." #sarcastic]
    WES(flat): Sure.
    ~ wes -= 1
* [(Sit down on the other end of the log, and don't say anything.) #silent]
    You sit. He doesn't leave. Eventually the cat comes and sniffs your shoe.
    ~ wes += 1
- -> admiral

= warm
WES(neutral): {bully_choice == "fight":{brett_steps == "sarcastic":Grandpa|Hey, tough guy}|Hey, liar}. You came to the woods. Mom said not to go in the woods, I bet.
GUS: How'd you know?
WES(smirk): Everybody's mom says that. Nobody's mom has ever been obeyed.
~ wes += 1
-> admiral

= admiral
@ctx Wes is feeding the one-eyed stray cat he calls the Admiral in the Barrens. He's talking to Gus.
WES(neutral): This is the Admiral. He's a jerk. Don't try to pet him.
* [(Try to pet him.) #action]
    You hold out your hand. The Admiral looks at it with his one eye, considers his options, and then rubs his whole face against your knuckles, purring like a broken lawnmower.
    WES(surprised): ...He's never done that. In like a month. He bit me *twice.*
    WES(smirk): Traitor.
    ~ wes += 1
    ~ wes_spark += 1
* [(Leave him alone.) #shy]
    You keep your hands in your pockets. The Admiral eats and ignores you both, like a king.
* ["Why don't you take him home?" #ask]
    WES(flat): Dunmores have a dog. And it's not my home. I don't bring stuff home. You don't get to keep stuff.
    ~ wes += 1
- WES(neutral): Don't go in the pipe, by the way. Kids say there's tunnels under the whole town. Sewers and old mill races and stuff. People go in and get lost.
WES(flat): Plus it breathes.
GUS: It what?
WES(neutral): Stand by it for a while. You'll see.
@ctx Wes and Gus are sitting near the old culvert in the Barrens. Wes has opened up a little about being a foster kid looking for his mother.
* [Record the pipe. #record]
    You cross the stones and hold the recorder up to the mouth of the culvert. Cold air on your hand. The pipe hums, very low, like a held note on an organ.
    It does breathe. In, out. Slow. Like something big, asleep.
    Later, when you play it back, under the hum there's something else. Many voices, very far away, all talking at once. Too far to hear what they say. Or maybe it's just water.
    ~ tape(tape_creek)
* [Ask about his mom. #ask]
    WES(flat): What about her.
    GUS: Where is she?
    WES(neutral): Somewhere. Bangor, last anybody told me. Caseworker says she's "not in a position." Whatever that means. Not in a position to want me, probably.
    WES(flat): I'm gonna find her, though. When I'm sixteen. Or before. Whatever.
    ~ wes += 1
* [Just sit with him. #silent]
    You sit on the log and watch the water. He draws in his sketchbook. The Admiral washes himself in a patch of sun. For a while it's just the stream and the scratching of his pencil, and the pipe breathing.
    ~ wes += 1
- -> record_wes

= record_wes
@ctx Gus wants to record Wes saying something for her collection of sounds.
* [Ask Wes to say something for your tape. #record]
    GUS: Can I record you? For my collection. Just say something.
    {wes >= 2:
        WES(thinking): Like what?
        GUS: Anything. Your name. Where you are. What day it is. So I remember.
        He looks at the recorder in your hand for a long time. Then he leans toward it, a little embarrassed, a little serious.
        @sfx record_start
        WES(neutral): This is Wes Pike. I'm fifteen. It's Saturday. I'm in Derry, Maine, which is a stupid name for a town.
        WES(flat): And I'm not going anywhere this time.
        He sits back.
        WES(blush): That's it. That's all I got. Don't play it for anybody.
        ~ recorded_wes = true
        ~ tape(tape_wes)
        ~ wes += 1
        @remember wes He let you record him.
    - else:
        WES(flat): No. I don't do tapes.
        GUS: Why not?
        WES(neutral): Because you play them later and the person's gone. That's what tapes are for.
    }
* [Don't push it. #silent]
    You don't ask. Some things you don't put on tape.
- WES(neutral): You should go. It gets dark fast down here. Like, faster than other places.
@hide wes
-> ch3_next

// ------------------------------------------------------------
=== ch3_standpipe ===
@bg standpipe {t3("day", "day", "dusk")}
@amb hill
@music mystery
@ctx Memorial Park on the hill: the fenced-off ruin of the old Standpipe water tower, which collapsed in 1985. Graffiti on the stones. A view over all of Derry.
The path up the hill is steep and nobody seems to use it except kids, judging by the beer cans and the tiny hearts carved into the trees.
At the top, a chain-link fence with a sign: DANGER — KEEP OUT — CITY OF DERRY. There's a gap at the bottom where the fence has been peeled up, kid-sized. Everybody uses it.
Inside: the Standpipe. Or what's left. A ring of broken stone, one story high, jagged at the top like a bitten cookie, with rusted iron bars sticking out of it.
* [Read the graffiti. #look]
    Initials. Hearts. KISS RULES. A phone number. MR. PAULSEN IS A DINOSAUR.
    And here and there, small, scratched carefully into the stone with something sharp, a little lantern with an X through it. You count four. One of them is old enough that moss has grown into the scratches.
    The same lantern that's scratched in your locker.
    ~ clue(standpipe_lantern)
* [Read the plaque. #look]
    A bronze plaque on a boulder: IN MEMORY OF THOSE LOST IN THE STORM OF 1985. THE CITY OF DERRY WILL NOT FORGET.
    No names. Just that. Will not forget, and no names.
* [Look out over the town. #look]
    From up here Derry looks like a model train set. The canal, a gray ribbon. The steeples. Downtown. The high school. Larch Street, if you squint — there, the green house, the round window in the peak.
    Something pale is in the round window. Like a face pressed close to the glass.
    You blink, and it's just the sky reflected.
- @ctx At the Standpipe ruin. Gus is alone, or Cal is there sketching at sunset.
{lunch != "cal" && cal < 2 && not ch3_library:
    @show cal neutral center
    Someone is sitting on the stones on the far side of the ring, writing in a black-and-white notebook. Cal Ashgrove. Of course.
    CAL(neutral): The crossed lantern. You've seen it.
    GUS: It's in my locker.
    CAL(surprised): ...Is it.
    CAL(thinking): It's a kids' thing. It means *don't go to the light.* You'll find it all over Derry if you look. Under bridges. In the Barrens. Places kids go that grown-ups don't.
    CAL(flat): Kids know something here. Then they grow up and they stop knowing it.
    ~ cal += 2
    @hide cal
}
* [Record the wind up here. #record]
    You hold the recorder up into the wind. It howls through the broken stone like someone blowing across a bottle.
    On the playback, under the wind, for one second — a voice, close, a girl's voice: *go home.*
    Or just the wind, saying something that sounds like words, the way wind does.
* [Leave before it gets dark. #leave]
    You squeeze back under the fence. Your jacket catches on the wire and you have to back up and try again, and the whole time you feel the ruin at your back, like a mouth.
- -> ch3_next

// ------------------------------------------------------------
=== ch3_park ===
@bg park afternoon
@amb town
@music stop 3
@ctx Bassey Park. Hannah Gagnon and other little kids are playing a game called "Lantern": one kid holds a flashlight, the others close their eyes and must not answer when called.
Under the giant Paul Bunyan, little kids are playing a game in the dead leaves. Hannah from next door is one of them.
One kid holds a flashlight, switched on even though it's broad daylight. The rest stand in a ring with their eyes squeezed shut and their hands over their mouths. The kid with the flashlight walks slowly around the ring, shining it in their faces, and calls names in silly voices.
KID: Mi-chael. Michael, it's Mom. Come home for supper, Michael.
A boy in the ring giggles, and the others scream, and he has to go stand in the middle, and he looks genuinely upset about it.
@show hannah flat center
Hannah sees you. She leaves the ring and walks right up to you.
HANNAH(flat): You're not supposed to watch. Watchers are bad luck.
* ["What's the game called?" #ask]
    HANNAH(neutral): Lantern.
    GUS: How do you win?
    HANNAH(flat): You don't win. You just don't lose.
* [(Offer her a stick of gum.) #manipulate]
    You hold out a stick of Juicy Fruit. Hannah looks at it the way a customs officer looks at a passport. Then she takes it.
    HANNAH(neutral): Okay. What do you want to know?
* ["Can I play?" #friendly]
    HANNAH(flat): No. You're too big. Big kids don't play. Big kids forget how.
- @ctx Hannah is explaining the rules of the "Lantern" game and its rhyme to Gus.
GUS: What are the rules?
HANNAH(neutral): You close your eyes so you don't see the light. You hold your breath when it goes by, so it can't hear you.
HANNAH(flat): And you never answer. Even if it sounds like your mom. Even if it sounds like you.
GUS: That's it?
HANNAH(thinking): And you never guess. You never say who it sounds like. That's how it gets you.
HANNAH(neutral): Lantern, lantern, burning low. Who goes walking? Who's to know? Close your eyes and hold your breath. Never answer, never guess.
HANNAH(flat): If it calls you, let it call. Derry keeps us, one and all.
~ knows_rules = true
~ clue(rules)
* [Record her saying it. #record]
    You ask her to say it again for the tape. She does, flat and fast, like the Pledge of Allegiance.
    ~ tape(tape_canal_kids)
* ["Who taught you that?" #ask]
    HANNAH(neutral): Nobody. Everybody knows it.
    HANNAH(flat): My brother didn't close his eyes.
    GUS: You have a brother?
    HANNAH(flat): No.
    She turns around and goes back to the game.
* ["That's creepy, Hannah." #blunt]
    HANNAH(smile): I know.
    It's the first time you've seen her smile. You would like it to be the last.
- @hide hannah
-> ch3_next

// ------------------------------------------------------------
=== ch3_evening ===
@hide all
@ctx Evening on Saturday. Gus can go to Teddy's house to see her ham radio, or stay home with Mémère.
{teddy >= 3 || lunch == "teddy":
    -> choose
}
~ evening3 = "memere"
You go home as the streetlights come on.
-> ch3_memere

= choose
The sun goes down behind the hills at 7:04. Teddy is expecting you at seven.
* [Go to Teddy's. #go]
    ~ evening3 = "teddy"
    -> ch3_teddy
* [Stay home with Mémère tonight. #kind]
    ~ evening3 = "memere"
    ~ teddy -= 1
    You call Teddy and tell her you can't come. She says "Oh! Totally, no, totally," in the voice of a person who is not totally anything.
    -> ch3_memere

=== ch3_teddy ===
@bg teddy_room night
@amb static
@music stop 2
@ctx Teddy's bedroom at night. She shows Gus her ham radio and plays a tape she recorded last Quiet Night: a flat voice reading names.
Teddy's room is a spaceship. Glow-in-the-dark stars on every inch of the ceiling, arranged in actual constellations — "I'm not an animal," she says. A telescope at the window. Posters of the shuttle, of Saturn, of a starship flying past a purple nebula.
And on the desk: the radio. A black receiver with amber dials and two needles that jump when it hisses, a microphone on a stand, a logbook, a corkboard covered in postcards from strangers in Belgium and Japan and Ohio.
@show teddy grin center
TEDDY(grin): KA1TDO. That's me. That's my call sign. I'm licensed by the federal government. They gave a fourteen-year-old a license to broadcast. America is wild.
TEDDY(neutral): Okay. Okay. Before I play it, you have to promise not to laugh.
GUS: I promise.
TEDDY(worried): Last October. Quiet Night. My parents were asleep by eight — I told you — and I was up, because I'm always up, and I was scanning the two-meter band. And at 1:12 in the morning I got... this.
She presses PLAY on a tape deck wired into the receiver.
@sfx tape_play
TAPE(radio): —Peter Dunn. Marcus Lowell. Toby Mercer. Daniel Carrier—
The voice is flat. Patient. Reading a list to a room that isn't listening.
@sfx tape_stop
TEDDY(worried): It goes on like that for nine minutes. Names. Just names. Then it stops in the middle of one.
TEDDY(flat): Peter Dunn. I looked him up in the phone book. There's no Peter Dunn in Derry. There's no Marcus Lowell. I called the library. They looked at me like I was asking about unicorns.
~ clue(teddy_tape)
~ tape(tape_teddy_radio)
{heard_radio:
    -> radio_heard
- else:
    -> radio_new
}

= radio_heard
* ["I heard it. The same voice. Wednesday night, on my clock radio." #honest]
    TEDDY(surprised): ...
    TEDDY(afraid): You — what? *What?* Same names?
    GUS: Peter Dunn. Marcus Lowell. Toby Mercer. Daniel Carrier. Rose Teague. Then it said "June" and cut off.
    Teddy sits down on the floor, hard, right where she was standing.
    TEDDY(cry): Oh my god. Oh my god, Gus. I thought I was crazy. For a *year* I thought I was crazy.
    ~ teddy += 3
    ~ teddy_spark += 1
    @remember teddy You heard it too. She isn't crazy.
* [Don't tell her you heard it too. Not yet. #deflect]
    GUS: That's... really weird.
    TEDDY(sad): Yeah. Weird. Right.
    She ejects the tape and holds it, looking at it.
    TEDDY(neutral): You think it's Brett, right? Messing with people? That's what I tell myself.
- -> sign_tape

= radio_new
* ["That's not Brett. Brett can't read that many names in a row." #joke]
    TEDDY(laugh): Oh my god. Okay. You're right. Brett's maximum is like four names and two of them are his.
    TEDDY(worried): So who is it?
    ~ teddy += 1
* ["Could it be a recording? Something old, rebroadcast?" #probe]
    TEDDY(thinking): I thought about that. But the two-meter band is line-of-sight. Whoever it was, they were close. They were in Derry. That night.
    ~ teddy += 1
- -> sign_tape

= sign_tape
{heard_sign_voice && not taped_over_sign:
    TEDDY(neutral): Did you bring yours? The car tape?
    You play it for her: the rain, the wipers, and at the sign the girl's voice. *If you're hearing this, Gussie, it means you came back.*
    Teddy listens to it four times with her eyes closed and her head tilted like a bird's.
    TEDDY(thinking): That's not radio. That's not a broadcast — there's no carrier, no drift. That's on the tape. That's *recorded.* Somebody said that into a microphone, close up.
    TEDDY(worried): A long time ago, maybe. It's got that — the high end's gone. Like an old tape that's been recorded over and over.
    ~ teddy += 1
}
@ctx Late evening in Teddy's room, lying on the floor under her glow-in-the-dark stars. Teddy is talking about her family and asks Gus something personal.
Later, you lie on her floor under the plastic stars while her dad makes something downstairs that smells incredible and her mother's voice and his go up and down, up and down, the way voices do when they're trying not to be heard.
TEDDY(sad): They're fighting. My mom got offered a job back at Rice. In Houston. She wants to go. Dad doesn't.
TEDDY(flat): I don't know what I want. I hate it here. I don't want to leave. Both. Is that stupid?
* ["Not stupid. I hate Derry and I just got here. I also don't want you to leave." #honest]
    TEDDY(blush): ...You've known me for four days.
    GUS: Long four days.
    TEDDY(smile): Yeah. Yeah, they were.
    ~ teddy += 2
    ~ teddy_spark += 1
* ["Houston has better weather." #joke]
    TEDDY(laugh): Houston has *hurricanes,* Gus. And cockroaches the size of Pop-Tarts that fly. That fly at your *face.*
    TEDDY(smile): ...But yeah. It has better weather.
    ~ teddy += 1
* [(Take her hand.) #flirt]
    You reach over in the dark and find her hand on the carpet and hold it. She goes very still. Then she holds back.
    Neither of you says anything about it. Over your heads, the Big Dipper glows a sickly, wonderful green.
    ~ teddy += 2
    ~ teddy_spark += 2
    @remember teddy You held her hand under the stars.
- TEDDY(thinking): Do you ever feel like you're forgetting something? Like when you walk into a room and you don't remember why you came in.
TEDDY(sad): But with your whole life?
@hide teddy
-> ch3_end

=== ch3_memere ===
@bg kitchen evening
@amb house
@music warm
@ctx A quiet Saturday evening at home. Mémère is lucid and teaches Gus to play Kaiser, a Franco-American card game. She talks about the Lantern Society.
Mrs. Gagnon leaves at six with a casserole dish and a look. Your grandmother is having a good evening. She makes you sit at the kitchen table and deals out a deck of cards with hands that shake everywhere except when they're shuffling.
@show memere smirk center
MEMERE(smirk): Kaiser. Your grandfather and I played every Friday with the Leclercs for thirty years. I'll teach you. You'll lose. It builds character.
She teaches you. You lose. She wins every hand with a little crow of satisfaction, *Ha!*, and slaps her cards down like she's killing flies.
* ["Are you cheating?" #joke]
    MEMERE(laugh): Of course I'm cheating! I'm seventy-two. You think I got to seventy-two by playing fair?
    ~ mem += 1
* ["Tell me about Grandpa." #kind]
    MEMERE(smile): Henri. He worked at the tannery. He smelled like a shoe for forty years and I never once minded. He could fix anything. A radio, a car, a fence. Not himself, but everything else.
    MEMERE(sad): He died in seventy-eight. Before you remember. He held you once. You screamed the whole time. He said, "This one has opinions."
    ~ mem += 1
* ["Mémère, what's the Lantern Society?" #ask]
    -> society
- @ctx Playing cards with Mémère. Gus can ask her about the Lantern Society.
* ["Mémère, what's the Lantern Society?" #ask]
    -> society
* [Keep playing. Let her win. #kind]
    You keep playing. She keeps winning. Around ten she falls asleep in her chair holding a full house, and you put a blanket over her, and you leave the cards exactly where they are.
    ~ mem += 1
    -> ch3_end

= society
MEMERE(neutral): The Lantern Society.
She puts her cards down. Face up — she's been holding nothing, a pair of fours. She doesn't seem to notice.
MEMERE(thinking): We did good work. The Float. The wreaths. The church suppers. We kept the town.
MEMERE(flat): Somebody has to keep it. You don't understand that, you young people. A town doesn't just *happen.* It has to be kept.
MEMERE(sad): We only ever gave the ones nobody would miss. That was the rule. Drifters. Runaways. People passing through. Nobody's anybody.
MEMERE(cry): And then they wanted my Junie, and I—
She stops. She looks at the cards on the table like she's never seen cards before.
MEMERE(worried): ...Whose deal is it?
~ clue(memere_gave)
* ["Gave them to what, Mémère?" #probe]
    MEMERE(afraid): Hm?
    GUS: You said you gave people. Gave them to what?
    MEMERE(flat): I don't know what you're talking about, ma belle. You're tired. It's late. Your deal.
    Her hands are shaking now. Even when she shuffles.
* ["Who's Junie?" #ask]
    MEMERE(sad): Junie...
    She reaches across the table and touches your cheek.
    MEMERE(smile): You came back. You shouldn't have come back. But you did. You always were stubborn.
* [(Hold her hand until it stops shaking.) #kind]
    You put your hand over hers. It takes a long time, but the shaking stops.
    MEMERE(sad): Merci, ma belle. Merci.
    ~ mem += 2
- @hide memere
-> ch3_end

=== ch3_end ===
@bg gus_room night
@music stop 3
@amb night
@ctx Midnight. Mom comes home from her double shift and looks in on Gus, who is pretending to sleep.
At midnight you hear the station wagon in the driveway, the door, your mother's slow feet on the stairs. You lie still with your eyes closed.
Your door opens a crack. A wedge of hall light falls across the quilt.
She stands there a long time. You can hear her breathing, tired and even.
MOM: Night, girls.
The door closes.
\*Girls.*
THINK(afraid): There's nobody else in here. There's never been anybody else in here.
@wait 1
@fx blackout
@wait 1.5
-> ch4
