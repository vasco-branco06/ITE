// JSON Schema (D-015 subset) -> Zod and Pydantic v2 source. Contract: specs/schema-generation.md.
// Pure functions: same schema in, byte-identical text out. Callers check unsupportedKeywords() first.

export class GenError extends Error {}

const header = (file, version) => `GENERATED FROM ${file} BY ITE ${version} - DO NOT EDIT. Re-run compile.`;
const pascal = (s) => String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Schema';
const str = (v) => JSON.stringify(v);
const refName = (ref) => {
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m) throw new GenError(`$ref "${ref}" must point to #/$defs/<name>`);
  return m[1];
};
const nullable = (s) => Array.isArray(s.type) && s.type.includes('null');
const baseType = (s) => (Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type);

// $defs in dependency order (a def comes after every def it references); cycles are outside the subset.
function orderedDefs(schema) {
  const defs = schema.$defs ?? {};
  const out = [];
  const state = {};
  const refsIn = (s, acc = []) => {
    if (s && typeof s === 'object') {
      if (typeof s.$ref === 'string') acc.push(refName(s.$ref));
      for (const v of Object.values(s)) refsIn(v, acc);
    }
    return acc;
  };
  const visit = (name) => {
    if (state[name] === 'done') return;
    if (state[name] === 'visiting') throw new GenError(`$defs "${name}" is recursive, which the generator does not support`);
    if (!(name in defs)) throw new GenError(`$ref to missing $defs "${name}"`);
    state[name] = 'visiting';
    refsIn(defs[name]).forEach(visit);
    state[name] = 'done';
    out.push(name);
  };
  Object.keys(defs).forEach(visit);
  return out;
}

// ---------- Zod ----------

function zodType(s, depth) {
  let t;
  if (s.$ref) t = `${pascal(refName(s.$ref))}Schema`;
  else if (s.enum) {
    t = s.enum.every((v) => typeof v === 'string')
      ? `z.enum([${s.enum.map(str).join(', ')}])`
      : s.enum.length === 1 ? `z.literal(${str(s.enum[0])})` : `z.union([${s.enum.map((v) => `z.literal(${str(v)})`).join(', ')}])`;
  } else {
    const type = baseType(s);
    if (type === 'string') {
      t = 'z.string()';
      t += { email: '.email()', uri: '.url()', date: '.date()', 'date-time': '.datetime()' }[s.format] ?? '';
      if (s.minLength !== undefined) t += `.min(${s.minLength})`;
      if (s.maxLength !== undefined) t += `.max(${s.maxLength})`;
      if (s.pattern !== undefined) t += `.regex(new RegExp(${str(s.pattern)}))`;
    } else if (type === 'integer' || type === 'number') {
      t = type === 'integer' ? 'z.number().int()' : 'z.number()';
      if (s.minimum !== undefined) t += `.min(${s.minimum})`;
      if (s.maximum !== undefined) t += `.max(${s.maximum})`;
    } else if (type === 'boolean') t = 'z.boolean()';
    else if (type === 'null') t = 'z.null()';
    else if (type === 'array') {
      t = `z.array(${s.items ? zodType(s.items, depth) : 'z.unknown()'})`;
      if (s.minItems !== undefined) t += `.min(${s.minItems})`;
      if (s.maxItems !== undefined) t += `.max(${s.maxItems})`;
    } else if (type === 'object') t = zodObject(s, depth);
    else t = 'z.unknown()';
  }
  if (nullable(s)) t += '.nullable()';
  if (s.description !== undefined) t += `.describe(${str(s.description)})`;
  return t;
}

function zodObject(s, depth) {
  const pad = '  '.repeat(depth + 1);
  const required = new Set(s.required ?? []);
  const lines = Object.entries(s.properties ?? {}).map(([key, prop]) => {
    let t = zodType(prop, depth + 1);
    if (prop.default !== undefined) t += `.default(${str(prop.default)})`;
    else if (!required.has(key)) t += '.optional()';
    return `${pad}${/^[A-Za-z_$][\w$]*$/.test(key) ? key : str(key)}: ${t},`;
  });
  const body = lines.length ? `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}` : '{}';
  return `z.object(${body})${s.additionalProperties === false ? '.strict()' : ''}`;
}

export function toZod(schema, file, version) {
  const out = [`// ${header(file, version)}`, 'import { z } from "zod";', ''];
  const declare = (name, s) => {
    out.push(`export const ${name}Schema = ${zodType(s, 0)};`, `export type ${name} = z.infer<typeof ${name}Schema>;`, '');
  };
  for (const name of orderedDefs(schema)) declare(pascal(name), schema.$defs[name]);
  declare(pascal(schema.title ?? schema.$id), schema);
  return out.join('\n');
}

// ---------- Pydantic v2 ----------

const PY_KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));

