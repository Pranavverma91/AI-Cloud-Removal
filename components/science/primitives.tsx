"use client";
import Link from "next/link";
import { Orbit, Database, RefreshCw } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
export function Brand() {
  return (
    <Link href="/" className="se-brand">
      <Orbit />
      <span>
        AI-Based Cloud Removal
        <br />
        and Reconstruction
        <small>PERSONAL EARTH OBSERVATION</small>
      </span>
    </Link>
  );
}
export function SelectBox({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="se-select">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Title({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="se-title">
      <div>
        <p className="se-eyebrow">{eyebrow || "PERSONAL EARTH OBSERVATION"}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="se-notice" role="status">
      {children}
    </div>
  );
}
export function Failure({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="se-error" role="alert">
      <strong>Unable to load this resource</strong>
      <p>{message}</p>
      {retry && (
        <button className="se-button" onClick={retry}>
          <RefreshCw size={16} />
          Retry
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="se-empty">
      <Database />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="se-loading" role="status">
      Loading observations…
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="se-badge">{children}</span>;
}
