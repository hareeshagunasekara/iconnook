import { customizeSvg, toCode, type CodeFormat, type Customization } from '@iconnook/svg';

import type { Dependencies, IconDetail, IconListItem } from '../domain.js';
import { badRequest, notFound, unavailable } from '../http/problem.js';

export interface SearchParams {
  q: string;
  set?: string | undefined;
  type?: string | undefined;
  tier?: string | undefined;
  color?: boolean | undefined;
  category?: string | undefined;
  page: number;
  limit: number;
}

export interface Attribution {
  required: boolean;
  shareAlike: boolean;
  plain: string;
  html: string;
  markdown: string;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
const escapeMd = (s: string) => s.replace(/([\\[\]()*_`])/g, '\\$1');

/**
 * Every downloaded SVG names its source and license, so the notice travels with the file (MIT and
 * Apache-2.0 keep the license with copies; CC BY asks for credit and a note of changes).
 */
export function creditComment(icon: IconDetail): string {
  const { setInfo } = icon;
  const by = setInfo.author ? ` by ${setInfo.author.name}` : '';
  const url = setInfo.license.url ? ` (${setInfo.license.url})` : '';
  const text =
    `"${icon.name}" from ${setInfo.name}${by}. License: ${setInfo.license.spdx}${url}. ` +
    'Optimized by IconNook (iconnook.com); modified from the original.';
  // "--" can't appear inside an XML comment.
  return `<!-- ${text.replace(/-{2,}/g, '-')} -->\n`;
}
/** Only plain http(s) URLs without whitespace or angle brackets are linked; anything else is dropped. */
const safeUrl = (url: string | null) => (url && /^https?:\/\/[^\s<>]+$/.test(url) ? url : null);

export class IconService {
  constructor(
    private readonly deps: Dependencies,
    private readonly siteUrl: string,
  ) {}

  async getIcon(set: string, name: string): Promise<IconDetail> {
    const icon = await this.deps.icons.getIcon(set, name);
    if (!icon) throw notFound(`Icon "${set}:${name}" does not exist`);
    return icon;
  }

  async svg(set: string, name: string, c: Customization): Promise<string> {
    const icon = await this.getIcon(set, name);
    return creditComment(icon) + customizeSvg(icon, c);
  }

  async png(set: string, name: string, c: Customization & { size: number }): Promise<Buffer> {
    const icon = await this.getIcon(set, name);
    const { size, ...rest } = c;
    const width =
      icon.width >= icon.height ? size : Math.max(1, Math.round((size * icon.width) / icon.height));
    return this.deps.png.render(customizeSvg(icon, rest), width);
  }

  async code(set: string, name: string, format: CodeFormat, c: Customization): Promise<string> {
    const icon = await this.getIcon(set, name);
    return toCode(format, customizeSvg(icon, c), { set, name, isColor: icon.setInfo.isColor });
  }

  async attribution(set: string, name: string): Promise<Attribution> {
    const icon = await this.getIcon(set, name);
    const { setInfo } = icon;
    const page = `${this.siteUrl}/icons/${set}/${name}`;
    const author = setInfo.author?.name ?? setInfo.name;
    const authorUrl = safeUrl(setInfo.author?.url ?? null);
    const licenseUrl = safeUrl(setInfo.license.url);
    const shareAlike = setInfo.license.tier === 'C';

    // CC BY asks to indicate changes (we optimize every icon); CC BY-SA also needs the
    // share-alike notice in every form the user might paste.
    const notice =
      (setInfo.license.attributionRequired ? '. Modified from the original.' : '') +
      (shareAlike ? ' Modified versions must use the same license.' : '');
    const plain =
      `"${name}" icon from ${setInfo.name} by ${author}, licensed under ${setInfo.license.spdx}` +
      (licenseUrl ? ` (${licenseUrl})` : '') +
      notice;
    const link = (text: string, url: string | null) =>
      url ? `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>` : escapeHtml(text);
    // Angle-bracket destinations keep URLs containing ")" from breaking the link (CommonMark).
    const mdLink = (text: string, url: string | null) =>
      url ? `[${escapeMd(text)}](<${url}>)` : escapeMd(text);

    return {
      required: setInfo.license.attributionRequired,
      shareAlike,
      plain,
      html:
        `${link(name, page)} icon from ${escapeHtml(setInfo.name)} by ${link(author, authorUrl)}, ` +
        `licensed under ${link(setInfo.license.spdx, licenseUrl)}${escapeHtml(notice)}`,
      markdown:
        `${mdLink(name, page)} icon from ${escapeMd(setInfo.name)} by ${mdLink(author, authorUrl)}, ` +
        `licensed under ${mdLink(setInfo.license.spdx, licenseUrl)}${escapeMd(notice)}`,
    };
  }

  async search(
    params: SearchParams,
  ): Promise<{ total: number; items: IconListItem[]; tookMs: number }> {
    let hits;
    try {
      hits = await this.deps.search.search(params);
    } catch (error) {
      // An invalid filter is the client's fault (400), anything else is an outage (503).
      if (error instanceof RangeError) throw badRequest(error.message);
      throw unavailable('Search is temporarily unavailable, please retry shortly');
    }
    const items = await this.deps.icons.getIconsByIds(hits.ids);
    return { total: hits.total, items, tookMs: hits.processingTimeMs };
  }
}
