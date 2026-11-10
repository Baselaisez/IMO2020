#!/usr/bin/env Rscript
# did_analysis.R: an end-to-end difference-in-differences pipeline with unit and time fixed effects.
#
# Usage:
#   Rscript did_analysis.R --data panel.csv --y outcome --unit state --time year --treat treated
#   Rscript did_analysis.R --data panel.csv --y outcome --unit state --time year --cohort first_treat
#   Rscript did_analysis.R --demo        # simulated staggered panel with a known true ATT
#
# Options:
#   --data      .csv / .tsv / .rds / .dta / .parquet / .xlsx
#   --y         outcome column
#   --unit      panel unit id, e.g. state
#   --time      numeric time column, e.g. year
#   --treat     0/1 column, equal to 1 when the unit is treated in that period (D_it)   } give exactly
#   --cohort    first treated period per unit; 0, NA or Inf means never treated         } one of these
#   --cluster   cluster variable (default: --unit)
#   --controls  comma-separated controls (they must not be affected by treatment)
#   --weights   weight column
#   --window    event window to estimate and display, e.g. -6,6 (endpoints binned; default -5,5)
#   --out       output directory (default: did_output)
#
# Requires fixest. Optional: did (Callaway-Sant'Anna), bacondecomp, ggplot2, data.table,
# haven (.dta), arrow (.parquet), readxl (.xlsx). Steps that need a missing package are skipped and noted.

# ---------------------------------------------------------------- helpers ----
parse_args <- function(args) {
  out <- list(); i <- 1
  while (i <= length(args)) {
    key <- sub("^--", "", args[i])
    if (i == length(args) || startsWith(args[i + 1], "--")) {
      out[[key]] <- TRUE; i <- i + 1
    } else {
      out[[key]] <- args[i + 1]; i <- i + 2
    }
  }
  out
}
has  <- function(p) requireNamespace(p, quietly = TRUE)
fmt  <- function(x, d = 3) formatC(x, digits = d, format = "f")
note <- character(0)
add_note <- function(...) { msg <- paste0(...); note <<- c(note, msg); message("NOTE: ", msg) }

read_any <- function(path) {
  ext <- tolower(tools::file_ext(path))
  d <- switch(ext,
    csv     = if (has("data.table")) data.table::fread(path, data.table = FALSE) else read.csv(path),
    tsv     = if (has("data.table")) data.table::fread(path, data.table = FALSE) else read.delim(path),
    txt     = if (has("data.table")) data.table::fread(path, data.table = FALSE) else read.delim(path),
    rds     = readRDS(path),
    dta     = { if (!has("haven")) stop("Install 'haven' to read .dta files"); haven::zap_labels(haven::read_dta(path)) },
    parquet = { if (!has("arrow")) stop("Install 'arrow' to read .parquet files"); arrow::read_parquet(path) },
    xlsx    = { if (!has("readxl")) stop("Install 'readxl' to read .xlsx files"); readxl::read_excel(path) },
    stop("Unsupported file type: .", ext))
  as.data.frame(d)
}

simulate_panel <- function(seed = 20240101) {
  set.seed(seed)
  states <- sprintf("S%02d", 1:40); years <- 2000:2019
  g <- setNames(sample(c(2006, 2010, 2014, 0), length(states), TRUE, c(.25, .25, .2, .3)), states)
  d <- expand.grid(state = states, year = years, stringsAsFactors = FALSE)
  d$first_treat <- unname(g[d$state])
  d$treated <- as.integer(d$first_treat > 0 & d$year >= d$first_treat)
  et <- d$year - d$first_treat
  te <- ifelse(d$treated == 1, 1 + 0.25 * pmin(et, 6), 0)    # dynamic, heterogeneous effect
  d$x1 <- rnorm(nrow(d))
  d$outcome <- rnorm(length(states), 0, 2)[match(d$state, states)] +
               (0.3 * (years - 2000))[match(d$year, years)] + 0.5 * d$x1 + te + rnorm(nrow(d))
  attr(d, "true_att") <- mean(te[d$treated == 1])
  d
}

