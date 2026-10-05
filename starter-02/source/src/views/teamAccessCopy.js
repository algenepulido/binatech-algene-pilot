// ============================================================
// teamAccessCopy — pure, testable EN/AR copy for the Team & Access screen.
// Kept out of the view so the trust language can be lint-tested: it must stay
// professional and free of internal jargon (config flags, .sql file names,
// migration/function references must never surface to users), it must be honest
// that roles are NOT yet enforced, and it must separate access roles from
// approval authority (who can certify) without overclaiming enforcement.
// ============================================================
export const TEAM_ACCESS_COPY = {
  en: { title: 'Team & Access', subtitle: 'Invite people and assign roles per project',
    notEnforced: 'These roles organize your team and record who should have access. They don’t yet restrict what each person can edit, and they’re separate from approval authority (who can certify work). Until access enforcement is switched on, anyone with access can edit. Invite links below are live now.',
    notProvisioned: 'Team & Access isn’t set up for this workspace yet — an administrator needs to finish access setup before members can be managed here.',
    invite: 'Send invite', emailPh: 'name@company.com', role: 'Role', members: 'Members', noMembers: 'No members yet — invite someone above.',
    status: 'Status', revoke: 'Revoke', scope: 'Scope', companyWide: 'Company-wide', invited: 'Invited', active: 'Active', revoked: 'Revoked', you: 'you',
    requests: 'Access requests', noRequests: 'No pending requests.', approve: 'Approve', deny: 'Deny',
    inviteNote: 'Approving records the membership; send an invite below to let them set their password and join.',
    inviteHead: 'Invite by email', inviteHint: 'We email a secure single-use join link to this address (expires in 14 days). You can also copy the link to share it directly.',
    linkReady: 'Invite link (copy to share directly):', copy: 'Copy', copied: 'Copied!', invites: 'Pending invites', noInvites: 'No pending invites.', expires: 'Expires', invitesNote: 'For security the link is shown once, here. Revoke to disable it.',
    emailedTo: 'Invitation emailed to', linkOnly: 'Invite created. Email isn’t set up yet — copy the link below to share it.',
    notProvisionedInvite: 'Invites aren’t available until an administrator finishes access setup.' },
  ar: { title: 'الفريق والوصول', subtitle: 'ادعُ الأشخاص وعيّن الأدوار لكل مشروع',
    notEnforced: 'تنظّم هذه الأدوار فريقك وتسجّل من ينبغي أن يملك صلاحية الوصول. وهي لا تقيّد بعد ما يمكن لكل شخص تعديله، وهي منفصلة عن صلاحية الاعتماد (من يحق له اعتماد الأعمال). وإلى أن يُفعَّل فرض الوصول، يمكن لكل من لديه وصول التعديل. روابط الدعوة أدناه فعّالة الآن.',
    notProvisioned: 'لم يتم إعداد «الفريق والوصول» لمساحة العمل هذه بعد — يحتاج المسؤول إلى إكمال إعداد الوصول قبل أن تتمكن من إدارة الأعضاء هنا.',
    invite: 'إرسال دعوة', emailPh: 'name@company.com', role: 'الدور', members: 'الأعضاء', noMembers: 'لا يوجد أعضاء بعد — ادعُ شخصاً أعلاه.',
    status: 'الحالة', revoke: 'إلغاء', scope: 'النطاق', companyWide: 'على مستوى الشركة', invited: 'مدعو', active: 'نشط', revoked: 'ملغى', you: 'أنت',
    requests: 'طلبات الوصول', noRequests: 'لا توجد طلبات معلّقة.', approve: 'موافقة', deny: 'رفض',
    inviteNote: 'الموافقة تُسجّل العضوية؛ أرسل دعوة أدناه ليتمكنوا من تعيين كلمة المرور والانضمام.',
    inviteHead: 'دعوة عبر البريد', inviteHint: 'نرسل رابط انضمام آمناً يُستخدم مرة واحدة إلى هذا البريد (تنتهي صلاحيته خلال ١٤ يوماً). يمكنك أيضاً نسخ الرابط لمشاركته مباشرة.',
    linkReady: 'رابط الدعوة (انسخه للمشاركة المباشرة):', copy: 'نسخ', copied: 'تم النسخ!', invites: 'الدعوات المعلّقة', noInvites: 'لا توجد دعوات معلّقة.', expires: 'تنتهي', invitesNote: 'لأسباب أمنية يظهر الرابط مرة واحدة هنا. ألغِ الدعوة لتعطيلها.',
    emailedTo: 'تم إرسال الدعوة إلى', linkOnly: 'تم إنشاء الدعوة. البريد غير مُعدّ بعد — انسخ الرابط أدناه لمشاركته.',
    notProvisionedInvite: 'الدعوات غير متاحة حتى يُكمل المسؤول إعداد الوصول.' },
};
