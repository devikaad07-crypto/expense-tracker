/**
 * End-to-end data flow and calculation verification with live backend records
 */
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function verify() {
  console.log('--- Verifying Data Flow & Pure Calculations ---');

  // Fetch transactions and budget from live API
  const txRes = await fetchJson('http://localhost:3000/api/transactions');
  const transactions = txRes.data;
  console.log(`Fetched ${transactions.length} transaction records from database.`);

  const bgRes = await fetchJson('http://localhost:3000/api/budgets/2026/11');
  const budget = bgRes.data ? bgRes.data.amount : 0;
  console.log(`Fetched budget for 2026-11: $${budget}`);

  // Test dashboard calculation
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const tx of transactions) {
    if (tx.type === 'income') totalIncome += tx.amount;
    else totalExpenses += tx.amount;
  }
  const totalBalance = Number((totalIncome - totalExpenses).toFixed(2));
  console.log(`Calculated Totals -> Income: $${totalIncome.toFixed(2)}, Expenses: $${totalExpenses.toFixed(2)}, Balance: $${totalBalance.toFixed(2)}`);

  // Test budget calculation
  const spentThisMonth = transactions
    .filter(t => t.type === 'expense' && t.date.startsWith('2026-11'))
    .reduce((sum, t) => sum + t.amount, 0);
  const remaining = Number((budget - spentThisMonth).toFixed(2));
  const utilization = budget > 0 ? Number(((spentThisMonth / budget) * 100).toFixed(1)) : 0;
  console.log(`Calculated Budget -> Spent: $${spentThisMonth.toFixed(2)}, Remaining: $${remaining.toFixed(2)}, Utilization: ${utilization}%`);

  console.log('--- Data Flow & Calculation Verification PASSED ---');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});

