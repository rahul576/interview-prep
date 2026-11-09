import cv2, numpy as np, json, sys
SRC = cv2.imread(sys.argv[1]); out = sys.argv[2]; vids = sys.argv[3:]
g0 = cv2.cvtColor(SRC, cv2.COLOR_BGR2GRAY).astype(np.float32)
# template: brows+eyes+nose, without mouth
mask = np.zeros_like(g0, np.uint8); mask[140:250, 165:345] = 255
def eye_dark(gw, cx, cy):  # mean brightness of the eye slit (open eye = dark iris/lashes)
    return float(gw[cy-5:cy+5, cx-13:cx+13].mean())
res = {}
for v in vids:
    cap = cv2.VideoCapture(v); rows = []; W = np.eye(2, 3, dtype=np.float32)
    while True:
        ok, f = cap.read()
        if not ok: break
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
        try:
            cc, W = cv2.findTransformECC(g0, g, W, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5), mask, 3)
        except cv2.error:
            cc = 0.0
        # frame -> source coords
        gw = cv2.warpAffine(g, W, (500, 500), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        hsv = cv2.cvtColor(cv2.warpAffine(f, W, (500, 500), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP), cv2.COLOR_BGR2HSV)
        box = hsv[258:286, 226:280]
        dark = float((box[..., 2] < 95).mean())      # mouth interior
        teeth = float(((box[..., 1] < 60) & (box[..., 2] > 170)).mean())
        rows.append(dict(cc=float(cc), W=W.tolist(), eye=(eye_dark(gw, 215, 188) + eye_dark(gw, 297, 191)) / 2, dark=dark, teeth=teeth))
    res[v] = rows
json.dump(res, open(out, 'w'))
for v, rows in res.items():
    e = np.array([r['eye'] for r in rows]); d = np.array([r['dark'] + r['teeth'] for r in rows]); c = np.array([r['cc'] for r in rows])
    print(v, len(rows), 'cc min %.3f med %.3f' % (c.min(), np.median(c)), 'eye %.0f..%.0f' % (e.min(), e.max()), 'mouth %.2f..%.2f' % (d.min(), d.max()))
