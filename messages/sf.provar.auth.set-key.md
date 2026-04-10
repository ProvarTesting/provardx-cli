# summary
Store a Provar API key for Quality Hub validation.

# description
Saves a Provar API key to ~/.provar/credentials.json so the MCP server can call the
Quality Hub validation API automatically. Keys must start with "pv_k_". The full key
is never echoed — only the prefix is shown after storing.

To get a key, visit https://success.provartesting.com.

For CI/CD environments, set the PROVAR_API_KEY environment variable instead of using
this command.

# flags.key.summary
Provar API key to store. Must start with "pv_k_". The value is stored on disk; the full key is never printed back.

# examples
- Store an API key:
  <%= config.bin %> <%= command.id %> --key pv_k_yourkeyhere
