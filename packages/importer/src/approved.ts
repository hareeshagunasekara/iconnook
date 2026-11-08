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
  // Share-alike (Tier C), reviewed 2026-11-08. Arcticons is left out on purpose: 15,000 drawings of
  // other companies' app logos would bury ordinary results. Fontelico and SmartIcons Glyphs are
  // hidden (deprecated) in Iconify.
  'openmoji', // OpenMoji: CC BY-SA 4.0
  'emojione-v1', // Emoji One 1.x artwork (joypixels/emojione-legacy): CC BY-SA 4.0
  'typcn', // Typicons artwork: CC BY-SA 4.0 (the font is OFL, but we use the artwork)
  'entypo', // Entypo+ by Daniel Bruce: CC BY-SA 4.0
  'entypo-social',
  // Brandico's README says "CC BY" but links to CC BY-SA 3.0: we follow the stricter one.
  'brandico',
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
  // OpenMoji's README: "All emojis designed by OpenMoji", linking to openmoji.org.
  openmoji: { authorName: 'OpenMoji', authorUrl: 'https://openmoji.org/' },
};

/**
 * Brand logos inside sets that aren't logo sets. The importer files them under "Brands", and the
 * icon page shows a trademark notice for them (the license covers the drawing, not the brand).
 */
export const BRAND_ICONS: Readonly<Record<string, RegExp>> = {
  // Subgroup "brand" in OpenMoji's data/openmoji.json (commit 3e01de5).
  openmoji: new RegExp(
    '^(' +
      [
        'android',
        'apple',
        'artstation',
        'bluesky',
        'c',
        'chrome',
        'chrome-canary',
        'chromium',
        'cplusplus',
        'csharp',
        'discord',
        'dotnet',
        'ecosia-browser',
        'edge',
        'element',
        'facebook',
        'facetime',
        'firefox',
        'firefox-developer',
        'firefox-nightly',
        'github',
        'gitlab',
        'golang',
        'inaturalist',
        'instagram',
        'internet-explorer',
        'javascript',
        'jellyfin',
        'kotlin',
        'linkedin',
        'markdown',
        'mastodon',
        'musicbrainz',
        'netscape-navigator',
        'openfoodfact',
        'openstreetmap',
        'opera',
        'peertube',
        'pinterest',
        'pixelfed',
        'reddit',
        'ruby',
        'safari',
        'signal',
        'svg',
        'twitter',
        'typescript',
        'ubuntu',
        'webassembly',
        'wikidata',
        'windows',
        'winrar',
        'youtube',
      ].join('|') +
      ')$',
  ),
  // social-at-circular is just an "@" sign.
  typcn: /^(social-(?!at-)|vendor-|css3$|html5$)/,
  entypo: /^creative-commons/,
};

/**
 * Sets we never import even though their license allows it, with the reason. The importer skips
 * them and deletes them from the database if an earlier import stored them.
 */
export const BLOCKED_SETS: Readonly<Record<string, string>> = {
  // Our sources policy (CLAUDE.md): never import from Icons8, whatever the set's license says.
  la: 'Line Awesome, by Icons8',
  'flat-color-icons': 'Flat Color Icons, by Icons8',
  icons8: 'Icons8 Windows 10 Icons, by Icons8',
  wpf: 'Icons8 Windows 8 Icons, by Icons8',
};

/**
 * Sets we never import even though their license allows it, with the reason. The importer skips
 * them and deletes them from the database if an earlier import stored them.
 */
export const BLOCKED_SETS: Readonly<Record<string, string>> = {
  // Our sources policy (CLAUDE.md): never import from Icons8, whatever the set's license says.
  la: 'Line Awesome, by Icons8',
  'flat-color-icons': 'Flat Color Icons, by Icons8',
  icons8: 'Icons8 Windows 10 Icons, by Icons8',
  wpf: 'Icons8 Windows 8 Icons, by Icons8',
};
