// ============================================================
// CHAPTER TWO — Derry High
// Wednesday, September 4, 1991
// ============================================================
=== ch2 ===
@chapter Chapter Two :: Derry High :: Wednesday, September 4, 1991
@bg kitchen morning
@fx clear
@amb house
@music larch
@ctx First morning of school. Mom, in scrubs, is about to leave for orientation at the hospital. Mémère is lucid and sharp-tongued at the breakfast table.
@show memere smirk right
@show mom neutral left
Your grandmother is having a good day. You can tell because she's insulting everyone.
MEMERE(smirk): Augusta. You look like a soldier who lost a war.
GUS: It's an army jacket. That's the point.
MEMERE(flat): The point of an army jacket is the army. The point of a girl is to look like she owns a hairbrush.
MOM(smile): Ma, she looks great. She looks like a girl who owns a cassette recorder and has opinions about bands.
MOM(neutral): First day. Remember: you're new. New is a superpower for about a week. After that you're just weird.
* ["Super inspiring. Thanks." #sarcastic]
    MOM(laugh): I contain multitudes. Most of them are tired.
* ["I'm kind of scared, actually." #honest]
    Your mother stops with her keys halfway into her purse.
    MOM(sad): Oh, honey. Me too. First day at the hospital. Sixty new names, and the coffee's from 1974.
    MOM(smile): We'll both be scared, and then we'll both come home and eat something terrible and tell each other about it. Deal?
    GUS: Deal.
    ~ mom += 1
* ["I'll be fine. I'm always fine." #deflect]
    MOM(flat): You are always fine. It's one of my least favorite things about you.
    MOM(smile): Just — have one conversation with one human being. That's the whole assignment.
- MEMERE(neutral): At the high school, don't sit with the Ashgrove boy. He talks about dead people.
MOM(surprised): Ma!
MEMERE(flat): What? He does. At the Christmas pageant he told Father Leclerc how many people died in the church fire of 1911. Forty-three. During the *Gloria.*
MEMERE(worried): And you come straight home. In October especially, you—
MOM(neutral): Ma. It's September. Pills. The yellow one.
-> ch2_drive

=== ch2_drive ===
@bg standpipe day - slow
@hide all
@amb town
@ctx Mom drives Gus to school past the ruins of the Standpipe on the hill.
Mom drives you in. Derry slides past the windows in the morning sun: white churches, brick downtown, a canal running straight through the middle of everything like a scar that healed crooked.
On a hill above the town there's a ring of broken stone, fenced off, with grass growing out of the top.
GUS: What's that?
MOM: That's where the Standpipe used to be. The water tower. It came down in the flood, in eighty-five. Half of downtown went into the canal.
MOM: Mémère said it sounded like the end of the world. We were already in Portland by then.
GUS: Why'd we leave? Derry, I mean.
MOM: ...
MOM: I needed out. That's all. Some places you just need out of.
She says it like she's answering a different question than the one you asked. Then she turns the radio up — Bonnie Raitt — and that's the end of that.
-> ch2_steps

=== ch2_steps ===
@bg school_ext morning
@music school
@amb town
@ctx Gus arrives at Derry High on the first day. Brett Lindqvist, a charming, cruel junior quarterback, and his friend Dougie are lounging on the front steps and notice her.
Derry High School is three floors of brick with DERRY HIGH SCHOOL carved over the doors and 1923 on a stone below it, as if the building wants you to know it was here first.
A banner over the entrance says WELCOME BACK TIGERS. Somebody has added an extra S in marker so it says TIGERSS, and nobody has fixed it.
On the steps, a boy in a maroon letterman jacket is holding court. Good teeth. Hair that looks expensive. He watches you come up the walk the way a cat watches a bird it isn't hungry for yet.
@show brett smile right
BRETT(smile): Hey. New girl. Nice jacket. Your dad's?
DOUGIE: Her dad's or her *mom's*?
Dougie laughs like he's being paid per laugh.
* ["It was my grandfather's. He killed a lot of people in it." #sarcastic]
    BRETT(laugh): Whoa! Okay. Okay. I like her.
    BRETT(smirk): Welcome to Derry, Grandpa.
    ~ brett_steps = "sarcastic"
    ~ brett_heat += 1
* ["Is that a letterman jacket or a cry for help?" #blunt]
    DOUGIE: OHHHH—
    Dougie actually stamps his foot. Two girls on the steps turn around.
    Brett smiles. The smile goes all the way across his face and stops just before it gets to his eyes.
    BRETT(smirk): Funny. You're funny. We'll see how funny.
    ~ brett_steps = "blunt"
    ~ brett_heat += 2
    ~ rep_brave += 1
* ["Thanks." #friendly]
    BRETT(smile): Anytime, sweetheart. Need a tour, you come find me. Brett. Everybody knows me.
    He says it like it's a gift. Dougie snickers.
    ~ brett_steps = "friendly"
* [(Walk past without looking at him.) #silent]
    You keep walking. You can feel them watching your back all the way up the steps.
    BRETT(flat): Rude.
    DOUGIE: Ooh, *rude*, Brett—
    ~ brett_steps = "ignore"
- @hide brett
-> ch2_homeroom

=== ch2_homeroom ===
@bg classroom day board_blank
@amb classroom
@ctx Homeroom, first period. Ms. Whitcomb, a bubbly first-year teacher, is taking roll. Teddy Okafor sits across the aisle from Gus.
Homeroom is Room 114, Ms. Whitcomb, English. She is young — younger than any teacher you've ever had — with hair that has clearly been fought for, a mustard cardigan, and earrings shaped like little moons.
@show whitcomb smile center
WHITCOMB(smile): Okay! Good morning, Tigers. I know, I know. Nobody wants to be here, I don't want to be here, the radiator is already making that noise. Let's just get through roll and I'll let you talk.
She goes down the list. Abbott. Ashgrove, Calvin — "Present," from a pale boy by the window, without looking up from a newspaper. Ashgrove, Sloane — "Here," from a blonde girl in the front row, without looking at anything at all.
WHITCOMB(neutral): Brennan... Augusta?
GUS: Here. It's Gus.
Ms. Whitcomb looks up. For a second her face goes completely still, like a skipped frame in a movie.
WHITCOMB(thinking): Brennan. I feel like I — sorry. Do I know your family? Brennan?
GUS: My dad's from Boston. I was born here, though. We moved when I was six.
WHITCOMB(worried): Huh. No. Must be thinking of somebody else.
She presses two fingers under her nose. When she takes them away, there's a bright bead of blood on them.
WHITCOMB(surprised): Oh — shoot. Excuse me. Dry air. Keep — everybody keep talking—
~ clue(whitcomb_flinch)
* [(Hand her a tissue from your bag.) #kind]
    You've got a crumpled pack of Kleenex in your jacket. You get up and hand it to her. She looks at you over it, surprised and grateful and something else, something that looks almost like fear.
    WHITCOMB(smile): Thank you, Gus. That's — thank you.
    ~ whitcomb += 1
    @remember whitcomb You handed her a tissue.
* ["First day jitters?" #joke]
    A few kids laugh. Ms. Whitcomb laughs too, a beat late.
    WHITCOMB(smile): Something like that. It's my first year. You're all my first. Be gentle.
* [(Watch her.) #look]
    She tips her head back and pinches her nose and looks at the ceiling, and keeps looking at the ceiling for a long time after the bleeding has obviously stopped. Like she's trying to remember something written up there.
- @hide whitcomb
@show teddy grin left
The girl across the aisle leans over so far her chair goes up on two legs. Round tortoiseshell glasses. A purple-and-teal windbreaker loud enough to be heard in Bangor.
TEDDY(grin): Hi. Okay. Hi. I'm Teddy. Technically Theodora, but if you call me Theodora I'll have to fake my own death and move to Nova Scotia.
TEDDY(smile): You're new. I'm new-ish. I've been here two years and I'm still new. People in Derry don't stop thinking you're new until your grandparents are buried in the Mount Hope cemetery.
@ctx Teddy, a talkative nerdy girl who moved from Houston, has just introduced herself to Gus in homeroom.
* ["My grandmother's working on it." #joke]
    TEDDY(laugh): Oh my god. Dark. I love it. Okay, we're friends now. That's how it works, I don't make the rules.
    ~ teddy += 2
* ["Hi. Gus." #shy]
    TEDDY(smile): Gus! Like the mouse in Cinderella. Sorry. You've heard that. Everybody's heard that. I'm doing the thing where I talk too much because I'm nervous.
    TEDDY(grin): I'm always nervous. It's sort of my brand.
    ~ teddy += 1
* ["Is everybody here this friendly, or just you?" #sarcastic]
    TEDDY(smirk): Just me. Everybody else is Derry-friendly, which is like regular friendly but with a locked door in the middle.
    ~ teddy += 1
* ["Where'd you move from?" #friendly]
    TEDDY(grin): Houston! Texas. Heat, hurricanes, Johnson Space Center, my Grandma Nkem's jollof rice. Then my mom got a job teaching geology at UMaine and boom: snow. Moose. Nobody here has ever heard of jollof rice.
    TEDDY(flat): Also nobody here had ever met a Black girl who wasn't on TV, so that's been fun for everybody.
    ~ teddy += 2
- TEDDY(neutral): Okay, quick briefing before the bell, since nobody briefed me and I had to learn it all the hard way—
She points with her pen, very fast, like a tour guide on a bus that's late.
TEDDY(smirk): Blonde, front row, perfect posture: Sloane Ashgrove. Runs freshman class. Do not make eye contact.
TEDDY(neutral): Window, newspaper, looks like a Victorian ghost: her twin, Cal. Nice, I think? He once told me the exact number of people who drowned in the canal in 1903. Unprompted.
TEDDY(worried): Back corner, buzz cut, drawing: Wes Pike. Foster kid, started in August. Lives with the Dunmores on Kansas Street. People say he stabbed a guy in Lewiston.
GUS: Did he?
TEDDY(flat): I don't know. Probably not. People say I'm from Africa.
@expr teddy smile
Ms. Whitcomb hands out locker slips. Yours says BRENNAN — 227.
TEDDY(surprised): Two-twenty-seven? Huh.
GUS: What?
TEDDY(neutral): Nothing. That's right by mine. I'm two-thirty-one. We can be locker neighbors. I'll lend you tampons and you can lend me your will to live.
@hide teddy
-> ch2_locker

=== ch2_locker ===
@bg school_hall day
@amb school
@ctx Gus finds locker 227 in the hallway. Teddy helps open it. Sloane Ashgrove has the locker next to it.
The hall smells like floor wax and somebody's Drakkar Noir. Locker 227 is olive green, dented at knee height like it has been kicked by generations of frustrated people. The combination doesn't work. Then it does, on the fourth try, with a sound like a bone coming out of joint.
Inside, it's empty except for the smell of old pennies.
And on the inside of the door, scratched deep into the paint with something sharp, inside a lopsided heart:
J.B. + N.F. '82
Below that, small, careful, scratched with the same point: a little lantern with an X through it.
~ clue(locker_initials)
~ clue(locker_lantern)
@show sloane flat right
Someone is standing at locker 229 with the stillness of a person who has never once been in a hurry.
SLOANE(flat): You're in two-twenty-seven.
GUS: Is that a problem?
SLOANE(neutral): Nobody keeps that locker. People who get it transfer. Or move. Or—
She shrugs, one shoulder, a gesture so precise it could be in a textbook.
SLOANE(smirk): It's the drafty one.
~ clue(sloane_locker)
@ctx Sloane Ashgrove, the queen bee, has just told Gus nobody keeps locker 227 for long. She's cool and cutting.
* ["Thanks for the welcome wagon." #blunt]
    SLOANE(smirk): Oh, I'm not the welcome wagon. I'm the part of the parade that tells you the welcome wagon is out of gas.
    She looks you up and down. Something in her face rearranges itself by a millimeter.
    SLOANE(neutral): You're Yvette Thibodeau's granddaughter.
    ~ sloane += 1
* ["I'm Gus. Hi." #friendly]
    SLOANE(neutral): I know who you are. Everybody knows. You're Yvette Thibodeau's granddaughter. My mother says your grandmother sewed half the christening gowns in this town.
    SLOANE(flat): She says it like it's a compliment. With my mother you can never be sure.
* ["What happened to the last person who had it?" #probe]
    Sloane's face does something very fast and very small, like a window closing in a house across the street.
    SLOANE(flat): Nothing happened. Things don't *happen* here. This is Derry. Nothing has happened here since 1923.
    ~ sloane += 1
    ~ suspicion += 0
* ["I don't believe in drafts." #sarcastic]
    SLOANE(smirk): Brave. You'll fit right in with the other people who don't believe in things.
- @show teddy neutral left
Teddy arrives at 231 with an armful of binders and a SAVE THE MANATEES pencil case.
TEDDY(grin): Hey! You got it open! The trick is violence—
SLOANE(smirk): Teddy. Your fly's down.
Teddy's wearing leggings. There's no fly. But she looks down anyway — everyone always looks down — and two girls by the water fountain laugh like it's the best thing that's happened all summer.
TEDDY(sad): ...
* ["She's wearing leggings, Sloane. Try harder." #confront]
    The girls stop laughing. Sloane turns her head and looks at you for a long, cool moment.
    SLOANE(smirk): Noted.
    TEDDY(surprised): ...
    ~ teddy += 2
    ~ sloane += 1
    ~ rep_brave += 1
    @remember teddy You stood up for her on the first day.
* [(Laugh along. Just a little.) #manipulate]
    You laugh. It comes out small and wrong. Sloane's eyes flick to you, approving, and that's somehow worse.
    Teddy's face closes up like a fist.
    ~ teddy -= 2
    ~ sloane += 1
    ~ rep_popular += 1
    @remember teddy You laughed when Sloane went after her.
* [(Ignore Sloane. Ask Teddy about her pencil case.) #kind]
    GUS: Are those manatees? On your pencil case?
    TEDDY(smile): ...Yeah. They're endangered. They get hit by boat propellers. It's very sad. They're like big sad potatoes.
    Sloane loses interest so completely it's almost a sound.
    ~ teddy += 1
* [(Say nothing.) #silent]
    You don't say anything. Teddy laughs it off — "Ha, good one" — and the moment goes past, and you can't tell if she noticed you didn't say anything. You noticed.
- @hide sloane
@expr teddy neutral
At the end of the hall, in front of the trophy case, the pale boy from homeroom is standing very still, reading a newspaper so old it's gone the color of tea.
TEDDY(neutral): That's Cal. Sloane's brother. He reads old Derry Newses at the trophy case. Like, from the library. Every morning.
GUS: Why?
TEDDY(thinking): I asked him once. He said, "Because nobody else does." Which is either deep or completely insane, and I go back and forth.
@hide teddy
-> ch2_history

=== ch2_history ===
@bg classroom day board_blank
@amb classroom
@ctx History class with bored Mr. Paulsen. Cal Ashgrove answers a question about Derry's history with a list of disasters. Afterward Cal approaches Gus.
Third period is Civics and Local History with Mr. Paulsen, who has been teaching for thirty-one years and looks like he has been dreading this period for all thirty-one of them.
PAULSEN: All right. Somebody give me an interesting fact about Derry's history. Anybody. Mr. Ashgrove, I can see your hand. Of course I can see your hand.
@show cal neutral right
CAL(neutral): In 1906 the Kitchener Ironworks exploded during an Easter egg hunt. One hundred and two people died, eighty-eight of them children.
CAL(neutral): In 1929 the townspeople shot the Bradley Gang to pieces on Canal Street and then, collectively, forgot to mention it to the State Police. In 1930—
PAULSEN: Thank you, Mr. Ashgrove—
CAL(thinking): —the Black Spot. The fire. Then 1957, '58, the children. Then '85, the flood, which wasn't really a flood—
PAULSEN: Mr. Ashgrove. "Interesting." Not "upsetting." Anybody else? Derry is the home of the largest fiberglass Paul Bunyan statue in New England. That's interesting. That's a fun one.
Cal stops talking. But you see his lips keep moving for a second, like he's finishing the list for himself.
CAL(flat): ...every twenty-seven years, give or take.
@ctx After history class Cal Ashgrove, formal and morbid, approaches Gus in the hall.
When the bell rings, Cal falls into step beside you without asking, like he's been assigned.
CAL(neutral): You're the Thibodeau granddaughter.
GUS: Brennan.
CAL(smirk): Same thing, in Derry. Blood is the only address that counts here.
CAL(thinking): Do you know what happens on October twelfth?
* ["Columbus Day weekend?" #joke]
    CAL(flat): Charming. No.
* ["Is this a riddle? I'm bad at riddles." #sarcastic]
    CAL(flat): It isn't a riddle. Riddles have answers.
* ["What happens on October twelfth?" #ask]
    CAL(neutral): That's the question, isn't it.
    ~ cal += 1
* [(Stop walking.) #silent]
    You stop. He stops too, one step past you, and turns around like a clock hand going backward.
    ~ cal += 1
- CAL(neutral): Ask your grandmother. She was in the Lantern Society with my mother for thirty-six years. Until 1982. Then she quit.
CAL(thinking): Nobody quits the Lantern Society.
~ clue(cal_october)
~ clue(memere_society)
* ["What's the Lantern Society?" #ask]
    CAL(smirk): A civic organization. Garden club. Canal Days. Christmas wreaths on the lampposts. Lovely people. My mother is the president.
    CAL(flat): They keep the town's memory. Or they keep the town from remembering. The minutes are ambiguous.
    ~ cal += 1
* ["Why are you telling me this?" #probe]
    CAL(neutral): Because you're new. New people notice things. People who grew up here have a — blind spot. Things slide off them.
    CAL(thinking): If you notice anything, I'd like to know about it.
    ~ cal += 1
* ["My grandmother has dementia. She calls me by the wrong name." #honest]
    CAL(surprised): ...
    CAL(thinking): What name?
    GUS: Junie.
    Cal writes something in a black-and-white composition notebook, fast, without looking down.
    CAL(neutral): Interesting.
    GUS: Is it?
    CAL(flat): Everything is, if you write it down.
    ~ cal += 2
* ["Mémère warned me not to sit with you." #blunt]
    CAL(smirk): She's a wise woman. I talk about dead people.
    CAL(neutral): Someone has to.
    ~ cal += 1
- @hide cal
-> ch2_lunch

=== ch2_lunch ===
@bg cafeteria day
@amb cafeteria
@music school
@ctx The cafeteria on the first day. Gus has to choose where to sit for lunch: with Teddy, at Sloane's table, outside on the bleachers with Wes, or in the library with Cal.
The cafeteria is a country with closed borders. Jocks by the windows. The cheer table. The burnouts by the tray return, in denim, conducting some kind of business. Band kids. Farm kids. A hundred tiny nations, all with their own languages.
Lunch is something called "Tiger Pizza," which is regular pizza that has given up.
Teddy waves at you from a table by herself, a paperback propped against her milk carton, so hard her whole arm goes.
At the center table, Sloane catches your eye across the room — and very slightly, so slightly you could have imagined it, tilts her head at the empty chair beside her.
Through the window you can see the bleachers by the football field. One person is sitting up at the very top, alone, with a sketchbook: Wes Pike.
And you remember Cal said, to nobody in particular in history, that he eats in the library, "where the company's quieter."
* [Sit with Teddy. #friendly]
    ~ lunch = "teddy"
    -> lunch_teddy
* [Take the chair next to Sloane. #go]
    ~ lunch = "sloane"
    -> lunch_sloane
* [Take your tray outside to the bleachers. #shy]
    ~ lunch = "wes"
    -> lunch_wes
* [Go find Cal in the library. #look]
    ~ lunch = "cal"
    -> lunch_cal

= lunch_teddy
@show teddy grin center
@ctx Lunch with Teddy at her table. She's thrilled Gus sat with her and talks a mile a minute.
TEDDY(laugh): You came! Okay. Okay. Be cool, Teddy. Be cool.
TEDDY(grin): Do you like Star Trek? Wait, don't answer that, it doesn't matter, I'll like you either way. But do you?
* ["Picard or Kirk? Choose carefully." #joke]
    TEDDY(surprised): Oh my god. Picard. Obviously Picard. Kirk is a cowboy who solves problems by taking his shirt off. Picard solves problems with *diplomacy* and *Shakespeare.*
    TEDDY(grin): You're my best friend now. I'm sorry. It's legally binding.
    ~ teddy += 2
    ~ teddy_spark += 1
* ["I've seen some." #friendly]
    TEDDY(smile): Some is good! Some is a start! I'll make you a list. It'll be short. Forty episodes, maximum.
    ~ teddy += 1
* ["Not really. I'm more into music." #honest]
    TEDDY(thinking): Music's good. What kind?
    GUS: Anything with a good sound. I record stuff, too. Not music. Places. Rain, trains, kitchens at night.
    TEDDY(surprised): Wait. Wait. You *record sounds?* Like on purpose? That's — Gus. I have a ham radio. I listen to *the whole sky* at night. We are the same person.
    ~ teddy += 2
- @ctx Teddy is telling Gus about Derry's weird "Quiet Night" tradition and almost mentions something strange her ham radio picked up.
TEDDY(neutral): Can I tell you a weird thing? About here?
GUS: Sure.
TEDDY(worried): Second Saturday in October, the whole town goes to bed at like eight o'clock. Everybody. The stores close. My dad drove to the Shop 'n Save at quarter to eight last year for milk, and the manager was pulling the grate down and wouldn't even look at him.
TEDDY(neutral): Kids call it Quiet Night. Grown-ups don't call it anything. They just... do it. My parents did it too. Dad said he was "just really tired." My dad is never tired. He's an engineer. He has a pocket protector for his pocket protectors.
TEDDY(thinking): And my radio — last year, on Quiet Night, I was up late, and the radio picked up—
She stops. She pushes her glasses up her nose.
TEDDY(flat): Never mind. It was probably Brett Lindqvist and his idiot friends with a CB. They do stuff like that.
* ["Picked up what?" #ask]
    TEDDY(worried): ...Not today. I'll show you. Sometime. If you promise not to think I'm crazy.
    GUS: I record rain for fun, Teddy.
    TEDDY(smile): Fair. Okay. Sometime.
    ~ teddy += 1
* ["Weird. Okay." #deflect]
    TEDDY(smile): Yeah. Weird. Anyway! Do you want my pudding? I don't trust it. It's too still.
* [(Tell her about the voice on your tape.) #honest]
    You tell her. The sign, the hiss, the girl who said *Gussie.* You don't know why you tell her — you haven't told your mom — except that she's looking at you like she already believes you.
    Teddy doesn't laugh. She takes off her glasses and cleans them on her windbreaker, which doesn't work, and puts them back on.
    TEDDY(worried): Okay. Okay, that's — okay. You have to show me. And I have to show you something. Saturday? My house?
    ~ teddy += 3
    @remember teddy You told her about the voice on the tape.
- @hide teddy
-> ch2_english

= lunch_sloane
@show sloane neutral center
@ctx Lunch at Sloane Ashgrove's table with her friends Kimberly and Jen. Sloane is interrogating Gus, testing her.
Sloane doesn't look up when you sit down. Two girls with identical scrunchies — Kimberly and Jen, you'll learn, though it takes a week to tell which is which — stop talking and stare at you like you're a new exhibit.
SLOANE(neutral): Where are you from?
GUS: Portland.
SLOANE(smirk): Mm. Ferry people.
KIMBERLY: Ferry people.
SLOANE(neutral): Your mother's a nurse. Your father left. Your grandmother is Yvette Thibodeau, who sewed my christening gown and who is, I'm told, now losing her mind. Did I miss anything?
@ctx Sloane has just recited Gus's family situation to her coldly in front of her friends.
* ["You missed that I don't care what you think." #blunt]
    Kimberly actually gasps. Sloane looks at you for a long second — and then, impossibly, one corner of her mouth moves.
    SLOANE(smirk): Liar. Everybody cares what I think. That's the whole point of me.
    SLOANE(neutral): But you're a better liar than most. That's something.
    ~ sloane += 2
* ["You missed my blood type. It's B-positive. Write it down." #sarcastic]
    SLOANE(smirk): Cute. I'll have someone write it down. Kimberly, write it down.
    KIMBERLY: I don't have a pen?
    SLOANE(flat): Then remember it.
    ~ sloane += 1
* ["How do you know all that?" #ask]
    SLOANE(flat): It's Derry. Everybody knows everything about everybody. That's how it stays so nice.
    SLOANE(neutral): The trick is knowing which things everybody has agreed not to know.
    ~ sloane += 1
* ["My grandmother isn't losing her mind." #confront]
    SLOANE(neutral): ...
    SLOANE(flat): No. You're right. She isn't, is she.
    She says it so quietly that Kimberly and Jen don't hear. You aren't sure you were supposed to.
    ~ sloane += 2
    @remember sloane You defended your grandmother.
- @ctx Brett walks past Sloane's lunch table and mocks her twin brother Cal. Sloane responds.
Brett Lindqvist goes by with his tray, and stops, because the world is a stage and he's been cast as the guy who stops.
@show brett smirk right
BRETT(smirk): Hey, Ashgrove. Where's your freak brother? Digging up graves? Tell him I've got a dead hamster he can—
SLOANE(flat): Brett. Your father reached out to my mother last week about whether the Society could do anything about your SAT scores. She said she'd pray on it.
SLOANE(neutral): Keep walking, and she'll keep praying.
Brett's ears go red. He keeps walking.
@hide brett
Sloane picks up her fork and goes back to her salad like nothing happened. But her hand is shaking, very slightly, and she sets the fork down again.
* ["You love him. Your brother." #probe]
    SLOANE(angry): I tolerate him. Like weather.
    SLOANE(neutral): ...Don't sit with him at lunch. People will decide things about you. You won't get to undecide them.
    ~ sloane += 1
* ["That was amazing." #friendly]
    SLOANE(smirk): I know.
    SLOANE(neutral): Don't tell anyone you saw my hand do that.
    ~ sloane += 1
    ~ sloane_spark += 1
* [(Say nothing. Eat your pizza.) #silent]
    You eat your pizza. It's terrible. Sloane watches you eat it like you've passed some test you didn't know you were taking.
    ~ sloane += 1
- SLOANE(neutral): Has your grandmother said anything... odd? About October?
GUS: She says everything odd. She called me by the wrong name.
SLOANE(worried): ...
SLOANE(flat): Old people. Anyway. You can sit here tomorrow, if you want. Or not. I genuinely don't care.
~ rep_popular += 1
@hide sloane
-> ch2_english

= lunch_wes
@bg school_ext afternoon
@amb hill
@show wes flat center
@ctx Gus eats lunch outside on the bleachers, near Wes Pike, a terse foster kid who draws in a sketchbook. He's wary.
It's warm for September. The bleachers tick in the sun. You climb up and sit three rows below Wes, which feels like the correct distance for a dog you don't know.
He doesn't look up. His pencil keeps moving. He has a split lip that's healing, and the kind of buzz cut you get when somebody else decides your hair for you.
WES(flat): Bleachers are taken.
GUS: There's like four hundred seats.
WES(flat): Yeah. They're all taken. By me. I'm very big.
* ["I'll be quiet. I'm new. It's too loud in there." #honest]
    WES(neutral): ...
    He doesn't say yes. But he moves his backpack, which was not in your way, a little farther out of your way.
    ~ wes += 1
* ["You're Wes, right? I'm Gus." #friendly]
    WES(flat): I know. Whitcomb said it. Everybody heard it.
    WES(neutral): You're new.
    GUS: So are you.
    WES(flat): I'm not new. I'm temporary. There's a difference.
    ~ wes += 1
* ["Is it true you stabbed a guy in Lewiston?" #blunt]
    His pencil stops.
    WES(flat): Yeah. With a pencil. Right in the eye. Like this one.
    He holds it up. Then he goes back to drawing.
    WES(neutral): No. I didn't stab anybody. I hit a guy with a lunch tray. He had it coming. Nobody asks what *he* did.
    ~ wes += 1
* [(Just sit. Eat. Say nothing.) #silent]
    You eat. He draws. A crow lands on the scoreboard and says something rude. Neither of you says anything for a long time, and it's the best part of your day so far.
    ~ wes += 2
- @ctx Wes is drawing in his sketchbook on the bleachers. Gus is curious about what he draws.
GUS: What are you drawing?
WES(neutral): Monsters, mostly.
He turns the sketchbook around. It's a thing made of keys — hundreds of old keys hung on wire like a body, and where the face should be, a keyhole.
WES(smirk): That one's called "the landlord."
* ["That's really good." #kind]
    WES(blush): ...It's okay. The hands are bad. I can't do hands.
    He turns the page before you can look at the hands.
    ~ wes += 1
    ~ wes_spark += 1
* ["Do you draw anything that isn't scary?" #ask]
    WES(neutral): Maps.
    He flips to the back. It's Derry — not the real streets, his version, drawn from walking around. The canal. Downtown. Kansas Street. Here and there he's made little marks, like Xs but softer.
    GUS: What are the marks?
    WES(flat): Places that feel wrong.
    WES(neutral): Don't ask me what that means. I don't know. Some places feel like they're listening.
    There's a mark on the hill where the Standpipe is. There's one in the woods by the stream. There's one, small and light, on a street near the corner of Larch.
    ~ clue(wes_map)
    ~ wes += 1
* ["Who's the landlord?" #probe]
    WES(flat): Nobody. Everybody. Whoever's got the keys.
    WES(neutral): Every house I've lived in, somebody else had the keys.
    ~ wes += 1
- WES(neutral): There's a cat. In the woods. The Barrens, people call it. One-eyed gray tom. I feed him. Don't make it a thing.
GUS: What's his name?
WES(smirk): The Admiral.
WES(flat): Because he's got one eye. Like the Admiral. Lord Nelson. Never mind. It's from a book. I read, okay.
@hide wes
-> ch2_english

= lunch_cal
@bg library day
@amb library
@show cal neutral center
@ctx Gus finds Cal Ashgrove eating lunch alone in the school library, surrounded by microfilm printouts of old Derry newspapers. He's pleased and suspicious.
The school library is the one grand room in Derry High, built back when the town had money and wanted you to know it: tall oak shelves, green-shaded lamps, a ceiling you could lose a balloon in.
Cal is at a table in the back with a peanut butter sandwich, an apple, and a fan of photocopied newspaper pages laid out around him like a game of solitaire.
CAL(surprised): You came to the library.
GUS: You said the company was quieter.
CAL(smirk): I say a lot of things. People don't usually test them.
He moves a stack of printouts off the chair across from him. Under them is a black-and-white marbled notebook. On the cover, in neat block capitals: THE DERRY BOOK.
* ["What's the Derry Book?" #ask]
    CAL(neutral): Everything that's happened here that people would rather hadn't. Dates. Names. Newspaper clippings, when there are any. There usually aren't.
    CAL(thinking): You'd be amazed how many things in Derry were never reported. Or were reported once, and then the next day, nothing. As if the town blinked.
    ~ cal += 1
* ["Can I look?" #friendly]
    CAL(flat): No.
    CAL(neutral): ...Maybe. Not today.
    ~ cal += 1
* [(Look at the printouts instead.) #look]
    The printouts are old Derry News front pages. October, every one of them. 1961. 1971. 1979. 1982. 1986. Canal Days photos: crowds, paper lanterns on dark water, smiling men in hats.
    CAL(neutral): Canal Days. Every October. And the next morning — nothing. Ever. Read the October thirteenths. Go on.
    You read the October thirteenths. Bake sale results. A lost dog. Weather.
    GUS: There's nothing here.
    CAL(smirk): Exactly.
    ~ cal += 2
    ~ clue(library_1982)
- @ctx Cal is asking Gus about her grandmother Mémère, who used to be in the Lantern Society with his mother.
CAL(thinking): Your grandmother. Does she ever talk about a lamp?
GUS: A lamp?
CAL(neutral): A lantern. "The Lamp." Capital L.
GUS: She wears a little lantern pin. On her sweater.
Cal goes very still. Then he writes something in the Derry Book, fast, covering the page with his hand.
CAL(flat): So does my mother. So does Principal Fenwick. So does the librarian at the public library. So does Officer Lindqvist. Brett's father.
CAL(neutral): It's a civic organization. Garden club. Lovely people.
* ["You think it's more than that." #probe]
    CAL(neutral): I think things are usually more than that, in Derry.
    CAL(thinking): If your grandmother says anything about the Lamp — anything — I'd like to know. I'd consider it a favor. I don't ask for many.
    ~ cal += 1
* ["Mémère says you talk about dead people." #joke]
    CAL(smirk): The dead are excellent conversationalists. They never interrupt.
    CAL(neutral): And they never lie about how they got that way. The living are worse at that.
    ~ cal += 1
* ["Why do you care so much?" #ask]
    Cal looks at you for a long moment. Behind his glasses his eyes are very tired, like he's been awake since he was eight.
    CAL(flat): Because somebody should.
    ~ cal += 1
- ~ rep_weird += 1
@hide cal
-> ch2_english

=== ch2_english ===
@bg classroom day
@amb classroom
@music stop 3
@ctx Sixth-period English with Ms. Whitcomb. The class is discussing Shirley Jackson's "The Lottery." Teddy, Sloane, Cal and Wes are all in the class.
Sixth period is English again, Ms. Whitcomb again, and she's written on the board in big loopy chalk:
THE LOTTERY — Shirley Jackson (1948). Why do they keep doing it?
@show whitcomb smile center
WHITCOMB(smile): Okay. You read it over the summer. Don't lie to me, I can see the lying on your faces. If you didn't read it, it's six pages. Read it now, I'll wait.
WHITCOMB(neutral): A small town. Every June, they hold a lottery. Everybody draws a slip of paper. And whoever gets the slip with the black dot...
WHITCOMB(flat): ...gets stoned to death by their neighbors. Their friends. Their kids.
WHITCOMB(thinking): So. Why do they keep doing it?
KIMBERLY: Because it's tradition?
WHITCOMB(smile): Good! Tradition. Okay. But why keep a tradition that horrible? Anybody?
@show cal neutral right
CAL(neutral): Because whoever stops it would have to admit they were wrong every other year.
@hide cal
@show sloane flat right
SLOANE(flat): Because if you stop it, you're the one who gets picked.
She doesn't look up when she says it. The room goes a little quieter.
@hide sloane
@show wes flat right
WES(flat): Because it's never them. Until it is.
@hide wes
@show teddy neutral left
TEDDY(neutral): Because nobody wants to be the one weird person who says "hey, this is bad." That's the real horror. The peer pressure.
@hide teddy
WHITCOMB(smile): Okay — wow, okay, you guys are dark. I love it. Gus? You're new. Fresh eyes. Why do they keep doing it?
@ctx Ms. Whitcomb asks Gus why the villagers in "The Lottery" keep doing it. Everyone is looking at her.
* ["Because they're scared of what happens if they stop." #honest]
    WHITCOMB(thinking): Scared of what, though? The story never says what happens if they stop.
    GUS: That's why it's scary. They don't know either. They just know they're scared.
    WHITCOMB(smile): ...Yeah. Yeah, that's really good, Gus.
    ~ lottery_answer = "scared"
* ["Because it works." #blunt]
    The room goes dead quiet.
    WHITCOMB(surprised): Works how?
    GUS: There's that old man. He says the corn won't grow without it. Maybe he's right. Maybe it does work. That's worse, isn't it? If it works?
    Ms. Whitcomb stares at you. In the front row, Sloane has turned all the way around in her seat.
    ~ lottery_answer = "works"
    ~ sloane += 1
    ~ cal += 1
* ["Because they forgot why they started." #probe]
    WHITCOMB(thinking): Ooh. Say more.
    GUS: The box is falling apart. Nobody remembers the words they're supposed to say. They've forgotten everything except the part where somebody dies.
    WHITCOMB(worried): ...Right. Right. They forget.
    She rubs her forehead like it hurts.
    ~ lottery_answer = "forgot"
    ~ cal += 1
* ["Because they're cowards." #confront]
    WHITCOMB(smile): Strong. But — is everybody a coward? Tessie objects. At the end.
    GUS: Only when it's her.
    WHITCOMB(flat): ...Only when it's her. Yeah.
    ~ lottery_answer = "cowards"
    ~ rep_brave += 1
* ["I didn't read it." #lie]
    A few kids laugh.
    WHITCOMB(smirk): Six pages, Gus. I believe in you.
    ~ lottery_answer = "none"
- @expr whitcomb neutral
WHITCOMB(neutral): Okay. Big project for the semester, and you'll pair up for it next week, so start making friends or enemies. It's called Derry Voices.
WHITCOMB(smile): You're going to find somebody who's lived in this town at least thirty years and interview them. On tape, if you can. Their memories. Their stories. Derry's history from the people who lived it.
WHITCOMB(thinking): Because a town is just... the stories people agree to keep telling. Right?
Two rows back, Cal writes something in his notebook and underlines it twice.
@hide whitcomb
-> ch2_bully

=== ch2_bully ===
@bg school_ext afternoon
@amb town
@music tension
@ctx After school by the bike rack. Brett and Dougie have Wes Pike pinned against the fence and are tearing pages out of his sketchbook. Gus sees it happen.
After the last bell you take the long way around the gym, because the short way goes past the cheerleaders practicing and you've had enough people today.
Behind the gym, by the bike rack, Brett Lindqvist has Wes Pike against the chain-link fence. Dougie's holding Wes's arm. Brett's holding the sketchbook.
@show wes angry left
@show brett smirk right
BRETT(laugh): Draw me something, Pike. Come on. Draw me your mom.
BRETT(smirk): Oh, wait. You don't know what she looks like.
He tears a page out. The key monster. He folds it in half, slowly, and tears it again.
Wes doesn't say anything. His face isn't scared. It's worse than scared. It's bored, like this is weather, like this has happened in every town and every school and he's just waiting for it to rain itself out.
@ctx Brett is tearing up Wes's drawings while Dougie holds him. Gus has seconds to decide what to do.
* [Get between them. #confront #timed:9]
    -> bully_fight
* ["Mr. Fenwick's coming!" #lie]
    -> bully_trick
* [Run and get a teacher. #action]
    -> bully_teacher
* [Hit record. Get it on tape. #record]
    -> bully_record
* [Keep walking. Not your fight. #leave #default]
    -> bully_walk

= bully_fight
~ bully_choice = "fight"
You don't decide to do it. Your feet decide, and you follow them.
GUS(angry): Hey. Give it back.
BRETT(surprised): Whoa. Whoa! New girl's got a crush.
BRETT(smirk): {brett_steps == "sarcastic":Grandpa's jacket. You gonna kill me in it?|Army jacket. You gonna fight me in it?}
* ["I'll settle for embarrassing you. Should be easy." #confront]
    DOUGIE: Ohhh—
    BRETT(angry): ...
    For a second you think he might actually hit you. Then he looks around — at the windows of the gym, at the girl walking her bike past with her mouth open — and he smiles instead.
* [(Grab the sketchbook out of his hand.) #action]
    You grab it. He's not expecting it. Nobody ever does that to Brett Lindqvist; you can see it on his face, the pure surprise of it, like a dog that's never been told no.
- He drops the sketchbook in the dirt.
BRETT(smirk): Sure. Take it. See you around, {brett_steps == "sarcastic":Grandpa|new girl}. Derry's a small town.
@hide brett
~ brett_heat += 2
~ rep_brave += 1
~ wes += 2
@remember brett You got in his way.
WES(angry): I didn't need help.
GUS: Okay.
WES(flat): I'm serious. Now he's gonna — now you're on his list. You don't want to be on his list.
He picks up the torn pages and smooths them against his leg, very carefully, one at a time.
WES(neutral): ...Thanks. I guess. Don't do it again.
@remember wes You stood up for him.
-> ch2_walk

= bully_trick
~ bully_choice = "trick"
GUS(afraid): Mr. Fenwick's coming! He's right around the corner!
Brett drops the sketchbook like it's hot and steps back, hands in his pockets, instantly a different person — a golden boy, a nice young man, a credit to his family.
BRETT(smile): Just helping Wes with his stuff. He dropped his stuff.
Nobody comes around the corner. Brett waits. Looks at you. You watch him work it out.
BRETT(smirk): Huh. Smart. You're a smart one.
BRETT(flat): I'll remember that.
@hide brett
~ brett_heat += 1
~ wes += 1
WES(neutral): ...That was a good lie.
GUS: Thanks. I practice.
WES(smirk): Yeah. Me too.
-> ch2_walk

= bully_teacher
~ bully_choice = "teacher"
You run. Around the gym, through the side door, almost straight into a man in a bow tie and a walrus mustache carrying a clipboard.
@hide all
@show fenwick smile center
FENWICK(smile): Whoa there, young lady! No running in the halls, there's a reason we have the rule—
GUS: There's a fight. Behind the gym. Brett Lindqvist—
FENWICK(neutral): Brett? Brett's a good kid. Let's go see.
By the time you get back, Brett and Dougie are leaning on the fence like they've been waiting for a bus, and Wes is picking pages up out of the dirt.
@show brett smile right
FENWICK(smile): Everything okay here, boys?
BRETT(smile): Yes, Uncle Dale. Wes dropped his book. We were helping.
FENWICK(laugh): Ha! Uncle Dale at home, Mr. Fenwick at school, Brett, how many times. All right. Everybody home. Go on.
He claps Brett on the shoulder as he goes. Brett winks at you over the principal's arm.
@hide all
@show wes flat center
WES(flat): Thanks a lot.
GUS: I was trying to—
WES(angry): Yeah. I know what you were trying. His *uncle,* Gus. Everybody in this town is somebody's uncle.
~ wes -= 1
~ brett_heat += 1
-> ch2_walk

= bully_record
~ bully_choice = "record"
You duck behind the dumpster and thumb RECORD. The little reels turn. Your hands are shaking. You hold the recorder up over the edge like a periscope.
BRETT(laugh): —don't even know what she looks like, huh? Bet she's in a ditch somewhere. Bet she *chose* the ditch—
DOUGIE: Brett, man, come on—
BRETT(flat): Shut up, Dougie.
It goes on for another minute. Then a car horn honks from the parking lot, and Brett drops the sketchbook in the dirt, and they leave laughing.
~ tape(tape_brett)
~ brett_heat += 0
@hide brett
You come out from behind the dumpster. Wes is picking up the pages. He sees the recorder in your hand.
WES(angry): Were you taping that?
* ["It's evidence. If he does it again, people will have to believe you." #honest]
    WES(flat): Nobody has to believe a foster kid. That's the whole thing about being a foster kid.
    WES(neutral): ...But okay. Keep it. Maybe.
    ~ wes += 1
* ["Leverage. Brett's not going to want his uncle hearing that." #manipulate]
    WES(thinking): ...Huh.
    WES(smirk): That's kind of evil. I respect it.
    ~ wes += 1
* ["I'm sorry. I froze." #shy]
    WES(flat): Yeah. People do.
    ~ wes -= 1
- -> ch2_walk

= bully_walk
~ bully_choice = "walk"
You keep walking. You keep your eyes on the sidewalk. Behind you, the sound of paper tearing, and Brett laughing, and then a long quiet that is somehow the loudest part.
When you look back from the corner, Wes is watching you go. He doesn't look angry. He doesn't look anything. He looks like a person who expected exactly this.
~ wes -= 2
@remember wes You walked away.
@hide all
-> ch2_walk

=== ch2_walk ===
@hide all
@bg park afternoon
@amb town
@music school
@ctx Walking home after the first day of school. A group of little kids, including Hannah from next door, are playing a jump-rope game and singing a rhyme.
{teddy >= 3:
    -> with_teddy
}
You walk home alone through Bassey Park, under maples that are just starting to turn at the edges, like paper held too close to a candle.
A giant fiberglass Paul Bunyan watches over the playground with his axe on his shoulder and an expression of permanent, cheerful violence.
-> kids

= with_teddy
~ walked_with_teddy = true
@show teddy smile left
Teddy catches up with you at the corner, panting, her backpack bouncing.
TEDDY(grin): Hey! You walk home this way? I walk home this way! I mean, I don't, I live on the other side of the canal, but I can walk home this way. It's a free country. Mostly.
TEDDY(smile): So. First day. Rate it. One to ten.
* ["Seven. You were the good part." #friendly]
    TEDDY(blush): Shut up. Shut *up.* Okay. That's — okay.
    ~ teddy += 1
    ~ teddy_spark += 1
* ["Four. The pizza was a two." #joke]
    TEDDY(laugh): The pizza is always a two. The pizza is load-bearing for the whole scale.
* ["Too early to tell." #deflect]
    TEDDY(smirk): Spoken like a true Mainer. You're assimilating.
- TEDDY(neutral): Come over Saturday? I want to show you my radio. And the thing. The thing I said I'd show you.
GUS: The Quiet Night thing.
TEDDY(worried): Yeah. That thing.
-> kids

= kids
By the swings, a group of little kids is playing jump rope. Two of them turn the rope; the rest stand in a circle with their eyes squeezed shut. One of them is Hannah, from next door, in the same pink sweatshirt.
They're chanting. The rhythm is the slap of the rope on the asphalt.
KIDS: Lantern, lantern, burning low — who goes walking? Who's to know?
KIDS: Close your eyes and hold your breath — never answer, never guess—
Hannah opens her eyes and sees you watching. She stops. All of them stop, one after another, like a record winding down. The rope goes slack.
They stare at you until you keep walking.
{walked_with_teddy:
    TEDDY(worried): They do that every fall. That song. Nobody knows where it comes from. I asked my mom and she said "what song," and then she got a headache.
    @hide teddy
}
~ heard_rhyme = true
~ clue(rhyme)
-> ch2_evening

=== ch2_evening ===
@bg living evening
@amb house
@music larch
@ctx That evening at home. Mémère is having a bad night: agitated, searching for "Junie's bicycle," saying "they" will come to take it. Mom is home late and exhausted.
Mémère is not having a good night.
When you get home she's in the front hall in her housecoat with the closet door open, pulling out coats and dropping them on the floor. Galoshes. An umbrella. A box of Christmas lights.
@show memere afraid center
MEMERE(afraid): Where's the bicycle? Where did you put Junie's bicycle?
GUS: Mémère, I don't—
MEMERE(angry): They'll come for it. They always clean up. They come with casseroles and they *take everything,* and you thank them. You *thank* them—
@show mom worried left
Your mother comes in behind you, still in her scrubs, car keys in her hand, and takes it in at a glance. Something in her face goes very tired and very practiced.
MOM(neutral): Okay, Ma. Okay. Let's sit down. Gus, honey, can you get her blue pill? Kitchen windowsill. The little blue one.
* [(Get the pill. Fast.) #action]
    You bring it with a glass of water. Your grandmother takes it from your hand without looking at you, and swallows it, and starts to cry, very quietly, like a faucet left on.
    ~ mom += 1
* [(Kneel down and take Mémère's hands.) #kind]
    You kneel on the pile of coats and take her hands. They're cold. They're shaking.
    GUS: Mémère. It's okay. Nobody's taking anything. I'm right here.
    She looks at you. For a moment she's completely, terribly clear.
    MEMERE(sad): You're not, though. That's the thing, ma belle. You're not.
    ~ mem += 1
    ~ mom += 1
* ["Who's coming? Who cleans up?" #probe]
    MEMERE(afraid): The Society. The Lantern ladies. With their casseroles and their—
    MOM(angry): Gus. The pill. Now, please.
    Your mother's voice is sharp enough to cut. You go get the pill.
    ~ clue(memere_society)
- @hide memere
@ctx Later that night, after Mémère is asleep, Gus finds her mom sneaking a cigarette on the back steps.
@bg larch_ext night
@amb night
@music warm
It takes an hour to get Mémère to sleep. Afterward you find your mother on the back steps in the dark, in her scrubs, with a cigarette she's holding like it's somebody else's.
@show mom sad left
MOM(sad): Don't. I know. I'm holding it. I'm not smoking it. It's a support cigarette.
* ["I won't tell if you won't." #joke]
    MOM(laugh): Deal. What are you not telling?
    GUS: That I liked school a little.
    MOM(smile): Oh, that's disgusting. Your secret's safe with me.
    ~ mom += 1
* ["You told me you quit." #confront]
    MOM(flat): I did quit. I quit like eleven times. I'm very good at quitting.
    MOM(sad): Today I was not good at it. Okay? Today I am going to be bad at it for one cigarette's worth.
* [(Sit down next to her.) #kind]
    You sit down beside her on the cold step. She doesn't say anything. After a while she puts her arm around you, the cigarette held far away on the other side like she's protecting you from it.
    ~ mom += 2
- MOM(sad): I left this town at eighteen with a duffel bag and a hundred and ten dollars and I swore I'd never come back.
MOM(flat): And then I came back anyway. Married your dad, had you, lived here till you were six. And then I left again. And now I'm back in my mother's house, and she thinks I'm somebody else half the time, and the coffee at the hospital is from 1974.
* ["Who's Junie?" #ask]
    MOM(neutral): Hm?
    GUS: Mémère keeps calling me Junie.
    MOM(thinking): Oh. Her little sister. June. She died when they were kids — diphtheria, I think, in the twenties. Mémère was maybe six.
    MOM(sad): So now she sees ghosts everywhere. In you. In me. In the mailman.
    {Clues ? mom_patch:
        THINK: That's three different answers now. A sister Mom doesn't have. A pet name. Now Mémère's own little sister. She says every one of them like she's always known it.
    - else:
        {ch1_memere.asked_junie:
            THINK: Last night she said "Junie" was what Mémère used to call *her.* Junebug. Now it's a dead great-aunt. She doesn't seem to hear herself.
        }
    }
    ~ clue(mom_patch)
* ["Why did you leave? The second time?" #probe]
    MOM(thinking): I told you. I needed out.
    GUS: Out of what?
    MOM(neutral): ...
    Your mother opens her mouth, and closes it, and opens it again, and touches her nose. When she takes her hand away, there's blood on her fingers, black in the dark.
    MOM(surprised): Oh — god. Dry air. This whole town is dry air.
    She pinches her nose and tips her head back and laughs, and it isn't a real laugh.
    ~ clue(mom_patch)
* ["I'm glad we came back." #kind]
    MOM(surprised): ...You are?
    GUS: Kind of. Don't make it weird.
    MOM(smile): I would never make it weird. I'm going to make it so weird. I'm going to tell everyone at work.
    ~ mom += 2
    @remember mom You told her you were glad you came back.
- @hide mom
-> ch2_radio

=== ch2_radio ===
@bg gus_room night
@music stop 2
@amb night
@ctx 3 a.m. Gus's clock radio turns itself on to static. A flat voice reads a list of names.
You fall asleep fast, for once. You dream about nothing.
At 3:00 exactly, the clock radio on your nightstand clicks on by itself.
@amb static
@sfx radio_tune
Static. Loud, then soft, like breathing. You fumble at it in the dark—
And under the static, a voice. Flat. Patient. Like someone reading a grocery list to a room that isn't listening.
RADIO: —Peter Dunn. Marcus Lowell. Toby Mercer.
RADIO: Daniel Carrier. Rose Teague.
* [Grab your recorder. #record]
    You grab for the recorder on the nightstand and knock it to the floor. By the time you get it, by the time you find the button in the dark—
    RADIO: —June—
    @sfx static_burst
    Click. Silence. Your tape has eleven seconds of hiss on it and one syllable at the very end that could be anything.
* [Turn it off. #action]
    You slap at the radio until the static stops.
    In the silence, very faintly, you're sure you hear it finish the last name without any radio at all.
    RADIO: —June—
    Then nothing.
* [Lie still. Listen. #silent]
    You lie perfectly still with your heart going like a rabbit's.
    RADIO: —Brenn—
    @sfx static_burst
    Click. The radio is off. The red numbers say 3:01, like nothing happened.
- ~ heard_radio = true
~ clue(radio_names)
@amb night
You don't sleep again. You lie there and say the names to yourself so you won't lose them, the way you'd hold water in your cupped hands.
Peter Dunn. Marcus Lowell. Toby Mercer. Daniel Carrier. Rose Teague.
And one more, cut off. June.
@wait 1
@fx blackout
@wait 1.5
-> ch3
