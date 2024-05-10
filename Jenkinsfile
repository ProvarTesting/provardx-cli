pipeline{
    agent{
        label 'provardx'
    }
    
  parameters {
	string(name: 'BRANCH_NAME', defaultValue: params.BRANCH_NAME ?:'AutomationRevamp', description: '''Mention the branch name''')
	 }
    stages{
      stage('Git Checkout'){
		    steps {
		       script{
        checkout([$class: 'GitSCM', branches: [[name: BRANCH_NAME]], extensions: [], userRemoteConfigs: [[credentialsId: 'Provar_Github_PAT_Credentials', url: 'https://github.com/ProvarTesting/Provardx-cli.git']]])
	       sh '''
		   mkdir -p ~/Provar/.licenses
		   cp -rf License1.properties ~/Provar/.licenses/
	       '''
	       }
		  }    
	}

       /*stage('Tests Execution'){
	       when {
		        expression { params.JAVA_VERSION == '11' }
			}
		tools {
                 jdk 'JDK11_linux'
              }
            steps{
		    catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                script{
	            env.envr = envr
	            env.browser = browser
		    env.BuildFileName = BuildFilePath.substring(BuildFilePath.lastIndexOf('/')+1,BuildFilePath.length())
	            env.BuildFolder = BuildFilePath.substring(0,BuildFilePath.lastIndexOf('/'))
                sh '''
		    export ANT_HOME=${WORKSPACE}/apache-ant-1.10.14
                    export PATH=${PATH}:${ANT_HOME}/bin
		    java -version
		    cd ${ProjectHome}/${BuildFolder}
                    xvfb-run ant -Dtestproject.results="Results/${version}/${BUILD_NUMBER}" -Dprovar.home=${WORKSPACE}/Provar -Dbrowser=${browser} -Denvr=${envr} -Dtestproject.home=${WORKSPACE}/${ProjectHome} -f ${BuildFileName} ${target}
              
                '''
		}
             }
            }
        }*/
    }
   /* post {
		 success {
          script {
             String message = """
                     *Jenkins Build SUCCESSFUL:*
                      Job name: `${env.JOB_NAME}`
                      Build number: `#${env.BUILD_NUMBER}`
                      Build status: `${currentBuild.result}`
					  version: `${env.version}`
					  browser version: `${env.browserversion}`
					  ChromeDriver version: `${env.chromedriverversion}`
                      """.stripIndent()
                        slackSend (channel: '#regression-automation', color: '#00FF00', message: message )        
        }   
    }
	    unstable {
            script {
            String message = """
                     *Jenkins Build UNSTABLE:*
                      Job name: `${env.JOB_NAME}`
                      Build number: `#${env.BUILD_NUMBER}`
                      Build status: `${currentBuild.result}`
					  Version: `${env.version}`
					  Browser version: `${env.browserversion}`
					  ChromeDriver version: `${env.chromedriverversion}`
                      """.stripIndent()
                        slackSend (channel: '#regression-automation', color: '#FFFE89', message: message )
        }
        }

    failure {
        script {
            String message = """
                     *Jenkins Build FAILED:*
                      Job name: `${env.JOB_NAME}`
                      Build number: `#${env.BUILD_NUMBER}`
                      Build status: `${currentBuild.result}`
					  Version: `${env.version}`
					  Browser version: `${env.browserversion}`
					  ChromeDriver version: `${env.chromedriverversion}`
                      """.stripIndent()
                        slackSend (channel: '#regression-automation', color: '#FF0000', message: message )
        }
    }
	always {
	    script {
	            junit allowEmptyResults: true, testResults: "${ProjectHome}/${BuildFolder}/Results/${version}/${BUILD_NUMBER}/JUnit.xml"
	           slackUploadFile channel: '#regression-automation', credentialId: 'provartoken', filePath: "${ProjectHome}/${BuildFolder}/Results/${version}/${BUILD_NUMBER}/JUnit.xml", initialComment: "${env.JOB_NAME}_${BUILD_NUMBER}"
	           slackUploadFile channel: '#regression-automation', credentialId: 'provartoken', filePath: "${ProjectHome}/${BuildFolder}/Results/${version}/${BUILD_NUMBER}/Test_Run_Report.pdf", initialComment: "${env.JOB_NAME}_${BUILD_NUMBER}_PDF"
		
		}
		   
        }
    }*/
}
