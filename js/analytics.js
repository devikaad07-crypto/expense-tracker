/**
 * analytics.js
 * Pure expense analytics calculations and Chart.js visualizations.
 */

import {
  CATEGORY_COLORS,
  getCategoryBreakdown,
  getMonthlyCashflowSeries,
} from './dashboard.js';
import { escapeHtml, formatCurrency } from './transactions.js';

let incomeExpenseChart = null;
let categoryBarChart = null;
let distributionChart = null;

/**
 * Filters transactions according to the selected analytics period.
 * @param {Array<object>} transactions
 * @param {'6m'|'month'|'all'} period
 * @param {string} activeMonthKey YYYY-MM
 * @returns {Array<object>}
 */
export function filterTransactionsByPeriod(
  transactions,
  period,
  activeMonthKey
) {
  if (period === 'month') {
    return transactions.filter(
      (tx) => tx.date && tx.date.startsWith(activeMonthKey)
    );
  }

  if (period === '6m') {
    const [y, m] = activeMonthKey.split('-').map(Number);
    const startDate = new Date(y, m - 6, 1);
    const endDate = new Date(y, m, 0);
    const startKey = `${startDate.getFullYear()}-${String(
      startDate.getMonth() + 1
    ).padStart(2, '0')}`;
    const endKey = `${endDate.getFullYear()}-${String(
      endDate.getMonth() + 1
    ).padStart(2, '0')}`;

    return transactions.filter((tx) => {
      if (!tx.date || tx.date.length < 7) return false;
      const month = tx.date.slice(0, 7);
      return month >= startKey && month <= endKey;
    });
  }

  return [...transactions];
}

/**
 * Computes analytics KPIs and breakdowns for a given period.
 * @param {Array<object>} transactions
 * @param {'6m'|'month'|'all'} period
 * @param {string} activeMonthKey
 */
export function calculateAnalyticsMetrics(
  transactions,
  period,
  activeMonthKey
) {
  const scoped = filterTransactionsByPeriod(
    transactions,
    period,
    activeMonthKey
  );

  let periodIncome = 0;
  let periodExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const tx of scoped) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      periodIncome += amt;
      incomeCount += 1;
    } else {
      periodExpenses += amt;
      expenseCount += 1;
    }
  }

  const totalSavings = Number((periodIncome - periodExpenses).toFixed(2));
  const savingsRate =
    periodIncome > 0
      ? Number(((totalSavings / periodIncome) * 100).toFixed(1))
      : 0;
  const averageExpense =
    expenseCount > 0 ? Number((periodExpenses / expenseCount).toFixed(2)) : 0;

  const breakdown = getCategoryBreakdown(scoped, 'expense', null);
  const topCategory = breakdown.length > 0 ? breakdown[0] : null;

  return {
    scoped,
    periodIncome: Number(periodIncome.toFixed(2)),
    periodExpenses: Number(periodExpenses.toFixed(2)),
    incomeCount,
    expenseCount,
    totalSavings,
    savingsRate,
    averageExpense,
    breakdown,
    topCategory,
  };
}

/**
 * Builds monthly income vs expenses series for the selected analytics timeframe.
 * @param {Array<object>} transactions
 * @param {Array<object>} scoped
 * @param {'6m'|'month'|'all'} period
 * @param {string} activeMonthKey
 */
