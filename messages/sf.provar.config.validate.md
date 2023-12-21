# summary

Validate the loaded provardx-properties.json against schema.

# description

Validating provardx-properties.json against the schema for all the needed properties with their expected values.

# examples

- Validate the loaded provardx-properties.json loaded under environment variables :

  <%= config.bin %> <%= command.id %>'

# error.MISSING_FILE

[MISSING_FILE] The properties file has not been loaded or cannot be accessed.

# error.MALFORMED_FILE

[MALFORMED_FILE] The properties file is not a valid JSON.

# error.MISSING_PROPERTY

[MISSING_PROPERTY] The property %s is missing.

# error.INVALID_VALUE

[INVALID_VALUE] The property %s value is not valid.

# error.MISSING_PROPERTIES

[MISSING_PROPERTIES] The properties %s are missing.

# error.INVALID_VALUES

[INVALID_VALUES] The properties %s are not valid.

# error.MULTIPLE_ERRORS

%s
