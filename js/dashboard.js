/**
 * dashboard.js
 * Pure financial calculations and Dashboard UI / Chart.js rendering.
 * Total Balance = Total Income - Total Expenses (dynamically computed).
 */

import {
  escapeHtml,
  formatCurrency,
  formatDisplayDate,
  formatMonthLabel,
} from './transactions.js';

export const CATEGORY_COLORS = [
  '#1D4ED8',
  '#0F766E',
  '#D97706',
  '#DC2626',
  '#4F46E5',
  '#059669',
  '#9333EA',
  '#475569',
  '#0284C7',
];

let monthlyOverviewChart = null;
let categoryBreakdownChart = null;

/**
 * Computes core financial totals dynamically from transactions.
 * Total Balance = Total Income - Total Expenses.
 * @param {Array<object>} transactions
 * @param {string} activeMonthKey YYYY-MM
 */
export function calculateDashboardSummary(transactions, activeMonthKey) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlyIncome = 0;
  let monthlyExpenses = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amt;
      if (tx.date && tx.date.startsWith(activeMonthKey)) {
        monthlyIncome += amt;
      }
    } else {
      totalExpenses += amt;
      if (tx.date && tx.date.startsWith(activeMonthKey)) {
        monthlyExpenses += amt;
      }
    }
  }

  return {
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpenses: Number(totalExpenses.toFixed(2)),
    totalBalance: Number((totalIncome - totalExpenses).toFixed(2)),
    monthlyIncome: Number(monthlyIncome.toFixed(2)),
    monthlyExpenses: Number(monthlyExpenses.toFixed(2)),
  };
}

/**
 * Returns the N most recent transactions sorted newest-first.
 * @param {Array<object>} transactions
 * @param {number} limit
 * @returns {Array<object>}
 */
export function getRecentTransactions(transactions, limit = 6) {
  return [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/**
 * Builds a trailing N-month cashflow series ending at anchorMonthKey.
 * @param {Array<object>} transactions
 * @param {string} anchorMonthKey YYYY-MM
 * @param {number} monthCount
 * @returns {Array<{ key: string, label: string, income: number, expense: number }>}
 */
export function getMonthlyCashflowSeries(
  transactions,
  anchorMonthKey,
  monthCount = 6
) {
  const [y, m] = anchorMonthKey.split('-').map(Number);
  const series = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    const label = d.toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    });
    series.push({ key, label, income: 0, expense: 0 });
  }

  const lookup = new Map(series.map((item) => [item.key, item]));
  for (const tx of transactions) {
    if (!tx.date || tx.date.length < 7) continue;
    const bucket = lookup.get(tx.date.slice(0, 7));
    if (!bucket) continue;
    if (tx.type === 'income') {
      bucket.income += Number(tx.amount) || 0;
    } else {
      bucket.expense += Number(tx.amount) || 0;
    }
  }

  return series.map((item) => ({
    ...item,
    income: Number(item.income.toFixed(2)),
    expense: Number(item.expense.toFixed(2)),
  }));
}

/**
 * Aggregates expense (or income) totals by category, sorted descending.
 * @param {Array<object>} transactions
 * @param {'expense'|'income'} type
 * @param {string|null} monthKey Optional YYYY-MM filter
 * @returns {Array<{ category: string, total: number, percentage: number }>}
 */
export function getCategoryBreakdown(
  transactions,
  type = 'expense',
  monthKey = null
) {
  const totals = new Map();
  let grandTotal = 0;

  for (const tx of transactions) {
    if (tx.type !== type) continue;
    if (monthKey && (!tx.date || !tx.date.startsWith(monthKey))) continue;
    const amt = Number(tx.amount) || 0;
    grandTotal += amt;
    totals.set(tx.category, (totals.get(tx.category) || 0) + amt);
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({
      category,
      total: Number(total.toFixed(2)),
      percentage: grandTotal > 0 ? Number(((total / grandTotal) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Renders the Dashboard Monthly Spending Overview bar chart.
 * @param {Array<object>} series
 */
function renderMonthlyOverviewChart(series) {
  const canvas = document.getElementById('chart-dashboard-monthly');
  const emptyEl = document.getElementById('chart-dashboard-monthly-empty');
  const hasAnyData = series.some((s) => s.income > 0 || s.expense > 0);

  if (monthlyOverviewChart) {
    monthlyOverviewChart.destroy();
    monthlyOverviewChart = null;
  }

  if (!hasAnyData || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    if (typeof window.Chart === 'undefined' && hasAnyData) {
      emptyEl.textContent = 'Chart library unavailable offline.';
    } else {
      emptyEl.textContent = 'Add transactions to see your monthly spending overview.';
    }
    return;
  }

  emptyEl.classList.add('hidden');
  monthlyOverviewChart = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          label: 'Income',
          data: series.map((s) => s.income),
          backgroundColor: '#16A34A',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.68,
        },
        {
          label: 'Expenses',
          data: series.map((s) => s.expense),
          backgroundColor: '#0F172A',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.68,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#475569',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          callbacks: {
            label: (ctx) =>
              ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#F1F5F9' },
          border: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
      },
    },
  });
}

/**
 * Renders the Dashboard Expense Category Breakdown doughnut chart and legend.
 * @param {Array<object>} breakdown
 * @param {string} activeMonth
 */
function renderCategoryBreakdownChart(breakdown, activeMonth) {
  const canvas = document.getElementById('chart-dashboard-categories');
  const emptyEl = document.getElementById('chart-dashboard-categories-empty');
  const legendEl = document.getElementById('dashboard-category-legend');
  const subtitleEl = document.getElementById('dashboard-category-subtitle');

  subtitleEl.textContent = `${formatMonthLabel(activeMonth)} distribution`;

  if (categoryBreakdownChart) {
    categoryBreakdownChart.destroy();
    categoryBreakdownChart = null;
  }

  if (breakdown.length === 0 || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    legendEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  const colors = breakdown.map(
    (_, idx) => CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
  );

  categoryBreakdownChart = new window.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          data: breakdown.map((b) => b.total),
          backgroundColor: colors,
          borderColor: '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const item = breakdown[ctx.dataIndex];
              return ` ${item.category}: ${formatCurrency(item.total)} (${
                item.percentage
              }%)`;
            },
          },
        },
      },
    },
  });

  legendEl.innerHTML = breakdown
    .slice(0, 5)
    .map(
      (item, idx) => `
      <div class="legend-row">
        <span class="legend-name">
          <span class="legend-swatch" style="background-color: ${
            colors[idx]
          }"></span>
          <span>${escapeHtml(item.category)}</span>
        </span>
        <span class="legend-amount tabular-nums">
          ${formatCurrency(item.total)} · ${item.percentage}%
        </span>
      </div>
    `
    )
    .join('');
}

