/**
 * insights.js
 * Pure financial intelligence engine & UI controller.
 * Features:
 * 1. Hidden Money Leak Detection (frequent small purchases, configurable threshold, >= 5 transactions highlight)
 * 2. Spending Increase Detection (month-over-month category comparison, division-by-zero safe, plain-English explanations)
 * 3. Repeated Purchase Detection (weekly/monthly cadences, suspected recurring vs confirmed subscriptions, deduplicated)
 * 4. Smart Saving Suggestions (10%/20% savings projections from real data with non-guaranteed disclaimers)
 */

import { formatCurrency, formatMonthLabel, escapeHtml } from './transactions.js';

/**
 * Normalizes description or title for robust grouping.
 * Strips leading/trailing punctuation and standardizes common merchant/item names.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSpendingDescriptor(text) {
  if (!text || typeof text !== 'string') return 'General';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Shifts a YYYY-MM month string by delta months.
 * @param {string} monthKey
 * @param {number} delta
 * @returns {string}
 */
export function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 1. Hidden Money Leak Detection
 * Identifies frequent small purchases that collectively consume significant money.
 * @param {Array<object>} transactions
 * @param {string} monthKey YYYY-MM
 * @param {number} threshold Default 200
 * @returns {{ groups: Array<object>, totalLeaked: number, flaggedGroupsCount: number, threshold: number }}
 */
