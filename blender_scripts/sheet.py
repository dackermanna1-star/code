import sys, glob, os
from PIL import Image, ImageDraw
d_=sys.argv[1]; keys=sys.argv[2].split(','); out=sys.argv[3]; sc=float(sys.argv[4]) if len(sys.argv)>4 else 0.34
W,H=400,560; s=Image.new('RGB',(W*len(keys),H*2))
for i,k in enumerate(keys):
    s.paste(Image.open(f'{d_}/{k}_front.png'),(i*W,0)); s.paste(Image.open(f'{d_}/{k}_side.png'),(i*W,H))
s=s.resize((int(W*len(keys)*sc),int(H*2*sc))); d=ImageDraw.Draw(s)
for i,k in enumerate(keys): d.text((int(i*W*sc)+4,4),k,fill='yellow')
s.save(out)
