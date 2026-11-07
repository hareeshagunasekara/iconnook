import type { Attribution, IconDetail } from '../lib/api';
import { typeLabel } from '../lib/kinds';

/**
 * License and details of an icon, kept small: who made it, the license and (when needed) the
 * credit line to copy, plus set, name, size and tags. Rendered on the server for the icon page
 * and by the icon modal.
 */
export function IconInfo({
  icon,
  attribution,
}: {
  icon: IconDetail;
  attribution: Attribution | null;
}) {
  const { setInfo } = icon;
  const tags = [
    ...icon.categories.map((c) => ({ label: c.label, href: `/categories/${c.slug}` })),
    ...icon.synonyms.map((s) => ({ label: s, href: `/search?q=${encodeURIComponent(s)}` })),
  ].slice(0, 8);
  return (
    <div class="grid gap-x-8 gap-y-4 rounded-[var(--radius-card)] border-2 border-ink/15 p-4 text-sm md:grid-cols-2">
      <section aria-label="License" class="min-w-0">
        <p>
          <strong>{setInfo.license.spdx}</strong> license, from{' '}
          <a class="link" href={`/sets/${icon.set}`}>
            {setInfo.name}
          </a>
          {setInfo.author && <> by {setInfo.author.name}</>}.{' '}
          {setInfo.license.url && (
            <a class="link" href={setInfo.license.url} rel="noopener">
              Read the license
            </a>
          )}
        </p>
        {attribution && (
          <>
            <p class="mt-2">
              {attribution.required ? (
                <>
                  <strong>Credit required.</strong> Copy this line into your project or site:
                </>
              ) : (
                'No credit needed, but one is always appreciated:'
              )}
            </p>
            <p class="mt-1 rounded-lg bg-surface-2 p-2 font-mono text-xs [overflow-wrap:anywhere]">
              {attribution.plain}
            </p>
          </>
        )}
        {setInfo.type === 'logos' && (
          <p class="mt-2 text-text-muted">
            <strong>Trademark notice:</strong> the license covers this drawing, not the brand.
          </p>
        )}
      </section>
      <section aria-label="Details" class="min-w-0">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt class="text-text-muted">Set</dt>
          <dd>
            <a class="link" href={`/sets/${icon.set}`}>
              {setInfo.name}
            </a>{' '}
            ({typeLabel(setInfo.type)})
          </dd>
          <dt class="text-text-muted">Name</dt>
          <dd class="font-mono [overflow-wrap:anywhere]">
            {icon.set}:{icon.name}
          </dd>
          <dt class="text-text-muted">Grid</dt>
          <dd>
            {icon.width} × {icon.height}
          </dd>
          {tags.length > 0 && (
            <>
              <dt class="text-text-muted">Tags</dt>
              <dd>
                {tags.map((t, i) => (
                  <>
                    {i > 0 && ', '}
                    <a class="link" href={t.href}>
                      {t.label}
                    </a>
                  </>
                ))}
              </dd>
            </>
          )}
        </dl>
        <p class="mt-2">
          <a class="link" href="/licenses">
            How licenses work on IconNook
          </a>
        </p>
      </section>
    </div>
  );
}