export function detectHiddenMoneyLeaks(transactions, monthKey, threshold = 200) {
  const safeThreshold = Number(threshold) > 0 ? Number(threshold) : 200;

  // Filter expenses in the target month that are <= threshold
  const smallExpenses = transactions.filter(
    (tx) =>
      tx.type === 'expense' &&
      tx.date &&
      tx.date.startsWith(monthKey) &&
      Number(tx.amount) <= safeThreshold
  );

  // Group by category and normalized title
  const groupsMap = new Map();

  for (const tx of smallExpenses) {
    const rawDesc = tx.description ? tx.description.trim() : '';
    const normTitle = normalizeSpendingDescriptor(tx.title);
    const groupKey = `${tx.category}:::${normTitle}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, {
        key: groupKey,
        category: tx.category,
        label: tx.title,
        normalizedLabel: normTitle,
        count: 0,
        totalAmount: 0,
        transactions: [],
      });
    }

    const group = groupsMap.get(groupKey);
    group.count += 1;
    group.totalAmount += Number(tx.amount) || 0;
    group.transactions.push(tx);
  }

  const groups = Array.from(groupsMap.values()).map((g) => ({
    ...g,
    totalAmount: Number(g.totalAmount.toFixed(2)),
    averageAmount: Number((g.totalAmount / g.count).toFixed(2)),
    isSignificantLeak: g.count >= 5, // Highlight groups with at least 5 purchases
  }));

  // Sort groups: flagged significant leaks first, then highest total spend
  groups.sort((a, b) => {
    if (a.isSignificantLeak !== b.isSignificantLeak) {
      return a.isSignificantLeak ? -1 : 1;
    }
    return b.totalAmount - a.totalAmount;
  });

  const totalLeaked = Number(
    groups.reduce((sum, g) => sum + g.totalAmount, 0).toFixed(2)
  );

  const flaggedGroupsCount = groups.filter((g) => g.isSignificantLeak).length;

  return {
    groups,
    totalLeaked,
    flaggedGroupsCount,
    threshold: safeThreshold,
    monthKey,
  };
}

/**
 * 2. Spending Increase Detection
 * Compares current month's expenses against the previous month, category by category.
 * Handles division-by-zero and zero previous spending cleanly.
 * @param {Array<object>} transactions
 * @param {string} currentMonthKey YYYY-MM
 * @returns {Array<object>}
 */
export function detectSpendingIncreases(transactions, currentMonthKey) {
  const previousMonthKey = shiftMonthKey(currentMonthKey, -1);

  const currentSpendByCategory = new Map();
  const prevSpendByCategory = new Map();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date) continue;
    const amt = Number(tx.amount) || 0;

    if (tx.date.startsWith(currentMonthKey)) {
      currentSpendByCategory.set(
        tx.category,
        (currentSpendByCategory.get(tx.category) || 0) + amt
      );
    } else if (tx.date.startsWith(previousMonthKey)) {
      prevSpendByCategory.set(
        tx.category,
        (prevSpendByCategory.get(tx.category) || 0) + amt
      );
    }
  }

  // Combine all categories present in either month
  const allCategories = Array.from(
    new Set([...currentSpendByCategory.keys(), ...prevSpendByCategory.keys()])
  );

  const comparison = allCategories.map((category) => {
    const current = Number((currentSpendByCategory.get(category) || 0).toFixed(2));
    const previous = Number((prevSpendByCategory.get(category) || 0).toFixed(2));
    const difference = Number((current - previous).toFixed(2));

    let percentageChange = 0;
    let isNewCategory = false;
    let explanation = '';

    if (previous > 0) {
      // Safe percentage calculation: avoids division by zero
      percentageChange = Number((((current - previous) / previous) * 100).toFixed(1));
      if (percentageChange > 0) {
        explanation = `${category} spending rose by ${percentageChange}% (+${formatCurrency(
          difference
        )}) compared to ${formatMonthLabel(previousMonthKey)} (${formatCurrency(
          previous
        )} vs ${formatCurrency(current)}).`;
      } else if (percentageChange < 0) {
        explanation = `${category} spending dropped by ${Math.abs(
          percentageChange
        )}% (−${formatCurrency(Math.abs(difference))}) compared to ${formatMonthLabel(
          previousMonthKey
        )}.`;
      } else {
        explanation = `${category} spending remained flat compared to last month.`;
      }
    } else if (current > 0) {
      // Previous month had 0 spending
      isNewCategory = true;
      percentageChange = 100;
      explanation = `New spending of ${formatCurrency(
        current
      )} in ${category} with no expenses recorded in ${formatMonthLabel(
        previousMonthKey
      )}.`;
    } else {
      explanation = `No expenses recorded in ${category} for either month.`;
    }

    const isSignificantIncrease =
      (percentageChange >= 20 && difference >= 25) || (isNewCategory && current >= 50);

    return {
      category,
      current,
      previous,
      difference,
      percentageChange,
      isNewCategory,
      isSignificantIncrease,
      explanation,
    };
  });

  // Sort: significant increases first, then highest difference
  return comparison.sort((a, b) => {
    if (a.isSignificantIncrease !== b.isSignificantIncrease) {
      return a.isSignificantIncrease ? -1 : 1;
    }
    return b.difference - a.difference;
  });
}

/**
 * 3. Repeated Purchase & Cadence Detection
 * Detects repeated spending patterns, identifies weekly or monthly rhythms,
 * and distinguishes suspected recurring purchases from confirmed subscriptions.
 * @param {Array<object>} transactions
 * @param {string} [activeMonthKey]
 * @returns {Array<object>}
 */
export function detectRepeatedPurchases(transactions, activeMonthKey = null) {
  // Group all expenses across history by title/descriptor + category
  const groups = new Map();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date) continue;
    const norm = normalizeSpendingDescriptor(tx.title);
    const key = `${tx.category}:::${norm}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        category: tx.category,
        title: tx.title,
        normalized: norm,
        items: [],
      });
    }
    groups.get(key).items.push(tx);
  }

  const results = [];

  const subscriptionKeywords = [
    'subscription',
    'netflix',
    'spotify',
    'prime',
    'hulu',
    'disney',
    'gym',
    'fitness',
    'lease',
    'rent',
    'internet',
    'broadband',
    'mobile',
    'utility',
    'bill',
    'cloud',
    'hosting',
    'saas',
  ];

  for (const group of groups.values()) {
    if (group.items.length < 2) continue; // Must have at least 2 occurrences

    // Sort chronologically
    const sorted = [...group.items].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((item) => new Date(item.date).getTime());
    const amounts = sorted.map((item) => Number(item.amount));

    // Calculate intervals between consecutive occurrences in days
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const diffDays = Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) intervals.push(diffDays);
    }

    const avgInterval =
      intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 0;

    let patternType = 'Variable Rhythms';
    let isCadenceDetected = false;

    if (intervals.length >= 1) {
      if (avgInterval >= 5 && avgInterval <= 9) {
        patternType = 'Weekly Cadence';
        isCadenceDetected = true;
      } else if (avgInterval >= 12 && avgInterval <= 16) {
        patternType = 'Bi-Weekly Cadence';
        isCadenceDetected = true;
      } else if (avgInterval >= 25 && avgInterval <= 35) {
        patternType = 'Monthly Cadence';
        isCadenceDetected = true;
      }
    }

    // Amount consistency check: are all charges nearly identical?
    const minAmt = Math.min(...amounts);
    const maxAmt = Math.max(...amounts);
    const isAmountFixed = (maxAmt - minAmt) <= 2.0;

    // Subscription detection heuristic
    const titleLower = group.title.toLowerCase();
    const isSubscriptionName = subscriptionKeywords.some((kw) => titleLower.includes(kw));
    const isConfirmedSubscription =
      (isCadenceDetected && isAmountFixed) ||
      (isSubscriptionName && sorted.length >= 2) ||
      (patternType === 'Monthly Cadence' && isAmountFixed);

    const totalSpent = Number(amounts.reduce((a, b) => a + b, 0).toFixed(2));
    const avgAmount = Number((totalSpent / sorted.length).toFixed(2));

    // If filtered to activeMonthKey, check if there is activity in this month
    const inActiveMonth = activeMonthKey
      ? sorted.some((item) => item.date.startsWith(activeMonthKey))
      : true;

    results.push({
      key: group.key,
      title: group.title,
      category: group.category,
      frequency: sorted.length,
      avgAmount,
      totalSpent,
      avgIntervalDays: avgInterval,
      patternType,
      isCadenceDetected,
      isConfirmedSubscription,
      kind: isConfirmedSubscription ? 'Subscription' : 'Recurring Habit',
      lastDate: sorted[sorted.length - 1].date,
      inActiveMonth,
    });
  }

  // Sort: Confirmed subscriptions and high frequency first
  return results.sort((a, b) => {
    if (a.isConfirmedSubscription !== b.isConfirmedSubscription) {
      return a.isConfirmedSubscription ? -1 : 1;
    }
    return b.frequency - a.frequency;
  });
}

