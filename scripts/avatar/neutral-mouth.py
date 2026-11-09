import cv2, numpy as np, json, sys
F = '/tmp/claude-0/lp2/final'
S = cv2.imread(f'{F}/face.png', cv2.IMREAD_UNCHANGED)
meta = json.load(open(f'{F}/rig.json'))
CW, CH = meta['cell']; MW, MH = meta['mouth']['box'][2:]
DOWN = float(sys.argv[1]) if len(sys.argv) > 1 else 4.0; IN = 1.5; SIG = float(sys.argv[2]) if len(sys.argv) > 2 else 8.0
corners = [(36, 35, +1), (104, 38, -1)]          # (x, y, inward direction) in patch coords
yy, xx = np.mgrid[0:MH, 0:MW].astype(np.float32)
dx = np.zeros_like(xx); dy = np.zeros_like(yy)
for cx, cy, s in corners:
    w = np.exp(-((xx - cx) ** 2 + (yy - (cy + DOWN * 0.5)) ** 2) / (2 * SIG ** 2))
    dy += DOWN * w; dx += s * IN * w
mapx, mapy = xx - dx, yy - dy
out = S.copy()
mk = np.zeros((MH, MW), np.float32); cv2.ellipse(mk, (MW // 2, 64), (58, 51), 0, 0, 360, 1, -1); mk = cv2.GaussianBlur(mk, (0, 0), 4)
for k in meta['mouth']['ladder']:
    cell = S[:MH, k * CW:k * CW + MW]
    w_ = cv2.remap(cell, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    w_[..., 3] = (mk * 255).astype(np.uint8)
    out[:MH, k * CW:k * CW + MW] = w_
cv2.imwrite(f'{F}/face-neutral.png', out)
def flat(img): a = img[..., 3:4] / 255.0; return (img[..., :3] * a + 235 * (1 - a)).astype(np.uint8)
row = lambda img: np.hstack([cv2.resize(flat(img[:MH, k * CW:k * CW + MW])[20:75, 15:125], (330, 165), interpolation=cv2.INTER_CUBIC) for k in (0, 3, 7)])
cv2.imwrite('/tmp/claude-0/lp2/desmile.png', np.vstack([row(S), row(out)]))
