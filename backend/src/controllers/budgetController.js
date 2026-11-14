const db = require('../config/database');

/**
 * Validates budget fields and returns an error message string if invalid, or null if valid.
 */
function validateBudgetPayload({ year, month, amount }, requireDate = true) {
  if (requireDate) {
    const numYear = Number(year);
    if (year === undefined || year === null || !Number.isInteger(numYear) || numYear < 1970 || numYear > 2200) {
      return 'Year must be a valid 4-digit integer between 1970 and 2200.';
    }

    const numMonth = Number(month);
    if (month === undefined || month === null || !Number.isInteger(numMonth) || numMonth < 1 || numMonth > 12) {
      return 'Month must be an integer between 1 and 12.';
    }
  }

  const numAmount = Number(amount);
  if (amount === undefined || amount === null || typeof numAmount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a valid number greater than 0.';
  }

  return null;
}

/**
 * GET /api/budgets/:year/:month
 * Returns the monthly budget for the given year and month.
 */
function getBudgetByMonth(req, res, next) {
  try {
    const { year, month } = req.params;
    const numYear = Number(year);
    const numMonth = Number(month);

    if (!Number.isInteger(numYear) || numYear < 1970 || numYear > 2200) {
      return res.status(400).json({ success: false, error: 'Year must be a valid integer.' });
    }
    if (!Number.isInteger(numMonth) || numMonth < 1 || numMonth > 12) {
      return res.status(400).json({ success: false, error: 'Month must be an integer between 1 and 12.' });
    }

    const row = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?').get(numYear, numMonth);
    if (!row) {
      return res.status(404).json({ success: false, error: `No budget found for ${numYear}-${String(numMonth).padStart(2, '0')}.` });
    }

    res.status(200).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/budgets
 * Creates a budget for a month. Returns 409 if one already exists for that year and month.
 */
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body || {};
    const validationError = validateBudgetPayload({ year, month, amount }, true);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const numYear = Number(year);
    const numMonth = Number(month);
    const cleanAmount = Number(Number(amount).toFixed(2));

    const existing = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?').get(numYear, numMonth);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${numYear}-${String(numMonth).padStart(2, '0')} already exists. Use PUT to update it.`,
        data: existing,
      });
    }

    const stmt = db.prepare(`
      INSERT INTO monthly_budgets (year, month, amount)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(numYear, numMonth, cleanAmount);
    const created = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/budgets/:id
 * Updates an existing budget by ID.
 */
function updateBudget(req, res, next) {
  try {
    const { id } = req.params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid budget ID. Must be a positive integer.' });
    }

    const existing = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(numId);
    if (!existing) {
      return res.status(404).json({ success: false, error: `Budget with ID ${numId} not found.` });
    }

    const { amount } = req.body || {};
    const validationError = validateBudgetPayload({ amount }, false);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const cleanAmount = Number(Number(amount).toFixed(2));
    db.prepare('UPDATE monthly_budgets SET amount = ? WHERE id = ?').run(cleanAmount, numId);
    const updated = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(numId);

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgetByMonth,
  createBudget,
  updateBudget,
};

