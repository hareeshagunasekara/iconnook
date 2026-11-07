/**
 * Sets outside Tier A that are imported by default. Each was reviewed one by one: license
 * verified at its official source (2026-11-07), credit wording checked, kind checked by eye.
 * Add a set here only after the same review (see SOURCES.md).
 */
export const APPROVED_SETS: readonly string[] = [
  'pixel', // HackerNoon Pixel Icon Library: CC BY 4.0
  'streamline-pixel', // Streamline: CC BY 4.0
  'streamline-emojis', // Streamline: CC BY 4.0
  'twemoji', // Twemoji graphics: CC BY 4.0
  'emojione', // Emoji One 2.x via Emojitwo: CC BY 4.0
  'emojione-monotone',
  'amcharts-weather', // amCharts (not in Iconify): CC BY 4.0
];

/**
 * Who to credit, as each licensor asks (CC BY 4.0 §3(a)(1)(A)(i): "in any reasonable manner
 * requested by the Licensor"). Overrides Iconify's author field for these sets.
 */
export const CREDITS: Readonly<Record<string, { authorName: string; authorUrl: string }>> = {
  // Streamline's license: "give appropriate credit and provide a link to the Streamline website".
  'streamline-pixel': { authorName: 'Streamline', authorUrl: 'https://www.streamlinehq.com' },
  'streamline-emojis': { authorName: 'Streamline', authorUrl: 'https://www.streamlinehq.com' },
  // LICENSE-GRAPHICS of jdecked/twemoji, the maintained continuation of Twitter's Twemoji.
  twemoji: {
    authorName: 'Twitter, Inc. and other contributors',
    authorUrl: 'https://github.com/jdecked/twemoji',
  },
  // Emojitwo asks to name Emoji One (Ranks.com) and Emojitwo, linking to them.
  emojione: {
    authorName: 'Ranks.com and the Emojitwo contributors',
    authorUrl: 'https://github.com/EmojiTwo/emojitwo',
  },
  'emojione-monotone': {
    authorName: 'Ranks.com and the Emojitwo contributors',
    authorUrl: 'https://github.com/EmojiTwo/emojitwo',
  },
};
