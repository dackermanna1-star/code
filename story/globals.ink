// What Derry Keeps — Episode One — globals
// Personality: the runtime adds 1 to these from each choice's tone tag.
VAR t_warm = 0
VAR t_funny = 0
VAR t_bold = 0
VAR t_careful = 0
VAR t_sly = 0
VAR t_honest = 0
VAR t_curious = 0

// Relationships. Numbers are only a summary; scenes also check what actually happened.
VAR mom = 0          // closeness with Claire
VAR mem = 0          // bond with Mémère
VAR dad = 0
VAR teddy = 0
VAR teddy_spark = 0
VAR cal = 0
VAR sloane = 0       // Sloane's respect
VAR sloane_spark = 0
VAR wes = 0
VAR wes_spark = 0
VAR whitcomb = 0
VAR nate = 0
VAR dot = 0
VAR teague = 0
VAR brett_heat = 0   // how much Brett has decided Gus is his problem
VAR suspicion = 0    // how much the Lantern Society has noticed Gus

// Reputation at Derry High
VAR rep_brave = 0
VAR rep_weird = 0
VAR rep_popular = 0

// Clues and recordings (the runtime also keeps these for the notebook)
LIST Clues = rules, casseroles, junie, sign_voice, four_plates, rearview, height_marks, dad_recorder, claire_song, hannah_quiet, locker_initials, locker_lantern, sloane_locker, whitcomb_flinch, cal_october, memere_society, mom_patch, radio_names, rhyme, dot_cheese, daniel_carrier, nate_song, nate_jb, library_1982, library_photo, standpipe_lantern, teddy_tape, wes_map, memere_gave, minutes_1982, broken_e, wes_note, starving_winter, the_wall, teague_cost, june_photo, june_tapes, june_id, june_notes, dad_call, memere_warning, upstream_lantern, society_pins, overheard, yearbook_1983
LIST Tapes = tape_memere_story, tape_car, tape_night, tape_canal_kids, tape_wes, tape_brett, tape_memere, tape_dot, tape_teague, tape_constance, tape_june_bedtime, tape_june_research, tape_june_last, tape_teddy_radio, tape_creek, tape_payphone, tape_wes_october

=== function clue(c)
~ Clues += c
@clue {c}

=== function tape(t)
~ Tapes += t
@tape {t}

=== function remember(who, memo)
@remember {who} {memo}

=== function jot(who, memo)
@note {who} {memo}

=== function decide(text)
@decide {text}

=== function up(ref x, by)
~ x = x + by

=== function trait_top()
// Gus's strongest trait so far, for scenes that react to who she's becoming
{
- t_bold >= t_careful && t_bold >= t_warm && t_bold >= t_funny && t_bold >= t_sly:
    ~ return "bold"
- t_funny >= t_careful && t_funny >= t_warm && t_funny >= t_sly:
    ~ return "funny"
- t_warm >= t_careful && t_warm >= t_sly:
    ~ return "warm"
- t_sly > t_careful:
    ~ return "sly"
- else:
    ~ return "careful"
}

// ---------- Chapter 1 ----------
VAR taped_over_sign = false
VAR heard_sign_voice = false
VAR met_hannah = false
VAR saw_heights = false
VAR asked_four_plates = false
VAR dad_call_warm = false

// ---------- Chapter 2 ----------
VAR brett_steps = ""      // how Gus answered Brett on the steps
VAR lunch = ""            // teddy | sloane | wes | cal
VAR lottery_answer = ""
VAR bully_choice = ""     // fight | trick | teacher | record | walk
VAR heard_radio = false
VAR walked_with_teddy = false

// ---------- Chapter 3 ----------
VAR visits = 0
VAR recorded_wes = false
VAR wes_tape_day = "Saturday" // the day Wes said on Gus's tape
VAR told_librarian = ""   // what Gus told Mrs. Fennimore she was researching
VAR evening3 = ""         // teddy | memere
VAR heard_rhyme = false
VAR knows_rules = false
VAR asked_daniel = false

// ---------- Chapter 4 ----------
VAR partner = ""          // teddy | cal | wes | sloane
VAR friday = ""           // party | movie | mom
VAR interview = ""        // memere | dot | teague | constance
VAR saw_minutes = false
VAR saw_note = false
VAR knows_wall = false
VAR knows_cost = false
VAR knows_june = false
VAR has_key = false
VAR told_mom = false
VAR told_teddy = false
VAR told_cal = false
VAR told_wes = false
VAR told_sloane = false
VAR told_whitcomb = false
VAR played_nate = false
VAR warned_wes = false
VAR asked_memere = 0

// ---------- Chapter 5 ----------
VAR float_with = ""
VAR wrote_june = false
VAR overheard_society = false
VAR caught_at_tent = false
VAR knows_wes_target = false
VAR ally_teddy = false
VAR ally_cal = false
VAR ally_sloane = false
VAR wes_promised = false   // he promised to stay home
VAR wes_stops = false      // he promised to stop if he hears Gus

// ---------- Chapter 6 ----------
VAR went_out = false
VAR anchors = 0
VAR answered_voice = false
VAR looked_back = false
VAR brett_present = false
VAR outcome = ""          // wes | brett | memere
VAR window_choice = ""    // open | closed | song
