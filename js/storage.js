/**
 * storage.js
 * Centralized LocalStorage Data Access Layer.
 *
 * Future Backend Integration Note:
 * All persistence operations are isolated here. When migrating to Node.js,
 * Express.js, and SQL, replace the synchronous localStorage reads/writes in
 * these exported functions with async fetch() calls to REST endpoints
 * (e.g., GET/POST /api/transactions, PUT/DELETE /api/transactions/:id,
 * GET/PUT /api/budgets/:month). UI and calculation modules do not access
 * localStorage directly.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGETS: 'clearledger_budgets_v1',
  INITIALIZED: 'clearledger_initialized_v1',
};

/**
 * Returns local calendar date as YYYY-MM-DD (avoids UTC timezone shift).
 * @param {Date} [dateObj]
 * @returns {string}
 */
export function getTodayDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current local month key as YYYY-MM.
 * @param {Date} [dateObj]
 * @returns {string}
 */
export function getCurrentMonthKey(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Generates a unique identifier for each transaction.
 * @returns {string}
 */
export function generateTransactionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tx_${crypto.randomUUID()}`;
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalizes a raw transaction object to the strict application schema.
 * @param {object} raw
 * @returns {object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateTransactionId()),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayDateString()),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Retrieves all stored transactions from LocalStorage.
 * @returns {Array<object>}
 */
export function getTransactions() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Failed to read transactions from LocalStorage:', err);
    return [];
  }
}

/**
 * Persists the complete transactions array to LocalStorage.
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
export function saveTransactions(transactions) {
  const normalized = Array.isArray(transactions)
    ? transactions.map(normalizeTransaction)
    : [];
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.TRANSACTIONS,
      JSON.stringify(normalized)
    );
    window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  } catch (err) {
    console.error('Failed to save transactions to LocalStorage:', err);
  }
  return normalized;
}

/**
 * Appends a new transaction record and persists it.
 * @param {object} transactionInput
 * @returns {object} Newly created transaction
 */
export function addTransaction(transactionInput) {
  const list = getTransactions();
  const created = normalizeTransaction({
    ...transactionInput,
    id: generateTransactionId(),
  });
  list.unshift(created);
  saveTransactions(list);
  return created;
}

/**
 * Updates an existing transaction by ID and persists the change.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null} Updated transaction or null if not found
 */
export function updateTransaction(id, updates) {
  const list = getTransactions();
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...list[index],
    ...updates,
    id,
  });
  list[index] = updated;
  saveTransactions(list);
  return updated;
}

/**
 * Removes a transaction by ID and persists the updated list.
 * @param {string} id
 * @returns {boolean} True if removed
 */
export function deleteTransaction(id) {
  const list = getTransactions();
  const filtered = list.filter((item) => item.id !== id);
  if (filtered.length === list.length) return false;
  saveTransactions(filtered);
  return true;
}

/**
 * Retrieves the budget map ({ "YYYY-MM": number, default: number }).
 * @returns {Record<string, number>}
 */
export function getBudgets() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to read budgets from LocalStorage:', err);
    return {};
  }
}

/**
 * Retrieves the monthly budget limit for a given YYYY-MM month key.
 * Falls back to the stored default budget if a month-specific limit is not set.
 * @param {string} monthKey
 * @returns {number}
 */
export function getBudgetForMonth(monthKey) {
  const budgets = getBudgets();
  if (typeof budgets[monthKey] === 'number' && budgets[monthKey] > 0) {
    return budgets[monthKey];
  }
  if (typeof budgets.default === 'number' && budgets.default > 0) {
    return budgets.default;
  }
  return 0;
}

/**
 * Saves the monthly budget limit for a given YYYY-MM month key.
 * Also stores it as the latest default for future months without explicit limits.
 * @param {string} monthKey
 * @param {number} amount
 * @returns {number}
 */
export function saveBudgetForMonth(monthKey, amount) {
  const cleanAmount = Number(Number(amount).toFixed(2));
  const budgets = getBudgets();
  budgets[monthKey] = cleanAmount;
  budgets.default = cleanAmount;
  try {
    window.localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  } catch (err) {
    console.error('Failed to save budget to LocalStorage:', err);
  }
  return cleanAmount;
}

/**
 * Helper to offset YYYY-MM by delta months.
 * @param {string} monthKey
 * @param {number} delta
 * @returns {string}
 */
function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getCurrentMonthKey(d);
}

/**
 * Builds realistic starter dataset anchored to the current month.
 * @returns {{ transactions: Array<object>, budgetAmount: number }}
 */
function buildSampleDataset() {
  const m0 = getCurrentMonthKey();
  const m1 = shiftMonthKey(m0, -1);
  const m2 = shiftMonthKey(m0, -2);
  const m3 = shiftMonthKey(m0, -3);
  const m4 = shiftMonthKey(m0, -4);
  const m5 = shiftMonthKey(m0, -5);

  const transactions = [
    // Current month (m0)
    {
      id: generateTransactionId(),
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m0}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateTransactionId(),
      title: 'Apartment Lease',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m0}-02`,
      description: 'Monthly rent payment',
    },
    {
      id: generateTransactionId(),
      title: 'Grocery Shopping',
      amount: 215.4,
      category: 'Food',
      type: 'expense',
      date: `${m0}-05`,
      description: 'Weekly groceries and produce',
    },
    {
      id: generateTransactionId(),
      title: 'Electric & Fiber Internet',
      amount: 148.9,
      category: 'Utilities',
      type: 'expense',
      date: `${m0}-07`,
      description: 'Monthly utility and broadband bills',
    },
    {
      id: generateTransactionId(),
      title: 'UI Audit Freelance Retainer',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: `${m0}-08`,
      description: 'Design system consultation milestone',
    },
    {
      id: generateTransactionId(),
      title: 'Transit Pass & Fuel',
      amount: 112.5,
      category: 'Transport',
      type: 'expense',
      date: `${m0}-10`,
      description: 'Monthly commuter pass and fuel',
    },
    {
      id: generateTransactionId(),
      title: 'Pharmacy & Dental Checkup',
      amount: 135,
      category: 'Healthcare',
      type: 'expense',
      date: `${m0}-11`,
      description: 'Routine checkup copay',
    },
    {
      id: generateTransactionId(),
      title: 'Specialty Coffee & Lunch',
      amount: 78.2,
      category: 'Food',
      type: 'expense',
      date: `${m0}-12`,
      description: 'Neighborhood bistro and cafe',
    },

    // Previous months (m1 - m5)
    {
      id: generateTransactionId(),
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m1}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateTransactionId(),
      title: 'Apartment Lease',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m1}-02`,
      description: 'Monthly rent payment',
    },
    {
      id: generateTransactionId(),
      title: 'Organic Market Groceries',
      amount: 468.3,
      category: 'Food',
      type: 'expense',
      date: `${m1}-11`,
      description: 'Monthly household groceries',
    },
    {
      id: generateTransactionId(),
      title: 'Autumn Jacket & Footwear',
      amount: 289,
      category: 'Shopping',
      type: 'expense',
      date: `${m1}-16`,
      description: 'Seasonal wardrobe essentials',
    },
    {
      id: generateTransactionId(),
      title: 'Streaming & Concert Tickets',
      amount: 164,
      category: 'Entertainment',
      type: 'expense',
      date: `${m1}-22`,
      description: 'Live acoustic show and subscriptions',
    },
    {
      id: generateTransactionId(),
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m2}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateTransactionId(),
      title: 'Apartment Lease',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m2}-02`,
      description: 'Monthly rent payment',
    },
    {
      id: generateTransactionId(),
      title: 'Annual Tech Conference',
      amount: 420,
      category: 'Education',
      type: 'expense',
      date: `${m2}-14`,
      description: 'Workshop pass and reference books',
    },
    {
      id: generateTransactionId(),
      title: 'Supermarket & Dining',
      amount: 512.75,
      category: 'Food',
      type: 'expense',
      date: `${m2}-19`,
      description: 'Groceries and weekend dinner',
    },
    {
      id: generateTransactionId(),
      title: 'Monthly Salary Deposit',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m3}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateTransactionId(),
      title: 'Quarterly Dividend Payout',
      amount: 340,
      category: 'Investments',
      type: 'income',
      date: `${m3}-15`,
      description: 'Index fund distribution',
    },
    {
      id: generateTransactionId(),
      title: 'Apartment Lease & Utilities',
      amount: 1610,
      category: 'Housing',
      type: 'expense',
      date: `${m3}-03`,
      description: 'Rent and municipal water',
    },
    {
      id: generateTransactionId(),
      title: 'Regional Rail & Rideshare',
      amount: 275,
      category: 'Transport',
      type: 'expense',
      date: `${m3}-20`,
      description: 'Weekend regional travel',
    },
    {
      id: generateTransactionId(),
      title: 'Monthly Salary Deposit',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m4}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateTransactionId(),
      title: 'Apartment Lease',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m4}-02`,
      description: 'Monthly rent payment',
    },
    {
      id: generateTransactionId(),
      title: 'Groceries & Utilities',
      amount: 645,
      category: 'Food',
      type: 'expense',
      date: `${m4}-14`,
      description: 'Household food and power',
    },
    {
      id: generateTransactionId(),
      title: 'Monthly Salary Deposit',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m5}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateTransactionId(),
      title: 'Apartment Lease',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m5}-02`,
      description: 'Monthly rent payment',
    },
    {
      id: generateTransactionId(),
      title: 'Home Office Desk Lamp & Chair',
      amount: 495,
      category: 'Shopping',
      type: 'expense',
      date: `${m5}-18`,
      description: 'Workspace ergonomics upgrade',
    },
  ];

  return {
    transactions,
    budgetAmount: 3000,
  };
}

/**
 * Seeds sample data strictly once on first visit (never overwrites user clears).
 */
export function seedInitialDataIfNeeded() {
  try {
    const initialized = window.localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (initialized === 'true') return;

    const sample = buildSampleDataset();
    saveTransactions(sample.transactions);
    saveBudgetForMonth(getCurrentMonthKey(), sample.budgetAmount);
  } catch (err) {
    console.error('Failed to seed initial data:', err);
  }
}

/**
 * Restores sample dataset on explicit user request.
 */
export function resetToSampleData() {
  const sample = buildSampleDataset();
  saveTransactions(sample.transactions);
  saveBudgetForMonth(getCurrentMonthKey(), sample.budgetAmount);
}
