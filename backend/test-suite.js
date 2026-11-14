/**
 * Automated Test Suite for Expense Tracker REST API
 */
const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const results = [];

  async function test(name, fn) {
    try {
      const res = await fn();
      results.push({ name, pass: true, details: res });
      console.log(`PASS: ${name}`);
    } catch (err) {
      results.push({ name, pass: false, error: err.message, details: err });
      console.error(`FAIL: ${name} - ${err.message}`);
    }
  }

  console.log('\n--- STARTING REST API TEST SUITE ---\n');

  // 1. Health check
  await test('GET /api/health returns status ok', async () => {
    const res = await request('GET', '/api/health');
    if (res.status !== 200 || res.body.status !== 'ok') {
      throw new Error(`Expected status 200 and body.status ok, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Status: ${res.status}, body: ${JSON.stringify(res.body)}`;
  });

  // 2. Static frontend serving
  await test('GET / returns index.html', async () => {
    const res = await request('GET', '/');
    if (res.status !== 200 || typeof res.body !== 'string' || !res.body.includes('<title>ClearLedger')) {
      throw new Error(`Expected HTML containing ClearLedger, got status ${res.status}`);
    }
    return `Status 200, HTML contains ClearLedger title`;
  });

  // 3. Transactions - GET all
  let initialTxList;
  await test('GET /api/transactions returns array of transactions', async () => {
    const res = await request('GET', '/api/transactions');
    if (res.status !== 200 || !res.body.success || !Array.isArray(res.body.data)) {
      throw new Error(`Expected 200 with data array, got ${res.status}`);
    }
    initialTxList = res.body.data;
    return `Status 200, count: ${res.body.data.length}`;
  });

  // 4. Transactions - POST valid income
  let incomeTxId;
  await test('POST /api/transactions creates valid income', async () => {
    const payload = {
      title: 'Consulting Project',
      amount: 1250.50,
      category: 'Freelance',
      type: 'income',
      date: '2026-11-14',
      description: 'Q4 Frontend Work',
    };
    const res = await request('POST', '/api/transactions', payload);
    if (res.status !== 201 || !res.body.success || !res.body.data.id) {
      throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    incomeTxId = res.body.data.id;
    if (res.body.data.amount !== 1250.50 || res.body.data.type !== 'income') {
      throw new Error(`Data mismatch: ${JSON.stringify(res.body.data)}`);
    }
    return `Created ID ${incomeTxId}, amount: ${res.body.data.amount}`;
  });

  // 5. Transactions - POST valid expense
  let expenseTxId;
  await test('POST /api/transactions creates valid expense', async () => {
    const payload = {
      title: 'Ergonomic Desk Chair',
      amount: 289.99,
      category: 'Shopping',
      type: 'expense',
      date: '2026-11-14',
      description: 'Home office improvement',
    };
    const res = await request('POST', '/api/transactions', payload);
    if (res.status !== 201 || !res.body.success || !res.body.data.id) {
      throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    expenseTxId = res.body.data.id;
    return `Created ID ${expenseTxId}, amount: ${res.body.data.amount}`;
  });

  // 6. Transactions - GET by ID
  await test('GET /api/transactions/:id returns the created transaction', async () => {
    const res = await request('GET', `/api/transactions/${incomeTxId}`);
    if (res.status !== 200 || !res.body.success || res.body.data.id !== incomeTxId) {
      throw new Error(`Expected 200 with ID ${incomeTxId}, got ${res.status}`);
    }
    return `Found transaction ${res.body.data.title}`;
  });

  // 7. Transactions - GET invalid ID (non-numeric)
  await test('GET /api/transactions/abc returns 400 bad request', async () => {
    const res = await request('GET', '/api/transactions/abc');
    if (res.status !== 400 || res.body.success !== false) {
      throw new Error(`Expected 400 Bad Request, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Status 400: ${res.body.error}`;
  });

  // 8. Transactions - GET non-existent ID
  await test('GET /api/transactions/999999 returns 404 not found', async () => {
    const res = await request('GET', '/api/transactions/999999');
    if (res.status !== 404 || res.body.success !== false) {
      throw new Error(`Expected 404 Not Found, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Status 404: ${res.body.error}`;
  });

  // 9. Validation: POST missing title
  await test('POST /api/transactions with missing title returns 400', async () => {
    const res = await request('POST', '/api/transactions', {
      amount: 50,
      category: 'Food',
      type: 'expense',
      date: '2026-11-14',
    });
    if (res.status !== 400 || res.body.success !== false) {
      throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    }
    return `Status 400: ${res.body.error}`;
  });

  // 10. Validation: POST negative amount
  await test('POST /api/transactions with negative amount returns 400', async () => {
    const res = await request('POST', '/api/transactions', {
      title: 'Test',
      amount: -25,
      category: 'Food',
      type: 'expense',
      date: '2026-11-14',
    });
    if (res.status !== 400 || res.body.success !== false) {
      throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    }
    return `Status 400: ${res.body.error}`;
  });

  // 11. Validation: POST wrong type
  await test('POST /api/transactions with invalid type returns 400', async () => {
    const res = await request('POST', '/api/transactions', {
      title: 'Test',
      amount: 25,
      category: 'Food',
      type: 'loan',
      date: '2026-11-14',
    });
    if (res.status !== 400 || res.body.success !== false) {
      throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    }
    return `Status 400: ${res.body.error}`;
  });

  // 12. Validation: POST invalid date format
  await test('POST /api/transactions with invalid date format returns 400', async () => {
    const res = await request('POST', '/api/transactions', {
      title: 'Test',
      amount: 25,
      category: 'Food',
      type: 'expense',
      date: '14-11-2026',
    });
    if (res.status !== 400 || res.body.success !== false) {
      throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    }
    return `Status 400: ${res.body.error}`;
  });

  // 13. Transactions - PUT update
  await test('PUT /api/transactions/:id updates existing transaction', async () => {
    const res = await request('PUT', `/api/transactions/${expenseTxId}`, {
      title: 'Ergonomic Desk Chair Pro',
      amount: 320.00,
      category: 'Shopping',
      type: 'expense',
      date: '2026-11-14',
      description: 'Upgraded version with lumbar support',
    });
    if (res.status !== 200 || !res.body.success || res.body.data.amount !== 320.00 || res.body.data.title !== 'Ergonomic Desk Chair Pro') {
      throw new Error(`Expected 200 with updated fields, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Updated ID ${expenseTxId} title to "${res.body.data.title}"`;
  });

  // 14. Transactions - PUT non-existent ID
  await test('PUT /api/transactions/999999 returns 404', async () => {
    const res = await request('PUT', '/api/transactions/999999', {
      title: 'Test',
      amount: 10,
      category: 'Food',
      type: 'expense',
      date: '2026-11-14',
    });
    if (res.status !== 404 || res.body.success !== false) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
    return `Status 404: ${res.body.error}`;
  });

  // 15. Transactions - DELETE
  await test('DELETE /api/transactions/:id removes transaction', async () => {
    const res = await request('DELETE', `/api/transactions/${incomeTxId}`);
    if (res.status !== 200 || !res.body.success) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    // Verify it is gone
    const verifyRes = await request('GET', `/api/transactions/${incomeTxId}`);
    if (verifyRes.status !== 404) {
      throw new Error(`Expected 404 after delete, got ${verifyRes.status}`);
    }
    return `Deleted ID ${incomeTxId} and confirmed 404 on subsequent GET`;
  });

  // 16. Transactions - DELETE non-existent ID
  await test('DELETE /api/transactions/999999 returns 404', async () => {
    const res = await request('DELETE', '/api/transactions/999999');
    if (res.status !== 404 || res.body.success !== false) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
    return `Status 404: ${res.body.error}`;
  });

  // 17. Budgets - GET non-existent month
  await test('GET /api/budgets/2099/1 returns 404', async () => {
    const res = await request('GET', '/api/budgets/2099/1');
    if (res.status !== 404 || res.body.success !== false) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
    return `Status 404: ${res.body.error}`;
  });

  // 18. Budgets - POST create budget
  let budgetId;
  await test('POST /api/budgets creates budget for month', async () => {
    const res = await request('POST', '/api/budgets', {
      year: 2026,
      month: 11,
      amount: 3500.00,
    });
    // If it was already created or returned 201:
    if (res.status === 201 && res.body.success) {
      budgetId = res.body.data.id;
      return `Created budget ID ${budgetId} with amount 3500.00`;
    } else if (res.status === 409 && res.body.data) {
      budgetId = res.body.data.id;
      return `Budget already existed with ID ${budgetId}`;
    } else {
      throw new Error(`Expected 201 or 409, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 19. Budgets - POST duplicate budget returns 409 Conflict
  await test('POST /api/budgets duplicate returns 409 Conflict', async () => {
    const res = await request('POST', '/api/budgets', {
      year: 2026,
      month: 11,
      amount: 4000.00,
    });
    if (res.status !== 409 || res.body.success !== false) {
      throw new Error(`Expected 409 Conflict, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Status 409: ${res.body.error}`;
  });

  // 20. Budgets - GET valid month
  await test('GET /api/budgets/2026/11 returns created budget', async () => {
    const res = await request('GET', '/api/budgets/2026/11');
    if (res.status !== 200 || !res.body.success || !res.body.data) {
      throw new Error(`Expected 200 with budget data, got ${res.status}`);
    }
    return `Found budget amount: ${res.body.data.amount}`;
  });

  // 21. Budgets - PUT update budget
  await test('PUT /api/budgets/:id updates budget amount', async () => {
    const res = await request('PUT', `/api/budgets/${budgetId}`, {
      amount: 3800.00,
    });
    if (res.status !== 200 || !res.body.success || res.body.data.amount !== 3800.00) {
      throw new Error(`Expected 200 with updated amount 3800, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Updated budget amount to ${res.body.data.amount}`;
  });

  // 22. Budgets - PUT invalid amount
  await test('PUT /api/budgets/:id with negative amount returns 400', async () => {
    const res = await request('PUT', `/api/budgets/${budgetId}`, {
      amount: -500,
    });
    if (res.status !== 400 || res.body.success !== false) {
      throw new Error(`Expected 400, got ${res.status}`);
    }
    return `Status 400: ${res.body.error}`;
  });

  // 23. Budgets - PUT non-existent ID
  await test('PUT /api/budgets/999999 returns 404', async () => {
    const res = await request('PUT', '/api/budgets/999999', {
      amount: 2000,
    });
    if (res.status !== 404 || res.body.success !== false) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
    return `Status 404: ${res.body.error}`;
  });

  // 24. Central 404 handler for unknown API routes
  await test('GET /api/unknown-endpoint returns JSON 404', async () => {
    const res = await request('GET', '/api/unknown-endpoint');
    if (res.status !== 404 || res.body.success !== false) {
      throw new Error(`Expected JSON 404, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return `Status 404: ${res.body.error}`;
  });

  console.log('\n--- ALL BACKEND ENDPOINT TESTS FINISHED ---\n');
  const allPassed = results.every(r => r.pass);
  console.log(`Summary: ${results.filter(r => r.pass).length}/${results.length} tests passed.`);
  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

