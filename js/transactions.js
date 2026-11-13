/**
 * transactions.js
 * Transaction categories, validation, pure filtering/sorting,
 * Transaction History table rendering, and Add/Edit/Delete modal workflows.
 */

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Bonus',
  'Gift',
  'Refund',
  'Other',
];

export const ALL_CATEGORIES = Array.from(
  new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
);

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a numeric value into USD currency string.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const safe = Number.isFinite(amount) ? amount : 0;
  return currencyFormatter.format(safe);
}

/**
 * Formats YYYY-MM-DD into concise readable date (e.g., Nov 13, 2026).
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats YYYY-MM into readable month label (e.g., November 2026).
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [y, m] = monthKey.split('-').map(Number);
  const dateObj = new Date(y, m - 1, 1);
  return dateObj.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Escapes HTML special characters to prevent XSS when rendering user input.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates transaction form input and returns field-level errors.
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string>, sanitized: object }}
 */
export function validateTransactionInput(data) {
  const errors = {};
  const title = String(data.title || '').trim();
  const type = data.type === 'income' ? 'income' : 'expense';
  const amountNum = Number(data.amount);
  const category = String(data.category || '').trim();
  const date = String(data.date || '').trim();
  const description = String(data.description || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (data.amount === '' || data.amount === null || data.amount === undefined) {
    errors.amount = 'Please enter an amount.';
  } else if (!Number.isFinite(amountNum) || amountNum <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (amountNum > 100000000) {
    errors.amount = 'Amount exceeds maximum supported limit.';
  }

  const validCats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!category || !validCats.includes(category)) {
    errors.category = 'Please select a valid category.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      title,
      type,
      amount: Number(amountNum.toFixed(2)),
      category,
      date,
      description,
    },
  };
}

/**
 * Pure filter and sort operation on a transactions array.
 * @param {Array<object>} transactions
 * @param {{ search?: string, type?: string, category?: string, month?: string, sortBy?: string }} filters
 * @returns {Array<object>}
 */
export function filterAndSortTransactions(transactions, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const type = filters.type || 'all';
  const category = filters.category || 'all';
  const month = filters.month || 'all';
  const sortBy = filters.sortBy || 'date-desc';

  const filtered = transactions.filter((tx) => {
    if (type !== 'all' && tx.type !== type) return false;
    if (category !== 'all' && tx.category !== category) return false;
    if (month !== 'all' && !tx.date.startsWith(month)) return false;

    if (search) {
      const haystack = `${tx.title} ${tx.category} ${tx.description}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
      case 'amount-desc':
        return b.amount - a.amount || b.date.localeCompare(a.date);
      case 'amount-asc':
        return a.amount - b.amount || b.date.localeCompare(a.date);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    }
  });
}

/**
 * Extracts sorted unique YYYY-MM months present in transactions.
 * @param {Array<object>} transactions
 * @param {string} activeMonth
 * @returns {Array<string>}
 */
export function getAvailableMonths(transactions, activeMonth) {
  const set = new Set();
  if (activeMonth) set.add(activeMonth);
  for (const tx of transactions) {
    if (tx.date && tx.date.length >= 7) {
      set.add(tx.date.slice(0, 7));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Populates a <select> element with categories matching the transaction type.
 * @param {HTMLSelectElement} selectEl
 * @param {'income'|'expense'} type
 * @param {string} [selectedValue]
 */
function populateCategorySelect(selectEl, type, selectedValue) {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  selectEl.innerHTML = categories
    .map(
      (cat) =>
        `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
    )
    .join('');

  if (selectedValue && categories.includes(selectedValue)) {
    selectEl.value = selectedValue;
  } else {
    selectEl.value = categories[0];
  }
}

/**
 * Renders field validation errors on a form.
 * @param {'inline'|'modal'} prefix
 * @param {Record<string, string>} errors
 */
function renderFormErrors(prefix, errors) {
  const fields = ['title', 'amount', 'date', 'category', 'description'];
  for (const field of fields) {
    const errEl = document.getElementById(`${prefix}-error-${field}`);
    const inputEl =
      prefix === 'inline'
        ? document.getElementById(`inline-${field}`)
        : document.getElementById(`modal-${field}-input`);

    if (errEl) {
      errEl.textContent = errors[field] || '';
    }
    if (inputEl) {
      inputEl.classList.toggle('is-invalid', Boolean(errors[field]));
    }
  }
}

/**
 * Clears all validation error messages on a form.
 * @param {'inline'|'modal'} prefix
 */
function clearFormErrors(prefix) {
  renderFormErrors(prefix, {});
}

let lastFocusedElement = null;
let pendingDeleteCallback = null;

/**
 * Opens the Add or Edit Transaction modal.
 * @param {'add'|'edit'} mode
 * @param {object|null} transaction
 * @param {string} defaultDate
 */
export function openTransactionModal(mode, transaction, defaultDate) {
  const modal = document.getElementById('transaction-modal');
  const titleHeading = document.getElementById('modal-tx-title');
  const submitBtn = document.getElementById('btn-submit-tx-modal');
  const idInput = document.getElementById('modal-tx-id');
  const typeInput = document.getElementById('modal-tx-type');
  const titleInput = document.getElementById('modal-title-input');
  const amountInput = document.getElementById('modal-amount-input');
  const dateInput = document.getElementById('modal-date-input');
  const categorySelect = document.getElementById('modal-category-input');
  const descInput = document.getElementById('modal-description-input');
  const typeBtns = modal.querySelectorAll('[data-modal-type]');

  lastFocusedElement = document.activeElement;
  clearFormErrors('modal');

  const isEdit = mode === 'edit' && transaction;
  const txType = isEdit ? transaction.type : 'expense';

  titleHeading.textContent = isEdit ? 'Edit Transaction' : 'Add Transaction';
  submitBtn.textContent = isEdit ? 'Update Transaction' : 'Save Transaction';

  idInput.value = isEdit ? transaction.id : '';
  typeInput.value = txType;

  typeBtns.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.modalType === txType);
  });

  populateCategorySelect(
    categorySelect,
    txType,
    isEdit ? transaction.category : undefined
  );

  titleInput.value = isEdit ? transaction.title : '';
  amountInput.value = isEdit ? String(transaction.amount) : '';
  dateInput.value = isEdit ? transaction.date : defaultDate;
  descInput.value = isEdit ? transaction.description || '' : '';

  modal.hidden = false;
  titleInput.focus();
}

