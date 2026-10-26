# Cut cars out of photos with rembg (ISNet general-use, runs locally). usage: python cutout.py <inDir> <outDir>
import sys, os, glob
from rembg import new_session, remove
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
session = new_session('isnet-general-use')
for f in sorted(glob.glob(os.path.join(src, '*.jpg'))):
    name = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert('RGB')
    out = remove(im, session=session)
    out.save(os.path.join(dst, name + '.png'))
    print(name, out.size, flush=True)
