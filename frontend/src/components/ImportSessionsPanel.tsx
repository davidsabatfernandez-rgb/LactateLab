import { ChangeEvent, useMemo, useState } from "react";

import { api } from "../lib/api";

type ImportColumnOption = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
};

type ImportIssue = {
  row_number?: number | null;
  message: string;
  severity: string;
};

type ImportPreview = {
  filename: string;
  headers: string[];
  column_options: ImportColumnOption[];
  suggested_mapping: Record<string, string>;
  active_mapping: Record<string, string>;
  defaults: Record<string, string>;
  missing_required_fields: string[];
  issues: ImportIssue[];
  preview_rows: Array<{
    row_number: number;
    values: Record<string, string | number | null>;
    normalized: Record<string, string | number | null>;
    errors: string[];
  }>;
  total_rows: number;
  can_import: boolean;
};

type ImportSessionsPanelProps = {
  token: string;
  onImported: () => Promise<void>;
};

function buildFormData(file: File, mapping?: Record<string, string>) {
  const formData = new FormData();
  formData.append("file", file);
  if (mapping) {
    formData.append("mapping", JSON.stringify(mapping));
  }
  return formData;
}

export function ImportSessionsPanel({ token, onImported }: ImportSessionsPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMapping = useMemo(() => (preview ? { ...preview.active_mapping, ...mapping } : mapping), [preview, mapping]);

  async function runPreview(selectedFile: File, nextMapping?: Record<string, string>) {
    setLoadingPreview(true);
    setError(null);
    setMessage(null);
    try {
      const result = (await api.importPreview(token, buildFormData(selectedFile, nextMapping))) as ImportPreview;
      setPreview(result);
      setMapping(result.active_mapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo previsualizar el archivo.");
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    runPreview(selectedFile);
  }

  function handleMappingChange(key: string, value: string) {
    setMapping((current) => ({ ...current, [key]: value }));
  }

  async function revalidate() {
    if (!file) return;
    await runPreview(file, activeMapping);
  }

  async function handleImport() {
    if (!file) return;
    setLoadingImport(true);
    setError(null);
    setMessage(null);
    try {
      const result = (await api.importCommit(token, buildFormData(file, activeMapping))) as {
        imported_sessions: number;
        imported_intervals: number;
      };
      setMessage(`Importadas ${result.imported_sessions} sesiones y ${result.imported_intervals} intervalos.`);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setLoadingImport(false);
    }
  }

  return (
    <section className="card import-card">
      <div className="card-header">
        <div>
          <span className="eyebrow">Bulk Import</span>
          <h2>CSV y Excel</h2>
          <p className="muted">Sube un archivo, mapea columnas, revisa errores y confirma la importación.</p>
        </div>
        <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p>{message}</p> : null}
      {preview ? (
        <div className="import-grid">
          <div className="list">
            <div className="list-item">
              <strong>{preview.filename}</strong>
              <p>{preview.total_rows} filas detectadas</p>
              <p>{preview.can_import ? "Listo para importar" : "Hay errores que corregir"}</p>
            </div>
            {preview.column_options.map((option) => (
              <label key={option.key} className="mapping-row">
                <span>
                  {option.label}
                  {option.required ? " *" : ""}
                </span>
                <select value={activeMapping[option.key] ?? ""} onChange={(event) => handleMappingChange(option.key, event.target.value)}>
                  <option value="">Sin mapear</option>
                  {preview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="button-row">
              <button className="ghost-button" onClick={revalidate} disabled={loadingPreview}>
                {loadingPreview ? "Validando..." : "Revalidar"}
              </button>
              <button className="primary-button" onClick={handleImport} disabled={!preview.can_import || loadingImport}>
                {loadingImport ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
          <div className="list">
            <div className="list-item">
              <strong>Errores y validación</strong>
              {preview.issues.length ? (
                preview.issues.slice(0, 10).map((issue) => (
                  <p key={`${issue.row_number ?? "global"}-${issue.message}`}>
                    {issue.row_number ? `Fila ${issue.row_number}: ` : ""}
                    {issue.message}
                  </p>
                ))
              ) : (
                <p>Sin errores detectados.</p>
              )}
            </div>
            <div className="list-item">
              <strong>Previsualización</strong>
              <div className="preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Atleta</th>
                      <th>Fecha</th>
                      <th>Disciplina</th>
                      <th>Duración</th>
                      <th>Lactato</th>
                      <th>Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview_rows.map((row) => (
                      <tr key={row.row_number}>
                        <td>{row.row_number}</td>
                        <td>{String(row.normalized.athlete ?? "-")}</td>
                        <td>{String(row.normalized.date ?? "-")}</td>
                        <td>{String(row.normalized.discipline ?? "-")}</td>
                        <td>{String(row.normalized.interval_duration ?? "-")}</td>
                        <td>{String(row.normalized.lactate ?? "-")}</td>
                        <td>{row.errors.join(", ") || "OK"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
