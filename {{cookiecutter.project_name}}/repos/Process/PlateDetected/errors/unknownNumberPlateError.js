
function UnknownNumberPlateError(message) 
{
    this.name = 'UnknownNumberPlateError';
    this.message = message;
}
    
UnknownNumberPlateError.prototype = new Error();
    
module.exports = UnknownNumberPlateError;
