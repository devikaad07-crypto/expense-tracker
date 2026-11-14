/**
 * app.js
 * Central Application Coordinator.
 * Connects storage.js (API client), pure calculation modules, navigation, and UI rendering.
 */

import { renderAnalyticsView } from './analytics.js';
import { renderInsightsView } from './insights.js';
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
  getLastApiError,
  getTodayDateString,
  getTransactions,
  migrateLocalStorageIfNeeded,
  resetToSampleData,
  saveBudgetForMonth,
  seedInitialDataIfNeeded,
  updateTransaction,
} from './storage.js';
import {
  escapeHtml,
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
  insights: 'Smart Financial Insights',
};

const appState = {
  activeView: 'dashboard',
  activeMonth: getCurrentMonthKey(),
  analyticsPeriod: '6m',
  transactions: [],
  monthlyBudget: 0,
  leakThreshold: 200,
  isLoading: false,
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
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast-item${variant === 'error' ? ' is-error' : ''}`;
  toast.textContent = message;
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

/**
 * Renders or removes a persistent error banner when the backend is unreachable.
 * Uses existing alert-banner styling.
 */
function renderApiErrorBanner(errorMessage) {
  let errorEl = document.getElementById('global-api-error');
  if (!errorMessage) {
    if (errorEl) errorEl.remove();
    return;
  }
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.id = 'global-api-error';
    errorEl.className = 'alert-banner alert-banner-exceeded';
    errorEl.setAttribute('role', 'alert');
    errorEl.style.margin = '16px 24px 0';
    const mainContent = document.getElementById('main-content');
    if (mainContent && mainContent.parentElement) {
      mainContent.parentElement.insertBefore(errorEl, mainContent);
    }
  }
  errorEl.innerHTML = `
    <div class="alert-banner-content">
      <i data-lucide="alert-octagon" class="alert-banner-icon" aria-hidden="true"></i>
      <div>
        <strong>Server Connection Error:</strong> ${escapeHtml(errorMessage)}
      </div>
    </div>
  `;
  refreshIcons();
}

/**
 * Renders a loading state indicator in table containers while data is being fetched.
 */
function showLoadingState() {
  const loadingHtml = `
    <div class="empty-state">
      <i data-lucide="loader-2" class="empty-state-icon" aria-hidden="true"></i>
      <h3 class="empty-state-title">Loading data...</h3>
      <p class="empty-state-desc">Fetching financial records from the database.</p>
    </div>
  `;
  const recentContainer = document.getElementById('dashboard-recent-container');
  const tableContainer = document.getElementById('transactions-table-container');
  if (recentContainer) recentContainer.innerHTML = loadingHtml;
  if (tableContainer) tableContainer.innerHTML = loadingHtml;
  refreshIcons();
}

/**
 * Reloads transactions and active month budget from the REST API.
 */
async function syncDataFromStorage() {
  appState.transactions = await getTransactions();
  appState.monthlyBudget = await getBudgetForMonth(appState.activeMonth);
}

/**
 * Switches the active view section and updates sidebar & topbar navigation state.
 * @param {'dashboard'|'transactions'|'analytics'|'budget'} viewName
 */
async function navigateTo(viewName) {
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
  await renderApplication();
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
 * Renders the active view and global budget indicators using database records.
 */
async function renderApplication() {
  renderApiErrorBanner(getLastApiError());
  await syncDataFromStorage();
  renderApiErrorBanner(getLastApiError());

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
      openConfirmDeleteModal(tx, async () => {
        try {
          await deleteTransaction(tx.id);
          await renderApplication();
          showToast('Transaction deleted.');
        } catch (err) {
          showToast(err.message || 'Failed to delete transaction.', 'error');
        }
      });
    },
    onResetFilters: async () => {
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
      await renderApplication();
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
  } else if (appState.activeView === 'insights') {
    renderInsightsView(renderState, {
      onThresholdChange: async (newThreshold) => {
        appState.leakThreshold = newThreshold;
        await renderApplication();
        showToast(`Leak threshold updated to $${newThreshold}.`);
      },
    });
  }

  refreshIcons();
}

/**
 * Updates the active month across topbar, budget view, and charts.
 * @param {string} nextMonth
 */
async function handleMonthChange(nextMonth) {
  if (!nextMonth || !/^\d{4}-\d{2}$/.test(nextMonth)) return;
  appState.activeMonth = nextMonth;
  document.getElementById('global-month-select').value = nextMonth;
  await renderApplication();
  showToast(`Switched active month to ${formatMonthLabel(nextMonth)}.`);
}

/**
 * Bootstraps the application on DOM ready.
 */
async function initApp() {
  showLoadingState();

  // 1. One-time LocalStorage migration
  const migrationResult = await migrateLocalStorageIfNeeded();
  if (migrationResult.migrated && (migrationResult.transactionsCount > 0 || migrationResult.budgetsCount > 0)) {
    showToast(
      `Imported ${migrationResult.transactionsCount} transactions and ${migrationResult.budgetsCount} budgets from LocalStorage.`
    );
  }

  // 2. Seed initial starter dataset if database is empty
  await seedInitialDataIfNeeded();

  const monthSelect = document.getElementById('global-month-select');
  monthSelect.value = appState.activeMonth;
  monthSelect.addEventListener('change', async (e) => {
    if (e.target.value) await handleMonthChange(e.target.value);
  });

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', async () => await navigateTo(btn.dataset.view));
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
    .addEventListener('click', async () => await navigateTo('transactions'));

  // Sidebar utility actions
  document
    .getElementById('btn-export-csv')
    .addEventListener('click', exportTransactionsCsv);

  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    try {
      await resetToSampleData();
      appState.activeMonth = getCurrentMonthKey();
      monthSelect.value = appState.activeMonth;
      await renderApplication();
      showToast('Sample dataset restored to database.');
    } catch (err) {
      showToast(err.message || 'Failed to restore sample data.', 'error');
    }
  });

  // Analytics period switch
  document.querySelectorAll('[data-analytics-period]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const period = btn.dataset.analyticsPeriod;
      appState.analyticsPeriod = period;
      document.querySelectorAll('[data-analytics-period]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.analyticsPeriod === period);
      });
      await renderApplication();
    });
  });

  // Setup transaction forms & filters
  setupTransactionForms({
    defaultDate: getTodayDateString(),
    onCreate: async (txData) => {
      try {
        await addTransaction(txData);
        await renderApplication();
        showToast('Transaction added.');
      } catch (err) {
        showToast(err.message || 'Failed to create transaction.', 'error');
      }
    },
    onUpdate: async (id, updates) => {
      try {
        await updateTransaction(id, updates);
        await renderApplication();
        showToast('Transaction updated.');
      } catch (err) {
        showToast(err.message || 'Failed to update transaction.', 'error');
      }
    },
    onFilterChange: async (partialFilters) => {
      appState.filters = { ...appState.filters, ...partialFilters };
      await renderApplication();
    },
  });

  // Setup budget form
  setupBudgetForm({
    onMonthChange: handleMonthChange,
    onSaveBudget: async (monthKey, amount) => {
      try {
        await saveBudgetForMonth(monthKey, amount);
        appState.activeMonth = monthKey;
        monthSelect.value = monthKey;
        await renderApplication();
        showToast(`Monthly budget saved for ${formatMonthLabel(monthKey)}.`);
      } catch (err) {
        showToast(err.message || 'Failed to save budget.', 'error');
      }
    },
  });

  await renderApplication();
}

document.addEventListener('DOMContentLoaded', initApp);
