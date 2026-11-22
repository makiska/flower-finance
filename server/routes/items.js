const {
  listItems,
  createPersonalItem,
  isAdminUser,
} = require('../catalog');

async function listItemsHandler(req, res, next) {
  try {
    const items = await listItems({
      userId: req.auth?.userId,
      search: req.query.search,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function createItemHandler(req, res, next) {
  try {
    const created = await createPersonalItem({
      userId: req.auth?.userId,
      name: req.body?.name,
      group: req.body?.group || req.body?.category_name,
      categoryId: req.body?.category_id,
    });
    if (created.error) {
      return res.status(created.status).json({ error: created.error, item: created.item || undefined });
    }
    res.status(created.status).json(created.item);
  } catch (err) {
    next(err);
  }
}

function meHandler(req, res) {
  res.json({
    userId: req.auth?.userId || null,
    authType: req.auth?.type || null,
    isAdmin: isAdminUser(req),
  });
}

module.exports = {
  listItemsHandler,
  createItemHandler,
  meHandler,
};
