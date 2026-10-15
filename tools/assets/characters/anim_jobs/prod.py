# Production animation job (no Amplify/commercial sources).
# usage: ASSET_WORK=<work> python3 prod.py <outDir> [sockets.json]   then: node ../retarget.mjs <outDir>/prod_job.json
import sys, math, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
T=REPO+'/public/assets/characters/survivor_m_shirt.glb'  # any variant: all share the skeleton
OUT=sys.argv[1] if len(sys.argv)>1 else S+'/work/anims/prod'
SOCK=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'sockets.json')
os.makedirs(OUT,exist_ok=True)
L=dict(loop=True,mode='loco',ground=True)
I=dict(loop=True,mode='inplace',ground=True)
X=dict(mode='oneshot',ground=True)
R=RPM+'/locomotion/'
U1=Q1+'/UAL1_Standard.glb'; U2=Q2+'/UAL2_Standard.glb'; SO=A+'/sos3/'
AL={'min':0.35,'maxStart':0.4}
breathe=[{'bones':['Spine1','Spine2'],'axis':[1,0,0],'deg':1.2,'period':3.0},{'bones':['Neck'],'axis':[1,0,0],'deg':-1.0,'period':3.0}]
AUTH=dict(source='authored (procedural pose on the shared skeleton, tools/assets/characters/retarget.mjs)',license='project-authored')
UP=55*math.pi/180
DIR_UP=[0,round(math.sin(UP),4),round(math.cos(UP),4)]; DIR_DN=[0,-round(math.sin(UP),4),round(math.cos(UP),4)]
def pr(n): return mx('prorifle__'+n)

