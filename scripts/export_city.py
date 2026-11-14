"""Export lane pieces (for clean-lane ribbons and the planner) and a community-bin registry.

Inputs:  roads.json  (the same Overpass export used by export_routes.py)
         public/data/routes.json (van beats, from export_routes.py)
Outputs: public/data/lanes.json  {"lon0", "lat0", "q", "pieces": [[x0, y0, x1, y1, ...], ...]}
             every road cut into pieces of at most ~90 m, coordinates as integer steps of q degrees
             from (lon0, lat0) to keep the file small
         public/data/bins.json   [{"id", "lon", "lat", "van", "s"}]
             a demo registry: one community bin every ~340 m along each van beat, at the van's
             distance s (m) along its loop, so the van empties it when it passes

Usage: python scripts/export_city.py roads.json public/data
"""
import json
import math
import sys

ROADS = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/data"
LON0, LAT0 = 79.085, 21.135
Q = 1e-5
PIECE_M = 90


def metres(a, b):
    dx = (b[0] - a[0]) * 111320 * math.cos(math.radians(21.16))
    dy = (b[1] - a[1]) * 110540
    return math.hypot(dx, dy)


def lanes():
    d = json.load(open(ROADS))
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in d["elements"] if e["type"] == "node"}
    pieces = []
    for w in (e for e in d["elements"] if e["type"] == "way"):
        pts = [nodes[n] for n in w["nodes"] if n in nodes]
        cur = [pts[0]] if pts else []
        run = 0.0
        for p in pts[1:]:
            seg = metres(cur[-1], p)
            if run + seg > PIECE_M and run > 20:
                pieces.append(cur)
                cur = [cur[-1]]
                run = 0.0
            cur.append(p)
            run += seg
        if len(cur) > 1:
            pieces.append(cur)
    out = []
    for pc in pieces:
        flat = []
        for lon, lat in pc:
            flat += [round((lon - LON0) / Q), round((lat - LAT0) / Q)]
        out.append(flat)
    json.dump({"lon0": LON0, "lat0": LAT0, "q": Q, "pieces": out}, open(f"{OUT}/lanes.json", "w"), separators=(",", ":"))
    print("lane pieces", len(out))


def bins():
    routes = json.load(open(f"{OUT}/routes.json"))
    out = []
    for v in routes["vans"]:
        path, cum = v["path"], v["cum"]
        prefix = v["id"].replace("-", "")[0] + v["id"][-1]  # GB-1 -> G1
        s, n = 150.0, 1
        while s < v["lengthM"] - 100:
            i = next(k for k in range(1, len(cum)) if cum[k] >= s)
            t = (s - cum[i - 1]) / max(1e-9, cum[i] - cum[i - 1])
            lon = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t
            lat = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t
            # keep bins apart where a loop doubles back on itself
            if all(metres((lon, lat), (b["lon"], b["lat"])) > 150 for b in out):
                out.append({"id": f"{prefix}{n:02d}", "lon": round(lon, 6), "lat": round(lat, 6), "van": v["id"], "s": round(s)})
                n += 1
            s += 340
    json.dump(out, open(f"{OUT}/bins.json", "w"), separators=(",", ":"))
    print("bins", len(out))


if __name__ == "__main__":
    lanes()
    bins()