/**
 * 4. Smart Saving Suggestions
 * Synthesizes data-backed recommendations based on real leaks, increases, and habits.
 * Disclaims all estimates as projections, not guarantees.
 * @param {Array<object>} transactions
 * @param {string} monthKey
 * @param {number} leakThreshold
 * @returns {Array<object>}
 */
export function generateSmartSavingSuggestions(transactions, monthKey, leakThreshold = 200) {
  const leaks = detectHiddenMoneyLeaks(transactions, monthKey, leakThreshold);
  const increases = detectSpendingIncreases(transactions, monthKey);
  const repeated = detectRepeatedPurchases(transactions, monthKey);

  const suggestions = [];

  // Suggestion 1: Hidden Leaks / Frequent micro-spending
  const significantLeaks = leaks.groups.filter((g) => g.isSignificantLeak);
  if (significantLeaks.length > 0) {
    const topLeak = significantLeaks[0];
    const pot10 = Number((topLeak.totalAmount * 0.1).toFixed(2));
    const pot20 = Number((topLeak.totalAmount * 0.2).toFixed(2));

    suggestions.push({
      id: 'leak-cut',
      type: 'leak',
      priority: 'high',
      title: `Optimize Frequent "${topLeak.label}" Purchases`,
      summary: `You made ${topLeak.count} small ${topLeak.category} purchases totaling ${formatCurrency(
        topLeak.totalAmount
      )} in ${formatMonthLabel(monthKey)}.`,
      action: `Reducing this frequency by just 1 or 2 purchases a week could lower monthly outflows significantly.`,
      savingsProjection10: pot10,
      savingsProjection20: pot20,
      projectionText: `Estimated potential savings: ${formatCurrency(
        pot10
      )}/mo at −10%, or ${formatCurrency(pot20)}/mo at −20%.`,
    });
  }

  // Suggestion 2: Top category spending surge
  const topSurge = increases.find((i) => i.isSignificantIncrease && i.difference > 0);
  if (topSurge) {
    const reversionSavings = Number((topSurge.difference * 0.5).toFixed(2));
    suggestions.push({
      id: 'surge-control',
      type: 'surge',
      priority: 'medium',
      title: `Audit "${topSurge.category}" Spending Increase`,
      summary: topSurge.explanation,
      action: `Check recent receipts in ${topSurge.category} to identify non-essential or one-off spikes.`,
      savingsProjection10: Number((topSurge.current * 0.1).toFixed(2)),
      savingsProjection20: Number((topSurge.current * 0.2).toFixed(2)),
      projectionText: `Trimming ${topSurge.category} by 10% could recover an estimated ${formatCurrency(
        topSurge.current * 0.1
      )} this month.`,
    });
  }

  // Suggestion 3: Recurring subscriptions audit
  const subscriptions = repeated.filter((r) => r.isConfirmedSubscription);
  if (subscriptions.length > 0) {
    const monthlyTotal = Number(
      subscriptions.reduce((sum, s) => sum + s.avgAmount, 0).toFixed(2)
    );
    const annualPotential = Number((monthlyTotal * 12).toFixed(2));

    suggestions.push({
      id: 'subscription-audit',
      type: 'subscription',
      priority: 'medium',
      title: `Review Active Subscriptions (${subscriptions.length} detected)`,
      summary: `Identified recurring charges including ${subscriptions
        .slice(0, 3)
        .map((s) => s.title)
        .join(', ')} totaling ~${formatCurrency(monthlyTotal)}/month.`,
      action: `Audit for streaming, gym, or software plans you haven't used this month.`,
      savingsProjection10: Number((monthlyTotal * 0.1).toFixed(2)),
      savingsProjection20: Number((monthlyTotal * 0.2).toFixed(2)),
      projectionText: `Canceling just one unused $15 service could save an estimated ${formatCurrency(
        180
      )} annually.`,
    });
  }

  // Fallback suggestion if spending is minimal or new
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'general-prudence',
      type: 'general',
      priority: 'low',
      title: 'Maintain Healthy Spending Cadence',
      summary: `Your spending in ${formatMonthLabel(monthKey)} exhibits stable patterns with no glaring leaks or surges.`,
      action: 'Keep logging daily transactions to build deeper statistical patterns for upcoming months.',
      savingsProjection10: 0,
      savingsProjection20: 0,
      projectionText: 'Projections will automatically populate as more transaction history accumulates.',
    });
  }

  return suggestions;
}

