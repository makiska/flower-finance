const express = require('express');
const { sql } = require('../db');

function createCategoriesRouter() {
  const router = express.Router();

  router.get('/', async (_req, res, next) => {
    try {
      const rows = await sql('SELECT id, name FROM categories ORDER BY name');
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createCategoriesRouter };
