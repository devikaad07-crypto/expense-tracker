/**
 * budget.js
 * Pure monthly budget utilization calculations, 80% warning & >100% alert logic,
 * and Budget Management UI controller.
 */

import { getCategoryBreakdown } from './dashboard.js';
import {
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
} from './transactions.js';

/**
 * Computes monthly budget tracking status dynamically from transactions.
 * @param {Array<object>} transactions
 * @param {string} monthKey YYYY-MM
 * @param {number} monthlyBudget
 */
export function calculateBudgetStatus(transactions, monthKey, monthlyBudget) {
  const budget = Number(monthlyBudget) > 0 ? Number(monthlyBudget) : 0;

  const spent = Number(
    transactions
      .filter(
        (tx) =>
          tx.type === 'expense' && tx.date && tx.date.startsWith(monthKey)
      )
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
      .toFixed(2)
  );

  const remaining = Number((budget - spent).toFixed(2));
  const utilizationPct =
    budget > 0 ? Number(((spent / budget) * 100).toFixed(1)) : 0;

  let status = 'unset';
  if (budget > 0) {
    if (utilizationPct > 100) {
      status = 'exceeded';
    } else if (utilizationPct >= 80) {
      status = 'warning';
    } else {
      status = 'normal';
    }
  }

  const categoryBreakdown = getCategoryBreakdown(
    transactions,
    'expense',
    monthKey
  ).map((item) => ({
    ...item,
    budgetSharePct:
      budget > 0 ? Number(((item.total / budget) * 100).toFixed(1)) : 0,
  }));

  return {
    monthKey,
    budget,
    spent,
    remaining,
    utilizationPct,
    status,
    categoryBreakdown,
  };
}

/**
 * Generates explicit warning (80%+) or exceeded (>100%) banner HTML.
 * Never signals state by hue alone—always pairs semantic color with icon & text.
 * @param {object} budgetStatus
 * @returns {string}
 */
