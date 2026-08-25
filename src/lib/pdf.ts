import type { Engineer, ExpenseEntry, ShiftLog } from "@/lib/mock-data";
import { expenseTotal } from "@/lib/mock-data";
import { ownVehicleDays, paymentSummary, totalShifts } from "@/lib/payroll";

const NAVY: [number, number, number] = [16, 34, 66];
const EMERALD: [number, number, number] = [16, 145, 105];

const money = (n: number) =>
  `GBP ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function newDoc(title: string, subtitle: string) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, width, 84, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("WeActive9", 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(190, 205, 225);
  doc.text("Field Operations · Shifts, Expenses & Payroll", 40, 58);

  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 40, 116);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 118, 130);
  doc.text(subtitle, 40, 132);
  doc.setTextColor(20, 20, 20);

  return { doc, autoTable, width };
}

function sectionTitle(doc: import("jspdf").jsPDF, startY: number, label: string) {
  const y = doc.getNumberOfPages() > 1 && startY > 200 ? 46 : startY - 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(16, 34, 66);
  doc.text(label, 40, y);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
}

function footer(doc: import("jspdf").jsPDF) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 148, 160);
    doc.text(
      `Generated ${new Date().toLocaleString("en-GB")} · WeActive9 confidential`,
      40,
      height - 24,
    );
    doc.text(`Page ${i} of ${pages}`, width - 40, height - 24, { align: "right" });
  }
}

const finalY = (doc: import("jspdf").jsPDF) =>
  (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export async function generateEngineerStatementPdf(
  engineer: Engineer,
  shifts: ShiftLog[],
  expenses: ExpenseEntry[],
) {
  const { doc, autoTable } = await newDoc(
    "Engineer statement",
    `${engineer.name} · ${engineer.region} region · ${engineer.email}`,
  );

  const sum = paymentSummary(engineer, shifts, expenses);
  const totalClaims = expenses.reduce((a, e) => a + expenseTotal(e), 0);

  let startY = 150;
  autoTable(doc, {
    startY,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 6 },
    body: [
      ["Total shifts logged", `${sum.shiftCount}`],
      ["Shift rate", money(engineer.shiftRate) + " / shift"],
      ["Own-vehicle days (max 7/week)", `${sum.ownVehicleDays}`],
      ["Gross shift earnings", money(sum.grossEarned)],
      [`VAT deduction (${engineer.vatRate}%)`, `- ${money(sum.vatDeducted)}`],
      ["Approved reimbursables", money(sum.reimbursables)],
      ["Paid to date", `- ${money(sum.paid)}`],
      ["Net to be paid", money(sum.toBePaid)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 }, 1: { halign: "right" } },
    tableWidth: 400,
  });

  startY = finalY(doc) + 24;
  autoTable(doc, {
    startY,
    head: [["Date", "Site", "Shift", "Shifts", "Own vehicle", "Status"]],
    body: shifts.map((s) => [
      s.date,
      s.site,
      s.shiftType,
      `${s.shiftCount}`,
      s.ownVehicle ? "Yes" : "-",
      s.status,
    ]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    alternateRowStyles: { fillColor: [243, 246, 250] },
    columnStyles: { 3: { halign: "right" } },
    margin: { left: 40, right: 40, top: 60 },
    pageBreak: "auto",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: () => sectionTitle(doc, startY, "Shift log"),
  });

  startY = finalY(doc) + 24;
  autoTable(doc, {
    startY,
    head: [["Date", "Site", "Fuel", "Meals", "Card", "Total", "Receipt", "Status"]],
    body: [...expenses.map((e) => [
      e.date,
      e.site,
      money(e.fuel),
      money(e.meals),
      money(e.creditCard),
      money(expenseTotal(e)),
      e.receiptName ? "Yes" : "—",
      e.status,
    ]), ["", "Total claimed", "", "", "", money(totalClaims), "", ""]],
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === expenses.length) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [235, 240, 246];
      }
    },
    headStyles: { fillColor: EMERALD, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 5 },
    alternateRowStyles: { fillColor: [243, 246, 250] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: 40, right: 40, top: 60 },
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: () => sectionTitle(doc, startY, "Expense claims"),
  });

  footer(doc);
  doc.save(`weactive9-statement-${engineer.id}.pdf`);
}

export interface PayrollRow {
  name: string;
  region: string;
  rate: number;
  shifts: number;
  ownVehicle: number;
  gross: number;
  vat: number;
  reimb: number;
  paid: number;
  toBePaid: number;
}

export async function generatePayrollPdf(rows: PayrollRow[], periodLabel: string) {
  const { doc, autoTable } = await newDoc(
    "Payroll run",
    `${periodLabel} · ${rows.length} engineers`,
  );

  const sumOf = (k: keyof PayrollRow) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const grossTotal = sumOf("gross");
  const vatTotal = sumOf("vat");
  const reimbTotal = sumOf("reimb");
  const paidTotal = sumOf("paid");
  const dueTotal = sumOf("toBePaid");

  let startY = 150;
  autoTable(doc, {
    startY,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 6 },
    body: [
      ["Gross shift earnings", money(grossTotal)],
      ["VAT deducted", `- ${money(vatTotal)}`],
      ["Approved reimbursements", money(reimbTotal)],
      ["Paid to date", `- ${money(paidTotal)}`],
      ["Total to be paid", money(dueTotal)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 240 }, 1: { halign: "right" } },
    tableWidth: 400,
  });

  startY = finalY(doc) + 24;
  autoTable(doc, {
    startY,
    head: [["Engineer", "Region", "Rate", "Shifts", "Vehicle", "Gross", "VAT", "Reimb.", "Paid", "To be paid"]],
    body: [...rows.map((r) => [
      r.name,
      r.region,
      money(r.rate),
      `${r.shifts}`,
      `${r.ownVehicle}`,
      money(r.gross),
      money(r.vat),
      money(r.reimb),
      money(r.paid),
      money(r.toBePaid),
    ]), ["Total", "", "", "", "", money(grossTotal), money(vatTotal), money(reimbTotal), money(paidTotal), money(dueTotal)]],
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === rows.length) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [235, 240, 246];
      }
    },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2.6 },
    alternateRowStyles: { fillColor: [243, 246, 250] },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 40, right: 40, top: 60 },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: () => sectionTitle(doc, startY, "Payroll breakdown"),
  });

  footer(doc);
  doc.save(`weactive9-payroll-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export interface InvoiceLine {
  label: string;
  shifts: number;
  gross: number;
  vat: number;
  reimb: number;
  net: number;
}

