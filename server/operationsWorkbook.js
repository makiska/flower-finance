const ExcelJS = require('exceljs');

const TYPE_LABELS = {
  sale: 'Продажа',
  purchase: 'Закупка',
  expense: 'Расходник',
};

function sourceLabel(preset) {
  if (preset === true || preset === 't' || preset === 1 || preset === '1') return 'из каталога';
  if (preset === false || preset === 'f' || preset === 0 || preset === '0') return 'создана';
  return '';
}

function positionName(row) {
  if (row.type === 'expense') return row.comment || 'Расходник';
  return row.product_name || '';
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function buildOperationsWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Учет растений';
  const sheet = workbook.addWorksheet('Операции');
  sheet.columns = [
    { header: 'Дата', key: 'date', width: 18 },
    { header: 'Тип', key: 'type', width: 14 },
    { header: 'Позиция', key: 'name', width: 42 },
    { header: 'Группа', key: 'group', width: 24 },
    { header: 'Подгруппа', key: 'subgroup', width: 28 },
    { header: 'Количество', key: 'quantity', width: 14 },
    { header: 'Сумма, ₽', key: 'amount', width: 14 },
    { header: 'Комментарий', key: 'comment', width: 28 },
    { header: 'Источник', key: 'source', width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'I1' };

  for (const row of rows) {
    const added = sheet.addRow({
      date: toDate(row.date),
      type: TYPE_LABELS[row.type] || row.type || '',
      name: positionName(row),
      group: row.category_name || '',
      subgroup: row.subgroup || '',
      quantity: Number(row.quantity) || 0,
      amount: Number(row.amount) || 0,
      comment: row.comment || '',
      source: row.type === 'expense' ? '' : sourceLabel(row.product_is_preset),
    });
    added.getCell('date').numFmt = 'dd.mm.yyyy hh:mm';
    added.getCell('quantity').numFmt = '0';
    added.getCell('amount').numFmt = '#,##0.00';
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  buildOperationsWorkbook,
  sourceLabel,
  positionName,
};
