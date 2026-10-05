// ============================================================
// PILOT STARTER ONLY — three small synthetic test images (generated
// illustrations, no EXIF, no real site photography). They are served from
// /pilot-fixtures/ so they can be opened and saved on a test phone, and they
// pass the existing image helper unchanged (each is under 3,000,000 bytes).
// ============================================================
export const SYNTHETIC_IMAGES = Object.freeze([
  Object.freeze({ file: 'synthetic-progress-1.jpg', url: '/pilot-fixtures/synthetic-progress-1.jpg', type: 'image/jpeg', bytes: 58100, width: 1280, height: 960, sha256: '3f9a8fd416a2ba8b89d6dc16ff33f3e7e837face6ca786fa6b84115725cca8eb' }),
  Object.freeze({ file: 'synthetic-progress-2.jpg', url: '/pilot-fixtures/synthetic-progress-2.jpg', type: 'image/jpeg', bytes: 58906, width: 960, height: 1280, sha256: '717d1853f5e8b52d7682054b4d8b08f5be8b0abb396c619ca61ee8ec03f1dcf2' }),
  Object.freeze({ file: 'synthetic-progress-3.png', url: '/pilot-fixtures/synthetic-progress-3.png', type: 'image/png', bytes: 17628, width: 800, height: 600, sha256: '25158cff0ccef78c74a932d8f78a361643acb820f46e100e0d7406d06b343445' }),
]);
