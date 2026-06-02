const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

require('dotenv').config();

const PRINTER_NAME = process.env.WINDOWS_PRINTER_NAME || 'EPSON BAR';
const TEST_MODE = process.argv.includes('--test-print') || process.argv.includes('--test-format');

function buildCommandText(order = {}) {
  const now = new Date();
  const ora = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  const lines = [];
  lines.push('AL DOGE');
  lines.push('');
  lines.push('COMANDA PIZZERIA');
  lines.push('');

  if (order.tableNumber) {
    lines.push(`TAVOLO ${order.tableNumber}`);
  } else {
    lines.push(order.type || 'ASPORTO');
  }

  lines.push(`Ora: ${order.time || ora}`);

  if (order.pickupTime) lines.push(`Ritiro: ${order.pickupTime}`);
  if (order.customerName) lines.push(`Nome: ${order.customerName}`);

  lines.push('');

  const items = order.items && order.items.length ? order.items : [
    { qty: 2, name: 'MARGHERITA' },
    { qty: 1, name: 'DIAVOLA', notes: 'senza cipolla' }
  ];

  for (const item of items) {
    lines.push(`${item.qty || 1}x ${String(item.name || '').toUpperCase()}`);
    if (item.notes) lines.push(`   ${item.notes}`);
    if (Array.isArray(item.additions)) {
      for (const add of item.additions) lines.push(`   + ${add}`);
    }
  }

  if (order.notes) {
    lines.push('');
    lines.push('NOTE:');
    lines.push(order.notes);
  }

  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('');

  return lines.join('\r\n');
}

function printWithWindows(text) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `doge-comanda-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, text, 'utf8');

    const ps = `Start-Process -FilePath notepad.exe -ArgumentList '/p', '${tempFile.replace(/'/g, "''")}' -Wait`;

    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true }, (error) => {
      try { fs.unlinkSync(tempFile); } catch (_) {}
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main() {
  const sample = buildCommandText({
    tableNumber: 7,
    items: [
      { qty: 2, name: 'Margherita' },
      { qty: 1, name: 'Diavola', notes: 'senza cipolla' },
      { qty: 1, name: 'San Daniele' }
    ],
    notes: 'prima bambini'
  });

  if (process.argv.includes('--test-format')) {
    console.log(sample);
    return;
  }

  if (process.argv.includes('--test-print')) {
    console.log(`Invio stampa test a: ${PRINTER_NAME}`);
    await printWithWindows(sample);
    console.log('Stampa test inviata.');
    return;
  }

  console.log('Doge Print Agent avviato.');
  console.log(`Stampante configurata: ${PRINTER_NAME}`);
  console.log('Versione attuale: test stampa locale. Collegamento ordini sarà aggiunto dopo conferma stampa.');
}

main().catch((error) => {
  console.error('Errore Doge Print Agent:', error.message);
  process.exit(1);
});
