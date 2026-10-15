// Minimal JSON Schema validator for exactly the D-015 subset (amended 2026-10-15).
// validate(schema, data) -> [{ path, message }]; never throws on invalid data.
// An unsupported keyword anywhere in the schema yields E-SCHEMA-UNSUPPORTED errors and no data check.

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', '$defs']);
const KEYWORDS = new Set([
  'type', 'properties', 'required', 'items', 'enum', 'format',
  'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
  'minItems', 'maxItems', '$ref', 'additionalProperties',
]);
const TYPES = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array', 'null']);
const FORMATS = {
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isRealDate(s),
  'date-time': (s) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(s) && isRealDate(s.slice(0, 10)),
  // ponytail: pragmatic email check (one @, a dot in the domain); full RFC 5322 is not worth it here.
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  uri: (s) => {
    try { return Boolean(new URL(s).protocol); } catch { return false; }
  },
};

function isRealDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Returns E-SCHEMA-UNSUPPORTED errors for every keyword outside the subset.
export function unsupportedKeywords(schema, path = '') {
  const errors = [];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [{ path, message: 'E-SCHEMA-UNSUPPORTED: a schema must be an object' }];
  }
  const flag = (key, why) => errors.push({ path: `${path}/${key}`, message: `E-SCHEMA-UNSUPPORTED: ${why}` });
  for (const [key, value] of Object.entries(schema)) {
    if (ANNOTATIONS.has(key)) continue;
    if (!KEYWORDS.has(key)) { flag(key, `keyword "${key}" is outside the D-015 subset`); continue; }
    if (key === 'type') {
      const ok = typeof value === 'string'
        ? TYPES.has(value)
        : Array.isArray(value) && value.length === 2 && value[1] === 'null' && TYPES.has(value[0]);
      if (!ok) flag(key, `type ${JSON.stringify(value)} is not a basic type or [X, "null"]`);
    }
    if (key === 'format' && !FORMATS[value]) flag(key, `format "${value}" is not date, date-time, email or uri`);
    if (key === '$ref' && !/^#\/\$defs\/[^/]+$/.test(value)) flag(key, `$ref "${value}" is not a local #/$defs/ reference`);
    if (key === 'additionalProperties' && value !== false) flag(key, 'additionalProperties is only supported as false');
    if (key === 'items' && Array.isArray(value)) flag(key, 'tuple items are not supported');
  }
  for (const [name, sub] of Object.entries(schema.properties ?? {})) errors.push(...unsupportedKeywords(sub, `${path}/properties/${name}`));
  for (const [name, sub] of Object.entries(schema.$defs ?? {})) errors.push(...unsupportedKeywords(sub, `${path}/$defs/${name}`));
  if (schema.items && !Array.isArray(schema.items)) errors.push(...unsupportedKeywords(schema.items, `${path}/items`));
  return errors;
}

export function validate(schema, data) {
  const unsupported = unsupportedKeywords(schema);
  if (unsupported.length) return unsupported;
  const errors = [];
  check(schema, data, '', schema, errors);
  return errors;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function matchesType(t, v) {
  if (t === 'integer') return Number.isInteger(v);
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  return typeOf(v) === t;
}

function check(schema, data, path, root, errors) {
  const err = (message, at = path) => errors.push({ path: at, message });

  if (schema.$ref) {
    const target = root.$defs?.[schema.$ref.slice('#/$defs/'.length)];
    if (!target) return err(`$ref ${schema.$ref} does not exist`);
    return check(target, data, path, root, errors);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(t, data))) return err(`expected ${types.join(' or ')}, got ${typeOf(data)}`);
  }

  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(data))) {
    err(`must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof data === 'string') {
    const len = [...data].length;
    if (schema.minLength !== undefined && len < schema.minLength) err(`shorter than ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && len > schema.maxLength) err(`longer than ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(data)) err(`does not match ${schema.pattern}`);
    if (schema.format && !FORMATS[schema.format](data)) err(`is not a valid ${schema.format}`);
  }

  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) err(`below the minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) err(`above the maximum ${schema.maximum}`);
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) err(`fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) err(`more than ${schema.maxItems} items`);
    if (schema.items) data.forEach((item, i) => check(schema.items, item, `${path}/${i}`, root, errors));
  }

  if (typeOf(data) === 'object') {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in data)) err(`required property "${key}" is missing`, `${path}/${key}`);
    }
    for (const [key, value] of Object.entries(data)) {
      if (props[key]) check(props[key], value, `${path}/${key}`, root, errors);
      else if (schema.additionalProperties === false) err(`property "${key}" is not allowed`, `${path}/${key}`);
    }
  }
}
