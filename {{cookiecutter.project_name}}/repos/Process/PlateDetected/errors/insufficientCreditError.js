
function InsufficientCreditError(message) 
{
    this.name = 'InsufficientCreditError';
    this.message = message;
}
    
InsufficientCreditError.prototype = new Error();
    
module.exports = InsufficientCreditError;
