import { useState, useCallback } from 'react';
import { Plus, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface TableEditorProps {
  initialHeaders?: string[];
  initialRows?: string[][];
  onSave: (headers: string[], rows: string[][]) => void;
  onCancel: () => void;
}

export function TableEditor({
  initialHeaders = ['Column 1', 'Column 2'],
  initialRows = [['', ''], ['', '']],
  onSave,
  onCancel,
}: TableEditorProps) {
  const [headers, setHeaders] = useState<string[]>(initialHeaders);
  const [rows, setRows] = useState<string[][]>(initialRows);

  const updateHeader = useCallback((index: number, value: string) => {
    setHeaders(prev => {
      const newHeaders = [...prev];
      newHeaders[index] = value;
      return newHeaders;
    });
  }, []);

  const updateCell = useCallback((rowIndex: number, colIndex: number, value: string) => {
    setRows(prev => {
      const newRows = prev.map(row => [...row]);
      newRows[rowIndex][colIndex] = value;
      return newRows;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, new Array(headers.length).fill('')]);
  }, [headers.length]);

  const removeRow = useCallback((index: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== index));
  }, [rows.length]);

  const addColumn = useCallback(() => {
    if (headers.length >= 5) return; // Max 5 columns
    setHeaders(prev => [...prev, `Column ${prev.length + 1}`]);
    setRows(prev => prev.map(row => [...row, '']));
  }, [headers.length]);

  const removeColumn = useCallback((index: number) => {
    if (headers.length <= 1) return;
    setHeaders(prev => prev.filter((_, i) => i !== index));
    setRows(prev => prev.map(row => row.filter((_, i) => i !== index)));
  }, [headers.length]);

  const handleSave = () => {
    // Filter out empty rows
    const nonEmptyRows = rows.filter(row => row.some(cell => cell.trim() !== ''));
    onSave(headers, nonEmptyRows.length > 0 ? nonEmptyRows : [new Array(headers.length).fill('')]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          📊 Create Table
        </h3>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-full hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Column/Row controls */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Columns:</span>
          <button
            onClick={() => removeColumn(headers.length - 1)}
            disabled={headers.length <= 1}
            className="p-1 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center font-medium">{headers.length}</span>
          <button
            onClick={addColumn}
            disabled={headers.length >= 5}
            className="p-1 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows:</span>
          <button
            onClick={() => removeRow(rows.length - 1)}
            disabled={rows.length <= 1}
            className="p-1 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-6 text-center font-medium">{rows.length}</span>
          <button
            onClick={addRow}
            className="p-1 rounded bg-secondary hover:bg-secondary/80"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th key={i} className="relative">
                  <input
                    type="text"
                    value={header}
                    onChange={(e) => updateHeader(i, e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-3 py-2.5 bg-primary text-primary-foreground text-sm font-semibold text-left focus:outline-none focus:ring-2 focus:ring-primary-foreground/30 focus:ring-inset placeholder:text-primary-foreground/60"
                    placeholder="Header"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border/30">
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="border-r border-border/30 last:border-r-0">
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full px-3 py-2 bg-card/60 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset placeholder:text-muted-foreground/50"
                      placeholder="Enter value..."
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
          Save Table
        </Button>
      </div>
    </motion.div>
  );
}

// Component to display a table in the mood board
interface TableDisplayProps {
  headers: string[];
  rows: string[][];
  compact?: boolean;
}

export function TableDisplay({ headers, rows, compact = false }: TableDisplayProps) {
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className={`bg-primary text-primary-foreground font-semibold text-left ${
                  compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2'
                }`}
              >
                {header || 'Column'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, compact ? 4 : undefined).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border/30">
              {row.map((cell, colIndex) => (
                <td
                  key={colIndex}
                  className={`text-foreground border-r border-border/30 last:border-r-0 ${
                    compact ? 'px-2 py-1 text-xs' : 'px-3 py-2'
                  }`}
                >
                  {cell || '—'}
                </td>
              ))}
            </tr>
          ))}
          {compact && rows.length > 4 && (
            <tr>
              <td
                colSpan={headers.length}
                className="px-2 py-1 text-xs text-muted-foreground text-center"
              >
                +{rows.length - 4} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
