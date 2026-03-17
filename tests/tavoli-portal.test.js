const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const tavoliPath = path.join(__dirname, '..', 'tavoli.html');
const localStorePath = path.join(process.cwd(), '.netlify', 'local-table-bills.json');

test('tavoli portal page is the full staff version wired to table-bill endpoint', async () => {
  const html = await fs.readFile(tavoliPath, 'utf8');

  assert.match(html, /Portale Staff Tavoli - AL DOGE/i);
  assert.match(html, /max="10"/i);
  assert.match(html, /Coperto x/i);
  assert.match(html, /Aggiunte\s*\/\s*Note/i);
  assert.match(html, /\/\.netlify\/functions\/table-bill\?table=/i);
  assert.match(html, /\/\.netlify\/functions\/table-bill'/i);
  assert.match(html, /pay\.html\?table=/i);
  assert.match(html, /voci catalogo/i);
});

test('table-bill preserves staff bill details used by tavoli portal', async () => {
  await fs.rm(localStorePath, { force: true });

  const { handler } = require('../netlify/functions/table-bill');
  const payload = {
    tableId: 2,
    covers: 3,
    note: 'Servizio staff serata',
    total: 27.5,
    items: [
      {
        id: 'pizza-margherita',
        name: 'Margherita',
        qty: 2,
        basePrice: 6,
        price: 7,
        extras: [{ name: 'Bufala', price: 1 }],
        note: 'Ben cotta'
      },
      {
        name: 'Coperto',
        qty: 3,
        price: 1.5
      }
    ]
  };

  const putResponse = await handler({
    httpMethod: 'PUT',
    body: JSON.stringify(payload),
    queryStringParameters: null,
  });

  assert.equal(putResponse.statusCode, 200);

  const getResponse = await handler({
    httpMethod: 'GET',
    queryStringParameters: { table: '2' },
  });

  assert.equal(getResponse.statusCode, 200);
  const body = JSON.parse(getResponse.body);

  assert.equal(body.ok, true);
  assert.equal(body.empty, false);
  assert.equal(body.bill.covers, 3);
  assert.equal(body.bill.note, 'Servizio staff serata');
  assert.equal(body.bill.total, 27.5);
  assert.equal(body.bill.items[0].id, 'pizza-margherita');
  assert.equal(body.bill.items[0].note, 'Ben cotta');
  assert.equal(body.bill.items[0].extras[0].name, 'Bufala');
  assert.equal(body.bill.items[1].name, 'Coperto');
});