/**
 * Closes the Add/Edit Transaction modal.
 */
export function closeTransactionModal() {
  const modal = document.getElementById('transaction-modal');
  modal.hidden = true;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

/**
 * Opens the Delete Confirmation modal.
 * @param {object} transaction
 * @param {Function} onConfirm
 */
export function openConfirmDeleteModal(transaction, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const messageEl = document.getElementById('confirm-modal-message');

  lastFocusedElement = document.activeElement;
  pendingDeleteCallback = onConfirm;

  messageEl.textContent = `Delete "${transaction.title}" (${formatCurrency(
    transaction.amount
  )})? This action cannot be undone.`;

  modal.hidden = false;
  document.getElementById('btn-confirm-delete').focus();
}

/**
 * Closes the Delete Confirmation modal.
 */
export function closeConfirmDeleteModal() {
  const modal = document.getElementById('confirm-modal');
  modal.hidden = true;
  pendingDeleteCallback = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

/**
 * Initializes event listeners for both inline and modal transaction forms,
 * plus search/filter/sort controls and delete confirmation modal.
 * @param {object} handlers
 */
export function setupTransactionForms(handlers) {
  const {
    defaultDate,
    onCreate,
    onUpdate,
    onFilterChange,
  } = handlers;

  // --- Inline Form Setup ---
  const inlineForm = document.getElementById('inline-transaction-form');
  const inlineTypeInput = document.getElementById('inline-type');
  const inlineCategorySelect = document.getElementById('inline-category');
  const inlineDateInput = document.getElementById('inline-date');
  const inlineTypeBtns = inlineForm.querySelectorAll('[data-inline-type]');

  inlineDateInput.value = defaultDate;
  populateCategorySelect(inlineCategorySelect, 'expense');

  inlineTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextType = btn.dataset.inlineType;
      inlineTypeInput.value = nextType;
      inlineTypeBtns.forEach((b) =>
        b.classList.toggle('is-active', b.dataset.inlineType === nextType)
      );
      populateCategorySelect(inlineCategorySelect, nextType);
    });
  });

  inlineForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      type: inlineTypeInput.value,
      title: document.getElementById('inline-title').value,
      amount: document.getElementById('inline-amount').value,
      date: inlineDateInput.value,
      category: inlineCategorySelect.value,
      description: document.getElementById('inline-description').value,
    };

    const result = validateTransactionInput(payload);
    if (!result.valid) {
      renderFormErrors('inline', result.errors);
      return;
    }

    clearFormErrors('inline');
    onCreate(result.sanitized);

    // Reset inputs while preserving type & date for fast repeated entry
    document.getElementById('inline-title').value = '';
    document.getElementById('inline-amount').value = '';
    document.getElementById('inline-description').value = '';
  });

  // --- Modal Form Setup ---
  const modal = document.getElementById('transaction-modal');
  const modalForm = document.getElementById('modal-transaction-form');
  const modalTypeInput = document.getElementById('modal-tx-type');
  const modalCategorySelect = document.getElementById('modal-category-input');
  const modalTypeBtns = modalForm.querySelectorAll('[data-modal-type]');

  modalTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextType = btn.dataset.modalType;
      modalTypeInput.value = nextType;
      modalTypeBtns.forEach((b) =>
        b.classList.toggle('is-active', b.dataset.modalType === nextType)
      );
      populateCategorySelect(modalCategorySelect, nextType);
    });
  });

  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('modal-tx-id').value;
    const payload = {
      type: modalTypeInput.value,
      title: document.getElementById('modal-title-input').value,
      amount: document.getElementById('modal-amount-input').value,
      date: document.getElementById('modal-date-input').value,
      category: modalCategorySelect.value,
      description: document.getElementById('modal-description-input').value,
    };

    const result = validateTransactionInput(payload);
    if (!result.valid) {
      renderFormErrors('modal', result.errors);
      return;
    }

    clearFormErrors('modal');
    if (editId) {
      onUpdate(editId, result.sanitized);
    } else {
      onCreate(result.sanitized);
    }
    closeTransactionModal();
  });

  document
    .getElementById('btn-close-tx-modal')
    .addEventListener('click', closeTransactionModal);
  document
    .getElementById('btn-cancel-tx-modal')
    .addEventListener('click', closeTransactionModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeTransactionModal();
  });

  // --- Confirm Delete Modal ---
  const confirmModal = document.getElementById('confirm-modal');
  document
    .getElementById('btn-close-confirm-modal')
    .addEventListener('click', closeConfirmDeleteModal);
  document
    .getElementById('btn-cancel-confirm')
    .addEventListener('click', closeConfirmDeleteModal);
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmDeleteModal();
  });
  document
    .getElementById('btn-confirm-delete')
    .addEventListener('click', () => {
      if (typeof pendingDeleteCallback === 'function') {
        pendingDeleteCallback();
      }
      closeConfirmDeleteModal();
    });

  // Escape key closes open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modal.hidden) closeTransactionModal();
      if (!confirmModal.hidden) closeConfirmDeleteModal();
    }
  });

  // --- Search, Filter, Sort Controls ---
  const searchInput = document.getElementById('tx-search-input');
  const categoryFilter = document.getElementById('tx-filter-category');
  const monthFilter = document.getElementById('tx-filter-month');
  const sortSelect = document.getElementById('tx-sort-by');
  const typeFilterBtns = document.querySelectorAll('[data-filter-type]');

  searchInput.addEventListener('input', (e) => {
    onFilterChange({ search: e.target.value });
  });

  typeFilterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextType = btn.dataset.filterType;
      typeFilterBtns.forEach((b) =>
        b.classList.toggle('is-active', b.dataset.filterType === nextType)
      );
      onFilterChange({ type: nextType });
    });
  });

  categoryFilter.addEventListener('change', (e) => {
    onFilterChange({ category: e.target.value });
  });

  monthFilter.addEventListener('change', (e) => {
    onFilterChange({ month: e.target.value });
  });

  sortSelect.addEventListener('change', (e) => {
    onFilterChange({ sortBy: e.target.value });
  });
}

