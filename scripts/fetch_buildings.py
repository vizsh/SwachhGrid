"""Downloads Overture Maps building footprints for Nagpur into a local DuckDB file.

usage: python fetch_buildings.py <duckdb_pylib_dir> <out.duckdb>
(install duckdb with: pip install --target <dir> duckdb)
Then run export_data.py on the result.
"""
import sys
sys.path.insert(0, sys.argv[1])
import duckdb, time
con = duckdb.connect(sys.argv[2])
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2'; SET geometry_always_xy=true;")
t=time.time()
con.execute("""
CREATE OR REPLACE TABLE b AS
SELECT id, sources[1].dataset AS src, height, num_floors,
       ST_Area_Spheroid(geometry) AS area_m2,
       ST_X(ST_Centroid(geometry)) AS lon, ST_Y(ST_Centroid(geometry)) AS lat,
       ST_AsWKB(geometry) AS wkb
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=buildings/type=building/*', hive_partitioning=1)
WHERE bbox.xmin > 78.98 AND bbox.xmax < 79.18 AND bbox.ymin > 21.05 AND bbox.ymax < 21.22
""")
print('secs', round(time.time()-t))
print(con.execute("SELECT src, count(*), round(median(area_m2),1), count(height) FROM b GROUP BY 1 ORDER BY 2 DESC").fetchall())
