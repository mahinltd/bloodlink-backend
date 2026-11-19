const express = require('express');
const controller = require('../controllers/adminDirectory.controller');
const { adminProtect, requireAdminRoles } = require('../middlewares/admin.middleware');

const router = express.Router();

// সব route admin-only
router.use(adminProtect);

const canRead = requireAdminRoles('content_admin', 'support_admin', 'monitoring_admin');
const canWrite = requireAdminRoles('content_admin');

/* ---------------- Hospitals ---------------- */
router.get('/hospitals', canRead, controller.listHospitals);
router.post('/hospitals', canWrite, controller.createHospital);
router.put('/hospitals/:id', canWrite, controller.updateHospital);
router.patch('/hospitals/:id/verify', canWrite, controller.verifyHospital);
router.delete('/hospitals/:id', canWrite, controller.deleteHospital);

/* ---------------- Blood Banks ---------------- */
router.get('/blood-banks', canRead, controller.listBloodBanks);
router.post('/blood-banks', canWrite, controller.createBloodBank);
router.put('/blood-banks/:id', canWrite, controller.updateBloodBank);
router.patch('/blood-banks/:id/verify', canWrite, controller.verifyBloodBank);
router.delete('/blood-banks/:id', canWrite, controller.deleteBloodBank);

module.exports = router;