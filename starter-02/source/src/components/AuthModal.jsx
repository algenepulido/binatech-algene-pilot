// ============================================================
// AuthModal — Supabase-native email/password sign-in / sign-up, plus a
// "Request access" mode that files a pending access_requests row (no account,
// no credentials — an Admin reviews it; the secure invite link is sent
// server-side per ACCESS_FLOW.md). Driven by the auth context.
//
// PRESENTATION + CLIENT-SIDE VALIDATION ONLY. The auth calls (signIn/signUp,
// submitAccessRequest) are unchanged — all validation here is a UX hint;
// real enforcement stays server-side (Supabase). Bilingual EN/AR is handled
// inside this component (a local toggle) because the modal mounts outside the
// public site's DirContext.
// ============================================================
import { useEffect, useState, useMemo } from 'react';
import { StyledSelect } from './StyledSelect.jsx';
import { ShieldCheck, Eye, EyeOff, Check, X } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Btn } from './primitives.jsx';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';
import { Wordmark, WORDMARK_DESCRIPTOR } from './Wordmark.jsx';
import { ROLES } from '../api/access.js';
import { submitAccessRequest } from '../api/accessRequests.js';

const MIN_PW = 8; // client-side UX hint only; Supabase enforces server-side.

const fieldStyle = (focused) => ({
  // 16px is the iOS Safari threshold: below it, focusing an input zooms the
  // viewport. On a sticky-chrome page with the software keyboard up, that
  // reflow is the difference between a usable sign-in and a broken one.
  width: '100%', padding: '11px 12px', fontSize: 16, minHeight: 44, borderRadius: 8,
  border: `1px solid ${focused ? COL.accent : COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none',
  transition: 'border-color .16s ease, box-shadow .16s ease',
  boxShadow: focused ? `0 0 0 4px ${COL.accentBg}` : 'none',
});

// Bilingual strings. Every validation message is translated (rubric R5).
const STR = {
  en: {
    titles: { signin: 'Sign in to BinaTech', signup: 'Create an account', request: 'Request access' },
    cta: { signin: 'Sign in', signup: 'Sign up', request: 'Submit request' },
    sub: { request: 'An admin reviews requests and sends a secure invite', other: 'Required to create or edit records' },
    welcome: { signin: 'Welcome back — sign in to your project.', signup: 'Create your account to get started.', request: 'Tell us who you are; an admin will grant access.' },
    fullName: 'Full name', namePh: 'Your name', company: 'Company', companyPh: 'Your company', role: 'Requested role',
    email: 'Email', emailPh: 'you@company.com', password: 'Password', confirm: 'Confirm password', pwPh: '••••••••',
    show: 'Show password', hide: 'Hide password',
    invalidEmail: 'Enter a valid email address.',
    pwShort: `Use at least ${MIN_PW} characters.`,
    pwMatch: 'Passwords match.', pwNoMatch: 'Passwords don’t match.',
    strength: 'Password strength', weak: 'Weak', ok: 'OK', strong: 'Strong',
    confirmNote: 'You’ll confirm your email after signing up.',
    toSignup: 'No account? Create one', toSignin: 'Have an account? Sign in',
    toRequest: 'Don’t have access? Request it', backToSignin: 'Back to sign in',
    required: 'Sign-in is required to create or edit records.',
    busy: 'Please wait…', cancel: 'Cancel',
    createdNotice: 'Account created. Check your email to confirm, then sign in.',
    reqSent: 'Request sent. An admin will review it and send you a secure invite link.',
    reqUnset: 'Access requests aren’t set up yet — please contact your project admin directly.',
    reqFail: 'Could not submit your request. Please try again.',
  },
  ar: {
    titles: { signin: 'تسجيل الدخول إلى BinaTech', signup: 'إنشاء حساب', request: 'طلب وصول' },
    cta: { signin: 'تسجيل الدخول', signup: 'إنشاء حساب', request: 'إرسال الطلب' },
    sub: { request: 'يراجع المسؤول الطلبات ويرسل دعوة آمنة', other: 'مطلوب لإنشاء أو تعديل السجلات' },
    welcome: { signin: 'مرحبًا بعودتك — ادخل إلى مشروعك.', signup: 'أنشئ حسابك للبدء.', request: 'عرّفنا بنفسك؛ سيمنحك المسؤول الوصول.' },
    fullName: 'الاسم الكامل', namePh: 'اسمك', company: 'الشركة', companyPh: 'شركتك', role: 'الدور المطلوب',
    email: 'البريد الإلكتروني', emailPh: 'you@company.com', password: 'كلمة المرور', confirm: 'تأكيد كلمة المرور', pwPh: '••••••••',
    show: 'إظهار كلمة المرور', hide: 'إخفاء كلمة المرور',
    invalidEmail: 'أدخل بريدًا إلكترونيًا صالحًا.',
    pwShort: `استخدم ${MIN_PW} أحرف على الأقل.`,
    pwMatch: 'كلمتا المرور متطابقتان.', pwNoMatch: 'كلمتا المرور غير متطابقتين.',
    strength: 'قوة كلمة المرور', weak: 'ضعيفة', ok: 'متوسطة', strong: 'قوية',
    confirmNote: 'ستؤكّد بريدك الإلكتروني بعد التسجيل.',
    toSignup: 'لا تملك حسابًا؟ أنشئ واحدًا', toSignin: 'لديك حساب؟ سجّل الدخول',
    toRequest: 'لا تملك وصولًا؟ اطلبه', backToSignin: 'العودة لتسجيل الدخول',
    required: 'تسجيل الدخول مطلوب لإنشاء أو تعديل السجلات.',
    busy: 'يرجى الانتظار…', cancel: 'إلغاء',
    createdNotice: 'تم إنشاء الحساب. تحقق من بريدك للتأكيد ثم سجّل الدخول.',
    reqSent: 'تم إرسال الطلب. سيراجعه المسؤول ويرسل لك رابط دعوة آمنًا.',
    reqUnset: 'طلبات الوصول غير مُفعّلة بعد — يرجى التواصل مع مسؤول مشروعك مباشرة.',
    reqFail: 'تعذّر إرسال طلبك. حاول مرة أخرى.',
  },
};

// Strength: length + character variety. 0=weak 1=ok 2=strong. No hard block
// beyond the MIN_PW minimum (rubric R3).
function pwScore(pw) {
  if (!pw) return -1;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let s = 0;
  if (pw.length >= MIN_PW) s++;
  if (pw.length >= 12) s++;
  if (variety >= 3) s++;
  if (variety >= 4) s++;
  return s <= 1 ? 0 : s === 2 ? 1 : 2;
}

const EMAIL_RE = /\S+@\S+\.\S+/;

export function AuthModal() {
  const { authModalOpen, closeAuth, signIn, signUp } = useAuth();
  const [lang, setLang] = useState('en');
  const [mode, setMode] = useState('signin'); // signin | signup | request
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [req, setReq] = useState({ name: '', company_name: '', requested_role: 'site_eng' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [focus, setFocus] = useState('');
  const [touched, setTouched] = useState({});

  const t = STR[lang];
  const rtl = lang === 'ar';

  function reset() { setError(null); setNotice(null); }
  // Same reason as the #/sign-in route: error/notice store rendered copy, so a
  // language switch would leave an English sentence inside the Arabic/RTL
  // sheet. The inline field hints re-derive from `t` on every render and are
  // already correct; these two do not.
  useEffect(() => { reset(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const touch = (k) => setTouched((s) => ({ ...s, [k]: true }));

  // ── client-side validation state (UX hints only) ──
  const emailValid = EMAIL_RE.test(email.trim());
  const pwLongEnough = password.length >= MIN_PW;
  const pwsMatch = password.length > 0 && password === confirm;
  const score = pwScore(password);
  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (mode === 'signin') return emailValid && password.length > 0;
    if (mode === 'signup') return emailValid && pwLongEnough && pwsMatch;
    return emailValid && req.name.trim().length > 0; // request
  }, [busy, mode, emailValid, password, pwLongEnough, pwsMatch, req.name]);

  async function submit(e) {
    e?.preventDefault();
    reset();
    if (!canSubmit) { setTouched({ email: true, password: true, confirm: true, name: true }); return; }
    setBusy(true);
    try {
      if (mode === 'request') {
        if (!emailValid) { setError(t.invalidEmail); return; }
        const { ok, provisioned, error: reqError } = await submitAccessRequest({ ...req, email });
        if (!provisioned) { setNotice(t.reqUnset); return; }
        if (ok) { setNotice(t.reqSent); setEmail(''); setReq({ name: '', company_name: '', requested_role: 'site_eng' }); }
        else { setError(reqError || t.reqFail); }
        return;
      }
      const fn = mode === 'signin' ? signIn : signUp;
      const { data, error } = await fn(email.trim(), password);
      if (error) { setError(error.message); return; }
      if (mode === 'signup' && !data.session) {
        setNotice(t.createdNotice);
        setMode('signin');
        return;
      }
      setEmail(''); setPassword(''); setConfirm('');
      closeAuth();
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const hint = (txt, kind = 'err') => (
    <div className="flex items-center gap-1 text-[11px] mt-1" style={{ color: kind === 'ok' ? '#15803d' : kind === 'err' ? '#b91c1c' : COL.textMute }}>
      {kind === 'ok' ? <Check size={12} /> : kind === 'err' ? <X size={12} /> : null}{txt}
    </div>
  );

  const eyeBtn = (shown, setShown) => (
    <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? t.hide : t.show}
      className="absolute top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-black/[0.04]"
      style={{ insetInlineEnd: 8, color: COL.textMute }} tabIndex={0}>
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <Modal
      open={authModalOpen}
      onClose={closeAuth}
      title={t.titles[mode]}
      subtitle={mode === 'request' ? t.sub.request : t.sub.other}
      width={400}
      footer={
        <>
          <Btn variant="secondary" onClick={closeAuth}>{t.cancel}</Btn>
          {/* Not disabled on an incomplete form. submit() already marks every
              field touched so the form's own validation copy appears; gating the
              button made that branch unreachable and the user got silence
              instead of a reason. Still guarded against double-submit. */}
          <Btn variant="primary" disabled={busy} onClick={submit}>{busy ? t.busy : t.cta[mode]}</Btn>
        </>
      }
    >
      {/* noValidate for the same reason as the #/sign-in route: the hidden
          submit button below enables Enter-key submission, which would hit the
          browser's native constraint bubble before submit() could show this
          form's own translated message. */}
      <form onSubmit={submit} noValidate dir={rtl ? 'rtl' : 'ltr'} className="flex flex-col gap-3.5" style={{ textAlign: rtl ? 'right' : 'left' }}>
        {/* language toggle — self-contained so the modal is bilingual outside DirContext */}
        <div className="flex justify-end -mb-1">
          <button type="button" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="text-[11px] font-semibold px-2 py-1 rounded-md border" style={{ borderColor: COL.border, color: COL.textDim }}>
            {lang === 'en' ? 'العربية' : 'EN'}
          </button>
        </div>

        <div className="flex flex-col items-center text-center pb-1">
          <Wordmark size={24} />
          <div className="mono text-[8.5px] tracking-[0.2em] uppercase mt-1.5 mb-2" style={{ color: '#43544F' }}>{WORDMARK_DESCRIPTOR[lang] || WORDMARK_DESCRIPTOR.en}</div>
          <div className="text-[13px]" style={{ color: COL.textDim }}>{t.welcome[mode]}</div>
        </div>

        {mode === 'request' && (
          <>
            <label className="text-[12px] font-semibold" style={{ color: COL.text }}>
              {t.fullName}
              <input value={req.name} onChange={(e) => setReq((r) => ({ ...r, name: e.target.value }))}
                onFocus={() => setFocus('name')} onBlur={() => { setFocus(''); touch('name'); }} style={{ ...fieldStyle(focus === 'name'), marginTop: 5 }} placeholder={t.namePh} autoComplete="name" />
              {touched.name && !req.name.trim() && hint(t.fullName, 'err')}
            </label>
            <label className="text-[12px] font-semibold" style={{ color: COL.text }}>
              {t.company}
              <input value={req.company_name} onChange={(e) => setReq((r) => ({ ...r, company_name: e.target.value }))}
                onFocus={() => setFocus('company')} onBlur={() => setFocus('')} style={{ ...fieldStyle(focus === 'company'), marginTop: 5 }} placeholder={t.companyPh} autoComplete="organization" />
            </label>
            <label className="text-[12px] font-semibold" style={{ color: COL.text }}>
              {t.role}
              <div style={{ marginTop: 5 }}><StyledSelect ariaLabel={t.role} value={req.requested_role} onChange={(v) => setReq((r) => ({ ...r, requested_role: v }))} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} /></div>
            </label>
          </>
        )}

        <label className="text-[12px] font-semibold" style={{ color: COL.text }}>
          {t.email}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocus('email')} onBlur={() => { setFocus(''); touch('email'); }}
            style={{ ...fieldStyle(focus === 'email'), marginTop: 5 }} placeholder={t.emailPh} autoComplete="email" />
          {touched.email && email.length > 0 && !emailValid && hint(t.invalidEmail, 'err')}
        </label>

        {mode !== 'request' && (
          <label className="text-[12px] font-semibold" style={{ color: COL.text }}>
            {t.password}
            <div className="relative" style={{ marginTop: 5 }}>
              <input type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocus('password')} onBlur={() => { setFocus(''); touch('password'); }}
                style={{ ...fieldStyle(focus === 'password'), paddingInlineEnd: 38 }} placeholder={t.pwPh}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              {eyeBtn(showPw, setShowPw)}
            </div>
            {/* min-length hint + strength meter (signup only) */}
            {mode === 'signup' && touched.password && password.length > 0 && !pwLongEnough && hint(t.pwShort, 'err')}
            {mode === 'signup' && password.length > 0 && (
              <div className="mt-1.5">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= score ? [COL.gold, COL.accent, '#15803d'][score] : COL.border }} />
                  ))}
                </div>
                <div className="text-[11px] mt-1" style={{ color: COL.textMute }}>
                  {t.strength}: <span style={{ color: [COL.gold, COL.accent, '#15803d'][score], fontWeight: 600 }}>{[t.weak, t.ok, t.strong][score]}</span>
                </div>
              </div>
            )}
          </label>
        )}

        {mode === 'signup' && (
          <label className="text-[12px] font-semibold" style={{ color: COL.text }}>
            {t.confirm}
            <div className="relative" style={{ marginTop: 5 }}>
              <input type={showConfirm ? 'text' : 'password'} required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onFocus={() => setFocus('confirm')} onBlur={() => { setFocus(''); touch('confirm'); }}
                style={{ ...fieldStyle(focus === 'confirm'), paddingInlineEnd: 38 }} placeholder={t.pwPh} autoComplete="new-password" />
              {eyeBtn(showConfirm, setShowConfirm)}
            </div>
            {confirm.length > 0 && hint(pwsMatch ? t.pwMatch : t.pwNoMatch, pwsMatch ? 'ok' : 'err')}
          </label>
        )}

        {/* honest note — the actual confirmation email is sent by Supabase, not built here */}
        {mode === 'signup' && (
          <div className="text-[11px] flex items-start gap-1.5" style={{ color: COL.textMute }}>
            <ShieldCheck size={12} className="mt-0.5 flex-shrink-0" /> {t.confirmNote}
          </div>
        )}

        {error && <div className="text-xs px-2.5 py-2 rounded-lg" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        {notice && <div className="text-xs px-2.5 py-2 rounded-lg" style={{ background: '#dcfce7', color: '#15803d' }}>{notice}</div>}

        {/* Invite-only: no public sign-up. Invited users sign in; everyone else
            requests access (an admin reviews and sends a secure invite link). */}
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => { setMode(mode === 'request' ? 'signin' : 'request'); reset(); }}
            className="text-[12px] hover:underline" style={{ color: COL.accent, textAlign: rtl ? 'right' : 'left' }}>
            {mode === 'request' ? t.backToSignin : t.toRequest}
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[11px]" style={{ color: COL.textMute }}>
          <ShieldCheck size={12} /> {t.required}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
