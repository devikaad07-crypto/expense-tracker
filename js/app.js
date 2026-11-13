/**
 * app.js
 * Central Application Coordinator.
 * Connects storage.js, pure calculation modules, navigation, and UI rendering.
 */

import { renderAnalyticsView } from './analytics.js';
import {
  calculateBudgetStatus,
  renderBudgetBannerHtml,
  renderBudgetView,
  setupBudgetForm,
} from './budget.js';
import { renderDashboardView } from './dashboard.js';
import {
  addTransaction,
  deleteTransaction,
  getBudgetForMonth,
  getCurrentMonthKey,
  getTodayDateString,
  getTransactions,
  resetToSampleData,
  saveBudgetForMonth,
  seedInitialDataIfNeeded,
  updateTransaction,
} from './storage.js';
import {
  formatMonthLabel,
  openConfirmDeleteModal,
  openTransactionModal,
  renderTransactionsView,
  setupTransactionForms,
} from './transactions.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Expense Analytics',
  budget: 'Budget Management',
};

const appState = {
  activeView: 'dashboard',
  activeMonth: getCurrentMonthKey(),
  analyticsPeriod: '6m',
  transactions: [],
  monthlyBudget: 0,
  filters: {
    search: '',
    type: 'all',
    category: 'all',
    month: 'all',
    sortBy: 'date-desc',
  },
};

/**
 * Refreshes Lucide SVG icons across newly rendered DOM nodes.
 */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Displays a brief accessible toast notification.
 * @param {string} message
 * @param {'info'|'error'} [variant]
 */
