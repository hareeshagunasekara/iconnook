import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** RFC 9457 Problem Details — the only error shape the API returns. */
export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: { path: string; message: string }[];
}

const PROBLEM_BASE = 'https://iconnook.com/problems/';

export class ProblemError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly slug: string,
    readonly title: string,
    detail?: string,
    readonly extra: Partial<Pick<ProblemBody, 'errors'>> = {},
  ) {
    super(detail ?? title);
    this.name = 'ProblemError';
  }
}

export const notFound = (detail: string) => new ProblemError(404, 'not-found', 'Not Found', detail);
export const badRequest = (detail: string, errors?: ProblemBody['errors']) =>
  new ProblemError(400, 'invalid-request', 'Invalid request', detail, errors ? { errors } : {});

/** A dependency (search, database) is down or too slow: tell clients to retry, don't blame them. */
export const unavailable = (detail: string) =>
  new ProblemError(503, 'service-unavailable', 'Service Unavailable', detail);

export function problemResponse(c: Context, problem: ProblemError): Response {
  const body: ProblemBody = {
    type: `${PROBLEM_BASE}${problem.slug}`,
    title: problem.title,
    status: problem.status,
    detail: problem.message,
    instance: new URL(c.req.url).pathname,
    ...problem.extra,
  };
  c.header('Cache-Control', 'no-store');
  if (problem.status === 503) c.header('Retry-After', '5');
  return c.body(JSON.stringify(body), problem.status, {
    'Content-Type': 'application/problem+json',
  });
}
