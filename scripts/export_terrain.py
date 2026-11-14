"""Export a "how low is this spot" grid for the monsoon simulator.

Source: AWS Terrain Tiles (terrarium PNG encoding, SRTM / NASADEM ~30 m elevation in India),
https://registry.opendata.aws/terrain-tiles/ . No GIS libraries needed: each PNG pixel encodes
elevation as R * 256 + G + B / 256 - 32768 metres.

For every 0.00025° cell (~27 m) in the pilot box we compute
    lowness = (mean elevation within ~450 m) - elevation
i.e. how far a spot sits below its surroundings. Rain fills the lowest spots first.

Output: public/data/terrain.png (8-bit grey, 1 unit = 5 cm of lowness, north up)
        public/data/terrain.json (grid georeference + elevation stats)

Usage: python scripts/export_terrain.py public/data
"""
import io
import json
import math
import sys
import urllib.request

import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/data"
LON0, LON1, LAT0, LAT1 = 79.085, 79.175, 21.135, 21.190
CELL = 0.00025
Z = 14
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main():
    x0, y0 = tile_xy(LON0, LAT1, Z)
    x1, y1 = tile_xy(LON1, LAT0, Z)
    tx = range(int(x0), int(x1) + 1)
    ty = range(int(y0), int(y1) + 1)
    mosaic = np.zeros((len(ty) * 256, len(tx) * 256), dtype=np.float32)
    for j, y in enumerate(ty):
        for i, x in enumerate(tx):
            url = URL.format(z=Z, x=x, y=y)
            req = urllib.request.Request(url, headers={"User-Agent": "swachhgrid-data-export"})
            with urllib.request.urlopen(req, timeout=60) as r:
                im = np.asarray(Image.open(io.BytesIO(r.read())).convert("RGB"), dtype=np.float32)
            elev = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
            mosaic[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = elev
            print("tile", x, y, "min", elev.min(), "max", elev.max())

    cols = int(round((LON1 - LON0) / CELL))
    rows = int(round((LAT1 - LAT0) / CELL))
    grid = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        lat = LAT1 - (r + 0.5) * CELL  # north up
        for c in range(cols):
            lon = LON0 + (c + 0.5) * CELL
            px, py = tile_xy(lon, lat, Z)
            fx = (px - tx[0]) * 256 - 0.5
            fy = (py - ty[0]) * 256 - 0.5
            ix, iy = int(math.floor(fx)), int(math.floor(fy))
            ax, ay = fx - ix, fy - iy
            v = (mosaic[iy, ix] * (1 - ax) * (1 - ay) + mosaic[iy, ix + 1] * ax * (1 - ay)
                 + mosaic[iy + 1, ix] * (1 - ax) * ay + mosaic[iy + 1, ix + 1] * ax * ay)
            grid[r, c] = v

    # mean of the surroundings: box blur, radius 16 cells (~450 m), via a summed-area table
    rad = 16
    pad = np.pad(grid, rad, mode="edge")
    sat = pad.cumsum(0).cumsum(1)
    sat = np.pad(sat, ((1, 0), (1, 0)))
    k = 2 * rad + 1
    mean = (sat[k:, k:] - sat[:-k, k:] - sat[k:, :-k] + sat[:-k, :-k]) / (k * k)
    low = np.clip(mean - grid, 0, None)
    # smooth twice with a 5x5 box: SRTM in dense areas picks up roofs, so raw lowness is speckled
    for _ in range(2):
        p = np.pad(low, 2, mode="edge")
        low = sum(p[a:a + rows, b:b + cols] for a in range(5) for b in range(5)) / 25

    q = np.clip(np.round(low / 0.05), 0, 255).astype(np.uint8)
    Image.fromarray(q, mode="L").save(f"{OUT}/terrain.png", optimize=True)
    pct = {str(p_): round(float(np.percentile(low, p_)), 2) for p_ in (50, 75, 90, 95, 99)}
    meta = {
        "bounds": [LON0, LAT0, LON1, LAT1],
        "cell": CELL,
        "cols": cols,
        "rows": rows,
        "unit": 0.05,
        "elevation": {"min": round(float(grid.min()), 1), "max": round(float(grid.max()), 1)},
        "lowness_percentiles": pct,
        "source": "AWS Terrain Tiles (terrarium), SRTM/NASADEM ~30 m",
    }
    json.dump(meta, open(f"{OUT}/terrain.json", "w"), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
