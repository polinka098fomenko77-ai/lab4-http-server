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

// ---------- Відповідь у форматі JSON ----------
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// ---------- Обробник запитів ----------
function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname !== '/') {
    sendJson(res, 404, { error: 'Маршрут не знайдено' });
    return;
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

    sendJson(res, 200, records);
  });
}

// ---------- Запуск сервера ----------
function startServer() {
  const server = http.createServer(handleRequest);

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
