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

