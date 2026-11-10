# Other designs: panel FE, IV, RDD, synthetic control, standard errors

## Contents
1. Panel fixed effects
2. Instrumental variables / 2SLS
3. Regression discontinuity
4. Synthetic control and synthetic DiD
5. Choosing standard errors

---

## 1. Panel fixed effects (fixest)

```r
library(fixest)
m1 <- feols(y ~ x1 + x2 | firm + year, d, cluster = ~firm)          # two-way fixed effects
m2 <- feols(y ~ x1 + x2 | firm + industry^year, d, cluster = ~firm)  # industry-by-year shocks
m3 <- feols(y ~ x1 | firm[year] + year, d, cluster = ~firm)          # firm-specific linear trends
ms <- feols(c(y1, y2) ~ x1 + csw0(x2, x3) | sw(firm, firm + year), d, cluster = ~firm)  # specification grid
etable(ms)
fepois(count ~ x1 | firm + year, d, cluster = ~firm)                 # Poisson PML for counts, or for logs with zeros
```

- **Fixed effects versus random effects:** prefer fixed effects for causal claims. If someone asks for a Hausman test, use `plm::phtest(fe_plm, re_plm)`. That needs `plm` models; fixest has no random effects.
- **Lagged dependent variable with unit fixed effects:** this causes Nickell bias in short panels. Mention the bias, and use GMM (`plm::pgmm`) only if the user really needs dynamics.
- **Singletons:** fixest drops singleton fixed-effect groups by default and reports how many. Mention it if the number is large.

## 2. Instrumental variables / 2SLS

```r
iv <- feols(y ~ x_exog | state + year | x_endog ~ z1 + z2, d, cluster = ~state)
summary(iv, stage = 1)                                     # first stage
fitstat(iv, ~ ivf1 + ivwald1 + wh + sargan)                # 1st-stage F, cluster-robust 1st-stage Wald F, Wu-Hausman, Sargan
# ("kpr", the Kleibergen-Paap statistic, returns NA with clustered SEs plus fixed effects; use ivwald1)
etable(summary(iv, stage = 1:2))                           # first stage and 2SLS side by side
```

Checklist:

- **Instrument strength:** report the cluster-robust first-stage F (`ivwald1`). F around 10 is no longer considered safe. Use Anderson-Rubin confidence intervals or the tF procedure (Lee et al. 2022) for weak-instrument-robust inference. `ivDiag::ivDiag(data, Y, D, Z, controls, FE, cl)` reports AR, tF and bootstrap CIs.
- **Reduced form:** show it with `feols(y ~ z1 | state + year, ...)`. If the reduced form is zero, the IV estimate is also zero.
- **Exclusion restriction:** argue it. It cannot be tested. Over-identification tests (Sargan or Hansen) only check consistency between instruments.
- **LATE:** interpret the estimate as the effect for compliers.

## 3. Regression discontinuity

```r
library(rdrobust); library(rddensity)
rd <- rdrobust(y = d$y, x = d$score, c = 0)                  # MSE-optimal bandwidth, robust bias-corrected inference
summary(rd)                                                   # report the "Robust" row: CI and p-value
rdplot(d$y, d$score, c = 0, title = "RD plot")
summary(rddensity(X = d$score, c = 0))                        # manipulation (density) test
summary(rdrobust(d$x_pre, d$score, c = 0))                    # covariate balance: repeat for each pre-determined covariate
rdrobust(d$y, d$score, c = 0, fuzzy = d$treated)              # fuzzy RD
rdrobust(d$y, d$score, c = 0, cluster = d$cluster_id, vce = "hc1")  # clustered SEs
```

Robustness:

- Use half and double the optimal bandwidth (`h = c(...)`).
- Use a local quadratic (`p = 2`).
- Run donut-hole RD by excluding observations closest to the cutoff.
- Test placebo cutoffs.

Don't use high-order global polynomials.

## 4. Synthetic control and synthetic DiD (one or few treated units)

```r
library(tidysynth)      # classic Abadie synthetic control
sc <- d |>
  synthetic_control(outcome = y, unit = state, time = year, i_unit = "CA", i_time = 1989,
                    generate_placebos = TRUE) |>
  generate_predictor(time_window = 1980:1988, y_mean = mean(y, na.rm = TRUE)) |>
  generate_weights(optimization_window = 1980:1988) |>
  generate_control()
plot_trends(sc); plot_placebos(sc); grab_unit_weights(sc); grab_significance(sc)
```

`synthdid` (installed from GitHub with `remotes::install_github("synth-inference/synthdid")`) combines synthetic-control unit weights with DiD time weights:

```r
library(synthdid)
setup <- panel.matrices(d, unit = "state", time = "year", outcome = "y", treatment = "treat_post")
est <- synthdid_estimate(setup$Y, setup$N0, setup$T0)
se  <- sqrt(vcov(est, method = "placebo"))
```

With a single treated unit, use placebo or permutation inference. Conventional standard errors are not valid.

## 5. Standard errors in fixest

| Situation | Syntax |
|---|---|
| Heteroskedasticity-robust only (cross-section) | `vcov = "hetero"` |
| Cluster at the treatment-assignment level (the default choice) | `cluster = ~state` |
| Two-way clustering | `cluster = ~state + year` |
| Serial correlation in a long panel (Newey-West) | `vcov = "NW"` with `panel.id = ~state + year` |
| Cross-sectional dependence (Driscoll-Kraay) | `vcov = "DK"` with `panel.id = ~state + year` |
| Spatial correlation (Conley) | `vcov = vcov_conley(lat = ~lat, lon = ~lon, cutoff = 100)` (km) |
| Few clusters | Wild cluster bootstrap (`did.md` §8) |

You can change standard errors after estimation: `summary(m, cluster = ~state)` or `etable(m, vcov = "twoway")`.
Always state the standard-error type and the number of clusters in the table notes.
