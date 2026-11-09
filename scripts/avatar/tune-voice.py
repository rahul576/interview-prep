import json, numpy as np, cv2, sys, itertools, warnings
warnings.filterwarnings('ignore')
m = json.load(open('/tmp/claude-0/lp2/rig/rig.json')); S = np.load('/tmp/claude-0/lp2/rig/sprite.npy')
envs = json.load(open('/tmp/claude-0/lp2/envs.json'))
o = np.array(m['mouth']['open'])
def cell(k): r, c = divmod(k, 24); return S[r*132:(r+1)*132, c*166:c*166+140]
ramp = json.load(open('/tmp/claude-0/lp2/ramps.json'))[0]
# monotone ladder of distinct openness steps
lad = [ramp[0]]
for s in ramp[1:]:
    if o[s] > o[lad[-1]] + 0.04: lad.append(s)
lo = np.array([o[s] for s in lad]); lo = (lo - lo[0]) / (lo[-1] - lo[0])
imgs = [cell(s).astype(np.float32) for s in lad]
def gray(p): return cv2.cvtColor(p[..., :3].astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) * (p[..., 3] / 255.0)
G = [gray(i) for i in imgs]
def at(x):   # blended mouth for openness x (0..1)
    k = int(np.searchsorted(lo, x, side='right') - 1); k = max(0, min(len(lo) - 2, k))
    f = (x - lo[k]) / (lo[k+1] - lo[k]); f = max(0, min(1, f))
    return k, f
def target(env, P):
    out, f = [], 0.0
    aA, aR = 1 - np.exp(-1/60/P['tauA']), 1 - np.exp(-1/60/P['tauR'])
    for e in env:
        f += (e - f) * (aA if e > f else aR)
        out.append(min(1.0, max(0.0, (f - P['floor']) / P['range'])) ** P['gamma'])
    return np.array(out)
def rev(x): return sum(1 for i in range(2, len(x)) if (x[i]-x[i-1])*(x[i-1]-x[i-2]) < 0 and abs(x[i]-x[i-1]) > 0.04) / (len(x)/30)
def jit(xs):
    g = []
    for x in xs:
        k, f = at(x); g.append(G[k] * (1-f) + G[k+1] * f)
    return float(np.mean([np.abs(g[i]-g[i-1]).mean() for i in range(1, len(g))]))
if __name__ == '__main__':
    print('ladder', lad, lo.round(2))
    for tauA, tauR, rng, gamma in itertools.product([0.02, 0.035], [0.05, 0.08, 0.12], [0.1, 0.14], [1.0, 1.3]):
        P = dict(tauA=tauA, tauR=tauR, floor=0.01, range=rng, gamma=gamma)
        r = []; j = []; a = []
        for env in envs:
            x = target(env, P)[::2]; r.append(rev(x)); j.append(jit(x)); a.append(np.percentile(x[x > 0.02], 80))
        print(f'tauA {tauA} tauR {tauR} range {rng} gamma {gamma}: syll/s {np.mean(r):.1f} jitter {np.mean(j):.2f} open80 {np.mean(a):.2f}')
