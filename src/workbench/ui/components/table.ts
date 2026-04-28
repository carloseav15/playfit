import { renderEmptyState } from "./empty-state";

export interface TableColumn<T> {
  header: string;
  className?: string;
  render: (row: T) => string;
}

interface TableOptions<T> {
  caption?: string;
  emptyMessage?: string;
  rowAttributes?: (row: T) => string;
}

export function renderTable<T>(
  rows: T[],
  columns: TableColumn<T>[],
  options: TableOptions<T> = {},
) {
  if (rows.length === 0) {
    return renderEmptyState(options.emptyMessage ?? "No data available.");
  }

  const head = columns
    .map(
      (column) =>
        `<th scope="col" class="${column.className ?? ""}">${column.header}</th>`,
    )
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map(
          (column) =>
            `<td class="${column.className ?? ""}">${column.render(row)}</td>`,
        )
        .join("");

      return `<tr ${options.rowAttributes?.(row) ?? ""}>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table>
        ${options.caption ? `<caption class="sr-only">${options.caption}</caption>` : ""}
        <thead>
          <tr>${head}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}
