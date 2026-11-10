# Difference-in-differences recipes (R, fixest-first)

Throughout, `d` is a long data frame with these columns:

- `y`: the outcome.
- `state`: the unit.
- `year`: time.
- `treat_post`: the 0/1 indicator `D_it`, equal to 1 when the unit is treated in that year.
- `first_treat`: the first treated year, 0 for never-treated units.

Rename to match the user's data.

```r
library(fixest)
# Build first_treat from a 0/1 treat_post (absorbing treatment):
d$first_treat <- ave(ifelse(d$treat_post == 1, d$year, NA), d$state,
                     FUN = function(v) if (all(is.na(v))) 0 else min(v, na.rm = TRUE))
d$ever_treated <- as.integer(d$first_treat > 0)
```

## Contents
1. Classic 2x2 and block TWFE
2. Event study (TWFE)
3. Staggered adoption: Sun-Abraham
4. Staggered adoption: Callaway-Sant'Anna
5. Diagnosing TWFE: Goodman-Bacon decomposition, did2s, imputation
6. Sensitivity to parallel-trends violations: HonestDiD
7. Triple differences, covariates, weights, continuous or switching treatment
8. Few clusters: wild cluster bootstrap
9. Tables and figures

---

## 1. Classic 2x2 and block TWFE

```r
# Raw means: always show these for a 2x2
aggregate(y ~ ever_treated + post, data = d, FUN = mean)

# 2x2 regression; the interaction is the DiD estimate
m22 <- feols(y ~ ever_treated * post, d, cluster = ~state)

# TWFE with state and year fixed effects (identical to the 2x2 in a balanced 2x2 setup)
m_twfe <- feols(y ~ treat_post | state + year, d, cluster = ~state)

# With time-varying controls (they must not be outcomes of the treatment) and weights
m_twfe_x <- feols(y ~ treat_post + x1 + x2 | state + year, d, cluster = ~state, weights = ~pop)
etable(m22, m_twfe, m_twfe_x)
```

Interpretation: the coefficient on `treat_post` is the ATT, valid only under parallel trends and homogeneous effects when timing is staggered.

## 2. Event study (TWFE)

```r
lo <- -5; hi <- 5
d$rel <- ifelse(d$first_treat > 0, pmin(pmax(d$year - d$first_treat, lo), hi), -1000)   # bin endpoints
es <- feols(y ~ i(rel, ref = c(-1, -1000)) | state + year, d, cluster = ~state)
iplot(es, ref.line = -0.5, xlab = "Years relative to treatment", main = "Event study")
wald(es, keep = "::-[0-9]")            # joint test that all leads are 0
```

Rules:

- Never-treated units are coded `rel = -1000` and used as a reference. Without never-treated units, also drop a second period, such as `ref = c(-1, lo)`; otherwise the leads are not identified.
- Bin the endpoints, or restrict the sample to a balanced event window. Leaving the endpoints unbinned imposes zero effects outside the window.
- Under staggered timing with heterogeneous effects, TWFE leads and lags are contaminated by other periods' effects (Sun & Abraham 2021). Use §3 or §4 for the event study you report.

## 3. Sun-Abraham (interaction-weighted) estimator

```r
d$g_sa <- ifelse(d$first_treat > 0, d$first_treat, 10000)    # never treated: a cohort outside the sample
sa <- feols(y ~ sunab(g_sa, year) | state + year, d, cluster = ~state)
iplot(list(es, sa), ref.line = -0.5)    # compare with TWFE
summary(sa, agg = "ATT")               # overall ATT (average of post-period effects, cohort-share weighted)
aggregate(sa, agg = "ATT")             # same, as a matrix
summary(sa, agg = "cohort")            # ATT by cohort
```

If there are no never-treated units, make the last-treated cohort the control. Drop the periods in which that cohort is treated, and set its `g_sa` to 10000.

## 4. Callaway & Sant'Anna (2021)

```r
library(did)
d$id <- as.integer(factor(d$state))           # idname must be numeric
cs <- att_gt(yname = "y", tname = "year", idname = "id", gname = "first_treat",  # gname: 0 = never treated
             data = d,
             control_group = "nevertreated",  # or "notyettreated" (required if there are no never-treated units)
             xformla = ~ x_pre,               # pre-treatment covariates (doubly robust by default); NULL if none
             est_method = "dr",
             base_period = "universal",       # pre-period coefficients comparable to a ref = -1 event study
             anticipation = 0,                # set >0 if units react before the official date
             clustervars = "id")              # clustering at the unit level; see below for coarser levels
summary(cs)

aggte(cs, type = "simple")                                   # overall ATT
es_cs <- aggte(cs, type = "dynamic", min_e = -5, max_e = 5)   # event study
ggdid(es_cs)
aggte(cs, type = "group")       # by cohort
aggte(cs, type = "calendar")    # by calendar time
```

Notes:

- **Clustering at a coarser level** (for example, units are counties and treatment is by state): use `clustervars = c("id", "state_id")`. The second variable must be numeric and constant within unit.
- **Unbalanced panels:** set `allow_unbalanced_panel = TRUE`.
- **Repeated cross-sections or micro data:** leave out `idname`, set `panel = FALSE`, and cluster on a numeric state id:
  ```r
  att_gt(yname = "y", tname = "year", gname = "first_treat", data = micro, panel = FALSE, clustervars = "state_id")
  ```
- **Wald pre-test:** `did` skips it when you cluster above the unit level. Judge pre-trends from the bootstrap bands of `aggte(type = "dynamic")` instead.
- `did` drops units that are already treated in the first period. Report how many were dropped.

## 5. Diagnosing TWFE

**Goodman-Bacon decomposition.** It needs a balanced panel and a binary absorbing treatment.

