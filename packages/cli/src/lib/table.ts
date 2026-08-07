export function formatTable(
  headers: string[],
  rows: string[][]
) {
  const widths = headers.map((header, index) => {
    let max = header.length;

    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i][index] ?? "";
      max = Math.max(max, cell.length);
    }

    return max;
  });

  const headerLine = headers
    .map((header, index) => header.padEnd(widths[index]))
    .join("  ");

  const divider = widths.map((width) => "-".repeat(width)).join("  ");

  const body = rows
    .map((row) =>
      row.map((cell, index) => cell.padEnd(widths[index])).join("  ")
    )
    .join("\n");

  return `${headerLine}\n${divider}\n${body}`;
}

export function formatAmount(amount: { amount: number; currency: string } | null | undefined) {
  if (!amount) {
    return "-";
  }

  const value = (amount.amount / 100).toFixed(2);
  return `${value} ${amount.currency.toUpperCase()}`;
}
