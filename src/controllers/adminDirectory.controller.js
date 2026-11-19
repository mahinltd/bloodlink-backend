/**
 * Admin Directory Controller
 * --------------------------
 * Admin CRUD for Hospitals & Blood Banks (public directory management)
 */

const Hospital = require('../models/Hospital');
const BloodBank = require('../models/BloodBank');

const ALLOWED_FIELDS = [
  'name',
  'division',
  'district',
  'address',
  'phone',
  'email',
  'website',
  'isVerified',
  'isActive',
  'bloodGroups',
  'bloodGroupsAvailable',
];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pickFields(body) {
  const data = {};
  ALLOWED_FIELDS.forEach((key) => {
    if (body[key] !== undefined) data[key] = body[key];
  });
  return data;
}

/* ---------------- List ---------------- */
async function listDirectory(Model, req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 100);
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.division) query.division = req.query.division;
    if (req.query.district) query.district = new RegExp(escapeRegex(req.query.district.trim()), 'i');
    if (req.query.isVerified === 'true' || req.query.isVerified === 'false') {
      query.isVerified = req.query.isVerified === 'true';
    }
    if (req.query.isActive === 'true' || req.query.isActive === 'false') {
      query.isActive = req.query.isActive === 'true';
    }
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      query.$or = [{ name: rx }, { district: rx }, { address: rx }];
    }

    const [items, total] = await Promise.all([
      Model.find(query).sort({ isVerified: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Model.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ---------------- Create ---------------- */
async function createDirectory(Model, label, req, res, next) {
  try {
    const data = pickFields(req.body || {});

    if (!data.name || !String(data.name).trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    data.name = String(data.name).trim();
    if (!data.division) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }
    if (!data.district || !String(data.district).trim()) {
      return res.status(400).json({ success: false, message: 'District is required' });
    }
    data.district = String(data.district).trim();

    const doc = await Model.create(data);
    return res.status(201).json({ success: true, data: { item: doc } });
  } catch (err) {
    next(err);
  }
}

/* ---------------- Update ---------------- */
async function updateDirectory(Model, label, req, res, next) {
  try {
    const data = pickFields(req.body || {});
    if (data.name) data.name = String(data.name).trim();
    if (data.district) data.district = String(data.district).trim();

    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: `${label} not found` });
    }
    return res.status(200).json({ success: true, data: { item: doc } });
  } catch (err) {
    next(err);
  }
}

/* ---------------- Verify toggle ---------------- */
async function verifyDirectory(Model, label, req, res, next) {
  try {
    const { isVerified } = req.body || {};
    if (typeof isVerified !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isVerified (boolean) is required' });
    }

    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { $set: { isVerified } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: `${label} not found` });
    }
    return res.status(200).json({ success: true, data: { item: doc } });
  } catch (err) {
    next(err);
  }
}

/* ---------------- Delete ---------------- */
async function deleteDirectory(Model, label, req, res, next) {
  try {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: `${label} not found` });
    }
    return res.status(200).json({ success: true, message: `${label} deleted` });
  } catch (err) {
    next(err);
  }
}

/* ---------------- Exports ---------------- */
exports.listHospitals = (req, res, next) => listDirectory(Hospital, req, res, next);
exports.createHospital = (req, res, next) => createDirectory(Hospital, 'Hospital', req, res, next);
exports.updateHospital = (req, res, next) => updateDirectory(Hospital, 'Hospital', req, res, next);
exports.verifyHospital = (req, res, next) => verifyDirectory(Hospital, 'Hospital', req, res, next);
exports.deleteHospital = (req, res, next) => deleteDirectory(Hospital, 'Hospital', req, res, next);

exports.listBloodBanks = (req, res, next) => listDirectory(BloodBank, req, res, next);
exports.createBloodBank = (req, res, next) => createDirectory(BloodBank, 'Blood Bank', req, res, next);
exports.updateBloodBank = (req, res, next) => updateDirectory(BloodBank, 'Blood Bank', req, res, next);
exports.verifyBloodBank = (req, res, next) => verifyDirectory(BloodBank, 'Blood Bank', req, res, next);
exports.deleteBloodBank = (req, res, next) => deleteDirectory(BloodBank, 'Blood Bank', req, res, next);