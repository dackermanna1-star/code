// Readable documents. Environmental storytelling only: nothing here is explained
// outright, and nothing ever jumps out at the player.

export const NOTES = {
  missing: {
    title: 'MISSING PERSON',
    kind: 'poster',
    body: `MISSING

KYLE ROURKE, 19
5'11", brown hair, green army jacket, red backpack.

Last seen October 14, 2021, near the old St. Agatha General Hospital site on Fenwick Road.

If you have ANY information please call. We just want to know he's okay.

(Someone has written across the bottom in marker: "HE WENT DOWNSTAIRS")`,
  },
  signin: {
    title: 'VISITOR SIGN-IN SHEET',
    kind: 'paper',
    body: `ST. AGATHA GENERAL — VISITOR LOG — MARCH 1998

03/12  14:10  R. Duval ........... Ward A / 106
03/12  16:45  (illegible) ........ Ward A / 103
03/12  19:20  T. Okafor .......... Ward A / 103
03/13  02:58  ________________ ... Ward A / 108

The last line is signed in pencil. The signature is just a single unbroken line that goes off the edge of the page.`,
  },
  closure: {
    title: 'MEMO — ADMINISTRATION',
    kind: 'paper',
    body: `TO: All Department Heads
FROM: Office of the Administrator
RE: Facility Closure
DATE: February 27, 1998

As discussed, all remaining patients are to be transferred to County General by Friday, March 13. Wards are to be cleared and secured.

Mains power will be disconnected by the utility on Monday, March 16. The basement generator (Unit 2) will be decommissioned by the contractor the same day.

Please return all keys to this office. Do not leave anything on the wards.

— D. Whitcombe, Administrator`,
  },
  file108: {
    title: 'PATIENT FILE — WARD A, RM 108',
    kind: 'folder',
    body: `PATIENT: [name blacked out]
ADMITTED: 01/22/98    WARD: A    ROOM: 108
DX: post-operative observation

NURSING NOTES
02/02  Pt. comfortable. Asked what time the night nurse comes round.
02/19  Pt. asked again. Explained night rounds are at 0200 and 0400.
03/04  Pt. states "she comes at three. She counts us. She gets to me last."
03/09  Pt. refusing to sleep. Requested the door stay closed.
         NB: no night nurse rostered on Ward A since February staffing cuts.
03/10  DISCHARGED (transfer, County General).

A later note is paper-clipped to the back, unsigned:
  "108 call light activated 03/12 at 03:05, 03:06, 03:07. Room vacant. Facilities to check wiring."`,
  },
  nightlog: {
    title: 'NURSE STATION — NIGHT LOG',
    kind: 'paper',
    body: `WARD A — NIGHT LOG — 03/12/98

01:00  Rounds complete. 4 pts remaining for transfer.
02:00  Rounds. All settled.
02:55  Lights in east corridor flickering again. Called maintenance — no answer.
03:00  Call light 108.
03:01  Call light 108. Room 108 is EMPTY. Discharged Tuesday.
03:04  I can hear the trolley.
03:05  Nobody else is on shift.
03:07

(The rest of the page is blank.)`,
  },
  journal1: {
    title: 'NOTEBOOK PAGE (CAMPSITE)',
    kind: 'paper',
    body: `DAY 2

Generator downstairs was ALREADY RUNNING when we got here. Mara thinks someone else is squatting. We haven't seen anyone. We didn't touch it.

The lights on this floor come on by themselves at night. Not all of them. Same ones every time.

Kyle got good photos of the operating room. Tomorrow: basement. Stairs down are collapsed so it'll have to be the elevator shaft. There's a ladder.`,
  },
  journal2: {
    title: 'NOTEBOOK PAGE (CAMPSITE)',
    kind: 'paper',
    body: `DAY 4

Someone nailed 108 shut while we were asleep. It wasn't us. Mara says it wasn't her. The boards are old though. Older than us being here.

There's light under the door.

Kyle went down the shaft to look at the morgue. Came back up quiet. He keeps counting things. Cans. Ceiling tiles. Us.`,
  },
  journal3: {
    title: 'NOTEBOOK PAGE (CAMPSITE)',
    kind: 'paper',
    body: `DAY 5

Kyle's gone. His bag is still here. His shoes are still here.

Mara went to get help. I'm staying in case he comes back.

If you find this: don't go down the shaft at three.`,
  },
  doctor: {
    title: 'LETTER — DR. AMES',
    kind: 'paper',
    body: `To the Administrator,

I am again requesting that Room 108 be taken out of use pending an investigation of the recurring call-light faults and the complaints from patients in adjoining rooms.

Three patients have now asked to be moved. Two of them independently described a nurse "doing a headcount" at around 3 a.m.

I would also like to know who authorised the transfer of one of my patients to the morgue on 03/11. I signed no certificate.

— Dr. H. Ames, Ward A

[stamped across the top: REQUEST DENIED — BUDGET]`,
  },
  morguelog: {
    title: 'COLD STORAGE REGISTER',
    kind: 'paper',
    body: `MORTUARY — COLD STORAGE REGISTER — MARCH 1998

Intake to 03/11 ....................... 14
Released to funeral homes ............. 0
Drawer count 03/13 (A.M.) ............. 15
Recount ............................... 15
Recount (with Facilities) ............. 15

Drawer 9 occupied — no tag, no paperwork.
Brought down from Ward A per porter.
Porter not identified.

DO NOT OPEN DRAWER 9 UNTIL ADMIN ADVISES.`,
  },
  workorder: {
    title: 'CONTRACTOR WORK ORDER',
    kind: 'paper',
    body: `HALVERSON ELECTRICAL & MECHANICAL
WORK ORDER #4471

Site: St. Agatha General — Basement Plant Room
Task: Decommission standby generator (Unit 2)
Date: 03/16/98

Notes: Unit found RUNNING on arrival. Fuel tank dry (dipstick confirms). Isolator in OFF position. Unable to shut down — unit does not respond to controls.

Left site 11:40. Will return with a second tech.

Return visit: ____________`,
  },
  drawertag: {
    title: 'TOE TAG',
    kind: 'paper',
    body: `ST. AGATHA GENERAL — MORTUARY

NAME: ______________________
WARD: A        ROOM: 108
DATE OF DEATH: 03/13/98
TIME: 03:00
CERTIFIED BY: ______________

The tag is clean and new-looking. The string has been cut.`,
  },
  chapel: {
    title: 'PRAYER CARD',
    kind: 'paper',
    body: `A laminated prayer card, the kind left on chapel pews.

On the back, in neat handwriting:

"For the ones still on Ward A. I'm sorry we left you there. I couldn't open the door either."`,
  },
  directory: {
    title: 'LOBBY DIRECTORY',
    kind: 'sign',
    body: `ST. AGATHA GENERAL HOSPITAL

FIRST FLOOR
  Ward A (Rooms 101–110) · Nurse Station · Day Room
  Ward B · Surgery / Operating Theatre · Recovery

GROUND FLOOR
  Lobby & Reception · Medical Records · Pharmacy
  Administration · Radiology · Chapel · Emergency / Triage

BASEMENT
  Mortuary · Pathology · Boiler Room · Laundry
  (Service stairs — Stairwell B, east end)`,
  },
};

export const NOTE_COUNT = Object.values(NOTES).filter((n) => n.kind !== 'sign').length;
