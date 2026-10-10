# upcheck

[![CI](https://img.shields.io/github/actions/workflow/status/dtxdex1020/upcheck/ci.yml?branch=main&style=flat-square&label=CI&labelColor=1f4e79)](https://github.com/dtxdex1020/upcheck/actions/workflows/ci.yml)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-ready-4aa3df?style=flat-square&labelColor=1f4e79&logo=githubactions&logoColor=white)](#github-action)
[![node](https://img.shields.io/badge/node-%3E%3D20-4aa3df?style=flat-square&labelColor=1f4e79&logo=nodedotjs&logoColor=white)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-4aa3df?style=flat-square&labelColor=1f4e79)](./LICENSE)

Is it up? Is it fast? Is the certificate about to expire? Does the page still say what it should?

`upcheck` answers all four for a list of URLs in one command, prints a clean table (or JSON), and exits non-zero when something's wrong. Run it by hand, from cron, or as a scheduled GitHub Action that pings you when a site goes down.

```text
$ upcheck https://example.com https://github.com https://expired.badssl.com
      TARGET                      STATUS  TIME   TLS     NOTES
up    https://example.com         200     185ms  76d
up    https://github.com          200     122ms  50d
down  https://expired.badssl.com  -       -      -4199d  fetch failed (CERT_HAS_EXPIRED); certificate expired

1 of 3 down
```

## Install

```sh
npm install -g github:dtxdex1020/upcheck
```

## Usage

```sh
upcheck https://example.com                       # one URL
upcheck https://a.com https://b.com --json        # JSON for scripts
upcheck https://shop.com -k "Add to cart"         # page must contain this text
upcheck https://api.com/health -s 200 -s 204      # only these status codes count
upcheck https://example.com --min-tls-days 30     # fail if the cert expires within 30 days
upcheck --config upcheck.yml                      # a list of checks from a file
```

| Flag                   | Default        |                                                |
| ---------------------- | -------------- | ---------------------------------------------- |
| `-c, --config <file>`  |                | JSON or YAML config (see below)                |
| `-k, --keyword <text>` |                | Text that must appear in the body              |
| `-s, --status <code>`  | any 2xx or 3xx | Expected status, repeatable                    |
| `-t, --timeout <ms>`   | `10000`        | Per request                                    |
| `--min-tls-days <n>`   | `7`            | Fail when the cert expires sooner              |
| `--head`               | off            | Use HEAD (switches to GET if a keyword is set) |
| `--concurrency <n>`    | `5`            | Checks in flight at once                       |
| `--json`               | off            | JSON output                                    |
| `--no-color`           |                | Also respects `NO_COLOR`                       |

**Exit codes:** `0` all up, `1` at least one check failed, `2` bad usage or config.

Redirects are followed and the final status is what counts. TLS expiry is read from the leaf certificate of every `https://` URL.

## Config file

YAML or JSON. Flags on the command line override `defaults`, and URLs passed as arguments are added to the list.

```yaml
# upcheck.yml
defaults:
  timeout: 8000
  minTlsDays: 14

checks:
  - https://example.com # a plain URL works
  - name: GitHub
    url: https://github.com
    keyword: GitHub
  - name: API health
    url: https://api.example.com/health
    expectStatus: [200, 204]
    headers:
      x-api-key: your-key-here
```

| Field          | Type               | Notes                    |
| -------------- | ------------------ | ------------------------ |
| `url`          | string             | Required, http or https  |
| `name`         | string             | Label in the output      |
| `method`       | `GET` \| `HEAD`    | Default `GET`            |
| `expectStatus` | number \| number[] | Default any 2xx or 3xx   |
| `keyword`      | string             | Case-sensitive substring |
| `timeout`      | number (ms)        | Default `10000`          |
| `minTlsDays`   | number             | Default `7`              |
| `headers`      | object             | Extra request headers    |

Typos fail loudly (`checks[2]: unknown field "tiemout"`) instead of being silently ignored.

## GitHub Action

Check your sites every 30 minutes and get the usual failed-workflow email when one is down:

```yaml
# .github/workflows/uptime.yml
name: Uptime

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

jobs:
  upcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4 # only needed for a config file in your repo
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtxdex1020/upcheck@main
        with:
          urls: |
            https://example.com
            https://example.com/api/health
          args: --min-tls-days 14 --keyword ok
```

| Input    | Description                                  |
| -------- | -------------------------------------------- |
| `urls`   | URLs separated by spaces or newlines         |
| `config` | Path to a JSON or YAML config in your repo   |
| `args`   | Extra flags, e.g. `--min-tls-days 21 --json` |

Pin a commit SHA instead of `@main` if you want reproducible runs.

## As a library

```ts
import { checkAll, formatTable } from 'upcheck';

const results = await checkAll([{ url: 'https://example.com', keyword: 'Example' }]);
console.log(formatTable(results));
// results[0] -> { name, url, ok, status, ms, tlsDaysLeft, tlsValidTo, keywordFound, errors }
```

## Why

Hosted uptime monitors are great until you need fifteen of them on the free tier, or you just want to know "is everything fine?" before a deploy. Most CLI alternatives check status codes and stop there. I wanted the four checks I actually care about, a table I can read at a glance, and exit codes that make it trivial to wire into CI or cron.

## Development

```sh
npm install
npm test        # vitest, against local HTTP and self-signed HTTPS servers
npm run lint    # eslint + prettier + tsc
npm run build
```

## License

[MIT](./LICENSE)
