// k6 load test for the IconNook API (docs/standards/scalability.md).
// Run: docker run --rm -i -e BASE_URL=http://host.docker.internal:8787 grafana/k6 run - < load/api.js
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8787';
const QUERIES = [
  'home',
  'arrow left',
  'trash',
  'user',
  'settings',
  'search',
  'heart',
  'star',
  'mail',
  'calendar',
  'github',
  'cloud',
  'trsh',
  'chevron down',
  'bell',
];
const ICONS = [
  ['tabler', 'home'],
  ['mdi', 'home'],
  ['lucide', 'trash'],
  ['material-symbols', 'settings'],
  ['ph', 'heart'],
  ['fluent', 'mail-24-regular'],
  ['simple-icons', 'github'],
  ['bi', 'star'],
];
const COLORS = ['%23ff0000', '%2300aa55', '%233b4fd8', 'currentColor'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const options = {
  scenarios: {
    mixed: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    // Targets from docs/standards/performance.md (uncached, i.e. no CDN in front).
    'http_req_duration{kind:search}': ['p(95)<100'],
    'http_req_duration{kind:icon}': ['p(95)<50'],
    'http_req_duration{kind:svg}': ['p(95)<50'],
    'http_req_duration{kind:png}': ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const r = Math.random();
  const [set, name] = pick(ICONS);
  let res;
  if (r < 0.35) {
    res = http.get(`${BASE}/v1/search?q=${encodeURIComponent(pick(QUERIES))}&limit=48`, {
      tags: { kind: 'search' },
    });
  } else if (r < 0.6) {
    res = http.get(`${BASE}/v1/icons/${set}/${name}`, { tags: { kind: 'icon' } });
  } else if (r < 0.9) {
    const size = pick([24, 32, 48, 64, 128]);
    res = http.get(`${BASE}/v1/icons/${set}/${name}.svg?color=${pick(COLORS)}&size=${size}`, {
      tags: { kind: 'svg' },
      redirects: 0,
    });
  } else {
    const size = pick([64, 128, 256, 512]);
    res = http.get(`${BASE}/v1/icons/${set}/${name}.png?size=${size}`, { tags: { kind: 'png' } });
  }
  check(res, { 'status 200': (x) => x.status === 200 });
}
