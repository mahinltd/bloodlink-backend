import { Router } from "express";
import { protectAdmin } from "../../middlewares/adminAuth.middleware.js"; // ⚠️ ফাইলনেম মিলিয়ে নিন
import { requireRole } from "../../middlewares/role.middleware.js"; // ⚠️ ফাইলনেম মিলিয়ে নিন
import { uploadApk } from "../../middlewares/upload.middleware.js"; // ⚠️ export নাম মিলিয়ে নিন
import * as controller from "./systemAdmin.controller.js";

const router = Router();

router.use(protectAdmin);

// ⚠️ requireRole array নিলে: requireRole(['superAdmin', 'contentEditor'])
const canEditContent = requireRole("superAdmin", "contentEditor");
const superOnly = requireRole("superAdmin");

// ── Config workflow ──
router.get("/config", canEditContent, controller.getConfigOverview);
router.get("/config/draft", canEditContent, controller.getDraft);
router.post("/config/draft", canEditContent, controller.createDraft);
router.patch("/config/draft", canEditContent, controller.updateDraft);
router.post("/config/publish", canEditContent, controller.publishDraft);
router.post(
  "/config/rollback/:version",
  canEditContent,
  controller.rollbackConfig,
);

// ── Translations ──
router.get("/translations", canEditContent, controller.listTranslations);
router.post("/translations", canEditContent, controller.createTranslation);
router.post("/translations/bulk", canEditContent, controller.bulkTranslations);
router.patch("/translations/:id", canEditContent, controller.updateTranslation);
router.delete("/translations/:id", superOnly, controller.deleteTranslation);

// ── Release manager (APK distribution = সবচেয়ে সংবেদনশীল, শুধু superAdmin) ──
router.get("/releases", superOnly, controller.listReleases);
router.post(
  "/releases",
  superOnly,
  uploadApk.single("apk"),
  controller.createRelease,
);
router.patch("/releases/:id", superOnly, controller.updateRelease);
router.post("/releases/:id/publish", superOnly, controller.publishRelease);
router.post("/releases/:id/archive", superOnly, controller.archiveRelease);

export default router;
