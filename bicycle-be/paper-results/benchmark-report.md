# Anonymization Benchmark Report

Source benchmark: `C:\Users\SHAFMUH\Documents\2024-ma-haris-mustafa\bicycle-be\evaluation-results\anonymization-benchmark-2026-05-11T20-07-47-315Z.json`

Loaded rows: 25000

Sample sizes: 1000, 5000, 10000, 25000

k values: 5, 10, 20

Temporal modes: none, period, hour

Methods: merge-nearest, suppression-baseline

## Figures

- Backend anonymization runtime by sample size.: `runtime-ms.svg`
- Rows withheld because no valid k-anonymous group could be released.: `suppressed-records.svg`
- Average distance between original start points and released centroids.: `mean-spatial-error-km.svg`
- Cosine similarity between raw and anonymized grid-cell density distributions.: `density-similarity.svg`
- Fraction of the top 10 raw-density grid cells still present after anonymization.: `top10-hotspot-overlap.svg`
- Released groups whose size is below k. This should remain zero.: `k-violations.svg`

## Largest Sample Summary

| Rows | Method | Temporal Mode | k | Runtime (ms) | k-Violations | Suppressed | Mean Error (km) | Density Similarity | Top-10 Overlap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25000 | merge-nearest | none | 5 | 15.67 | 0 | 0 | 0.33 | 100.0% | 100.0% |
| 25000 | suppression-baseline | none | 5 | 12.59 | 0 | 96 | 0.33 | 100.0% | 100.0% |
| 25000 | merge-nearest | none | 10 | 22.38 | 0 | 0 | 0.34 | 100.0% | 100.0% |
| 25000 | suppression-baseline | none | 10 | 14.84 | 0 | 203 | 0.33 | 100.0% | 100.0% |
| 25000 | merge-nearest | none | 20 | 19.08 | 0 | 0 | 0.34 | 99.9% | 100.0% |
| 25000 | suppression-baseline | none | 20 | 13.88 | 0 | 697 | 0.33 | 100.0% | 100.0% |
| 25000 | merge-nearest | period | 5 | 102.79 | 0 | 0 | 0.51 | 99.1% | 100.0% |
| 25000 | suppression-baseline | period | 5 | 82.28 | 0 | 8174 | 0.32 | 98.1% | 100.0% |
| 25000 | merge-nearest | period | 10 | 111.45 | 0 | 9 | 0.74 | 96.0% | 100.0% |
| 25000 | suppression-baseline | period | 10 | 82.16 | 0 | 13545 | 0.34 | 93.3% | 100.0% |
| 25000 | merge-nearest | period | 20 | 119.72 | 0 | 9 | 1.11 | 92.0% | 90.0% |
| 25000 | suppression-baseline | period | 20 | 73.27 | 0 | 19732 | 0.36 | 82.6% | 100.0% |
| 25000 | merge-nearest | hour | 5 | 133.98 | 0 | 81 | 1.09 | 96.3% | 100.0% |
| 25000 | suppression-baseline | hour | 5 | 84.93 | 0 | 19282 | 0.32 | 89.4% | 100.0% |
| 25000 | merge-nearest | hour | 10 | 127.64 | 0 | 295 | 1.73 | 87.3% | 80.0% |
| 25000 | suppression-baseline | hour | 10 | 81.33 | 0 | 24337 | 0.35 | 70.1% | 80.0% |
| 25000 | merge-nearest | hour | 20 | 129.86 | 0 | 718 | 2.42 | 69.0% | 40.0% |

## Baseline Comparison

The suppression baseline releases only grid cells that already satisfy k and suppresses all sparse cells. The merge-nearest method can recover sparse cells by merging them with nearby groups while still enforcing k.

| Rows | Temporal Mode | k | Merge Suppressed | Baseline Suppressed | Suppression Reduction | Merge Density | Baseline Density | Merge Hotspots | Baseline Hotspots |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25000 | none | 5 | 0 | 96 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| 25000 | none | 10 | 0 | 203 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| 25000 | none | 20 | 0 | 697 | 100.0% | 99.9% | 100.0% | 100.0% | 100.0% |
| 25000 | period | 5 | 0 | 8174 | 100.0% | 99.1% | 98.1% | 100.0% | 100.0% |
| 25000 | period | 10 | 9 | 13545 | 99.9% | 96.0% | 93.3% | 100.0% | 100.0% |
| 25000 | period | 20 | 9 | 19732 | 100.0% | 92.0% | 82.6% | 90.0% | 100.0% |
| 25000 | hour | 5 | 81 | 19282 | 99.6% | 96.3% | 89.4% | 100.0% | 100.0% |
| 25000 | hour | 10 | 295 | 24337 | 98.8% | 87.3% | 70.1% | 80.0% | 80.0% |
| 25000 | hour | 20 | 718 | 24994 | 97.1% | 69.0% | n/a | 40.0% | n/a |

