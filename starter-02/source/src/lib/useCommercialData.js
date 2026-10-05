// ============================================================
// useCommercialData — ONE loader + ONE derivation for every commercial screen
// (Certification Queue, Control Room, IPC Readiness).
//
// Before this hook the Control Room owned the only real-data commercial
// derivation, which is why the Certification Queue ended up as a parallel
// demo-data screen. Sharing the loader means the queue, the overview and the
// readiness reconciliation can never disagree about what is certifiable — they
// are literally the same numbers.
//
// Honest failure behaviour is inherited from the Control Room and kept:
//   * a failed CRITICAL fetch (BoQ / WIRs / element status) surfaces an error
//     and renders nothing, rather than showing confidently-wrong money;
//   * a failed attachment index stays null = UNKNOWN, so no evidence gap is
//     derived from ignorance;
//   * a genuinely empty project falls back to clearly-bannered synthetic data.
// ============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { listBoqItems } from '../api/boqItems.js';
import { listAllLinks } from '../api/elementBoqLinks.js';
import { listWirs } from '../api/wirs.js';
import { listNcrs } from '../api/ncrs.js';
import { listIpcs } from '../api/ipcs.js';
import { loadElementStatusMap } from './elementStatus.js';
import { buildLinksByBoq } from './boqReadiness.js';
import { countAttachmentsByRecord } from './attachments.js';
import { deriveControlRoom, demoControlRoomInputs } from './controlRoom.js';
import { isSupabaseConfigured } from './supabase.js';

export function useCommercialData() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      if (!isSupabaseConfigured) { setRaw(null); setDemoMode(true); return; }
      const [boq, links, sm, w, n, ipc, att] = await Promise.allSettled([
        listBoqItems(), listAllLinks(), loadElementStatusMap(),
        listWirs(), listNcrs(), listIpcs(), countAttachmentsByRecord('wir'),
      ]);
      // Critical = the inputs the money math depends on.
      if ([boq, w, sm].some((r) => r.status === 'rejected')) { setRaw(null); setLoadError(true); return; }
      setRaw({
        boqItems: boq.value || [],
        allLinks: links.status === 'fulfilled' ? (links.value || []) : [],
        statusMap: sm.value || {},
        wirs: w.value || [],
        ncrs: n.status === 'fulfilled' ? (n.value || []) : [],
        ipcs: ipc.status === 'fulfilled' ? (ipc.value || []) : [],
        wirAttachCounts: att.status === 'fulfilled' ? att.value : null,
        boqOk: true,
      });
      setDemoMode(false);
    } catch { setRaw(null); setLoadError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const inputs = useMemo(() => {
    if (raw && raw.boqOk && raw.boqItems.length > 0) {
      return {
        boqItems: raw.boqItems,
        linksByBoq: buildLinksByBoq(raw.allLinks, raw.boqItems),
        statusMap: raw.statusMap, wirs: raw.wirs, ncrs: raw.ncrs, ipcs: raw.ipcs,
        wirAttachCounts: raw.wirAttachCounts, demo: false,
      };
    }
    return { ...demoControlRoomInputs(), demo: true };
  }, [raw]);

  const isDemo = demoMode || inputs.demo;
  const room = useMemo(() => deriveControlRoom(inputs), [inputs]);

  return { room, inputs, isDemo, loading, loadError, reload: load, ipcs: inputs.ipcs || [] };
}
