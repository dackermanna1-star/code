from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, textwrap
F='/opt/assets/fonts/'
def f(n,s): return ImageFont.truetype(F+n,s)
rnd=random.Random(3)
def paper(w,h,col=(238,232,214)):
    im=Image.new('RGB',(w,h),col); px=im.load()
    for i in range(w*h//40):
        x,y=rnd.randrange(w),rnd.randrange(h); c=rnd.randint(-12,6); p=px[x,y]; px[x,y]=(p[0]+c,p[1]+c,p[2]+c)
    return im.filter(ImageFilter.GaussianBlur(0.6))
# --- newspaper (French daily, generic) 
im=paper(1400,1900,(226,222,208)); d=ImageDraw.Draw(im)
d.text((700,70),"LE QUOTIDIEN DE PARIS",font=f('Oswald.ttf',110),fill=(20,20,20),anchor='mt')
d.line((60,210,1340,210),fill=(20,20,20),width=4); d.text((70,225),"MARDI 30 AOÛT 1988   ·   3,50 F",font=f('IBMPlexMono-Medium.ttf',30),fill=(30,30,30))
d.text((70,300),"Aéroports : un voyageur\nsans papiers à Roissy",font=f('BarlowCondensed-Bold.ttf',120),fill=(15,15,15))
lorem="Les autorités françaises et britanniques se renvoient le dossier d'un homme arrivé sans document d'identité. Il attend dans le terminal. ".split()
for col in range(3):
    y=620
    while y<1820:
        line=' '.join(rnd.choice(lorem) for _ in range(6))
        d.text((70+col*440,y),line[:34],font=f('IBMPlexMono-Medium.ttf',22),fill=(60,60,60)); y+=30
    d.rectangle((70+col*440,1300,470+col*440,1560),fill=(150,150,145)) if col==1 else None
im.save('/opt/work/tex/newspaper.png')
# --- refugee certificate 1981 (stylised, generic UN-like wording)
im=paper(1200,1600,(242,238,226)); d=ImageDraw.Draw(im)
d.rectangle((40,40,1160,1560),outline=(40,60,110),width=6)
d.text((600,110),"ROYAUME DE BELGIQUE",font=f('Oswald.ttf',64),fill=(30,40,90),anchor='mt')
d.text((600,200),"CERTIFICAT DE RÉFUGIÉ",font=f('Oswald.ttf',80),fill=(20,20,20),anchor='mt')
d.text((600,300),"Convention de Genève du 28 juillet 1951",font=f('IBMPlexMono-Medium.ttf',32),fill=(60,60,60),anchor='mt')
y=420
for k,v in [("Nom","KARIMI NASSERI"),("Prénom","MEHRAN"),("Né le","1945"),("Lieu","MASJED SOLEYMAN"),("Statut","RÉFUGIÉ"),("Délivré","1981")]:
    d.text((120,y),k+" :",font=f('IBMPlexMono-Medium.ttf',44),fill=(70,70,70)); d.text((480,y),v,font=f('SpecialElite-Regular.ttf',52),fill=(20,20,30)); y+=110
d.rectangle((120,1150,420,1480),outline=(90,90,90),width=3); d.text((270,1315),"PHOTO",font=f('IBMPlexMono-Medium.ttf',36),fill=(140,140,140),anchor='mm')
im.save('/opt/work/tex/certificate.png')
# --- residency papers 1999 with nationality line
im=paper(1200,1600,(240,240,236)); d=ImageDraw.Draw(im)
d.text((600,90),"RÉPUBLIQUE FRANÇAISE",font=f('Oswald.ttf',70),fill=(20,30,80),anchor='mt')
d.text((600,190),"TITRE DE SÉJOUR",font=f('Oswald.ttf',96),fill=(20,20,20),anchor='mt')
y=380
for k,v in [("Nom","KARIMI NASSERI"),("Prénom","MEHRAN"),("Né en","1945"),("Nationalité","IRANIENNE"),("Valable","1999")]:
    d.text((110,y),k+" :",font=f('IBMPlexMono-Medium.ttf',46),fill=(70,70,70)); d.text((560,y),v,font=f('SpecialElite-Regular.ttf',58),fill=(20,20,30)); y+=120
d.text((110,1150),"Signature du titulaire :",font=f('IBMPlexMono-Medium.ttf',40),fill=(70,70,70))
d.line((110,1330,1090,1330),fill=(120,120,120),width=3)
im.save('/opt/work/tex/residency.png')
# --- diary pages (handwriting)
im=paper(1600,1100,(236,228,200)); d=ImageDraw.Draw(im)
for i in range(0,1100,48): d.line((0,i+40,1600,i+40),fill=(170,180,200),width=2)
d.line((800,0,800,1100),fill=(150,140,120),width=6)
words="today the airport is quiet the cleaners came at five I read the economist the lawyer says wait more patience my papers my name".split()
for page in range(2):
    y=60
    while y<1050:
        line=' '.join(rnd.choice(words) for _ in range(rnd.randint(4,7)))
        d.text((60+page*800,y),line,font=f('Caveat.ttf',40),fill=(25,35,90)); y+=48
im.save('/opt/work/tex/diary.png')
# --- luggage tag "Sir Alfred Mehran"
im=paper(800,400,(232,215,170)); d=ImageDraw.Draw(im)
d.rounded_rectangle((10,10,790,390),radius=30,outline=(120,90,50),width=8)
d.ellipse((40,170,90,220),outline=(100,80,50),width=6)
d.text((440,200),"Sir Alfred\nMehran",font=f('Caveat.ttf',120),fill=(20,25,70),anchor='mm',align='center')
im.save('/opt/work/tex/tag.png')
# --- paper bag print
im=Image.new('RGB',(512,512),(175,130,85)); d=ImageDraw.Draw(im)
for i in range(0,512,6): d.line((i,0,i,512),fill=(165,122,80))
d.text((256,256),"BOULANGERIE\nde l'aérogare",font=f('Oswald.ttf',48),fill=(90,40,20),anchor='mm',align='center')
im.save('/opt/work/tex/paperbag.png')
print('ok')