function pyLiteral(v) {
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (Array.isArray(v)) return `[${v.map(pyLiteral).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${str(k)}: ${pyLiteral(x)}`).join(', ')}}`;
  return str(v);
}

function fieldArgs(pairs) {
  return pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${k === 'pattern' ? str(v) : v}`).join(', ');
}

// Returns a type expression; inline objects become classes pushed to ctx.blocks before their parent.
function pyType(s, hint, ctx) {
  let t;
  let constraints = '';
  if (s.$ref) t = pascal(refName(s.$ref));
  else if (s.enum) { ctx.use('typing', 'Literal'); t = `Literal[${s.enum.map(pyLiteral).join(', ')}]`; }
  else {
    const type = baseType(s);
    if (type === 'string') {
      const fmt = { email: ['pydantic', 'EmailStr'], uri: ['pydantic', 'AnyUrl'], date: ['dt', 'dt.date'], 'date-time': ['dt', 'dt.datetime'] }[s.format];
      if (fmt) ctx.use(...fmt);
      t = fmt ? fmt[1] : 'str';
      // ponytail: length/pattern apply to plain str only; formatted types validate themselves.
      if (!fmt) constraints = fieldArgs([['min_length', s.minLength], ['max_length', s.maxLength], ['pattern', s.pattern]]);
    } else if (type === 'integer' || type === 'number') {
      t = type === 'integer' ? 'int' : 'float';
      constraints = fieldArgs([['ge', s.minimum], ['le', s.maximum]]);
    } else if (type === 'boolean') t = 'bool';
    else if (type === 'null') t = 'None';
    else if (type === 'array') {
      t = `list[${s.items ? pyType(s.items, `${hint}Item`, ctx) : (ctx.use('typing', 'Any'), 'Any')}]`;
      constraints = fieldArgs([['min_length', s.minItems], ['max_length', s.maxItems]]);
    } else if (type === 'object') { pyClass(hint, s, ctx); t = hint; }
    else { ctx.use('typing', 'Any'); t = 'Any'; }
  }
  if (constraints) { ctx.use('typing', 'Annotated'); ctx.use('pydantic', 'Field'); t = `Annotated[${t}, Field(${constraints})]`; }
  if (nullable(s)) { ctx.use('typing', 'Optional'); t = `Optional[${t}]`; }
  return t;
}

function pyClass(name, s, ctx) {
  ctx.use('pydantic', 'BaseModel');
  const required = new Set(s.required ?? []);
  const body = [];
  if (s.additionalProperties === false) { ctx.use('pydantic', 'ConfigDict'); body.push('    model_config = ConfigDict(extra="forbid")', ''); }
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    let field = key.replace(/\W/g, '_').replace(/^(\d)/, '_$1');
    if (PY_KEYWORDS.has(field)) field += '_';
    let t = pyType(prop, `${name}${pascal(key)}`, ctx);
    let dflt;
    if (prop.default !== undefined) dflt = pyLiteral(prop.default);
    else if (!required.has(key)) {
      if (!t.startsWith('Optional[')) { ctx.use('typing', 'Optional'); t = `Optional[${t}]`; }
      dflt = 'None';
    }
    const extra = fieldArgs([['description', prop.description === undefined ? undefined : str(prop.description)], ['alias', field === key ? undefined : str(key)]]);
    let line = `    ${field}: ${t}`;
    if (extra) { ctx.use('pydantic', 'Field'); line += ` = Field(${dflt === undefined ? '' : `default=${dflt}, `}${extra})`; }
    else if (dflt !== undefined) line += ` = ${dflt}`;
    body.push(line);
  }
  while (body.at(-1) === '') body.pop();
  ctx.blocks.push(`class ${name}(BaseModel):\n${body.length ? body.join('\n') : '    pass'}`);
}

export function toPydantic(schema, file, version) {
  const used = { typing: new Set(), pydantic: new Set(), dt: new Set() };
  const ctx = { blocks: [], use: (mod, name) => used[mod].add(name) };
  const declare = (name, s) => {
    if (baseType(s) === 'object' && !s.$ref && !s.enum) pyClass(name, s, ctx);
    else if (s === schema) { ctx.use('pydantic', 'RootModel'); ctx.blocks.push(`class ${name}(RootModel[${pyType(s, `${name}Root`, ctx)}]):\n    pass`); }
    else ctx.blocks.push(`${name} = ${pyType(s, name, ctx)}`);
  };
  for (const name of orderedDefs(schema)) declare(pascal(name), schema.$defs[name]);
  declare(pascal(schema.title ?? schema.$id), schema);

  const imports = [];
  if (used.dt.size) imports.push('import datetime as dt');
  if (used.typing.size) imports.push(`from typing import ${[...used.typing].sort().join(', ')}`);
  if (used.pydantic.size) imports.push(`from pydantic import ${[...used.pydantic].sort().join(', ')}`);
  return [`# ${header(file, version)}`, ...imports, '', '', ctx.blocks.join('\n\n\n'), ''].join('\n');
}
