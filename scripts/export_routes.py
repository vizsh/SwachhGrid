"""Builds collection-van routes and lane coverage for the pilot area from real OpenStreetMap roads.

usage: python export_routes.py <overpass_roads.json> <out_dir>
Get the input with the Overpass query in docs/DATA.md (ways with highway=primary..service in the pilot box).

Outputs <out_dir>/routes.json:
  vans:  [{id, zone, name, lengthM, path: [[lon, lat], ...], cum: [metres along path at each point]}]
  lanes: [[lon1, lat1, lon2, lat2, vanId, covered 1 | skipped 0], ...] for each van's beat
Routes are simulated (no real van GPS is public); the roads they follow are real.
"""
import json, math, random, sys, os
from collections import defaultdict

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
nodes = {e["id"]: (e["lon"], e["lat"]) for e in d["elements"] if e["type"] == "node"}
adj = defaultdict(set)
for w in (e for e in d["elements"] if e["type"] == "way"):
    ns = [n for n in w["nodes"] if n in nodes]
    for a, b in zip(ns, ns[1:]):
        if a != b:
            adj[a].add(b)
            adj[b].add(a)

def dist(a, b):
    (x1, y1), (x2, y2) = nodes[a], nodes[b]
    dx = (x2 - x1) * 111000 * math.cos(math.radians(y1))
    dy = (y2 - y1) * 111000
    return math.hypot(dx, dy)

def near(lon, lat):
    return min(adj, key=lambda n: (nodes[n][0] - lon) ** 2 + (nodes[n][1] - lat) ** 2)

def to_anchor(n, anchor):
    x, y = nodes[n]
    return math.hypot((x - anchor[0]) * 103600, (y - anchor[1]) * 111000)

# Two vans per pilot zone, each with a beat around a dense locality.
BEATS = [
    ("GB-1", "gandhibagh", "Mominpura beat", (79.0985, 21.1575)),
    ("GB-2", "gandhibagh", "Itwari–Mahal beat", (79.1095, 21.1500)),
    ("LK-1", "lakadganj", "Kalamna beat", (79.1409, 21.1660)),
    ("LK-2", "lakadganj", "Pardi beat", (79.1640, 21.1556)),
    ("AN-1", "ashinagar", "Vaishali Nagar beat", (79.1127, 21.1701)),
    ("AN-2", "ashinagar", "Yashodhara Nagar beat", (79.1261, 21.1830)),
]
TARGET_M = 6200
RADIUS_M = 650
rnd = random.Random(11)
covered = {}
skipped = {}
vans = []
for vid, zone, name, anchor in BEATS:
    cur = near(*anchor)
    path, seen, length = [cur], set(), 0.0
    while length < TARGET_M:
        opts = [n for n in adj[cur] if to_anchor(n, anchor) < RADIUS_M]
        fresh = [n for n in opts if frozenset((cur, n)) not in seen]
        # skip about 1 in 7 fresh lanes: that is the "truck did not come" pattern the app detects
        keep = [n for n in fresh if rnd.random() > 0.14]
        for n in fresh:
            if n not in keep and frozenset((cur, n)) not in covered:
                skipped.setdefault(frozenset((cur, n)), vid)
        fresh = keep or fresh
        pool = fresh or opts or list(adj[cur])
        # prefer continuing away from where we came from, and lanes nearer the beat centre
        prev = path[-2] if len(path) > 1 else None
        pool.sort(key=lambda n: (n == prev, to_anchor(n, anchor) + rnd.random() * 220))
        nxt = pool[0]
        seen.add(frozenset((cur, nxt)))
        covered.setdefault(frozenset((cur, nxt)), vid)
        length += dist(cur, nxt)
        path.append(nxt)
        cur = nxt
    cum, acc = [0.0], 0.0
    for a, b in zip(path, path[1:]):
        acc += dist(a, b)
        cum.append(round(acc, 1))
    vans.append({
        "id": vid, "zone": zone, "name": name, "lengthM": round(acc),
        "path": [[round(nodes[n][0], 6), round(nodes[n][1], 6)] for n in path], "cum": cum,
    })
    print(vid, name, len(path), "points", round(acc), "m")

# Lanes on each beat: the ones a van drove (covered) and the ones it was due on but skipped.
lanes = []
for k, vid in covered.items():
    a, b = tuple(k)
    (x1, y1), (x2, y2) = nodes[a], nodes[b]
    lanes.append([round(x1, 6), round(y1, 6), round(x2, 6), round(y2, 6), vid, 1])
for k, vid in skipped.items():
    if k in covered:
        continue
    a, b = tuple(k)
    (x1, y1), (x2, y2) = nodes[a], nodes[b]
    lanes.append([round(x1, 6), round(y1, 6), round(x2, 6), round(y2, 6), vid, 0])
miss = sum(1 for l in lanes if not l[5])
print("lanes", len(lanes), "missed", miss)
os.makedirs(out, exist_ok=True)
json.dump({"vans": vans, "lanes": lanes}, open(os.path.join(out, "routes.json"), "w"), separators=(",", ":"))

# Seed "truck did not come" reports beside some skipped lanes, so the van-route cross-check has
# real matches to show. Marked with "van": true; re-running replaces them.
seed_path = os.path.join(out, "seed.json")
if os.path.exists(seed_path):
    seed = [r for r in json.load(open(seed_path)) if not r.get("van")]
    rnd2 = random.Random(5)
    skipped_lanes = [l for l in lanes if not l[5]]
    rnd2.shuffle(skipped_lanes)
    for i, l in enumerate(skipped_lanes[:12]):
        lon, lat = (l[0] + l[2]) / 2, (l[1] + l[3]) / 2
        seed.append({
            "id": f"NGP-{1400 + i}", "lat": round(lat + 0.00007, 6), "lon": round(lon + 0.00005, 6),
            "cat": "missed_collection", "sev": 2, "ageH": round(rnd2.uniform(1.5, 20), 1),
            "resolvedAgoH": None, "meToo": rnd2.choice([1, 2, 3, 5]), "van": True,
        })
    json.dump(seed, open(seed_path, "w"), separators=(",", ":"))
    print("seed now", len(seed))
