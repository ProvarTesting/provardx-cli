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

# PropertiesFileOverwritePromptConfirm

FILE_ALREADY_EXISTS - A file with the same name already exists in that location. Do you want to overwrite it? Y/N

# success_message

The properties file was generated successfully.

# error.MULTIPLE_ERRORS

%s