# ------------------------------------------------------------------ setup ----
opt <- parse_args(commandArgs(trailingOnly = TRUE))
if (!has("fixest")) stop("Package 'fixest' is required: install.packages('fixest')")
suppressPackageStartupMessages(library(fixest))

true_att <- NA
if (isTRUE(opt$demo)) {
  dat <- simulate_panel(); true_att <- attr(dat, "true_att")
  opt <- modifyList(list(y = "outcome", unit = "state", time = "year", cohort = "first_treat",
                         controls = "x1", out = "did_output_demo"), opt[setdiff(names(opt), "demo")])
} else {
  for (k in c("data", "y", "unit", "time"))
    if (is.null(opt[[k]])) stop("Missing --", k, ". Run with --demo for an example.")
  dat <- read_any(opt$data)
}
if (is.null(opt$treat) == is.null(opt$cohort)) stop("Give exactly one of --treat or --cohort")

out_dir  <- if (is.null(opt$out)) "did_output" else opt$out
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
clus     <- if (is.null(opt$cluster)) opt$unit else opt$cluster
controls <- if (is.null(opt$controls)) character(0) else trimws(strsplit(opt$controls, ",")[[1]])
win      <- if (is.null(opt$window)) c(-5, 5) else as.numeric(strsplit(opt$window, ",")[[1]])
lo <- win[1]; hi <- win[2]
if (lo > -2 || hi < 0) stop("--window must satisfy lower <= -2 and upper >= 0")

needed <- c(opt$y, opt$unit, opt$time, clus, controls, opt$treat, opt$cohort, opt$weights)
miss <- setdiff(needed, names(dat))
if (length(miss)) stop("Columns not found: ", paste(miss, collapse = ", "))

# ------------------------------------------------ standardise the columns ----
d <- data.frame(did_y = as.numeric(dat[[opt$y]]), did_unit = as.character(dat[[opt$unit]]),
                did_time = suppressWarnings(as.numeric(as.character(dat[[opt$time]]))),
                did_cl = as.character(dat[[clus]]), stringsAsFactors = FALSE)
for (v in controls) d[[v]] <- dat[[v]]
if (!is.null(opt$weights)) d$did_w <- as.numeric(dat[[opt$weights]])
src <- if (!is.null(opt$treat)) dat[[opt$treat]] else dat[[opt$cohort]]
d$did_src <- suppressWarnings(as.numeric(src))

n0 <- nrow(d)
keep <- !is.na(d$did_y) & !is.na(d$did_unit) & !is.na(d$did_time) & !is.na(d$did_cl)
if (!is.null(opt$treat)) keep <- keep & !is.na(d$did_src)
if (!is.null(opt$weights)) keep <- keep & !is.na(d$did_w)
d <- d[keep, ]
if (nrow(d) < n0) add_note(n0 - nrow(d), " rows dropped for missing outcome/unit/time/cluster/treatment/weights.")
if (all(is.na(d$did_time))) stop("--time must be numeric (e.g. year)")

# Treatment timing -> cohort g (0 = never treated) and D_it
if (!is.null(opt$treat)) {
  if (!all(d$did_src %in% c(0, 1))) stop("--treat must be a 0/1 indicator")
  first <- tapply(ifelse(d$did_src == 1, d$did_time, NA), d$did_unit,
                  function(v) if (all(is.na(v))) 0 else min(v, na.rm = TRUE))
  d$did_g <- as.numeric(first[d$did_unit])
  d$did_D <- d$did_src
  rev_n <- sum(d$did_D == 0 & d$did_g > 0 & d$did_time >= d$did_g)
  if (rev_n > 0) add_note("Treatment switches off in ", rev_n, " post-adoption unit-periods. ",
                          "The staggered estimators below assume absorbing treatment and treat these as treated. ",
                          "Consider DIDmultiplegtDYN::did_multiplegt_dyn.")
  d$did_D <- as.integer(d$did_g > 0 & d$did_time >= d$did_g)   # absorbing version used throughout
} else {
  g <- d$did_src; g[is.na(g) | is.infinite(g)] <- 0
  d$did_g <- g
  if (any(tapply(d$did_g, d$did_unit, function(v) length(unique(v))) > 1))
    stop("--cohort must be constant within unit")
  d$did_D <- as.integer(d$did_g > 0 & d$did_time >= d$did_g)
}

