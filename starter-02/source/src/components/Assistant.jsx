// ============================================================
// Assistant — floating in-app help chat. Sends the conversation to the
// `ai-assist` Edge Function (which holds the LLM key server-side). The
// frontend never sees or sends any API key. Degrades cleanly if the
// function returns "not configured".
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { COL } from '../lib/theme.js';
import { useProject } from '../lib/project.jsx';
import { classifyAssistantResult, assistantDiagTag, ASSISTANT_STATE } from '../lib/assistantError.js';
import { refuseIfUnsafe, localAnswer, pageLabel } from '../lib/assistantHelp.js';

// Non-sensitive, user-facing copy for each failure state. Simple and actionable;
// no diagnostics, IDs, tokens, or internals leak into the chat.
const FAIL_COPY = {
  [ASSISTANT_STATE.NOT_CONFIGURED]: {
    en: 'BinaTech Analyst is not configured yet. Ask an admin to deploy the ai-assist function.',
    ar: 'لم يتم إعداد محلّل BinaTech بعد. اطلب من المشرف نشر دالة ai-assist.',
  },
  [ASSISTANT_STATE.UNAVAILABLE]: {
    en: 'BinaTech Analyst is temporarily unavailable. Try again later.',
    ar: 'محلّل BinaTech غير متاح مؤقتًا. حاول مرة أخرى لاحقًا.',
  },
};

