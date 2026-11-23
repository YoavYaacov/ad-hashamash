/**
 * Single place for branding. The name can still change at the last minute — edit it here only.
 */
// Working name. Change only here.
export const APP_NAME = 'עד הנר האחרון';
/** Plain-text version for places where niqqud renders poorly (browser tab title). */
export const APP_NAME_PLAIN = 'עד הנר האחרון';
export const FINALE_NAME = 'השַׁמָּשׁ';

/** One typeface everywhere, by request. It has a single weight, so synthetic bold is disabled in CSS. */
export const FONT = 'Secular One';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
