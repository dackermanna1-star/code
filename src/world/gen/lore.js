// Lore: readable notes placed by the world generator, and radio broadcasts by in-game day.
// Timeline: first cases in Louisville on Sept 22. Millbrook (Clay County, KY) quarantined Sept 27.
// The player wakes on Day 1 = October 6, ten days after the quarantine began.

export const NOTES = {
  // ----------------------------------------------------------------------------- town / police
  pd_chief: {
    title: "Chief Dawson's note",
    text: "Marcy -\nIf you're reading this I didn't make it back from the checkpoint. The armory key is with this note. "
      + "There are two shotguns, the AR and six boxes of ammo in there. Hand them out to whoever is still standing.\n"
      + "Do NOT go up to the I-65 checkpoint. The Guard has orders to fire on anything that walks up the highway. "
      + "The evidence room is locked tight - the Pruitt boys' rifles are still in there if you can break the door.\n- Walt",
  },
  pd_bulletin: {
    title: 'MPD Bulletin #14',
    text: "ALL OFFICERS - effective immediately:\n1. Do not engage infected subjects at arm's length. Bites and scratches transmit the disease.\n"
      + "2. Body shots are ineffective. Aim for the head.\n3. Any officer who is bitten reports to Sgt. Hale for isolation. No exceptions.\n"
      + "4. Holding cells are FULL. Detained infected stay in the cells. Do not open the doors.\n5. Pray.",
  },
  pd_incident: {
    title: 'Incident log (torn pages)',
    text: "SEPT 27 - 0710 County placed under quarantine by order of the Governor. Guard roadblock on I-65 north of Exit 81.\n"
      + "SEPT 28 - 2215 Assault at Rusty Nail bar. Suspect bit two patrons. Transported to Millbrook General.\n"
      + "SEPT 30 - 1400 Riot at Foodland. Store closed. Manager reports theft of entire bread aisle.\n"
      + "OCT 2 - 0300 Three prisoners in holding turned. Cells 1 and 2 locked. Nobody goes in.\n"
      + "OCT 3 - Lost contact with Units 4 and 7 on Elm Street.\nOCT 4 - Chief left for the checkpoint to negotiate. Not back.",
  },
  fire_log: {
    title: 'Station 1 log book',
    text: "Sept 29: Structure fire on Willow Lane. Family inside would not come out - the father kept saying his son was 'sick'.\n"
      + "Oct 1: Six calls before noon. We can't keep up. Ambulance 2 lost at the hospital - crew didn't come back out.\n"
      + "Oct 3: Captain says we hold the station. Engine is fueled and the keys are in it. If you need to run, take it.\n"
      + "Oct 4: Mike turned in the dorm tonight. I had to use the axe. God forgive me.",
  },
  townhall_minutes: {
    title: 'Emergency council session - minutes',
    text: "Present: Mayor Linda Pruitt-Harmon, Councilmen Haynes, Osborne, Chief W. Dawson.\n"
      + "1. FEMA confirms Millbrook Fairgrounds (Quarry Road) as processing site for evacuees. Residents to report with ID and two days of supplies.\n"
      + "2. Councilman Osborne asks why the camp is behind razor wire. No answer from the Guard liaison.\n"
      + "3. Chief Dawson reports the hospital is past capacity. Request for state assistance - DENIED.\n4. Session adjourned when the shouting started outside.",
  },
  mayor_order: {
    title: 'Executive Order 2 (signed)',
    text: "By the authority of the Mayor of Millbrook: A curfew is in effect from 6 PM to 7 AM. Residents shall remain indoors. "
      + "Persons showing symptoms (fever, confusion, aggression, bite wounds) must report to Millbrook General Hospital or the FEMA camp.\n\n"
      + "Scrawled at the bottom: 'There is no camp anymore. Don't go north.'",
  },
  foodland_memo: {
    title: 'Foodland - store manager memo',
    text: "To all staff: The Tuesday truck did not come and is not coming. Limit 2 items per customer. "
      + "The back storage room is to stay LOCKED - the canned goods there are our reserve for staff families.\n"
      + "Gary, if you see this: I put the office safe combination in my head, not on paper. Stop asking.\n- Donna",
  },
  evac_flyer: {
    title: 'National Guard evacuation notice',
    text: "ATTENTION MILLBROOK RESIDENTS\nBuses will depart VETERANS PARK at 0800 on October 1st for the FEMA processing center.\n"
      + "Bring: photo ID, medications, 2 days of food and water. NO PETS. NO FIREARMS.\nPersons with visible wounds will be screened separately.\n"
      + "Kentucky Army National Guard - 2nd Battalion",
  },
  newspaper: {
    title: 'The Millbrook Ledger - Sept 26',
    text: "'RABIES-LIKE ILLNESS' REPORTED IN LOUISVILLE\nHealth officials urge calm as hospitals in Jefferson County report dozens of cases of a violent fever. "
      + "The CDC has dispatched a team. Clay County Health Department says there is 'no cause for alarm' in Millbrook.\n"
      + "Also inside: Hollister Farm pumpkin festival postponed; Millbrook High beats Corbin 21-14.",
  },
  flyer_quarantine: {
    title: 'CDC quarantine notice',
    text: "THIS AREA IS UNDER FEDERAL QUARANTINE\nTravel in or out of Clay County is prohibited. Violators will be detained.\n"
      + "Symptoms: high fever, disorientation, loss of speech, extreme aggression. The illness spreads through bites and scratches.\n"
      + "If a family member shows symptoms, isolate them and call 1-800-CDC-INFO. Do not attempt to restrain them yourself.",
  },
  gunstore_counter: {
    title: 'Sign taped to the register',
    text: "CLOSED UNTIL FURTHER NOTICE.\nNo, I will not sell you ammo out the back. The back room is locked and the key went home with me.\n"
      + "- Earl Mason, owner (North Lincoln Avenue, past the church - and don't come knocking)",
  },
  pharmacy_counter: {
    title: 'Pharmacy counter note',
    text: "Prescription pickup suspended. Storage room is locked by order of the pharmacist.\n"
      + "Karen has the only key. She went home sick on Sept 30 - Sycamore Street, the house with the porch swing. Don't break the door, the alarm still works. (It doesn't.)",
  },
  // ----------------------------------------------------------------------------- hospital
  hosp_antiviral: {
    title: 'Note taped to a syringe case',
    text: "ZV-12 (experimental antiviral) - last dose. CDC courier left us twelve. Eleven used.\n"
      + "It does not cure. It buys time: given within hours of a bite it slows the fever for a few days. "
      + "Whoever finds this - don't waste it on the dying. - Dr. Amy Chen",
  },
  hosp_lab: {
    title: 'Lab report (blood-stained)',
    text: "Pathogen behaves like rabies on fast forward. Incubation: 6 to 48 hours after a bite. Core temp spikes to 41 C then drops to ambient after 'death'.\n"
      + "Motor function returns 2-20 minutes post mortem. Brainstem remains active - only destroying it stops the host.\n"
      + "Note to self: the last ZV-12 dose is in the pharmacy safe, ground floor. Pharmacy door is locked - Rick has the keys. Rick is in the morgue now.",
  },
  hosp_morgue: {
    title: "Morgue attendant's note",
    text: "They don't stay dead. I strapped the last six to the gurneys and they're still moving under the sheets.\n"
      + "I'm locking the back door. If you're from the city coming to collect - don't open the drawers.",
  },
  hosp_triage: {
    title: 'Triage protocol (revised Oct 1)',
    text: "GREEN - no wounds: send to FEMA camp.\nYELLOW - non-bite injuries: treat in ER.\nRED - bite or scratch: 4th floor quarantine ward. Restrain on admission.\n"
      + "BLACK - deceased: morgue, SECURE THE HEAD.\nBy order of the CDC liaison. Staff may not leave the building until further notice.",
  },
  hosp_quarantine: {
    title: 'CDC order - 4th floor',
    text: "Floor 4 is sealed as of 1900 Oct 3. Stairwell doors barricaded from the stairwell side. No staff may enter.\n"
      + "Two guardsmen are posted inside. They have been told the situation. They have volunteered.\n"
      + "Supplies for 5 days are in the crate by the barricade. God help them.",
  },
  hosp_roof: {
    title: "Private Ortega's note",
    text: "Day 9 on the roof. They said a bird would pick up the doctors and the samples. The helicopter went down north of town, I saw the smoke over the trees past the ranger road.\n"
      + "Nobody is coming. I left the last med crate here. If you can get to the crash site, the crew had more.",
  },
  // ----------------------------------------------------------------------------- school / church
  school_principal: {
    title: "Principal's memo",
    text: "Per county emergency management, Millbrook High is now a Red Cross shelter. The gym will hold 120 cots.\n"
      + "Teachers: keep students in classrooms until parents arrive. Do not release a student to anyone who appears ill.\n"
      + "Lockers will be cut open for supplies if needed. - Principal R. Haynes",
  },
  student_diary: {
    title: 'Notebook (purple pen)',
    text: "Mr. Clark said we have to stay in the classroom until our parents come. Jenny's mom came but she looked wrong and Mr. Clark wouldn't open the door.\n"
      + "Now it's dark and the hallway is full of noises. I'm hiding behind the desks. I want to go home to Poplar Avenue.",
  },
  shelter_log: {
    title: 'Red Cross shelter log',
    text: "Oct 1: 87 people in the gym. Cots, blankets, water from the Guard truck.\nOct 2: Man in row C had a fever. Moved him to the corner.\n"
      + "Oct 3: Row C is gone. The Guard nailed the front doors shut from outside. They said it was for our safety.\n"
      + "Oct 4: we are not getting out. If you find this, there are supply crates by the stage. Take them. Burn the gym.",
  },
  church_pastor: {
    title: "Pastor Gilbert's sermon notes",
    text: "We barred the doors and moved the pews. Forty of us inside. We sang until the windows broke.\n"
      + "Brother Earl keeps saying the dead are being punished. I say we are the ones being tested.\n"
      + "If any survive, the vestry has blankets, food and the communion wine. Take it with my blessing.",
  },
  grave_digger: {
    title: "Groundskeeper's note",
    text: "County told me to dig a long trench for the 'unclaimed'. Forty-one so far. I put lime on top like they said.\n"
      + "Last night the dirt on the trench was moving. I'm not coming back to this cemetery.\n"
      + "Left my stash in the Whitfield mausoleum - the door is locked but the hinges are rotten.",
  },
  mausoleum: {
    title: 'Scrap of paper in the crate',
    text: "Whitfield family crypt - safest place in town, the dead in here already stay put.\nSupplies for when the town burns. -H.",
  },
  // ----------------------------------------------------------------------------- houses
  holdout_1: {
    title: 'Diary under the floorboards',
    text: "Day 4. Boarded every window on the ground floor. The Hendersons next door didn't, and now they walk around their yard at night.\n"
      + "Day 7. Water's out. Collecting rain in pots. Down to 6 cans.\nDay 9. Something keeps scratching at the back door. If I don't come back up, this stash is for whoever needs it.",
  },
  holdout_2: {
    title: 'Letter to Sarah',
    text: "Sarah, I'm at the house. I nailed the doors shut and I'm keeping quiet. They hunt by sound - I'm sure of it now.\n"
      + "If you get this, I went to find you at the FEMA camp. Everything I couldn't carry is under the floor. I love you. - Dan",
  },
  holdout_3: {
    title: 'Survival notes',
    text: "Things I've learned:\n- They hear you before they see you. Walk, don't run.\n- Night is worse. They move around more.\n"
      + "- Sprinters exist. Small ones, fast. Don't let them corner you.\n- Bandage scratches right away. Fever means it's over.\n- The well at Hollister Farm still has clean water.",
  },
  holdout_4: {
    title: 'Note on a jar of nails',
    text: "Ran out of boards for the upstairs windows. Used the dining table. If you need the hammer it's in the garage. "
      + "Took the kids to the church. Pastor says it's safe there.",
  },
  holdout_5: {
    title: 'Scribbled note',
    text: "Day 10. The radio says Fort Knox is still taking people. 100 miles north. Through the checkpoint. Ha.\n"
      + "I'm staying. Food for two weeks under the floor if I'm careful. If you find this and I'm gone - I went looking for my brother at the Pine Grove trailers.",
  },
  maple_guns_hint: {
    title: "Dale's journal",
    text: "Left town on foot day 6 with Rhonda. Too many of them on Main Street to go back for the guns.\n"
      + "If anybody finds this - I hid my shotgun and both pistols under the loose floorboards in my house, the BLUE house on Maple Avenue. "
      + "Ammo's with them. We're heading up to the lake. Pray for us.",
  },
  maple_guns: {
    title: "Note with the guns",
    text: "Rhonda - if you come back without me, the guns are here. The 12 gauge has a slug loaded. Don't hesitate. - Dale",
  },
  gunstore_owner: {
    title: "Earl Mason's note",
    text: "Spare key for the back room at Big Buck Guns. I locked the good stuff up before the looters came. "
      + "If I don't make it back from my daughter's, Ronnie - you know what to do with it. Only give it to decent folks.",
  },
  pharmacist: {
    title: 'Note from the pharmacist',
    text: "Key to the Rite Care Pharmacy storage room. Antibiotics, painkillers, bandages - everything the looters didn't get.\n"
      + "I took the key home so nobody could clean us out. Now I'm too sick to walk there. Use it well. - Karen Lowe",
  },
  ham_radio: {
    title: 'Ham radio log',
    text: "146.52 - Lexington: silent since Oct 2.\n147.30 - military traffic, 'Checkpoint Bravo', 'Operation Firebreak'. They mentioned 'sanitizing' the fairgrounds.\n"
      + "Ranger Ray on 151.8: says the lookout tower sees everything for ten miles. Smoke from the fairgrounds every night.\nI've got the batteries. I'll keep listening.",
  },
  bitten_husband: {
    title: 'Note on the bedroom door',
    text: "DO NOT OPEN.\nTom got bit on the hand on Sunday. He's in there. I couldn't do it. I'm sorry, I couldn't.\nI took the car and the kids to my mother's in Corbin.",
  },
  doctor_house: {
    title: "Dr. Whitaker's note",
    text: "I brought home what I could from the clinic: antibiotics, sterile dressings, a suture kit. It's in the safe in the bedroom.\n"
      + "Antibiotics won't stop the bite fever. They will stop everything else from killing you.",
  },
  cop_house: {
    title: "Officer's letter",
    text: "Off duty since the 30th. Chief wants everyone back at the station. I'm not leaving my family.\n"
      + "Service pistol and the deer rifle are in the gun cabinet. Ammo in the closet. If it comes to it, I'll use them.",
  },
  prepper: {
    title: "Prepper's checklist",
    text: "Bug-out bag: CHECK. Water purification: CHECK. 90 days canned: in the shed, behind the paint cans.\n"
      + "Told everybody out on Quarry Road this was coming. They laughed. Nobody's laughing now. Nobody's anything now.",
  },
  kids_note: {
    title: "Child's drawing",
    text: "A crayon drawing of a house with a red door. Underneath, in careful letters:\n"
      + "MOMMY WENT TO THE HOSPITAL TO GET MEDISIN. SHE SAID STAY INSIDE. I AM BEING GOOD. I ATE ALL THE CEREAL.",
  },
  farewell: {
    title: 'Last letter',
    text: "To whoever finds us: we're together. We heard what's on the other side of the barricade and we decided.\n"
      + "The house is yours. There is food in the kitchen and the car keys are in the bowl by the door. Be kinder than the world was.",
  },
  // ----------------------------------------------------------------------------- military / FEMA
  fema_intake: {
    title: 'FEMA intake card',
    text: "FEMA PROCESSING CENTER - MILLBROOK FAIRGROUNDS\nName: ______  Address: ______\nBite / scratch wounds?  [ ] YES  [X] NO\n"
      + "Temperature: 98.9F\nAssigned: Tent 14, Row B\nOn the back, in pencil: 'They took Daddy to the white tent and he didn't come back.'",
  },
  fema_orders: {
    title: 'Camp commander - Frag order',
    text: "SECRET // OPERATION FIREBREAK\n1. Effective 0600 Oct 4 the Millbrook processing center is CODE BLACK.\n"
      + "2. No evacuee will leave the perimeter. Infected and uninfected are to be considered indistinguishable.\n"
      + "3. Armory tent to be secured. Medical tent to be abandoned.\n4. Checkpoint Bravo will hold I-65 until relieved. Lethal force authorized.\n- LTC R. Garrison",
  },
  fema_medic: {
    title: "Army medic's journal",
    text: "Oct 2: Screening is a joke. People hide their bites under sleeves. Temperature checks miss the early ones.\n"
      + "Oct 3: It started in Row D at 0300. By dawn half of D was walking. We fell back to the medical tent.\n"
      + "Oct 4: Garrison ordered the gates welded. There are still living people in Rows A and B. I'm leaving tonight through the north fence.",
  },
  checkpoint_roe: {
    title: 'Rules of engagement - Checkpoint Bravo',
    text: "1. No civilian vehicle or pedestrian passes north. NO EXCEPTIONS.\n2. Warning shots are no longer authorized.\n"
      + "3. Engage anything approaching within 100m that does not respond to verbal commands.\n4. Burn bodies in the barrels at the end of each watch.",
  },
  checkpoint_diary: {
    title: "Spc. Lyle's diary",
    text: "Day 5. Shot a man today. He was carrying a kid. The kid was bitten. I keep telling myself that.\n"
      + "Day 7. Sgt. Reyes stashed an ammo crate up in the north watchtower, 'for when it all goes to hell'.\n"
      + "Day 8. The jam on the highway is a mile long now. They come out of the cars at night. We're out of everything but bullets.",
  },
  heli_manifest: {
    title: 'Flight manifest - UH-60 "Dustoff 3"',
    text: "Origin: Millbrook General Hospital (rooftop LZ)  Dest: Fort Knox\nCargo: 2x medical crate, 1x weapons crate (crew), 1x cooler - CDC SAMPLES (DO NOT OPEN)\n"
      + "Pax: Dr. A. Chen (CDC) - CANCELLED, pickup aborted\nRemarks: diverted to FEMA camp for extraction of command staff.",
  },
  heli_pilot: {
    title: "Pilot's kneeboard",
    text: "1840 - Took fire from the ground over the fairgrounds. Hydraulics.\n1843 - Mayday mayday, Dustoff 3, going down east of Route 9, north of town.\n"
      + "Crew chief is hurt. Something is coming through the trees. Weapons crate is in the back. Whoever finds this, take it.",
  },
  // ----------------------------------------------------------------------------- highway
  motel_guest: {
    title: "Note in room 12",
    text: "Made it this far from Nashville before the highway jammed. The manager let us have the room for free - he's gone now.\n"
      + "Left our spare supplies in the dresser. We're going to try the back roads east. If the highway's clear, go north.",
  },
  trucker_log: {
    title: "Trucker's logbook",
    text: "Load: 22 pallets canned goods, Kroger DC Louisville -> Knoxville.\nOct 1: Stopped in the jam at mile 81. Nobody moving. Guard at the checkpoint waving everybody back.\n"
      + "Oct 3: Sleeping in the cab. Folks keep asking for food. I gave out what I could.\nOct 5: Got bit through the window. Trailer's unlocked. Help yourselves.",
  },
  gas_clerk: {
    title: "Gas & Go clerk's note",
    text: "Pumps are dry since day 3, don't bother. Generator is out back but no gas for it either. Ha.\n"
      + "I'm locking myself in the back room with the cigarettes. If you knock, say something so I know you can still talk.",
  },
  // ----------------------------------------------------------------------------- farms
  hollister_diary: {
    title: 'Hollister Farm diary',
    text: "Sept 30: Cows are spooked. Something in the corn at night.\nOct 2: Lost the dogs. Jim says it's coyotes. It isn't coyotes.\n"
      + "Oct 4: The hand pump behind the house still gives clean water - city water is brown and stinks. Filled every jug we have.\n"
      + "Oct 5: Jim went into the barn and didn't come out. I'm taking the truck to my sister's.",
  },
  dawson_letter: {
    title: 'Letter on the kitchen table',
    text: "Walt -\nI know you're busy at the station but you need to come home. The neighbors' boy is walking up and down Route 9 like he's lost and he won't answer.\n"
      + "I locked up the shotgun in the cabinet like you asked. Love, June",
  },
  pruitt_note: {
    title: 'Pruitt brothers - note',
    text: "Bobby - the cops still got our rifles locked up at the station. Forget them.\n"
      + "I stashed the money and the good jars in the hollow log down by the creek, past the south field. Meet me at the trailer park.\n- Ray Pruitt",
  },
  // ----------------------------------------------------------------------------- wilderness
  ranger_log: {
    title: 'Ranger station log',
    text: "Oct 1: Campground evacuated. Two families refused to leave - they're out on the island.\nOct 3: From the lookout I can see smoke from the fairgrounds every night, and the helicopter that went down east of the trail.\n"
      + "Oct 4: I left the spare rifle and a box of rounds up in the lookout tower. Climb up - you can see the whole county from there.\n- Ranger Ray Coleman",
  },
  lookout_note: {
    title: 'Pencil marks on the tower wall',
    text: "Day 8 - fires downtown. Day 9 - the checkpoint is still shooting. Day 10 - lights in the trailer park, someone's alive.\nThe island on the lake looks quiet. If I had a boat I'd be there.",
  },
  campground_note: {
    title: 'Note on a picnic table',
    text: "Ranger said evacuate, so we packed up. Got as far as Route 9 and came back - the road south is full of them.\n"
      + "We're staying in cabin 3. If you see this note, knock three times.",
  },
  cabin_hunter: {
    title: "Hunter's note",
    text: "Been coming to this cabin every fall for 30 years. Never thought I'd be hiding in it.\n"
      + "Deer are gone - they've been eaten, I've found the bones. The things don't climb. Get high and get quiet.\nRifle cabinet's unlocked. Ammo is in the crate.",
  },
  camp_0: {
    title: 'Survivor journal - west woods',
    text: "We left Millbrook on day 3 when the fire started on Cedar Street. Five of us. Now two.\n"
      + "There are berry bushes along the creek and the fishing is decent. Keep the fire small. They see the light.",
  },
  camp_1: {
    title: 'Survivor journal - east of the highway',
    text: "Crossed the interstate at night between the wrecks. The things hide inside the cars and grab at your legs.\n"
      + "Found this clearing. The hunting cabin south of here has a gun cabinet - we cleaned it out but there's still ammo.",
  },
  camp_2: {
    title: 'Survivor journal - south ridge',
    text: "Day 9. Mark has the fever. He says it's just a cold. It's not a cold.\nI moved the supplies into the crate and sat down by the fire to wait. I have one bullet left. I know who it's for.",
  },
  camp_3: {
    title: 'Survivor journal - Mill Road',
    text: "The Pruitt farm looked empty, so we went in. It was not empty.\nWe're camping by the old mill road. If you go to the farm, the barn loft has hay and the tractor still has fuel in it.",
  },
  camp_4: {
    title: 'Survivor journal - north trail',
    text: "Dale and Rhonda's camp. Dale went back into town for his guns three days ago.\n"
      + "If you're reading this and you're not Dale: please, his guns are under the floorboards in the blue house on Maple Ave. Bring them to the lake.",
  },
  camp_5: {
    title: 'Survivor journal - the island',
    text: "Swam out to the island with the kids on day 4. The things don't swim - they walk in and sink.\n"
      + "We have the fire, the fish, the tent. We're safe. I wish someone would come so I could tell them.",
  },
  // ----------------------------------------------------------------------------- industrial / misc
  warehouse_note: {
    title: "Foreman's clipboard",
    text: "Shift cancelled until further notice. Loading dock 3 still has a full trailer of bottled water - FEMA was supposed to pick it up Oct 2.\n"
      + "Nobody came. Forklift keys in the office.",
  },
  construction_note: {
    title: 'Site safety board',
    text: "MILLBROOK MEDICAL PLAZA - Opening Spring.\nDAYS WITHOUT AN ACCIDENT: 0\nScribbled: 'Job's off. Tools are in the site trailer. Watch the open floor on level 3.'",
  },
  trailer_note: {
    title: 'Note on a trailer door',
    text: "PINE GROVE RESIDENTS - meet at trailer 9, it's got the generator. Bring water.\nWe're watching the gate in shifts. Two knocks, then one.",
  },
  rail_note: {
    title: "Conductor's report",
    text: "Train 4402 halted at Millbrook siding by order of the Guard. Boxcars sealed. Crew dismissed.\n"
      + "Cars 3 and 5 carry relief supplies for the FEMA camp. Nobody has come to unload them.",
  },
  burger_note: {
    title: 'Burger Barn - order slip',
    text: "#77: two Barn Burgers, large fries, NO PICKLES\nOn the back: 'Manager's in the walk-in freezer. He won't come out and we won't let him.'",
  },
  carlot_note: {
    title: 'Kentucky Motors - memo',
    text: "All keys are in the lockbox in the office. Every car on the lot is SOLD as of Sept 29 - cash only. "
      + "If customers come back for their cars tell them the Guard took the trucks.",
  },
};

