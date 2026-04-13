# summary

Log in to Provar Quality Hub and store your API key.

# description

Opens a browser to the Provar login page. After you authenticate, your API key
is stored at ~/.provar/credentials.json and used automatically by the Provar MCP
tools and CI/CD integrations.

The Cognito session tokens are held in memory only for the duration of the key
exchange and are then discarded — only the pv*k* API key is written to disk.

Run 'sf provar auth status' after login to confirm the key is configured correctly.

Don't have an account? Request access at:
https://aqqlrlhga7.execute-api.us-east-1.amazonaws.com/dev/auth/request-access

# flags.url.summary

Override the Quality Hub API base URL (for testing against a non-production environment).

# examples

- Log in interactively (opens browser):

  <%= config.bin %> <%= command.id %>

- Log in against a staging environment:

  <%= config.bin %> <%= command.id %> --url https://dev.api.example.com
