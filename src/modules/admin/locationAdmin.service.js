import ApiError from '../../utils/ApiError.js';
import { Village } from '../locations/village.model.js';
import { Hospital } from '../locations/hospital.model.js';
import { Division } from '../locations/division.model.js';
import { District } from '../locations/district.model.js';
import { Upazila } from '../locations/upazila.model.js';
import { Union } from '../locations/union.model.js';
import { DonorProfile } from '../users/donorProfile.model.js';
import { logAudit } from './admin.service.js';

// ══════════════════════ LOCATION MANAGEMENT ══════════════════════

export async function getVillageRequests({ status = 'pending', page = 1, limit = 20 }) {
  const filter = { status };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Village.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    Village.countDocuments(filter),
  ]);

  // Resolve union and upazila labels from the village's union parent.
  const unionIds = [...new Set(items.map(v => v.unionId?.toString()).filter(Boolean))];
  const unions = await Union.find({ _id: { $in: unionIds } }).select('nameBn nameEn upazilaId').lean();
  const upazilaIds = [...new Set(unions.map((union) => union.upazilaId?.toString()).filter(Boolean))];
  const upazilas = await Upazila.find({ _id: { $in: upazilaIds } }).select('nameBn nameEn').lean();
  const unionMap = new Map(unions.map(u => [u._id.toString(), u]));
  const upazilaMap = new Map(upazilas.map(u => [u._id.toString(), u]));

  return {
    items: items.map(v => ({
      ...v,
      unionName: unionMap.get(v.unionId?.toString())?.nameBn || '',
      upazilaName: upazilaMap.get(unionMap.get(v.unionId?.toString())?.upazilaId?.toString())?.nameBn || '',
    })),
    total, page, pages: Math.ceil(total / limit) || 1,
  };
}

export async function approveVillage(id, adminId, req) {
  const village = await Village.findById(id);
  if (!village) throw ApiError.notFound('Village not found');
  if (village.status === 'approved') throw ApiError.badRequest('Already approved');

  village.status = 'approved';
  village.approvedAt = new Date();
  village.approvedBy = adminId;
  await village.save();

  // এই village-এ সব pending donor-দের location এখন active
  await DonorProfile.updateMany(
    { villageId: village._id },
    { $set: { isLocationVerified: true } }
  );

  await logAudit({ adminId, action: 'admin.village_approve', targetType: 'village', targetId: id, meta: { name: village.nameBn }, req });
  return village;
}

export async function rejectVillage(id, adminId, req) {
  const village = await Village.findById(id);
  if (!village) throw ApiError.notFound('Village not found');
  
  // Delete করার আগে check: কোনো donor আছে কিনা
  const donorCount = await DonorProfile.countDocuments({ villageId: id });
  if (donorCount > 0) {
    // Reject করলে status 'rejected' হয়, donor-রা অন্য village বেছে নেবে
    village.status = 'rejected';
    await village.save();
  } else {
    await Village.findByIdAndDelete(id);
  }

  await logAudit({ adminId, action: 'admin.village_reject', targetType: 'village', targetId: id, meta: { name: village.nameBn, donorCount }, req });
  return { id, status: 'rejected', donorCount };
}

