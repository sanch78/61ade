import { t } from "./I18n";
import { type Form } from "@dhtmlx/suite";
import { acknowledge } from "./MessageDialog";
import type { UploadPolicy } from "./Uploader";

export type ValidationRules = {
  minLength?: number;
  pattern?: { expression: string; flags?: string; message?: string };
  matchesField?: string;
  /** A range end: not before / not after the other field's value (dates and text as strings, integers as numbers). */
  notBeforeField?: string;
  notAfterField?: string;
  unique?: boolean;
};
/**
 * Browser metadata of a `file` field: the file manager resource, its mount, the resolved folder
 * (`folderId`, the mount root when absent), accepted MIME classes, the file manager's upload policy
 * and whether the actor may upload there (`canUpload`) and browse it (`canChoose`). The value is the file id.
 */
export type FileFieldConfig = {
  resource: string;
  mount: string;
  folderId?: string | null;
  accept?: string[];
  policy?: UploadPolicy;
  canUpload?: boolean;
  canChoose?: boolean;
};
export type FieldDefinition = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  max: number;
  options: Record<string, string>;
  secret?: boolean;
  defaultValue?: string | null;
  validation?: ValidationRules;
  bulk?: boolean;
  file?: FileFieldConfig;
  /** Conditional field: it takes part only while the field `field` of the record holds one of `in`. */
  visibleWhen?: { field: string; in: string[] };
  /** Exclusive choice: a value of this field empties these fields of the record. */
  clears?: string[];
};
/**
 * Whether a conditional field takes part for the form's values; a condition whose field is not in $values (not on the
 * form) leaves the decision to the server, which reads the stored value.
 */
export function fieldActive(field: FieldDefinition, values: Record<string, unknown>): boolean {
  const when = field.visibleWhen;
  if (!when || !Object.hasOwn(values, when.field)) return true;
  const value = values[when.field];
  return when.in.includes(typeof value === "boolean" ? (value ? "1" : "0") : String(value ?? ""));
}
/** Visible Form item of a `file` field (its read-only file name); the value lives in the hidden item of the field name. */
export const fileDisplay = (name: string) => name + "__display";

