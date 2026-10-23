// ============================================================
// CHAPTER SIX — The Quiet
// Saturday, October 12, 1991
// ============================================================
VAR steps = 0
VAR has_pin = false
VAR june_call = ""        // listened | recorded | answered | ignored
VAR constance_talk = ""   // pulled | june | pin | me
VAR cal_choice = ""       // helped | photo

=== ch6 ===
@chapter Chapter Six :: The Quiet :: Saturday, October 12, 1991
@bg downtown day
@fx clear
@amb town
@music quiet
@ctx Quiet Night, Saturday, October 12. During the day the town begins shutting down early.
The day is bright and cold and completely ordinary, which is the worst part.
At the Shop 'n Save, a sign on the door: CLOSING 5 P.M. TODAY. At Dot's, the chairs are up on the tables by four. The bank's clock says 3:12 and there is nobody on Center Street at all, as if the whole town got a memo you didn't.
@bg kitchen evening
@amb house
@ctx Saturday evening at home. Mom is behaving strangely, like a sleepwalker, as Quiet Night approaches.
@show mom neutral left
Your mother makes dinner at 5:30. Meatloaf. She doesn't talk while she makes it. She doesn't turn on the radio. She moves around the kitchen like a woman underwater.
At 7:30 she goes through the house drawing every curtain. Living room. Dining room. Your room. She checks the front door lock three times. Then the back. Then she unplugs the phone from the wall and winds the cord around it.
MOM(flat): No calls tonight.
* ["Mom. What are you doing?" #ask]
    MOM(flat): Hm? Just closing up. It's Quiet Night, honey. Everybody's tired.
    GUS: You said you didn't know what Quiet Night was.
    MOM(neutral): Did I?
    She smiles at you. It's the right shape. There's nobody behind it.
* ["Mom. Look at me." #confront]
    She looks at you. Her eyes are glassy and calm, like a doll's eyes, like the eyes of someone in the back of an ambulance.
    MOM(neutral): I'm looking at you, sweetheart. You look tired. Early night.
* [(Hug her.) #kind]
    You hug her. She hugs you back automatically, patting your back, two pats, like you're a coworker.
    MOM(neutral): Okay. Okay. Early night.
- At 7:55, she kisses you on the forehead.
MOM(neutral): Early night, I think. Night, girls.
She goes up the stairs. Her door closes. The lock turns.
@hide mom
{mem >= 4:
    -> pin
}
-> lights

= pin
@bg hall_up night
@show memere afraid center
@ctx Mémère calls Gus into her room on Quiet Night and gives her the brass lantern pin she has worn for decades.
Mémère's door is open a crack. She's sitting on her bed in her church coat over her nightgown, the rosary going through her fingers. *Je vous salue Marie, pleine de grâce...*
MEMERE(neutral): Augusta. Viens.
She unpins the little brass lantern from her collar — you've never once seen her without it — and presses it into your palm, closing your fingers over it.
MEMERE(sad): If they see this, they'll think you're one of them. For a minute. Sometimes a minute is all you get.
MEMERE(flat): I'm not telling you to go. I'm telling you I know you will. You're a Thibodeau. We never listen. Look where it got me.
~ has_pin = true
@hide memere
-> lights

= lights
@bg gus_room night
@amb quiet
@music stop 2
@ctx 8:40 p.m. on Quiet Night. Gus watches from her bedroom window as every light on Larch Street goes out at once.
At 8:40 you're at your window with the curtain pulled back an inch.
@bg larch_ext night - fade
Larch Street. Porch lights. The blue flicker of TVs. The Gagnons' kitchen window, yellow. Mrs. Bouchard's lamp with the fringe on it, two doors down. An ordinary Saturday night.
@sfx lights_out
@bg larch_ext quiet - cut
@fx shake
Every light on Larch Street goes out at the same time.
Not a power cut. You can see the Gagnons' TV flickering blue behind their curtains. They turned off their lamps. Everybody did. At the exact same second. Like somebody rang a bell only grown-ups can hear.
Then the streetlights. One by one, down the block, from the far end toward you. *Tick.* *Tick.* *Tick.* Like someone walking up the street turning them off with their fingers.
And past the end of the street, up on the hill, there's a light. Small. Steady. Green.
{saw_note || knows_wes_target:
    {wes_promised:
        And then you see him. In the middle of Larch Street, walking. Clean flannel. Hands at his sides. Wes. He promised he'd stay home, and he's walking up the center line toward the hill with his eyes open and nobody behind them, like someone being called for supper.
    - else:
        He'll be up there by now. Or on his way. Wes, in his clean flannel, walking toward a voice he's waited nine years to hear.
    }
}
@ctx Gus must decide whether to go out into the dark on Quiet Night or stay inside as Mémère warned.
* [Go. Out the window, over the porch roof. #confront]
    ~ went_out = true
    -> out
* [Stay inside. Like Mémère said. #silent]
    -> ch6_stay

= out
You open the window. It sticks, and then it doesn't, with a crack like a knuckle. Cold air. The porch roof below, shingles wet with dew.
You know how to do this. You've never done it before in your life, and your body knows: out the window, down the roof on your butt, the trellis by the lilac, the soft spot in the grass.
You wonder who taught you. You know who taught you.
{ally_teddy:
    -> meet_teddy
}
-> q_walk

= meet_teddy
@bg street_quiet quiet
@show teddy afraid left
@ctx Teddy meets Gus at the corner of Larch Street in the dark on Quiet Night, with walkie-talkies.
Teddy is at the corner of Larch, crouched behind a mailbox in a black hoodie with two walkie-talkies clipped to her belt and her glasses taped on with athletic tape.
TEDDY(afraid): Hi. I came. I'm here. I'm terrified. Everything's dark. My whole street went dark at once, Gus, like a *switch.*
TEDDY(worried): My dad was asleep sitting up. In his chair. With his eyes open.
She hands you a walkie-talkie. Her hand is shaking so hard the antenna rattles.
-> q_walk

// ------------------------------------------------------------
=== ch6_stay ===
@ctx Gus stays inside on Quiet Night. Something knocks at the front door, using her sister June's voice.
You let the curtain fall. You sit on your bed in the dark with your knees up and your recorder in your hands and you don't go.
You told yourself you'd go. Everybody tells themselves that.
Hours. Or minutes. The house is so quiet you can hear the blood in your ears.
@sfx door_knock
Downstairs, someone knocks on the front door. Three knocks. Soft.
VOICE(june): Gussie?
VOICE(june): Gussie, it's me. It's cold out here. Come let me in.
It's her voice. The voice from the tape. Close and warm and laughing a little, like she's embarrassed to be locked out.
* [Answer her. #honest #timed:7]
    ~ answered_voice = true
    GUS(cry): June?
    VOICE(june): There you are. Come down, Gus-Gus. Come open the door.
    You're on the stairs before you know you've moved. Your hand is on the lock—
    A hand grabs your wrist. Mémère, in the dark, in her nightgown, stronger than she should be.
    MEMERE(afraid): Not even for her. *Not even for her.*
    She holds you there until the knocking stops.
* [Hold your breath. Close your eyes. Don't answer. #silent #default]
    You close your eyes. You hold your breath until your lungs burn. You don't answer.
    VOICE(june): Gussie. Please. I'm so cold.
    You don't answer.
    After a long time, the knocking stops. Footsteps on the porch, going away. Light, quick footsteps, like a girl's.
- @bg gus_room night
@ctx 3 a.m. after Quiet Night. Gus's clock radio turns on and reads a new name.
At 3:00, the clock radio clicks on by itself.
@amb static
RADIO: —June Brennan. Toby Mercer. Peter Dunn.
RADIO: Wesley Pike.
Click.
~ outcome = "wes"
@decide Quiet Night: You stayed inside.
@amb quiet
-> epilogue

// ------------------------------------------------------------
=== q_walk ===
@bg street_quiet quiet
@amb quiet
@music horror
@weather fog
@ctx Walking through the completely dark town toward the Standpipe hill on Quiet Night. Voices call from the dark.
Derry in the dark is a different town.
Every window black. Every porch light off. Parked cars like animals asleep. The only light is the green, very small, very far away on the hill, and somehow it doesn't get closer as you walk. Everything else gets farther away. You understand now what she meant on the tape.
In one house a TV is on behind drawn curtains, throwing blue light, and in the blue light there's the shape of a man standing at the window. Not moving. Facing out. Facing you.
{ally_teddy:
    TEDDY(afraid): Don't look at him. Don't look at him. Don't look at him.
}
Then the voices start.
They come from the dark between the houses. From the alleys. From the hedges. Soft, close, like someone whispering right behind your ear.
{ally_teddy:
    VOICE: Theodora. Teddy, baby, it's Grandma. Come here, let me see you. You got so tall.
    Teddy makes a sound like she's been punched.
}
VOICE(june): Gussie. This way. It's me. I'm right here.
@ctx On the dark street, a voice that sounds exactly like June is calling Gus's name from the shadows. Answering it is dangerous.
* [Answer her. #honest #timed:8]
    ~ answered_voice = true
    GUS: June? June, where—
    The dark *leans* toward you. You feel it, like a door opening in a warm house in winter. Something knows your name now. Something has a hold of it.
    {ally_teddy:
        Teddy grabs your arm and yanks you back so hard you both fall into a hedge.
        TEDDY(angry): Never answer. *Never answer.* The kids' song, Gus, you told me—
    - else:
        You stumble back, and the warmth pulls, and you tear yourself away from it like tearing skin off cold metal.
    }
* {knows_rules} [Close your eyes. Hold your breath. Keep walking. #silent #default]
    You close your eyes and hold your breath and keep walking, one hand on the fences, counting steps.
    VOICE(june): Gussie, it's me, *please*—
    You don't answer. You never answer. You never guess.
    {ally_teddy:
        Beside you, you can hear Teddy holding her breath too, little whimpers through her nose. The voices fall behind.
    }
* {not knows_rules} [Ignore it. Keep walking. Fast. #silent #default]
    You walk faster. You don't answer. Not because you know the rules — because something in you, very old, very small, says *don't.*
    The voice follows you for a block, and then it doesn't.
- -> payphone

= payphone
@ctx Still walking to the hill on Quiet Night. Outside a dead gas station, a pay phone is ringing in the silent town. Answering a voice tonight is dangerous.
@sfx phone_ring
At the corner of Witcham and Jackson, outside the dark Gulf station, the pay phone is ringing.
It's the only sound in Derry. A real bell, loud and old, the kind that makes your hand move before you think.
{ally_teddy:
    TEDDY(afraid): Nope. No. Gus. That's the part of the movie where the babysitter picks up and the call is coming from *inside the house.*
}
It rings, and rings. It isn't going to stop.
* [(Pick up. Don't say a word.) #silent]
    ~ june_call = "listened"
    -> phone_listen
* [(Pick up. Hold your recorder to the earpiece. Press RECORD.) #record]
    ~ june_call = "recorded"
    -> phone_listen
* ["Hello?" #honest]
    ~ june_call = "answered"
    ~ answered_voice = true
    You pick it up. The plastic is warm, as if someone just put it down.
    GUS: Hello?
    VOICE(june): There you are.
    The warm voice. Smiling. You can hear it smiling.
    VOICE(june): See you on the hill, Gus-Gus.
    Click. Dial tone. And under the dial tone, very faint, something breathing.
    -> walk_on
* [Let it ring. Keep walking. #leave]
    ~ june_call = "ignored"
    You walk past it. Behind you it keeps ringing. You count twelve rings before it stops.
    Then, a block ahead, outside the Rexall, another pay phone starts. Then the one past that.
    All the way to the hill, every phone you pass rings, like the streetlights going out, like somebody keeping pace with you one phone at a time.
    -> walk_on

= phone_listen
You pick it up. The plastic is cold. You don't say hello. You don't even breathe.
{june_call == "recorded":
    @sfx record_start
}
Hiss. Not phone hiss. Tape hiss, the soft, endless kind you've been listening to your whole life.
PHONE(june): ...Gussie? Don't talk. Don't ever talk to it. Just listen.
It's her. Not the warm voice from the dark. This one is hoarse and tired and close, like she's whispering under a blanket so nobody in the house will hear.
PHONE(june): You're going to pull him out. I know you. You're stubborn.
PHONE(june): When you do, it'll turn around. It takes whoever's closest. It always takes whoever's closest.
PHONE(june): So don't be the closest one. Please, Gussie. I can't have you down here. I can't.
Click.
{june_call == "recorded":
    ~ tape(tape_payphone)
    Your thumb finds STOP. The little reels stop turning. Whatever she is, you've got her on tape.
}
{ally_teddy:
    TEDDY(afraid): Was that... her? Your sister?
    You don't answer. You're not sure you can.
}
-> walk_on

= walk_on
-> q_hill

// ------------------------------------------------------------
=== q_hill ===
@bg standpipe night
@amb hill
@music tension
@weather fog
@ctx At the bottom of the Standpipe hill on Quiet Night. Brett Lindqvist is there with a flashlight, posted to keep people away. He's terrified.
{ally_cal || ally_sloane:
    At the cemetery gate at the back of the hill, shapes in the dark.
    {ally_cal:
        @show cal afraid right
        Cal, with a camera around his neck, a big black Nikon with a flash attachment like a weapon.
        CAL(afraid): You came. Good. I didn't want to see it alone again.
    }
    {ally_sloane:
        @show sloane afraid left
        Sloane, in a black peacoat over pajama pants, her hair pulled back hard. She doesn't say hello.
        SLOANE(flat): I'm not here. You never saw me. Up through the old graves. Stay off the gravel.
    }
}
Halfway up the path, a flashlight beam swings into your face.
@show brett afraid center
BRETT(afraid): Who's there? Who — {brett_steps == "sarcastic":Grandpa|new girl}?
Brett Lindqvist. In his letterman jacket, holding a flashlight in both hands like a gun. He's white as paper. He's been crying.
BRETT(afraid): You can't be up here. My dad said nobody — I'm supposed to keep people *off.* It's just a prank, it's supposed to be a — there's something up there, Gus. There's something *up there.*
~ brett_present = true
@ctx Brett Lindqvist, the bully, is blocking the path up the hill, terrified. Gus has to get past him.
* ["You know it's not a prank, Brett. You know what you did." #confront]
    BRETT(cry): I just delivered a letter! That's all! Dad said the kid would get scared and go back to Bangor!
    BRETT(afraid): That's all I did. That's *all* I did.
    He doesn't stop you. He can't stop anything. He just stands there with the light shaking.
* {Tapes ? tape_brett} [Hold up your recorder. "Get out of my way, or your uncle hears this." #manipulate]
    You press PLAY. His own voice comes out of the little speaker, tinny, laughing: *Bet she's in a ditch somewhere.*
    BRETT(afraid): Turn it off. Turn it *off.*
    He steps aside. He looks at you like you're the scariest thing on the hill, and for one second, you are.
* {has_pin} [Show him Mémère's lantern pin. #manipulate]
    You hold out your palm. The little brass lantern catches his flashlight.
    BRETT(surprised): You're — you're one of them? Nobody told me—
    BRETT(afraid): Go. Go, I didn't — I didn't see you.
* [Walk past him. He won't stop you. #blunt]
    You walk past him. He doesn't stop you. You can hear his breathing behind you, ragged, like a kid after crying.
- BRETT(afraid): Wait. Wait. Don't leave me down here alone.
And he follows. Of course he follows. Whatever's on top of the hill, he's more afraid of being alone in the dark.
@hide all
-> q_standpipe

// ------------------------------------------------------------
=== q_standpipe ===
@bg standpipe quiet
@amb quiet
@music horror
@cg cg_standpipe
@ctx The top of the Standpipe hill on Quiet Night. A brass lantern burns green on the ruined stone ring. Wes is walking slowly toward it, hearing his mother's voice. Motionless figures stand in the dark beyond the light.
The top of the hill.
On the broken ring of the Standpipe, on the highest stone, the Keeper's Lamp is burning. The light is green. Not the green of anything alive. The green of deep water, of things that grow in the dark.
It lights the stones and the grass in a circle maybe thirty feet across. Past the edge of the circle, the dark is *darker.* Not night. Something else. Something you could put your hand into, and keep putting it in, forever.
And in the dark, at the edge of the light, people are standing. Still as fence posts. You can't see their faces. You can see the shapes of them: a little girl in a party dress. A boy with a baseball glove. A man in an old-fashioned coat. Behind them, deeper in, there are more. You can feel how many more.
And closer — on the near side, under the trees — eleven grown-ups in good coats, with little brass lanterns on their collars, watching. Mrs. Ashgrove. Principal Fenwick. Officer Lindqvist. They don't move. They're witnesses. That's all they've ever been.
@cg off
And there's Wes.
@show wes neutral center
He's walking across the circle toward the Lamp. Slow. Smiling. Talking to someone you can't see.
WES(smile): Mom? Mom, it's okay. I'm not mad. I swear I'm not mad. I just want to—
VOICE: Come here, baby. Come here. Let me look at you.
It's a woman's voice. It comes out of the light. It sounds like every mother who ever called a kid in from the dark.
~ anchors = 0
~ steps = 0
{answered_voice:
    VOICE(june): Gussie. You came. You came back for me.
    The light flickers toward you, just for a second, like a head turning. It knows you. It's been waiting for you.
}
-> face_constance

= face_constance
You take one step toward the light—
@show constance neutral right
A hand closes on your arm. A gloved hand, small and very strong.
Mrs. Ashgrove. Camel coat buttoned to the throat, the little brass lantern on her collar. She crossed thirty feet of wet grass while you were watching Wes, and you never heard her.
{caught_at_tent:
    CONSTANCE(flat): I did ask you to have an early night, Augusta.
- else:
    {interview == "constance":
        CONSTANCE(neutral): Augusta. You were so polite in my parlor. I had such hopes for you.
    - else:
        CONSTANCE(neutral): Augusta. You have your grandmother's chin. And her timing.
    }
}
{ally_cal || ally_sloane:
    -> the_twins
}
-> the_warning

= the_twins
Her eyes go past you, into the dark behind you, and for one second Constance Ashgrove's face doesn't know what to do.
{ally_sloane:
    CONSTANCE(angry): Sloane. Go home.
    SLOANE(flat): No.
    Just that. Like a door closing. You get the feeling nobody has said that word to Constance Ashgrove in a very long time.
}
{ally_cal:
    CONSTANCE(worried): Calvin. You should be in bed.
    CAL(angry): I wasn't in bed in 1986 either, Mother. You never asked where I was.
}
-> the_warning

= the_warning
@ctx Constance Ashgrove, president of the Lantern Society, holds Gus's arm at the edge of the green light and warns her what saving Wes will cost. Every second Gus spends here, Wes walks closer to the Lamp.
CONSTANCE(neutral): I'll tell you one thing, and then you'll do as you like. Your family always does.
CONSTANCE(flat): If you pull that boy out of the light, it will take whoever is standing nearest. Most likely you. That isn't cruelty, dear. It's arithmetic.
CONSTANCE(neutral): One a year. One. Do you know what Derry was before we kept the count? Nobody does. That's rather the point.
{Clues ? starving_winter:
    THINK(afraid): The Starving Winter. A girl walking out into the snow with a lantern, and nobody ever said her name again.
}
Past her shoulder, Wes takes another step. Every second you stand here, he's closer.
* [Pull free. Go. #action #default #timed:10]
    ~ constance_talk = "pulled"
    You wrench your arm out of her hand. She lets it go. She doesn't even look surprised.
    CONSTANCE(neutral): As you like.
* {knows_june} ["Was June one of the ones nobody would miss?" #confront]
    ~ constance_talk = "june"
    CONSTANCE(sad): Your sister was fourteen and very clever, and in another month she'd have made a great many people very sorry. So, no. We missed her. I still do.
    CONSTANCE(flat): Do you know what it used to call her out? You. Five years old, in your nightgown, in the yard on Corson Street, crying for her. You were asleep upstairs the whole time.
    CONSTANCE(neutral): Your grandmother abstained. She didn't stop us. Ask her why, when you get home.
    She lets go of your arm.
    When you look past her, Wes is two-thirds of the way across the circle. The light is on his face.
    ~ steps = 1
* {has_pin} [Open your hand. Show her Mémère's pin. #manipulate]
    ~ constance_talk = "pin"
    You open your fingers. The little brass lantern lies in your palm, green in the light.
    Mrs. Ashgrove looks at it for a long time. Something in her face goes very still.
    CONSTANCE(sad): She gave you her lamp. Thirty-six years, she wore that.
    Her glove opens. For a minute, she doesn't know what you are. A minute is all you need.
* ["Then let it take me." #honest]
    ~ constance_talk = "me"
    You say it before you can think about it, and once it's said, you find you mean it.
    CONSTANCE(thinking): Everyone says that, up here. Hardly anyone means it.
    She looks at you a moment longer. Then she lets you go, the way you'd let go of a bird.
    CONSTANCE(neutral): Go on, then. Let's see.
- @hide constance
-> rescue

= rescue
@ctx Wes is walking toward the green lantern, lured by his "mother's" voice. Gus must break the lure before he reaches the light. Each try costs time.
{steps:
- 0: Wes is halfway across the circle.
- 1: Wes is two-thirds of the way across. The light is on his face now.
- 2: Wes is a few steps from the Lamp. His hand is coming up, reaching.
}
* {recorded_wes} [Play Wes's tape. Turn the volume all the way up. #record]
    You fumble the tape in. Your thumb finds PLAY. You hold the recorder up over your head, volume all the way.
    TAPE(wes): This is Wes Pike. I'm fifteen. I'm in Derry, Maine, which is a stupid name for a town.
    TAPE(wes): And I'm not going anywhere this time.
    Wes stops. His head turns, slowly, like someone hearing their name across a crowded room.
    WES(thinking): ...That's me.
    ~ anchors += 1
* [Shout his name. #confront]
    GUS(afraid): WES! Wes, it's me! It's Gus! Stop!
    {wes >= 5 || wes_promised:
        He stops. Mid-step. He promised. Some part of him remembers he promised.
        WES(worried): ...Gus?
        ~ anchors += 1
    - else:
        He doesn't hear you. Or he hears you the way you hear a radio in another room.
    }
* {saw_note && Clues ? broken_e} ["Your mom didn't write that note! The Lantern Society did. Same typewriter. Same broken e!" #honest]
    WES(thinking): ...
    VOICE: Don't listen to her, baby. Come to me.
    WES(angry): The e's. The e's on the note were — they were all *chipped.* Like the — Mrs. Ashgrove's flyer in the hall had—
    He stops walking.
    ~ anchors += 1
* {ally_teddy || ally_sloane || (ally_cal && (cal >= 5 || told_cal))} [Run in and grab him. Eyes shut. Breath held. #action]
    {ally_teddy:
        You and Teddy run into the light with your eyes squeezed shut and your breath held like two kids playing Lantern, and you crash into him from both sides.
    - else:
        {ally_sloane:
            You and Sloane run in with your eyes shut. Behind you, her mother says her name once, sharp as a slap. Sloane doesn't even slow down. She grabs one arm. You grab the other.
        - else:
            Cal drops the camera. It bounces off the stones, the flash going off once, white, blinding. Then he's beside you, eyes shut, grabbing Wes's flannel.
            ~ cal_choice = "helped"
        }
    }
    Wes is heavy, dead weight, still leaning toward the light like a plant toward a window. But he's stopped moving forward.
    ~ anchors += 1
* {ally_cal && cal < 5 && not told_cal} [Yell at Cal to help. #confront]
    CAL(afraid): I — I have to get it on film, Gus, if I don't get it on film it doesn't—
    He raises the camera. FLASH. The light of it is white and ordinary and useless. Across the hill, eleven faces turn toward you all at once, lit up for a second like a photograph.
    ~ suspicion += 2
    ~ cal_choice = "photo"
* [Close your eyes. Sing. #kind]
    You don't know why you do it. You close your eyes and sing June's song, the bedtime song, your voice shaking so badly it's barely a tune. *À la claire fontaine, m'en allant promener...*
    It doesn't stop Wes. But the dark at the edge of the light goes still, all of it, the little girl in the party dress, the boy with the glove. Listening.
    {mem >= 3 || knows_june:
        One of the shapes in the dark, a girl in a sweater, turns her head toward you.
    }
* -> lost
- ~ steps += 1
{anchors >= 2:
    -> saved
}
{steps >= 3:
    -> lost
}
-> rescue

= lost
@ctx Wes walks into the green light and is taken.
WES(smile): Mom.
He steps into the light, and the light closes over him like water over a stone.
He doesn't scream. Nobody screams. There's just a sound like a breath being drawn in, very deep, by something very large.
And then there's no Wes. There's the Lamp, and the stones, and the grass, and a clean flannel shirt's worth of nothing.
@hide wes
@fx flash
@sfx lantern
The Lamp gutters, and goes out.
~ outcome = "wes"
@decide Quiet Night: Wes walked into the light.
-> after

= saved
@ctx Gus has broken the lure. Wes collapses into her arms, free. The green light now turns toward Gus herself.
WES(afraid): Gus? Where — what — *where's my mom?*
He sags, all at once, his knees going, and you catch him. He's shaking. He's crying. He's here.
@expr wes cry
For one second, it's over.
Then the Lamp flares. The green light swells, and swings, like the beam of a lighthouse turning, and it doesn't stop on Wes.
It stops on you.
@fx greenout
@music quiet
{june_call == "listened" || june_call == "recorded":
    THINK(afraid): *Don't be the closest one.* She begged you.
- else:
    {knows_cost:
        THINK(afraid): You pull one out, it takes whoever's closest. Mr. Teague said it. *You remember that, girl.*
    - else:
        THINK(afraid): *It will take whoever is standing nearest.* Arithmetic, she said.
    }
}
You can't move. You can't close your eyes. The light is warm, it's so warm, it's like being tucked in, it's like being five years old in a house where everybody still remembers everybody.
VOICE(june): Gussie. Close your eyes.
And behind you, you hear breathing. Ragged. Close.
{brett_present:
    -> turn
- else:
    -> stand
}

= turn
@show brett afraid right
Brett. He followed you all the way up. He's right behind you, a step to the side, frozen, the flashlight dead in his hand.
If you stepped aside — one step — the light would fall on him instead.
From under the trees comes Mrs. Ashgrove's voice, gentle as a nurse's.
CONSTANCE: One step, Augusta. That's all it ever is. One step.
{june_call == "listened" || june_call == "recorded":
    And under it, in your head, June's tired voice: *Don't be the closest one.*
}
@ctx The green light has fixed on Gus. Brett Lindqvist is right behind her. If she steps aside, the light will take him instead of her. She has seconds.
* [Step aside. #manipulate #timed:8]
    -> brett_taken
* [Don't move. Let it come. #silent #default]
    -> stand

= brett_taken
You step aside.
It's so small. One step to the left, in wet grass. The smallest thing you've ever done.
BRETT(afraid): No — no, no, Gus, *no*—
The light falls on him. His face, white and wet and seventeen. He reaches for you.
And then he's gone, the way Wes almost was, the way everyone is. A breath drawn in, very deep.
Under the trees, a man makes a sound you will hear for the rest of your life. Officer Lindqvist. He was standing with the others. He watched.
@hide brett
@fx flash
@sfx lantern
The Lamp gutters, and goes out.
~ outcome = "brett"
@decide Quiet Night: You stepped aside. The light took Brett.
-> after

= stand
@hide brett
You don't move. You stand in the warm green light and wait for it, and you think: *this is what she did. This is what June did. She stood here.*
Then someone touches your shoulder.
@show memere sad center
Your grandmother. Barefoot. In her nightgown and her good church coat. She walked all the way up the hill, in the dark, at seventy-two years old, through the cemetery and the long wet grass.
MEMERE(sad): Va-t'en, ma belle. Take the boy home.
GUS(cry): Mémère, no—
MEMERE(smile): Pas elle. Moi.
She steps past you, into the light. She doesn't look back. She walks the way she walks down the aisle at church, small and straight, her rosary in her hand.
MEMERE(sad): *Il y a longtemps que je t'aime...*
And the light takes her.
Under the trees, someone says *Yvette—* in a voice you didn't know Mrs. Ashgrove had.
@hide memere
@fx flash
@sfx lantern
The Lamp gutters, and goes out.
~ outcome = "memere"
@decide Quiet Night: Mémère walked into the light in your place.
-> after

= after
@hide all
@fx clear
@music stop 3
@weather none
@amb quiet
@ctx The lantern has gone out on the Standpipe hill. Total darkness. June's voice speaks to Gus.
Dark. Total. The kind of dark you can feel on your skin.
{outcome == "brett":
    Somewhere across the hill, someone in a good coat starts to clap, slowly, three times, the way they must clap every year. Nobody near Officer Lindqvist claps.
- else:
    Somewhere across the hill, someone in a good coat starts to clap, slowly, three times, and stops.
}
{outcome == "wes":
    You're on your knees in the grass. Your hands are full of nothing.
- else:
    Wes is shaking in your arms. {ally_teddy:Teddy is holding your sleeve so hard her knuckles crack.}
}
{outcome == "memere":
    CONSTANCE: She was the best of us, you know. Once.
    Mrs. Ashgrove, somewhere close in the dark. Her voice isn't steady. You didn't know it could do that.
- else:
    CONSTANCE: Now you'll remember, too. Welcome home, Augusta.
}
{ally_sloane:
    SLOANE(flat): Walk. Don't run. They like it when you run.
}
{ally_cal:
    {cal_choice:
    - "helped":
        CAL(neutral): I didn't get it. Any of it. The camera's in pieces.
        He sounds almost relieved.
    - "photo":
        Cal's flash whines in the dark, recharging. Nobody says anything to him.
    - else:
        Somewhere beside you, a pencil is scratching on paper. Cal, writing in the Derry Book in the pitch dark, so he won't forget.
    }
}
VOICE(june): Go home, Gussie.
Close. Right behind you. Her real voice, not the warm one. Tired. Older than a tape. Fourteen and very, very old.
VOICE(june): Go home. Don't look back.
* [Look back. #confront]
    ~ looked_back = true
    You look back.
    For one second, less, in the dark, there's a face. A girl's face. Dark bangs, cut straight. A yellow sweater, gone gray. Her eyes on you, wide and sad and furious.
    Then nothing. Just the dark, and the stones, and the smell of a candle blown out.
* [Don't look back. Go home. #silent]
    You don't look back. You get up, and you go down the hill, and you don't look back, and it is the hardest thing you have ever done.
- @fx blackout
@wait 2
-> epilogue
