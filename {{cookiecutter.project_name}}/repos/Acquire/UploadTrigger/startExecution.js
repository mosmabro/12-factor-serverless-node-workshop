//
// Simply fire off the state machine 
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

