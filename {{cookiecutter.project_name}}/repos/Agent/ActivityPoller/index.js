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
var AWS 			= require('aws-sdk');
var docClient		= new AWS.DynamoDB.DocumentClient();
var async           = require('async');
var stepfunctions 	= new AWS.StepFunctions();
var ses 			= new AWS.SES();
var s3   			= new AWS.S3();

/////////////////////////////////////////////////
//
// main()
//
/////////////////////////////////////////////////

exports.handler = (event, context, callback) =>
{
	try
	{
		context.callbackWaitsForEmptyEventLoop = false;

        async.parallel(
          [
            (next)=>
            {
                ProcessWaitingActivityWithHandler(
                	event,
                    "StepFunctionActivityManualPlateInspection", 
                    process.env.StepFunctionActivityManualPlateInspection, 
                    UnknownNumberPlateHandler, 
                    next
                    );
            },
            (next)=>
            {
                ProcessWaitingActivityWithHandler(
                	event,
                    "StepFunctionActivityInsufficientCredit", 
                    process.env.StepFunctionActivityInsufficientCredit, 
                    InsufficientCreditHandler, 
                    next
                    );
            }

          ],
          callback
        );

		console.log("EVENT: " + JSON.stringify(event));
	}
	catch(ex)
	{
		callback("EXCEPTION", ex.message);
	}
}


function ProcessWaitingActivityWithHandler(event, displayName, activityARN, handler, next)
{
    try
    {
        console.log("Checking for waiting activities for '" + displayName + "' on ARN " + activityARN);
        
        var taskParams = 
		{
			activityArn: activityARN
		};
		
		stepfunctions.getActivityTask(taskParams, function(err, data) 
		{
			if (err) 
			{
				console.log(displayName + "::" + err, err.stack);
				next(displayName + '::An error occured while calling getActivityTask()');
			} 
			else 
			{				
				console.log(displayName + "::getActivityTask() succeeded");

				if (data === null || data.input === null ) 
				{
					// No activities scheduled
					next(null, displayName + '::No activities to be processed.');
				} 
				else 
				{					
					console.log(displayName + "::" + JSON.stringify(data));
					
					if ( data.input )
					{
                        handler(data, next);
					}
					else
					{
						next(null, displayName + "::No data.input found - skipping");
					}
				}
			}
		});
		
    }
	catch(ex)
	{
	    next(displayName + "::EXCEPTION -> " + ex.message);
	}		
}

function abortProcessing(callback)
{
	console.log("Bailing out - waited long enough!");
	callback();
}

