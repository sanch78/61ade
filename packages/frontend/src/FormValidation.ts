import { t } from "./I18n";
import { type Form } from "@dhtmlx/suite";
import { acknowledge } from "./MessageDialog";
import type { UploadPolicy } from "./Uploader";

export type ValidationRules = {
  minLength?: number;
  pattern?: { expression: string; flags?: string; message?: string };
  matchesField?: string;
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
};
/** Visible Form item of a `file` field (its read-only file name); the value lives in the hidden item of the field name. */
export const fileDisplay = (name: string) => name + "__display";

export function fieldError(field: FieldDefinition, raw: unknown, values: Record<string, unknown>): string | null {
  if(field.type === "multiselect" && Array.isArray(raw)) raw = raw.join(",");
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
    return this.serverErrors.get(field.name) ?? fieldError(field, value, {...this.context(),...this.form.getValue()});
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
