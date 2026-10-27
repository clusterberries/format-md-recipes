export type Language = 'ru' | 'en';

// Russian is the default; other languages are not supported yet.
export function getLanguage(language: string | null): Language {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'ru';
}
