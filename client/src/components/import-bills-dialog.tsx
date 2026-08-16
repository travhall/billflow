import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateBill } from "@/hooks/use-bills";
import { parseBillsCSV, type ParseResult } from "@/lib/csv-import";
import { Upload } from "lucide-react";

export function ImportBillsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const createBill = useCreateBill();

  function reset() {
    setResult(null);
    setIsImporting(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setResult(parseBillsCSV(text));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleImport() {
    if (!result || result.valid.length === 0) return;
    setIsImporting(true);
    for (const row of result.valid) {
      await createBill.mutateAsync({
        name: row.name,
        category: row.category,
        defaultAmount: row.defaultAmount,
        isVariable: false,
        frequency: row.frequency,
        dueDay: row.dueDay,
        dueMonth: row.dueMonth,
        isAutoPay: row.isAutoPay,
        archived: false,
        reminderDays: null,
      });
    }
    setIsImporting(false);
    setIsOpen(false);
    reset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="rounded-xl gap-2 border-border"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-card p-0 overflow-hidden border border-border shadow-2xl rounded-2xl">
        <div className="bg-muted/40 p-6 border-b border-border">
          <DialogTitle className="text-xl font-display font-bold text-foreground">Import Bills from CSV</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Columns: Name, Category, Amount, Frequency, DueDay, DueMonth, AutoPay.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Bills with names matching existing bills will be created as duplicates — check your list after importing.</p>
            <p>Simple CSV only — no support for names containing commas.</p>
          </div>

          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-primary file:text-white file:cursor-pointer cursor-pointer"
          />

          {result && result.errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-1">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-rose-600 dark:text-rose-400">
                  Row {err.row}: {err.message}
                </p>
              ))}
            </div>
          )}

          {result && result.valid.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Auto-Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.valid.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>{row.defaultAmount}</TableCell>
                      <TableCell className="capitalize">{row.frequency}</TableCell>
                      <TableCell>
                        {row.frequency === "yearly" ? `${row.dueMonth}/${row.dueDay}` : row.dueDay}
                      </TableCell>
                      <TableCell>{row.isAutoPay ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {result && (
            <Button
              onClick={handleImport}
              disabled={result.valid.length === 0 || isImporting}
              className="w-full rounded-xl py-6 font-semibold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
            >
              {isImporting ? "Importing..." : `Import ${result.valid.length} bill${result.valid.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
