// Adds the Clinic Records tables (grist/clinic-records-schema.md) to ONE clinic's Grist doc. Additive only: creates missing tables and
// missing columns; never renames, retypes, clears or deletes anything. Dry run by default.
//   npm run provision-records -- <clinic-slug>            show what would be created
//   npm run provision-records -- <clinic-slug> --apply     create it
// Reads GRIST_BASE_URL, GRIST_API_KEY and GRIST_REGISTRY_DOC_ID from the environment (e.g. node --env-file=.env). Prints no secrets.
import { GristClient } from '../grist';
import { RECORD_COLUMNS, gristField } from '../records/schema';

const [slug, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const { GRIST_BASE_URL: base, GRIST_API_KEY: key, GRIST_REGISTRY_DOC_ID: registry } = process.env;
if (!slug || !base || !key || !registry) { console.error('Usage: npm run provision-records -- <clinic-slug> [--apply]   (needs GRIST_BASE_URL, GRIST_API_KEY, GRIST_REGISTRY_DOC_ID)'); process.exit(2); }

const grist = new GristClient(base, key);
const reg = (await grist.records(registry, 'Clinics')).find((r) => String(r.fields.Clinic_Slug).trim() === slug);
const doc = reg ? String(reg.fields.Grist_Doc_ID || '').trim() : '';
if (!doc) { console.error(`No clinic "${slug}" with a Grist_Doc_ID in the registry`); process.exit(1); }

const have = new Set(await grist.tableIds(doc));
let changes = 0;
for (const [table, cols] of Object.entries(RECORD_COLUMNS)) {
  const defs = cols.map(([id, t]) => ({ id, fields: gristField(id, t) }));
  if (!have.has(table)) {
    console.log(`${apply ? 'creating' : 'would create'} table ${table} (${cols.length} columns)`); changes++;
    if (apply) await grist.createTable(doc, table, defs);
    continue;
  }
  const existing = new Set(await grist.columnIds(doc, table));
  const missing = defs.filter((d) => !existing.has(d.id));
  if (missing.length) { console.log(`${apply ? 'adding' : 'would add'} to ${table}: ${missing.map((m) => m.id).join(', ')}`); changes++; if (apply) await grist.addColumns(doc, table, missing); }
}
console.log(changes ? (apply ? 'Done. Reload FLOW HQ: the clinical pages appear within a minute.' : 'Dry run only. Run again with --apply to create these.') : 'Nothing to do: all Clinic Records tables and columns already exist.');
