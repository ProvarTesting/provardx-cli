Run In dev provardx plugin on your local
# Prerequisite:
    Node, npm , nvm, yarn, Latest sf cli.
# Steps to run on local:
1. git clone the Repo from the feature branch: https://github.com/ProvarTesting/provardx-cli/
2. Install the dependencies on your local from package.json: npm i
3. Build the project using the command: yarn prepack
4. Need to copy the bin/dev folder to run the commands locally in Dev. Plugin.
5. To run the command manually: bin/dev ${command} (example: bin/dev sf provar config generate)
6. To run NUTS on your local: yarn run test:nuts

# Naming conventions used in provardx-cli development
1. camelCase for fileNames/methodNames/Variables
2. PascalCase for classNames.

Also, we are adding the Copyright/licensing text over every ts file
