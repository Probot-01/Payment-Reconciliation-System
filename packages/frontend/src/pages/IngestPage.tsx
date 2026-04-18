import React, { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Play, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { formatDateTime } from '../lib/utils';

// ─── Sample CSV data ──────────────────────────────────────────────────────────
const SAMPLE_TX_CSV = `externalId,source,amount,status,payerRef,payeeRef,timestamp
EXT-SAMPLE-001,UPI_GPAY,1500.00,SUCCESS,user123@upi,MERCHANT,2024-01-15T10:30:00Z
EXT-SAMPLE-002,CARD_VISA,25000.00,SUCCESS,CARD_XXXX1234,MERCHANT,2024-01-15T11:00:00Z
EXT-SAMPLE-003,WALLET_PAYTM,499.00,SUCCESS,paytm_user_456,MERCHANT,2024-01-15T11:15:00Z
EXT-SAMPLE-004,UPI_PHONEPE,7500.00,PENDING,user789@upi,MERCHANT,2024-01-15T11:30:00Z
EXT-SAMPLE-005,CARD_MC,12000.00,SUCCESS,CARD_XXXX5678,MERCHANT,2024-01-15T12:00:00Z`;

const SAMPLE_ORDER_CSV = `orderId,customerId,customerName,amount,source,paymentExpected,status
ORD-SAMP-001,CUST001,Aarav Shah,1500.00,UPI_GPAY,2024-01-15T10:00:00Z,UNPAID
ORD-SAMP-002,CUST002,Priya Nair,25000.00,CARD_VISA,2024-01-15T11:00:00Z,UNPAID
ORD-SAMP-003,CUST003,Rohit Sharma,499.00,WALLET_PAYTM,2024-01-15T11:00:00Z,UNPAID
ORD-SAMP-004,CUST004,Ananya Patel,7500.00,UPI_PHONEPE,2024-01-14T11:00:00Z,UNPAID
ORD-SAMP-005,CUST005,Vikas Kumar,12000.00,CARD_MC,2024-01-15T12:00:00Z,UNPAID`;

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

// ─── Upload Zone Component ────────────────────────────────────────────────────
interface UploadZoneProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  data: Record<string, string>[];
  onDataLoaded: (rows: Record<string, string>[]) => void;
  onSampleLoad: () => void;
  sampleLabel: string;
}

