const db = require('../config/database');

/**
 * Validates transaction fields and returns an error message string if invalid, or null if valid.
 */
function validateTransactionPayload({ title, amount, category, type, date }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    return 'Title is required and must be a non-empty string.';
  }

  const numAmount = Number(amount);
  if (amount === undefined || amount === null || typeof numAmount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a valid number greater than 0.';
  }

  if (type !== 'income' && type !== 'expense') {
    return 'Type must be either "income" or "expense".';
  }

  if (!category || typeof category !== 'string' || !category.trim()) {
    return 'Category is required and must be a non-empty string.';
  }

  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Date must be a valid date in YYYY-MM-DD format.';
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return 'Date must be a valid calendar date.';
  }

  return null;
}

/**
 * GET /api/transactions
 * Returns all transactions sorted newest first.
 */
function getAllTransactions(req, res, next) {
  try {
    const rows = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all();
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/transactions/:id
 * Returns a single transaction by ID.
 */
function getTransactionById(req, res, next) {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID. Must be a positive integer.' });
    }

    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(numId);
    if (!row) {
      return res.status(404).json({ success: false, error: `Transaction with ID ${numId} not found.` });
    }

    res.status(200).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/transactions
 * Creates a new transaction.
 */
function createTransaction(req, res, next) {
  try {
    const { title, amount, category, type, date, description } = req.body || {};
    const validationError = validateTransactionPayload({ title, amount, category, type, date });
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const cleanTitle = title.trim();
    const cleanAmount = Number(Number(amount).toFixed(2));
    const cleanCategory = category.trim();
    const cleanDescription = description && typeof description === 'string' ? description.trim() : '';

    const stmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(cleanTitle, cleanAmount, cleanCategory, type, date, cleanDescription);
    const created = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/transactions/:id
 * Updates an existing transaction.
 */
function updateTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID. Must be a positive integer.' });
    }

    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(numId);
    if (!existing) {
      return res.status(404).json({ success: false, error: `Transaction with ID ${numId} not found.` });
    }

    const { title, amount, category, type, date, description } = req.body || {};
    const validationError = validateTransactionPayload({ title, amount, category, type, date });
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const cleanTitle = title.trim();
    const cleanAmount = Number(Number(amount).toFixed(2));
    const cleanCategory = category.trim();
    const cleanDescription = description && typeof description === 'string' ? description.trim() : '';

    const stmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);

    stmt.run(cleanTitle, cleanAmount, cleanCategory, type, date, cleanDescription, numId);
    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(numId);

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/transactions/:id
 * Deletes a transaction by ID.
 */
function deleteTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid transaction ID. Must be a positive integer.' });
    }

    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(numId);
    if (!existing) {
      return res.status(404).json({ success: false, error: `Transaction with ID ${numId} not found.` });
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(numId);
    res.status(200).json({ success: true, message: `Transaction with ID ${numId} deleted successfully.` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};