export async function generateInvoicePdf(opts: {
  reference: string;
  periodLabel: string;
  granularity: string;
  lines: InvoiceLine[];
}) {
  const { doc, autoTable } = await newDoc(
    `Invoice ${opts.reference}`,
    `${opts.granularity} invoice · ${opts.periodLabel}`,
  );

  const total = (k: keyof InvoiceLine) =>
    opts.lines.reduce((a, l) => a + Number(l[k] ?? 0), 0);

  let startY = 150;
  autoTable(doc, {
    startY,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 6 },
    body: [
      ["Shifts invoiced", `${total("shifts")}`],
      ["Gross shift value", money(total("gross"))],
      ["VAT deducted", `- ${money(total("vat"))}`],
      ["Reimbursables", money(total("reimb"))],
      ["Net payable", money(total("net"))],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 }, 1: { halign: "right" } },
    tableWidth: 400,
  });

  startY = finalY(doc) + 24;
  autoTable(doc, {
    startY,
    head: [["Engineer", "Shifts", "Gross", "VAT deducted", "Reimbursables", "Net payable"]],
    body: [...opts.lines.map((l) => [
      l.label,
      `${l.shifts}`,
      money(l.gross),
      money(l.vat),
      money(l.reimb),
      money(l.net),
    ]), ["Total", `${total("shifts")}`, money(total("gross")), money(total("vat")), money(total("reimb")), money(total("net"))]],
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === opts.lines.length) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [235, 240, 246];
      }
    },
    headStyles: { fillColor: EMERALD, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    alternateRowStyles: { fillColor: [243, 246, 250] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 40, right: 40, top: 60 },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: () => sectionTitle(doc, startY, "Invoice lines"),
  });

  footer(doc);
  doc.save(`weactive9-invoice-${opts.reference}.pdf`);
}

export { totalShifts, ownVehicleDays };
