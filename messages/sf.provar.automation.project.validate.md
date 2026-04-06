# summary

Validate a Provar project from its directory on disk and report quality scores.

# description

Reads the plan/suite/testinstance hierarchy from the plans/ directory, resolves test
case XML from the tests/ directory, and runs the full validation rule set. Reports a
quality score, violation summary, and per-plan/suite breakdown. Saves a QH-compatible
JSON report to {project_path}/provardx/validation/ by default.

# flags.project-path.summary

Path to the Provar project root (directory containing the .testproject file). Defaults to current directory.

# flags.quality-threshold.summary

Minimum quality score (0-100) for a test case to pass validation (default: 80).

# flags.save-results.summary

Write a QH-compatible JSON report to provardx/validation/. Use --no-save-results to skip (default: true).

# flags.results-dir.summary

Override the output directory for the saved validation report.

# examples

- Validate the Provar project in the current directory:

  <%= config.bin %> <%= command.id %>

- Validate a project at a specific path and output JSON:

  <%= config.bin %> <%= command.id %> --project-path /path/to/MyProject --json

- Validate with a custom quality threshold, saving results to a specific directory:

  <%= config.bin %> <%= command.id %> -p /path/to/MyProject -q 90 -d /reports/validation

- Validate without saving results:

  <%= config.bin %> <%= command.id %> --no-save-results

# success_message

Project "%s" validated — quality score: %s/100 (%s)

# saved_to_message

Results saved to: %s
