const express = require('express');
const {
  isAdminUser,
  listPendingCandidates,
  approveCandidate,
  rejectCandidate,
} = require('../catalog');

function requireAdmin(req, res, next) {
  if (!isAdminUser(req)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  return next();
}

function createAdminCandidatesRouter() {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await listPendingCandidates());
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/approve', async (req, res, next) => {
    try {
      const result = await approveCandidate(Number(req.params.id), {
        name: req.body?.name,
        group: req.body?.group,
        subgroup: req.body?.subgroup,
        presetId: req.body?.preset_id,
      });
      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/reject', async (req, res, next) => {
    try {
      const result = await rejectCandidate(Number(req.params.id));
      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAdminCandidatesRouter };
