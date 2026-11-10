---
name: r-econometrics
description: Applied econometrics in R built on fixest. Covers difference-in-differences (2x2, two-way fixed effects with state/unit and year fixed effects, event studies, staggered adoption with Sun-Abraham and Callaway-Sant'Anna, Goodman-Bacon decomposition, HonestDiD sensitivity), panel fixed effects, IV/2SLS, regression discontinuity, clustered and wild-bootstrap inference, and publication-ready tables and plots. Use this skill whenever the user asks for DiD, diff-in-diff, an event study, a parallel-trends check, a policy or treatment evaluation on panel or state-year data, TWFE, fixed-effects regression, clustered standard errors, instrumental variables or RDD. Use it when they ask for R, and also when they name no language. Use it even if they never say "econometrics".
---

# R Econometrics

The goal is credible, reproducible estimates with honest inference, not just a coefficient.
Every analysis ends with three things:

1. A runnable R script.
2. The estimates that running that script actually produced.
3. A short interpretation that names the threats to identification.

## 0. Check the environment first

This skill runs in Claude Code, in claude.ai chats and in claude.ai Projects, and their sandboxes differ.

1. Run `Rscript --version`.
2. If R is present, check the packages:
   ```bash
   Rscript -e 'for (p in c("fixest","did","bacondecomp","HonestDiD","modelsummary","ggplot2","data.table","haven")) cat(sprintf("%-13s %s\n", p, requireNamespace(p, quietly = TRUE)))'
   ```
   Install any missing package with `install.packages("<pkg>", repos = "https://cloud.r-project.org")`.
   Only `fixest` is required. Everything else is optional and the bundled script skips steps that need missing packages.
3. If R is missing (common in the claude.ai sandbox), try `apt-get install -y r-base-core` once.
   If CRAN is blocked but GitHub is reachable, you can build a package from its mirror: `git clone --depth 1 https://github.com/cran/fixest && R CMD INSTALL fixest`.
   Install its dependencies the same way.
4. If R still can't run, do both of the following:
   - Write the complete R script as a file the user can download and run. Say plainly that no R results were computed.
   - Reproduce the core estimates in Python with `pyfixest`, which uses the same formula syntax (see `references/python-fallback.md`). Label those numbers as the Python cross-check.

**Never invent or "illustrate" coefficients, standard errors or p-values.** Every number you report must come from code you executed.

In a Project, look for the dataset and any codebook in the project files before asking the user.

## 1. Understand the data before modelling

Load the data and report its structure before estimating anything:

- **Variables:** outcome, unit (for example `state`), time (for example `year`), and the treatment variable. Treatment comes either as a 0/1 indicator `D_it` that is 1 when the unit is treated in that period, or as a first-treatment period per unit. Also note any covariates and weights.
- **Panel shape:** number of units and periods, whether the panel is balanced, and whether `(unit, time)` is unique.
  - If `(unit, time)` is unique, it is a unit panel.
  - If not, it is micro or repeated cross-section data with state-year treatment. That is fine for fixest, but use `panel = FALSE` for `did`.
- **Treatment timing:** list the cohorts (first-treatment period, with the number of units in each), the never-treated units, and the always-treated units. Always-treated units are treated in the first observed period and have no pre-period.
- **Treatment path:** check whether treatment ever switches off.

Ask the user only when the role of a column is genuinely ambiguous. Otherwise state your assumption and continue.

## 2. Choose the design

| Situation | Primary estimator | Also report |
|---|---|---|
| 2 groups x 2 periods | `feols(y ~ treat:post \| unit + time)` or the plain 2x2 | Raw group means table |
| One adoption date for all treated units (block design) | TWFE `feols(y ~ D \| unit + time)` | Event study with `i(rel_time, ref = -1)` |
| **Staggered adoption** (cohorts treated at different dates) | Callaway-Sant'Anna `did::att_gt` or Sun-Abraham `sunab()` | TWFE as a benchmark, Bacon decomposition, event study |
| Treatment switches on and off, or is non-binary | `DIDmultiplegtDYN::did_multiplegt_dyn` | Explain why TWFE is biased here |
| No never-treated units | Not-yet-treated controls (CS) or last-treated cohort as control (SA) | Say which comparison identifies the effect |

With staggered timing and heterogeneous effects, TWFE uses already-treated units as controls and can be badly biased, even to the wrong sign.
Always run a heterogeneity-robust estimator and compare it with TWFE.

## 3. Quick path: the bundled DiD script

`scripts/did_analysis.R` runs the full pipeline in one command:

```bash
Rscript scripts/did_analysis.R --data panel.csv --y outcome --unit state --time year --treat treated
# or, if you have the first treatment year per unit (0, NA or Inf means never treated):
Rscript scripts/did_analysis.R --data panel.csv --y outcome --unit state --time year --cohort first_treat
```

Options:

- `--cluster var` sets the cluster variable. The default is `--unit`.
- `--controls x1,x2` adds controls.
- `--weights w` sets regression weights.
- `--window -6,6` sets the event window. The endpoints are binned.
- `--out dir` sets the output directory. The default is `did_output`.
- `--demo` runs the script on a simulated staggered panel with a known true ATT.

The script prints and saves the following to the output directory:

- `summary.md`: the data audit, the design classification, a table of estimates from TWFE, Sun-Abraham and Callaway-Sant'Anna, the joint pre-trend test, warnings, and package versions. Read this file back and build your answer from it.
- `twfe_table.txt` and `twfe_table.tex`: fixest `etable` output.
- `event_study.csv` and `event_study.png`: TWFE and robust event-study coefficients with 95% confidence intervals.
- `models.rds`: the fitted model objects, for follow-up work.

Use the script as the starting point.
Adapt it, or write custom code, when the request needs something it doesn't do: triple differences, continuous treatment, synthetic control, HonestDiD, or a particular table layout.
`references/did.md` has tested recipes for each of these.

## 4. Inference rules (apply every time)

- **Cluster at the level of treatment assignment.** For state policies that means `cluster = ~state`, even when the data are individual-level. Report the number of clusters.
- **Few clusters:** with fewer than about 30 to 40 treated or total clusters, add a wild cluster bootstrap, using `fwildclusterboot::boottest` in R or `wildboottest` with pyfixest. Report bootstrap p-values and confidence intervals. With very few treated clusters (about 5 or fewer), say that inference is fragile.
- Report 95% confidence intervals alongside p-values. Don't use stars alone.
- Use a joint Wald test for pre-trends (`fixest::wald(es, keep = "::-")`). Tests on individual leads are not enough.
- Passing a pre-trend test does not prove parallel trends, because these tests have low power.
  Offer HonestDiD bounds (`references/did.md` §6) when the conclusions matter or the pre-trends look uneven.

## 5. Robustness checklist

Pick the checks that fit the design, run them, and report them briefly:

- Compare TWFE with a heterogeneity-robust estimator. The Bacon decomposition shows how much weight goes to "forbidden" comparisons.
- Plot the event study and run the joint pre-trend test.
- Try alternative control groups: never-treated versus not-yet-treated.
- Run with and without covariates. Covariates must not be affected by the treatment.
- Drop always-treated units and early or late cohorts. Use a balanced subsample.
- Run a placebo: a fake treatment date, or an outcome that should not respond.
- Try unit-specific linear trends only as a sensitivity check, never as the main specification, because they can absorb dynamic effects.
- Check for anticipation, using the `anticipation =` argument in `did`.

## 6. Reporting

Structure the answer like this:

1. **Design:** the data, the treatment definition, the cohorts, the comparison group and the identifying assumption, in one or two sentences each.
2. **Main estimate:** the effect, its standard error, the 95% confidence interval, N, the number of clusters, the fixed effects included, and the estimator.
   Interpret it in the outcome's units and relative to the pre-treatment mean of the treated group.
3. **Event-study figure,** with a one-line reading of the pre-trends and the dynamics.
4. **Robustness:** a compact table or bullets showing whether the result holds up.
5. **Caveats:** the specific threats to identification. Skip generic boilerplate.
6. **Files:** the paths to the script, tables and figures.

For publication tables, use `fixest::etable(..., tex = TRUE)` or `modelsummary::modelsummary()`.
Label the fixed effects and the clustering in the table notes.

## Reference files

- `references/did.md`: DiD recipes, all fixest-first. Covers the 2x2, TWFE, event study (binning, reference periods), Sun-Abraham, Callaway-Sant'Anna, Bacon decomposition, did2s/imputation, HonestDiD, triple differences, covariates and weights, continuous or switching treatments, and the wild bootstrap.
- `references/other-designs.md`: panel fixed effects (one-way, two-way, interacted), IV/2SLS with weak-instrument diagnostics, RDD with rdrobust and rddensity, synthetic control, and standard-error choices (HC, cluster, two-way, Conley, Driscoll-Kraay).
- `references/python-fallback.md`: pyfixest equivalents for when R is unavailable.