export async function getPendingHospitals({ page = 1, limit = 20 }) {
  const filter = { status: 'pending' };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Hospital.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export async function approveHospital(id, adminId, req) {
  const hospital = await Hospital.findById(id);
  if (!hospital) throw ApiError.notFound('Hospital not found');
  
  hospital.status = 'approved';
  hospital.approvedAt = new Date();
  hospital.approvedBy = adminId;
  await hospital.save();

  await logAudit({ adminId, action: 'admin.hospital_approve', targetType: 'hospital', targetId: id, meta: { name: hospital.nameBn }, req });
  return hospital;
}

export async function rejectHospital(id, adminId, req) {
  const hospital = await Hospital.findByIdAndDelete(id);
  if (!hospital) throw ApiError.notFound('Hospital not found');
  await logAudit({ adminId, action: 'admin.hospital_reject', targetType: 'hospital', targetId: id, meta: { name: hospital.nameBn }, req });
  return { id, deleted: true };
}

// ── Bulk import locations ──
export async function importLocations(data, adminId, req) {
  const { divisions = [], districts = [], upazilas = [], unions = [], villages = [] } = data;
  const results = { divisions: 0, districts: 0, upazilas: 0, unions: 0, villages: 0, errors: [] };

  for (const d of divisions) {
    try {
      await Division.findOneAndUpdate(
        { nameEn: d.nameEn },
        { $set: d },
        { upsert: true, new: true, runValidators: true }
      );
      results.divisions++;
    } catch (error) {
      results.errors.push(`Division ${d.nameEn}: ${error.message}`);
    }
  }

  const divisionsByName = new Map(
    (await Division.find().select('_id nameEn').lean()).map((division) => [division.nameEn, division._id])
  );
  for (const d of districts) {
    try {
      const divisionId = divisionsByName.get(d.divisionNameEn);
      if (!divisionId) throw new Error(`Division ${d.divisionNameEn} not found`);
      await District.findOneAndUpdate(
        { divisionId, nameEn: d.nameEn },
        { $set: { nameEn: d.nameEn, nameBn: d.nameBn, divisionId } },
        { upsert: true, runValidators: true }
      );
      results.districts++;
    } catch (error) {
      results.errors.push(`District ${d.nameEn}: ${error.message}`);
    }
  }

  const districtsByParentAndName = new Map(
    (await District.find().select('_id nameEn divisionId').lean()).map((district) => [
      `${district.divisionId}_${district.nameEn}`,
      district._id,
    ])
  );
  for (const item of upazilas) {
    try {
      const divisionId = divisionsByName.get(item.divisionNameEn);
      const districtId = divisionId && districtsByParentAndName.get(`${divisionId}_${item.districtNameEn}`);
      if (!districtId) throw new Error(`District ${item.districtNameEn} not found`);
      await Upazila.findOneAndUpdate(
        { districtId, nameEn: item.nameEn },
        { $set: { districtId, nameEn: item.nameEn, nameBn: item.nameBn } },
        { upsert: true, runValidators: true }
      );
      results.upazilas++;
    } catch (error) {
      results.errors.push(`Upazila ${item.nameEn}: ${error.message}`);
    }
  }

  const upazilasByParentAndName = new Map(
    (await Upazila.find().select('_id nameEn districtId').lean()).map((upazila) => [
      `${upazila.districtId}_${upazila.nameEn}`,
      upazila._id,
    ])
  );
  for (const item of unions) {
    try {
      const divisionId = divisionsByName.get(item.divisionNameEn);
      const districtId = divisionId && districtsByParentAndName.get(`${divisionId}_${item.districtNameEn}`);
      const upazilaId = districtId && upazilasByParentAndName.get(`${districtId}_${item.upazilaNameEn}`);
      if (!upazilaId) throw new Error(`Upazila ${item.upazilaNameEn} not found`);
      await Union.findOneAndUpdate(
        { upazilaId, nameEn: item.nameEn },
        { $set: { upazilaId, nameEn: item.nameEn, nameBn: item.nameBn } },
        { upsert: true, runValidators: true }
      );
      results.unions++;
    } catch (error) {
      results.errors.push(`Union ${item.nameEn}: ${error.message}`);
    }
  }

  const unionsByParentAndName = new Map(
    (await Union.find().select('_id nameEn upazilaId').lean()).map((union) => [
      `${union.upazilaId}_${union.nameEn}`,
      union._id,
    ])
  );
  const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  for (const item of villages) {
    try {
      const divisionId = divisionsByName.get(item.divisionNameEn);
      const districtId = divisionId && districtsByParentAndName.get(`${divisionId}_${item.districtNameEn}`);
      const upazilaId = districtId && upazilasByParentAndName.get(`${districtId}_${item.upazilaNameEn}`);
      const unionId = upazilaId && unionsByParentAndName.get(`${upazilaId}_${item.unionNameEn}`);
      if (!unionId) throw new Error(`Union ${item.unionNameEn} not found`);
      const nameBnNorm = normalizeName(item.nameBn);
      await Village.findOneAndUpdate(
        { unionId, nameBnNorm },
        {
          $set: {
            nameBn: item.nameBn.trim(),
            nameEn: item.nameEn?.trim() || null,
            nameBnNorm,
            nameEnNorm: item.nameEn ? normalizeName(item.nameEn) : null,
            unionId,
            source: 'seed',
            status: 'approved',
            isActive: true,
          },
          $setOnInsert: { usedBy: [], usageCount: 0, createdBy: null },
        },
        { upsert: true, new: true, runValidators: true }
      );
      results.villages++;
    } catch (error) {
      results.errors.push(`Village ${item.nameBn}: ${error.message}`);
    }
  }

  await logAudit({ adminId, action: 'admin.location_import', targetType: 'location', meta: results, req });
  return results;
}