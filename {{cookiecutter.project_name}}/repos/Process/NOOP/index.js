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

/////////////////////////////////////////////////
//
// main()
//
/////////////////////////////////////////////////

exports.handler = (event, context, callback) =>
{
    console.log(JSON.stringify(event));
    console.log("Hello {{cookiecutter.your_name}}, the placeholder Lambda function was called successfully!");

    callback(null, "Hello {{cookiecutter.your_name}}, the placeholder Lambda function was called successfully!");
}