loco=[
 clip('idle','rpm',RPM+'/idle/M_Standing_Idle_001.glb',**I),
 clip('walk_f','rpm',R+'M_Walk_001.glb',autoLoop=AL,**L),
 clip('walk_b','rpm',R+'M_Walk_Backwards_001.glb',autoLoop=AL,**L),
 clip('walk_l','mx_kc',mx('kc__Left_Strafe_Walk'),**L),
 clip('walk_r','mx_kc',mx('kc__Right_Strafe_Walking'),**L),
 clip('jog_f','rpm',R+'M_Jog_001.glb',autoLoop=AL,**L),
 clip('jog_b','rpm',R+'M_Jog_Backwards_001.glb',autoLoop=AL,**L),
 clip('jog_l','mx_kc',mx('kc__Left_Strafe'),**L),
 clip('jog_r','mx_kc',mx('kc__Right_Strafe'),**L),
 clip('run_f','mx_kc',mx('kc__Running'),notes='fast run between jog_f and sprint_f',**L),
 clip('sprint_f','rpm',R+'M_Run_001.glb',autoLoop=AL,**L),
 clip('crouch_idle','mx_fm',mx('fm__YBot_Unarmed_CrouchIdle'),**I),
 clip('crouch_walk_f','rpm',R+'M_Crouch_Walk_003.glb',autoLoop=AL,**L),
 clip('crouch_walk_b','rpm',R+'M_CrouchedWalk_Backwards_002.glb',autoLoop=AL,**L),
 clip('crouch_walk_l','mx_kc',mx('kc__Crouched_Sneaking_Left'),**L),
 clip('crouch_walk_r','mx_kc',mx('kc__Crouched_Sneaking_Right'),**L),
 clip('stand_to_crouch','mx_fm',mx('fm__YBot_Unarmed_StandToCrouch'),**X),
 clip('crouch_to_stand','mx_fm',mx('fm__YBot_Unarmed_CrouchToStand'),**X),
 clip('prone_idle','mx_hex',mx('hexlive__Prone_Idle'),**I),
 clip('prone_crawl_f','mx_loose',mx('loose__MainCharacter_Prone_Forward'),**L),
 clip('prone_crawl_b','mx_strike',mx('strike___Prone_Backward'),**L),
 clip('prone_turn_l','mx_strike',mx('strike___Prone_Left_Turn'),**X),
 clip('prone_turn_r','mx_strike',mx('strike___Prone_Right_Turn'),**X),
 clip('jump_start','mx_fm',mx('fm__YBot_Unarmed_Jump'),start=0.0,end=0.6,notes='standing jump take-off; feet leave the ground at the end',**X),
 clip('fall_loop','mx_kc',mx('kc__Falling_Idle'),loop=True,mode='inplace',notes='upright fall, arms up'),
 clip('land','mx_fm',mx('fm__YBot_Unarmed_Jump'),start=1.0,end=1.9,notes='feet touch down ~0.1 s into the clip',**X),
 clip('swim_idle','mx_hex',mx('hexlive__TreadWater'),loop=True,mode='inplace'),
 clip('swim_f','mx_hex',mx('hexlive__Swimming'),loop=True,mode='loco',speedOverride=1.0,notes='in-place source; speed_mps is a nominal value (front crawl)'),
 clip('swim_b','mx_hex',mx('hexlive__TreadWater'),loop=True,mode='loco',speedOverride=0.6,moveDir=[0,-1],notes='treading water (no dedicated back-swim clip); nominal speed'),
 clip('swim_l','mx_hex',mx('hexlive__TreadWater'),loop=True,mode='loco',speedOverride=0.6,moveDir=[-1,0],notes='treading water (no dedicated side-swim clip); nominal speed'),
 clip('swim_r','mx_hex',mx('hexlive__TreadWater'),loop=True,mode='loco',speedOverride=0.6,moveDir=[1,0],notes='treading water (no dedicated side-swim clip); nominal speed'),
]
rifle=[
 clip('rifle_idle','mx_ch35',mx('duel__Ch35_nonPBR_Rifle_Idle'),gripFix={},notes='relaxed low-ready',**I),
 clip('rifle_idle_ready','mx_pr',pr('idle'),notes='weapon raised (same hold as the rifle locomotion clips)',**I),
 clip('rifle_aim','mx_pr',pr('idle_aiming'),aimFix={},**I),
 clip('rifle_aim_up','mx_pr',pr('idle_aiming'),mode='static',hold=1,loop=True,ground=True,aimFix={'dir':DIR_UP},notes='barrel 55 deg up; blend with rifle_aim / rifle_aim_down by camera pitch'),
 clip('rifle_aim_down','mx_pr',pr('idle_aiming'),mode='static',hold=1,loop=True,ground=True,aimFix={'dir':DIR_DN},notes='barrel 55 deg down'),
]
for d,s in [('f','forward'),('b','backward'),('l','left'),('r','right'),('fl','forward_left'),('fr','forward_right'),('bl','backward_left'),('br','backward_right')]:
    rifle.append(clip('rifle_walk_'+d,'mx_pr',pr('walk_'+s),**L))
for d,s in [('f','forward'),('b','backward'),('l','left'),('r','right'),('fl','forward_left'),('fr','forward_right'),('bl','backward_left'),('br','backward_right')]:
    rifle.append(clip('rifle_jog_'+d,'mx_pr',pr('run_'+s),**L))
rifle+=[
 clip('rifle_aim_walk_f','mx_kc',mx('kc__Rifle_Aiming_Walk_Forward'),gripFix={},aimFix={'yawChain':['Spine','Spine1','Spine2']},notes='walking while aiming down sights (weapon levelled forward)',**L),
 clip('rifle_fire_walk_f','mx_kc',mx('kc__Rifle_Firing_Walking'),gripFix={},aimFix={'yawChain':['Spine','Spine1','Spine2']},notes='walking while firing',**L),
 clip('rifle_sprint','mx_pr',pr('sprint_forward'),**L),
 clip('rifle_sprint_fl','mx_pr',pr('sprint_forward_left'),**L),
 clip('rifle_sprint_fr','mx_pr',pr('sprint_forward_right'),**L),
 clip('rifle_crouch_idle','mx_pr',pr('idle_crouching'),**I),
 clip('rifle_crouch_aim','mx_pr',pr('idle_crouching_aiming'),aimFix={},**I),
]
for d,s in [('f','forward'),('b','backward'),('l','left'),('r','right'),('fl','forward_left'),('fr','forward_right'),('bl','backward_left'),('br','backward_right')]:
    rifle.append(clip('rifle_crouch_walk_'+d,'mx_pr',pr('walk_crouching_'+s),**L))
