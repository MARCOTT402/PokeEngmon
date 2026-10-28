# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Releases after the SemVer migration are produced automatically by
[semantic-release](https://github.com/semantic-release/semantic-release)
from Conventional Commits on `main`.

## [1.48.0] - 2026-10-28

### Changed

- Migrated app versioning from monotonic `vNN` tokens to SemVer `MAJOR.MINOR.PATCH`.
- Introduced `semantic-release` + GitHub Actions release workflow on `main`.
- `js/app.js` / `sw.js` / `index.html` cache-bust strings are synced from `package.json` via `tools/sync_app_version.py`.
