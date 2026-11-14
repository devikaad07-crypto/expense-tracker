/**
 * storage.js
 * Centralized Data Access Layer connected to Node.js + Express + SQLite backend.
 * All persistence is handled via REST API endpoints (/api/transactions, /api/budgets).
 */

const API_BASE = '/api';

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGETS: 'clearledger_budgets_v1',
  INITIALIZED: 'clearledger_initialized_v1',
  MIGRATED: 'clearledger_migrated_v1',
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
 * Generates a unique identifier (retained for backward compatibility).
 * @returns {string}
 */
export function generateTransactionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tx_${crypto.randomUUID()}`;
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Tracks backend connection status.
 */
let lastApiError = null;

export function getLastApiError() {
  return lastApiError;
}

export function clearLastApiError() {
  lastApiError = null;
}

/**
 * Helper to execute fetch calls with error handling.
 */
async function apiRequest(endpoint, options = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMsg = (data && data.error) || `Request failed with status ${res.status}`;
      const error = new Error(errorMsg);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    lastApiError = null;
    return data;
  } catch (err) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, err);
    lastApiError = err.message || 'Cannot connect to backend server.';
    throw err;
  }
}

/**
 * Retrieves all stored transactions from the database via REST API.
 * @returns {Promise<Array<object>>}
 */
export async function getTransactions() {
  try {
    const response = await apiRequest('/transactions');
    return Array.isArray(response.data) ? response.data : [];
  } catch (err) {
    return [];
  }
}

/**
 * Appends a new transaction record via REST API.
 * @param {object} transactionInput
 * @returns {Promise<object>}
 */
export async function addTransaction(transactionInput) {
  const response = await apiRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify({
      title: transactionInput.title,
      amount: Number(transactionInput.amount),
      category: transactionInput.category,
      type: transactionInput.type,
      date: transactionInput.date,
      description: transactionInput.description || '',
    }),
  });
  return response.data;
}

/**
 * Updates an existing transaction by ID via REST API.
 * @param {number|string} id
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export async function updateTransaction(id, updates) {
  const response = await apiRequest(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: updates.title,
      amount: Number(updates.amount),
      category: updates.category,
      type: updates.type,
      date: updates.date,
      description: updates.description || '',
    }),
  });
  return response.data;
}

/**
 * Removes a transaction by ID via REST API.
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
export async function deleteTransaction(id) {
  await apiRequest(`/transactions/${id}`, {
    method: 'DELETE',
  });
  return true;
}

/**
 * Retrieves the monthly budget limit for a given YYYY-MM month key via REST API.
 * @param {string} monthKey
 * @returns {Promise<number>}
 */
export async function getBudgetForMonth(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return 0;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  try {
    const response = await apiRequest(`/budgets/${year}/${month}`);
    if (response && response.data && typeof response.data.amount === 'number') {
      return response.data.amount;
    }
    return 0;
  } catch (err) {
    // 404 means no budget has been set yet for this month
    if (err.status === 404) {
      return 0;
    }
    return 0;
  }
}

/**
 * Saves the monthly budget limit for a given YYYY-MM month key via REST API.
 * Creates or updates the budget in SQLite.
 * @param {string} monthKey
 * @param {number} amount
 * @returns {Promise<number>}
 */
export async function saveBudgetForMonth(monthKey, amount) {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const cleanAmount = Number(Number(amount).toFixed(2));

  // Check if a budget already exists for this month
  let existingBudget = null;
  try {
    const res = await apiRequest(`/budgets/${year}/${month}`);
    if (res && res.data) {
      existingBudget = res.data;
    }
  } catch (err) {
    // Not found is expected for new months
  }

  if (existingBudget && existingBudget.id) {
    await apiRequest(`/budgets/${existingBudget.id}`, {
      method: 'PUT',
      body: JSON.stringify({ amount: cleanAmount }),
    });
  } else {
    await apiRequest('/budgets', {
      method: 'POST',
      body: JSON.stringify({ year, month, amount: cleanAmount }),
    });
  }

  return cleanAmount;
}

/**
 * One-time Migration:
 * Reads existing LocalStorage transactions & budgets and migrates them to the SQLite database.
 * Sets `clearledger_migrated_v1` flag so it never runs twice.
 * Leaves the original LocalStorage data untouched as backup.
 * @returns {Promise<{ migrated: boolean, transactionsCount: number, budgetsCount: number }>}
 */
export async function migrateLocalStorageIfNeeded() {
  try {
    const isMigrated = window.localStorage.getItem(STORAGE_KEYS.MIGRATED);
    if (isMigrated === 'true') {
      return { migrated: false, transactionsCount: 0, budgetsCount: 0 };
    }

    let txCount = 0;
    let bgCount = 0;

    // 1. Migrate LocalStorage Transactions
    const rawTx = window.localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (rawTx) {
      try {
        const parsedTx = JSON.parse(rawTx);
        if (Array.isArray(parsedTx) && parsedTx.length > 0) {
          for (const item of parsedTx) {
            try {
              await addTransaction({
                title: item.title,
                amount: item.amount,
                category: item.category,
                type: item.type,
                date: item.date,
                description: item.description,
              });
              txCount++;
            } catch (err) {
              console.warn('Skipping invalid migration item:', item, err);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse LocalStorage transactions for migration:', e);
      }
    }

    // 2. Migrate LocalStorage Budgets
    const rawBudgets = window.localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (rawBudgets) {
      try {
        const parsedBudgets = JSON.parse(rawBudgets);
        if (parsedBudgets && typeof parsedBudgets === 'object') {
          for (const [key, val] of Object.entries(parsedBudgets)) {
            if (/^\d{4}-\d{2}$/.test(key) && typeof val === 'number' && val > 0) {
              try {
                await saveBudgetForMonth(key, val);
                bgCount++;
              } catch (err) {
                console.warn('Skipping budget migration item:', key, val, err);
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse LocalStorage budgets for migration:', e);
      }
    }

    // Mark migration completed
    window.localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
    console.log(`[Migration] Successfully imported ${txCount} transactions and ${bgCount} budgets into SQLite database.`);
    return { migrated: true, transactionsCount: txCount, budgetsCount: bgCount };
  } catch (err) {
    console.error('[Migration] Failed to migrate LocalStorage data:', err);
    return { migrated: false, transactionsCount: 0, budgetsCount: 0 };
  }
}

/**
 * Builds starter dataset anchored to the current month.
 */
function buildSampleDataset() {
  const m0 = getCurrentMonthKey();
  const shift = (delta) => {
    const [y, m] = m0.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return getCurrentMonthKey(d);
  };
  const m1 = shift(-1);
  const m2 = shift(-2);
  const m3 = shift(-3);
  const m4 = shift(-4);
  const m5 = shift(-5);

  return [
    { title: 'Monthly Salary Deposit', amount: 5400, category: 'Salary', type: 'income', date: `${m0}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450, category: 'Housing', type: 'expense', date: `${m0}-02`, description: 'Monthly rent payment' },
    { title: 'Grocery Shopping', amount: 215.4, category: 'Food', type: 'expense', date: `${m0}-05`, description: 'Weekly groceries and produce' },
    { title: 'Electric & Fiber Internet', amount: 148.9, category: 'Utilities', type: 'expense', date: `${m0}-07`, description: 'Monthly utility and broadband bills' },
    { title: 'UI Audit Freelance Retainer', amount: 850, category: 'Freelance', type: 'income', date: `${m0}-08`, description: 'Design system consultation milestone' },
    { title: 'Transit Pass & Fuel', amount: 112.5, category: 'Transport', type: 'expense', date: `${m0}-10`, description: 'Monthly commuter pass and fuel' },
    { title: 'Pharmacy & Dental Checkup', amount: 135, category: 'Healthcare', type: 'expense', date: `${m0}-11`, description: 'Routine checkup copay' },
    { title: 'Specialty Coffee & Lunch', amount: 78.2, category: 'Food', type: 'expense', date: `${m0}-12`, description: 'Neighborhood bistro and cafe' },
    { title: 'Monthly Salary Deposit', amount: 5400, category: 'Salary', type: 'income', date: `${m1}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450, category: 'Housing', type: 'expense', date: `${m1}-02`, description: 'Monthly rent payment' },
    { title: 'Organic Market Groceries', amount: 468.3, category: 'Food', type: 'expense', date: `${m1}-11`, description: 'Monthly household groceries' },
    { title: 'Autumn Jacket & Footwear', amount: 289, category: 'Shopping', type: 'expense', date: `${m1}-16`, description: 'Seasonal wardrobe essentials' },
    { title: 'Streaming & Concert Tickets', amount: 164, category: 'Entertainment', type: 'expense', date: `${m1}-22`, description: 'Live acoustic show and subscriptions' },
    { title: 'Monthly Salary Deposit', amount: 5400, category: 'Salary', type: 'income', date: `${m2}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450, category: 'Housing', type: 'expense', date: `${m2}-02`, description: 'Monthly rent payment' },
    { title: 'Annual Tech Conference', amount: 420, category: 'Education', type: 'expense', date: `${m2}-14`, description: 'Workshop pass and reference books' },
    { title: 'Supermarket & Dining', amount: 512.75, category: 'Food', type: 'expense', date: `${m2}-19`, description: 'Groceries and weekend dinner' },
    { title: 'Monthly Salary Deposit', amount: 5200, category: 'Salary', type: 'income', date: `${m3}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Quarterly Dividend Payout', amount: 340, category: 'Investments', type: 'income', date: `${m3}-15`, description: 'Index fund distribution' },
    { title: 'Apartment Lease & Utilities', amount: 1610, category: 'Housing', type: 'expense', date: `${m3}-03`, description: 'Rent and municipal water' },
    { title: 'Regional Rail & Rideshare', amount: 275, category: 'Transport', type: 'expense', date: `${m3}-20`, description: 'Weekend regional travel' },
    { title: 'Monthly Salary Deposit', amount: 5200, category: 'Salary', type: 'income', date: `${m4}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450, category: 'Housing', type: 'expense', date: `${m4}-02`, description: 'Monthly rent payment' },
    { title: 'Groceries & Utilities', amount: 645, category: 'Food', type: 'expense', date: `${m4}-14`, description: 'Household food and power' },
    { title: 'Monthly Salary Deposit', amount: 5200, category: 'Salary', type: 'income', date: `${m5}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450, category: 'Housing', type: 'expense', date: `${m5}-02`, description: 'Monthly rent payment' },
    { title: 'Home Office Desk Lamp & Chair', amount: 495, category: 'Shopping', type: 'expense', date: `${m5}-18`, description: 'Workspace ergonomics upgrade' },
  ];
}

/**
 * Seeds sample data into the database if the database is currently empty.
 */
export async function seedInitialDataIfNeeded() {
  try {
    const existing = await getTransactions();
    if (existing.length === 0) {
      const sample = buildSampleDataset();
      for (const item of sample) {
        await addTransaction(item);
      }
      await saveBudgetForMonth(getCurrentMonthKey(), 3000);
    }
  } catch (err) {
    console.error('Failed to seed initial data:', err);
  }
}

/**
 * Restores sample dataset to the database.
 */
export async function resetToSampleData() {
  const sample = buildSampleDataset();
  for (const item of sample) {
    await addTransaction(item);
  }
  await saveBudgetForMonth(getCurrentMonthKey(), 3000);
}
