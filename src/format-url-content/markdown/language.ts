export type Language = 'ru' | 'en';

export function getLanguage(language: string | null): Language {
  return language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
