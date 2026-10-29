import http from 'node:http';
import fs from 'node:fs';
import { Command } from 'commander';

// ---------- Параметри командного рядка ----------
const program = new Command();

program
  .helpOption('--help', 'показати довідку')
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .option('-o, --output <path>', 'файл для запису останньої відповіді');

program.parse(process.argv);
const options = program.opts();

const port = Number(options.port);
if (options.port.trim() === '' || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Помилка: порт має бути цілим числом від 1 до 65535');
  process.exit(1);
}

// ---------- Допоміжні функції ----------

// Число або null: порожнє, null, відсутнє й нечислове значення дають null
function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Текст або null: відсутнє, порожнє і рядок "null" вважаємо відсутнім значенням
function toText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text === '' || text.toLowerCase() === 'null') {
    return null;
  }
  return text;
}

// ---------- Відповідь у форматі JSON ----------
// Якщо задано --output, спочатку записуємо відповідь у файл,
// і лише потім відповідаємо клієнту (щоб помилку запису можна було повідомити)
function sendJson(res, status, data) {
  const body = JSON.stringify(data);

  function respond(code, text) {
    if (res.headersSent) {
      return;
    }
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  }

  if (!options.output) {
    respond(status, body);
    return;
  }

  fs.writeFile(options.output, body, (err) => {
    if (err) {
      respond(500, JSON.stringify({ error: 'Помилка запису у вихідний файл' }));
      return;
    }
    respond(status, body);
  });
}

// ---------- Обробка записів за параметрами запиту ----------
function buildResult(records, showPayment, minValue) {
  const result = [];

  for (const rec of records) {
    if (rec === null || typeof rec !== 'object') {
      continue;
    }

    const value = toNumber(rec.Booking_Value);

    // Фільтр увімкнено: запис без числової вартості не проходить
    if (minValue !== null && !(value !== null && value > minValue)) {
      continue;
    }

    const item = {
      booking_id: toText(rec.Booking_ID),
      vehicle_type: toText(rec.Vehicle_Type),
      booking_value: value,
    };
    if (showPayment) {
      item.payment_method = toText(rec.Payment_Method);
    }
    result.push(item);
  }

  return result;
}

// ---------- Обробник запитів ----------
function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname !== '/') {
    sendJson(res, 404, { error: 'Маршрут не знайдено' });
    return;
  }

  const showPayment = url.searchParams.get('payment') === 'true';

  let minValue = null;
  if (url.searchParams.has('min_value')) {
    minValue = toNumber(url.searchParams.get('min_value'));
    if (minValue === null) {
      sendJson(res, 400, { error: 'Параметр min_value має бути числом' });
      return;
    }
  }

  fs.readFile(options.input, 'utf8', (err, text) => {
    if (err) {
      sendJson(res, 500, { error: 'Не вдалося прочитати файл даних' });
      return;
    }

    let records;
    try {
      records = JSON.parse(text);
    } catch (parseError) {
      sendJson(res, 500, { error: 'Файл даних пошкоджено: некоректний JSON' });
      return;
    }

    if (!Array.isArray(records)) {
      sendJson(res, 500, { error: 'Файл даних має містити JSON-масив' });
      return;
    }

    // Колбек виконується пізніше, тому зовнішній try/catch сюди не дістає
    let result;
    try {
      result = buildResult(records, showPayment, minValue);
    } catch (buildError) {
      console.error('Помилка обробки даних:', buildError);
      sendJson(res, 500, { error: 'Помилка обробки даних' });
      return;
    }

    sendJson(res, 200, result);
  });
}

// ---------- Запуск сервера ----------
function startServer() {
  const server = http.createServer((req, res) => {
    try {
      handleRequest(req, res);
    } catch (e) {
      console.error('Необроблена помилка в обробнику запиту:', e);
      sendJson(res, 500, { error: 'Внутрішня помилка сервера' });
    }
  });

  server.on('error', (e) => {
    console.error(`Помилка сервера: ${e.message}`);
    process.exit(1);
  });

  server.listen(port, options.host, () => {
    console.log(`Сервер запущено: http://${options.host}:${port}/`);
  });
}

fs.access(options.input, fs.constants.F_OK, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
  }
  startServer();
});
