import type { Form } from "@dhtmlx/suite";

export type ValidationRules = {
  min_length?: number;
  pattern?: { expression: string; flags?: string; message?: string };
  matches_field?: string;
  unique?: boolean;
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
};

export function fieldError(field: FieldDefinition, raw: unknown, values: Record<string, unknown>): string | null {
  if(field.type === "checkbox") {
    return raw === true || raw === false || raw === 0 || raw === 1 || raw === "0" || raw === "1" ? null : "Csak 0 vagy 1 érték adható meg.";
  }
  const value = field.secret || field.type === "password" ? String(raw ?? "") : String(raw ?? "").trim();
  if (value === "") return field.required ? "Kötelező mező." : null;
  const length = Array.from(value).length;
  if (value.includes("\0")) return "Hibás szöveges érték.";
  if (length > field.max) return `Legfeljebb ${field.max} karakter adható meg.`;
  const rules = field.validation ?? {};
  if (length < (rules.min_length ?? 0)) return `Legalább ${rules.min_length} karakter szükséges.`;
  if (rules.pattern && !new RegExp(rules.pattern.expression, rules.pattern.flags ?? "").test(value)) {
    return rules.pattern.message ?? "Hibás formátum.";
  }
  if (rules.matches_field && value !== String(values[rules.matches_field] ?? "")) return "A két mező értéke nem egyezik.";
  if (field.type === "number" && !/^[0-9]+$/.test(value)) return "Nemnegatív egész szám szükséges.";
  if (field.type === "select" && !Object.hasOwn(field.options, value)) return "Válassz az engedélyezett értékekből.";
  return null;
}

/** All validation feedback uses native DHTMLX Form items. */
export class FormValidation {
  private serverErrors = new Map<string, string>();

  constructor(private form: Form, private fields: FieldDefinition[]) {
    for (const field of fields) {
      const item = form.getItem(field.name);
      if (!item) continue;
      item.setProperties({
        validation: (value: unknown) => !this.error(field, value),
        errorMessage: field.validation?.pattern?.message ?? "Ellenőrizd a mező értékét.",
      });
      const clear = () => {
        this.serverErrors.delete(field.name);
        item.clearValidate();
      };
      item.events.on("input", clear);
      item.events.on("change", clear);
    }
  }

  private error(field: FieldDefinition, value: unknown): string | null {
    return this.serverErrors.get(field.name) ?? fieldError(field, value, this.form.getValue());
  }

  validate(): boolean {
    const values = this.form.getValue();
    for (const field of this.fields) {
      const item = this.form.getItem(field.name);
      if (item) item.setProperties({ errorMessage: this.error(field, values[field.name]) ?? "" });
    }
    return this.form.validate();
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
}
