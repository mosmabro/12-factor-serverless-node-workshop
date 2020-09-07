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
var AWS                     = require('aws-sdk');
var docClient               = new AWS.DynamoDB.DocumentClient();
var errorUnknownNumberPlate = require('./errors/unknownNumberPlateError');
var errorGeneric            = require('./errors/genericError');
var errorDBAccess           = require('./errors/databaseAccessError');
var errorInsufficientCredit = require('./errors/insufficientCreditError');
var errorRandomProcessing   = require('./errors/randomProcessingError');

/////////////////////////////////////////////////
//
// main()
//
/////////////////////////////////////////////////

exports.handler = (event, context, callback) =>
{
    try
    {
        //
        // Randomly fail to process, as part of the 'retry' behaviour demonstration
        //
        if ( Math.random() < process.env.RandomProcessingErrorProbability)
        {
            callback ( new errorRandomProcessing("Congratulations! A random processing error occurred!") );
        }
        else
        {
            //
            // Process the number plate
            //
            ProcessNumberPlate(event, callback);
        }
    }
    catch (ex)
    {
        console.log("EXCEPTION::Main()");
        console.log(ex.message);

        /////////////////////////////////////////////////////////////
        //
        // Return 'errorGeneric' error with the ex.message
        //
        /////////////////////////////////////////////////////////////                            
        callback(new errorGeneric(ex.message));
    }        
};

///////////////////////////////////////////////////////////////
//
// ProcessNumberPlate()
//
///////////////////////////////////////////////////////////////

function ProcessNumberPlate(payload, callback)
{
  try
  {
    //
    // Build the request
    //
    
    var readRequest =
    {
        "TableName" : process.env.DDBTableName,

        "Key" :
        {
            "numberPlate"      : payload.numberPlate.numberPlateString
        }
    }

    //
    // Query DynamoDB
    //
    docClient.get(readRequest, function(err, data) 
    {
        if (err) 
        {
            var responseMessage = `An error occurred while accessing the database for number plate ${payload.numberPlate.numberPlateString}`;
            console.log( responseMessage );

            /////////////////////////////////////////////////////////////
            //
            // TODO: Return 'errorDBAccess' error
            //
            /////////////////////////////////////////////////////////////                            
            
        } 
        else 
        {
            //
            // If the return object has a .Item then the item was found
            //
            if ( data && data.Item )
            {
                //
                // Build the request to UPDATE the record associated with the number plate. This will
                // decrement the credit of the record by the charge amount, ONLY IF there is sufficient
                // credit in the record
                //
                console.log(`Number plate ${payload.numberPlate.numberPlateString} found. Driver is ${data.Item.ownerFirstName} ${data.Item.ownerLastName} with credit $${data.Item.credit}` );
                
                if ( data.Item.credit > payload.charge )
                {
                    //
                    // Sufficient credit. Update conditionally (atomic update to ensure no concurrency issues)
                    //
                    var updateRequest =
                    {
                        TableName : process.env.DDBTableName,
                
                        Key :
                        {
                            "numberPlate"      : payload.numberPlate.numberPlateString
                        },
                        
                        UpdateExpression: "set credit = credit - :charge",
                        
                        ConditionExpression: "credit >= :charge",
                        
                        ExpressionAttributeValues:
                        {
                            ":charge": parseInt(payload.charge)
                        },
                        
                        ReturnValues:"ALL_NEW"
                    };
                
                    //
                    // Query DynamoDB
                    //
                    docClient.update(updateRequest, function(err, data) 
                    {
                        if (err) 
                        {
                            var responseMessage = `An error occurred while updating account for number plate ${payload.numberPlate.numberPlateString} => ${err}`;
                            console.log( responseMessage );

                            /////////////////////////////////////////////////////////////
                            //
                            // TODO: Return 'errorDBAccess' error
                            //
                            /////////////////////////////////////////////////////////////                            
                        } 
                        else 
                        {
                            //
                            // Success!
                            //
                            var responseMessage = `Charge of $${payload.charge} deducted from credit for ${payload.numberPlate.numberPlateString}. Final credit balance is $${data.Attributes.credit}`;
                            console.log(responseMessage );
                            callback(null, responseMessage);
                        }
                    });
                }
                else
                {
                    // Insufficient credit
                    var responseMessage = `Driver for number plate ${payload.numberPlate.numberPlateString} (${data.Item.ownerFirstName} ${data.Item.ownerLastName}) has insufficient credit ($${data.Item.credit}) for a charge of $${payload.charge}`;
                    console.log(responseMessage);

                    /////////////////////////////////////////////////////////////
                    //
                    // TODO: Return 'errorInsufficientCredit' error
                    //
                    /////////////////////////////////////////////////////////////                            
                }
            }
            else
            {
                var responseMessage = `Number plate ${payload.numberPlate.numberPlateString} was not found. This will require manual resolution.`;
                console.log(responseMessage);

                /////////////////////////////////////////////////////////////
                //
                // TODO: Return 'errorUnknownNumberPlate' error
                //
                /////////////////////////////////////////////////////////////                            
                
            }
        }
    });

  }
  catch (ex)
  {
        console.log("EXCEPTION::ProcessNumberPlate()");
        console.log(ex.message);

        /////////////////////////////////////////////////////////////
        //
        // Return 'errorGeneric' error with the ex.message
        //
        /////////////////////////////////////////////////////////////                            
        callback(new errorGeneric(ex.message));
  }
}
