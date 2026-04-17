# summary

Remove the stored Provar API key.

# description

Deletes the API key stored at ~/.provar/credentials.json. After clearing, the
provar.testcase.validate MCP tool falls back to local validation (structural rules only,
no Quality Hub quality scoring).

The PROVAR_API_KEY environment variable is not affected by this command.

# examples

- Clear the stored API key:
  <%= config.bin %> <%= command.id %>