function InsufficientCreditHandler(activityData, callback)
{
	var input = JSON.parse(activityData.input);
	var imageLink = s3.getSignedUrl('getObject', {Bucket: input.bucket, Key: input.key, Expires: 3600});
	
	//
	// For initial testing only
	//
	if ( !input.numberPlate.detected)
	{
		console.log("TESTING::input.numberPlate.detected is false which means this must be a test");
		console.log("Forcing number plate to test value");
		input.numberPlate.detected = true;
		input.numberPlate.numberPlateString = "TESTPLATE";
	}

	//
    // Build the request
    //
    var readRequest =
    {
        "TableName" : process.env.DDBTableName,

        "Key" :
        {
            "numberPlate"      : input.numberPlate.numberPlateString
        }
    }

    //
    // Query DynamoDB
    //
    docClient.get(readRequest, function(err, data) 
    {
        if (err) 
        {
            console.log(`An error occurred while accessing the database for number plate ${input.numberPlate.numberPlateString}` );
            callback(new Error(`An error occurred while accessing the database for number plate ${input.numberPlate.numberPlateString} - ${err.message}` ));
        } 
        else 
        {
            //
            // If the return object has a .Item then the item was found
            //
            if ( data.Item )
            {
                //
                // Build the request to UPDATE the record associated with the number plate. This will
                // decrement the credit of the record by the charge amount, ONLY IF there is sufficient
                // credit in the record
                //
                console.log(`Number plate ${input.numberPlate.numberPlateString} found. Driver is ${data.Item.ownerFirstName} ${data.Item.ownerLastName} with credit $${data.Item.credit}` );
			                
				var emailParams = 
				{
					Destination: 
					{
						ToAddresses: 
						[
							data.Item.ownerEmail
						]
					},
					Message: 
					{
						Subject: 
						{
							Data: '[ACTION] - Your account credit is exhausted',
							Charset: 'UTF-8'
						},
						Body: 
						{
							Html: 
							{
								Data: 
									`Hello ${data.Item.ownerFirstName} ${data.Item.ownerLastName},<br /><br />Your vehicle with number plate <b>${data.Item.numberPlate}</b> was recently detected on a toll road, but your account has insufficient credit to pay the toll.<br/><br/>` +
									'<img src="'+imageLink+'"/><br/><a href="'+imageLink+'">Click here to see the original image</a><br/><br/>' +
									'Please update your account balance immediately to avoid a fine.' +
									'<a href=' + process.env.APIGWEndpoint + 'topup/' + data.Item.numberPlate + '?taskToken=' + encodeURIComponent(activityData.taskToken) + '><b>Click this link to top up your account now.</b></a><br/>' +
									'<br><br> Thanks<br><b>Toll Road Administrator</b><br><br/>'
							}
						}
					},
					Source: process.env.TargetEmailAddress,
					ReplyToAddresses: [
							process.env.TargetEmailAddress
						]
				};
	
				console.log(`About to send email to ${data.Item.ownerEmail}...`);
		
				ses.sendEmail(emailParams, function (err, data) {
					if (err) 
					{
						console.log(err, err.stack);
						callback('Internal Error: The email could not be sent.');
					} else {
						console.log(data);
						callback(null, 'The email was successfully sent.');
					}
				});
            }
        }
    });
}

function UnknownNumberPlateHandler(activityData, callback)
{
	var input = JSON.parse(activityData.input);
	
	var imageLink = s3.getSignedUrl('getObject', {Bucket: input.bucket, Key: input.key, Expires: 3600});
	var emailParams = 
	{
		Destination: 
		{
			ToAddresses: 
			[
				process.env.TargetEmailAddress
			]
		},
		Message: 
		{
			Subject: 
			{
				Data: '[ACTION] - Manual Decision Required!',
				Charset: 'UTF-8'
			},
			Body: 
			{
				Html: 
				{
					Data: 
						`Hello ${process.env.TargetEmailAddress},<br /><br />An image was captured at a toll booth, but the Number Plate Processor could not be confident that it could determine the actual number plate on the vehicle. We need your help to take a look at the image, and make a determination.<br/><br/>` +
						'<img src="'+imageLink+'"/><br/><a href="'+imageLink+'">Click here to see the original image if it is not appearing in the email correclty.</a><br/><br/>' +
						'<a href=' + process.env.APIGWEndpoint + 'parse/' + input.bucket + '/' + input.key + '/' + 5 + '?imageLink=' + encodeURIComponent(imageLink) + '&taskToken=' + encodeURIComponent(activityData.taskToken) + '><b>Click this link to help assess the image and provide the number plate.</b></a><br/>' +
						'<br><br> Thanks<br><b>Toll Road Administrator</b><br><br/>'
				}
			}
		},
		Source: process.env.TargetEmailAddress,
		ReplyToAddresses: [
				process.env.TargetEmailAddress
			]
	};
	
	console.log(`About to send email to administrator at ${process.env.TargetEmailAddress}...`);
		
	ses.sendEmail(emailParams, function (err, data) {
		if (err) 
		{
			console.log(err, err.stack);
			callback('Internal Error: The email could not be sent.');
		} else {
			console.log(data);
			callback(null, 'The email was successfully sent.');
		}
	});
}