# ------------------------------------------------------------- data audit ----
is_panel  <- !anyDuplicated(d[, c("did_unit", "did_time")])
units     <- unique(d$did_unit); periods <- sort(unique(d$did_time))
balanced  <- is_panel && nrow(d) == length(units) * length(periods)
ug        <- d[!duplicated(d$did_unit), c("did_unit", "did_g")]
has_never <- any(ug$did_g == 0)
always    <- ug$did_unit[ug$did_g > 0 & ug$did_g <= min(periods)]
late      <- ug$did_unit[ug$did_g > max(periods)]
cohorts   <- sort(unique(ug$did_g[ug$did_g > 0 & ug$did_g <= max(periods)]))
staggered <- length(cohorts) > 1
n_cl      <- length(unique(d$did_cl))
n_cl_tr   <- length(unique(d$did_cl[d$did_g > 0]))

if (!is_panel) add_note("(unit, time) is not unique: treating the data as micro / repeated cross-section. ",
                        "Callaway-Sant'Anna uses panel = FALSE; the Bacon decomposition is skipped.")
if (length(always)) add_note(length(always), " unit(s) are treated from the first observed period (no pre-period): ",
                             paste(head(always, 10), collapse = ", "), ". Consider dropping them.")
if (length(late)) {
  add_note(length(late), " unit(s) are first treated after the sample ends; they are coded as never treated.")
  d$did_g[d$did_unit %in% late] <- 0; d$did_D[d$did_unit %in% late] <- 0
  ug$did_g[ug$did_unit %in% late] <- 0; has_never <- TRUE
}
if (!has_never) add_note("No never-treated units: comparisons rely on not-yet-treated (CS) or last-treated (SA) units.")
if (n_cl < 30) add_note("Only ", n_cl, " clusters (", n_cl_tr, " treated). Cluster-robust SEs may be unreliable; ",
                        "add a wild cluster bootstrap (fwildclusterboot::boottest), see references/did.md section 8.")
if (sum(ug$did_g > 0) == 0) stop("No treated units found")

cohort_tab <- table(factor(ug$did_g, levels = c(cohorts, 0)))
names(cohort_tab)[names(cohort_tab) == "0"] <- "never"

# --------------------------------------------------------------- formulas ----
bt  <- function(x) paste0("`", x, "`")
ctl <- if (length(controls)) paste("+", paste(bt(controls), collapse = " + ")) else ""
fe  <- "| did_unit + did_time"
cl_f <- ~did_cl
w_f  <- if (!is.null(opt$weights)) ~did_w else NULL
results <- data.frame()
add_res <- function(name, est, se, n, ci = NULL) {
  est <- unname(as.numeric(est)); se <- unname(as.numeric(se))
  ci <- if (is.null(ci)) est + c(-1, 1) * qnorm(.975) * se else unname(as.numeric(unlist(ci)))
  results <<- rbind(results, data.frame(estimator = name, estimate = est, se = se,
                                        ci_low = ci[1], ci_high = ci[2], n = n))
}

# --------------------------------------------------------- 1. static TWFE ----
m_twfe <- feols(as.formula(paste("did_y ~ did_D", fe)), d, cluster = cl_f, weights = w_f)
ct <- coeftable(m_twfe)["did_D", ]
add_res("TWFE (unit + time FE)", ct[1], ct[2], nobs(m_twfe), confint(m_twfe)["did_D", ])
models <- list("TWFE" = m_twfe)
if (length(controls)) {
  m_twfe_x <- feols(as.formula(paste("did_y ~ did_D", ctl, fe)), d, cluster = cl_f, weights = w_f)
  ct <- coeftable(m_twfe_x)["did_D", ]
  add_res("TWFE + controls", ct[1], ct[2], nobs(m_twfe_x), confint(m_twfe_x)["did_D", ])
  models[["TWFE + controls"]] <- m_twfe_x
}

