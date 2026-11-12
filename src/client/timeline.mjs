export function timelineDate(roll) {
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/.exec(
    String(roll.date || ''),
  );
  if (!match) return { year: null, month: null, date: '' };
  const year = match[1],
    month = roll.datePrecision === 'year' ? null : match[2] || null,
    day = month && roll.datePrecision !== 'month' ? match[3] || null : null;
  return {
    year,
    month,
    date: year + (month ? '-' + month : '') + (day ? '-' + day : ''),
    approximate: roll.datePrecision === 'year',
  };
}
export function groupTimelineRolls(rows, order = 'desc') {
  const years = new Map();
  for (const roll of rows) {
    const date = timelineDate(roll),
      key = date.year || 'undated';
    if (!years.has(key)) years.set(key, { key, year: date.year, rolls: [], months: new Map() });
    const group = years.get(key),
      month = date.month || 'unknown';
    group.rolls.push(roll);
    if (!group.months.has(month))
      group.months.set(month, { key: month, month: date.month, rolls: [] });
    group.months.get(month).rolls.push(roll);
  }
  const direction = order === 'asc' ? 1 : -1,
    sort = (a, b) => (a === b ? 0 : !a ? 1 : !b ? -1 : a.localeCompare(b) * direction);
  return [...years.values()]
    .sort((a, b) => sort(a.year, b.year))
    .map((group) => ({
      ...group,
      months: [...group.months.values()].sort((a, b) => sort(a.month, b.month)),
      frames: group.rolls.reduce((n, r) => n + (Number(r.frameCount) || 0), 0),
    }));
}
export function renderTimeline(
  rows,
  { E, thumb, stocks = {}, statuses = {}, selected = new Set(), order = 'desc' } = {},
) {
  const groups = groupTimelineRolls(rows, order),
    count = rows.length,
    frames = rows.reduce((n, r) => n + (Number(r.frameCount) || 0), 0);
  const card = (r) => {
    const stock = stocks[r.stock] || {},
      date = timelineDate(r),
      dateLabel = !date.year
        ? '拍摄日期待补'
        : date.approximate
          ? '约 ' + date.year + ' 年'
          : date.date.replaceAll('-', '.'),
      status = statuses[r.status] || r.status || '',
      physical = Object.values(r.physical || {})
        .filter(Boolean)
        .join(' / ');
    return `<article class="timeline-roll ${selected.has(r.id) ? 'selected' : ''}" data-record="${E(r.id)}" data-entity="rolls" tabindex="0" style="--timeline-stock:${stock.color2 || '#b5a36b'}"><div class="timeline-roll-cover">${r.coverMedia ? `<img src="${thumb(r.coverMedia, 640)}" loading="lazy" decoding="async" alt="${E(r.name)}">` : '<div class="timeline-cover-empty"><span aria-hidden="true">◉</span><small>待装入影像</small></div>'}<span class="timeline-format" data-user-content>${E(r.format || 'FILM')}</span></div><div class="timeline-roll-body"><div class="timeline-roll-topline">${date.year ? `<time datetime="${E(date.date)}">${E(dateLabel)}</time>` : `<span>${dateLabel}</span>`}<span class="timeline-status ${r.status === 'shooting' ? 'is-active' : ''}">${E(status)}</span></div><h3 data-user-content title="${E(r.name)}">${E(r.name)}</h3><p class="timeline-location" data-user-content title="${E(r.location || '地点未记录')}"><span aria-hidden="true">⌖</span> ${E(r.location || '地点未记录')}${r.camera ? `<span class="timeline-camera"> · ${E(r.camera)}</span>` : ''}</p><div class="timeline-roll-stock"><span class="timeline-stock-mark" aria-hidden="true"></span><span data-user-content>${E([stock.brand, stock.name || r.stock].filter(Boolean).join(' · '))}</span></div><footer><code>${E(r.code)}</code><span>${Number(r.frameCount) || 0} <span>格</span></span><button type="button" data-action="roll-photos" data-value="${E(r.id)}" aria-label="打开胶卷 ${E(r.name)}" title="查看整卷照片">↗</button></footer>${physical ? `<small class="timeline-physical" data-user-content title="${E(physical)}">▣ ${E(physical)}</small>` : ''}</div></article>`;
  };
  return `<div class="archive-timeline"><header class="timeline-intro"><div><small>FILM CHRONICLE</small><b>摄影编年</b><span>已加载 ${count} 卷 · ${frames} 格</span></div><label><span>时间顺序</span><select id="timeline-order" aria-label="时间轴排列顺序"><option value="desc" ${order === 'desc' ? 'selected' : ''}>从近到远</option><option value="asc" ${order === 'asc' ? 'selected' : ''}>从远到近</option></select></label></header><nav class="timeline-index" aria-label="已加载年份索引"><span>已加载年份</span>${groups.map((g) => `<button type="button" data-action="timeline-jump" data-value="${g.key}">${g.year || '未定年'}<small>${g.rolls.length}</small></button>`).join('')}</nav><div class="timeline-years">${groups.map((group) => `<section class="timeline-year-group" id="timeline-year-${group.key}"><header class="timeline-year-rail"><h2>${group.year || '待定'}</h2><span>${group.rolls.length} <span>卷</span><i> / </i>${group.frames} <span>格</span></span>${!group.year ? '<small>补充拍摄日期后<br>自动归入对应年份</small>' : ''}</header><div class="timeline-months">${group.months.map((month) => `<section class="timeline-month-group"><header class="timeline-month-heading"><span class="timeline-node" aria-hidden="true"></span><h3>${month.month ? `<b>${month.month}</b><span>月</span>` : group.year ? '月份未定' : '未记录日期'}</h3><span class="timeline-month-count">${month.rolls.length} <span>卷</span></span></header><div class="timeline-roll-grid">${month.rolls.map(card).join('')}</div></section>`).join('')}</div></section>`).join('')}</div></div>`;
}
