# summary

Rotate your stored Provar Quality Hub API key.

# description

Exchanges your current pv*k* key for a new one in a single atomic operation.
The old key is invalidated the moment the new key is issued — there is no window
where both are valid.

The new key is written to ~/.provar/credentials.json automatically.

Use this command to rotate your key on a regular schedule (every ~90 days) without
going through the browser login flow again.

If the current key is already expired or revoked, rotation is not possible — run
sf provar auth login instead to authenticate via browser and get a fresh key.

# examples

- Rotate the stored API key:

  <%= config.bin %> <%= command.id %>
