/**
 * Test Suite for Smart Financial Insights Module
 */
const {
  detectHiddenMoneyLeaks,
  detectSpendingIncreases,
  detectRepeatedPurchases,
  generateSmartSavingSuggestions,
  shiftMonthKey,
} = require('../js/insights.js');

const assert = require('assert');

function runInsightsTests() {
  console.log('\n--- STARTING SMART INSIGHTS ENGINE UNIT TESTS ---\n');

  // Test Dataset
  const sampleTransactions = [
    // Month 2026-11: 6 small Coffee purchases (<= 200) -> should trigger >= 5 leak highlight
    { id: 1, title: 'Coffee & Donut', amount: 4.50, category: 'Food', type: 'expense', date: '2026-11-02' },
    { id: 2, title: 'Coffee & Donut', amount: 5.00, category: 'Food', type: 'expense', date: '2026-11-04' },
    { id: 3, title: 'Coffee & Donut', amount: 4.50, category: 'Food', type: 'expense', date: '2026-11-07' },
    { id: 4, title: 'Coffee & Donut', amount: 4.75, category: 'Food', type: 'expense', date: '2026-11-10' },
    { id: 5, title: 'Coffee & Donut', amount: 5.25, category: 'Food', type: 'expense', date: '2026-11-12' },
    { id: 6, title: 'Coffee & Donut', amount: 5.00, category: 'Food', type: 'expense', date: '2026-11-14' },

    // Month 2026-11: 3 Bookstore purchases (<= 200) -> not >= 5
    { id: 7, title: 'Paperback Novel', amount: 18.00, category: 'Entertainment', type: 'expense', date: '2026-11-03' },
    { id: 8, title: 'Paperback Novel', amount: 15.00, category: 'Entertainment', type: 'expense', date: '2026-11-08' },
    { id: 9, title: 'Paperback Novel', amount: 22.00, category: 'Entertainment', type: 'expense', date: '2026-11-13' },

    // Large transaction (> 200) -> must be excluded from leak detection
    { id: 10, title: 'Apartment Lease', amount: 1450.00, category: 'Housing', type: 'expense', date: '2026-11-01' },

    // Category with surge in 2026-11: Shopping is 500 in Nov vs 100 in Oct
    { id: 11, title: 'Winter Coat', amount: 500.00, category: 'Shopping', type: 'expense', date: '2026-11-05' },
    { id: 12, title: 'Winter Scarf', amount: 100.00, category: 'Shopping', type: 'expense', date: '2026-10-15' },

    // Recurring monthly subscription across 3 months
    { id: 13, title: 'Netflix Premium Subscription', amount: 19.99, category: 'Entertainment', type: 'expense', date: '2026-09-01' },
    { id: 14, title: 'Netflix Premium Subscription', amount: 19.99, category: 'Entertainment', type: 'expense', date: '2026-10-01' },
    { id: 15, title: 'Netflix Premium Subscription', amount: 19.99, category: 'Entertainment', type: 'expense', date: '2026-11-01' },

    // Recurring weekly grocery runs (roughly 7 days apart)
    { id: 16, title: 'Organic Market Groceries', amount: 65.00, category: 'Food', type: 'expense', date: '2026-11-01' },
    { id: 17, title: 'Organic Market Groceries', amount: 68.00, category: 'Food', type: 'expense', date: '2026-11-08' },
    { id: 18, title: 'Organic Market Groceries', amount: 72.00, category: 'Food', type: 'expense', date: '2026-11-15' },
  ];

  // 1. TEST: Hidden Money Leak Detection
  const leaks = detectHiddenMoneyLeaks(sampleTransactions, '2026-11', 200);
  assert(leaks.groups.length >= 2, 'Should group small purchases');
  const coffeeGroup = leaks.groups.find(g => g.normalizedLabel.includes('coffee'));
  assert(coffeeGroup, 'Coffee group must be detected');
  assert.strictEqual(coffeeGroup.count, 6, 'Coffee should have 6 purchases');
  assert.strictEqual(coffeeGroup.isSignificantLeak, true, 'Groups with >= 5 purchases must be highlighted as significant leaks');
  assert.strictEqual(coffeeGroup.totalAmount, 29.00, 'Total coffee spend should be $29.00');

  const bookGroup = leaks.groups.find(g => g.normalizedLabel.includes('paperback'));
  assert(bookGroup, 'Book group must be detected');
  assert.strictEqual(bookGroup.count, 3, 'Books should have 3 purchases');
  assert.strictEqual(bookGroup.isSignificantLeak, false, 'Groups with < 5 purchases should not be flagged as significant leaks');
  console.log('PASS: Hidden Money Leak Detection correctly identified frequent micro-spending (>=5 highlight)');

  // 2. TEST: Spending Increase Detection
  const increases = detectSpendingIncreases(sampleTransactions, '2026-11');
  const shoppingIncrease = increases.find(i => i.category === 'Shopping');
  assert(shoppingIncrease, 'Shopping increase must be present');
  assert.strictEqual(shoppingIncrease.percentageChange, 400, 'Shopping increased from 100 to 500 (+400%)');
  assert.strictEqual(shoppingIncrease.isSignificantIncrease, true, 'Surge >= 20% must be flagged');
  assert(shoppingIncrease.explanation.includes('Shopping spending rose by 400%'), 'Human explanation must be generated');

  // Test division-by-zero protection on brand-new category (Housing exists in Nov but 0 in Oct)
  const housingIncrease = increases.find(i => i.category === 'Housing');
  assert(housingIncrease, 'Housing category must be present');
  assert.strictEqual(housingIncrease.isNewCategory, true, 'Zero previous spend handled as new category without error');
  assert(!isNaN(housingIncrease.percentageChange), 'Percentage change must not be NaN or Infinity');
  console.log('PASS: Spending Increase Detection month-over-month calculation is division-by-zero safe');

  // 3. TEST: Repeated Purchase & Cadence Detection
  const repeated = detectRepeatedPurchases(sampleTransactions, '2026-11');
  const netflix = repeated.find(r => r.title.includes('Netflix'));
  assert(netflix, 'Netflix must be identified');
  assert.strictEqual(netflix.isConfirmedSubscription, true, 'Monthly fixed subscription must be classified as subscription');
  assert(netflix.patternType.includes('Monthly'), 'Monthly cadence must be detected from 30-day intervals');

  const grocery = repeated.find(r => r.title.includes('Groceries'));
  assert(grocery, 'Weekly groceries must be identified');
  assert(grocery.patternType.includes('Weekly'), 'Weekly cadence must be detected from 7-day intervals');
  console.log('PASS: Repeated Purchase Detection identified weekly habits and monthly subscriptions');

  // 4. TEST: Smart Saving Suggestions
  const suggestions = generateSmartSavingSuggestions(sampleTransactions, '2026-11', 200);
  assert(suggestions.length >= 2, 'Should generate actionable suggestions');
  const leakSuggestion = suggestions.find(s => s.type === 'leak');
  assert(leakSuggestion, 'Should suggest reducing coffee leak');
  assert.strictEqual(leakSuggestion.savingsProjection10, 2.90, '10% of $29 is $2.90');
  assert.strictEqual(leakSuggestion.savingsProjection20, 5.80, '20% of $29 is $5.80');
  console.log('PASS: Smart Saving Suggestions calculated 10% and 20% projections from real data');

  console.log('\n--- ALL SMART INSIGHTS ENGINE UNIT TESTS PASSED (4/4) ---\n');
}

runInsightsTests();

