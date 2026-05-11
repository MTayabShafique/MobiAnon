# Evaluation and Threat Model Draft

This document converts the implemented benchmark and live-backend scalability work into paper-ready text for a SKILL 2026 submission. It is written as a draft section, not as developer documentation.

## Threat Model

The demonstrator addresses exploratory privacy risks in station-based mobility data, where each trip contains spatial coordinates, timestamps, and a coarse rider category. The main adversary is assumed to have access to a released or visualized mobility sample and to use external knowledge about places, commuting times, or repeated mobility patterns to infer sensitive information about individuals or small groups.

We consider three attacker-knowledge levels:

| Threat level | Attacker knowledge | Privacy risk | Demonstrator response |
| --- | --- | --- | --- |
| Spatial-only | Approximate start area of a trip | Re-identification in sparse locations | Merge spatial grid cells until each released group satisfies k |
| Spatial plus coarse time | Start area and broad time period such as morning, afternoon, evening, or night | Stronger inference for commute-like trips | Apply k-anonymity within spatial-temporal groups |
| Spatial plus fine time | Start area and hour of day | Highest risk because groups become sparse | Apply stricter hour-level grouping, suppress records that cannot form valid k-anonymous groups |

The system does not claim protection against adversaries who know a complete individual trajectory, exact station events, payment/account identifiers, or repeated long-term behavior across many days. It also does not provide formal differential privacy. Instead, the contribution is an explainable, interactive k-anonymity demonstrator that makes the privacy-utility tradeoff visible to non-specialist users.

## Evaluation Protocol

The evaluation uses January 2024 Citi Bike trip data and measures both anonymization quality and backend responsiveness. The anonymization benchmark samples 1,000, 5,000, 10,000, and 25,000 rows from the CSV dataset and evaluates k values of 5, 10, and 20 under three temporal settings:

- `none`: spatial k-anonymity only
- `period`: spatial k-anonymity within broad day periods
- `hour`: spatial k-anonymity within individual hours

For each configuration, the benchmark reports runtime, number of k-violating released groups, suppressed records, mean spatial error, density cosine similarity, and top-10 hotspot overlap. These metrics separate privacy validity from utility loss. A valid release should have zero k-violations, while utility is reflected by low spatial error, high density similarity, and high hotspot overlap.

The backend benchmark measures live MySQL query latency for the map/anonymization endpoint. This complements the CSV algorithm benchmark because the deployed application must first retrieve records from the database before anonymizing them. The benchmark records query limits from 500 to 5,000 rows, repeated three times, and stores the MySQL `EXPLAIN` plan to document index usage.

## Main Results

Across all anonymization benchmark configurations, the released groups have zero k-violations. This is the central privacy-validity result: the implementation no longer merely visualizes anonymization, but enforces the selected k value in the released output.

Spatial-only anonymization preserves high utility on the 25,000-row sample. For k=20, runtime is 26.35 ms, no records are suppressed, mean spatial error is 0.34 km, density similarity is 99.9%, and top-10 hotspot overlap is 100.0%. This indicates that when the attacker model is limited to spatial knowledge, the dataset is dense enough to provide k-anonymity with minimal utility loss.

Adding temporal constraints increases privacy protection but reduces utility. With broad period-level temporal grouping at k=20, runtime is 134.77 ms, suppression remains low at 9 records, mean spatial error increases to 1.11 km, density similarity remains 92.0%, and top-10 hotspot overlap is 90.0%. This provides a strong middle ground for the demonstrator: it captures temporal risk while preserving most aggregate spatial patterns.

Hour-level grouping is substantially stricter. At k=20 on 25,000 rows, runtime is 170.97 ms, 718 records are suppressed, mean spatial error rises to 2.42 km, density similarity drops to 69.0%, and top-10 hotspot overlap drops to 40.0%. This is an important result rather than a failure: it shows that stronger attacker knowledge forces visible utility loss, which is exactly the privacy-utility tradeoff the tool is designed to explain.

The live backend benchmark shows that the MySQL query layer is now measurable and index-aware. The database uses `idx_trips_source_member_date_bounds`, which matches the common filter order of data source, member type, date range, and map bounds. With this index, average query latency ranges from 116.36 ms for 500 rows to 168.56 ms for 5,000 rows in the local Laragon setup. The application now reports database query time separately from anonymization time, allowing demos and future experiments to distinguish algorithmic cost from storage/query cost.

## Baseline Comparison