```r
library(bacondecomp)
# pass only the needed columns: bacon() merges in its own `treated` column, which clashes with a user column of that name
b <- bacon(y ~ treat_post, data = d[, c("y", "treat_post", "id", "year")], id_var = "id", time_var = "year")
# prints the weight and average 2x2 estimate by comparison type; sum(b$estimate * b$weight) equals the TWFE coefficient
```

Report the weight on "Later vs Earlier Treated" comparisons, which are the problematic ones because already-treated units serve as controls.

**Gardner (2021) two-stage DiD and Borusyak-Jaravel-Spiess imputation.** Both are robust to heterogeneous effects.

```r
library(did2s)
d$rel_es <- ifelse(d$first_treat > 0, d$year - d$first_treat, -1000)
es_2s <- did2s(d, yname = "y", first_stage = ~ 0 | state + year,
               second_stage = ~ i(rel_es, ref = c(-1, -1000)), treatment = "treat_post",
               cluster_var = "state")

library(didimputation)
es_bjs <- did_imputation(data = d, yname = "y", gname = "first_treat", tname = "year", idname = "id",
                         horizon = TRUE, pretrends = -5:-1, cluster_var = "state")
```

## 6. HonestDiD (Rambachan & Roth 2023)

This asks how large a violation of parallel trends would have to be to overturn the result.

```r
library(HonestDiD)
# es: an event study with ref = -1 and NO binning (or a balanced window); keep coefficients in time order
b  <- coef(es); V <- vcov(es)
rel_t <- as.numeric(sub(".*::", "", names(b)))
keep  <- rel_t != -1000
b <- b[keep]; V <- V[keep, keep]; rel_t <- rel_t[keep]
npre <- sum(rel_t < 0); npost <- sum(rel_t >= 0)

original <- constructOriginalCS(betahat = b, sigma = V, numPrePeriods = npre, numPostPeriods = npost)
# Relative-magnitudes bound: post-period violations at most Mbar times the largest pre-period violation
rm <- createSensitivityResults_relativeMagnitudes(betahat = b, sigma = V,
        numPrePeriods = npre, numPostPeriods = npost, Mbarvec = seq(0.5, 2, by = 0.5))
createSensitivityPlot_relativeMagnitudes(rm, original)
# Smoothness bound (the slope of the differential trend can change by at most M per period)
sd <- createSensitivityResults(betahat = b, sigma = V, numPrePeriods = npre, numPostPeriods = npost,
        Mvec = seq(0, 0.05, by = 0.01))
createSensitivityPlot(sd, original)
# The target defaults to the first post period. For the average post effect:
#   l_vec = rep(1 / npost, npost)
```

Report the "breakdown" value: the largest `Mbar` (or `M`) at which the robust confidence interval still excludes 0.

## 7. Variants

**Triple differences.** Here `treat_post` varies by state and year, and `target` marks the affected group within a state.
The data must have one row per state, year and group (or be micro data).

```r
ddd <- feols(y ~ treat_post:target | state^year + state^target + year^target, d, cluster = ~state)
```

**Covariates.**

- TWFE: include only covariates that the treatment does not affect. Time-invariant covariates are absorbed by the unit fixed effects; interact them with year (`| state + year + region^year`) to allow region-specific shocks.
- CS: pass pre-treatment covariates in `xformla`.

**Weights:** `weights = ~pop` in fixest and `weightsname = "pop"` in `did`. Say whether the estimand is population-weighted.

**Treatment that switches on and off, or is non-binary:**

```r
library(DIDmultiplegtDYN)
did_multiplegt_dyn(df = d, outcome = "y", group = "state", time = "year", treatment = "D",
                   effects = 5, placebo = 3)
```

**Continuous dose:** TWFE on a continuous treatment needs strong assumptions (Callaway, Goodman-Bacon & Sant'Anna 2024). Prefer binarising the treatment with a justified threshold, or use a dose-response estimator, and state the assumption.

**Unit-specific linear trends:** `| state[year] + year` in fixest. Use them only as a sensitivity check, because they absorb part of any dynamic effect.

## 8. Few clusters: wild cluster bootstrap

```r
# install.packages("fwildclusterboot")   # if it isn't on CRAN, use
# install.packages("fwildclusterboot", repos = c("https://s3alfisc.r-universe.dev", "https://cloud.r-project.org"))
library(fwildclusterboot)
set.seed(1)
bt <- boottest(m_twfe, param = "treat_post", clustid = ~state, B = 9999,
               type = "webb")   # Webb weights when there are fewer than ~12 clusters; "rademacher" otherwise
summary(bt)                      # bootstrap p-value and confidence interval
```

With very few treated clusters (5 or fewer), even the wild bootstrap over-rejects. Say so, and consider randomization inference, for example a permutation test that reassigns treatment across states.

## 9. Tables and figures

```r
dict <- c(treat_post = "Treated x Post", y = "Outcome", state = "State", year = "Year")
etable(list(TWFE = m_twfe, `TWFE + X` = m_twfe_x, `Sun-Abraham` = summary(sa, agg = "ATT")), dict = dict)
etable(list(TWFE = m_twfe, `TWFE + X` = m_twfe_x), dict = dict, tex = TRUE, file = "did_table.tex", replace = TRUE)

library(modelsummary)
modelsummary(list("TWFE" = m_twfe, "TWFE + X" = m_twfe_x),
             coef_map = c(treat_post = "Treated x Post"), gof_map = c("nobs", "r.squared"),
             stars = TRUE, output = "did_table.docx")      # also .html, .tex, .md
```

For the figure, plot the robust event study (CS or SA) and the TWFE event study together. Mark the reference period, show 95% confidence intervals, and put the number of clusters in the note.
