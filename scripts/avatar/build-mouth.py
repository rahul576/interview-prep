# Talking-head v2 assets: continuous aligned mouth footage + jump table (video-textures style)
import cv2, numpy as np, json, sys, os
SRC, AN, TALK, LISTEN, OUT = sys.argv[1:6]
os.makedirs(OUT, exist_ok=True)
d = json.load(open(AN))
def frames(p):
    cap = cv2.VideoCapture(p); fs = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fs.append(f)
    return fs
T, L = frames(TALK), frames(LISTEN)
rt, rl = d[os.path.basename(TALK)], d[os.path.basename(LISTEN)]

def smooth_W(rows, r=2):
    W = np.array([r_['W'] for r_ in rows], np.float64)
    out = W.copy()
    for i in range(len(W)):
        a, b = max(0, i - r), min(len(W), i + r + 1); out[i] = W[a:b].mean(0)
    return out
WT, WL = smooth_W(rt), smooth_W(rl)
warp = lambda f, W: cv2.warpAffine(f, W.astype(np.float32), (500, 500), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)

# base loop (same as before) with smoothed face transforms
a, b = 96, 279
idx = list(range(a, b + 1)) + list(range(b - 1, a, -1))
vw = cv2.VideoWriter(f'{OUT}/base.avi', cv2.VideoWriter_fourcc(*'MJPG'), 30, (500, 500))
for i in idx: vw.write(T[i])
vw.release()
aff = [[round(float(x), 4) for x in (WT[i][0][0], WT[i][1][0], WT[i][0][1], WT[i][1][1], WT[i][0][2], WT[i][1][2])] for i in idx]

MX, MY, MW, MH = 182, 230, 140, 132
m = np.zeros((MH, MW), np.float32); cv2.ellipse(m, (MW // 2, 68), (54, 50), 0, 0, 360, 1, -1); mmask = cv2.GaussianBlur(m, (0, 0), 5)

def mouth_h(p):
    hsv = cv2.cvtColor(p, cv2.COLOR_BGR2HSV)[25:65, 38:104]
    inner = (hsv[..., 2] < 100) | ((hsv[..., 1] < 70) & (hsv[..., 2] > 160))
    inner = cv2.morphologyEx(inner.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return int(inner[:, 26:40].any(axis=1).sum()), int(inner.any(axis=0).sum())

# mouth footage: all of the talking (listen.mp4) clip; drop wide grins
patches, oh, keep = [], [], []
for i, f in enumerate(L):
    p = warp(f, WL[i])[MY:MY + MH, MX:MX + MW]
    h, w = mouth_h(p)
    ok = rl[i]['cc'] >= 0.96 and not (h >= 3 and w > 5.2 * h)
    patches.append(p); oh.append(h); keep.append(ok)
oh = np.array(oh, float)
oh_s = np.convolve(np.pad(oh, 1, mode='edge'), np.ones(3) / 3, mode='valid')   # light smoothing of the measurement
sel = [i for i in range(len(L)) if keep[i]]
pos = {i: k for k, i in enumerate(sel)}
o = np.clip(oh_s[sel] / 13.0, 0, 1)
nxt = [pos.get(i + 1, -1) for i in sel]
# appearance similarity (gray, small) for jumps
small = np.array([cv2.resize(cv2.cvtColor(patches[i], cv2.COLOR_BGR2GRAY), (35, 33)).astype(np.float32).ravel() * mmask[::4, ::4][:33, :35].ravel() for i in sel])
D = np.sqrt(((small[:, None, :] - small[None, :, :]) ** 2).mean(-1))
jumps = []
for k in range(len(sel)):
    order = [j for j in np.argsort(D[k]) if abs(j - k) > 4][:10]
    jumps.append([[int(j), round(float(D[k][j]), 2)] for j in order])
print('mouth frames', len(sel), 'of', len(L), 'D median', round(float(np.median(D)), 2), 'jump median', round(float(np.median([j[1] for js in jumps for j in js])), 2))

# blink frames (unchanged approach)
EX, EY, EW, EH = 174, 158, 166, 62
em = np.zeros((EH, EW), np.float32); cv2.ellipse(em, (EW // 2, EH // 2), (66, 17), 0, 0, 360, 1, -1); emask = cv2.GaussianBlur(em, (0, 0), 4)
eye = np.array([r['eye'] for r in rt]); base_e = float(np.median(eye[a:b])); win = list(range(18, 45)); peak = max(eye[i] for i in win)
near = lambda v: min(win, key=lambda i: abs(eye[i] - v))
eye_idx = [near(base_e + (peak - base_e) * f) for f in (0.35, 0.7, 1.0)]

# sprite grid
cells = [(patches[i], mmask) for i in sel] + [(warp(T[i], WT[i])[EY:EY + EH, EX:EX + EW], emask) for i in eye_idx]
CW, CH = 166, 132; COLS = 24; rows = (len(cells) + COLS - 1) // COLS
sprite = np.zeros((rows * CH, COLS * CW, 4), np.uint8)
for k, (p, mk) in enumerate(cells):
    r_, c_ = divmod(k, COLS); h, w = p.shape[:2]
    sprite[r_ * CH:r_ * CH + h, c_ * CW:c_ * CW + w, :3] = p
    sprite[r_ * CH:r_ * CH + h, c_ * CW:c_ * CW + w, 3] = (mk * 255).astype(np.uint8)
cv2.imwrite(f'{OUT}/sprite.webp', sprite, [cv2.IMREAD_UNCHANGED and cv2.IMWRITE_WEBP_QUALITY, 82])
np.save(f'{OUT}/sprite.npy', sprite)
meta = dict(v=2, fps=30, size=500, frames=aff, cell=[CW, CH], cols=COLS,
            mouth=dict(box=[MX, MY, MW, MH], open=[round(float(x), 3) for x in o], next=nxt, jumps=jumps),
            eyes=dict(box=[EX, EY, EW, EH], seq=[len(sel) + k for k in range(3)]))
json.dump(meta, open(f'{OUT}/rig.json', 'w'), separators=(',', ':'))
print('sprite', sprite.shape, os.path.getsize(f'{OUT}/sprite.webp') // 1024, 'KB; rig', os.path.getsize(f'{OUT}/rig.json') // 1024, 'KB')
print('openness histogram', np.histogram(o, bins=[0, .05, .2, .4, .6, .8, 1.01])[0])
