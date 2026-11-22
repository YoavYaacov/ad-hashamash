/**
 * Single place for branding. The name is NOT final — change it here only.
 */
export const APP_NAME = 'חנוכיאדה LIVE';
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
