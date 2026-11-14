"""Exports pilot-area data for SwachhGrid from a local DuckDB extract of Overture Maps buildings.

usage: python export_data.py <duckdb_pylib_dir> <nagpur.duckdb> <out_dir>
Outputs: tiles/14/<x>/<y>.json (building rings), density.json (55 m building-count grid),
         seed.json (demo reports placed in the densest small-building clusters).
"""
import sys, json, math, os, random
sys.path.insert(0, sys.argv[1])
import duckdb

LAT0, LAT1, LON0, LON1 = 21.135, 21.190, 79.085, 79.175
Z = 14
CELL = 0.0005
out = sys.argv[3]
con = duckdb.connect(sys.argv[2], read_only=True)
con.execute("LOAD spatial;")
rows = con.execute(f"""
  SELECT area_m2, lon, lat, ST_AsGeoJSON(ST_GeomFromWKB(wkb)) FROM b
  WHERE lat BETWEEN {LAT0} AND {LAT1} AND lon BETWEEN {LON0} AND {LON1} AND area_m2 > 6
""").fetchall()
print("buildings", len(rows))

def tile(lon, lat):
    n = 2 ** Z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y

tiles, density, cents = {}, {}, []
for area, lon, lat, gj in rows:
    g = json.loads(gj)
    ring = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
    flat = []
    for c in ring:
        flat += [round(c[0], 5), round(c[1], 5)]
    tiles.setdefault(tile(lon, lat), []).append([round(area), flat])
    k = f"{int((lat - LAT0) / CELL)}_{int((lon - LON0) / CELL)}"
    density[k] = density.get(k, 0) + 1
    cents.append((lat, lon, area))

for (x, y), items in tiles.items():
    d = os.path.join(out, "tiles", str(Z), str(x)); os.makedirs(d, exist_ok=True)
    json.dump(items, open(os.path.join(d, f"{y}.json"), "w"), separators=(",", ":"))
print("tiles", len(tiles), "max per tile", max(len(v) for v in tiles.values()))
json.dump({"lat0": LAT0, "lon0": LON0, "cell": CELL, "counts": density},
          open(os.path.join(out, "density.json"), "w"), separators=(",", ":"))

# ---- seed reports: placed beside real small buildings inside dense cells ----
rnd = random.Random(7)
def near(lat, lon, r=2):
    ci, cj = int((lat - LAT0) / CELL), int((lon - LON0) / CELL)
    return sum(density.get(f"{ci+a}_{cj+b}", 0) for a in range(-r, r + 1) for b in range(-r, r + 1))
dense = [c for c in cents if c[2] < 45 and near(c[0], c[1]) > 170]
print("dense candidates", len(dense))
CATS = [("garbage_dump", 34), ("overflowing_bin", 18), ("blocked_drain", 20), ("stagnant_water", 12),
        ("missed_collection", 12), ("dead_animal", 4)]
def pick_cat():
    return rnd.choices([c for c, _ in CATS], [w for _, w in CATS])[0]
def jitter(lat, lon, m):
    return lat + rnd.uniform(-m, m) / 111000, lon + rnd.uniform(-m, m) / 104000
seed = []
hot = rnd.sample(dense, 14)          # chronic spots: repeat reports at the same place
for h in hot:
    cat = rnd.choice(["garbage_dump", "blocked_drain", "overflowing_bin"])
    for i in range(rnd.randint(6, 11)):
        la, lo = jitter(h[0], h[1], 18)
        seed.append([la, lo, cat if rnd.random() < 0.8 else pick_cat(), rnd.uniform(4, 720)])
while len(seed) < 330:
    c = rnd.choice(dense); la, lo = jitter(c[0], c[1], 10)
    seed.append([la, lo, pick_cat(), rnd.uniform(1, 720)])
res = []
for i, (la, lo, cat, age) in enumerate(sorted(seed, key=lambda s: -s[3])):
    p_res = min(0.93, 0.25 + age / 400)
    resolved = None
    if rnd.random() < p_res and age > 8:
        resolved = round(max(0.5, age - rnd.choice([6, 12, 20, 30, 50, 90, 140]) * rnd.uniform(0.6, 1.4)), 1)
        if resolved >= age: resolved = round(age * 0.4, 1)
    res.append({"id": f"NGP-{1000 + i}", "lat": round(la, 6), "lon": round(lo, 6), "cat": cat,
                "sev": rnd.choices([1, 2, 3], [45, 38, 17])[0], "ageH": round(age, 1),
                "resolvedAgoH": resolved, "meToo": rnd.choices([0, 1, 2, 4, 7, 12], [40, 22, 16, 12, 7, 3])[0]})
json.dump(res, open(os.path.join(out, "seed.json"), "w"), separators=(",", ":"))
print("seed", len(res), "open", sum(1 for r in res if r["resolvedAgoH"] is None))