function showToast(message, variant = 'info') {
  const region = document.getElementById('toast-region');
  const toast = document.createElement('div');
  toast.className = `toast-item${variant === 'error' ? ' is-error' : ''}`;
  toast.textContent = message;
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Reloads transactions and active month budget from storage.js.
 */
function syncDataFromStorage() {
  appState.transactions = getTransactions();
  appState.monthlyBudget = getBudgetForMonth(appState.activeMonth);
}

/**
 * Switches the active view section and updates sidebar & topbar navigation state.
 * @param {'dashboard'|'transactions'|'analytics'|'budget'} viewName
 */
function navigateTo(viewName) {
  if (!VIEW_TITLES[viewName]) return;
  appState.activeView = viewName;

  document.querySelectorAll('.view-section').forEach((sec) => {
    const isMatch = sec.id === `view-${viewName}`;
    sec.hidden = !isMatch;
    sec.classList.toggle('is-active', isMatch);
  });

  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    const isMatch = btn.dataset.view === viewName;
    btn.classList.toggle('is-active', isMatch);
    if (isMatch) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  document.getElementById('topbar-view-title').textContent =
    VIEW_TITLES[viewName];

  closeMobileSidebar();
  renderApplication();
}

/**
 * Opens or closes the mobile navigation drawer.
 */
function openMobileSidebar() {
  document.getElementById('app-sidebar').classList.add('is-open');
  document.getElementById('sidebar-backdrop').classList.add('is-open');
  document
    .getElementById('btn-mobile-menu')
    .setAttribute('aria-expanded', 'true');
}

function closeMobileSidebar() {
  document.getElementById('app-sidebar').classList.remove('is-open');
  document.getElementById('sidebar-backdrop').classList.remove('is-open');
  document
    .getElementById('btn-mobile-menu')
    .setAttribute('aria-expanded', 'false');
}

/**
 * Exports all transactions to a downloadable CSV file.
 */
function exportTransactionsCsv() {
  if (appState.transactions.length === 0) {
    showToast('No transactions available to export.', 'error');
    return;
  }

  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'ID',
    'Title',
    'Type',
    'Category',
    'Amount',
    'Date',
    'Description',
  ];
  const rows = appState.transactions.map((tx) =>
    [
      tx.id,
      tx.title,
      tx.type,
      tx.category,
      tx.amount.toFixed(2),
      tx.date,
      tx.description,
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clearledger-transactions-${getTodayDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Transactions exported to CSV.');
}

/**
 * Renders the active view and global budget indicators.
 */
function renderApplication() {
  syncDataFromStorage();

  const budgetStatus = calculateBudgetStatus(
    appState.transactions,
    appState.activeMonth,
    appState.monthlyBudget
  );
  const budgetBannerHtml = renderBudgetBannerHtml(budgetStatus);

  const renderState = {
    ...appState,
    budgetStatus,
    budgetBannerHtml,
  };

  const txHandlers = {
    onAddClick: () =>
      openTransactionModal('add', null, getTodayDateString()),
    onEdit: (tx) =>
      openTransactionModal('edit', tx, getTodayDateString()),
    onDelete: (tx) => {
      openConfirmDeleteModal(tx, () => {
        deleteTransaction(tx.id);
        renderApplication();
        showToast('Transaction deleted.');
      });
    },
    onResetFilters: () => {
      appState.filters = {
        search: '',
        type: 'all',
        category: 'all',
        month: 'all',
        sortBy: 'date-desc',
      };
      document.getElementById('tx-search-input').value = '';
      document.getElementById('tx-sort-by').value = 'date-desc';
      document.querySelectorAll('[data-filter-type]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.filterType === 'all');
      });
      renderApplication();
    },
  };

  // Always update sidebar budget widget + active view
  renderBudgetView(renderState);

  if (appState.activeView === 'dashboard') {
    renderDashboardView(renderState, txHandlers);
  } else if (appState.activeView === 'transactions') {
    renderTransactionsView(renderState, txHandlers);
  } else if (appState.activeView === 'analytics') {
    renderAnalyticsView(renderState);
  }

  refreshIcons();
}

/**
 * Updates the active month across topbar, budget view, and charts.
 * @param {string} nextMonth
 */
function handleMonthChange(nextMonth) {
  if (!nextMonth || !/^\d{4}-\d{2}$/.test(nextMonth)) return;
  appState.activeMonth = nextMonth;
  document.getElementById('global-month-select').value = nextMonth;
  renderApplication();
  showToast(`Switched active month to ${formatMonthLabel(nextMonth)}.`);
}

/**
 * Bootstraps the application on DOM ready.
 */
function initApp() {
  seedInitialDataIfNeeded();

  const monthSelect = document.getElementById('global-month-select');
  monthSelect.value = appState.activeMonth;
  monthSelect.addEventListener('change', (e) => {
    if (e.target.value) handleMonthChange(e.target.value);
  });

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Mobile sidebar drawer
  document
    .getElementById('btn-mobile-menu')
    .addEventListener('click', openMobileSidebar);
  document
    .getElementById('sidebar-backdrop')
    .addEventListener('click', closeMobileSidebar);

  // Global Add Transaction CTA
  document
    .getElementById('btn-open-add-modal')
    .addEventListener('click', () =>
      openTransactionModal('add', null, getTodayDateString())
    );

  // Dashboard "View All" shortcut
  document
    .getElementById('btn-view-all-transactions')
    .addEventListener('click', () => navigateTo('transactions'));

  // Sidebar utility actions
  document
    .getElementById('btn-export-csv')
    .addEventListener('click', exportTransactionsCsv);
  document.getElementById('btn-reset-demo').addEventListener('click', () => {
    resetToSampleData();
    appState.activeMonth = getCurrentMonthKey();
    monthSelect.value = appState.activeMonth;
    renderApplication();
    showToast('Sample dataset restored.');
  });

  // Analytics period switch
  document.querySelectorAll('[data-analytics-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.analyticsPeriod;
      appState.analyticsPeriod = period;
      document.querySelectorAll('[data-analytics-period]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.analyticsPeriod === period);
      });
      renderApplication();
    });
  });

  // Setup transaction forms & filters
  setupTransactionForms({
    defaultDate: getTodayDateString(),
    onCreate: (txData) => {
      addTransaction(txData);
      renderApplication();
      showToast('Transaction added.');
    },
    onUpdate: (id, updates) => {
      updateTransaction(id, updates);
      renderApplication();
      showToast('Transaction updated.');
    },
    onFilterChange: (partialFilters) => {
      appState.filters = { ...appState.filters, ...partialFilters };
      renderApplication();
    },
  });

  // Setup budget form
  setupBudgetForm({
    onMonthChange: handleMonthChange,
    onSaveBudget: (monthKey, amount) => {
      saveBudgetForMonth(monthKey, amount);
      appState.activeMonth = monthKey;
      monthSelect.value = monthKey;
      renderApplication();
      showToast(`Monthly budget saved for ${formatMonthLabel(monthKey)}.`);
    },
  });

  renderApplication();
}

document.addEventListener('DOMContentLoaded', initApp);