export const RADIO_BROADCASTS = [
  { day: 1, text: 'EMERGENCY ALERT SYSTEM. A federal quarantine is in effect for Clay County, Kentucky. Remain indoors. Do not approach the I-65 checkpoint. This message will repeat.' },
  { day: 1, text: '...this is WMBK Millbrook, if anyone is listening... the FEMA camp at the fairgrounds is NOT accepting people. I repeat, do not go to the fairgrounds...' },
  { day: 2, text: "Checkpoint Bravo to any station... perimeter holding... request resupply, we are black on water... (static)" },
  { day: 2, text: 'This is Ranger Ray Coleman at the Lake Millbrook ranger station. I can see the whole county from the tower. Downtown is burning. Stay out of Main Street.' },
  { day: 3, text: 'EMERGENCY ALERT SYSTEM. Infected individuals are extremely dangerous. The disease spreads by bite. Destroying the brain is the only effective method. Fort Knox is accepting survivors.' },
  { day: 4, text: "...anybody out there? This is Marcy at the police station... the chief's not back. We're locked in, there's six of us. The armory key... (static)" },
  { day: 5, text: 'This is Ray again. The helicopter that went down north of town - there might be survivors or supplies. I am not going out there alone. Trail starts off Route 9.' },
  { day: 6, text: "To the people at Pine Grove: we see your lights. Turn them off at night. They're drawn to light and noise." },
  { day: 7, text: 'EMERGENCY ALERT SYSTEM. Fort Knox is no longer accepting survivors. Shelter in place. Ration water. Await further instructions.' },
  { day: 8, text: '(static)... Operation Firebreak... all units fall back to... (static)' },
  { day: 10, text: "If anyone's still out there: the island on Lake Millbrook is safe. They don't swim. We have room. Come at dawn." },
  { day: 14, text: '(only static now)' },
];
