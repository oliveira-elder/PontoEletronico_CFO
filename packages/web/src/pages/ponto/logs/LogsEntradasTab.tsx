import React, { useState, useCallback, useEffect } from "react";
import { api } from "../../../hooks/useApi";
import { useLogsStream } from "../../../hooks/useLogsStream";
import { SearchIcon, DownloadIcon, RefreshCwIcon } from "../../../components/icons";
import {
  datetimeLocalBrasiliaParaIso,
  formatDateTimeBrasilia
} from "../../../utils/horario-brasilia";

interface LogEntry {
  id: string;
  tracker: string | null;
  category: string;
  method: string | null;
  path: string | null;
  action: string;
  statusCode: number | null;
  durationMs: number | null;
  ipAddress: string | null;
  username: string | null;
  actorUserId: string | null;
  payload: unknown;
  createdAt: string;
}

interface FilterState {
  category: string;
  method: string;
  statusCode: string;
  username: string;
  path: string;
  tracker: string;
  from: string;
  to: string;
}

const CATEGORY_STYLE: Record<string, React.CSSProperties> = {
  SUCCESS: { background: "#dcfce7", color: "#15803d" },
  FAILURE: { background: "#fef9c3", color: "#92400e" },
  ERROR: { background: "#fee2e2", color: "#991b1b" }
};

const STATUS_COLOR = (code: number | null) => {
  if (!code) return "#94a3b8";
  if (code < 300) return "#22c55e";
  if (code < 400) return "#06b6d4";
  if (code < 500) return "#f59e0b";
  return "#ef4444";
};

