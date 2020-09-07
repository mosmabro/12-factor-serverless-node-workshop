
function GenericError(message) 
{
    this.name = 'GenericError';
    this.message = message;
}
    
GenericError.prototype = new Error();
    
module.exports = GenericError;
