import json
from pathlib import Path

cache_dir = Path("osm_cache")
cache_dir.mkdir(exist_ok=True)

# Real OSM building IDs returned by the successful
# Overpass query for 19.876, 75.343 within 50 m.
#
# Heights are intentionally omitted because OSM returned
# only building=yes for these records.

buildings = [
    {
        "type": "way",
        "id": 1287019249,
        "tags": {
            "building": "yes"
        },
        "geometry": []
    },
    {
        "type": "way",
        "id": 1287019250,
        "tags": {
            "building": "yes"
        },
        "geometry": []
    },
    {
        "type": "way",
        "id": 1287019251,
        "tags": {
            "building": "yes"
        },
        "geometry": []
    },
    {
        "type": "way",
        "id": 1290142169,
        "tags": {
            "building": "yes"
        },
        "geometry": []
    }
]

print("IMPORTANT:")
print("The successful OSM query returned these building IDs,")
print("but our previous test requested only tags + center.")
print("Therefore geometry is NOT being fabricated here.")
print("This cache is only a validation placeholder.")

print()
print("Buildings prepared:", len(buildings))
print("Heights included: 0")
print("Geometry included: 0")
print()
print("No fabricated coordinates, distances, bearings,")
print("or heights will be stored.")

print()
print("We are NOT writing this placeholder cache yet.")
print("The next implementation step should use the")
print("successful OSM geometry query itself to create")
print("a complete cache entry.")
