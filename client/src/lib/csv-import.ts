export interface ParsedBillRow {
  name: string;
  category: string;
  defaultAmount: string;
  frequency: "monthly" | "yearly";
  dueDay: number;
  dueMonth?: number;
  isAutoPay: boolean;
}

export interface ParseResult {
  valid: ParsedBillRow[];
  errors: { row: number; message: string }[];
}

export function parseBillsCSV(csvText: string): ParseResult {
  const lines = csvText.trim().split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return { valid: [], errors: [{ row: 0, message: "CSV must have a header row and at least one data row" }] };

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const requiredCols = ["name", "category", "amount", "frequency", "dueday"];
  const missing = requiredCols.filter(c => !header.includes(c));
  if (missing.length > 0) {
    return { valid: [], errors: [{ row: 0, message: `Missing required columns: ${missing.join(", ")}` }] };
  }

  const valid: ParsedBillRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim());
    const get = (col: string) => cells[header.indexOf(col)] ?? "";

    const name = get("name");
    const category = get("category");
    const amount = get("amount");
    const frequency = get("frequency").toLowerCase();
    const dueDay = parseInt(get("dueday"), 10);
    const dueMonthRaw = get("duemonth");
    const autoPayRaw = get("autopay").toLowerCase();

    if (!name || !category || !amount || (frequency !== "monthly" && frequency !== "yearly") || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      errors.push({ row: i + 1, message: `Invalid or missing required field(s) in row: "${lines[i]}"` });
      continue;
    }
    if (frequency === "yearly" && (!dueMonthRaw || isNaN(parseInt(dueMonthRaw, 10)))) {
      errors.push({ row: i + 1, message: `Yearly bill "${name}" is missing a valid DueMonth` });
      continue;
    }

    valid.push({
      name,
      category,
      defaultAmount: amount,
      frequency: frequency as "monthly" | "yearly",
      dueDay,
      dueMonth: frequency === "yearly" ? parseInt(dueMonthRaw, 10) : undefined,
      isAutoPay: autoPayRaw === "true" || autoPayRaw === "yes",
    });
  }

  return { valid, errors };
}
