# Shared rig / source definitions for the animation retarget jobs (see prod.py).
# ASSET_WORK = work folder OUTSIDE the repo holding the converted sources:
#   $ASSET_WORK/work/anims/src/mixamo/*.glb      fbx2glb.py output of download_anim_sources.sh
#   $ASSET_WORK/work/anims/src/rocketbox/*.glb   Rocketbox animation FBX converted with fbx2glb.py
#   $ASSET_WORK/raw/characters/quat/...          Quaternius UAL 1/2 'Standard' GLBs (itch.io download)
#   $ASSET_WORK/rpm-anim/masculine/glb/...       Ready Player Me animation library (masculine/glb)
import json, os
S=os.environ.get('ASSET_WORK', os.path.expanduser('~/asset_work'))
REPO=os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
A=S+'/work/anims/src'
Q1=S+'/raw/characters/quat/z_universal-animation-library/Universal Animation Library[Standard]/Unreal-Godot'
Q2=S+'/raw/characters/quat/z_universal-animation-library-2/Universal Animation Library 2[Standard]/Unreal-Godot'
RPM=S+'/rpm-anim/masculine/glb'
RIGS={
 'rpm':{'type':'rpm','rest':RPM+'/Masculine_TPose.glb'},
 'ual1':{'type':'ual','rest':Q1+'/UAL1_Standard.glb'},
 'ual1rm':{'type':'ual','rest':Q1+'/UAL1_Standard_RM.glb'},
 'ual2':{'type':'ual','rest':Q2+'/UAL2_Standard.glb'},
 'ual2rm':{'type':'ual','rest':Q2+'/UAL2_Standard_RM.glb'},
 'rbx':{'type':'rocketbox','rest':A+'/rest/Male_Adult_08.glb'},
 # Mixamo groups (each group shares one character rig; rest = bind pose stored in any file of the group)
 'mx_pr':{'type':'mixamo','rest':A+'/mixamo/prorifle__idle.glb'},
 'mx_bs':{'type':'mixamo','rest':A+'/mixamo/basicshooter__walking.glb'},
 'mx_ch35':{'type':'mixamo','rest':A+'/mixamo/duel__Ch35_nonPBR_Rifle_Idle.glb'},
 'mx_ybot':{'type':'mixamo','rest':A+'/mixamo/duel__Y_Bot_Reloading.glb'},
 'mx_hex':{'type':'mixamo','rest':A+'/mixamo/hexlive__TreadWater.glb'},
 'mx_ladder':{'type':'mixamo','rest':A+'/mixamo/ladder__Climbing_Ladder.glb'},
 'mx_loose':{'type':'mixamo','rest':A+'/mixamo/loose__MainCharacter_Prone_Idle.glb'},
 'mx_strike':{'type':'mixamo','rest':A+'/mixamo/strike___Prone_Idle.glb'},
 'mx_fm':{'type':'mixamo','rest':A+'/mixamo/fm__YBot_Unarmed_Vault.glb'},
 'mx_ml':{'type':'mixamo','rest':A+'/mixamo/ml__throw.glb'},
 'mx_kc':{'type':'mixamo','rest':A+'/mixamo/kc__Idle.glb'},
}
LIC={
 'rpm':('Ready Player Me Animation Library (github.com/readyplayerme/animation-library)','RPM Animation Library License: free, but licensed for use with Ready Player Me avatars only; no redistribution'),
 'ual1':('Quaternius Universal Animation Library (quaternius.itch.io/universal-animation-library)','CC0 1.0'),
 'ual1rm':('Quaternius Universal Animation Library (quaternius.itch.io/universal-animation-library)','CC0 1.0'),
 'ual2':('Quaternius Universal Animation Library 2 (quaternius.itch.io/universal-animation-library-2)','CC0 1.0'),
 'ual2rm':('Quaternius Universal Animation Library 2 (quaternius.itch.io/universal-animation-library-2)','CC0 1.0'),
 'rbx':('Microsoft Rocketbox animation library (github.com/microsoft/Microsoft-Rocketbox)','MIT'),
 'mx_pr':('Mixamo (Adobe) "Pro Rifle Pack", via GitHub theKooker/FPS-Multiplayer','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_bs':('Mixamo (Adobe) "Basic Shooter Pack", via GitHub alexlp04/RobotSurvival','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_ch35':('Mixamo (Adobe) rifle/prone clips, via GitHub Gus2169/Duel-Arena','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_ybot':('Mixamo (Adobe) clips on Y Bot, via GitHub Gus2169/Duel-Arena','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_hex':('Mixamo (Adobe) clips on X Bot, via GitHub shtolyan/HexLive','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_ladder':('Mixamo (Adobe) "Climbing Ladder", via GitHub chetan-code/RigidbodyRaycastBased-CharacterController3D-Unity','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_loose':('Mixamo (Adobe) prone/injured clips, via GitHub DiogoAlmeida777/Loose-Limbs','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_strike':('Mixamo (Adobe) prone/climb clips, via GitHub Krushna0304/StrikeFront','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_fm':('Mixamo (Adobe) clips on Y Bot, via GitHub annaborja/FantasyMelee','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_ml':('Mixamo (Adobe) clips, via GitHub S-N-D-R/UnityMixamoLibrary','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
 'mx_kc':('Mixamo (Adobe) clips on Y Bot, via GitHub kirbycope/godot-3d-player-controller-addon','Mixamo/Adobe terms: free for use in projects, no standalone redistribution'),
}
def mx(name): return A+'/mixamo/'+name+'.glb'
def clip(name, rig, src, anim=None, **kw):
    d={'name':name,'rig':rig,'src':src}
    if anim: d['anim']=anim
    d['source'],d['license']=LIC[rig]
    d.update(kw); return d
def write(path, target, outputs, meta=None, **kw):
    job={'target':target,'fps':30,'rigs':RIGS,'outputs':outputs}
    if meta: job['meta']=meta
    job.update(kw)
    json.dump(job, open(path,'w'), indent=1)
