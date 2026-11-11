import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locations = JSON.parse(fs.readFileSync(path.join(root, 'seed', 'locations.json'), 'utf8'));

test('location seed contains the full administrative hierarchy and keeps existing villages', () => {
  const counts = { divisions: 0, districts: 0, upazilas: 0, unions: 0, villages: 0 };

  assert.equal(locations.divisions.length, 8);
  for (const division of locations.divisions) {
    counts.divisions += 1;
    assert.ok(division.nameBn && division.nameEn);
    assert.ok(division.districts.length > 0);

    const districtNames = new Set();
    for (const district of division.districts) {
      counts.districts += 1;
      assert.ok(district.nameBn && district.nameEn);
      assert.ok(!districtNames.has(district.nameEn), `duplicate district ${district.nameEn}`);
      districtNames.add(district.nameEn);
      assert.ok(district.upazilas.length > 0);

      const upazilaNames = new Set();
      for (const upazila of district.upazilas) {
        counts.upazilas += 1;
        assert.ok(upazila.nameBn && upazila.nameEn);
        assert.ok(!upazilaNames.has(upazila.nameEn), `duplicate upazila ${upazila.nameEn}`);
        upazilaNames.add(upazila.nameEn);

        const unionNames = new Set();
        for (const union of upazila.unions) {
          counts.unions += 1;
          counts.villages += union.villages.length;
          assert.ok(union.nameBn && union.nameEn);
          assert.ok(!unionNames.has(union.nameEn), `duplicate union ${union.nameEn}`);
          unionNames.add(union.nameEn);
          assert.ok(Array.isArray(union.villages));
        }
      }
    }
  }

  assert.deepEqual(counts, {
    divisions: 8,
    districts: 64,
    upazilas: 610,
    unions: 4537,
    villages: 3,
  });
  assert.equal(locations.hospitals.length, 4);
});
