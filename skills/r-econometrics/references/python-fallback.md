# Python fallback with pyfixest (for when R can't run)

`pyfixest` mirrors fixest's formula syntax. Use it to compute and verify the numbers when R isn't available, for example in the claude.ai sandbox.
Still hand the user the R script.
Label the numbers as the pyfixest cross-check.
Install with `pip install pyfixest`, and add `wildboottest` if you need the wild bootstrap.

These snippets were tested with pyfixest 0.70.

```python
import numpy as np, pandas as pd, pyfixest as pf
from scipy import stats

df = pd.read_csv("panel.csv")      # columns: outcome, state, year, treated (D_it), first_treat (0 = never)

# 1. TWFE with state and year fixed effects, clustered by state (matches R fixest exactly)
m = pf.feols("outcome ~ treated | state + year", data=df, vcov={"CRV1": "state"})
m.summary(); m.tidy()              # estimate, SE, t, p, 2.5%, 97.5%

# 2. Event study with binned endpoints; never-treated units coded -1000 (dropped as collinear automatically)
lo, hi = -5, 5
df["rel"] = np.where(df.first_treat > 0, (df.year - df.first_treat).clip(lo, hi), -1000).astype(int)
es = pf.feols("outcome ~ i(rel, ref=-1) | state + year", data=df, vcov={"CRV1": "state"})
pf.iplot(es)

# Joint pre-trend test. wald_test reports a chi2 p-value, so compute the F p-value yourself.
names = list(es.coef().index)
leads = [n for n in names if "::-" in n and "-1000" not in n]
R = np.array([[1.0 if n == l else 0.0 for n in names] for l in leads])
w = es.wald_test(R=R)
print("F =", w.f_statistic, "p =", stats.f.sf(w.f_statistic, w.df1, w.df2))

# 3. Heterogeneity-robust estimators for staggered adoption
#    Gardner (2021) two-stage DiD: overall ATT and event study
att_2s = pf.event_study(data=df.assign(g=df.first_treat), yname="outcome", idname="state",
                        tname="year", gname="g", estimator="did2s", att=True)
es_2s = pf.did2s(df, yname="outcome", first_stage="~ 0 | state + year",
                 second_stage="~ i(rel, ref=-1.0)", treatment="treated", cluster="state")
#    (the rel::-1000 row in es_2s is the never-treated bin; ignore it)
#    Local-projections DiD: pf.lpdid(...)

# 4. Wild cluster bootstrap (few clusters). The cluster variable must be numeric.
df["state_id"] = pd.factorize(df.state)[0]
m_id = pf.feols("outcome ~ treated | state + year", data=df, vcov={"CRV1": "state_id"})
m_id.wildboottest(param="treated", reps=9999, seed=1)

# 5. Tables
pf.etable([m, es])                 # also type="tex" / "md"
```

**IV:** `pf.feols("y ~ x_exog | state + year | x_endog ~ z", data=df, vcov={"CRV1": "state"})`, then `m.IV_Diag()` for first-stage F statistics.

**What to tell the user:** the Python results are a cross-check. The R script reproduces them with `fixest`, `did` and `sunab`. TWFE and event-study point estimates and clustered standard errors should match R to rounding, because both packages use the same small-sample corrections.
