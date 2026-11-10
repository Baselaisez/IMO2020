# Claude skills

## r-econometrics

`r-econometrics` is a skill for applied econometrics in R:

- **DiD with state and year fixed effects:** TWFE, event studies, staggered adoption with Sun-Abraham and Callaway-Sant'Anna, the Goodman-Bacon decomposition, and HonestDiD.
- **Panel fixed effects, IV/2SLS, RDD and synthetic control.**
- **Inference:** clustered and wild-bootstrap standard errors.
- **Output:** tables ready for publication.

When R can't run, as in some chat sandboxes, the skill falls back to the Python package `pyfixest`, which uses the same formula syntax.

```
r-econometrics/
├── SKILL.md                      # workflow: environment check, design choice, inference rules, reporting
├── scripts/did_analysis.R        # one-command DiD pipeline (TWFE, event study, Sun-Abraham, CS, Bacon)
└── references/
    ├── did.md                    # tested DiD recipes
    ├── other-designs.md          # panel FE, IV, RDD, synthetic control, standard errors
    └── python-fallback.md        # pyfixest equivalents
```

`r-econometrics.zip` is the same folder packaged for upload.

### Install globally

**claude.ai (every chat and every Project)**

1. Download [`r-econometrics.zip`](r-econometrics.zip).
2. On claude.ai, open **Settings → Capabilities**. Make sure **Code execution and file creation** is on.
3. Under **Skills**, choose **Upload skill** and select the zip. Then switch the skill on.

You upload the skill once per account. It then works in all chats and in all Projects.
Claude Code cloud sessions sync the skills enabled on your claude.ai account, so it should appear there too.

**If you already have a plugin with a skill of the same name:** turn off the plugin's `r-econometrics` before uploading this one, so the two don't compete. The plugin version is a code template. This version also runs the analysis, handles staggered adoption, and keeps never-treated units in the event study.

**Claude Code on your own computer (every project)**

Personal skills live in `~/.claude/skills/`:

```bash
unzip r-econometrics.zip -d ~/.claude/skills/
```

**Claude Code, one repository only**

Copy the folder to `.claude/skills/r-econometrics/` in that repository.

### Use it

Ask in plain language, for example "Run a DiD on `treatment_data.csv` with state and year fixed effects, clustered by state."
In Claude Code you can also type `/r-econometrics Run a DiD analysis on my treatment data with state and year fixed effects`.

To try the bundled script on simulated data with a known true effect:

```bash
Rscript r-econometrics/scripts/did_analysis.R --demo
```
