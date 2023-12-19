# summary

Summary of a command.

# description

Generate a boilerplate property file.

# examples

- Generates the boiler plate properties.json at the given path :

  <%= config.bin %> <%= command.id %> --properties-file 'propertiesFile path'

# flags.properties-file.summary

Provardx-properties file path.

# flags.no-prompt.summary

Don't prompt to confirm overwriting of the properties file if it already exists and overwrite it by default.

# error.INVALID_PATH

INVALID_PATH - The provided path does not exist or is invalid.

# error.INSUFFICIENT_PERMISSIONS

INSUFFICIENT_PERMISSIONS - The user does not have permissions to create the file.

# error.INVALID_FILE_EXTENSION

INVALID_FILE_EXTENSION - Only the .json file extension is supported.

# error.GENERATE_OPERATION_DENIED

GENERATE_OPERATION_DENIED - The operation was cancelled.

# PropertiesFileOverwritePromptConfirm

FILE_ALREADY_EXISTS - A file with the same name already exists in that location. Do you want to overwrite it? Y/N