function buildIncomeVsExpenseSeries(
  transactions,
  scoped,
  period,
  activeMonthKey
) {
  if (period === '6m') {
    return getMonthlyCashflowSeries(transactions, activeMonthKey, 6);
  }
  if (period === 'month') {
    return getMonthlyCashflowSeries(transactions, activeMonthKey, 1);
  }

  // All time: group chronologically across all months present
  const monthMap = new Map();
  for (const tx of scoped) {
    if (!tx.date || tx.date.length < 7) continue;
    const key = tx.date.slice(0, 7);
    if (!monthMap.has(key)) {
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      monthMap.set(key, { key, label, income: 0, expense: 0 });
    }
    const entry = monthMap.get(key);
    if (tx.type === 'income') {
      entry.income += Number(tx.amount) || 0;
    } else {
      entry.expense += Number(tx.amount) || 0;
    }
  }

  return Array.from(monthMap.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((item) => ({
      ...item,
      income: Number(item.income.toFixed(2)),
      expense: Number(item.expense.toFixed(2)),
    }));
}

/**
 * Renders Monthly Income vs Expenses grouped bar chart.
 */
function renderIncomeVsExpenseChart(series) {
  const canvas = document.getElementById('chart-analytics-income-expense');
  const emptyEl = document.getElementById('chart-analytics-ie-empty');

  if (incomeExpenseChart) {
    incomeExpenseChart.destroy();
    incomeExpenseChart = null;
  }

  const hasData = series.some((s) => s.income > 0 || s.expense > 0);
  if (!hasData || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  incomeExpenseChart = new window.Chart(canvas.getContext('2d'), {
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
          categoryPercentage: 0.62,
        },
        {
          label: 'Expenses',
          data: series.map((s) => s.expense),
          backgroundColor: '#DC2626',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.62,
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
 * Renders Category-wise Expense Breakdown horizontal bar chart.
 */
function renderCategoryBarChart(breakdown) {
  const canvas = document.getElementById('chart-analytics-category-bar');
  const emptyEl = document.getElementById('chart-analytics-bar-empty');

  if (categoryBarChart) {
    categoryBarChart.destroy();
    categoryBarChart = null;
  }

  if (breakdown.length === 0 || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  categoryBarChart = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          label: 'Total Spent',
          data: breakdown.map((b) => b.total),
          backgroundColor: breakdown.map(
            (_, idx) => CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
          ),
          borderRadius: 4,
          barThickness: 20,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const item = breakdown[ctx.dataIndex];
              return ` ${formatCurrency(item.total)} (${item.percentage}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#F1F5F9' },
          border: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#0F172A',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
      },
    },
  });
}

/**
 * Renders Spending Distribution doughnut chart & exact share list.
 */
function renderDistributionChart(breakdown) {
  const canvas = document.getElementById('chart-analytics-distribution');
  const emptyEl = document.getElementById('chart-analytics-dist-empty');
  const listEl = document.getElementById('analytics-distribution-list');

  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }

  if (breakdown.length === 0 || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  const colors = breakdown.map(
    (_, idx) => CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
  );

  distributionChart = new window.Chart(canvas.getContext('2d'), {
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
      cutout: '64%',
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

  listEl.innerHTML = breakdown
    .map(
      (item, idx) => `
      <div class="dist-item">
        <div class="dist-item-top">
          <span class="dist-item-label">
            <span class="legend-swatch" style="background-color: ${
              colors[idx]
            }"></span>
            <span>${escapeHtml(item.category)}</span>
          </span>
          <span class="dist-item-val tabular-nums">
            ${formatCurrency(item.total)} · ${item.percentage}%
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${Math.min(
            item.percentage,
            100
          )}%; background-color: ${colors[idx]}"></div>
        </div>
      </div>
    `
    )
    .join('');
}

/**
 * Renders the Analytics view.
 * @param {object} state
 */
export function renderAnalyticsView(state) {
  const { transactions, analyticsPeriod, activeMonth } = state;
  const metrics = calculateAnalyticsMetrics(
    transactions,
    analyticsPeriod,
    activeMonth
  );

  const savingsEl = document.getElementById('analytics-total-savings');
  savingsEl.textContent = formatCurrency(metrics.totalSavings);
  savingsEl.classList.toggle('is-positive', metrics.totalSavings > 0);
  savingsEl.classList.toggle('is-negative', metrics.totalSavings < 0);

  document.getElementById('analytics-savings-rate').textContent =
    metrics.periodIncome > 0
      ? `${metrics.savingsRate.toFixed(1)}% of income saved`
      : 'No income recorded in period';

  const topCatEl = document.getElementById('analytics-top-category');
  const topCatMetaEl = document.getElementById('analytics-top-category-meta');
  if (metrics.topCategory) {
    topCatEl.textContent = metrics.topCategory.category;
    topCatMetaEl.textContent = `${formatCurrency(
      metrics.topCategory.total
    )} (${metrics.topCategory.percentage}% of spend)`;
  } else {
    topCatEl.textContent = '—';
    topCatMetaEl.textContent = 'No expenses recorded';
  }

  document.getElementById('analytics-period-income').textContent =
    formatCurrency(metrics.periodIncome);
  document.getElementById('analytics-income-count').textContent = `${
    metrics.incomeCount
  } ${metrics.incomeCount === 1 ? 'entry' : 'entries'}`;

  document.getElementById('analytics-period-expenses').textContent =
    formatCurrency(metrics.periodExpenses);
  document.getElementById(
    'analytics-avg-expense'
  ).textContent = `${formatCurrency(metrics.averageExpense)} avg per expense`;

  const ieSeries = buildIncomeVsExpenseSeries(
    transactions,
    metrics.scoped,
    analyticsPeriod,
    activeMonth
  );
  renderIncomeVsExpenseChart(ieSeries);
  renderCategoryBarChart(metrics.breakdown);
  renderDistributionChart(metrics.breakdown);
}
