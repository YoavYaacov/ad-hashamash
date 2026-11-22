/**
 * Single place for branding. The name can still change at the last minute — edit it here only.
 */
// Working name (with niqqud, so it reads as the shamash candle, not the sun). Change only here.
export const APP_NAME = 'עַד הַשַּׁמָּשׁ';
/** Plain-text version for places where niqqud renders poorly (browser tab title). */
export const APP_NAME_PLAIN = 'עד השמש';
export const FINALE_NAME = 'השַׁמָּשׁ';

export const FONTS = ['Rubik', 'Heebo', 'Assistant', 'Secular One'] as const;
export type FontName = (typeof FONTS)[number];

/** Font can be switched with ?font=Heebo (remembered per device as a UI preference only). */
export function pickFont(): FontName {
  const fromUrl = new URLSearchParams(location.search).get('font');
  let saved: string | null = null;
  try { saved = localStorage.getItem('ui-font'); } catch { /* storage may be unavailable */ }
  const f = (FONTS as readonly string[]).includes(fromUrl ?? '') ? fromUrl! : (FONTS as readonly string[]).includes(saved ?? '') ? saved! : 'Rubik';
  try { localStorage.setItem('ui-font', f); } catch { /* ignore */ }
  return f as FontName;
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
