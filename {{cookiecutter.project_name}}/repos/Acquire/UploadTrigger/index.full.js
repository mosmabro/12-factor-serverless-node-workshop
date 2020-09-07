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
 
var AWSXRay 			= require('aws-xray-sdk');
var AWS 				= AWSXRay.captureAWS(require('aws-sdk'));
var rekognition 		= new AWS.Rekognition();
var regExNumberPlate	= null;

// To allow local execution in the absense of XRay daemon
AWSXRay.setContextMissingStrategy(AWSXRay.LOG_ERROR);

/////////////////////////////////////////////////
//
// main()
//
/////////////////////////////////////////////////

exports.handler = (event, context, callback) =>
{
	if ( !regExNumberPlate )
	{
		getNumberPlateFromSecretsManager((numberPlate)=>{

			regExNumberPlate = numberPlate;

			processNumberPlate(event, context, callback);
		});
	}
	else
	{
		processNumberPlate(event, context, callback);
	}
}

function getNumberPlateFromSecretsManager(callback)
{
	var regExResult 	= "COULD_NOT_RETRIEVE_REGEX_FROM_SECRETS_MANAGER";
	var client			= new AWS.SecretsManager();
	
	console.log("Calling AWS SecretsManager for SecretId '/Staging/{{cookiecutter.project_name}}/Metadata'");
	client.getSecretValue({SecretId: "/Staging/{{cookiecutter.project_name}}/Metadata"}, function(err, data) {
    
    	console.log("     done!");
    	
	    if(err) 
	    {
	        if(err.code === 'ResourceNotFoundException')
	            console.log("The requested secret was not found");
	        else if(err.code === 'InvalidRequestException')
	            console.log("The request was invalid due to: " + err.message);
	        else if(err.code === 'InvalidParameterException')
	            console.log("The request had invalid params: " + err.message);
	        else
	        	console.log("Something went wrong => " + err.message);
	    }
	    else 
	    {
	        if(data.SecretString !== "") 
	        {
	        	console.log("Got Metadata from AWS Secrets Manager - " + data.SecretString);
	        	
	            var propertyBag = JSON.parse(data.SecretString);
	            regExResult = propertyBag.NumberPlateRegEx;
	            
	            console.log(`Returning regExResult == '${regExResult}'`);
	        }
	        else
	        {
	        	console.log("Got Metadata from AWS Secrets Manager but no SecretString => " + data);
	        }
	    }
	    
	    callback(regExResult);
	});
}

function processNumberPlate(event, context, callback)
{
	try
	{
		console.log("EVENT: " + JSON.stringify(event));

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
	        	numberPlateRegEx : regExNumberPlate
			},
			charge : process.env.TollgateCharge
		};
			
		//
		// First, get details about the object
		//
		var headParams = 
		{
			Bucket: numberPlateTriggerResult.bucket, 
			Key:	numberPlateTriggerResult.key
		};
		 
		console.log("Requesting HEAD from S3 Now");

		new AWS.S3().headObject(headParams, (err, data) => 
		{
			if ( err )
			{
				console.log("ERROR: " + err);
				callback(err);
			}
			else
			{
				//
				// ** APM using AWS X-ray **
				//
				// Create a new subsegment in AWS X-ray to 
				// time how long the entire text detection and
				// submission to AWS Step Functions takes
				//
				AWSXRay.captureAsyncFunc('TollGantry::Detect Number Plate in Captured Image', function(subsegmentDetectText) {

					numberPlateTriggerResult.contentLength = data.ContentLength;
					numberPlateTriggerResult.contentType   = data.ContentType;
					
					//
					// Construct parameters for Amazon Rekognition and use
					// them to extract text from the image
					//
					var params = 
					{
						Image: 
						{
							S3Object: 
							{
								Bucket: numberPlateTriggerResult.bucket, 
								Name: 	numberPlateTriggerResult.key
							}
						}
					};
						
					console.log("Calling Amazon::Rekognition.detectText()");

					subsegmentDetectText.addMetadata("bucket", numberPlateTriggerResult.bucket, "Number Plate Processor Config");
					subsegmentDetectText.addMetadata("key", numberPlateTriggerResult.key, "Number Plate Processor Config");
					subsegmentDetectText.addMetadata("regex", regExNumberPlate, "Number Plate Processor Config");

					rekognition.detectText(params, function(err, data) 
					{
						if (err) 
						{
							console.log(err, err.stack); // an error occurred
							subsegmentDetectText.close();
						}
						else 
						{
							console.log("     done");
							subsegmentDetectText.addMetadata("TextDetected", data.TextDetections, "Number Plate Processor Result");

							//
							// Process detected text, check for numberplates
							//
							for ( var item in data.TextDetections )
							{
								var textItem = data.TextDetections[item];

								if (textItem.Type == "LINE" && textItem.Confidence > ~~(process.env.RekognitionTextMinConfidence))
								{
									var regEx = new RegExp(regExNumberPlate, 'gi');
									if (textItem.DetectedText.match(regEx))
									{
										numberPlateTriggerResult.numberPlate.numberPlateString = textItem.DetectedText.replace(
											regEx, 
											"$1$2"
										);
										
										numberPlateTriggerResult.numberPlate.detected = true;
										numberPlateTriggerResult.numberPlate.confidence = textItem.Confidence;
		
										console.log(`\tNUMBER PLATE CANDIDATE: "${textItem.DetectedText}" as "${numberPlateTriggerResult.numberPlate.numberPlateString}" with confidence ${textItem.Confidence}`);
										
										subsegmentDetectText.addAnnotation("NUMBER PLATE CANDIDATE", textItem.DetectedText);
																				
										//
										// Bail out, we only want one number plate in the image
										//
										break;
									}
								}
							}
							
							subsegmentDetectText.close();

							//
							// At this point, we either know it is a valid number plate
							// or it couldn't be determined with adequate confidence
							// so we need manual intervention 
							//

							//
							// Kick off the step function 
							//
							console.log(numberPlateTriggerResult);
							
							var executionParams = 
							{
								stateMachineArn: process.env.NumberPlateProcessStateMachine,
								input: JSON.stringify(numberPlateTriggerResult)
							};

							console.log(executionParams);
							
							//
							// Call the Step Function using the AWS SDK
							//
							new AWS.StepFunctions().startExecution(executionParams, (err, data) =>{
							
								if ( err )
								{
									console.log("ERROR: " + err);
								}
								else
								{
									console.log("OK: " + JSON.stringify(data));
								}
								
								callback(err);
							});	
						}
					});
				});
			}
		});
		
	}
	catch(ex)
	{
		console.log(ex.message);
		callback("EXCEPTION", ex.message);
	}
}

