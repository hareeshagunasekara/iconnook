import { customizeSvg, toCode, type CodeFormat, type Customization } from '@iconnook/svg';

import type { Dependencies, IconDetail, IconListItem } from '../domain.js';
import { notFound, unavailable } from '../http/problem.js';

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
const safeUrl = (url: string | null) => (url && /^https?:\/\//.test(url) ? url : null);

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
    return customizeSvg(await this.getIcon(set, name), c);
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

    const plain =
      `"${name}" icon from ${setInfo.name} by ${author}, licensed under ${setInfo.license.spdx}` +
      (licenseUrl ? ` (${licenseUrl})` : '') +
      (shareAlike ? '. Modified versions must use the same license.' : '');
    const link = (text: string, url: string | null) =>
      url ? `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>` : escapeHtml(text);
    const mdLink = (text: string, url: string | null) =>
      url ? `[${escapeMd(text)}](${url})` : escapeMd(text);

    return {
      required: setInfo.license.attributionRequired,
      shareAlike,
      plain,
      html:
        `${link(name, page)} icon from ${escapeHtml(setInfo.name)} by ${link(author, authorUrl)}, ` +
        `licensed under ${link(setInfo.license.spdx, licenseUrl)}`,
      markdown:
        `${mdLink(name, page)} icon from ${escapeMd(setInfo.name)} by ${mdLink(author, authorUrl)}, ` +
        `licensed under ${mdLink(setInfo.license.spdx, licenseUrl)}`,
    };
  }

  async search(
    params: SearchParams,
  ): Promise<{ total: number; items: IconListItem[]; tookMs: number }> {
    let hits;
    try {
      hits = await this.deps.search.search(params);
    } catch (error) {
      if (error instanceof RangeError) throw error; // invalid filter: a client error, not an outage
      throw unavailable('Search is temporarily unavailable, please retry shortly');
    }
    const items = await this.deps.icons.getIconsByIds(hits.ids);
    return { total: hits.total, items, tookMs: hits.processingTimeMs };
  }
}
