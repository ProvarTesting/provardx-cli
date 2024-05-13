pipeline {
    agent {
        label 'provardx'
    }

    parameters {
        string(name: 'BRANCH_NAME', defaultValue: params.BRANCH_NAME ?: 'Jenkins', description: '''Mention the branch name''')
    }
    stages {
        stage('Git Checkout') {
            steps {
                script {
                    checkout([$class: 'GitSCM', branches: [[name: BRANCH_NAME]], extensions: [], userRemoteConfigs: [[credentialsId: 'Provar_Github_PAT_Credentials', url: 'https://github.com/ProvarTesting/Provardx-cli.git']]])
                    sh '''
                        mkdir -p ~/Provar/.licenses
                        cp -rf License1.properties ~/Provar/.licenses/
                    '''
                }
            }
        }
        stage('Build') {
            steps {
                sh '''
                      export NVM_DIR="$HOME/.nvm"
                      [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh" > /dev/null 2>&1
                      nvm use 18.19.0 > /dev/null 2>&1
                      yarn prepack
                      npm install -g @salesforce/cli
                '''
            }
        }
        // checkout git repo ProvarTesting/ProvarRegression
        stage('Checkout Regression Repo') {
            steps {
                script {
                    checkout changelog: false, poll: false, scm: [$class: 'GitSCM', branches: [[name: 'AnchalGoel']], doGenerateSubmoduleConfigurations: false, extensions: [[$class: 'RelativeTargetDirectory', relativeTargetDir: 'ProvarRegression']], submoduleCfg: [], userRemoteConfigs: [[credentialsId: 'ProvarGitCredentials', url: 'https://github.com/ProvarTesting/ProvarRegression']]]
                }
            }
        }
        stage('Install latest Chrome in ubuntu') {
            steps {
                sh '''
                    wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
                    sudo dpkg -i google-chrome-stable_current_amd64.deb
                    sudo apt-get install -f
                '''
            }
        }
        stage('Execute NUTS') {
            tools {
                jdk 'JDK11_linux'
            }
            steps {
                script {
                    sh '''
                        export DISPLAY=:1
                        Xvfb :1 -screen 0 1024x768x16 &
                        export NVM_DIR="$HOME/.nvm"
                        [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
                        nvm use 18.19.0
                        chmod 777 ./bin/run.js
                        sf plugins link .
                        yarn run test:nuts
                    '''
                }
            }
        }
    }
}