/**
 * Renders the Transaction History view (filters, summary counts, and ledger table).
 * @param {object} state
 * @param {object} handlers
 */
export function renderTransactionsView(state, handlers) {
  const { transactions, filters, activeMonth } = state;

  // Sync Category & Month dropdown options while preserving current selection
  const categoryFilterEl = document.getElementById('tx-filter-category');
  const prevCat = filters.category || 'all';
  categoryFilterEl.innerHTML = [
    '<option value="all">All Categories</option>',
    ...ALL_CATEGORIES.map(
      (cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
    ),
  ].join('');
  categoryFilterEl.value = ALL_CATEGORIES.includes(prevCat) ? prevCat : 'all';

  const monthFilterEl = document.getElementById('tx-filter-month');
  const prevMonth = filters.month || 'all';
  const months = getAvailableMonths(transactions, activeMonth);
  monthFilterEl.innerHTML = [
    '<option value="all">All Months</option>',
    ...months.map(
      (m) =>
        `<option value="${escapeHtml(m)}">${escapeHtml(
          formatMonthLabel(m)
        )}</option>`
    ),
  ].join('');
  monthFilterEl.value = months.includes(prevMonth) ? prevMonth : 'all';

  // Compute filtered list
  const filtered = filterAndSortTransactions(transactions, filters);

  const filteredIncome = filtered
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const filteredExpenses = filtered
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  document.getElementById('tx-summary-meta').textContent = `${
    filtered.length
  } ${filtered.length === 1 ? 'transaction' : 'transactions'} shown`;

  document.getElementById('tx-filtered-totals').innerHTML = `
    <span>In: <strong class="tx-total-income">${formatCurrency(
      filteredIncome
    )}</strong></span>
    <span>Out: <strong class="tx-total-expense">${formatCurrency(
      filteredExpenses
    )}</strong></span>
  `;

  const container = document.getElementById('transactions-table-container');

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="receipt" class="empty-state-icon" aria-hidden="true"></i>
        <h3 class="empty-state-title">No transactions recorded yet</h3>
        <p class="empty-state-desc">
          Use the form on the left or click Add Transaction to log your first income or expense entry.
        </p>
        <button type="button" class="btn-primary" id="tx-empty-add-btn">Add First Transaction</button>
      </div>
    `;
    const addBtn = document.getElementById('tx-empty-add-btn');
    if (addBtn) addBtn.addEventListener('click', handlers.onAddClick);
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="search-x" class="empty-state-icon" aria-hidden="true"></i>
        <h3 class="empty-state-title">No matching transactions</h3>
        <p class="empty-state-desc">
          Adjust your search terms or clear active category, type, or month filters.
        </p>
        <button type="button" class="btn-secondary" id="tx-reset-filters-btn">Reset Filters</button>
      </div>
    `;
    const resetBtn = document.getElementById('tx-reset-filters-btn');
    if (resetBtn) resetBtn.addEventListener('click', handlers.onResetFilters);
    return;
  }

  const rowsHtml = filtered
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const sign = isIncome ? '+' : '−';
      const typeLabel = isIncome ? 'Income' : 'Expense';
      const amountClass = isIncome ? 'tx-amount-income' : 'tx-amount-expense';
      const typeClass = isIncome ? 'tx-type-income' : 'tx-type-expense';

      return `
        <tr data-tx-id="${escapeHtml(tx.id)}">
          <td>
            <div class="tx-title-cell">
              <span class="tx-title-text">${escapeHtml(tx.title)}</span>
              ${
                tx.description
                  ? `<span class="tx-desc-text" title="${escapeHtml(
                      tx.description
                    )}">${escapeHtml(tx.description)}</span>`
                  : ''
              }
            </div>
          </td>
          <td class="tx-meta-text">${escapeHtml(tx.category)}</td>
          <td><span class="tx-type-text ${typeClass}">${typeLabel}</span></td>
          <td class="tx-meta-text tabular-nums">${escapeHtml(
            formatDisplayDate(tx.date)
          )}</td>
          <td class="col-right tx-amount tabular-nums ${amountClass}">
            ${sign}${formatCurrency(tx.amount)}
          </td>
          <td class="col-right">
            <div class="tx-actions-cell">
              <button
                type="button"
                class="btn-icon"
                data-action="edit"
                data-id="${escapeHtml(tx.id)}"
                aria-label="Edit ${escapeHtml(tx.title)}"
                title="Edit transaction"
              >
                <i data-lucide="pencil" class="icon-sm" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="btn-icon btn-icon-danger"
                data-action="delete"
                data-id="${escapeHtml(tx.id)}"
                aria-label="Delete ${escapeHtml(tx.title)}"
                title="Delete transaction"
              >
                <i data-lucide="trash-2" class="icon-sm" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Category</th>
            <th>Type</th>
            <th>Date</th>
            <th class="col-right">Amount</th>
            <th class="col-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  // Bind Edit & Delete actions via delegation on the rendered container
  container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = transactions.find((item) => item.id === btn.dataset.id);
      if (tx) handlers.onEdit(tx);
    });
  });

  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = transactions.find((item) => item.id === btn.dataset.id);
      if (tx) handlers.onDelete(tx);
    });
  });
}
