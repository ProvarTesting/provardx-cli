# summary
Show the current Provar API key configuration status.

# description
Reports where the active API key comes from (environment variable or stored file),
shows the key prefix and when it was set, and states whether validation will use the
Quality Hub API or local rules only. The full key is never printed.

# examples
- Check auth status:
  <%= config.bin %> <%= command.id %>
