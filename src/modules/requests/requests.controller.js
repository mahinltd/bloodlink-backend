import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created } from '../../utils/ApiResponse.js';
import * as service from './requests.service.js';

export const create = asyncHandler(async (req, res) =>
	created(res, await service.createRequest(req.auth.userId, req.body), 'Request created')
);

export const list = asyncHandler(async (req, res) =>
	ok(res, await service.listRequests(req.query))
);

export const sos = asyncHandler(async (req, res) =>
	ok(res, await service.listSosRequests(req.query))
);

export const listMine = asyncHandler(async (req, res) =>
	ok(res, await service.listMine(req.auth.userId, req.query))
);

export const listResponded = asyncHandler(async (req, res) =>
	ok(res, await service.listRespondedRequests(req.auth.userId, req.query))
);

export const get = asyncHandler(async (req, res) =>
	ok(res, await service.getRequest(req.params.id, req.auth.userId))
);

export const revealPhone = asyncHandler(async (req, res) =>
	ok(res, await service.revealRequestPhone(req.params.id, req.auth.userId), 'Phone number revealed')
);

export const update = asyncHandler(async (req, res) =>
	ok(res, await service.updateRequest(req.params.id, req.auth.userId, req.body), 'Request updated')
);

export const respond = asyncHandler(async (req, res) =>
	ok(res, await service.respond(req.params.id, req.auth.userId, req.body.action))
);

export const listResponses = asyncHandler(async (req, res) =>
	ok(res, await service.listResponses(req.params.id, req.auth.userId))
);

export const confirmDonation = asyncHandler(async (req, res) =>
	ok(res, await service.confirmDonation(req.params.id, req.auth.userId, req.body.donorId))
);

export const fulfill = asyncHandler(async (req, res) =>
	ok(res, await service.fulfillRequest(req.params.id, req.auth.userId))
);

export const cancel = asyncHandler(async (req, res) =>
	ok(res, await service.cancelRequest(req.params.id, req.auth.userId))
);

export const report = asyncHandler(async (req, res) =>
	created(res, await service.reportRequest(req.params.id, req.auth.userId, req.body.reason), 'Request reported')
);

export const matchingPreview = asyncHandler(async (req, res) =>
	ok(res, await service.matchingPreview(req.params.id, req.auth.userId))
);
