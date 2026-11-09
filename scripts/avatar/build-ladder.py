import json, numpy as np, cv2, os
R = '/tmp/claude-0/lp2/rig'; OUT = '/tmp/claude-0/lp2/final'; os.makedirs(OUT, exist_ok=True)
m = json.load(open(f'{R}/rig.json')); S = np.load(f'{R}/sprite.npy'); o = np.array(m['mouth']['open'])
def cell(k): r, c = divmod(k, m['cols']); return S[r*132:(r+1)*132, c*166:c*166+166]
ramp = json.load(open('/tmp/claude-0/lp2/ramps.json'))[0]
lad = [ramp[0]]
for s in ramp[1:]:
    if o[s] > o[lad[-1]] + 0.02: lad.append(s)
lo = np.array([o[s] for s in lad]); lo = (lo - lo[0]) / (lo[-1] - lo[0])
cells = [cell(s) for s in lad] + [cell(k) for k in m['eyes']['seq']]
sprite = np.hstack(cells)
cv2.imwrite(f'{OUT}/face.webp', sprite, [cv2.IMWRITE_WEBP_QUALITY, 92]); cv2.imwrite(f'{OUT}/face.png', sprite)
meta = dict(v=2, fps=30, size=500, frames=m['frames'], cell=[166, 132],
            mouth=dict(box=m['mouth']['box'], ladder=list(range(len(lad))), open=[round(float(x), 3) for x in lo]),
            eyes=dict(box=m['eyes']['box'], seq=[len(lad) + k for k in range(3)]),
            voice=dict(tauA=0.035, tauR=0.08, floor=0.01, range=0.14, gamma=1.0))
json.dump(meta, open(f'{OUT}/rig.json', 'w'), separators=(',', ':'))
print('ladder', lad, lo.round(2), 'face.webp', os.path.getsize(f'{OUT}/face.webp') // 1024, 'KB')
