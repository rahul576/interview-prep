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
warp = lambda f, W: cv2.warpAffine(f, np.array(W, np.float32), (500, 500), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)

# 1) base loop: talk 3.2s..9.3s, forward + backward (no blinks in it)
a, b = 96, 279
idx = list(range(a, b + 1)) + list(range(b - 1, a, -1))
vw = cv2.VideoWriter(f'{OUT}/base.avi', cv2.VideoWriter_fourcc(*'MJPG'), 30, (500, 500))
for i in idx: vw.write(T[i])
vw.release()
aff = [[round(x, 4) for x in (rt[i]['W'][0][0], rt[i]['W'][1][0], rt[i]['W'][0][1], rt[i]['W'][1][1], rt[i]['W'][0][2], rt[i]['W'][1][2])] for i in idx]

# 2) mouth patches (source coordinates)
MX, MY, MW, MH = 182, 230, 140, 132   # x 182..322, y 230..362
def feather(w, h, cx, cy, rx, ry, blur):
    m = np.zeros((h, w), np.float32); cv2.ellipse(m, (cx, cy), (rx, ry), 0, 0, 360, 1, -1)
    return cv2.GaussianBlur(m, (0, 0), blur)
mmask = feather(MW, MH, MW // 2, 68, 54, 50, 5)
def mouth_shape(f, W):
    hsv = cv2.cvtColor(warp(f, W), cv2.COLOR_BGR2HSV)[255:295, 220:286]
    inner = (hsv[..., 2] < 100) | ((hsv[..., 1] < 70) & (hsv[..., 2] > 160))
    inner = cv2.morphologyEx(inner.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    h = int(inner[:, 26:40].any(axis=1).sum()); w = int(inner.any(axis=0).sum())
    return h, w
cand = []
for name, fs, rows in (('L', L, rl), ('T', T, rt)):
    for i, r in enumerate(rows):
        if r['cc'] < 0.965: continue
        h, w = mouth_shape(fs[i], r['W'])
        if h >= 3 and w > 5.2 * h: continue   # wide grin, not a speech shape
        cand.append((h, name, i))
# closed reference: a base frame with mouth closed
closed = [c for c in cand if c[1] == 'T' and a <= c[2] <= b and c[0] == 0]
levels_target = [0, 3, 5, 7, 9, 11, 13]
cells = []; levels = []
used = set()
for li, tgt in enumerate(levels_target):
    pool = closed if tgt == 0 else [c for c in cand if c[1] == 'L']
    pool = sorted(pool, key=lambda c: abs(c[0] - tgt))
    picks = []
    for c in pool:
        if any(abs(c[2] - u[1]) < 12 and c[1] == u[0] for u in used): continue  # different moments = different shapes
        picks.append(c); used.add((c[1], c[2]))
        if len(picks) == 3: break
    lv = []
    for c in picks:
        f = (L if c[1] == 'L' else T)[c[2]]; rows = rl if c[1] == 'L' else rt
        p = warp(f, rows[c[2]]['W'])[MY:MY + MH, MX:MX + MW]
        lv.append(len(cells)); cells.append((p, mmask))
    levels.append(dict(target=tgt, cells=lv, got=[round(c[0], 3) for c in picks]))

# 3) eye blink sequence from talk blink at ~0.87 s (frames 22..34)
EX, EY, EW, EH = 174, 158, 166, 62   # both eyes
emask = feather(EW, EH, EW // 2, EH // 2, 66, 17, 4)
eye = np.array([r['eye'] for r in rt])
win = list(range(18, 45)); base_e = float(np.median(eye[a:b]))
peak = max(eye[i] for i in win)
def near(v): return min(win, key=lambda i: abs(eye[i] - v))
seq_idx = [near(base_e + (peak - base_e) * f) for f in (0.35, 0.7, 1.0)]
pk = seq_idx[-1]
eye_cells = []
for i in seq_idx:
    p = warp(T[i], rt[i]['W'])[EY:EY + EH, EX:EX + EW]
    eye_cells.append(len(cells)); cells.append((p, emask))

# sprite: one row, cell width = max w, height = max h
CW, CH = max(MW, EW), max(MH, EH)
sprite = np.zeros((CH, CW * len(cells), 4), np.uint8)
for k, (p, m) in enumerate(cells):
    h, w = p.shape[:2]
    sprite[:h, k * CW:k * CW + w, :3] = p
    sprite[:h, k * CW:k * CW + w, 3] = (m * 255).astype(np.uint8)
cv2.imwrite(f'{OUT}/sprite.webp', sprite, [cv2.IMWRITE_WEBP_QUALITY, 92])
cv2.imwrite(f'{OUT}/sprite.png', sprite)
meta = dict(fps=30, size=500, frames=aff, cell=[CW, CH],
            mouth=dict(box=[MX, MY, MW, MH], levels=[l['cells'] for l in levels]),
            eyes=dict(box=[EX, EY, EW, EH], seq=eye_cells))
json.dump(meta, open(f'{OUT}/rig.json', 'w'), separators=(',', ':'))
print('base frames', len(idx), 'cells', len(cells), 'blink peak frame', pk, 'eye', [round(float(eye[i]), 1) for i in seq_idx])
for l in levels: print(l)