/** <0, 0 or >0 as $value is before, equal to or after $other (the server's ValidationRules::compare); 0 when $other is empty. */
function compare(value: string, other: unknown): number {
  const end = String(dateValue(other) ?? "").trim();
  if (end === "") return 0;
  if (/^[0-9]+$/.test(value) && /^[0-9]+$/.test(end)) { const a = value.replace(/^0+/, ""), b = end.replace(/^0+/, ""); return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); }
  return value < end ? -1 : value > end ? 1 : 0;
}
/** A real calendar date `YYYY-MM-DD`. */
export const calendarDate = (value: string): boolean => {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[3];
};
/** A `date` field value from a Suite date picker (a `%Y-%m-%d` string or a local Date) as `YYYY-MM-DD`; anything else unchanged. */
export const dateValue = (value: unknown): unknown => {
  if (!(value instanceof Date)) return value;
  if (Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

export function fieldError(field: FieldDefinition, raw: unknown, values: Record<string, unknown>): string | null {
  if(field.type === "multiselect" && Array.isArray(raw)) raw = raw.join(",");
  if(field.type === "date") raw = dateValue(raw);
  if(field.type === "checkbox") {
    if(![true,false,0,1,"0","1"].includes(raw as any))return t("Csak 0 vagy 1 érték adható meg.");
    if(typeof raw === "boolean")raw=raw?"1":"0";
  }
  const value = field.secret || field.type === "password" ? String(raw ?? "") : String(raw ?? "").trim();
  if (value === "") return field.required ? t("Kötelező mező.") : null;
  const length = Array.from(value).length;
  if (value.includes("\0")) return t("Hibás szöveges érték.");
  if (length > field.max) return t("Legfeljebb {count} karakter adható meg.",{count:field.max});
  const rules = field.validation ?? {};
  if (length < (rules.minLength ?? 0)) return t("Legalább {count} karakter szükséges.",{count:rules.minLength});
  if (rules.pattern && !new RegExp(rules.pattern.expression, rules.pattern.flags ?? "").test(value)) {
    return t(rules.pattern.message ?? "Hibás formátum.");
  }
  if (rules.matchesField && value !== String(values[rules.matchesField] ?? "")) return t("A két mező értéke nem egyezik.");
  if (rules.notBeforeField && compare(value, values[rules.notBeforeField]) < 0) return t("Nem lehet korábbi vagy kisebb a kezdő értéknél.");
  if (rules.notAfterField && compare(value, values[rules.notAfterField]) > 0) return t("Nem lehet későbbi vagy nagyobb a záró értéknél.");
  if (field.type === "date" && !calendarDate(value)) return t("Érvényes dátum szükséges (ÉÉÉÉ-HH-NN).");
  if (field.type === "number" && !/^[0-9]+$/.test(value)) return t("Nemnegatív egész szám szükséges.");
  if (field.type === "select" && !Object.hasOwn(field.options, value)) return t("Válassz az engedélyezett értékekből.");
  if (field.type === "multiselect") {
    const items = value.split(",");
    if (new Set(items).size !== items.length || items.some(item => !Object.hasOwn(field.options, item))) return t("Válassz az engedélyezett értékekből.");
  }
  return null;
}

/** All validation feedback uses native DHTMLX Form items. */
export class FormValidation {
  private serverErrors = new Map<string, string>();

  constructor(private form: Form, private fields: FieldDefinition[], private context:()=>Record<string,unknown>=()=>({})) {
    for (const field of fields) {
      const item = form.getItem(field.name);
      if (!item) continue;
      // A file field keeps its id in a hidden item: the native error caption belongs to its visible name item.
      const target = this.target(field);
      target.setProperties({
        validation: (value: unknown) => !this.error(field, field.type === "file" ? this.form.getValue()[field.name] : value),
        errorMessage: t(field.validation?.pattern?.message ?? "Ellenőrizd a mező értékét."),
      });
      const clear = () => {
        this.serverErrors.delete(field.name);
        target.clearValidate();
      };
      item.events.on("input", clear);
      item.events.on("change", clear);
    }
  }

  private target(field: FieldDefinition): any {
    return (field.type === "file" ? this.form.getItem(fileDisplay(field.name)) : undefined) ?? this.form.getItem(field.name);
  }

  private error(field: FieldDefinition, value: unknown): string | null {
    const values = {...this.context(),...this.form.getValue()};
    // A conditional field the form hides is not validated; the server stores it empty.
    if (!fieldActive(field, values)) return null;
    return this.serverErrors.get(field.name) ?? fieldError(field, value, values);
  }

  validate(): boolean {
    const values = this.form.getValue();
    let valid=true;
    for (const field of this.fields) {
      const item = this.form.getItem(field.name) ? this.target(field) : undefined;
      const error=this.error(field,values[field.name]);
      if(error)valid=false;
      if (item) item.setProperties({errorMessage:error??""});
    }
    const nativeValid=this.form.validate();
    // Suite 9 Checkbox only renders validation captions when it requires a checked value.
    // Keep unchecked valid and show checkbox rule errors with the native Alert instead.
    const checkboxErrors=this.fields.filter(field=>field.type === "checkbox")
      .map(field=>{const error=this.error(field,values[field.name]);return error?`${field.label}: ${error}`:null;}).filter(Boolean);
    if(checkboxErrors.length)void acknowledge({title:t("Ellenőrizd a mezőt"),message:checkboxErrors.join("\n"),severity:"warning"});
    return nativeValid && valid;
  }

  showServerErrors(errors: Record<string, string>): boolean {
    let found = false;
    for (const field of this.fields) {
      if (typeof errors[field.name] !== "string" || !this.form.getItem(field.name)) continue;
      this.serverErrors.set(field.name, errors[field.name]);
      found = true;
    }
    if (found) {
      this.form.enable();
      this.validate();
    }
    return found;
  }

  /** Drops a shown server or cross-field error when a related field changes. */
  clearServerError(name: string): void {
    if (!this.serverErrors.delete(name)) return;
    const field = this.fields.find(field => field.name === name);
    (field && this.form.getItem(name) ? this.target(field) : this.form.getItem(name))?.clearValidate();
  }
}
