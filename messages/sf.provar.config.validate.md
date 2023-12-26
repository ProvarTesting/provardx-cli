# summary

Validate the loaded provardx-properties.json against schema.

# description

Validating provardx-properties.json against the schema for all the needed properties with their expected values.

# examples

- Validate the loaded provardx-properties.json loaded under environment variables :

  <%= config.bin %> <%= command.id %>'

# success_message

The properties file was validated successfully.

# malformedJSON_message

The properties file is not a valid JSON.

# missingFile_message

The properties file has not been loaded or cannot be accessed.

# error.MULTIPLE_ERRORS

%s