rifle+=[
 clip('rifle_turn_l','mx_pr',pr('turn_90_left'),**X),
 clip('rifle_turn_r','mx_pr',pr('turn_90_right'),**X),
 clip('rifle_crouch_turn_l','mx_pr',pr('crouching_turn_90_left'),**X),
 clip('rifle_crouch_turn_r','mx_pr',pr('crouching_turn_90_right'),**X),
 clip('rifle_reload','mx_ybot',mx('duel__Y_Bot_Reloading'),gripFix={},**X),
 clip('rifle_crouch_reload','mx_ybot',mx('duel__Y_Bot_Crouch_Reload'),gripFix={},**X),
 clip('rifle_fire','mx_ch35',mx('duel__Ch35_nonPBR_Up_Firing_Rifle'),gripFix={'frames':[0,0]},aimFix={},notes='single shot recoil from the aim pose (0.27 s); play as upper-body overlay',**X),
 clip('rifle_crouch_fire','mx_ch35',mx('duel__Ch35_nonPBR_Crouch_Firing_Rifle'),gripFix={'frames':[0,0]},aimFix={},**X),
 clip('rifle_prone_idle','mx_ch35',mx('duel__Ch35_nonPBR_Prone_Idle'),gripFix={},aimFix={'pitch':False},**I),
 clip('rifle_prone_aim','mx_ch35',mx('duel__Ch35_nonPBR_Prone_Idle'),mode='static',holdFrame=0,hold=3,loop=True,ground=True,gripFix={'frames':[0,0]},
      aimFix={'pitch':False},osc=[{'bones':['Spine1','Spine2'],'axis':[1,0,0],'deg':0.5,'period':3.0}],notes='prone aim (weapon heading exactly forward, ~9 deg muzzle-up like the source)'),
 clip('rifle_prone_fire','mx_ch35',mx('duel__Ch35_nonPBR_Prone_Firing_Rifle'),gripFix={'frames':[0,0]},aimFix={'pitch':False},**X),
 clip('rifle_prone_reload','mx_ybot',mx('duel__Y_Bot_Prone_Reloading'),gripFix={'frames':[0,0]},**X),
 clip('rifle_kneel_to_prone','mx_ch35',mx('duel__Ch35_nonPBR_Rifle_Kneel_To_Prone'),gripFix={'frames':[0,0]},**X),
 clip('rifle_prone_to_kneel','mx_ch35',mx('duel__Ch35_nonPBR_Rifle_Prone_To_Kneel'),gripFix={'frames':[0,0]},**X),
 clip('rifle_equip','mx_kc',mx('kc__Rifle_Draw'),gripFix={'frames':[-1,-1]},notes='rifle brought up from the hip/sling into a low-ready (blend into rifle_idle / rifle_idle_ready)',**X),
 clip('rifle_jump_start','mx_pr',pr('jump_up'),**X),
 clip('rifle_fall_loop','mx_pr',pr('jump_loop'),loop=True,mode='inplace'),
 clip('rifle_land','mx_pr',pr('jump_down'),**X),
 clip('rifle_hit_react','mx_bs',mx('basicshooter__hit_reaction'),gripFix={'frames':[0,0]},**X),
]
YP=mx('kc__Pistol_Aimed_Idle')
PS=dict(socket='socket_pistol_r')
pistol=[
 clip('pistol_idle','mx_ybot',mx('duel__Y_Bot_Pistol_NoAim_Idle'),notes='two-handed low ready',**I),
 clip('pistol_aim','mx_kc',YP,aimFix={},**PS,**I),
 clip('pistol_aim_up','mx_kc',YP,mode='static',hold=1,loop=True,ground=True,aimFix={'dir':DIR_UP},notes='barrel 55 deg up',**PS),
 clip('pistol_aim_down','mx_kc',YP,mode='static',hold=1,loop=True,ground=True,aimFix={'dir':DIR_DN},notes='barrel 55 deg down',**PS),
 clip('pistol_fire','mx_kc',YP,mode='static',hold=0.3,ground=True,aimFix={},**PS,
      osc=[{'bones':['RightArm','LeftArm'],'axis':[1,0,0],'deg':-7,'period':0.6},{'bones':['Spine2'],'axis':[1,0,0],'deg':-1.5,'period':0.6}],
      notes='procedural recoil kick on top of pistol_aim (upper-body overlay)',source=LIC['mx_kc'][0]+' + procedural recoil',license=LIC['mx_kc'][1]),
 clip('pistol_fire_alt','mx_kc',mx('kc__Pistol_Shooting'),aimFix={},notes='Mixamo "Pistol Shooting" (arms fully extended)',**PS,**X),
 clip('pistol_reload','ual1',U1,'Pistol_Reload',**X),
 clip('pistol_draw','mx_kc',mx('kc__Pistol_Draw'),notes='draw from the right hip into pistol_aim',**X),
 clip('pistol_walk_f','mx_kc',mx('kc__Pistol_Aimed_Walk'),**L),
 clip('pistol_walk_b','mx_kc',mx('kc__Pistol_Aimed_Walk_Backward'),**L),
 clip('pistol_walk_l','mx_kc',mx('kc__Pistol_Aimed_Strafe_Left'),**L),
 clip('pistol_walk_r','mx_kc',mx('kc__Pistol_Aimed_Strafe_Right'),**L),
 clip('pistol_run_f','mx_kc',mx('kc__Pistol_Aimed_Run'),notes='running while aiming',**L),
 clip('pistol_run_b','mx_kc',mx('kc__Pistol_Aimed_Run_Backward'),notes='running backwards while aiming',**L),
 clip('pistol_sprint','mx_kc',mx('kc__Pistol_Run'),notes='weapon lowered',**L),
 clip('pistol_crouch_aim','mx_ybot',mx('duel__Y_Bot_Pistol_Kneeling_Idle'),aimFix={},**PS,**I),
 clip('pistol_crouch_walk_f','rpm',R+'M_Crouch_Walk_003.glb',autoLoop=AL,upper={'rig':'mx_kc','src':YP,'root':'Spine1'},
      aimFix={'yawChain':['Spine','Spine1','Spine2']},notes='RPM crouch walk legs + pistol_aim upper body (layered from Spine1), weapon levelled',
      source=LIC['rpm'][0]+' + '+LIC['mx_kc'][0],license=LIC['rpm'][1]+' / '+LIC['mx_kc'][1],**PS,**L),
]
CRAWL=mx('hexlive__X_Bot_Crawling')
actions=[
 clip('death_f','mx_pr',pr('death_from_the_back'),notes='falls forward (shot from behind)',**X),
 clip('death_b','mx_loose',mx('loose__MainCharacter_Falling_Back_Death'),notes='falls backward',**X),
 clip('death_l','mx_pr',pr('death_from_right'),notes='falls to the left (shot from the right)',**X),
 clip('death_r','mx_pr',pr('death_from_right'),mirror=True,notes='mirror of death_l: falls to the right',**X),
 clip('death_f_alt','mx_pr',pr('death_from_the_front'),notes='doubles over, falls forward',**X),
 clip('death_headshot_f','mx_pr',pr('death_from_back_headshot'),notes='falls forward',**X),
 clip('death_headshot_b','mx_pr',pr('death_from_front_headshot'),notes='falls backward/sideways',**X),
 clip('death_crouch','mx_pr',pr('death_crouching_headshot_front'),**X),
 clip('death_prone','mx_loose',mx('loose__MainCharacter_Prone_Death'),**X),
 clip('knocked_idle','mx_hex',CRAWL,mode='static',holdFrame=15,hold=3,loop=True,ground=True,
      osc=[{'bones':['Spine1','Spine2'],'axis':[1,0,0],'deg':1.5,'period':1.5},{'bones':['Head'],'axis':[1,0,0],'deg':-2,'period':3.0}],
      notes='frame of knocked_crawl with breathing'),
 clip('knocked_crawl','mx_hex',CRAWL,notes='hands-and-knees crawl',**L),
 clip('hit_react_f','mx_kc',mx('kc__Getting_Hit'),start=0.0,end=2.6,notes='hit in the torso from the front; in place',**X),
 clip('hit_react_b','mx_fm',mx('fm__YBot_ArmedBow_HitReact_BackLarge'),notes='hit from behind; staggers ~1 m forward (root_displacement)',**X),
 clip('hit_react_l','mx_kc',mx('kc__Male_Reaction_Hit_On_The_Left_Side'),notes='hit on the left side; in place',**X),
 clip('hit_react_r','mx_kc',mx('kc__Male_Reaction_Hit_On_The_Right_Side'),notes='hit on the right side; in place',**X),
 clip('hit_stagger_f','mx_fm',mx('fm__YBot_ArmedBow_HitReact_FrontLarge'),notes='big hit from the front; staggers ~1 m back (root_displacement)',**X),
 clip('hit_stagger_l','mx_fm',mx('fm__YBot_ArmedBow_HitReact_LeftLarge'),notes='big hit from the left; staggers right',**X),
 clip('hit_stagger_r','mx_fm',mx('fm__YBot_ArmedBow_HitReact_RightLarge'),notes='big hit from the right; staggers left',**X),
 clip('hit_react_head','mx_fm',mx('fm__YBot_Unarmed_HitReact_Head'),notes='in place',**X),
 clip('throw_grenade','mx_ml',mx('ml__throw'),notes='overhand throw, release at ~0.75 s (right hand)',**X),
 clip('melee_swing','mx_kc',mx('kc__Axe_Standing_Melee_Attack_Horizontal'),notes='one-handed horizontal swing (weapon in the right hand)',**X),
 clip('melee_swing_unarmed','mx_hex',mx('hexlive__Standing_Melee_Attack_Horizontal'),notes='right-hand horizontal swing',**X),
 clip('punch_r','ual1',U1,'Punch_Cross',**X),
 clip('punch_l','ual1',U1,'Punch_Jab',**X),
 clip('use_item','mx_hex',mx('hexlive__X_Bot_Searching_Pockets'),start=0.2,end=1.9,notes='both hands working at belly height (bandage / kit)',**X),
 clip('drink','mx_hex',mx('hexlive__X_Bot_Drinking'),start=1.75,end=6.25,notes='bottle in the LEFT hand; drinks 0.5-4.0 s',**X),
 clip('pickup','mx_ml',mx('ml__pick_up'),start=0.6,end=2.6,notes='right hand reaches the floor at ~0.9 s',**X),
 clip('interact_door','rbx',A+'/rocketbox/m_try_door_inwards.glb',**X),
 clip('interact','mx_kc',mx('kc__Button_Pushing'),notes='press a button / switch at chest height',**X),
 clip('vault','mx_fm',mx('fm__YBot_Unarmed_Vault'),notes='running speed vault over a ~1 m obstacle (see root_displacement)',**X),
 clip('climb','mx_fm',mx('fm__YBot_Unarmed_MantleTall'),groundFrame=0,notes='jump-grab-pull-up onto a ~1.7 m ledge (see root_displacement)',mode='oneshot',ground=True),
 clip('climb_low','mx_fm',mx('fm__YBot_Unarmed_MantleShort'),groundFrame=0,notes='mantle onto a ~0.7 m ledge (see root_displacement)',mode='oneshot',ground=True),
 clip('ladder_up','mx_ladder',mx('ladder__Climbing_Ladder'),rootRot=[0,180,0],loop=True,mode='keep',metaExtra={'climb_speed_mps':0.65},notes='in place; move the character up at ~0.65 m/s (one rung ~0.26 m per half cycle) at timeScale 1'),
 clip('ladder_down','mx_ladder',mx('ladder__Climbing_Ladder'),rootRot=[0,180,0],loop=True,mode='keep',reverse=True,metaExtra={'climb_speed_mps':-0.65},notes='ladder_up reversed; move down at ~0.65 m/s'),
 clip('ladder_idle','mx_ladder',mx('ladder__Climbing_Ladder'),rootRot=[0,180,0],mode='static',holdFrame=0,hold=2,loop=True,osc=[{'bones':['Spine1'],'axis':[1,0,0],'deg':1.0,'period':2.0}]),
 clip('revive_teammate','ual1',U1,'Fixing_Kneeling',**X),
 clip('drive_sit','mx_kc',mx('kc__Driving'),loop=True,mode='inplace'),
 clip('car_enter','mx_kc',mx('kc__Entering_Car'),mode='oneshot',ground=True,groundFrame=0,notes='driver side: step in, turn ~95 deg and sit (ends in drive_sit; see root_displacement / yaw_change_deg)'),
 clip('car_exit','mx_kc',mx('kc__Exiting_Car'),mode='oneshot',ground=True,groundFrame='last',notes='from drive_sit: turn and step out to the left'),
 clip('passenger_sit','ual1',U1,'Sitting_Idle_Loop',loop=True,mode='inplace'),
 clip('injured_idle','mx_loose',mx('loose__MainCharacter_Injured_Idle'),**I),
 clip('injured_walk_f','mx_loose',mx('loose__MainCharacter_Injured_Walk'),**L),
 clip('freefall','mx_kc',mx('kc__Falling_in_the_Air'),loop=True,mode='inplace',notes='skydiving: body horizontal, face down'),
 clip('parachute_hang','mx_kc',mx('kc__Free_Hanging_Idle'),loop=True,mode='inplace',notes='alternative parachute pose: hanging with both hands up on the risers'),
 clip('parachute_idle','rpm',RPM+'/idle/M_Standing_Idle_001.glb',mode='static',hold=4,loop=True,
      pose={'LeftArm':{'aim':[0.35,0.9,0.1]},'LeftForeArm':{'aim':[-0.15,0.9,0.35]},'RightArm':{'aim':[-0.35,0.9,0.1]},'RightForeArm':{'aim':[0.15,0.9,0.35]},
            'LeftUpLeg':{'aim':[0.08,-0.85,0.5]},'LeftLeg':{'aim':[0.02,-0.97,-0.2]},'RightUpLeg':{'aim':[-0.08,-0.85,0.5]},'RightLeg':{'aim':[-0.02,-0.97,-0.2]},
            'Head':{'relEuler':[-8,0,0]}},
      osc=[{'bones':['Hips'],'axis':[1,0,0],'deg':2.5,'period':4.0},{'bones':['LeftUpLeg','RightUpLeg'],'axis':[1,0,0],'deg':4,'period':2.0,'phase':0.3},{'bones':['Hips'],'axis':[0,0,1],'deg':1.5,'period':4.0,'phase':0.5}],
      notes='hanging under canopy, hands on the brake toggles',**AUTH),
]
# freefall / parachute: the pose is authored, only the (overridden) idle frame comes from RPM
for c in actions:
    if c['name'] in ('drive_sit','passenger_sit','freefall','parachute_idle','parachute_hang'): c.pop('ground',None)
    if c['name'].startswith('ladder_'): c['ground']=True; c['groundPct']=0.0
write(OUT+'/prod_job.json', T, {OUT+'/locomotion.glb':loco, OUT+'/rifle.glb':rifle, OUT+'/pistol.glb':pistol, OUT+'/actions.glb':actions}, meta=OUT+'/meta.json', sockets=SOCK)
print(len(loco)+len(rifle)+len(pistol)+len(actions),'clips')