/**
 * Renders the Recent Transactions table inside the Dashboard view.
 * @param {Array<object>} transactions
 * @param {object} handlers
 */
function renderRecentTransactions(transactions, handlers) {
  const container = document.getElementById('dashboard-recent-container');
  const recent = getRecentTransactions(transactions, 6);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="wallet" class="empty-state-icon" aria-hidden="true"></i>
        <h3 class="empty-state-title">No financial activity yet</h3>
        <p class="empty-state-desc">
          Add your first income or expense entry to populate your dashboard metrics and charts.
        </p>
        <button type="button" class="btn-primary" id="dash-empty-add-btn">Add First Transaction</button>
      </div>
    `;
    const btn = document.getElementById('dash-empty-add-btn');
    if (btn) btn.addEventListener('click', handlers.onAddClick);
    return;
  }

  const rowsHtml = recent
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const sign = isIncome ? '+' : '−';
      const amountClass = isIncome ? 'tx-amount-income' : 'tx-amount-expense';
      const typeClass = isIncome ? 'tx-type-income' : 'tx-type-expense';

      return `
        <tr>
          <td>
            <div class="tx-title-cell">
              <span class="tx-title-text">${escapeHtml(tx.title)}</span>
              ${
                tx.description
                  ? `<span class="tx-desc-text">${escapeHtml(
                      tx.description
                    )}</span>`
                  : ''
              }
            </div>
          </td>
          <td class="tx-meta-text">${escapeHtml(tx.category)}</td>
          <td><span class="tx-type-text ${typeClass}">${
        isIncome ? 'Income' : 'Expense'
      }</span></td>
          <td class="tx-meta-text tabular-nums">${escapeHtml(
            formatDisplayDate(tx.date)
          )}</td>
          <td class="col-right tx-amount tabular-nums ${amountClass}">
            ${sign}${formatCurrency(tx.amount)}
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
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renders the full Dashboard view.
 * @param {object} state
 * @param {object} handlers
 */
export function renderDashboardView(state, handlers) {
  const { transactions, activeMonth, budgetStatus, budgetBannerHtml } = state;
  const summary = calculateDashboardSummary(transactions, activeMonth);

  // Budget warning/alert banner on dashboard if active month >= 80%
  document.getElementById('dashboard-budget-banner-slot').innerHTML =
    budgetBannerHtml || '';

  // KPI cards
  const balanceEl = document.getElementById('kpi-total-balance');
  balanceEl.textContent = formatCurrency(summary.totalBalance);
  balanceEl.classList.toggle('is-positive', summary.totalBalance > 0);
  balanceEl.classList.toggle('is-negative', summary.totalBalance < 0);

  document.getElementById(
    'kpi-balance-sub'
  ).textContent = `Income ${formatCurrency(
    summary.totalIncome
  )} − Expenses ${formatCurrency(summary.totalExpenses)}`;

  document.getElementById('kpi-total-income').textContent = formatCurrency(
    summary.totalIncome
  );
  document.getElementById(
    'kpi-income-sub'
  ).textContent = `${formatCurrency(summary.monthlyIncome)} in ${formatMonthLabel(
    activeMonth
  )}`;

  document.getElementById('kpi-total-expenses').textContent = formatCurrency(
    summary.totalExpenses
  );
  document.getElementById(
    'kpi-expenses-sub'
  ).textContent = `${formatCurrency(
    summary.monthlyExpenses
  )} in ${formatMonthLabel(activeMonth)}`;

  document.getElementById('kpi-monthly-spending').textContent = formatCurrency(
    summary.monthlyExpenses
  );

  if (budgetStatus && budgetStatus.budget > 0) {
    document.getElementById(
      'kpi-monthly-sub'
    ).textContent = `${budgetStatus.utilizationPct.toFixed(1)}% of ${formatCurrency(
      budgetStatus.budget
    )} budget`;
  } else {
    document.getElementById('kpi-monthly-sub').textContent = `${formatMonthLabel(
      activeMonth
    )} (no budget set)`;
  }

  // Charts & recent list
  const series = getMonthlyCashflowSeries(transactions, activeMonth, 6);
  renderMonthlyOverviewChart(series);

  const monthBreakdown = getCategoryBreakdown(
    transactions,
    'expense',
    activeMonth
  );
  renderCategoryBreakdownChart(monthBreakdown, activeMonth);

  renderRecentTransactions(transactions, handlers);
}