function UploadZone({ title, subtitle, icon: Icon, data, onDataLoaded, onSampleLoad, sampleLabel }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setProgress(0);

    // Simulate parsing animation
    for (let p = 0; p <= 100; p += 20) {
      await new Promise(r => setTimeout(r, 80));
      setProgress(p);
    }

    const text = await file.text();
    const rows = parseCSV(text);
    onDataLoaded(rows);
    setParsing(false);
    toast.success(`Parsed ${rows.length} rows from ${file.name}`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.json'))) {
      handleFile(file);
    } else {
      toast.error('Please upload a CSV or JSON file');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Zone header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
          <Icon size={15} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
        {data.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
            <CheckCircle size={11} className="text-emerald-500" />
            <span className="text-[11px] font-semibold text-emerald-600">{data.length} rows loaded</span>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`m-4 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}
        `}
      >
        <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="space-y-3">
            <RefreshCw size={24} className="mx-auto text-indigo-400 animate-spin" />
            <p className="text-xs font-medium text-slate-600">Parsing file...</p>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-xs mx-auto">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <Upload size={24} className="mx-auto text-slate-300 mb-3" />
            <p className="text-xs font-medium text-slate-600">
              Drop a CSV or JSON file here
            </p>
            <p className="text-[11px] text-slate-400 mt-1">or click to browse files</p>
            {fileName && (
              <p className="text-[11px] text-indigo-600 font-medium mt-2">✓ {fileName}</p>
            )}
          </>
        )}
      </div>

      {/* Load sample button */}
      <div className="px-4 pb-4 flex gap-2">
        <button onClick={onSampleLoad}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors btn-press">
          <FileText size={12} /> {sampleLabel}
        </button>
      </div>

      {/* Preview table */}
      {data.length > 0 && (
        <div className="border-t border-slate-100">
          <div className="px-5 py-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Preview (first 5 rows)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/50">
                  {Object.keys(data[0]).map(key => (
                    <th key={key} className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 5).map((row, i) => (
                  <tr key={i} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-4 py-2 text-[11px] text-slate-700 font-mono truncate max-w-[120px]">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ingestion History ────────────────────────────────────────────────────────
function IngestionHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['ingest-history'],
    queryFn: async () => { const { data } = await api.get('/ingest/history'); return data; },
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Ingestion History</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Recent data import events</p>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3">
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {(data?.history || []).map((event: {
            id: number; type: string; source: string; rows: number; status: string; timestamp: string;
          }) => (
            <div key={event.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                event.status === 'Success' ? 'bg-emerald-500' :
                event.status === 'Partial Errors' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-800">{event.type}</span>
                  <span className="text-[11px] text-slate-400">·</span>
                  <span className="text-[11px] text-slate-500">{event.source}</span>
                </div>
                <p className="text-[11px] text-slate-400">{formatDateTime(event.timestamp)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-800">{event.rows.toLocaleString('en-IN')} rows</p>
                <span className={`text-[11px] font-medium ${
                  event.status === 'Success' ? 'text-emerald-600' :
                  event.status === 'Partial Errors' ? 'text-amber-600' : 'text-red-600'
                }`}>{event.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ingest Page ──────────────────────────────────────────────────────────────
export function IngestPage() {
  const queryClient = useQueryClient();
  const [txData, setTxData] = useState<Record<string, string>[]>([]);
  const [orderData, setOrderData] = useState<Record<string, string>[]>([]);
  const [runEngine, setRunEngine] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isIngesting, setIsIngesting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const handleLoadSampleTx = () => {
    const rows = parseCSV(SAMPLE_TX_CSV);
    setTxData(rows);
    toast.success(`Loaded ${rows.length} sample transactions`);
  };

  const handleLoadSampleOrders = () => {
    const rows = parseCSV(SAMPLE_ORDER_CSV);
    setOrderData(rows);
    toast.success(`Loaded ${rows.length} sample orders`);
  };

  const handleIngest = async () => {
    if (txData.length === 0 && orderData.length === 0) {
      toast.error('Please load some data first');
      return;
    }
    setIsIngesting(true);
    setProgress(0);
    setLogs([]);

    const steps = [
      { msg: 'Validating schema fields...', progress: 10 },
      { msg: `Ingesting ${txData.length} transactions...`, progress: 30 },
      { msg: `Ingesting ${orderData.length} orders...`, progress: 50 },
      { msg: 'Running reconciliation engine...', progress: 70 },
      { msg: 'Persisting results to database...', progress: 90 },
    ];

    for (const step of steps) {
      await new Promise(r => setTimeout(r, 300));
      setProgress(step.progress);
      setLogs(prev => [...prev, step.msg]);
    }

    try {
      const { data } = await api.post('/ingest', {
        transactions: txData.length > 0 ? txData : undefined,
        orders: orderData.length > 0 ? orderData : undefined,
        runEngine,
      });
      setProgress(100);
      setLogs(prev => [...prev, `✓ Ingestion complete — ${data.ingested.transactions} tx, ${data.ingested.orders} orders`]);
      if (data.reconciliationRun) {
        setLogs(prev => [...prev, `✓ Reconciliation: ${data.reconciliationRun.saved} results saved`]);
      }
      if (data.ingested.errors > 0) {
        setLogs(prev => [...prev, `⚠ ${data.ingested.errors} rows had errors`]);
      }
      toast.success('Ingestion complete!');
      queryClient.invalidateQueries({ queryKey: ['ingest-history'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      toast.error('Ingestion failed');
      setLogs(prev => [...prev, '✗ Error during ingestion']);
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Upload zones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <UploadZone
          title="Payment Gateway Export"
          subtitle="Bank / UPI / Card transaction records"
          icon={Upload}
          data={txData}
          onDataLoaded={setTxData}
          onSampleLoad={handleLoadSampleTx}
          sampleLabel="Load Sample Transactions"
        />
        <UploadZone
          title="Sales Orders Feed"
          subtitle="Internal ERP / order management records"
          icon={FileText}
          data={orderData}
          onDataLoaded={setOrderData}
          onSampleLoad={handleLoadSampleOrders}
          sampleLabel="Load Sample Orders"
        />
      </div>

      {/* Run section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Run Ingestion</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {txData.length + orderData.length > 0
                ? `Ready to ingest ${txData.length} transactions + ${orderData.length} orders`
                : 'Load data above to begin'
              }
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setRunEngine(!runEngine)}
                className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${runEngine ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${runEngine ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-slate-600">Auto-run reconciliation</span>
            </label>
            <button
              onClick={handleIngest}
              disabled={isIngesting || (txData.length === 0 && orderData.length === 0)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors btn-press disabled:opacity-50"
            >
              {isIngesting
                ? <><RefreshCw size={12} className="animate-spin" /> Processing...</>
                : <><Play size={12} /> Run Ingestion</>
              }
            </button>
          </div>
        </div>

        {/* Progress */}
        {(isIngesting || logs.length > 0) && (
          <div className="mt-4 space-y-3">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="bg-slate-900 rounded-lg p-4 font-mono text-[11px] text-emerald-400 space-y-1 max-h-40 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                  <span>{log}</span>
                </div>
              ))}
              {isIngesting && <div className="text-slate-400 animate-pulse">Processing...</div>}
            </div>
            {progress === 100 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle size={14} className="text-emerald-500" />
                <p className="text-xs font-semibold text-emerald-700">Ingestion completed successfully</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      <IngestionHistory />
    </div>
  );
}