export function renderBudgetBannerHtml(budgetStatus) {
  if (!budgetStatus || budgetStatus.budget <= 0) return '';

  const monthLabel = formatMonthLabel(budgetStatus.monthKey);

  if (budgetStatus.status === 'exceeded') {
    const overBy = Math.abs(budgetStatus.remaining);
    return `
      <div class="alert-banner alert-banner-exceeded" role="alert">
        <div class="alert-banner-content">
          <i data-lucide="alert-octagon" class="alert-banner-icon" aria-hidden="true"></i>
          <div>
            <strong>Budget Exceeded (${budgetStatus.utilizationPct.toFixed(1)}%):</strong>
            Spending in ${escapeHtml(monthLabel)} (${formatCurrency(
      budgetStatus.spent
    )}) has exceeded your ${formatCurrency(
      budgetStatus.budget
    )} monthly budget by ${formatCurrency(overBy)}.
          </div>
        </div>
      </div>
    `;
  }

  if (budgetStatus.status === 'warning') {
    return `
      <div class="alert-banner alert-banner-warning" role="status">
        <div class="alert-banner-content">
          <i data-lucide="alert-triangle" class="alert-banner-icon" aria-hidden="true"></i>
          <div>
            <strong>80% Budget Warning (${budgetStatus.utilizationPct.toFixed(
              1
            )}%):</strong>
            You have spent ${formatCurrency(
              budgetStatus.spent
            )} of your ${formatCurrency(
      budgetStatus.budget
    )} ${escapeHtml(monthLabel)} budget. ${formatCurrency(
      budgetStatus.remaining
    )} remaining.
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

/**
 * Sets up Budget form submission, preset chips, and month switching.
 * @param {object} handlers
 */
export function setupBudgetForm(handlers) {
  const form = document.getElementById('budget-form');
  const monthInput = document.getElementById('budget-month-display');
  const amountInput = document.getElementById('budget-amount-input');
  const errorEl = document.getElementById('budget-error-amount');

  monthInput.addEventListener('change', () => {
    if (monthInput.value) {
      handlers.onMonthChange(monthInput.value);
    }
  });

  document.querySelectorAll('[data-budget-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.budgetPreset;
      errorEl.textContent = '';
      amountInput.classList.remove('is-invalid');
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const targetMonth = monthInput.value;
    const rawVal = amountInput.value;
    const numVal = Number(rawVal);

    if (!rawVal || !Number.isFinite(numVal) || numVal <= 0) {
      errorEl.textContent = 'Please enter a valid monthly budget greater than $0.';
      amountInput.classList.add('is-invalid');
      return;
    }

    errorEl.textContent = '';
    amountInput.classList.remove('is-invalid');
    handlers.onSaveBudget(targetMonth, Number(numVal.toFixed(2)));
  });
}

/**
 * Renders the Budget Management view and updates the sidebar quick-glance widget.
 * @param {object} state
 */
export function renderBudgetView(state) {
  const { activeMonth, budgetStatus } = state;
  const monthLabel = formatMonthLabel(activeMonth);

  // Sync sidebar budget glance across all views
  const sidebarPct = document.getElementById('sidebar-budget-pct');
  const sidebarFill = document.getElementById('sidebar-budget-fill');
  const sidebarTrack = document.getElementById('sidebar-budget-track');
  const sidebarMeta = document.getElementById('sidebar-budget-meta');

  sidebarFill.className = 'progress-fill';
  if (budgetStatus.budget > 0) {
    const clamped = Math.min(budgetStatus.utilizationPct, 100);
    sidebarPct.textContent = `${budgetStatus.utilizationPct.toFixed(0)}%`;
    sidebarFill.style.width = `${clamped}%`;
    sidebarFill.classList.add(`is-${budgetStatus.status}`);
    sidebarTrack.setAttribute('aria-valuenow', String(Math.round(clamped)));
    sidebarMeta.textContent = `${formatCurrency(
      budgetStatus.spent
    )} of ${formatCurrency(budgetStatus.budget)}`;
  } else {
    sidebarPct.textContent = '—';
    sidebarFill.style.width = '0%';
    sidebarTrack.setAttribute('aria-valuenow', '0');
    sidebarMeta.textContent = 'No budget configured';
  }

  // Budget View Elements
  document.getElementById(
    'budget-month-heading'
  ).textContent = `Monthly spending limit and utilization for ${monthLabel}`;
  document.getElementById(
    'budget-form-subtitle'
  ).textContent = `Configure spending limit for ${monthLabel}`;

  const monthInput = document.getElementById('budget-month-display');
  if (monthInput.value !== activeMonth) {
    monthInput.value = activeMonth;
  }

  const amountInput = document.getElementById('budget-amount-input');
  if (document.activeElement !== amountInput) {
    amountInput.value =
      budgetStatus.budget > 0 ? String(budgetStatus.budget) : '';
  }

  // Warning / Exceeded banner
  document.getElementById('budget-alert-slot').innerHTML =
    renderBudgetBannerHtml(budgetStatus);

  // Status label
  const statusEl = document.getElementById('budget-status-text');
  statusEl.className = 'status-text';
  if (budgetStatus.status === 'exceeded') {
    statusEl.textContent = 'Budget Exceeded';
    statusEl.classList.add('is-exceeded');
  } else if (budgetStatus.status === 'warning') {
    statusEl.textContent = 'Warning (80%+ Used)';
    statusEl.classList.add('is-warning');
  } else if (budgetStatus.status === 'normal') {
    statusEl.textContent = 'Within Budget';
  } else {
    statusEl.textContent = 'Not Set';
    statusEl.classList.add('is-unset');
  }

  // Metrics
  document.getElementById('budget-val-limit').textContent =
    budgetStatus.budget > 0 ? formatCurrency(budgetStatus.budget) : 'Not set';
  document.getElementById('budget-val-spent').textContent = formatCurrency(
    budgetStatus.spent
  );

  const remainingEl = document.getElementById('budget-val-remaining');
  if (budgetStatus.budget <= 0) {
    remainingEl.textContent = '—';
    remainingEl.style.color = '';
  } else if (budgetStatus.remaining < 0) {
    remainingEl.textContent = `−${formatCurrency(
      Math.abs(budgetStatus.remaining)
    )}`;
    remainingEl.style.color = 'var(--status-expense)';
  } else {
    remainingEl.textContent = formatCurrency(budgetStatus.remaining);
    remainingEl.style.color = 'var(--status-income)';
  }

  document.getElementById('budget-val-pct').textContent =
    budgetStatus.budget > 0
      ? `${budgetStatus.utilizationPct.toFixed(1)}%`
      : '0.0%';

  // Progress bar
  const mainFill = document.getElementById('budget-main-fill');
  const mainTrack = document.getElementById('budget-main-track');
  const clampedMain = Math.min(budgetStatus.utilizationPct, 100);
  mainFill.className = 'progress-fill';
  mainFill.style.width = `${budgetStatus.budget > 0 ? clampedMain : 0}%`;
  if (budgetStatus.status !== 'unset') {
    mainFill.classList.add(`is-${budgetStatus.status}`);
  }
  mainTrack.setAttribute('aria-valuenow', String(Math.round(clampedMain)));

  // Category Contribution Breakdown
  const catContainer = document.getElementById('budget-category-breakdown');
  if (budgetStatus.categoryBreakdown.length === 0) {
    catContainer.innerHTML = `
      <p class="card-subtitle">No expenses recorded in ${escapeHtml(
        monthLabel
      )} yet.</p>
    `;
    return;
  }

  catContainer.innerHTML = `
    <div class="budget-category-list">
      ${budgetStatus.categoryBreakdown
        .map((item) => {
          const shareText =
            budgetStatus.budget > 0
              ? `${item.budgetSharePct.toFixed(1)}% of budget`
              : `${item.percentage.toFixed(1)}% of spend`;
          const barWidth =
            budgetStatus.budget > 0
              ? Math.min(item.budgetSharePct, 100)
              : Math.min(item.percentage, 100);

          return `
            <div class="budget-cat-row">
              <div class="budget-cat-meta">
                <span>${escapeHtml(item.category)}</span>
                <span class="tabular-nums">
                  <strong>${formatCurrency(item.total)}</strong> · ${shareText}
                </span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${barWidth}%"></div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}
