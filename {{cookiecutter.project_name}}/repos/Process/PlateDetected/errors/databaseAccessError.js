
function DatabaseAccessError(message) 
{
    this.name = 'DatabaseAccessError';
    this.message = message;
}
    
DatabaseAccessError.prototype = new Error();
    
module.exports = DatabaseAccessError;
