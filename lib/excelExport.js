const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const HEADERS = ['Место', 'Участник', 'Номер', 'Возраст', 'Клуб', 'Результат', 'До лидера'];
const BROADCAST_HEADERS = [
  'Категория',
  'Круг',
  'Лидер',
  '№',
  'Время отсечки',
  'Обновлено',
];
const DATA_FILENAME = 'data.xlsx';
const BROADCAST_SHEET = 'Эфир';

function rowToArray(row) {
  return [
    row.место,
    row.участник,
    row.номер,
    row.возраст,
    row.клуб,
    row.результат,
    row.доЛидера,
  ];
}

function lapStateToArray(categoryName, lapState) {
  const state = lapState || {};
  return [
    categoryName,
    state.lapLabel ?? '',
    state.leaderName ?? '',
    state.leaderNumber ?? '',
    state.splitTime ?? '',
    state.updatedAt ?? '',
  ];
}

async function writeSheet(worksheet, headers, rows, mapFn) {
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(mapFn(row));
  }
  worksheet.getRow(1).font = { bold: true };
}

function sanitizeSheetName(name) {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

async function exportDataFile(categories, exportsDir, broadcastRows) {
  const workbook = new ExcelJS.Workbook();

  const wsBroadcast = workbook.addWorksheet(BROADCAST_SHEET);
  await writeSheet(wsBroadcast, BROADCAST_HEADERS, broadcastRows || [], (row) => row);

  for (const { sheetName, rows } of categories) {
    const ws = workbook.addWorksheet(sanitizeSheetName(sheetName));
    await writeSheet(ws, HEADERS, rows, rowToArray);
  }

  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const filepath = path.join(exportsDir, DATA_FILENAME);
  await workbook.xlsx.writeFile(filepath);

  return { filename: DATA_FILENAME, filepath };
}

module.exports = {
  exportDataFile,
  lapStateToArray,
  BROADCAST_SHEET,
};
