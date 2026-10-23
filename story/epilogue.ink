// ============================================================
// EPILOGUE — Side B
// Sunday, October 13, 1991
// ============================================================
=== epilogue ===
@chapter Side B :: Morning :: Sunday, October 13, 1991
@bg kitchen morning
@fx clear
@amb house
@music stop
@ctx The morning after Quiet Night. Derry has woken up as if nothing happened.
Sunday morning comes up clear and cold and gold, like every Sunday in every postcard of Maine.
Church bells. A dog barking. Somebody raking leaves. Derry wakes up rested and pleasant and remembers nothing at all.
{outcome:
- "memere": -> morning_memere
- "brett": -> morning_brett
- else: -> morning_wes
}

= morning_memere
@show mom smile left
@ctx The morning after Quiet Night. Mémère was taken by the light in Gus's place, and now Mom doesn't remember her own mother ever living here.
Your mother is in the kitchen in her robe, humming, making French toast. She looks like she slept for a year.
MOM(smile): Morning, sleepyhead! You were out cold. I didn't even hear you come in last night — did you go somewhere? Never mind. Eat.
There are two plates on the table.
GUS: Where's Mémère?
MOM(neutral): Hm?
GUS: Mémère. Your mom. Where is she?
MOM(sad): Oh, honey.
She puts down the spatula and comes over and touches your forehead with the back of her hand, the way she does when you're sick.
MOM(sad): Mémère passed in eighty-eight, sweetheart. You know that. We drove up for the funeral. You wore my black sweater and it was too big. Did you have a dream about her?
* ["She was here. Yesterday. She lived here. This is her house." #honest]
    MOM(worried): Gus—
    GUS(cry): Her room. Her pills on the windowsill. Her cardigan, buttoned wrong—
    MOM(afraid): I don't know what you're— honey, that's the sewing room. That's always been the—
    Her nose starts to bleed. She doesn't notice. She keeps talking, and the blood keeps coming, and you stop, because you can't watch it anymore.
* [(Say nothing. Go look.) #silent]
    You go down the hall. Mémère's door is open. Inside: a sewing machine on a table. Bolts of fabric. A dress form. No bed. No rosary. No pills.
    It smells like nobody has slept in there for years.
- In the pocket of your jacket, your fingers find something small and cold.
{has_pin:
    The little brass lantern pin. Hers. She gave it to you.
- else:
    A little brass lantern pin. You don't know how it got there. You know exactly how it got there.
}
THINK(cry): You're the only person alive who remembers she was ever here. Like Mr. Teague with Rose. Like Cal with Toby.
THINK(sad): You'll have to remember for everybody now.
@hide mom
-> tape5

= morning_brett
@show memere neutral center
@ctx The morning after Quiet Night. Gus let the light take Brett Lindqvist. Mémère, at breakfast, is lucid and knows what Gus did.
Your mother is still asleep. Your grandmother is at the kitchen table in her robe, with a cup of tea she isn't drinking, buttoned wrong, looking out the window.
She's lucid. You can tell the second she looks at you.
MEMERE(flat): You let it take the Lindqvist boy.
GUS: How do you—
MEMERE(sad): Because I remember him. Old women with holes in their heads, we catch things.
MEMERE(sad): By lunch, nobody else will. Only you, and his father, and the rest of them on that hill. His mother will set three plates tonight and not know why.
She takes your hand across the table. Her fingers are cold.
MEMERE(sad): You did what we did, ma belle. You did what I did. For thirty-six years.
MEMERE(flat): Now you know what it weighs.
* ["He was going to let them take Wes. He delivered the note." #blunt]
    MEMERE(neutral): Yes. And Constance believes everyone she chose deserved it too. That's how it starts. That's how all of it starts.
* ["I didn't want to die." #honest]
    MEMERE(sad): No. Nobody does. That's the whole trick of it, ma belle. That's how it's always fed.
* [(Cry.) #silent]
    You cry, and she holds your hand, and doesn't tell you it's all right, because it isn't.
- @hide memere
On your way upstairs, you look out the front window.
A police cruiser is parked across Larch Street. Officer Lindqvist is behind the wheel in last night's clothes, looking at your house. He doesn't get out. He doesn't do anything. He just looks.
-> tape5

= morning_wes
@ctx The morning after Quiet Night. Wes was taken. Nobody remembers him except Gus.
{went_out:
    You call the Dunmores from the kitchen phone at eight in the morning, your hands shaking so badly you misdial twice.
    PHONE: Hello?
    GUS: Mrs. Dunmore? It's Gus. Wes's friend. Is he — did he come home?
    PHONE: I'm sorry, hon, who? We don't — there's no Wes here. We've got our Katie, she's two. You must have the wrong Dunmores.
    @sfx phone_hangup
- else:
    You wake up at your desk with your cheek on a piece of paper. In your own handwriting, pressed so hard the pen went through:
    WES PIKE. DON'T FORGET. DON'T FORGET. DON'T FORGET.
    You look at it for a long time.
    THINK(afraid): Who's Wes Pike?
    THINK(afraid): Who's— no. *No.* Wes. Flannel. The cat. The Admiral. *Wes.*
    It comes back the way a word comes back when it's been on the tip of your tongue. Slowly. Not all the way.
}
{recorded_wes:
    You put the tape from the Barrens in your recorder, and press PLAY, and hold it against your ear.
    TAPE(wes): This is Wes Pike. I'm fifteen. It's Saturday. I'm in Derry, Maine, which is a stupid name for a town.
    TAPE(wes): And I'm not going anywhere this time.
    You play it nine times. Ten. Tape keeps voices. Tape doesn't forget.
- else:
    You don't have anything of his. Not a drawing. Not a tape. Just the shape of him in your head, already blurring at the edges, like a photo left in the sun.
}
THINK(cry): He said he wasn't going anywhere this time.
-> tape5

// ------------------------------------------------------------
= tape5
@bg gus_room day
@amb night
@music june
@ctx Gus returns to her room and finds a brand-new cassette tape on her pillow, labeled in her sister June's handwriting: tape number five.
When you go back up to your room, there's a cassette tape on your pillow.
You didn't put it there.
It's a Maxell XLII, high bias. Brand new. The kind they sell at Low Tide for five bucks a three-pack, the kind they didn't make until a couple of years ago.
On the label, in round, bossy handwriting you'd know anywhere now:
\#5 — FOR GUSSIE — PLAY AFTER
{Clues ? june_notes:
    THINK(afraid): *If anything happens: Gussie. Tape \#5.* There was no tape five in the box. There was no tape five in 1982.
    THINK(afraid): This tape didn't exist in 1982.
}
@cg cg_tape five
@sfx tape_insert
@sfx tape_play
There's no hiss. That's the first thing. It's clean, close, like she's sitting on the end of your bed.
TAPE(june): Hi, Gussie.
TAPE(june): You were so brave last night. Stupid. But brave. You get that from me.
{outcome:
- "memere":
    TAPE(june): I'm sorry about Mémère. I tried. I swear I tried. She wanted to. She's been wanting to for nine years.
- "brett":
    TAPE(june): I'm sorry about the boy. I know what it felt like. I know exactly what it felt like.
- else:
    TAPE(june): I'm sorry about Wes. I couldn't stop it. I've been trying to stop it for nine years. I've never stopped it once.
}
{june_call == "listened" || june_call == "recorded":
    {outcome:
    - "brett":
        TAPE(june): You listened to me. On the phone. You weren't the closest one.
        TAPE(june): ...Good.
    - "memere":
        TAPE(june): I told you not to be the closest one. You never listen. She never did, either.
    }
}
TAPE(june): Listen to me. It's not over. It's never over in Derry. There are things I need to tell you. About me. About Mom. About what's under the town.
TAPE(june): But not on tape. Tape's not safe anymore. They can hear it now.
TAPE(june): ...
TAPE(june): Open your window, Gussie.
@sfx tape_stop
@cg off
@music stop 1
@amb quiet
@wait 1.5
@sfx window_knock
Three taps on the glass.
@bg gus_room night - slow
@ctx Gus's sister June, still fourteen after nine years, is standing outside Gus's window on the porch roof, asking to come in.
You turn around.
@cg cg_june_window
There's a girl on the porch roof outside your window.
Dark hair in a bob, bangs cut blunt and straight. A yellow sweater, gone grayish, like it's been in a drawer a long time. A strap across her chest for a tape recorder that isn't there. Fourteen years old. Exactly, perfectly fourteen, the way she was in the Polaroid, the way she will be forever.
Her breath doesn't fog the glass.
She smiles. It's your smile. You've seen it in the mirror your whole life and never known whose it was.
JUNE: Hi, Gussie.
JUNE: Can I come in?
{Clues ? memere_warning:
    THINK(afraid): *Don't open the door. Not for anyone. Not even for her.*
}
@ctx Final decision of the episode. June (or something wearing her face) is at the window asking to come in.
* [Open the window. #kind]
    ~ window_choice = "open"
    You reach for the latch.
* [Don't open it. #silent]
    ~ window_choice = "closed"
    You don't move. You stand in the middle of your room with your hands at your sides, and you look at her, and she looks at you, and neither of you moves.
* ["What's the song, June? The one you sang to me." #probe]
    ~ window_choice = "song"
    You say it through the glass. Your voice is shaking.
    June's smile changes. Softer. Or sharper. You can't tell.
    JUNE: *À la claire fontaine, m'en allant promener...*
    She sings it perfectly. Every note.
    Mémère sang it every night for nine years, at the window, to the street. Anybody listening could know it.
- @decide The window: {window_choice == "open":You reached for the latch.}{window_choice == "closed":You didn't open it.}{window_choice == "song":You asked her for the song.}
@fx blackout
@cg off
@wait 2.5
@music end
-> credits

=== credits ===
@card WHAT DERRY KEEPS :: Episode One — Welcome Home :: Your choices will follow you into Episode Two.
@end
-> END
