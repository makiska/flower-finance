export const PLANT_GROUPS = [
  'Ароидные',
  'Хойи',
  'Бегонии',
  'Папоротники',
  'Фикусы',
  'Марантовые',
  'Суккуленты и кактусы',
  'Цветущие',
  'Другие растения',
];

export const FIXED_GROUPS = [...PLANT_GROUPS, 'Расходники'];

export function itemBadge(item) {
  const group = item.group || item.category_name || '';
  if (item.subgroup) return `${group} · ${item.subgroup}`;
  return group;
}