export function LogsEntradasTab({ getToken }: { getToken?: () => string | undefined }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { newCount, resetCount } = useLogsStream(getToken);

  const [filter, setFilter] = useState<FilterState>({
    category: "",
    method: "",
    statusCode: "",
    username: "",
    path: "",
    tracker: "",
    from: "",
    to: ""
  });

  const LIMIT = 50;

  const load = useCallback(
    async (p = 0) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: String(LIMIT), page: String(p) });
        if (filter.category) params.set("category", filter.category);
        if (filter.method) params.set("method", filter.method);
        if (filter.statusCode) params.set("statusCode", filter.statusCode);
        if (filter.username) params.set("username", filter.username);
        if (filter.path) params.set("path", filter.path);
        if (filter.tracker) params.set("tracker", filter.tracker);
        if (filter.from) {
          const from = datetimeLocalBrasiliaParaIso(filter.from);
          if (from) params.set("from", from);
        }
        if (filter.to) {
          const to = datetimeLocalBrasiliaParaIso(filter.to);
          if (to) params.set("to", to);
        }

        const res = await api.get<{ items: LogEntry[]; total: number }>(`/logs/entries?${params}`);
        setEntries(res.items);
        setTotal(res.total);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function exportCsv() {
    const params = new URLSearchParams();
    if (filter.category) params.set("category", filter.category);
    if (filter.method) params.set("method", filter.method);
    if (filter.statusCode) params.set("statusCode", filter.statusCode);
    if (filter.username) params.set("username", filter.username);
    if (filter.path) params.set("path", filter.path);
    if (filter.tracker) params.set("tracker", filter.tracker);
    if (filter.from) {
      const from = datetimeLocalBrasiliaParaIso(filter.from);
      if (from) params.set("from", from);
    }
    if (filter.to) {
      const to = datetimeLocalBrasiliaParaIso(filter.to);
      if (to) params.set("to", to);
    }

    const a = document.createElement("a");
    a.href = `/api/logs/export/csv?${params}`;
    a.download = `logs-${Date.now()}.csv`;
    a.click();
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filtros */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          border: "1px solid var(--border, #e2e8f0)",
          borderRadius: 10,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10
        }}
      >
        <FilterSelect
          label="Categoria"
          value={filter.category}
          onChange={(v) => setFilter((f) => ({ ...f, category: v }))}
        >
          <option value="">Todas</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILURE">FAILURE</option>
          <option value="ERROR">ERROR</option>
        </FilterSelect>
        <FilterSelect
          label="Método"
          value={filter.method}
          onChange={(v) => setFilter((f) => ({ ...f, method: v }))}
        >
          <option value="">Todos</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </FilterSelect>
        <FilterInput
          label="HTTP Code"
          value={filter.statusCode}
          onChange={(v) => setFilter((f) => ({ ...f, statusCode: v }))}
          placeholder="ex: 404"
          type="number"
        />
        <FilterInput
          label="Usuário"
          value={filter.username}
          onChange={(v) => setFilter((f) => ({ ...f, username: v }))}
          placeholder="username"
        />
        <FilterInput
          label="Path"
          value={filter.path}
          onChange={(v) => setFilter((f) => ({ ...f, path: v }))}
          placeholder="/api/..."
        />
        <FilterInput
          label="Tracker (UUID)"
          value={filter.tracker}
          onChange={(v) => setFilter((f) => ({ ...f, tracker: v }))}
          placeholder="uuid"
        />
        <FilterInput
          label="De (Brasília)"
          value={filter.from}
          onChange={(v) => setFilter((f) => ({ ...f, from: v }))}
          type="datetime-local"
        />
        <FilterInput
          label="Até (Brasília)"
          value={filter.to}
          onChange={(v) => setFilter((f) => ({ ...f, to: v }))}
          type="datetime-local"
        />
      </div>

      {/* Barra de ações */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => load(0)}
          disabled={loading}
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <SearchIcon size={14} /> Filtrar
        </button>
        <button
          onClick={exportCsv}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 6,
            border: "1px solid var(--border, #e2e8f0)",
            background: "white",
            cursor: "pointer",
            fontSize: 13
          }}
        >
          <DownloadIcon size={14} /> Exportar CSV
        </button>
        {newCount > 0 && (
          <button
            onClick={() => {
              resetCount();
              void load(0);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 6,
              border: "1px solid #6366f1",
              background: "#eef2ff",
              color: "#4338ca",
              cursor: "pointer",
              fontSize: 13
            }}
          >
            <RefreshCwIcon size={14} /> {newCount} novo{newCount !== 1 ? "s" : ""} log
            {newCount !== 1 ? "s" : ""}
          </button>
        )}
        <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 13 }}>
          {total.toLocaleString("pt-BR")} registro{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabela */}
      <div
        style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border, #e2e8f0)" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid var(--border, #e2e8f0)" }}>
              {[
                "Timestamp (Brasília)",
                "Tracker",
                "Categoria",
                "Origem (IP)",
                "Ator",
                "Método",
                "HTTP",
                "Tempo(ms)",
                "Endpoint",
                "Mensagem"
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "#475569",
                    whiteSpace: "nowrap"
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <React.Fragment key={e.id}>
                <tr
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  style={{
                    borderBottom: "1px solid var(--border, #e2e8f0)",
                    cursor: "pointer",
                    background: expanded === e.id ? "#f0f9ff" : "white",
                    transition: "background 0.1s"
                  }}
                >
                  <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "#64748b" }}>
                    {formatDateTimeBrasilia(e.createdAt)}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: "#94a3b8",
                      maxWidth: 100,
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {e.tracker ? e.tracker.slice(0, 8) + "…" : "—"}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span
                      style={{
                        ...CATEGORY_STYLE[e.category],
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontWeight: 600,
                        fontSize: 11
                      }}
                    >
                      {e.category}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", color: "#475569" }}>{e.ipAddress ?? "—"}</td>
                  <td style={{ padding: "9px 12px", color: "#334155", fontWeight: 500 }}>
                    {e.username ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "#6366f1"
                    }}
                  >
                    {e.method ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      fontWeight: 700,
                      color: STATUS_COLOR(e.statusCode)
                    }}
                  >
                    {e.statusCode ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      color: (e.durationMs ?? 0) > 1000 ? "#ef4444" : "#64748b"
                    }}
                  >
                    {e.durationMs ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#334155"
                    }}
                  >
                    {e.path ?? e.action}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      maxWidth: 250,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#64748b"
                    }}
                  >
                    {e.action}
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr style={{ background: "#f0f9ff" }}>
                    <td colSpan={10} style={{ padding: "12px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#64748b",
                              marginBottom: 4
                            }}
                          >
                            TRACKER COMPLETO
                          </div>
                          <code style={{ fontSize: 11, color: "#334155" }}>{e.tracker ?? "—"}</code>
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#64748b",
                              marginBottom: 4
                            }}
                          >
                            ACTOR USER ID
                          </div>
                          <code style={{ fontSize: 11, color: "#334155" }}>
                            {e.actorUserId ?? "—"}
                          </code>
                        </div>
                        {e.payload != null && (
                          <div style={{ gridColumn: "1 / -1" }}>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#64748b",
                                marginBottom: 4
                              }}
                            >
                              PAYLOAD
                            </div>
                            <pre
                              style={{
                                fontSize: 11,
                                background: "#1e293b",
                                color: "#e2e8f0",
                                borderRadius: 6,
                                padding: 10,
                                margin: 0,
                                overflowX: "auto"
                              }}
                            >
                              {JSON.stringify(e.payload as Record<string, unknown>, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <button
            onClick={() => load(page - 1)}
            disabled={page === 0 || loading}
            style={pageBtnStyle}
          >
            ←
          </button>
          <span style={{ padding: "6px 12px", fontSize: 13, color: "#475569" }}>
            Página {page + 1} de {totalPages}
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            style={pageBtnStyle}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

const pageBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid var(--border, #e2e8f0)",
  background: "white",
  cursor: "pointer",
  fontSize: 13
};

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--border, #e2e8f0)",
          fontSize: 13,
          background: "white"
        }}
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--border, #e2e8f0)",
          fontSize: 13,
          background: "white"
        }}
      >
        {children}
      </select>
    </label>
  );
}
