(() => {
  const recordColumn = location.pathname === "/admin/quotations"
    ? "Quotation"
    : location.pathname === "/admin/invoices"
      ? "Invoice"
      : "";

  if (!recordColumn) return;

  document.querySelectorAll("table").forEach((table) => {
    const headers = [...table.querySelectorAll("thead th")];
    const recordIndex = headers.findIndex(
      (header) => header.textContent?.trim() === recordColumn,
    );
    if (recordIndex < 0) return;

    const updatedIndex = headers.findIndex(
      (header) => header.textContent?.trim() === "Updated",
    );

    [...table.rows].forEach((row) => {
      if (updatedIndex >= 0) row.children.item(updatedIndex)?.remove();
      const adjustedRecordIndex = updatedIndex >= 0 && updatedIndex < recordIndex
        ? recordIndex - 1
        : recordIndex;
      const recordCell = row.children.item(adjustedRecordIndex);
      if (recordCell) row.append(recordCell);
    });
  });
})();
