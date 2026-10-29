# Declarative form validation and migration

The same `Field` definition drives DHTMLX Form and server-side UI/API action
validation. Client checks give quick feedback; the backend checks every
submission. Named `fieldErrors` preserve entered form values and produce native
DHTMLX field errors.

```json
{
    "name": "contact",
    "label": "Kapcsolattartási cím",
    "required": true,
    "max": 200,
    "validation": {
        "min_length": 6,
        "pattern": {
            "expression": "^[a-z0-9_.-]+@[a-z0-9_.-]+\\.[a-z]{2,}$",
            "flags": "i",
            "message": "Érvényes kapcsolattartási cím szükséges."
        },
        "unique": true
    }
}
```

The example retains Hungarian product labels/messages.

| Rule | Behavior |
| --- | --- |
| `required`, `max` | Required value and maximum Unicode character count. Empty optional values skip format rules. |
| `validation.min_length` | Minimum Unicode character count. |
| `validation.pattern` | `expression`, optional `flags: "i"`, `message`. Use portable JavaScript/PCRE syntax without PHP delimiters. |
| `validation.matches_field` | Equality with another submitted field, for example password confirmation. |
| `validation.unique` | `SqlResource` checks the concrete table, excluding the current object on update. Server-only, without a separate client data query. |
| `type: number/select` | Nonnegative integer or a member of the ACL-filtered choices. |

Text is trimmed; spaces remain significant in `secret` fields. Password
confirmation checks the submitted pair. Patterns are trusted developer
configuration, not user-supplied regexes. Invalid definitions and unsupported
flags fail at startup. The framework does not translate all engine-specific
constructs; use portable expressions and UI/backend checks.

A uniqueness precheck gives useful feedback, but concurrent writes also require
a database UNIQUE constraint. It checks the whole table, including invisible/
deleted rows; UI filters cannot make an occupied value reusable. No other record
data is returned. Errors must never include submitted passwords, tokens or
sensitive values; audit stores field names and outcome.

<a id="kötelező-feature-migrációs-lépés"></a>

## Mandatory feature migration step

Before migrating a feature, inventory reference-module, local-override, shared-
configuration and persistence validation. Required fields alone are not parity.

1. Record each field's format, length, uniqueness, relation/cross-field constraints and protected values.
2. Put general validation in 61ade; keep concrete regexes, limits, messages and business exceptions in consumer JSON/PHP.
3. Map replaced legacy permission fields to the new ACL; do not recreate flag-based authorization.
4. Document every difference. Lost validation is not an accepted change without an owner decision.
5. Check native form feedback and direct server/API submission. Errors must not partially save; correction must allow resubmission from the same form.

Verification: `tests/shell/validation.php`, ACL executor contracts and consumer
reference-parity field/uniqueness/password/browser tests. Framework fixtures
contain no consumer names or concrete business regexes.
