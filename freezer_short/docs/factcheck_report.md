# Adversarial fact-check report

Every narration line and on-screen label was checked by two independent agents with web access: a researcher looking for supporting evidence and a skeptic trying to refute it. A judge then merged their verdicts. Text was changed when either reviewer found a sourced error, or when both raised the same concern. All changes are in `docs/narration.txt` (the previous script is in `narration_v1.txt`) and in the shots and overlays.

## Summary

14 of 28 items need a change, 14 are fine as they are.

**Substantive fixes** (a reviewer marked wrong or misleading, with sources):
- **C9:** the walls are thin steel over foam, not thick metal, and losing signal is not guaranteed.
- **C15:** shivering usually stops around 30 C, below 32, not as you near 32.
- **C20:** the line defined hypothermia incorrectly; the mild stage involves strong shivering.

**Consensus tweaks** (both reviewers marked accurate_but_simplified with the same concern):
- C2: 'blasting' and 'frozen air'
- C4: hedge the 37 degrees
- C5: blood flow to the hands is reduced, not pulled away
- C6: 'involuntary contractions' instead of 'twitches'
- C7: add radiation to the walls
- C10: say 'walk-in'
- C13: hedge the symptoms
- C14: frame it as what to do while waiting for help, not 'your best move'
- C21: rare cases, body temperature, rescuers' rule
- O2: rewarm gradually, torso first
- O4: faint, brief handprint and no bare palm held on the steel

C6 and C7 are low priority but meet the rule. The new lines are about the same length; C6, C15 and C21 each add roughly half a second to a second.

**No change:** C1, C3, C8, C11, C12, C16, C17, C18, C19, O1, O3, O5, O6, O7. Where only one reviewer marked a claim as simplified (C3, C12, C18, O1, O5), I kept it.

**Timing:** play the C15 line after the HUD has passed into MODERATE, not exactly when it flips at 32.