To make the evaluation comparative, the merge-nearest anonymization method is compared with a suppression-only baseline. The baseline groups trips into the same spatial-temporal grid but releases only cells that already contain at least k records; all sparse cells are suppressed. This baseline is intentionally simple and useful as a lower-bound comparison because it satisfies k-anonymity without attempting to recover utility from sparse regions.

On the 25,000-row sample, the merge-nearest method releases substantially more data under temporal privacy constraints. For period-level grouping at k=20, merge-nearest suppresses only 9 records, while the suppression baseline suppresses 19,732 records. For hour-level grouping at k=10, merge-nearest suppresses 295 records, while the baseline suppresses 24,337 records. In the strictest hour-level k=20 condition, the suppression baseline cannot release any valid group and suppresses all 24,994 valid records, whereas merge-nearest releases 24,276 records with zero k-violations.

This comparison clarifies the contribution of the merge step. The baseline can be faster and can show lower spatial error because it discards difficult sparse cases instead of generalizing them. However, this comes at a severe utility cost: most temporally sparse records disappear. Merge-nearest accepts higher spatial distortion in exchange for much higher data retention, which is better aligned with the demonstrator's goal of explaining privacy-utility tradeoffs rather than simply hiding difficult records.

## Paper Claims Supported by the Results

The updated system supports five defensible claims:

1. The demonstrator enforces k-anonymity with zero released k-violations across tested spatial and spatial-temporal configurations.
2. Spatial-only anonymization preserves aggregate mobility patterns with very low distortion on dense urban bike-share data.
3. Temporal attacker knowledge creates a measurable privacy-utility tradeoff, especially at hour-level granularity and higher k values.
4. The deployed backend is instrumented for scalability analysis, with indexed MySQL queries and separate reporting of database and anonymization latency.
5. Compared with a suppression-only baseline, merge-nearest k-anonymity preserves far more records under spatial-temporal privacy settings while maintaining zero k-violations.

## Remaining Limitations

The evaluation is still limited to sampled January 2024 Citi Bike data. This is suitable for a focused demonstrator paper, but a stronger empirical paper should evaluate multiple months or a full year. The implementation also evaluates single-trip spatial-temporal anonymity rather than longitudinal trajectory privacy. Finally, the current user evaluation should be framed as formative feedback unless a larger controlled study is added.

These limitations are manageable for a SKILL 2026 submission if presented honestly. The paper should position the work as an explainable privacy demonstrator and empirical teaching/research tool, not as a complete production anonymization framework.

## Recommended Text for the Paper

The following paragraph can be adapted directly into the evaluation section:

> The results show that the demonstrator enforces the selected k value across all evaluated configurations, with no released groups violating k-anonymity. On the largest 25,000-row sample, spatial-only anonymization preserved aggregate utility even for k=20, achieving 99.9% density similarity and 100.0% top-10 hotspot overlap with 0 suppressed records. Introducing temporal attacker knowledge produced the expected privacy-utility tradeoff: broad period-level grouping retained high utility, while hour-level grouping at k=20 required 718 suppressed records and reduced hotspot overlap to 40.0%. These results support the demonstrator's role as an explainable privacy tool: users can observe how stronger privacy assumptions increase spatial distortion and suppression while preserving formal k-anonymity in the released output.

The following paragraph can be adapted into the system/performance section:

> To separate algorithmic runtime from deployment overhead, the backend was instrumented to report database query latency and anonymization latency independently. Additional MySQL indexes were added for the live map query pattern, and the query benchmark records both latency and the optimizer's `EXPLAIN` plan. In the local Laragon/MySQL setup, average indexed query latency ranged from 116.36 ms for 500 rows to 168.56 ms for 5,000 rows, while the anonymization benchmark remained below 171 ms for all 25,000-row configurations. This instrumentation makes the demonstrator reproducible and provides a basis for future scalability experiments on larger datasets.

The following paragraph can be adapted into the comparative evaluation section:

> Compared with a suppression-only baseline, the merge-nearest anonymization strategy preserves substantially more data under spatial-temporal privacy constraints. The baseline releases only grid cells that already satisfy k and therefore suppresses sparse cells. On the 25,000-row sample with period-level grouping and k=20, the baseline suppresses 19,732 records, while merge-nearest suppresses only 9 records. Under hour-level grouping with k=20, the baseline cannot release any records, whereas merge-nearest releases 24,276 records while maintaining zero k-violations. This demonstrates that the merge step is essential for retaining analytical utility in sparse temporal settings, although it introduces greater spatial distortion.
