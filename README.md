"# provardx-cli" 
Prerequisite:
Node, npm , nvm, yarn, Latest sf cli.
Steps to run on local:
  git clone the Repo from the feature branch: https://github.com/ProvarTesting/provardx-cli/
  Install the dependencies on your local from package.json: npm i
  Build the project using the command: yarn prepack
  Need to copy the bin/dev folder to run the commands locally in Dev. Plugin.
  To run the command manually: bin/dev ${command} (example: bin/dev sf provar config generate)
  To run NUTS on your local: yarn run test:nuts
