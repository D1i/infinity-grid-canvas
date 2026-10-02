# Benchmark results

Headless chromium 141.0.7390.37, viewport 1440×900, 200 frames per sample, 2026-10-02.

## no throttling

| fields | rows | add | undo | redo | frame @100% (drawn) | frame @40% (drawn) | frame @20% (drawn) | drag |
|---:|---:|---:|---:|---:|---|---|---|---:|
| 1,000 | 503 | 4 ms | 1 ms | 0 ms | 0.3 / 0.7 ms (41) | 0.5 / 1.0 ms (97) | 0.3 / 0.5 ms (193) | 60 fps |
| 10,000 | 5,003 | 11 ms | 4 ms | 2 ms | 0.3 / 0.6 ms (42) | 0.4 / 0.8 ms (98) | 0.3 / 0.6 ms (194) | 60 fps |
| 50,000 | 25,003 | 72 ms | 21 ms | 9 ms | 0.3 / 0.6 ms (42) | 0.5 / 0.8 ms (98) | 0.4 / 0.6 ms (194) | 60 fps |

## 10x CPU throttling

| fields | rows | add | undo | redo | frame @100% (drawn) | frame @40% (drawn) | frame @20% (drawn) | drag |
|---:|---:|---:|---:|---:|---|---|---|---:|
| 1,000 | 503 | 24 ms | 1 ms | 10 ms | 4.0 / 8.7 ms (41) | 5.8 / 11.2 ms (97) | 3.4 / 6.0 ms (193) | 41 fps |
| 10,000 | 5,003 | 139 ms | 12 ms | 26 ms | 3.8 / 6.9 ms (42) | 5.9 / 10.2 ms (98) | 3.5 / 7.2 ms (194) | 40 fps |
| 50,000 | 25,003 | 620 ms | 219 ms | 147 ms | 4.3 / 8.1 ms (42) | 6.0 / 8.1 ms (98) | 4.1 / 6.8 ms (194) | 46 fps |

Frame columns are p50 / p95 of a synchronous render at that zoom; "drawn" is how many items intersected the viewport. "drag" is the requestAnimationFrame rate while an item is dragged across the sheet with placement prediction running on every pointer move.