## Full Results

| Rows | Method | Temporal Mode | k | Runtime (ms) | k-Violations | Suppressed | Mean Error (km) | Density Similarity | Top-10 Overlap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1000 | merge-nearest | none | 5 | 6.50 | 0 | 0 | 0.30 | 97.9% | 100.0% |
| 1000 | suppression-baseline | none | 5 | 2.36 | 0 | 130 | 0.22 | 99.5% | 100.0% |
| 1000 | merge-nearest | none | 10 | 2.31 | 0 | 0 | 0.45 | 94.2% | 90.0% |
| 1000 | suppression-baseline | none | 10 | 1.81 | 0 | 279 | 0.24 | 98.1% | 100.0% |
| 1000 | merge-nearest | none | 20 | 1.72 | 0 | 0 | 0.69 | 82.9% | 50.0% |
| 1000 | suppression-baseline | none | 20 | 0.92 | 0 | 481 | 0.29 | 94.2% | 100.0% |
| 1000 | merge-nearest | period | 5 | 5 | 0 | 40 | 2.01 | 75.2% | 40.0% |
| 1000 | suppression-baseline | period | 5 | 2.78 | 0 | 921 | 0.25 | 74.1% | 40.0% |
| 1000 | merge-nearest | period | 10 | 3.19 | 0 | 56 | 3.04 | 51.6% | 30.0% |
| 1000 | suppression-baseline | period | 10 | 1.80 | 0 | 1000 | n/a | n/a | n/a |
| 1000 | merge-nearest | period | 20 | 4.23 | 0 | 239 | 3.58 | 32.0% | 30.0% |
| 1000 | suppression-baseline | period | 20 | 3.08 | 0 | 1000 | n/a | n/a | n/a |
| 1000 | merge-nearest | hour | 5 | 5.51 | 0 | 340 | 3.27 | 58.9% | 30.0% |
| 1000 | suppression-baseline | hour | 5 | 2.13 | 0 | 994 | 0.00 | 11.8% | 10.0% |
| 1000 | merge-nearest | hour | 10 | 2.69 | 0 | 806 | 3.02 | 52.6% | 30.0% |
| 1000 | suppression-baseline | hour | 10 | 1.59 | 0 | 1000 | n/a | n/a | n/a |
| 1000 | merge-nearest | hour | 20 | 1.61 | 0 | 1000 | n/a | n/a | n/a |
| 1000 | suppression-baseline | hour | 20 | 2.76 | 0 | 1000 | n/a | n/a | n/a |
| 5000 | merge-nearest | none | 5 | 7.26 | 0 | 0 | 0.29 | 99.9% | 100.0% |
| 5000 | suppression-baseline | none | 5 | 4.06 | 0 | 134 | 0.28 | 100.0% | 100.0% |
| 5000 | merge-nearest | none | 10 | 5.06 | 0 | 0 | 0.33 | 98.7% | 100.0% |
| 5000 | suppression-baseline | none | 10 | 3.92 | 0 | 444 | 0.28 | 99.7% | 100.0% |
| 5000 | merge-nearest | none | 20 | 3.19 | 0 | 0 | 0.36 | 97.4% | 100.0% |
| 5000 | suppression-baseline | none | 20 | 2.92 | 0 | 878 | 0.29 | 99.0% | 100.0% |
| 5000 | merge-nearest | period | 5 | 22.57 | 0 | 2 | 1.00 | 92.6% | 70.0% |
| 5000 | suppression-baseline | period | 5 | 14.11 | 0 | 3516 | 0.29 | 87.9% | 70.0% |
| 5000 | merge-nearest | period | 10 | 27.56 | 0 | 37 | 1.59 | 83.2% | 60.0% |
| 5000 | suppression-baseline | period | 10 | 15.37 | 0 | 4760 | 0.31 | 68.4% | 50.0% |
| 5000 | merge-nearest | period | 20 | 22.76 | 0 | 168 | 2.25 | 55.5% | 40.0% |
| 5000 | suppression-baseline | period | 20 | 13.58 | 0 | 4999 | n/a | n/a | n/a |
| 5000 | merge-nearest | hour | 5 | 20.73 | 0 | 163 | 2.23 | 77.9% | 60.0% |
| 5000 | suppression-baseline | hour | 5 | 17.86 | 0 | 4852 | 0.23 | 74.8% | 70.0% |
| 5000 | merge-nearest | hour | 10 | 19.23 | 0 | 502 | 3.07 | 53.1% | 50.0% |
| 5000 | suppression-baseline | hour | 10 | 12.03 | 0 | 4999 | n/a | n/a | n/a |
| 5000 | merge-nearest | hour | 20 | 16.44 | 0 | 1512 | 3.63 | 32.0% | 40.0% |
| 5000 | suppression-baseline | hour | 20 | 14.12 | 0 | 4999 | n/a | n/a | n/a |
| 10000 | merge-nearest | none | 5 | 10.37 | 0 | 0 | 0.32 | 100.0% | 100.0% |
| 10000 | suppression-baseline | none | 5 | 7.54 | 0 | 105 | 0.32 | 100.0% | 100.0% |
| 10000 | merge-nearest | none | 10 | 8.78 | 0 | 0 | 0.33 | 99.9% | 100.0% |
| 10000 | suppression-baseline | none | 10 | 8.42 | 0 | 286 | 0.32 | 100.0% | 100.0% |
| 10000 | merge-nearest | none | 20 | 10.67 | 0 | 0 | 0.36 | 99.3% | 100.0% |
| 10000 | suppression-baseline | none | 20 | 11.14 | 0 | 899 | 0.32 | 99.7% | 100.0% |
| 10000 | merge-nearest | period | 5 | 45.43 | 0 | 4 | 0.73 | 97.0% | 90.0% |
| 10000 | suppression-baseline | period | 5 | 31.39 | 0 | 5222 | 0.31 | 94.6% | 100.0% |
| 10000 | merge-nearest | period | 10 | 52.71 | 0 | 4 | 1.13 | 92.1% | 80.0% |
| 10000 | suppression-baseline | period | 10 | 29.56 | 0 | 7858 | 0.35 | 82.4% | 70.0% |
| 10000 | merge-nearest | period | 20 | 61.34 | 0 | 89 | 1.71 | 74.9% | 60.0% |
| 10000 | suppression-baseline | period | 20 | 26.82 | 0 | 9906 | 0.36 | 51.6% | 30.0% |
| 10000 | merge-nearest | hour | 5 | 51.91 | 0 | 108 | 1.69 | 88.2% | 70.0% |
| 10000 | suppression-baseline | hour | 5 | 27.58 | 0 | 9282 | 0.31 | 80.3% | 80.0% |
| 10000 | merge-nearest | hour | 10 | 46.74 | 0 | 416 | 2.49 | 68.4% | 30.0% |
| 10000 | suppression-baseline | hour | 10 | 28.75 | 0 | 9977 | 0.41 | 40.0% | 20.0% |
| 10000 | merge-nearest | hour | 20 | 50.58 | 0 | 1055 | 3.19 | 45.4% | 30.0% |
| 10000 | suppression-baseline | hour | 20 | 24.19 | 0 | 9999 | n/a | n/a | n/a |
| 25000 | merge-nearest | none | 5 | 15.67 | 0 | 0 | 0.33 | 100.0% | 100.0% |
| 25000 | suppression-baseline | none | 5 | 12.59 | 0 | 96 | 0.33 | 100.0% | 100.0% |
| 25000 | merge-nearest | none | 10 | 22.38 | 0 | 0 | 0.34 | 100.0% | 100.0% |
| 25000 | suppression-baseline | none | 10 | 14.84 | 0 | 203 | 0.33 | 100.0% | 100.0% |
| 25000 | merge-nearest | none | 20 | 19.08 | 0 | 0 | 0.34 | 99.9% | 100.0% |
| 25000 | suppression-baseline | none | 20 | 13.88 | 0 | 697 | 0.33 | 100.0% | 100.0% |
| 25000 | merge-nearest | period | 5 | 102.79 | 0 | 0 | 0.51 | 99.1% | 100.0% |
| 25000 | suppression-baseline | period | 5 | 82.28 | 0 | 8174 | 0.32 | 98.1% | 100.0% |
| 25000 | merge-nearest | period | 10 | 111.45 | 0 | 9 | 0.74 | 96.0% | 100.0% |
| 25000 | suppression-baseline | period | 10 | 82.16 | 0 | 13545 | 0.34 | 93.3% | 100.0% |
| 25000 | merge-nearest | period | 20 | 119.72 | 0 | 9 | 1.11 | 92.0% | 90.0% |
| 25000 | suppression-baseline | period | 20 | 73.27 | 0 | 19732 | 0.36 | 82.6% | 100.0% |
| 25000 | merge-nearest | hour | 5 | 133.98 | 0 | 81 | 1.09 | 96.3% | 100.0% |
| 25000 | suppression-baseline | hour | 5 | 84.93 | 0 | 19282 | 0.32 | 89.4% | 100.0% |
| 25000 | merge-nearest | hour | 10 | 127.64 | 0 | 295 | 1.73 | 87.3% | 80.0% |
| 25000 | suppression-baseline | hour | 10 | 81.33 | 0 | 24337 | 0.35 | 70.1% | 80.0% |
| 25000 | merge-nearest | hour | 20 | 129.86 | 0 | 718 | 2.42 | 69.0% | 40.0% |
| 25000 | suppression-baseline | hour | 20 | 70.45 | 0 | 24994 | n/a | n/a | n/a |