export function Assistant({ lang = 'en', route }) {
  const ar = lang === 'ar';
  const { project } = useProject();
  const pick = (o) => (o ? o[ar ? 'ar' : 'en'] : null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: ar ? 'مرحبًا! اسألني كيف تستخدم BinaTech — مثل رفع نموذج IFC أو إنشاء طلب فحص أو ربط عنصر بجدول الكميات. أشرح وأصيغ المسودات فقط؛ لا أعتمد ولا أوافق ولا أحرّك أي مبالغ.' : 'Hi! Ask me how to use BinaTech — e.g. uploading an IFC model, creating a WIR, or linking an element to a BOQ line. I explain and draft only — I never certify, approve, or move money.' },
  ]);
  const scrollRef = useRef(null);

  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, open, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next); setInput('');

    // SAFETY GUARD (always, before any LLM call): refuse requests to act,
    // move money, mutate records, or cross projects. The Analyst is advisory
    // only; the real certification/payment boundary is server-side (Gate 1).
    const refusal = refuseIfUnsafe(q);
    if (refusal) { setMessages((m) => [...m, { role: 'assistant', content: pick(refusal) }]); return; }

    // Fallback when the LLM is unavailable: a vetted advisory answer if the
    // question is a known product question; otherwise the honest status message.
    const local = () => pick(localAnswer(q, { page: pageLabel(route) }));

    setBusy(true);
    // Read-only page context (page label + route + project name) — no tables,
    // no cross-project data — so the deployed function can be page-aware.
    const context = { page: pageLabel(route) || undefined, route: route || undefined, project: project?.name || undefined };
    try {
      const res = await supabase.functions.invoke('ai-assist', { body: { messages: next.map((m) => ({ role: m.role, content: m.content })), context } });
      const state = classifyAssistantResult(res);
      if (state === ASSISTANT_STATE.OK) {
        setMessages((m) => [...m, { role: 'assistant', content: res.data?.answer || '…' }]);
      } else {
        // Diagnostic is non-sensitive by construction (error name + HTTP status
        // only — never tokens, keys, session, or message content).
        console.warn('[ai-assist] unavailable:', state, res.error ? assistantDiagTag(res.error) : 'configured:false');
        setMessages((m) => [...m, { role: 'assistant', content: local() || FAIL_COPY[state][ar ? 'ar' : 'en'] }]);
      }
    } catch (e) {
      console.warn('[ai-assist] request failed:', assistantDiagTag(e));
      setMessages((m) => [...m, { role: 'assistant', content: local() || FAIL_COPY[ASSISTANT_STATE.UNAVAILABLE][ar ? 'ar' : 'en'] }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {!open && (
        // Restrained enterprise launcher (restored from the cert-ledger redesign,
        // PR #117 dfb0ec6): a compact labelled pill docked ABOVE the status bar —
        // not a loud consumer-chatbot bubble. Advisory-only positioning kept in
        // the label + tooltip; project-scoped so it reads as a work tool.
        <button onClick={() => setOpen(true)}
          aria-label={ar ? 'فتح المحلّل' : 'Open Analyst'}
          title={`${ar ? 'المحلّل' : 'Analyst'}${project?.name ? ' · ' + project.name : ''} — ${ar ? 'استشاري فقط، مسودات لا اعتماد' : 'advisory only · drafts, never certifies or moves money'}`}
          dir={ar ? 'rtl' : 'ltr'}
          className="group fixed z-40 inline-flex items-center gap-2 rounded-full border py-1.5 ps-1.5 pe-3 shadow-sm transition-shadow hover:shadow-md print:hidden outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ insetInlineEnd: 20, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 3rem)', background: COL.surface, borderColor: COL.border, color: COL.text, '--tw-ring-color': COL.accent, '--tw-ring-offset-color': COL.bg }}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}><Sparkles size={13} style={{ color: COL.accent }} /></span>
          <span className="text-[12.5px] font-semibold leading-none">{ar ? 'اسأل المحلّل' : 'Ask Analyst'}</span>
          {project?.name && <span className="text-[10.5px] leading-none hidden xl:inline-block max-w-[120px] truncate align-middle" style={{ color: COL.textMute }}>· {project.name}</span>}
        </button>
      )}

      {open && (
        <div dir={ar ? 'rtl' : 'ltr'} className="fixed z-50 flex flex-col rounded-2xl border shadow-2xl print:hidden"
          style={{ insetInlineEnd: 20, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 3rem)', width: 'min(380px, calc(100vw - 32px))', height: 'min(540px, calc(100vh - 130px))', background: COL.surface, borderColor: COL.border, fontFamily: ar ? "'Cairo','Inter',sans-serif" : undefined }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: COL.border }}>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}><Sparkles size={16} style={{ color: COL.accent }} /></span>
            <div className="flex-1 min-w-0">
              <div className="display text-sm font-bold leading-none">{ar ? 'محلّل BinaTech' : 'BinaTech Analyst'}</div>
              <div className="text-[10px] mt-0.5" style={{ color: COL.textMute }}>{ar ? 'استشاري فقط — يشرح ويصيغ المسودات' : 'Advisory only — explains & drafts'}</div>
            </div>
            <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-stone-100" style={{ color: COL.textDim }}><X size={16} /></button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar p-3 space-y-2.5" style={{ background: COL.bg }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap" style={m.role === 'user'
                  ? { background: COL.accent, color: '#fff', borderBottomRightRadius: 4 }
                  : { background: COL.surface, color: COL.text, border: `1px solid ${COL.border}`, borderBottomLeftRadius: 4 }}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="px-3 py-2 rounded-2xl text-[13px]" style={{ background: COL.surface, border: `1px solid ${COL.border}`, color: COL.textMute }}>…</div></div>}
          </div>

          <div className="p-2.5 border-t flex items-end gap-2" style={{ borderColor: COL.border }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1} placeholder={ar ? 'اكتب سؤالك…' : 'Ask a question…'} className="flex-1 resize-none px-3 py-2 text-[13px] rounded-xl border outline-none"
              style={{ background: COL.bg, borderColor: COL.borderStrong, color: COL.text, maxHeight: 100 }} />
            <button onClick={send} disabled={busy || !input.trim()} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ background: COL.accent, color: '#fff' }}>
              <Send size={16} style={{ transform: ar ? 'scaleX(-1)' : 'none' }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