# --------------------------------------------------- 2. TWFE event study ----
# Never-treated units get rel = -1000 (a reference category); endpoints are binned.
d$did_rel <- ifelse(d$did_g > 0, pmin(pmax(d$did_time - d$did_g, lo), hi), -1000)
refs <- if (has_never) c(-1, -1000) else c(-1, lo)
if (!has_never) add_note("Event study: with no never-treated units, both -1 and the lowest bin (", lo, ") are references.")
es_f <- as.formula(paste0("did_y ~ i(did_rel, ref = c(", paste(refs, collapse = ", "), "))", ctl, " ", fe))
m_es <- feols(es_f, d, cluster = cl_f, weights = w_f)
models[["Event study (TWFE)"]] <- m_es

coef_frame <- function(m, label) {
  ctab <- coeftable(m); ci <- confint(m)
  rn <- rownames(ctab)
  k <- grepl("::", rn)
  data.frame(estimator = label, rel_time = as.numeric(sub(".*::", "", rn[k])),
             estimate = ctab[k, 1], se = ctab[k, 2], ci_low = ci[k, 1], ci_high = ci[k, 2])
}
es_tab <- coef_frame(m_es, "TWFE event study")
es_tab <- rbind(es_tab, data.frame(estimator = "TWFE event study", rel_time = -1, estimate = 0, se = 0, ci_low = 0, ci_high = 0))

pre_test <- tryCatch({
  w <- wald(m_es, keep = "::-[0-9]", print = FALSE)
  sprintf("F(%d, %d) = %s, p = %s", w$df1, w$df2, fmt(w$stat), fmt(w$p, 4))
}, error = function(e) paste("not available:", conditionMessage(e)))

# ------------------------------------------------------- 3. Sun-Abraham ----
sa_line <- NULL
m_sa <- tryCatch({
  d_sa <- d
  if (has_never) {
    d_sa$did_g_sa <- ifelse(d_sa$did_g > 0, d_sa$did_g, 10000)
  } else {                                    # last-treated cohort as control, drop its post periods
    last <- max(cohorts)
    d_sa <- d_sa[d_sa$did_time < last, ]
    d_sa$did_g_sa <- ifelse(d_sa$did_g == last, 10000, d_sa$did_g)
    add_note("Sun-Abraham: no never-treated units, so cohort ", last, " is the control and periods >= ", last, " are dropped.")
  }
  feols(as.formula(paste0("did_y ~ sunab(did_g_sa, did_time)", ctl, " ", fe)),
        d_sa, cluster = cl_f, weights = w_f)
}, error = function(e) { add_note("Sun-Abraham failed: ", conditionMessage(e)); NULL })
if (!is.null(m_sa)) {
  agg <- aggregate(m_sa, agg = "ATT")
  add_res("Sun-Abraham (2021)", agg[1, 1], agg[1, 2], nobs(m_sa),
          agg[1, 1] + c(-1, 1) * qt(.975, n_cl - 1) * agg[1, 2])   # same t(G-1) critical value as fixest
  models[["Sun-Abraham"]] <- m_sa
  sa_tab <- coef_frame(m_sa, "Sun-Abraham")
  sa_tab <- sa_tab[sa_tab$rel_time >= lo & sa_tab$rel_time <= hi, ]
  sa_tab <- rbind(sa_tab, data.frame(estimator = "Sun-Abraham", rel_time = -1, estimate = 0, se = 0, ci_low = 0, ci_high = 0))
  es_tab <- rbind(es_tab, sa_tab)
}

