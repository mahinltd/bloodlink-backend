# Location seed

Run `node scripts/seedLocations.js` to upsert the hierarchy from `seed/locations.json`.
The script uses the MongoDB database configured by the current environment, so verify
the target before running it.

The administrative hierarchy is derived from
[bd-geo-info](https://github.com/iamtashanto/bd-geo-info/tree/6c349cc9ac9ed7d1127ea6b63b64f23871921c6e/src/data),
licensed under MIT. The seed contains 8 divisions, 64 districts, 610 upazila/thana
entries, and 4,537 union/ward entries. English division names are aligned with the
existing API values (`Barishal` and `Chattogram`).

The current source does not provide a complete village catalog. The seed therefore
preserves the three existing village entries without inventing additional names.
Users can still submit a village through `POST /locations/villages`; submissions
remain pending until the existing approval rules apply.

The source MIT license notice is included in [`../seed/LOCATION_DATA_LICENSE.txt`](../seed/LOCATION_DATA_LICENSE.txt).
