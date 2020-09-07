/*
 * Copyright 2010-2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 * http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 *
 *
 * Author: Adam Larter, Developer Solutions Architect, AWS
 * Created: September 2018
 *
 */

///////////////////////////////////////////////////////////////
//
// Configuration
//
///////////////////////////////////////////////////////////////
var AWSXRay 			= require('aws-xray-sdk');
var AWS 				= AWSXRay.captureAWS(require('aws-sdk'));

/////////////////////////////////////////////////
//
// main()
//
/////////////////////////////////////////////////

exports.handler = (event, context, callback) =>
{
    console.log(JSON.stringify(event));
    console.log("Hello {{cookiecutter.your_name}}, the placeholder Lambda function was called successfully and triggered your Step Function!");

    try
    {
		var numberPlateTriggerResult = 
		{
			bucket: event.Records[0].s3.bucket.name,
			key: event.Records[0].s3.object.key,
			contentType: "",
			contentLength: 0,
			numberPlate : {
		        detected : false,
		        numberPlateString: "",
		        confidence : 0,
	        	numberPlateRegEx : process.env.REGEX_NUMBER_PLATE
			},
			charge : 5
		};

        //
        // Kick off the step function 
        //
        AWSXRay.captureAsyncFunc('TollGantry::Initiate State Machine', function(subsegmentStateMachine) {

            var executionParams = 
            {
                stateMachineArn: process.env.NumberPlateProcessStateMachine,
                input: JSON.stringify(numberPlateTriggerResult)
            };

            subsegmentStateMachine.addMetadata("StateMachineParams", executionParams);
            
            console.log(executionParams);
            
            //
            // Simply fire off the state machine
            //
            new AWS.StepFunctions().startExecution(executionParams, (err, data) =>{
            
                if ( err )
                    {
                        console.log("ERROR: " + err);
                        callback(err);
                    }
                else
                    {
                        console.log("OK: " + JSON.stringify(data));
                        console.log("NOTE: If you are seeing this message after Task 2, then you have forgotten to update the repos/Acquire/template.yml file to use UploadTrigger instead of NOOP!");
                        
                        callback(null, "Hello {{cookiecutter.your_name}}, the placeholder Lambda function was called successfully and triggered your Step Function!");
                    }
                
                subsegmentStateMachine.close();                
            });	
        });	
    }
	catch(ex)
	{
		callback("EXCEPTION", ex.message);
	}        	        
}