# ------------------------------------------------ 4. Callaway & Sant'Anna ----
cs_dyn <- NULL
if (!has("did")) {
  add_note("Package 'did' is not installed: Callaway-Sant'Anna skipped (install.packages('did')).")
} else {
  cs <- tryCatch({
    d$did_cl_id <- as.integer(factor(d$did_cl))
    if (is_panel) {
      d$did_id <- as.integer(factor(d$did_unit))
      id_var <- "did_id"
      cl_vars <- if (clus != opt$unit) c("did_id", "did_cl_id") else "did_id"
    } else {                                   # repeated cross-sections: no panel id, cluster directly
      id_var <- NULL; cl_vars <- "did_cl_id"
    }
    xf <- if (length(controls)) as.formula(paste("~", paste(bt(controls), collapse = " + "))) else NULL
    set.seed(1)
    did::att_gt(yname = "did_y", tname = "did_time", idname = id_var, gname = "did_g", data = d,
                panel = is_panel,
                control_group = if (has_never) "nevertreated" else "notyettreated",
                xformla = xf, clustervars = cl_vars,
                weightsname = if (!is.null(opt$weights)) "did_w" else NULL,
                allow_unbalanced_panel = is_panel && !balanced, base_period = "universal", print_details = FALSE)
  }, error = function(e) { add_note("Callaway-Sant'Anna failed: ", conditionMessage(e)); NULL })
  if (!is.null(cs)) {
    cs_simple <- did::aggte(cs, type = "simple", na.rm = TRUE)
    add_res(paste0("Callaway-Sant'Anna (", if (has_never) "never" else "not-yet", "-treated ctrl)"),
            cs_simple$overall.att, cs_simple$overall.se, nrow(d))
    cs_dyn <- did::aggte(cs, type = "dynamic", min_e = lo, max_e = hi, na.rm = TRUE)
    crit <- if (!is.null(cs_dyn$crit.val.egt)) cs_dyn$crit.val.egt else qnorm(.975)
    es_tab <- rbind(es_tab, data.frame(estimator = "Callaway-Sant'Anna", rel_time = cs_dyn$egt,
                                       estimate = cs_dyn$att.egt, se = cs_dyn$se.egt,
                                       ci_low = cs_dyn$att.egt - crit * cs_dyn$se.egt,
                                       ci_high = cs_dyn$att.egt + crit * cs_dyn$se.egt))
    models[["CS att_gt"]] <- cs
  }
}

# --------------------------------------------------- 5. Bacon decomposition ----
bacon_tab <- NULL
if (staggered && balanced && has("bacondecomp")) {
  bacon_tab <- tryCatch({
    d$did_id <- as.integer(factor(d$did_unit))
    b <- bacondecomp::bacon(did_y ~ did_D, data = d, id_var = "did_id", time_var = "did_time", quietly = TRUE)
    if (is.list(b) && !is.data.frame(b)) b <- b$two_by_twos
    do.call(rbind, lapply(split(b, b$type), function(s)
      data.frame(type = s$type[1], weight = sum(s$weight), avg_estimate = weighted.mean(s$estimate, s$weight))))
  }, error = function(e) { add_note("Bacon decomposition failed: ", conditionMessage(e)); NULL })
} else if (staggered && !has("bacondecomp")) {
  add_note("Package 'bacondecomp' is not installed: Bacon decomposition skipped.")
} else if (staggered && is_panel && !balanced) {
  add_note("Panel is unbalanced: Bacon decomposition skipped (it needs a balanced panel).")
}

# ----------------------------------------------------------------- outputs ----
rownames(results) <- NULL
es_tab <- es_tab[order(es_tab$estimator, es_tab$rel_time), ]
write.csv(es_tab, file.path(out_dir, "event_study.csv"), row.names = FALSE)
write.csv(results, file.path(out_dir, "estimates.csv"), row.names = FALSE)
saveRDS(models, file.path(out_dir, "models.rds"))

dict <- c(did_y = opt$y, did_D = paste0("Treated x Post"), did_unit = opt$unit, did_time = opt$time,
          did_cl = clus, did_rel = "Event time")
tw_models <- models[intersect(names(models), c("TWFE", "TWFE + controls", "Event study (TWFE)"))]
writeLines(capture.output(etable(tw_models, dict = dict)), file.path(out_dir, "twfe_table.txt"))
etable(tw_models, dict = dict, tex = TRUE, file = file.path(out_dir, "twfe_table.tex"), replace = TRUE)

