# summary

Validates and loads a ProvarDX properties file for later use.

# description

Validates and loads a ProvarDX properties file for later use.

# examples

- Validates and loads a ProvarDX properties file for later use at the given path

  <%= config.bin %> <%= command.id %> --properties-file 'propertiesFile path'

# flags.properties-file.summary

Path of the properties file to be loaded.

# error.INVALID_PATH

[INVALID_PATH] The provided path does not exist or is invalid.

# error.MultipleFailure

%s

# success_message

The properties file was loaded successfully.