**Sources I checked myself:**
- The WMS 2019 guideline full text, for the shivering-cessation quotes, the definitions, the dictum caveat, ground insulation and rewarming rate.
- The Auckland -20 C near-miss alert ('The technician's cell phone had signal').
- The WorkSafeNB mushroom-cap alert (kick or strike the cap; inspect it regularly).
- The NIOSH cold-stress page ('Avoid touching cold metal surfaces with bare skin').
- The CDC winter-weather page (warning signs; warm the center of the body first).
- A web search that confirmed the AAFP summary of the guideline.

All other URLs are the reviewers' citations, which I relied on but did not reopen.

## Decisions

### C1 — kept

Both reviewers marked it accurate. Walk-in and industrial freezers typically run at about -18 to -23 C, and the documented Auckland near-miss happened in a -20 C walk-in.

- https://www.auckland.ac.nz/content/dam/uoa/auckland/health-safety-wellbeing/news-updates-safety-alerts/safety-alert-walk-in-freezers-nov-19-v3.pdf
- https://operandio.com/walk-in-freezer-temperature/

### C2 — CHANGED
**Final:** and fans keep pushing freezing air across your body.

Both reviewers marked it accurate_but_simplified and both said 'blasting' overstates the airflow. Measured drafts in refrigerated rooms are about 0.1-1.3 m/s, a steady draft rather than a blast. The skeptic also noted 'frozen air' is figurative, since air does not freeze at -20 C. The fans and the wind-chill effect are real, so only the wording changes.

- https://natural-resources.canada.ca/node/14091
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4540649
- https://www.osha.gov/winter-weather/cold-stress

### C3 — kept

The researcher marked it accurate. The skeptic only raised a tone concern about 'just', which is not a factual error. Skin thermoreceptors fire within seconds, and WMS separates being cold from being hypothermic: 'Patients can be cold and shivering, but not hypothermic.'

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC2496891

### C4 — CHANGED
**Final:** Your core is still normal: around thirty-seven degrees.

Both reviewers raised the same concern. 'A normal thirty-seven degrees' presents one exact number as everyone's normal, but normal core temperature differs between people and over the day (pooled rectal range about 36.3-37.8 C). The brief forbids implying everyone is the same, so the line needs a hedge. The HUD's 37.0 is still fine as an illustrative value.

- https://pmc.ncbi.nlm.nih.gov/articles/PMC6456186/
- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf

### C5 — CHANGED
**Final:** To protect it, your body squeezes the blood vessels in your skin, cutting the flow of warm blood to your hands.

Both reviewers raised the same concern. Vasoconstriction does not actively pull blood out of the hands. It reduces how much warm blood flows into the skin and hands, so more stays in the core. The mechanism itself is correct (sympathetic cutaneous vasoconstriction).

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4843861
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4593810
- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf

### C6 — CHANGED
**Final:** Then the shivering starts: rapid, involuntary muscle contractions that burn energy to make heat.

Low priority. Both reviewers marked it accurate_but_simplified for the same reason: 'twitches' is loose. Shivering is involuntary, rhythmic contraction of muscle, which WMS says can raise heat production 5-6x. Both proposed the same fix. The new line is about half a second longer.

- https://pmc.ncbi.nlm.nih.gov/articles/PMC5605160
- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf

### C7 — CHANGED
**Final:** But heat is escaping everywhere: into the air and walls, out with every breath, and into anything you touch.

Low priority. Both reviewers flagged the same gap: radiant heat goes to the cold walls, ceiling and stock, not into the air. Radiation is the largest heat-loss route at rest, and the line folds it into 'air'. Adding two words covers it and keeps the rhythm. Conduction, convection and respiratory loss are all correctly named (WMS).

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.healthlinkbc.ca/healthwise/cold-exposure-ways-body-loses-heat

### C8 — kept

Both reviewers marked it accurate. Loss of dexterity and numbness in cold hands are well documented, and CDC and OSHA list 'fumbling hands'. The line gives no time.

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4843861
- https://www.cdc.gov/winter-weather/prevention/index.html

### C9 — CHANGED
**Final:** And the metal-clad walls can block your signal.

The skeptic marked it misleading and gave sources; the researcher flagged the same two issues. First, walk-in walls are mostly foam between thin steel skins about 0.5 mm thick, so 'thick metal' is wrong. Second, signal loss is not guaranteed. I checked the Auckland alert directly: two staff locked in a -20 C walk-in were rescued because 'The technician's cell phone had signal'. Presenting signal loss as certain could stop a real trapped person from trying to call. The on-screen 'No Service' still works with 'can'.

- https://www.auckland.ac.nz/content/dam/uoa/auckland/health-safety-wellbeing/news-updates-safety-alerts/safety-alert-walk-in-freezers-nov-19-v3.pdf
- https://safework.sa.gov.au/workplaces/work-sites-and-facilities/cold-storage-facilities
- https://beta.norlake.com/wp-content/uploads/2024/03/fineline-custom-walk-ins-specification-sheet-090773.pdf

### C10 — CHANGED
**Final:** Then you remember: most walk-in freezers have an emergency release inside the door.

Both reviewers raised the same concern. The bare word 'freezers' includes chest and household freezers, which have no inside emergency release. Adding 'walk-in' makes it exact and matches the O6 end card. Inside releases on walk-ins are standard and required by Cal/OSHA 3249 and WA WAC 296-800-31067, so 'most' is a fair hedge.

- https://dir.ca.gov/Title8/3249.html
- https://lawfilesext.leg.wa.gov/Law/WAC/WAC%20296%20%20TITLE/WAC%20296%20-800%20%20CHAPTER/WAC%20296%20-800%20-31067.htm
- https://kpsglobal.com/blog/walk-in-cooler-freezer-safety-features/

### C11 — kept

Both reviewers marked it accurate. I checked the WorkSafeNB alert directly: dripping water froze inside a mushroom-cap release over 'weeks or even months' and trapped a worker. The IMCA and Pret cases are similar. Safety caveat (see flags): WorkSafeNB says people 'might need to kick the cap several times or hit it with a heavy object to break the ice'. The visuals should show a real attempt, not suggest the release can never be freed.

- https://www.worksafenb.ca/hazard-alerts/en/frozen-mushroom-cap-handle-traps-worker-inside-freezer.html
- https://www.imca-int.com/resources/safety/safety-flashes/0426-cook-temporarily-trapped-in-freezer

### C12 — kept

The researcher marked it accurate. The skeptic marked it simplified because it implies one cooling pace, but C19 already covers individual variation. The threshold is correct (WMS: 35 C or lower; ERC/Paal: below 35 C). 'Hours can pass' is vague and invents no survival time.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8744717

### C13 — CHANGED
**Final:** In this mild stage, you'll likely shiver violently. Your hands fumble, your speech may slur, and your judgment starts to slip.

Both reviewers raised the same concern. The signs are stated as certain for everyone, but where slurred speech falls varies between sources and people (OSHA groups it with moderate-to-severe), and exhaustion, drugs or illness can blunt shivering (WMS: 'Many drugs and medications suppress shivering'). The brief forbids implying identical experiences, so light hedges are added. The symptom cluster itself is well supported for mild hypothermia.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.cdc.gov/winter-weather/prevention/index.html
- https://www.osha.gov/winter-weather/cold-stress

### C14 — CHANGED
**Final:** While you wait for help: get off the metal floor, which drains heat from you. Sit on cardboard, tuck your hands into your armpits, and curl up.

Both reviewers raised the same concern. 'Your best move' puts insulating yourself ahead of escaping and raising the alarm, which are the real first priorities. Framing it as what to do while waiting for help fixes this. The advice itself is sound. WMS: 'A large amount of heat can be lost to the ground by conduction' and 'Insulate the patient from the ground'. Shivering rewarms a cold-stressed or mildly hypothermic person only if they are insulated. Armpit warming of hands is in CDC frostbite guidance. 'Drains heat from you' describes the direction of heat flow more accurately than 'pulls heat out'.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.cdc.gov/winter-weather/prevention/preventing-frostbite.html
- https://www.engineeringtoolbox.com/thermal-conductivity-d_429.html

### C15 — CHANGED
**Final:** Somewhere below thirty-two, something frightening can happen: the shivering fades, then stops. Not because you're warm, but because your body is running out of ways to fight.

The skeptic marked it misleading and the researcher recommended the same fix. 'Nearing thirty-two' puts the stop in the mild range. I checked WMS 2019 directly: 'Shivering may be maximal at 32 to 33 C but may continue at 31 C and may not cease until core temperature drops to approximately 30 C', and 'Shivering ceases at and below a core temperature of approximately 30 C'. Placing it below 32 matches the guideline and the HUD's MODERATE band. Timing note: play this line after the HUD has passed 32, not on the exact moment it flips to MODERATE.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8744717
- https://www.merckmanuals.com/professional/injuries-poisoning/cold-injury/hypothermia

### C16 — kept

Both reviewers marked it accurate. WMS lists confusion, poor decision making, lethargy and somnolence from brain cooling. CDC says a person may not realize they are becoming hypothermic. The line is suitably hedged.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.cdc.gov/winter-weather/prevention/index.html

### C17 — kept

Both reviewers marked it accurate. WMS: 'Below 28 C (profound/severe hypothermia), most patients are unconscious and not shivering, and the risk of VF or asystole is high.' The words 'about' and 'usually' cover the overlap between individuals.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8744717

### C18 — kept

The researcher marked it accurate; only the skeptic marked it simplified. The Tikuisis cold-air model predicts hours even for a naked person at -20 C, and a real case had 2.5 h at -18 C with survival. 'Usually' plus 'no fixed countdown' follow the brief. Optional: hand function and frostbite fail much sooner than serious hypothermia sets in, which C8 already covers.

- https://pubmed.ncbi.nlm.nih.gov/8530210/
- https://theconversation.com/what-happens-to-your-body-when-you-get-left-in-the-cold-212637

### C19 — kept

Both reviewers marked it accurate. Every factor named is supported (Paal 2022: 'A windy and wet environment will speed cooling'; thin clothing, low BMI, age and comorbidities; CDC on wetness). The list also directly serves the brief's rule that people do not all respond to cold the same way.

- https://pmc.ncbi.nlm.nih.gov/articles/PMC8744717
- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.cdc.gov/winter-weather/prevention/index.html

### C20 — CHANGED
**Final:** Feeling cold is your body's alarm. The danger deepens when that alarm goes quiet.

The skeptic marked it wrong and the researcher marked it misleading. The second sentence defines hypothermia incorrectly. Hypothermia is core temperature of 35 C or lower, and in the mild stage (35-32 C) WMS says 'shivering control is functional and increases as core temperature decreases'. The alarm goes quiet only as hypothermia deepens, around 30 C. The line also contradicts C12-C13 and could lead viewers to think a shivering person who feels cold is not hypothermic. The new wording keeps the metaphor but makes it about the danger, not the definition.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.osha.gov/winter-weather/cold-stress
- https://www.cdc.gov/niosh/cold-stress/about/related-illness.html

### C21 — CHANGED
**Final:** In rare cases, doctors have revived people from astonishingly low body temperatures. That's why rescuers say: nobody's dead until they're warm and dead.

Both reviewers raised the same concern: the line overstates how likely recovery is. In a freezer video, 'low temperatures' may also be heard as air temperature. I checked WMS directly: the dictum 'is based on the difficulty of diagnosing death in a hypothermic patient in the field. However, some patients really are cold and dead.' The record revival from 13.7 C core temperature is real. The new wording says these cases are rare, specifies body temperature, and presents the saying as a rescuer's rule.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://pubmed.ncbi.nlm.nih.gov/10665559/
- https://pubmed.ncbi.nlm.nih.gov/24882104/

### O1 — kept

The researcher marked it accurate; only the skeptic marked it simplified. The bands match WMS, ERC and Merck (mild 35-32, moderate 32-28, severe below 28). Flashing at exactly 35.0 matches the WMS definition of 35 C or lower. Values are illustrative and no time is shown. Timing note: do not land the C15 shivering-stops line exactly when the HUD flips to MODERATE at 32.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8744717

### O2 — CHANGED
**Final:** Keep the thermal view. Hands and feet cool early; torso dims slowly and stays warmest. On rescue, rewarm gradually: torso first, hands and feet last.

Both reviewers raised the same two concerns. (1) A thermal camera shows skin surface temperature, and hands and feet cool early from vasoconstriction, so the visual should not treat dimming hands as the progress of core hypothermia. (2) The rescue warm-up should not be instant or uniform. WMS gives a safe rewarming rate of 1-2 C per hour and warns of afterdrop, and CDC says to 'Warm the center of the person's body' first.

- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://www.cdc.gov/winter-weather/prevention/index.html
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11679429/

### O3 — kept

Both reviewers marked it accurate. A narrowing vessel cross-section correctly shows skin vasoconstriction, and the narration gives the skin context. 'SKIN VESSELS NARROW' is an optional refinement.

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4843861
- https://pmc.ncbi.nlm.nih.gov/articles/PMC4593810

### O4 — CHANGED
**Final:** Keep all three labels. Steel handprint: faint, blurring outward, gone within a beat; he pulls his hand back quickly instead of holding a bare palm on the metal.

Both reviewers raised the same concern. A crisp, glowing handprint that lingers on steel gets the physics backwards. Metal conducts the heat away and spreads it out, and bare steel has low infrared emissivity, so a real print would be faint and brief. Separately, a held bare palm on -20 C metal shows a risky action: NIOSH says 'Avoid touching cold metal surfaces with bare skin' (I checked this directly). All three labels are correct and stay.

- https://www.cdc.gov/niosh/cold-stress/about/index.html
- https://www.tester.co.uk/downloads/dl/file/id/2762/flir_materials_experiment_teacher_guide.pdf
- https://flir.com/discover/professional-tools/how-does-emissivity-affect-thermal-imaging

### O5 — kept

The skeptic marked it accurate; only the researcher marked it simplified. The sequence (bradycardia, then slow AF, then a VF-like trace) matches Merck and WMS. Optional: keep the irregular segment slow. Do not show the chaotic trace returning to a normal rhythm on its own.

- https://www.merckmanuals.com/professional/injuries-poisoning/cold-injury/hypothermia
- https://www.femecv.com/sites/default/files/WMS%20hipotermia_2019.pdf
- https://litfl.com/hypothermia-ecg-library/

### O6 — kept

Both reviewers marked it accurate. The card is correctly limited to walk-in freezers and hedged with 'most'. Optional, and fits the ice-jam story: add 'Check it works.' WorkSafeNB advises pressing the release regularly so it 'moves in and out easily at all times'.

- https://www.worksafenb.ca/hazard-alerts/en/frozen-mushroom-cap-handle-traps-worker-inside-freezer.html
- https://dir.ca.gov/Title8/3249.html

### O7 — kept

Both reviewers marked it accurate. It is a question, and -20 C is realistic. Optional typography: '-20°C'.

- https://www.auckland.ac.nz/content/dam/uoa/auckland/health-safety-wellbeing/news-updates-safety-alerts/safety-alert-walk-in-freezers-nov-19-v3.pdf

## Safety flags (all addressed)

- C20 (original): defining hypothermia as the moment 'the alarm goes quiet' could lead viewers to decide that a person who is still shivering and feels cold is not hypothermic, and so delay help. In fact mild hypothermia (35-32 C) involves strong shivering, and WMS says shivering can continue down to about 30 C. Fixed by the new wording.
- C9 (original): saying the walls block your signal as a fact could stop a real trapped person from trying their phone. In the documented -20 C Auckland near-miss, the phone had signal and brought help. Fixed with 'can'; viewers should always try calling and move around to find signal.
- C14: 'Your best move' put insulating yourself ahead of escaping and raising the alarm. The real order is: try the inside release (WorkSafeNB says kick the cap several times or hit it with a heavy object if it is iced), use any alarm button, try the phone, bang and shout; then insulate while waiting. Fixed by reframing. Make sure the earlier visuals show those attempts.
- C11 visuals: do not suggest an iced-up release can never be freed. Show the character pushing, kicking or striking it repeatedly before giving up, as WorkSafeNB advises.
- O4: a bare palm held on -20 C steel shows a risky action (NIOSH: avoid touching cold metal surfaces with bare skin; risk of contact frostbite or skin sticking). Fixed: brief contact, hand pulled back.
- O2: an instant, whole-body warm-up on rescue could suggest that fast rewarming is safe. WMS gives about 1-2 C per hour and warns of afterdrop; CDC says warm the center of the body (chest, neck, head, groin) first. Fixed: gradual, torso-first rewarming.
- O5: do not show the chaotic VF-like trace returning to a normal rhythm on its own. VF is effectively cardiac arrest and needs resuscitation.
- C18 (no change; low risk): 'hours, not minutes' should not be heard as 'you have plenty of time'. Hand function and frostbite risk deteriorate much sooner, which C8 partly covers.

## How the changes were applied without breaking picture sync
- The changed lines were re-voiced with the same voice. Each line keeps its original start time; if a line got longer, it is spoken slightly faster (up to 1.3x) to fit its slot.
- Captions were re-timed with Whisper word timestamps on the new narration.
- The 'shivering fades, then stops' beat (SH18) was moved to the new word timing and now fades gradually. The CORE HUD now crosses 32 °C before the shivering stops, at about 31 °C.
- SH10c: brief contact and the hand is pulled back. The steel handprint is now faint and fades quickly.
- SH25a: rewarming is now slow, with the torso warming first and the hands staying cool.
- The end card is held about 1.5 s longer, so the final line finishes before the takeaway appears.