png_path <- file.path(out_dir, "event_study.png")
if (has("ggplot2")) {
  library(ggplot2)
  pd <- position_dodge(width = 0.45)
  p <- ggplot(es_tab, aes(rel_time, estimate, colour = estimator)) +
    geom_hline(yintercept = 0, linewidth = .3) + geom_vline(xintercept = -0.5, linetype = 2, linewidth = .3) +
    geom_errorbar(aes(ymin = ci_low, ymax = ci_high), width = 0, position = pd) +
    geom_point(position = pd, size = 1.8) +
    scale_x_continuous(breaks = seq(lo, hi)) +
    labs(x = paste0("Periods relative to treatment (TWFE endpoints binned at ", lo, " and ", hi, ")"),
         y = paste("Effect on", opt$y), colour = NULL,
         title = "Event study",
         subtitle = "95% CIs (Callaway-Sant'Anna: simultaneous bands); reference period = -1") +
    theme_minimal(base_size = 11) + theme(legend.position = "bottom")
  ggsave(png_path, p, width = 8, height = 5, dpi = 150)
} else {
  png(png_path, width = 1200, height = 750, res = 150)
  iplot(Filter(Negate(is.null), list(m_es, m_sa)), main = "Event study")
  dev.off()
}

# ----------------------------------------------------------------- summary ----
md <- c("# DiD analysis summary", "",
  "## Data",
  sprintf("- Outcome: `%s`; unit: `%s`; time: `%s`; clustering: `%s` (%d clusters, %d ever-treated)",
          opt$y, opt$unit, opt$time, clus, n_cl, n_cl_tr),
  sprintf("- Observations: %d; units: %d; periods: %d (%s-%s); %s", nrow(d), length(units), length(periods),
          min(periods), max(periods),
          if (!is_panel) "micro / repeated cross-section" else if (balanced) "balanced panel" else "unbalanced panel"),
  sprintf("- Design: %s", if (staggered) "staggered adoption" else "single adoption date (block DiD)"),
  "- Units by first-treatment period:",
  paste0("  - ", names(cohort_tab), ": ", as.integer(cohort_tab)),
  sprintf("- Controls: %s; weights: %s", if (length(controls)) paste(controls, collapse = ", ") else "none",
          if (is.null(opt$weights)) "none" else opt$weights),
  "",
  "## Average treatment effect on the treated",
  "| Estimator | Estimate | SE | 95% CI | N |", "|---|---:|---:|---|---:|",
  sprintf("| %s | %s | %s | [%s, %s] | %d |", results$estimator, fmt(results$estimate), fmt(results$se),
          fmt(results$ci_low), fmt(results$ci_high), as.integer(results$n)),
  if (!is.na(true_att)) c("", sprintf("Demo data: true ATT = %s", fmt(true_att))),
  "",
  "## Pre-trends",
  paste0("- Joint Wald test that all TWFE event-study leads are 0: ", pre_test),
  "- Event-study coefficients: `event_study.csv`; figure: `event_study.png`",
  if (!is.null(bacon_tab)) c("", "## Goodman-Bacon decomposition of the TWFE estimate",
    "| Comparison | Weight | Avg. 2x2 estimate |", "|---|---:|---:|",
    sprintf("| %s | %s | %s |", bacon_tab$type, fmt(bacon_tab$weight), fmt(bacon_tab$avg_estimate))),
  "", "## Notes and warnings", if (length(note)) paste0("- ", note) else "- none",
  "", "## Files",
  "- `estimates.csv`, `event_study.csv`, `event_study.png`, `twfe_table.txt`, `twfe_table.tex`, `models.rds`",
  "", "## Versions",
  sprintf("- R %s; fixest %s%s", getRversion(), packageVersion("fixest"),
          if (has("did")) paste0("; did ", packageVersion("did")) else ""))
writeLines(md, file.path(out_dir, "summary.md"))
cat(md, sep = "\n")
cat("\nOutputs written to:", normalizePath(out_dir), "\n")