/**
 * Renders the Smart Financial Insights View into `#view-insights`.
 * @param {object} state
 * @param {object} handlers
 */
export function renderInsightsView(state, handlers) {
  const { transactions, activeMonth } = state;
  const monthLabel = formatMonthLabel(activeMonth);

  const container = document.getElementById('view-insights');
  if (!container) return;

  const threshold = state.leakThreshold || 200;
  const leaks = detectHiddenMoneyLeaks(transactions, activeMonth, threshold);
  const increases = detectSpendingIncreases(transactions, activeMonth);
  const repeated = detectRepeatedPurchases(transactions, activeMonth);
  const suggestions = generateSmartSavingSuggestions(transactions, activeMonth, threshold);

  container.innerHTML = `
    <div class="section-toolbar">
      <div>
        <h2 class="section-heading">Smart Financial Insights</h2>
        <p class="section-subheading">
          Automated money leak detection, month-over-month surge tracking, and habit analysis for ${escapeHtml(
            monthLabel
          )}.
        </p>
      </div>
      <div class="filter-controls">
        <label for="input-leak-threshold" class="form-label" style="margin: 0; font-size: 12px; color: var(--ink-secondary);">
          Leak Threshold:
        </label>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input
            type="number"
            id="input-leak-threshold"
            class="form-control tabular-nums"
            style="width: 100px; padding: 6px 8px; height: 32px;"
            value="${threshold}"
            min="1"
            step="10"
            aria-label="Configurable small purchase leak threshold"
          />
          <button type="button" class="btn-secondary btn-xs" id="btn-apply-threshold">Apply</button>
        </div>
      </div>
    </div>

    <!-- Insights Metric Strip -->
    <div class="kpi-grid">
      <article class="surface-card kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Hidden Leaks Total</span>
          <i data-lucide="droplets" class="kpi-icon kpi-icon-expense" aria-hidden="true"></i>
        </div>
        <p class="kpi-value tabular-nums">${formatCurrency(leaks.totalLeaked)}</p>
        <p class="kpi-subtext tabular-nums">
          ${leaks.flaggedGroupsCount} frequent groups (≤ ${formatCurrency(threshold)})
        </p>
      </article>

      <article class="surface-card kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Surging Categories</span>
          <i data-lucide="trending-up" class="kpi-icon kpi-icon-expense" aria-hidden="true"></i>
        </div>
        <p class="kpi-value tabular-nums">
          ${increases.filter((i) => i.isSignificantIncrease).length}
        </p>
        <p class="kpi-subtext">Categories up ≥ 20% vs prior month</p>
      </article>

      <article class="surface-card kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Repeated Patterns</span>
          <i data-lucide="repeat" class="kpi-icon kpi-icon-income" aria-hidden="true"></i>
        </div>
        <p class="kpi-value tabular-nums">${repeated.length}</p>
        <p class="kpi-subtext">
          ${repeated.filter((r) => r.isConfirmedSubscription).length} active subscriptions detected
        </p>
      </article>

      <article class="surface-card kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Est. Potential Savings</span>
          <i data-lucide="piggy-bank" class="kpi-icon kpi-icon-income" aria-hidden="true"></i>
        </div>
        <p class="kpi-value tabular-nums" style="color: var(--status-income);">
          ${formatCurrency(
            suggestions.reduce((sum, s) => sum + (s.savingsProjection10 || 0), 0)
          )}
        </p>
        <p class="kpi-subtext">Illustrative 10% trim across leaks & surges</p>
      </article>
    </div>

    <!-- Core Insights Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; margin-top: 20px;">
      
      <!-- 1. Hidden Money Leak Detection Card -->
      <article class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">1. Hidden Money Leak Detection</h3>
            <p class="card-subtitle">
              Frequent small purchases (≤ ${formatCurrency(threshold)}) that add up quietly
            </p>
          </div>
          <span class="tabular-nums" style="font-size: 12px; font-weight: 600; color: var(--status-expense);">
            Total: ${formatCurrency(leaks.totalLeaked)}
          </span>
        </div>

        ${
          leaks.groups.length === 0
            ? `
          <div class="empty-state">
            <i data-lucide="check-circle" class="empty-state-icon" style="color: var(--status-income);" aria-hidden="true"></i>
            <h4 class="empty-state-title">No hidden money leaks detected</h4>
            <p class="empty-state-desc">No small purchases under ${formatCurrency(threshold)} found in ${escapeHtml(monthLabel)}.</p>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>Purchase Group</th>
                  <th>Category</th>
                  <th class="col-right">Frequency</th>
                  <th class="col-right">Total Spent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${leaks.groups
                  .map(
                    (g) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(g.label)}</strong>
                      <span class="tx-desc-text tabular-nums">avg ${formatCurrency(g.averageAmount)} / purchase</span>
                    </td>
                    <td class="tx-meta-text">${escapeHtml(g.category)}</td>
                    <td class="col-right tabular-nums"><strong>${g.count}×</strong></td>
                    <td class="col-right tabular-nums tx-amount-expense"><strong>${formatCurrency(g.totalAmount)}</strong></td>
                    <td>
                      ${
                        g.isSignificantLeak
                          ? `<span class="tx-type-text tx-type-expense" title="At least 5 transactions in this month">Frequent Leak (≥5)</span>`
                          : `<span class="tx-type-text" style="background: var(--bg-subtle); color: var(--ink-secondary);">Normal</span>`
                      }
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
        }
      </article>

      <!-- 2. Spending Increase Detection Card -->
      <article class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">2. Spending Increase Detection</h3>
            <p class="card-subtitle">
              Month-over-month category variance vs. ${escapeHtml(
                formatMonthLabel(shiftMonthKey(activeMonth, -1))
              )}
            </p>
          </div>
        </div>

        ${
          increases.length === 0
            ? `
          <div class="empty-state">
            <i data-lucide="info" class="empty-state-icon" aria-hidden="true"></i>
            <h4 class="empty-state-title">Insufficient comparison data</h4>
            <p class="empty-state-desc">Record expenses in consecutive months to view spending increase metrics.</p>
          </div>
        `
            : `
          <div style="display: flex; flex-direction: column; gap: 12px; padding: 14px 16px;">
            ${increases
              .map((inc) => {
                const isUp = inc.difference > 0;
                const badgeClass = inc.isSignificantIncrease
                  ? 'alert-banner alert-banner-exceeded'
                  : isUp
                  ? 'alert-banner alert-banner-warning'
                  : 'alert-banner';

                const pctText = inc.isNewCategory
                  ? 'New Category'
                  : `${isUp ? '+' : ''}${inc.percentageChange}%`;

                return `
                <div style="padding: 12px; border: 1px solid var(--border-hairline); border-radius: var(--radius-sm); background: ${
                  inc.isSignificantIncrease ? 'var(--status-expense-bg)' : 'var(--bg-surface)'
                };">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <strong style="font-size: 14px;">${escapeHtml(inc.category)}</strong>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="tabular-nums" style="font-weight: 600; color: ${
                        isUp ? 'var(--status-expense)' : 'var(--status-income)'
                      };">
                        ${isUp ? '+' : '−'}${formatCurrency(Math.abs(inc.difference))}
                      </span>
                      <span class="tx-type-text ${isUp ? 'tx-type-expense' : 'tx-type-income'}">
                        ${pctText}
                      </span>
                    </div>
                  </div>
                  <p style="font-size: 12.5px; color: var(--ink-secondary); line-height: 1.4;">
                    ${escapeHtml(inc.explanation)}
                  </p>
                </div>
              `;
              })
              .join('')}
          </div>
        `
        }
      </article>

      <!-- 3. Repeated Purchase Detection Card -->
      <article class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">3. Repeated Purchase & Cadence Detection</h3>
            <p class="card-subtitle">
              Frequent purchases, weekly rhythms & subscriptions
            </p>
          </div>
        </div>

        ${
          repeated.length === 0
            ? `
          <div class="empty-state">
            <i data-lucide="repeat" class="empty-state-icon" aria-hidden="true"></i>
            <h4 class="empty-state-title">No repeated purchase patterns yet</h4>
            <p class="empty-state-desc">As you log more transactions over time, automatic weekly and monthly cadence detection will appear here.</p>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>Item / Merchant</th>
                  <th>Category</th>
                  <th>Cadence</th>
                  <th class="col-right">Avg Amount</th>
                  <th class="col-right">Frequency</th>
                </tr>
              </thead>
              <tbody>
                ${repeated
                  .map(
                    (r) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(r.title)}</strong>
                      ${
                        r.isConfirmedSubscription
                          ? `<span class="tx-type-text tx-type-income" style="margin-left: 6px; font-size: 10px;">Subscription</span>`
                          : `<span class="tx-type-text" style="background: var(--bg-subtle); margin-left: 6px; font-size: 10px;">Habit</span>`
                      }
                    </td>
                    <td class="tx-meta-text">${escapeHtml(r.category)}</td>
                    <td>
                      <span style="font-size: 12px; font-weight: 500; color: var(--ink-secondary);">
                        ${escapeHtml(r.patternType)}
                        ${r.avgIntervalDays > 0 ? ` (~${r.avgIntervalDays}d)` : ''}
                      </span>
                    </td>
                    <td class="col-right tabular-nums"><strong>${formatCurrency(r.avgAmount)}</strong></td>
                    <td class="col-right tabular-nums">${r.frequency}×</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
        }
      </article>

      <!-- 4. Smart Saving Suggestions Card -->
      <article class="surface-card">
        <div class="card-header">
          <div>
            <h3 class="card-title">4. Smart Saving Suggestions</h3>
            <p class="card-subtitle">
              Actionable opportunities calculated directly from your real spending data
            </p>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px; padding: 16px;">
          ${suggestions
            .map(
              (s) => `
            <div style="border: 1px solid var(--border-hairline); border-radius: var(--radius-md); padding: 14px; background: var(--bg-surface);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;">
                <h4 style="font-size: 13.5px; font-weight: 600; color: var(--ink-primary); margin: 0;">
                  ${escapeHtml(s.title)}
                </h4>
                <span class="tx-type-text ${s.priority === 'high' ? 'tx-type-expense' : 'tx-type-income'}">
                  ${s.priority.toUpperCase()}
                </span>
              </div>
              <p style="font-size: 12.5px; color: var(--ink-secondary); margin-bottom: 8px;">
                ${escapeHtml(s.summary)}
              </p>
              <div style="padding: 8px 10px; border-radius: var(--radius-sm); background: var(--bg-subtle); font-size: 12px; color: var(--ink-primary); margin-bottom: 8px;">
                <strong>Recommendation:</strong> ${escapeHtml(s.action)}
              </div>
              <div style="font-size: 12px; color: var(--status-income); font-weight: 600;">
                <i data-lucide="sparkles" class="icon-sm" style="display: inline-block; vertical-align: middle; margin-right: 4px;" aria-hidden="true"></i>
                ${escapeHtml(s.projectionText)}
              </div>
            </div>
          `
            )
            .join('')}

          <div style="margin-top: 8px; padding: 10px 12px; border-radius: var(--radius-sm); background: #f8fafc; border: 1px dashed var(--border-hairline); font-size: 11px; color: var(--ink-muted); line-height: 1.4;">
            <i data-lucide="info" class="icon-sm" style="display: inline-block; vertical-align: middle; margin-right: 4px;" aria-hidden="true"></i>
            <strong>Transparency Notice:</strong> All potential savings figures shown are illustrative projections calculated from your historical transaction frequency and amounts. Projections do not constitute guaranteed savings.
          </div>
        </div>
      </article>

    </div>
  `;

  // Attach event listener to threshold apply button
  const applyBtn = document.getElementById('btn-apply-threshold');
  const threshInput = document.getElementById('input-leak-threshold');
  if (applyBtn && threshInput) {
    applyBtn.addEventListener('click', () => {
      const val = Number(threshInput.value);
      if (val > 0) {
        handlers.onThresholdChange(val);
      }
    });
  }
}

