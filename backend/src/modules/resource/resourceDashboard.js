export function summarizeResources(rows) {
  return rows.reduce((summary, row) => {
    const key = row.status || 'UNKNOWN';
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}
