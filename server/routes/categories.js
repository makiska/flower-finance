const express = require('express');

function createCategoriesRouter(db) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT id, name FROM categories ORDER BY name').all();
    res.json(rows);
  });

  return router;
}

module.exports = { createCategoriesRouter };
