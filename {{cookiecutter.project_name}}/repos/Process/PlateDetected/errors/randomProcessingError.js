
function RandomProcessingError(message) 
{
    this.name = 'RandomProcessingError';
    this.message = message;
}
    
RandomProcessingError.prototype = new Error();
    
module.exports = RandomProcessingError;
