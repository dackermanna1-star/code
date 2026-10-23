// ============================================================
// CHAPTER FOUR — The Weeks Between
// September 16 – October 10, 1991
// ============================================================
=== ch4 ===
@chapter Chapter Four :: The Weeks Between :: September 16 – October 10, 1991
-> ch4_partners

// ------------------------------------------------------------
=== ch4_partners ===
@bg classroom day
@fx clear
@amb classroom
@music school
@date Monday, September 16 · Room 114
@ctx English class. Ms. Whitcomb is having students pick partners for the "Derry Voices" oral history project.
Two weeks in, Derry High has stopped being a foreign country and become a place with routes. Locker, homeroom, the back stairs that skip the cheer squad, the bathroom on the third floor where nobody goes.
@show whitcomb smile center
WHITCOMB(smile): Okay! Derry Voices. Partners. Choose wisely, choose quickly, and if you choose your boyfriend, Kimberly, I will separate you myself.
WHITCOMB(neutral): Find somebody who's lived here thirty years or more. Get them talking. Tape it if you can. Due before Thanksgiving.
@hide whitcomb
@ctx Gus is choosing a partner for the oral history project.
{teddy >= 0:
    Teddy is already looking at you over her glasses, eyebrows all the way up, like a dog that has heard the word *walk.*
}
* {teddy >= 0} [Partner with Teddy. #friendly]
    ~ partner = "teddy"
    @show teddy grin center
    TEDDY(laugh): YES. Okay. We're going to be so good at this. We're going to make Ms. Whitcomb *weep.*
    ~ teddy += 1
* {cal >= 1} [Partner with Cal. #ask]
    ~ partner = "cal"
    @show cal neutral center
    CAL(surprised): ...Me?
    CAL(neutral): Acceptable. I have a list of potential subjects. It's fourteen pages.
    ~ cal += 1
* {wes >= 1} [Partner with Wes. #shy]
    ~ partner = "wes"
    @show wes flat center
    WES(flat): You know I'm not from here, right? I don't know anybody old.
    GUS: That's what I'm for.
    WES(smirk): ...Okay, {bully_choice == "fight" && brett_steps == "sarcastic":Grandpa|Brennan}.
    ~ wes += 1
* {sloane >= 2} [Partner with Sloane. #go]
    ~ partner = "sloane"
    @show sloane neutral center
    SLOANE(smirk): Bold. Fine. But we're doing it my way, and my way involves you not embarrassing me.
    ~ sloane += 1
    ~ rep_popular += 1
* {teddy < 0 && cal < 1 && wes < 1 && sloane < 2} [(Wait to see who's left.) #silent]
    ~ partner = "cal"
    Everybody pairs off around you like a dance you didn't know the steps to. Ms. Whitcomb puts you with the only other person still sitting alone: Cal Ashgrove, who looks at you like a specimen.
    @show cal neutral center
    CAL(neutral): Leftovers. How appropriate. Derry's built on them.
- {partner != "teddy" && teddy >= 0:
    Across the room, Teddy ends up with Kimberly, who is already explaining that she doesn't do "the writing part." Teddy catches your eye and gives you a thumbs-up that doesn't reach her face.
    ~ teddy -= 1
}
@hide all
-> ch4_friday

// ------------------------------------------------------------
=== ch4_friday ===
@date Friday, September 20
@ctx Friday night plans. Gus can go to Sloane's party at the Ashgrove house (if invited), see a movie at the Aladdin with Teddy, or stay home with Mom.
{sloane >= 2 || lunch == "sloane":
    On Thursday, an envelope appears in locker 227, cream paper, heavy. Inside, in handwriting so perfect it looks typed: *Friday. Eight. Don't bring anybody. — S.A.*
}
{teddy >= 1:
    Teddy calls Thursday night. "Aladdin. Friday. *Terminator 2* is back for a week. I've seen it four times. Linda Hamilton's arms are a religious experience."
}
And your mother, at breakfast, says she has Friday off for the first time in three weeks, and do you want to do something, or are you too cool, it's fine if you're too cool.
* {sloane >= 2 || lunch == "sloane"} [Go to Sloane's party. #go]
    ~ friday = "party"
    -> ch4_party
* {teddy >= 1} [Go to the movies with Teddy. #friendly]
    ~ friday = "movie"
    -> ch4_movie
* [Stay home with Mom. #kind]
    ~ friday = "mom"
    -> ch4_mom

// ------------------------------------------------------------
=== ch4_party ===
@bg ashgrove night
@amb house
@music stop 2
@ctx A party at the Ashgrove family's grand old house on a Friday night. Sloane invited Gus. Their mother Constance runs the Lantern Society.
The Ashgrove house is on West Broadway, where the houses are big enough to have names. It's all dark wood and oil paintings of men with beards like hedges. Somebody has a boombox playing C+C Music Factory at a volume the house clearly resents.
In the front hall, in a glass case lit from inside like a reliquary, there's an old brass ship's lantern with panes of thick green glass. A little engraved plaque: THE KEEPER'S LAMP · DERRY LANTERN SOCIETY · 1881.
@show sloane neutral center
SLOANE(neutral): You came. Alone. Good. Don't touch anything that looks old, which is everything.
SLOANE(smirk): Brett's here. Avoid him. He's had three wine coolers and he thinks he's Tom Cruise.
@hide sloane
@show constance smile center
A woman glides across the hall toward you: honey-blonde hair in a French twist, pearls, a camel coat she hasn't taken off as if she might need to leave at any moment. A little brass lantern on her lapel.
CONSTANCE(smile): You must be Yvette's granddaughter. I'm Constance Ashgrove. Sloane's told me — well, Sloane tells me nothing. I've *inferred.*
She takes your chin in her cool fingers and tilts your face to the light.
CONSTANCE(thinking): You look just like— well. You look like a Thibodeau. How is your grandmother?
* ["She's okay. Some days are better than others." #honest]
    CONSTANCE(sad): Of course. Please tell her Constance asked after her. And tell her the Float will be beautiful this year. She'll know what I mean.
* ["She talks about the Lantern Society a lot." #probe]
    CONSTANCE(neutral): Does she.
    CONSTANCE(smile): We miss her terribly. She was the best of us. Some people just... get tired. You'll understand someday.
    ~ suspicion += 1
* ["Is that the real lamp? In the case?" #ask]
    CONSTANCE(smile): The Keeper's Lamp. Off a schooner that went down in the bay in 1880. The Society's very first members found it on the shore after the Starving Winter.
    CONSTANCE(flat): It's very old and very fragile. We take it out once a year, for the Float. Otherwise no one touches it.
- @hide constance
@ctx At Sloane's party. Gus can look for Cal upstairs or find Sloane, who has slipped away.
The party goes the way parties go. Somebody cries in the bathroom. Somebody throws up in a fern. Brett Lindqvist does a keg stand that involves no keg, just a bottle of Boone's Farm and a great deal of confidence.
{cal >= 2:
    -> cal_study
- else:
    -> porch
}

= cal_study
@ctx Upstairs at the party, Cal pulls Gus into his mother's study to show her the Lantern Society's minutes book.
At the top of the stairs, a hand closes on your sleeve and pulls you into a dark room. Cal. He puts a finger to his lips and turns on a green-shaded desk lamp.
@show cal neutral center
CAL(neutral): My mother's study. You wanted to know about the Lamp. You should see this before you decide whether to keep wanting to.
On the desk: a manual typewriter, an Olympia, and a ledger bound in maroon leather stamped with a little gold lantern. Cal opens it.
Each page is a year. Each year is typed, a list of Float committees and bake sale totals and wreath orders. And at the bottom of every October, alone on its own line:
\*Kept.*
And after it, a name — blacked out with ink so thick it's dented the paper.
CAL(flat): Every year since 1881. Every one.
He turns to 1982. Same line. *Kept.* The black bar. And then, typed after it in parentheses:
\*(Y.T. abstained.)*
CAL(thinking): Y.T. Yvette Thibodeau. The only abstention in a hundred and ten years.
~ saw_minutes = true
~ clue(minutes_1982)
* [Look closer at the typing. #look]
    Every lowercase *e* on the page has a little bite out of it — a chip in the typewriter key, so each one looks like a *c* that's trying. Abstaincd. Kcpt.
    ~ clue(broken_e)
* ["What does 'kept' mean, Cal?" #ask]
    CAL(neutral): I don't know.
    CAL(flat): That's a lie. I don't know *for certain.* I have a theory. You won't like it.
* [(Get out of here before somebody comes.) #leave]
    You step back toward the door. Cal doesn't move.
    CAL(flat): Go if you want. I've been reading this book since I was nine. I'm not scared of it anymore. I'm scared of what's under it.
- @show sloane angry right
The door opens. Sloane, backlit in the hall, her face white.
SLOANE(angry): Get out of her study. Both of you. *Now.*
{sloane >= 3:
    Footsteps on the stairs. Sloane hears them before you do. She steps into the room, shuts the door to a crack, and says, loud and bored, "—and *this* is the room where my mother keeps her collection of ugly lamps, isn't that tragic," and keeps talking until the footsteps go back down.
    SLOANE(flat): You owe me. Both of you. Forever.
    ~ sloane += 1
    @remember sloane She covered for you.
- else:
    SLOANE(flat): I invited you. Not to this. Go home, Gus.
    ~ sloane -= 1
}
@hide all
-> ch4_interview

= porch
@ctx At Sloane's party, Gus finds Sloane alone on the back porch, away from everyone.
You find Sloane alone on the back porch with her shoes off, holding a wine cooler she isn't drinking.
@show sloane sad center
SLOANE(flat): Don't. I'm not crying. It's allergies. I'm allergic to my friends.
* [(Sit down next to her.) #kind]
    You sit down on the step. She doesn't tell you to go away, which for Sloane is practically a hug.
    ~ sloane += 1
* ["Your friends are pretty awful." #blunt]
    SLOANE(smirk): Yes. That's why they're my friends. I can't be friends with nice people. Nice people expect things.
    ~ sloane += 1
* ["Want me to go?" #shy]
    SLOANE(neutral): ...No. Sit. You're the only person here who doesn't want something from me.
- SLOANE(thinking): Do you ever feel like your whole life is already written down somewhere, and you're just reading it out loud?
SLOANE(sad): When I turn sixteen, my mother gives me a pin. Like hers. Like your grandmother's. It's tradition.
SLOANE(flat): I don't want the pin.
* ["Then don't take it." #blunt]
    SLOANE(smirk): You say that like it's a thing people get to do. In Derry.
    ~ sloane += 1
* ["What does the pin mean?" #probe]
    SLOANE(afraid): ...
    SLOANE(flat): It means you're *responsible.* That's what she says. That you're responsible for the town.
    ~ sloane += 1
    ~ clue(society_pins)
* [(Take her hand.) #flirt]
    You take the hand that isn't holding the wine cooler. She looks at your hands like they're a math problem. She doesn't let go.
    SLOANE(blush): This doesn't mean anything.
    GUS: Okay.
    SLOANE(neutral): ...Okay.
    ~ sloane += 1
    ~ sloane_spark += 2
    @remember sloane You held her hand on the porch.
- @hide sloane
-> ch4_interview

// ------------------------------------------------------------
=== ch4_movie ===
@bg theater night
@amb town
@music town
@ctx Friday night at the Aladdin movie theater downtown with Teddy (and maybe Wes). Fun, warm teenage night.
The Aladdin's marquee blazes with four hundred bulbs, and two of them are out, so it says NOW SHOW NG · 7 & 9. Inside it smells like butter and carpet and the 1940s.
@show teddy grin left
{wes >= 2:
    Wes is leaning against the poster case when you get there, hands in his flannel pockets, pretending he's just standing there by coincidence.
    @show wes flat right
    WES(flat): Teddy said you guys were coming. I was gonna be here anyway. I like movies. Shut up.
    TEDDY(grin): He's been here since six-fifteen.
    WES(angry): Teddy.
}
TEDDY(laugh): Okay. Rules. No talking during the Linda Hamilton pull-ups. That's sacred.
You sit in the balcony with your feet on the rail. The movie is loud and stupid and perfect. When the liquid-metal man walks out of the fire, Teddy grabs your arm so hard you have bruises the next day.
{wes >= 2:
    -> armrest
}
-> hill

= armrest
@ctx At the movie theater. Wes is sitting next to Gus in the dark.
In the dark, Wes's arm is on the armrest between you. Yours is too. Neither of you moves for the entire second act.
* [Leave your arm where it is. #flirt]
    You leave it. He leaves his. When the credits roll and the lights come up, he looks at you sideways, and for once he isn't hiding anything at all.
    ~ wes_spark += 2
    ~ wes += 1
    @remember wes The armrest. The whole second act.
* [Move your arm. #shy]
    You move your arm to get popcorn and don't put it back. He doesn't notice. Or he does and doesn't say. With Wes it's hard to tell.
- -> hill

= hill
@hide all
@bg standpipe night
@amb hill
@music mystery
@ctx Walking home from the movies through Memorial Park, Gus and Teddy see adults with flashlights at the Standpipe ruin at night.
You walk home the long way, through Memorial Park, because Teddy wants to see the stars from the hill. Halfway up, she grabs your sleeve.
@show teddy afraid left
TEDDY(afraid): Gus. Lights.
Up at the Standpipe, flashlights. Three, four of them, moving slowly around the stone ring. Adults. One of them is in a police uniform. One has a bow tie.
They're walking the ring like they're pacing out a garden. One of them is holding a tape measure.
TEDDY(worried): Are they... *measuring* it?
{wes >= 2:
    @show wes worried right
    WES(neutral): That's one of my places. On the map. The Standpipe.
    WES(flat): Feels wrong all the time. Tonight it feels like it's... waiting.
}
* [Get closer. Find out what they're doing. #confront]
    You creep up through the long grass, close enough to hear voices. A man laughing. A woman's voice, cool and precise: "—the twelfth, then. The usual arrangements." The beam of a flashlight sweeps toward you and you drop flat.
    You lie in the wet grass with your heart hammering until they leave.
    ~ suspicion += 1
* [Pull Teddy back down the hill. #leave]
    You pull her back down the path. She doesn't argue. Neither of you says anything until you're under the streetlights on Witham Street.
    TEDDY(flat): That was Principal Fenwick. With the bow tie. On a Friday night. With a tape measure.
    GUS: Yeah.
    TEDDY(worried): That's normal, right? That's a normal thing for a principal?
- @hide all
-> ch4_interview

// ------------------------------------------------------------
=== ch4_mom ===
@bg living evening
@amb house
@music warm
@ctx A rare Friday night at home with Mom, watching TV. Mom notices Gus's cassette recorder.
Your mother makes Jiffy Pop, which she burns, and Kraft dinner, which she doesn't, and you watch a *Twin Peaks* rerun on the couch with the plastic slipcover squeaking every time either of you moves.
@show mom smile left
MOM(smile): I loved this show. Nobody in this town could stand it. Too close to home, I think.
She picks up your recorder from the coffee table and turns it over in her hands.
MOM(thinking): Where did you get this?
GUS: Dad gave it to me. For my seventh birthday.
MOM(flat): Danny never gave you that. Danny thinks anything that costs less than four hundred dollars is "consumer garbage." He'd never buy you a — this is a Realistic. From Radio Shack. He'd rather die.
GUS: Then where'd it come from?
MOM(neutral): It came from...
She stops. She keeps turning it over. Her face goes slowly blank, like a window fogging.
@ctx Mom is trying to remember where Gus's recorder came from and has gone blank. Her nose has started to bleed.
MOM(worried): It came from — huh. I don't—
A thin line of blood runs out of her left nostril, over her lip.
* [(Grab a tissue. Take the recorder back.) #kind]
    You get her a tissue and take the recorder out of her hands, gently, like taking scissors from a kid. She tips her head back.
    MOM(sad): Dry air. This whole house is dry air. I'm getting a humidifier. I'm getting six.
    ~ mom += 1
* ["Mom. Who's June?" #probe]
    MOM(afraid): ...
    For one second, something moves behind her eyes. Something big, like a fish under ice.
    MOM(cry): I don't — why would you—
    Then her nose is really bleeding, and she's up and in the kitchen with her head over the sink, and she won't let you help, and she won't let you ask again.
    ~ clue(mom_patch)
* ["Forget it. It doesn't matter." #deflect]
    MOM(neutral): ...No, it — yeah. It doesn't matter. God, I'm tired.
    She wipes her nose with the back of her hand and looks at the blood on it like it belongs to someone else.
- @hide mom
Later she falls asleep on the couch before the episode ends. You put the afghan over her. As you're turning off the TV, she murmurs, without opening her eyes:
MOM: Junie, did you lock the back door?
THINK(afraid): You stand there in the blue light for a long time.
-> ch4_interview

// ------------------------------------------------------------
=== ch4_interview ===
@hide all
@date Wednesday, September 25 · Derry Voices
@ctx Gus and her project partner are choosing someone to interview about Derry's history for the oral history project.
{partner:
- "teddy": Teddy has a clipboard. Teddy has a *list.* "We need somebody old, somebody who talks, and somebody who isn't going to call my mom."
- "cal": Cal has already scheduled three interviews without asking you and canceled two of them because "they were lying in uninteresting ways."
- "wes": Wes says you pick. "I don't know anybody. Everybody here looks at me like I'm gonna steal their hubcaps."
- "sloane": Sloane says she'll go anywhere "as long as it's not somewhere with a smell."
}
* [Interview Mémère. #kind]
    ~ interview = "memere"
    -> int_memere
* [Interview Dot at the diner. #friendly]
    ~ interview = "dot"
    -> int_dot
* {partner == "cal" || heard_radio} [Interview Mr. Teague, the night janitor. #probe]
    ~ interview = "teague"
    -> int_teague
* {partner == "cal" || partner == "sloane"} [Interview Mrs. Ashgrove. #ask]
    ~ interview = "constance"
    -> int_constance

// ------------------------------------------------------------
=== int_memere ===
@bg living evening
@amb house
@music larch
@ctx Gus records an oral-history interview with Mémère in the living room. Mémère tells Derry's founding legend, the Starving Winter.
You set the recorder on the arm of Mémère's chair. She eyes it like a cat eyes a vacuum cleaner.
@show memere neutral center
MEMERE(smirk): I'm going to be on the radio?
GUS: It's for school. Just tell us about Derry. Anything.
@sfx record_start
MEMERE(thinking): Derry. Hm.
MEMERE(neutral): My grandmother told me about the Starving Winter. Eighteen-eighty. The snow came in October and didn't stop. The river froze to the bottom. The deer went away. People ate their boots. They ate the bark off the trees.
MEMERE(sad): And on the worst night, a girl took a lantern and walked out into the snow. Nobody knows where she went. In the morning, the deer came back, and the river cracked open, and the town lived.
MEMERE(flat): And they never said her name again. Not once. Because that was the price.
~ clue(starving_winter)
~ tape(tape_memere_story)
* ["Who was she?" #ask]
    MEMERE(neutral): Nobody knows. That's the point, ma belle. If you knew her name, you'd have to remember her.
* ["That's a terrible story." #blunt]
    MEMERE(smirk): All the good ones are. Children's stories are just terrible stories with the endings sanded off.
* ["Do you believe it?" #probe]
    MEMERE(flat): I believe the deer came back.
    ~ mem += 1
- MEMERE(worried): Turn that off now.
@sfx tape_stop
{partner == "teddy":
    @show teddy worried right
    TEDDY(worried): That's — Mrs. Thibodeau, that's an amazing story. That's like a myth. That's like *Persephone.*
    MEMERE(flat): Who is this loud girl?
    TEDDY(smile): Teddy, ma'am.
    MEMERE(smile): Bon. I like her.
}
@hide all
-> ch4_dad

// ------------------------------------------------------------
=== int_dot ===
@bg diner afternoon
@amb diner
@music town
@ctx Gus records an oral-history interview with Dot at her diner about the Lantern Float and the Lantern Society.
@show dot grin center
DOT(grin): Oh, put me on tape! Nobody ever wants to put me on tape. Do I look all right? Never mind, it's tape.
@sfx record_start
DOT(smile): The Float? Oh, I've been to every one since I was a little girl. All those lights on the water. It's for the ones we lost — the Ironworks children, the flood folks, everybody. You write a name on your lantern and let it go.
DOT(neutral): And the Lantern ladies — oh, they're so good. When somebody loses somebody, the Society's there the next morning. Casseroles. Flowers. They clean the house. They take care of *everything,* so the family doesn't have to look at it all.
DOT(sad): Take the things away. So it doesn't hurt.
~ clue(casseroles)
~ tape(tape_dot)
* ["Have they ever helped you?" #ask]
    DOT(thinking): Me? No. I never lost anybody. Just Lou, and that was the heart, and that was expected.
    DOT(sad): But I've got their casserole dish. A big Corning Ware one, with the blue flowers. Been in my cupboard since 1971. I keep meaning to give it back. Isn't that funny? I don't know why they gave it to me.
* ["Whose name do you write on your lantern?" #probe]
    DOT(sad): ...You know, I never know what to write. I just hold the pen. Every year. And then I write "for the children" and let it go.
- @hide dot
-> ch4_dad

// ------------------------------------------------------------
=== int_teague ===
@bg boiler dim
@amb boiler
@music mystery
@ctx Gus interviews Mr. Teague, the school's 68-year-old night janitor, in the boiler room. He shows her a wall covered with names of people the town forgot.
Mr. Teague starts his shift at three. He's in the boiler room under the gym, where it's ninety degrees and smells like oil and pipe tobacco, sitting in a busted armchair with a chessboard on a milk crate.
@show teague flat center
TEAGUE(flat): Nothin' to tell. Born here. Gonna die here. That's my oral history. Ayuh.
{partner == "cal":
    @show cal neutral right
    CAL(neutral): Mr. Teague. Tell her about the wall.
    TEAGUE(angry): Calvin.
    CAL(flat): She's heard the names. On the radio. She heard Rose.
}
@ctx Mr. Teague, the gruff old janitor, is refusing to talk. Gus heard the name "Rose Teague" read on the radio at 3 a.m.
* {heard_radio} ["Mr. Teague, who's Rose Teague?" #probe]
    The old man goes completely still. His pipe stops halfway to his mouth.
    TEAGUE(afraid): Where'd you hear that name.
    GUS: On the radio. At three in the morning. A voice reading names.
* ["Please. It's important." #honest]
    TEAGUE(flat): Everything's important at fourteen.
    TEAGUE(neutral): ...Ayuh. All right.
- He stands up, slow, his knees cracking like kindling. He takes a flashlight from a hook and walks to the back of the boiler room, past the big riveted boiler, to the brick wall in the corner.
He shines the light on it.
@bg boiler dim wall slow
@music sad
The wall is covered in names.
Top to bottom, in black grease pencil, in neat old-man capitals. One name, one year, line after line, column after column. Some of them have been traced over so many times the letters stand up off the brick like scars.
ROSE TEAGUE 1961. DANIEL CARRIER 1971. TOBY MERCER 1986. PETER DUNN 1990.
And there, in the third column, at the height of your eyes:
JUNE BRENNAN 1982.
~ knows_wall = true
~ clue(the_wall)
@cg off
TEAGUE(sad): I trace 'em every night. Every one. If you stop, they fade. Off the wall and out of your head both.
TEAGUE(flat): Rose was my girl. Nine years old. I'm the only one alive who remembers she was ever born.
He looks at you, then at the wall, then at you again. His face changes.
TEAGUE(afraid): Brennan.
TEAGUE(sad): Oh, deah. You're her sister.
GUS: I don't have a sister.
TEAGUE(flat): No. 'Course not. Nobody does. That's how it goes.
@ctx Mr. Teague has shown Gus the wall of forgotten names, including JUNE BRENNAN 1982, and told her she had a sister. He's about to warn her.
* ["What happened to them?" #ask]
    TEAGUE(flat): Quiet Night happened. Second Saturday of October. There's a light, up on the hill. Whoever goes to it, don't come back. And by morning, nobody remembers they was ever here.
    -> cost
* ["Did you try to stop it?" #probe]
    -> cost
* [(Touch the name. JUNE BRENNAN.) #action]
    You put your fingers on the letters. The grease pencil is waxy and thick, traced over hundreds of times. You don't remember her. You don't remember anything. But your eyes are stinging, and you don't know why.
    ~ teague += 1
    -> cost

= cost
TEAGUE(sad): I tried once. Sixty-one. Followed my Rosie out in the dark. She was walking to that light like somebody was calling her for supper. I grabbed her and I pulled her back. Pulled her right out of it.
TEAGUE(flat): And my wife Margaret, who'd come out after the both of us — the light took her instead. Just like that. Like it didn't care which.
TEAGUE(cry): And an hour later, Rosie walked back out to it on her own while I was holding her mother's coat. And it took her too.
TEAGUE(flat): It always gets fed, girl. Always. You pull one out, it takes whoever's closest. You remember that.
~ knows_cost = true
~ clue(teague_cost)
~ teague += 1
{partner == "cal":
    Cal is writing it all down, very fast, his hand shaking.
}
@hide all
-> ch4_dad

// ------------------------------------------------------------
=== int_constance ===
@bg ashgrove night
@amb house
@music tension
@ctx Gus interviews Constance Ashgrove, president of the Lantern Society, at her home for the oral history project. She is gracious and probing.
Mrs. Ashgrove receives you in the front parlor with tea in cups so thin you can see your fingers through them. The green lamp glows in its case behind her like a third person in the room.
@show constance smile center
CONSTANCE(smile): Derry Voices. What a lovely idea. Ms. Whitcomb was always a bright girl. A little — emotional. But bright.
@sfx record_start
CONSTANCE(neutral): The Lantern Society was founded in 1881, after the Starving Winter, to care for families who had lost loved ones. We still do. Grief is a community's work, not a family's. We carry it so they don't have to.
CONSTANCE(smile): The Float. The Christmas wreaths. The casserole committee — that's what the men call it, they think they're very funny.
~ tape(tape_constance)
@ctx Mrs. Ashgrove is answering Gus's interview questions about the Lantern Society and watching her carefully.
* ["What happens on Quiet Night?" #probe]
    CONSTANCE(flat): People rest.
    CONSTANCE(smile): It's an old custom, dear. An early night after the Float. Derry is a town that knows the value of rest.
    She looks at you over her cup for a long moment.
    CONSTANCE(neutral): Your grandmother used to ask that question. Before she stopped asking questions.
    ~ suspicion += 2
* ["Why did my grandmother quit?" #ask]
    CONSTANCE(sad): Yvette was tired. Some of us carry more than others. In 1982 she put her burden down. We didn't blame her.
    CONSTANCE(neutral): Not *publicly.*
    ~ suspicion += 1
* ["It sounds like beautiful work." #manipulate]
    CONSTANCE(smile): It is. Thank you, Augusta. Not many young people see it that way. Perhaps you'll join us someday. The Society always needs young hands.
    ~ suspicion -= 1
- CONSTANCE(smile): Here. For your project.
She hands you a typed sheet: *A Brief History of the Derry Lantern Society.* On the back of your hand, as you take it, her fingers are cold as the teacup.
{saw_minutes:
    Every lowercase *e* on the page has a little bite out of it. The same chipped key as the minutes book.
- else:
    Every lowercase *e* on the page has a little bite out of it, a chip in the typewriter key, so each one looks like a *c* that's trying.
}
~ clue(broken_e)
@hide all
-> ch4_dad

// ------------------------------------------------------------
=== ch4_dad ===
@bg kitchen night
@amb house
@music stop 3
@date Sunday, September 29 · 2:13 a.m.
@ctx 2 a.m. Gus's father calls unexpectedly from Boston, upset and crying from a dream he can't explain.
@sfx phone_ring
The phone rings at 2:13 in the morning. You get to it before it wakes anybody, sliding across the linoleum in your socks.
PHONE(dad): Gussie? Oh — thank god. Sorry. Sorry, kiddo, I know what time it is.
His voice is thick. He's been crying. Your father doesn't cry. He didn't cry at the divorce, or at Grandpa Brennan's funeral, or at the end of *E.T.*
PHONE(dad): I had the weirdest dream. You were little, and you were standing in the yard at the old house on Corson Street, and there was a girl with you. Holding your hand. And she—
PHONE(dad): I don't know why I'm crying. Is everybody okay? Is everybody there?
* ["We're okay, Dad. Everybody's here." #kind]
    PHONE(dad): Okay. Okay. Good.
    PHONE(dad): Tell your sister I—
    He stops.
* ["What girl? What did she look like?" #probe]
    PHONE(dad): Dark hair. Bangs. A yellow sweater. She was laughing at me. Like she knew something.
    PHONE(dad): Tell your sister I—
    He stops.
- PHONE(dad): Tell your... what was I saying?
GUS: Dad. I don't have a sister.
PHONE(dad): No. No, I know. God. I'm so tired, Gus. Trish says I'm working too much. I'm sorry I woke you. I love you. Go back to bed.
@sfx phone_hangup
~ clue(dad_call)
The dial tone hums in your hand for a long time before you put it back.
-> ch4_attic

// ------------------------------------------------------------
=== ch4_attic ===
@bg hall_up night
@amb house
@music mystery
@date Tuesday, October 1
@ctx Gus finds the key to the padlocked attic and goes up while Mémère sleeps.
The attic hatch in the upstairs hall has a padlock on it. It always has. Mom says Mémère put it there in the eighties, "so the squirrels won't get ideas."
{evening3 == "memere":
    You know where the key is. You saw it Saturday night, in Mémère's sewing basket under the Kaiser cards: a little brass key on a faded blue ribbon, hidden in the hem of a maroon sash.
- else:
    You find the key by accident, helping Mémère look for her reading glasses. It's in her sewing basket, sewn into the hem of a maroon sash with a little brass lantern pinned on it. She watches you find it and doesn't say a word.
}
~ has_key = true
At 11 p.m., with your mother on shift and your grandmother snoring, you pull down the ladder.
@bg attic flashlight
@amb attic
@weather dust
The attic smells like mothballs and hot dust and a hundred summers. Your flashlight finds boxes labeled NOËL and CLAIRE — SCHOOL and HENRI — TAXES. A dress form with no head. A rocking horse with one glass eye.
Under the eaves, at the very back, one board in the wall is loose. Behind it, a cardboard box. On the lid, in your grandmother's careful old-lady handwriting:
NE PAS JETER.
Do not throw away.
* [Open it. #action]
    -> box
* [Wait. Breathe first. #silent]
    You sit down on the dusty floor with the box in your lap and breathe, because you know — you already know — that when you open it something will be different forever.
    -> box

= box
@music june
Inside, on top: a Polaroid.
@cg cg_polaroid
A teenage girl in a yellow sweater stands in front of this house, the green one, holding a little girl on her hip. Summer. The little girl is maybe four, scowling at the camera in a striped shirt, one shoe untied.
The little girl is you.
The teenager's face has faded almost entirely to white, as if the light got into the film only there. All that's left is the shape of her smile.
On the white border, in marker: *Me + Gussie, July '81.*
~ clue(june_photo)
@cg off
Under the photo: a Derry High student ID, 1982–83, the picture bleached to nothing. JUNE MARIE BRENNAN. GRADE 9.
A notebook with a lightning bolt drawn on the cover.
And five cassette tapes, labeled in round, bossy handwriting. QUIET NIGHT RESEARCH \#1. \#2. \#3. \#4. And one that says GUSSIE'S BEDTIME SONGS — DO NOT TAPE OVER (THIS MEANS YOU).
~ clue(june_id)
~ clue(june_tapes)
~ knows_june = true
@ctx In the attic, Gus has found a box of her forgotten sister June's things: a faded Polaroid, an ID card, a notebook, and cassette tapes.
* [Play the bedtime tape. #record]
    -> bedtime
* [Read the notebook first. #look]
    -> notebook

= notebook
The notebook is June's. Lists, mostly. Names and years, with question marks.
\*1961 — Rose Teague (ask Mr. T!!) · 1971 — Daniel Carrier (Dot's?) · 1979 — ??? · The Lamp. The Standpipe. Lantern ladies = Mémère?????*
On the last page, the writing gets fast and slanted:
\*If anything happens: Gussie. Tape \#5. Don't let them*
And then the page is torn out.
There is no tape \#5 in the box.
~ clue(june_notes)
-> bedtime

= bedtime
You put the bedtime tape in your recorder. Your hands are shaking so badly it takes three tries.
@sfx tape_play
TAPE(june): Okay, Gussie. This is for when I'm at sleepover camp and you can't sleep. You have to promise not to tape over it. Promise. Okay. Pinky promise. Good.
TAPE(june): Mémère's song. Ready?
TAPE(june): *À la claire fontaine, m'en allant promener...*
And you know the voice. You know it the way you know the song. It's the voice under the hiss at the town sign. It's the voice that's been in your head your whole life, humming, in waiting rooms and on buses, when you were scared.
TAPE(june): *...il y a longtemps que je t'aime, jamais je ne t'oublierai.*
TAPE(june): That means I'll never forget you. Not ever. Not even when you're a big stinky teenager and you think I'm lame.
TAPE(june): Night, Gus-Gus.
@sfx tape_stop
~ tape(tape_june_bedtime)
@ctx Gus has just heard her forgotten sister June's voice singing her a bedtime song on an old tape, and realizes she had a sister.
* [(Cry.) #honest]
    You cry. Not pretty. The ugly, shaking, silent kind, with your fist against your mouth so nobody downstairs will hear. You cry for somebody you don't remember, and it doesn't matter that you don't remember, it turns out. Your body does.
* [(Play it again.) #record]
    You rewind it and play it again. And again. Until you can sing along. Until it's not her voice and your voice anymore, just the song.
* [(Sit very still. Don't feel it yet.) #silent]
    You don't cry. You sit in the dust with the tape in your hand and the flashlight pointing at nothing, and you feel it arrive inside you like a train, very far away, and you decide you'll be somewhere else when it gets here.
- THINK: Her name was June. June Marie Brennan. She was my sister.
THINK(sad): And nobody remembers her. Not Mom. Not Dad. Not me.
* [Play research tape \#3. #record]
    @sfx tape_play
    TAPE(june): This is June Brennan, Derry High School, class of 1986, and this is Research Tape Number Three. October fifth, nineteen eighty-two.
    TAPE(june): Paige says I'm obsessed. Paige can kiss my entire butt. Here's what I know.
    TAPE(june): One: every year on the second Saturday in October, the grown-ups go to sleep. Two: every year, somebody goes missing, and nobody notices. Not even their family.
    TAPE(june): Three: Mémère's been crying in the bathroom with the water running, which she thinks I can't hear. Four: the lantern ladies have a list. I've seen it. And Nate says—
    @sfx static_burst
    The rest is hiss.
    ~ tape(tape_june_research)
* [Put everything back in the box. #action]
    You put it all back. The photo on top. The lid. The board. You take the bedtime tape with you, in your pocket, against your leg, where you can feel it.
- @weather none
@cg off
@hide all
-> ch4_tell

// ------------------------------------------------------------
=== ch4_tell ===
@bg school_hall day
@amb school
@music stop 2
@date Thursday, October 3
@ctx Two days after finding June's things, Gus decides who, if anyone, to tell about her forgotten sister.
For two days you carry it around like a stone in your shoe. In class. At lunch. In the shower. *Her name was June.*
You have to tell somebody. Or you have to never tell anybody. You can't decide which is worse.
* {mom >= 0} [Tell Mom. #honest]
    ~ told_mom = true
    -> tell_mom
* {teddy >= 1} [Tell Teddy. #honest]
    ~ told_teddy = true
    -> tell_teddy
* {cal >= 1} [Tell Cal. #honest]
    ~ told_cal = true
    -> tell_cal
* {wes >= 2} [Tell Wes. #honest]
    ~ told_wes = true
    -> tell_wes
* {sloane >= 2} [Tell Sloane. #honest]
    ~ told_sloane = true
    -> tell_sloane
* {whitcomb >= 1 || Clues ? library_photo} [Tell Ms. Whitcomb. #honest]
    ~ told_whitcomb = true
    -> tell_whitcomb
* [Tell nobody. #silent]
    -> tell_nobody

= tell_mom
@bg kitchen evening
@amb house
@show mom neutral left
@ctx Gus shows her mom the faded Polaroid and tells her she had a daughter named June. Mom can't hold the memory.
You put the Polaroid on the kitchen table in front of her, next to her coffee.
GUS: Mom. Her name was June. She was my sister. Your daughter.
MOM(neutral): ...
MOM(thinking): Who is this? Is this you? Where did you—
She picks it up. She looks at the white blur where the girl's face should be. Her hands start to shake.
MOM(afraid): No. No, I — I only have — there's only you, I only ever—
The blood comes fast this time, from both nostrils, down over her mouth, onto the photo, and she doesn't seem to notice.
MOM(angry): Why are you doing this? Why would you make something like this up? Is this about your father? Is this about the move?
MOM(cry): Stop it. Gus. Please. Stop it.
* [(Take the photo back. Hold her.) #kind]
    You take the photo back and put your arms around her, and she lets you, shaking, bleeding onto your shoulder.
    ~ mom += 1
* ["She sang you to sleep, Mom. You have to remember." #confront]
    MOM(cry): I don't have to do anything! Get out. Go to your room. *Go.*
    ~ mom -= 2
- In the morning, she's in the kitchen in her scrubs, humming, making toast.
MOM(smile): Morning, kiddo! You were up late. Everything okay?
She doesn't remember. Any of it. There's a brown stain on the tablecloth where her coffee was, and she frowns at it, and wipes at it, and doesn't know where it came from.
@remember mom She won't remember. But something in her will.
@hide mom
-> ch4_note

= tell_teddy
@bg cafeteria day
@show teddy neutral center
@ctx Gus tells Teddy about finding June, her forgotten sister. Teddy believes her.
You tell Teddy at lunch, in the corner by the tray return where it's too loud for anyone to hear. All of it. The attic. The photo. The tape. *Night, Gus-Gus.*
Teddy listens without interrupting once, which you didn't know she could do.
TEDDY(sad): Okay.
TEDDY(neutral): Okay. So. Two things. One: I believe you. Obviously. I have a tape of a ghost reading the phone book, I'm not in a position to judge.
TEDDY(worried): Two: we have to find out what happened to her. And we have to find out before October twelfth. Because that's the night, Gus. Isn't it. That's the night.
~ teddy += 2
@remember teddy You trusted her with June.
@hide teddy
-> ch4_note

= tell_cal
@bg library day
@show cal neutral center
@ctx Gus tells Cal Ashgrove about her forgotten sister June. Cal believes her instantly and shares his own secret.
You tell Cal in the library. He doesn't write anything down. That's how you know he believes you.
CAL(sad): I knew a Toby. Toby Mercer. He lived on my street. We were eight. He was my best friend.
CAL(neutral): Quiet Night, 1986, he snuck out to look for his dog. I followed him. I saw him walk into the light up on the hill.
He opens the Derry Book to a page near the back. It's covered in a single name, written over and over, in pencil, in ink, in crayon, hundreds of times, one line for every day.
CAL(flat): I write it every morning. If I skip a day, I start to forget his face. I skipped three days once, when I had the flu. I had to look at a photo to remember he had freckles.
CAL(neutral): Your sister was kept, Gus. Like Toby. And everybody let it happen. My mother. Your grandmother. All of them.
~ cal += 2
@remember cal You told him about June. He told you about Toby.
@hide cal
-> ch4_note

= tell_wes
@bg barrens dusk
@show wes neutral center
@ctx Gus tells Wes about her forgotten sister June, by the stream in the Barrens.
You tell Wes by the stream while the Admiral eats sardines out of the can. He listens the way he draws, completely.
WES(neutral): I believe you.
GUS: Just like that?
WES(flat): I've lived in nine houses. You learn to see the stuff people pretend isn't there. The dad who drinks. The empty room nobody goes in.
WES(worried): Derry's like that. The whole town. It's got an empty room nobody goes in.
WES(sad): I'm sorry, Gus. About your sister. I'd — I'd want to know. If I had one.
~ wes += 2
~ wes_spark += 1
@remember wes You told him about June.
@hide wes
-> ch4_note

= tell_sloane
@bg school_hall day
@show sloane flat center
@ctx Gus tells Sloane Ashgrove about her forgotten sister. Sloane scoffs, then warns her.
You tell Sloane at the lockers, because she's there, and because some stubborn part of you wants to see her face when you say it.
SLOANE(smirk): A secret sister. In the attic. How Brontë.
Then she sees your face. The smirk goes.
SLOANE(afraid): ...
SLOANE(flat): Don't tell anyone else. I mean it, Gus. Don't tell anyone. My mother finds out you're looking, you'll—
She stops.
SLOANE(neutral): Just don't. Okay? Please. I don't say please.
~ sloane += 1
@remember sloane She said please.
@hide sloane
-> ch4_note

= tell_whitcomb
@bg classroom day
@show whitcomb neutral center
@ctx Gus shows Ms. Whitcomb, her English teacher, the photo of June. Ms. Whitcomb was June's best friend in 1982 but doesn't remember her.
You stay after class and put June's ID card on Ms. Whitcomb's desk, and the library printout of the Float photo beside it. *Paige Whitcomb, Nate Fortier, and—*
WHITCOMB(thinking): What's this? Gus, where did you—
She looks at the photo. At the girl in the middle with no face, her arms around a younger Paige with enormous bangs.
WHITCOMB(cry): Oh. Oh, no. Oh, I — I can almost — it's right there, it's right *there*—
She grabs the edge of the desk. Her nose starts to bleed. She doesn't let go of the photo.
WHITCOMB(afraid): Her laugh. She had this laugh, like a goose. She'd snort. She — what was her *name*—
GUS: June.
WHITCOMB(cry): June.
She says it like a word in a language she used to speak.
~ whitcomb += 2
@remember whitcomb She almost remembered June.
@hide whitcomb
-> ch4_note

= tell_nobody
@ctx Gus decides not to tell anyone about June.
You don't tell anybody. You put the bedtime tape in the inside pocket of your jacket, against your ribs, and carry her around with you like that. Your secret. Your sister.
It's the loneliest you've been in your life.
-> ch4_note

// ------------------------------------------------------------
=== ch4_note ===
@hide all
@bg barrens day
@amb creek
@music barrens
@date Monday, October 7
@ctx Wes is happy for once: he got a note from his mother saying she'll meet him at the Standpipe on Saturday night, October 12. Gus suspects something.
Wes finds you after school. He's almost running. You've never seen Wes run toward anything.
@show wes grin center
WES(grin): She's coming. My mom. She's coming to get me.
He's grinning. He looks about ten years old.
{wes >= 2:
    He pulls a folded paper from his flannel pocket and shows you, like it's a winning lottery ticket. Typed:
    \*Wesley — I know where you are now. I'm so sorry for everything. Meet me at the old Standpipe Saturday, October 12, after dark. Come alone. Don't tell the Dunmores. — Mom*
    ~ saw_note = true
    ~ clue(wes_note)
    {Clues ? broken_e:
        Every lowercase *e* has a little bite out of it.
        THINK(afraid): The same chipped *e.* The same typewriter as the Lantern Society's.
    }
- else:
    WES(neutral): She wrote me. It's private. I'm not gonna show you. But it's real. It's her.
}
WES(smile): It was in my locker. Somebody must've — I don't know. Maybe the caseworker. Saturday. The twelfth.
* ["That's amazing, Wes." #kind]
    WES(blush): Yeah. Yeah, it is.
    He folds the note very carefully along its creases and puts it back in his pocket and keeps his hand over it.
    ~ wes += 1
* ["The twelfth is Quiet Night, Wes. Please don't go up there." #honest]
    ~ warned_wes = true
    WES(flat): ...What?
    {wes >= 4 || (told_wes && wes >= 3):
        WES(worried): You mean — the light thing. The stuff you told me.
        WES(sad): Gus, it's my *mom.* You get that, right? Nine houses. She's — I have to.
        WES(neutral): ...I'll be careful. I'll think about it. Okay? That's all I can say.
        ~ wes_promised = true
    - else:
        WES(angry): You don't get to take this from me. You don't. Everybody takes everything. Not this.
        He walks away fast without looking back.
        ~ wes -= 1
    }
* ["Who typed it?" #probe]
    WES(thinking): What do you mean, who typed it? She did.
    GUS: Does your mom have a typewriter? You said she was "not in a position."
    WES(angry): People get typewriters, Gus. People change.
    WES(flat): Why are you being like this?
    ~ warned_wes = true
* [(Say nothing.) #silent]
    You don't say anything. You smile at him and it hurts your face.
- @hide wes
-> ch4_warning

// ------------------------------------------------------------
=== ch4_warning ===
@bg gus_room night
@amb night
@music tension
@date Wednesday, October 9 · 3:00 a.m.
@ctx At 3 a.m., Mémère wakes Gus up. She is completely lucid for once and warns her about Saturday's Quiet Night. Gus can ask her a few questions before the lucidity fades.
You wake up because someone is sitting on the edge of your bed.
@show memere worried center
Mémère. In her nightgown, in the dark, her hair down, which you've never seen. Her eyes are clear. Clearer than you've ever seen them. She looks at you like she knows exactly who you are.
MEMERE(neutral): Augusta. Not Junie. Augusta. Listen to me while I'm here. I don't stay long anymore.
MEMERE(worried): Saturday night, the Quiet comes. You stay inside. You don't open the door. Not for anyone.
MEMERE(afraid): Not even for her.
~ clue(memere_warning)
~ asked_memere = 0
-> questions

= questions
@ctx Mémère is lucid and warning Gus about Quiet Night. Each question Gus asks may be the last before she drifts away.
* [Ask what happens on Quiet Night. #ask]
    MEMERE(flat): The town pays what it owes. Like it has since the Starving Winter. Someone goes to the light. And the town lives another year.
    ~ asked_memere += 1
* [Ask what happened to June. #ask]
    MEMERE(cry): She went out to bring someone home. That's what it does, ma belle. It calls you with the voice of the one you love most.
    MEMERE(sad): And I was there. On the hill. With my pin on. And I watched.
    ~ asked_memere += 1
* [Ask how to stop it. #ask]
    MEMERE(afraid): You don't. Every time someone stops it, it takes more. It's always fed. Always.
    MEMERE(flat): Close your eyes. Hold your breath. Never answer. The children know. The children always know.
    ~ asked_memere += 1
* [Ask who chooses. #ask]
    MEMERE(sad): We do. We did. For thirty-six years I chose. Drifters. Runaways. Boys from the county home. God forgive me, I chose.
    MEMERE(flat): This year they chose a boy. A foster boy. Constance told me at church, like it was the weather.
    ~ knows_wes_target = true
    ~ asked_memere += 1
* [Ask why everyone forgets. #ask]
    MEMERE(sad): Because forgetting is the price of living here. And because it's kinder. You think it's kinder to remember? Look at me.
    ~ asked_memere += 1
- {asked_memere >= 3:
    -> fade
}
-> questions

= fade
MEMERE(thinking): ...
Something leaves her face. Not all at once. Like a tide going out.
MEMERE(smile): Junie? What are you doing up? It's late, ma belle. Go to sleep.
She kisses your forehead, and her lips are cold, and she goes back down the hall to her room, touching the wall the whole way like a woman feeling for a door.
@hide memere
-> ch4_afternoon

// ------------------------------------------------------------
=== ch4_afternoon ===
@bg school_ext afternoon
@amb town
@music mystery
@date Thursday, October 10
@ctx The last free afternoon before Canal Days and Quiet Night. Gus can follow one more lead.
Two days. The leaves have gone from orange to brown and started coming down in earnest, and downtown they're stringing lights across Center Street for Canal Days.
One free afternoon. One more thing you can do before Friday.
* {not knows_wall && (cal >= 2 || heard_radio)} [Go down to the boiler room. Find Mr. Teague. #probe]
    -> aft_teague
* {knows_june && nate >= 1} [Take June's tape to Nate at Low Tide. #record]
    -> aft_nate
* {knows_june && not told_whitcomb} [Show Ms. Whitcomb June's ID. #honest]
    -> aft_whitcomb
* [Find the 1983 yearbook in the school library. #look]
    -> aft_yearbook
* [Spend the afternoon with Mémère. #kind]
    -> aft_memere

= aft_teague
@bg boiler dim
@amb boiler
@show teague flat center
@ctx Gus finds Mr. Teague, the night janitor, in the boiler room to ask about the names.
Mr. Teague is in his armchair with the chessboard. He looks at you for a long time before he says anything.
TEAGUE(flat): You're Calvin's friend. The new one. Brennan.
TEAGUE(sad): Ayuh. I figured you'd come down eventually.
He shows you the wall. JUNE BRENNAN 1982, in the third column, at the height of your eyes. And he tells you about Rose, and about Margaret, and about the light that always gets fed.
TEAGUE(flat): You pull one out, it takes whoever's closest. You remember that, girl.
~ knows_wall = true
~ knows_cost = true
~ clue(the_wall)
~ clue(teague_cost)
@hide teague
-> ch4_end

= aft_nate
@bg records day
@amb records
@show nate smile center
@ctx Gus plays June's bedtime tape for Nate Fortier, June's boyfriend in 1982, who doesn't remember her.
NATE(smile): Hey! Field recordist! What've you got?
You put June's bedtime tape on the counter. You ask him to play it on the store deck.
TAPE(june): Okay, Gussie. This is for when I'm at sleepover camp and you can't sleep...
Nate's smile stays on his face for exactly four seconds after her voice starts. Then it's just gone, like a light switched off.
NATE(afraid): Who is that?
TAPE(june): ...*il y a longtemps que je t'aime, jamais je ne t'oublierai.*
NATE(cry): I know her. I know her, I — that's the girl. That's the girl in the static.
He sits down on the floor behind the counter. He's crying, and his nose is bleeding, and he keeps saying *I know her, I know her,* and he doesn't know her name.
~ played_nate = true
~ nate += 2
@remember nate You played him June's voice.
@hide nate
-> ch4_end

= aft_whitcomb
@bg classroom day
@show whitcomb neutral center
@ctx Gus shows Ms. Whitcomb June's ID card. Ms. Whitcomb was June's best friend in 1982.
You put June's ID on Ms. Whitcomb's desk after the last bell.
WHITCOMB(thinking): Gus? What's — whose is this?
She picks it up. The photo is white. The name isn't.
WHITCOMB(cry): June. Junie Brennan. Oh my god. Oh my god, how did I—
Her nose bleeds. She doesn't stop looking at it.
WHITCOMB(afraid): We were going to — we had a plan. For Quiet Night. Me and her and Nate. And then I — I woke up and it was Sunday, and I didn't remember why I was so sad. For a year. I didn't know why.
~ told_whitcomb = true
~ whitcomb += 2
@remember whitcomb She remembered June, for a minute.
@hide whitcomb
-> ch4_end

= aft_yearbook
@bg library day
@amb library
@ctx Gus looks through the Derry High 1983 yearbook in the school library.
The 1983 Tiger is in the back of the school library with all the others, a row of maroon spines going back to 1924.
Freshman class. Row after row of feathered hair and braces. And in the B's, between BOUCHARD and BRIGGS, a gray silhouette — the placeholder they use for kids who missed picture day.
\*Not pictured.*
No name under it. Just *Not pictured,* like that's a person.
~ clue(yearbook_1983)
-> ch4_end

= aft_memere
@bg living evening
@amb house
@show memere smile center
@ctx A quiet afternoon with Mémère before Quiet Night.
You spend the afternoon with your grandmother. She doesn't know who you are for most of it, and calls you Junie, and you let her.
You fix her buttons. You brush her hair, a hundred strokes, the way she tells you her mother did. She sings. You sing with her.
MEMERE(smile): You always sang it flat, ma belle. Just a little. On *t'oublierai.* Every time.
~ mem += 2
@remember memere An afternoon of singing.
@hide memere
-> ch4_end

=== ch4_end ===
@hide all
@bg gus_room night
@amb night
@music stop 3
@ctx The night before Canal Days. Gus lies awake.
Thursday night you lie awake and make a list in your head, the way June did in her notebook.
{knows_june:
    June Brennan. Kept, 1982.
}
{knows_wall:
    A wall of names in the boiler room, traced every night so they won't fade.
}
{saw_note || knows_wes_target:
    Wes. Saturday. After dark. The Standpipe.
}
{knows_rules:
    Close your eyes. Hold your breath. Never answer. Never guess.
}
Two days.
@wait 1
@fx blackout
@wait 1.5
-> ch5
