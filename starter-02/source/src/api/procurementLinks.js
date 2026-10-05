// ============================================================
// Procurement evidence links — additive join tables connecting a supplier
// invoice to its supporting chain: PO (invoice_po_links), delivery/SDN
// (invoice_sdn_links), and PO->BoQ (po_boq_links). Invoice<->WIR reuses the
// existing invoice_wir_links. All bidirectional, all graceful: if a table
// isn't provisioned yet (supabase/procurement_links_additive.sql) the readers
// return [] and writers throw a clear "run the SQL" message — never crashes,
// never affects the certification chain.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

const missing = (e, name) => !!e && (e.code === '42P01' || new RegExp(`relation|does not exist|${name}`, 'i').test(e.message || ''));

function make(table, aCol, bCol) {
  return {
    /** All links in the project. */
    async list(projectId = getCurrentProjectId()) {
      const { data, error } = await supabase.from(table).select('*').eq('project_id', projectId);
      if (error) { if (missing(error, table)) return []; throw error; }
      return data ?? [];
    },
    /** B-ids linked to one A. */
    async forA(aId) {
      const { data, error } = await supabase.from(table).select(bCol).eq(aCol, aId);
      if (error) { if (missing(error, table)) return []; throw error; }
      return (data ?? []).map((r) => r[bCol]);
    },
    /** A-ids linked to one B (bidirectional). */
    async forB(bId) {
      const { data, error } = await supabase.from(table).select(aCol).eq(bCol, bId);
      if (error) { if (missing(error, table)) return []; throw error; }
      return (data ?? []).map((r) => r[aCol]);
    },
    async link(aId, bId) {
      const { error } = await supabase.from(table).insert({ project_id: getCurrentProjectId(), [aCol]: aId, [bCol]: bId });
      if (error && !/duplicate|unique/i.test(error.message || '')) {
        if (missing(error, table)) throw new Error(`Link table isn’t set up yet — run supabase/procurement_links_additive.sql.`);
        throw error;
      }
    },
    async unlink(aId, bId) {
      const { error } = await supabase.from(table).delete().eq(aCol, aId).eq(bCol, bId);
      if (error && !missing(error, table)) throw error;
    },
  };
}

export const invoicePoLinks = make('invoice_po_links', 'invoice_id', 'po_id');
export const invoiceSdnLinks = make('invoice_sdn_links', 'invoice_id', 'delivery_id');
export const poBoqLinks = make('po_boq_links', 'po_id', 'boq_item_id');
